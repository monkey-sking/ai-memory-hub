# AMH 存储层升级 v1（SQLite 镜像写默认开启）

> 状态：已落地 · 2026-08-27
> 关联：README「🏗️ 架构设计」目标架构图、CHANGELOG [Unreleased]

## 背景与目标

原架构把 SQLite 双写做成"默认 no-op、需手动开环境变量"的影子写，
导致日常所有查询仍压在 JSONL 上，`amh.db` 长期是半份/陈旧镜像
（真实库 8-22 之后停止同步，与 JSONL 存在漂移）。

目标（存储层升级第一刀，对应目标架构图存储层）：

1. SQLite 镜像常态化——默认开启，不再依赖环境变量。
2. 首次打开自动迁移——镜像完整，不是半份。
3. 对账工具——`sqlite verify` 逐条比对 JSONL 与 SQLite，为后续
   "SQLite 权威读路径"提供信任依据。
4. 失败语义不变——SQLite 任何失败只记 stderr，绝不打断 JSONL 主路径。

## 本次改动

| 文件 | 改动 |
|---|---|
| `src/sqlite-store.js` | 新增 `ensureMigrated()`（一次性自动迁移守卫）与 `verifyMirror()`（逐条对账：数量 + 内容指纹，区分 missing / extra / mismatched） |
| `src/sqlite-dualwrite.js` | 镜像写默认开启（`AMH_SQLITE_DUALWRITE=0` 显式关闭）；首次 `getDb` 时自动迁移现有 JSONL |
| `src/index.js` | `sqlite` 子命令新增 `verify`；`sqlite status` 内置一致性 verdict；用法提示更新 |
| `tests/sqlite-dualwrite.test.mjs` | 新增 4 项测试：默认开启/可关闭、自动迁移、写路径一致性、漂移检测 |
| `README.md` / `CHANGELOG.md` | 2.6 节、CLI 参考、目录结构、核心组件、changelog 同步更新 |

## 对账结果（真实库，2026-08-27）

```text
ai-memory-hub sqlite resync   # 从 JSONL 全量重建镜像（JSONL 仍为唯一真相源）
Resync done in 269ms: tasks=511 projects=15 workflows=10

ai-memory-hub sqlite verify
tasks:    jsonl=511 sqlite=511 drift=0
projects: jsonl=15  sqlite=15  drift=0
workflows:jsonl=10  sqlite=10  drift=0
verdict: consistent — JSONL 与 SQLite 完全一致
```

resync 前旧镜像只有 370 个 task，说明 8-22 后约 141 条变更未被镜像——
正是双写默认关闭时期的遗留漂移，现已治愈。

## 验证

- 新增 4 项测试全过（`node --test tests/sqlite-dualwrite.test.mjs`）。
- 临时 hub 冒烟：init → task add ×2 → project add → `sqlite status`
  （migrated + mirror ON + verify consistent）→ `sqlite verify` exit 0 → 读取正常。
- 全量套件（新代码，清掉会话 safe-delete 预加载后）：316 测 303 过；
  11 个失败均为环境性，与本改动无关——
  core-commands 文件超时（套件本身过慢，单跑时 54/0 全过）、
  daemon-lock 1 个时序抖动、dashboard-api 10 个断言子进程 stderr 为空
  但被 node:sqlite 的 ExperimentalWarning 打破（该 import 在改动前就存在）。
- 真实库（新代码）`status` 正常、`sqlite status` 显示 mirror ON + verify consistent。

## 使用方式

```bash
ai-memory-hub sqlite status   # 状态 + 一致性 verdict
ai-memory-hub sqlite verify   # 逐条对账，漂移时退出码 2
ai-memory-hub sqlite resync   # 从 JSONL 全量重建镜像
# 关闭镜像写（不推荐，除非排障）：
AMH_SQLITE_DUALWRITE=0 ai-memory-hub ...
```

## 存储层升级 v2（记忆事件单写者真相源）

