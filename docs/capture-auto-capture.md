# 自动 turn 捕获（capture）

## 它解决什么问题

AMH 原来只有一条写入路径：`amh record`。这条路径要求 agent **自觉**执行——写在
AGENTS.md / shared skill layer 里的约定，人一懒、或者换个没配过的工具，记忆就断了。

`capture` 把方向反过来：不去要求 agent 记得写，而是直接读各工具已经落在本地的
transcript，把「完整对话轮次」抽出来，写进 inbox，再走既有的 `sync` 管道入账本。

对比同类产品（Memmy）后确认的差距就在这里：对方靠 Hook 在每次 `turn.start` /
`turn.complete` 强制捕获，AMH 没有。capture 补的就是这一环。

## 设计要点

### 捕获单位是 turn，不是消息

一个 turn = 一条用户请求 + 该轮最后一条助手回复。中间的 tool call / tool result
一律丢弃——否则记忆库会被工具输出噪声灌满。

只保留**完整** turn（有用户请求且有助手回复）。助手还没回完就中断的轮次跳过，
等下次扫描补全。

### turnId 必须是确定性的

`capture:<tool>:<文件路径哈希>:<文件内序号>`

三个选择都是刻意的：

- **不用内容哈希**：transcript 会被追加，同一 turn 的文本会变，算不出稳定 id。
- **不用 sessionId**：gemini 的 transcript 全叫 `transcript.jsonl` 且不带
  sessionId，退回 basename 会让不同目录下同名文件的序号互相撞车，去重直接失效。
- **用序号**：追加新 turn 不会改变已有 turn 的序号，所以 id 稳定。

id 稳定 → `sync` 的 `knownIds` 去重生效 → 重复扫描不会重复入库。

### 水印记「消费到第几条」，不是「已扫过」

周期扫描常带较小的 `--limit`。一个几十轮的大 transcript 要好几轮才吃得完，此时若
水印只记「文件已扫过」，下一轮会因为文件指纹未变而整个跳过，进度永远停在第一次
截断的地方。

所以状态里存的是 `{ size, mtimeMs, turns, consumed }`：

- 指纹未变且 `consumed >= turns` → 整个文件跳过，连解析都不做
- 指纹未变但还没吃完 → 从 `consumed` 处续扫
- 体积变小 → 判定为被重写/压缩过，序号不再可信，从 0 开始

### 噪声过滤

捕获进来的东西必须是**人**提的需求。实际跑下来发现几类噪声，按优先级从高到低拦：

1. **非人类发起的会话**：codex 的 `session_meta.originator` / `thread_source` 里带
   `daemon|guardian|subagent|triage|cron|scheduler|harness|background` 的整段跳过。
   用拒绝式匹配而非白名单，新的交互客户端不会被误杀。
2. **工具注入的上下文块**：`system-reminder`、`identity_context`、`INSTRUCTIONS`、
   `environment_context`、`<recommended_plugins>` 等整块剥离。
3. **机器生成的伪用户请求**：`TRANSCRIPT DELTA START`、AMH 自己的派工样板
   （`__AI_MEMORY_THREAD__`）、多 agent harness 的定时唤醒与消息通知、角色设定式
   系统提示词（"You are X's ..."）。
4. **脱敏**：API key / token / 大段 base64 内联载荷替换成占位符。

规则刻意只匹配通用句式，不写具体产品名或频道名。

### 落库位置

kind 用 `turn`。`chooseMemoryLayer` 不认识这个 kind，会落 `archive`——这是想要的
行为：原始 turn 是原材料，不该稀释 `core` 里的人工策展记忆。

## 用法

```bash
amh capture sources                              # 各源能扫到多少个 transcript 文件
amh capture scan --dry-run --limit 10            # 只看会抓到什么，不写盘
amh capture scan --tool codex --limit 50 --sync  # 抓 50 条并直接入账本
amh capture status                               # 各源水印进度
amh capture reset --tool codex                   # 清空某源水印，下次全量重扫
amh capture recall "发布签名问题怎么修的" --limit 5
```

`recall` 是捕获的对侧——Memmy 在 `turn.start` 注入召回上下文，光有捕获没有召回记忆
还是死的。输出是一段带 `<!-- amh-recall -->` 标记的 markdown，单条截断到 320 字符，
可以直接塞进 prompt。

## 让它真正自动

`watch` 加了 `--capture`：

```bash
amh watch --capture --interval-ms 300000
```

每 5 分钟扫一次（默认 `--capture-limit 50`），抓到新 turn 才出声，否则静默。
daemon 是派工循环，不适合塞这个逻辑，所以挂在 watch 上。

## 已知取舍

- **只支持有本地 transcript 的工具**：claude / codex / workbuddy / gemini。没有本地
  落盘的 hosted 工具（网页版）抓不到。这类只能靠 hook 或 MCP，不在本版范围内。
- **大文件续扫靠 `--limit` 推进**，极端情况下（单文件 turn 数 > limit 很多）需要
  多轮才吃完，但不会丢也不会重复。
- **不识别跨文件的同一会话**。gemini 尤其明显（每个 brain 目录一个 transcript），
  同一项目会被拆成多条独立记录。
- `--sync` 会把 sync 的人类可读输出混进 capture 的 JSON 里，要接 JSON 就别带
  `--sync`，分开跑。

## 代码位置

| 文件 | 职责 |
| --- | --- |
| `src/lib/capture-sources.js` | 源定义、文件发现、各工具适配器、文本清洗与噪声过滤 |
| `src/lib/capture-state.js` | 水印状态读写（size / mtime / consumed） |
| `src/commands/capture.js` | 命令簇：scan / sources / status / reset / recall |
| `tests/capture-sources.test.mjs` | 单测 |
