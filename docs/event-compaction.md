# 事件日志折算（`amh compact`）

## 为什么需要它

任务 / 项目 / 工作流 / 提示词是**事件溯源**存储的：每次变更追加一条事件，而这条事件
携带的是**整条记录的全量快照**（见 `src/lib/entity-store.js` 的 `createEntityEvent`）。

后果是写入放大 —— 一个任务被改 48 次，`tasks/events.jsonl` 里就有 48 份完整记录，
其中包含 48 份不断变长的 `notes` 数组。增长是 **O(n²)**，而且每次 `amh backup`
都把这份日志原样复制一份。

折算（fold）前实测（2026-09-11，真实 hub）：

| 日志 | 事件数 | 唯一 id | 体积 | 其中重复快照 |
|---|---|---|---|---|
| `tasks/events.jsonl` | 424 | 65 | 2.08 MB | `notes` 占 1.37 MB（66%） |
| `workflows/events.jsonl` | 60 | 4 | 215.5 KB | — |
| `projects/events.jsonl` | 25 | 10 | 14.3 KB | — |

折算后：509 → 79 条事件，2.31 MB → 254.6 KB，回收 **2.06 MB**。

## 折算保留什么

投影文件（`tasks.jsonl` 等）是事件的**纯重放**结果 —— 每个 id 取最后一条状态事件，
删除事件则移除该 id。所以只留「决定当前状态的那一条」就够了：

- 该 id 最后一条状态事件（`upsert` / `create` / `update` / `snapshot`）→ **保留**
- 该 id 最后一条是删除事件 → **该 id 全部丢弃**（实体不存在，重放结果同样是「不存在」）
- 该 id 更早的事件 → **丢弃**
- 看不懂的行（JSON 解析失败、没有 id、其他实体类型）→ **原样保留**
- 三阶段标记（见下）→ `start` 保留；**没有对应 `start` 的 `summary`/`end` 视为噪声丢弃**

## 三条硬保证

1. **状态不变**：写盘前，命令会用折算后的事件重放一次投影，与折算前的重放结果
   做**逐字节**比对；不一致就拒绝写盘并报错。折算要么可证明保状态，要么不发生。
2. **顺序不变**：投影文件按重放顺序逐行写出，所以折算后的**记录顺序必须与原日志一致**，
   否则 `amh task list` 的输出次序会被打乱。
   ⚠️ **实现要点**：锚点要按「该 id **首次出现**的位次」输出，而不是按被保留那条事件的位次。
   两者在「先出现的 id 后结束」时不一致 —— 这正是开发时被测试当场抓到的那次回归
   （`planCompaction` 首个用例特意构造成首次顺序与末次顺序相反）。
3. **可追溯**：被丢弃的行不会销毁，会 gzip 归档到 `<实体>/archive/events-<ISO>.jsonl.gz`，
   默认保留最新 5 份（`ARCHIVE_KEEP`）。归档是静态文件，不会再滋生 O(n²) 增长。

## 三阶段标记（`src/compaction-lock.js`）

折算跨多次 JSONL 写入，本身不是原子的。所以整个重写被三个标记夹住：

```
compaction.start ──> （归档 → 重写事件日志 → 重放投影 → 镜像 SQLite）──> compaction.summary ──> compaction.end
```

崩溃在 `end` 之前 = 留下「孤立锁」，`scanCompactionLocks` 能查出来；只有见到 `end`
才算干净完成。整套流程包在 `withHubLock` 里。

⚠️ **实现要点（踩过的坑）**：`start` 标记被追加到**即将被重写的那个日志**里，而计划是在
它被追加**之前**算好的。所以重写时必须手动把 `start` 那一行重新拼进新内容 ——
否则折算会抹掉自己的起始标记，此时若崩在重写之后，日志里什么都不剩，中断将**无法察觉**。
`tests/entity-compaction.test.mjs` 里有一条断言专门锁死「三阶段标记成套落盘且无孤立锁」。

## 用法

```bash
amh compact                          # 预览：只报告，不落盘（默认安全）
amh compact --entity task            # 只看某一个实体（task|project|workflow|prompt|all）
amh compact --apply                  # 落盘；先自动做一份 pre-compact 备份
amh compact --apply --auto           # 只折算超过 1MiB 的日志（幂等，适合挂定时器）
amh compact --apply --auto --no-backup   # 定时器推荐写法：省掉每次约 3MB 的快照
amh gc                               # `compact` 的别名
```

- **幂等**：已经折算过的日志再跑是 no-op（报告 `nothing to fold`），所以挂定时器安全。
- `--auto` 的阈值可用 `--threshold-bytes <N>` 调整。
- `--no-archive` 可以不要归档（不建议）。
- 输出里看 `projectionPreserved`（必须 `true`）与 `projectionRewritten`
  （**应该**是 `false`；若是 `true`，说明磁盘上的投影本来就和事件流不一致，被顺手修好了，
  值得单独查一下原因）。

## 挂定时器

`--auto --no-backup` 就是为定时器设计的：折算可证明保状态、被丢的行已归档，
所以不需要每轮再留一份整库快照。例如每 6 小时一次：

```bash
amh compact --apply --auto --no-backup
```

⚠️ 本机现状（2026-09-11）：`amh capture schedule install` 生成的 launchd 任务
**无法从工具沙箱内激活** —— `launchctl bootstrap` / `load -w` 一律返回
`Bootstrap failed: 5: Input/output error`（`gui/$(id -u)` 与 `user/$(id -u)` 皆然，
绕开沙箱也一样，`plutil -lint` 证明 plist 合法）。plist 已就位，**下次登录会由
LaunchAgents 自动加载**；要立刻生效需用户自己在终端执行：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ai-memory-hub.capture.plist
```

## 验证与回滚

折算只动这四类文件：`<实体>/events.jsonl`、`<实体>/<投影>.jsonl`、`<实体>/archive/*.gz`。
安全快照只需覆盖它们：

```bash
mkdir -p /tmp/amh-precompact && for d in tasks projects workflows prompts; do
  mkdir -p /tmp/amh-precompact/$d && cp -p ~/.ai-memory/$d/*.jsonl /tmp/amh-precompact/$d/ 2>/dev/null
done
```

折算后核对投影校验和未变：

```bash
for f in tasks/tasks.jsonl projects/projects.jsonl workflows/workflows.jsonl; do
  shasum ~/.ai-memory/$f /tmp/amh-precompact/$f
done
```

真要回滚：把 `<实体>/archive/events-*.jsonl.gz` 解压拼回 `events.jsonl`（丢弃的只是早期快照，
顺序恢复成原始文件序），再跑 `amh sync` 重放投影。

## 测试

```bash
NODE_OPTIONS= node --test --test-timeout=60000 tests/entity-compaction.test.mjs
```

9 个用例覆盖：折叠规则、删除 retire、无法识别行的保留、标记噪声与未收尾 start、
幂等、预览只读、`--apply` 后**投影逐字节不变**且标记成套、`--auto` 阈值跳过。