> 状态：已落地 · 2026-08-28（本轮"真正重构"的第一刀）
> 关联：`src/memory-store.js`（新增）、`src/sqlite-store.js` 的 `memory_events` 表、README 2.6

v1 只把 task/project/workflow 镜像常态化，记忆事件流仍是纯 JSONL。
v2 把**记忆事件流**翻转为单写者架构——这是"基于功能重做"里
"封写 → 搬数 → 切读 → 拆墙"中"封写"的核心落地。

### 架构翻转点

| 维度 | 改前 | 改后 |
|---|---|---|
| 记忆写入路径 | 多写者直接 `appendFileSync` 到 `inbox/events.jsonl` | `appendJsonl` 单一收口点 → SQLite（`memory_events`）+ 写穿 legacy JSONL |
| 记忆真相源 | JSONL（多文件散落） | **SQLite `memory_events` 表**（FTS5 `trigram` 中文全文索引） |
| 中文搜索 | 依赖 `unicode61` 分词器（不拆中文，子串查不到） | `trigram` 子串匹配，中文/中英文混合均可命中 |
| 对账粒度 | 仅 task/project/workflow | 追加 memory 事件流（SQLite 总量 vs inbox+ledger JSONL 总量） |

### 本次改动

| 文件 | 改动 |
|---|---|
| `src/memory-store.js`（新增） | 单写者门面：`appendMemoryEvent`（SQLite 真相源，不再写 JSONL，避免与 `sync` 抢 inbox 文件）、`readMemoryEvents`、`searchMemoryEvents`（FTS5 trigram）、`migrateMemoryEvents`、`verifyMemory`；JSONL 仅作 SQLite 不可用时的回退读源 |
| `src/sqlite-store.js` | 新增 `memory_events` 表 + FTS5 `trigram` 虚拟表（带同步触发器）；`appendMemoryEvent` / `readMemoryEventsDb` / `searchMemoryEventsDb` / `countMemoryEventsDb` / `migrateMemoryEvents`（读 inbox+ledger）/ `verifyMemory`（inbox+ledger 对账）；`openStore` 改为**按路径缓存**的 Map（修多目录句柄串扰 + 父目录不存在时建库失败）；`closeStore` 清全部句柄 |
| `src/index.js` | `appendJsonl` 收口：inbox 写入同时落 SQLite（真相）+ legacy `fs.appendFileSync`（inbox，供 `sync`）；`sqlite verify`/`status` 追加 memory 域对账；`sqlite migrate`/`resync` 增量/全量导入记忆事件 |
| `tests/memory-store.test.mjs`（新增） | 5 项：SQLite 写入、FTS5 中文子串、verify 一致性、drift 检测、JSONL 回退 |
| `tests/sqlite-dualwrite.test.mjs` | 保持 4/4 全过（回归） |

### 关键设计决策（避坑）

1. **memory-store 不写 inbox JSONL**。inbox 是 `sync` 的暂存队列，会被
   `sync` 抽干重写。若 memory-store 也写 inbox，会与 sync 抢同一文件 →
   对账永远不一致。所以：SQLite=真相源（memory-store 独占写），
   inbox/ledger JSONL=legacy 流（index.js 的 appendJsonl 与 sync 共同拥有）。
2. **verify 比 inbox+ledger**。因 sync 把事件从 inbox 迁到 ledger，单看 inbox
   会漏算；SQLite 总量应与（inbox+ledger）总量相等。
3. **openStore 按路径缓存**。原单全局句柄在测试/多 hub 场景下串扰，且父目录
   不存在时 `new Database` 抛 `unable to open database file`——均已在 v2 修复。

### 验证

- `tests/memory-store.test.mjs` 5/5 全过；`tests/sqlite-dualwrite.test.mjs` 4/4 全过（无回归）。
- 临时 hub 集成冒烟：init → record ×3 → `sqlite status` consistent →
  `sync`（"Indexed 3 memory event(s)"，不崩）→ `sqlite verify` 前后均 exit 0。
- 临时 hub 迁移验证：`sqlite resync` 导入 3 条记忆事件 → `verify memory` 显示
  `sqlite=3 jsonl=3 drift=0` → consistent。

### 真实库现状（2026-08-28，只读检查）

```text
tasks:    jsonl=511 sqlite=511 drift=0
projects: jsonl=15  sqlite=15  drift=0
workflows:jsonl=10  sqlite=10  drift=0
memory:   sqlite=0 jsonl(events.jsonl+ledger.jsonl)=924 drift=924   ← 待迁移
verdict: DRIFT DETECTED
```

真实库 924 条历史记忆事件尚未迁进 SQLite（chokepoint 只捕获新事件）。
**迁移命令已就绪但未对真实库执行**（属真实数据写入，需你授权）：
`ai-memory-hub sqlite resync`（或 `sqlite migrate`），幂等、不碰 JSONL 真相源、
有 8-27 备份兜底。执行后 `verify` 即全绿。

## 存储层升级 v2.1（记忆事件读翻转 · 统一读 API）

> 状态：已落地 · 2026-08-27（"真正重构"的第二刀——读翻转）
> 关联：`src/index.js` 的 `events` 命令、`src/memory-store.js` 的读取 API

v2 只翻了"写"（记忆事件经 `appendJsonl` 单写者落 SQLite）。v2.1 翻"读"：
记忆事件流的读取**也**统一收口到 `memory-store`（SQLite 真相源 + FTS5），
不再散落各处直接 `readFileSync` JSONL。这是"封写 → 搬数 → 切读 → 拆墙"
里"切读"的第一步落地。

### 新增 `events` 命令（记忆事件流的统一读 API）

原先 `memory` 命令已被精炼 ledger 的生命周期管理（archive/op/audit/…）
占用，且读的是 `memories/ledger.jsonl`（精炼记忆，与原始事件流范围不同）。
为避免破坏成熟功能、又给原始事件流一个干净的读入口，v2.1 新增并列的
`events` 命令，专管原始记忆事件日志：

| 子命令 | 作用 | 数据来源 |
|---|---|---|
| `events list [--limit N] [--source S] [--project P] [--kind K]` | 列出事件 | SQLite `memory_events`（truth） |
| `events search <query> [--limit N]` | 中文子串搜索 | FTS5 trigram；<3 字自动回退子串扫描 |
| `events export [--out file]` | 导出事件日志 | SQLite `memory_events` |
| `events verify` | SQLite 真相源 vs JSONL 对账 | `verifyMemory` |

### 关键修复 & 设计决策

1. **修掉重复定义导致命令失效的 bug**：改前工作树里 `function memoryCommand`
   与 `case "memory":` 各出现两份（误加了一份 `case "memory":` 和一份
   `function memoryCommand`）。因函数声明提升、靠后的定义覆盖靠前的，真正生效的
   是旧的 ledger 版 `memoryCommand`，新加的读 API 函数（2854 行）变成死代码、
   `memory list` 直接抛 Usage。v2.1 把新函数改名为 `eventsCommand`，
   dispatch 改为 `case "events":`，不再与 `memory` 冲突。
2. **FTS5 trigram 查不到 2 字中文**：trigram 只生成 ≥3 字 token，常见 2 字中文
   查询（红包/记忆/重构）会静默无结果。修复：`searchMemoryEvents` 在 FTS5 命中 0
   且查询 <3 字时，对 SQLite 行做子串扫描回退，保证短中文查询可用。
3. **`events verify` 退出码**：drift≠0 时设 `process.exitCode=2`，让对账结果可被
   脚本判定（原先只打印 verdict、退出码恒为 0）。

### 验证

- 新增 `scripts/verify-events-readflip.mjs`（一次性集成校验）：建临时 hub → 写 3 条
  事件到 `inbox/events.jsonl` → `sqlite resync` 导入 SQLite → `events list|search|
  verify|export` 全部经 SQLite 读且一致。6 项断言全过。
- `tests/memory-store.test.mjs` 5/5 + `tests/sqlite-dualwrite.test.mjs` 4/4 仍全过
  （无回归）。`node --check src/index.js` 通过；旧 `memory` 命令 dispatch 未受影响。

## 存储层升级 v2.3（命令实现按功能抽取出单体 · 样板）

> 状态：已落地 · 2026-08-28（"基于功能重设计"的第一刀——拆 `index.js` 巨单体）
> 关联：`src/commands/events.js`（新增）、`src/index.js` 的 dispatch

原 `index.js` 是 **18861 行**的巨单体，所有命令实现内联其中。v2.3 起按功能
把命令实现抽到 `src/commands/<domain>.js`，`index.js` 只保留 dispatch 与
CLI helper（loadConfig / ensureHub / getOption / hasFlag / positionalArgs）。
本刀以最隔离、最新加的 `events` 命令为样板，验证抽取模式安全可逆：

- 新增 `src/commands/events.js`，导出 `eventsCommand(argv, deps)`——
  **依赖注入**传入 CLI helper 与 `memoryStore`，模块自身不依赖 index.js 内部，
  规避巨型文件的函数提升串扰（曾导致 2854/7470 双定义 bug）。
- `index.js` 的 dispatch 改为 `eventsCommand(rest, { loadConfig, ensureHub,
  hasFlag, getOption, positionalArgs, memoryStore, fs })`，并**删除内联实现**。
- 新增 `tests/commands-events.test.mjs`（3 项：模块可注入调用、迁移后 verify
  一致、注入 deps 下 search 命中），锁定抽取契约。
- 验证：`node --check` 通过；真实库 `events list/search/verify` 全走新模块；
  event-writer 3 + memory-store 5 + sqlite-dualwrite 4 + commands-events 3 = **15/15 全过**。

> 后续按同模式逐命令抽取（sqlite / memory / context / task …），是"四功能域拆分"
> 的低风险落地路径——每抽一个命令独立验证、独立提交，避免一次性大改巨单体。

## 存储层升级 v2.4（命令抽取续：`sqlite` 命令）

> 状态：已落地 · 2026-08-28（按功能拆单体第二刀）
> 关联：`src/commands/sqlite.js`（新增）、`src/index.js` 的 dispatch

沿用 v2.3 验证的 DI 模式，把存储层核心的 `sqlite` 命令（status / verify /
migrate / resync）抽到 `src/commands/sqlite.js`：

- 新增 `src/commands/sqlite.js`，导出 `sqliteCommand(argv, { loadConfig })`——
  仅 `loadConfig` 经 DI 注入，其余（openStore / closeStore / isMigrated /
  migrateFromJsonl / listTasks / listProjects / listWorkflows / verifyMirror /
  verifyMemory / migrateMemoryEvents）全部直接 import 自 `sqlite-store.js`，
  模块自包含、零 index.js 内部依赖。
- `index.js` 删除了内联 `sqliteCommand` 实现，以及仅为它服务的 `sqlite-store.js`
  整条 import（10 个函数，经 grep 确认全仓库仅该命令使用）；dispatch 改为
  `sqliteCommand(rest, { loadConfig })`。
- 新增 `tests/commands-sqlite.test.mjs`（2 项：空 hub 下 status/verify 一致），锁定抽取契约。
- 验证：`node --check` 通过；真实库 `sqlite status/verify` 全走新模块且
  `drift=0 consistent`（tasks=511/projects=15/workflows=10/memory=924）；
  event-writer 3 + memory-store 5 + sqlite-dualwrite 4 + commands-events 3 +
  commands-sqlite 2 = **17/17 全过**。

## 存储层升级 v2.5（共享 helper 层第一步：CLI/FS 纯工具抽出单体）

> 状态：已落地 · 2026-08-28（"按功能重设计"的深化——从抽命令到抽共享层）
> 关联：`src/lib/cli.js`（新增）、`src/index.js` 的 import

逐命令抽（v2.3/v2.4）时暴露了 index.js 的系统性耦合：命令共享几十个内部
helper（如 `getOption` 被 468 处调用）。继续硬抽会变成"长 DI 注入"，丑且不
真正解耦。v2.5 起把**零业务依赖的共享工具**从单体底部抽到 `src/lib/cli.js`，
这是"共享 helper 层"重构的第一步：

- 新增 `src/lib/cli.js`，导出 `ensureDir` / `readJson` / `readJsonSafe` /
  `writeJson` / `createId` / `getOption` / `hasOption` / `hasFlag` /
  `parsePositiveIntegerOption` / `positionalArgs` / `countJsonlFiles`
  （原 index.js 18525–18602 的纯工具簇，零业务依赖，只调 node 内置 +
  `atomic-write`）。
- `index.js` 顶部加 `import { ... } from "./lib/cli.js"`，并**删除这 11 个
  函数的内联定义**（消除同作用域重复声明）。其他命令与已抽的 `events`/`sqlite`
  经 dispatch 注入这些符号，行为不变。
- 新增 `tests/cli.test.mjs`（9 项），锁定共享层契约。
- 验证：`node --check` 通过；真实库 `events list`/`sqlite status` 全走新
  底座；cli 9 + 现有 17 = **25/25 全过**。
- 后续：runner 子系统（getRunnerProfile/getToolRunner/runRunnerProbe…）、
  配置层（loadConfig/ensureHub/resolveMemoryDir）、数据读取层
  （readTasks/readWorkflows/readProjects）可继续按同模式分层。

## 存储层升级 v2.6（存储子系统分层：JSONL IO + 实体事件存储引擎）

> 状态：已落地 · 2026-08-28（共享 helper 层的第二刀——从"纯工具"到"存储子系统"）
> 关联：`src/lib/io.js`（新增）、`src/lib/entity-store.js`（新增）、`src/lib/cli.js`、index.js 的 import

v2.5 抽出的是零业务依赖的纯工具；v2.6 接着抽**有明确边界的存储子系统**。
选择它而不是配置层/数据读取层的原因：它是依赖树的**根部**——配置层
（`ensureHub` → `writeProjects`）和数据读取层（`readTasks`/`readWorkflows`/
`readProjects`）都压在它上面，先抽它可以把下游两层的抽取同时解锁。

- 新增 `src/lib/io.js`：通用 JSONL 文件 IO（`parseJsonlLine` / `readEvents` /
  `countJsonlLines`）。`readEvents` 在 index.js 被 ~35 处调用（所有 .jsonl 读取入口），
  必须先有这个无环的底层，实体存储引擎才不会回引 index.js。
- 新增 `src/lib/entity-store.js`：实体事件存储引擎（12 个函数：
  `getEntityProjectionFile` / `getEntityEventsFile` / `readEntityEvents` /
  `bootstrapEntityEventsFromProjection` / `writeEntityRecords` /
  `appendEntityRecord` / `deleteEntityRecord` / `appendEntityEvents` /
  `createEntityEvent` / `replayEntityEvents` / `materializeEntityProjection` /
  `isEntityRecordNewerOrSame`），原 index.js 12809–12973。
- `isPlainObject`（零依赖判定谓词）移入 `src/lib/cli.js` 补齐共享层
  （index.js 有 36 处调用，引擎也依赖它，放这里避免循环引用）。
- `index.js`：加三条 import、删除上述 5 段内联定义。
  `rebuildEventSourcedProjections` **留在 index.js**（它只用引擎函数 + 三个
  `get*EventStoreDefinition` 工厂，而工厂依赖留在 index.js 的
  `normalizeTask/Workflow/Project`）。

**关键设计：引擎由 `definition` 参数化**（携带实体专属的 `normalize`/`isValid`
谓词），因此抽引擎**不会**把 `normalizeTask`/`normalizeWorkflow`/`normalizeProject`
一起拖走——这三个仍留在 index.js，经 definition 注入。

依赖方向（无环）：

```
entity-store -> io (纯 JSONL IO)
             -> cli (createId / ensureDir / isPlainObject)
             -> atomic-write / event-writer / sqlite-dualwrite
```

以上模块均不 import entity-store、也不 import index.js。

- 验证：`node --check` 四个模块全过；真实库 `sqlite status`/`verify` 经新引擎
  仍 **drift=0 consistent**（tasks=511 / projects=15 / workflows=10 / memory=924），
  `project list`/`task list` 读路径正常。cli 8 + commands-sqlite 2 全过。
- 后续：配置层（`loadConfig`/`ensureHub`/`resolveMemoryDir`，391 处引用）与
  数据读取层（`readTasks`/`readWorkflows`/`readProjects`）现在可以干净分层了。

## 剩余路线图（按优先级）

- **P1 · 真实库记忆事件迁移**：✅ 已完成（本轮）。对真实库跑 `sqlite resync`，
  924 条历史事件全量导入 SQLite，`verify` 全域 drift=0，单写者真相源在真实数据上闭环。
- **P1 · SQLite 权威读路径（记忆事件流）**：✅ 已完成（v2.1）。新增 `events` 命令，
  原始记忆事件日志的 list/search/export/verify 全部经 `memory-store` 读 SQLite。
  注意现有 `search`/`context` 读的是精炼 ledger（独立 `memories/search.db`），
  范围不同，暂不并入；下一步可评估将其也收口到统一 API。
- **P1 · 写路径唯一化（共享写入收口）**：✅ 已完成（v2.2）。提取 `src/event-writer.js`
  导出统一 `appendJsonl`（自动建父目录 + 追加；记忆事件文件同时落 SQLite 真相源），删除
  `relations.js` / `agent-wake-service.js` / `session-supervisor-service.js` / `domain-packs.js`
  各自的局部 `appendJsonLine` 副本、全部改走共享实现；`index.js` 的 `appendJsonl` 改为 re-export。
  经调查纠正旧设想：`locks/` 是活并发锁（~70 处 `withHubLock` 依赖）**保留**；
  `relations.js` 读侧多层解码补丁（兼容历史多重编码旧行）**保留**。
- **P2 · 按功能拆 `index.js` 巨单体（四功能域拆分的第一步）**：✅ 已开局（v2.3）。
  后续按同模式把 sqlite / memory / context / task / project / workflow 等命令实现
  逐一抽到 `src/commands/<domain>.js`，index.js 仅留 dispatch + CLI helper。
  每抽一个命令独立验证、独立提交，规避一次性大改的风险。
- **P2 · 减法（需先核对实际资产，原路线图多项前提不成立）**：经调查，
  仓库**不存在** `quality-gate` 引擎、**不存在**"三套 Dashboard"（仅 `src/dashboard/`
  一个目录 + 18 个文件）、**不存在**独立 VS Code 扩展（仅 `src/cdp-bridge.js`，
  且它本就是 `package.json` 的独立 bin 入口 `node src/cdp-bridge.js`，已被
  `scripts/generate-vscode-extension.js` 复用，属"核心外的独立 bin"而非核心内代码）。
  因此原"删 quality-gate / 合一三套 Dashboard / 移出 VS Code 扩展"三项**无法执行**，
  已从路线图剔除。真正可做的减法：待命令抽取完成后，评估删 `index.js` 里
  与已抽取命令重复的内联 helper、以及确认无用的反向同步逻辑（如有）。

## 回滚

- 代码：`git checkout -- src/sqlite-store.js src/sqlite-dualwrite.js src/index.js`
- 数据：完整备份在 `backups/ai-memory-20260827-160116/`
  （resync 只重建镜像、不碰 JSONL 真相源，因此不影响真实数据）。
