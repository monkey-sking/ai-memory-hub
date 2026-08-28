# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **存储层升级 v2：记忆事件单写者真相源** - 新增 `src/memory-store.js`，所有记忆事件写入经 `appendJsonl` 单一收口点落 SQLite（`memory_events` 表 + FTS5 `trigram` 中文全文索引），SQLite 成为记忆事件流的权威真相源；legacy 的 `inbox/events.jsonl` + `memories/ledger.jsonl` JSONL 流保留为兼容读源、`sync` 照常工作。`sqlite verify`/`status` 追加 memory 域对账（SQLite 总量 vs inbox+ledger JSONL 总量），`sqlite migrate`/`resync` 支持记忆事件增量/全量导入。新增 `tests/memory-store.test.mjs`（5 项全过）。`sqlite-store.js` 的 `openStore` 改为按路径缓存（修多目录句柄串扰与父目录不存在建库失败），`closeStore` 清全部句柄。
- **存储层升级 v2.1：记忆事件 `events` 统一读 API（读翻转）** - 新增 `events` CLI 命令（`list`/`search`/`export`/`verify`），原始记忆事件日志的全部读取经 `memory-store` 走 SQLite 真相源 + FTS5，不再散落直接读 JSONL。与既有的 `memory` 命令（精炼 ledger 生命周期管理）并列、互不冲突。新增 `scripts/verify-events-readflip.mjs` 集成校验（6 项断言全过）。
- **存储层升级 v2.2：写入路径统一收口（写翻转）** - 新增 `src/event-writer.js` 导出统一 `appendJsonl`（自动建父目录 + 追加；记忆事件文件同时落 SQLite 真相源）。`relations.js` / `agent-wake-service.js` / `session-supervisor-service.js` / `domain-packs.js` 各自的局部 `appendJsonLine` 副本全部删除、改走共享实现；`index.js` 的 `appendJsonl` 改为 re-export（消除 ~4 处重复写入逻辑）。新增 `tests/event-writer.test.mjs`（3 项全过）。经调查纠正旧设想：`locks/` 是活并发锁（~70 处 `withHubLock` 依赖）保留、不删；`relations.js` 读侧多层解码补丁（兼容 08-05 历史三重编码旧行、防静默丢数据）保留、不删。
- **存储层升级 v2.3：命令实现按功能抽取出 `index.js` 巨单体（基于功能重设计的第一刀）** - 新增 `src/commands/events.js`，把 `events` 命令实现从 18861 行单体抽出，采用**依赖注入**（`eventsCommand(argv, deps)` 注入 loadConfig/ensureHub/hasFlag/getOption/positionalArgs/memoryStore/fs），模块不依赖 index.js 内部、规避函数提升串扰。`index.js` 仅留 dispatch + CLI helper，内联实现已删除。新增 `tests/commands-events.test.mjs`（3 项全过）。验证：真实库 `events list/search/verify` 全走新模块；event-writer 3 + memory-store 5 + sqlite-dualwrite 4 + commands-events 3 = 15/15 全过。后续按同模式逐命令抽取（sqlite/memory/context/task…），是"四功能域拆分"的低风险落地路径。
- **存储层升级 v2.4：命令抽取续（`sqlite` 命令按功能抽出单体）** - 沿用 v2.3 的依赖注入模式，新增 `src/commands/sqlite.js` 把存储层核心 `sqlite` 命令（status/verify/migrate/resync）从 18861 行单体抽出，导出 `sqliteCommand(argv, { loadConfig })`：`loadConfig` 经 DI 注入，其余 10 个函数直接 import 自 `sqlite-store.js`，模块自包含、零 index.js 内部依赖。`index.js` 删除内联实现及仅为它服务的 `sqlite-store.js` 整条 import（grep 确认全仓库仅该命令使用）；dispatch 改为 `sqliteCommand(rest, { loadConfig })`。新增 `tests/commands-sqlite.test.mjs`（2 项全过）。验证：真实库 `sqlite status/verify` 全走新模块且 `drift=0 consistent`（tasks=511/projects=15/workflows=10/memory=924）；event-writer 3 + memory-store 5 + sqlite-dualwrite 4 + commands-events 3 + commands-sqlite 2 = 17/17 全过。
- **存储层升级 v2.5：共享 helper 层第一步（CLI/FS 纯工具抽出单体）** - 新增 `src/lib/cli.js` 把零业务依赖的共享工具（`ensureDir`/`readJson`/`readJsonSafe`/`writeJson`/`createId`/`getOption`/`hasOption`/`hasFlag`/`parsePositiveIntegerOption`/`positionalArgs`/`countJsonlFiles`，原 index.js 18525–18602 纯工具簇）从 18861 行单体底部抽到独立模块，只依赖 node 内置 + `atomic-write`。`index.js` 顶部加 `import { ... } from "./lib/cli.js"` 并删除这 11 个函数的内联定义（消除同作用域重复声明），其他命令与已抽的 `events`/`sqlite` 经 dispatch 注入这些符号，行为不变。新增 `tests/cli.test.mjs`（9 项全过）。背景：逐命令抽（v2.3/v2.4）暴露 index.js 系统性耦合（命令共享几十个内部 helper，`getOption` 被 468 处调用），继续硬抽会变成长 DI 注入；抽共享层是真正解耦的根本一步。验证：真实库 `events list`/`sqlite status` 全走新底座；cli 9 + 现有 17 = 25/25 全过。
- **存储层升级 v2.6：存储子系统分层（JSONL IO + 实体事件存储引擎抽出单体）** - 新增 `src/lib/io.js`（通用 JSONL IO：`parseJsonlLine`/`readEvents`/`countJsonlLines`，`readEvents` 在单体中被 ~35 处调用）与 `src/lib/entity-store.js`（实体事件存储引擎 12 个函数，原 index.js 12809–12973），并把零依赖谓词 `isPlainObject`（36 处调用）补入 `src/lib/cli.js` 共享层。选它的原因是它是依赖树的根部：配置层（`ensureHub`→`writeProjects`）与数据读取层（`readTasks`/`readWorkflows`/`readProjects`）都压在它上面，先抽可同时解锁下游两层。引擎由 `definition` 参数化（携带实体专属 `normalize`/`isValid`），因此抽取**不会**拖走 `normalizeTask`/`normalizeWorkflow`/`normalizeProject`；`rebuildEventSourcedProjections` 保留在 index.js（依赖留在单体的三个 definition 工厂）。依赖方向无环：`entity-store -> io/cli/atomic-write/event-writer/sqlite-dualwrite`，均不回引 index.js。验证：真实库 `sqlite status`/`verify` 经新引擎仍 `drift=0 consistent`（tasks=511/projects=15/workflows=10/memory=924），`project list`/`task list` 读路径正常。
- **SQLite 双写（影子写）** - 新增 `sqlite-store.js` 和 `sqlite-dualwrite.js`，JSONL 写入时同步写 SQLite 影子库。开关 `AMH_SQLITE_DUALWRITE=1 node --experimental-sqlite src/index.js app`，默认完全 no-op，失败只记 stderr 不打断 JSONL 主路径。新增 `sqlite` CLI 子命令（`status|migrate|resync`）。
- **角色系统** - 6 个岗位角色（产品经理/程序员/UI设计师/测试QA/运营/数据），`roles/roles.jsonl` 持久化，`role list / role create / role delete` CLI 命令。
- **团队系统** - `teams/teams.jsonl` + `member-of` 关系（agent 归属团队），`team list / team create / team delete` CLI 命令。
- **Agent persona/bio** - agent 注册表支持 `persona`（提示词）和 `bio`（简介）字段，`agent list` 返回。
- **Dashboard "团队与角色" 页面** - 新增 `Roles.tsx` 页面（`/roles` 路由，侧边栏协作组），支持角色/团队/agent 完整 CRUD（新建/编辑/删除/成员管理/提示词编辑）。
- **Overview 指标卡** - 概览页新增"角色"和"团队"两个指标卡，可点击跳转。
- **Agent/Role/Team API 端点** - GET `/api/agents` `/api/roles` `/api/teams` + POST/DELETE 增删改路由。
- **relations.js 读取层加固** - 多层 JSON 编码自动解到对象为止，防止静默丢数据。
- **CodeBuddy Code runner** - Registered `codebuddy` in `RUNNER_PROFILES` so `doctor` and `dispatch --run` treat it as a verified CLI runner. Uses `-p --permission-mode bypassPermissions` with stdin prompts and text output; resolves `codebuddy` or `codebuddy-code` from PATH. No model is pinned, so each machine keeps its own default from `~/.codebuddy/settings.json`; `dispatch --model` overrides per job.
- **CodeBuddy install targets** - `ai-memory-hub install` now writes `~/.codebuddy/CODEBUDDY.md` and `<memoryDir>/tools/codebuddy-shared-memory.md`.

### Fixed

- **P0: relations 三重编码** - `relations/events.jsonl` 中 390/396 行被三重 JSON 编码（08-05 memory-migration 回填遗留），导致 372 条 belongs-to + 10 条 related-to 等关系静默失效。修复：逐行解码重写 + 读取层加固。
- **memberCount bug** - `GET /api/teams` 的 memberCount 始终为 0（对象字符串比较错误），已修复。
- `doctor --tool codebuddy` no longer reports "has shared instructions but no verified CLI runner on this machine". Runner resolution reads only the built-in `RUNNER_PROFILES` table, so the `tools.codebuddy.runner` / `runnerProfile` keys in `config.json` were inert and never consulted.
- **FTS5 trigram 查不到 2 字中文** - `events search` 短中文查询（红包/记忆/重构等）因 trigram 只生成 ≥3 字 token 而静默无结果。修复：`searchMemoryEvents` 在 FTS5 命中 0 且查询 <3 字时，对 SQLite 行回退子串扫描。`events verify` 命中 drift 时改设 `process.exitCode=2`（原先恒为 0）。同时修掉工作树中 `memoryCommand`/`case "memory":` 重复定义导致 `events` 读 API 变死代码的 bug（改名 `eventsCommand` + `case "events":`，旧 `memory` 命令 dispatch 不受影响）。

### Changed

- **OpenCode runner** - `args` changed from `["run"]` (without auto-approve) to `["run", "--auto"]` so dispatched runs do not hang waiting on permission prompts. Verified locally with `opencode run --auto`.
- **qoder-cn runner** - `args` changed from `["-"]` (launches the interactive TUI and hangs) to `["run"]`, matching the OpenCode CLI fix in `876b74b`. qoder-cn is the same OpenCode CLI (see commit `8fc26bd`); the `--auto` flag was intentionally left off here because it is not machine-verified for the qoder-cn fork — revisit if permission prompts hang in practice.

## [0.3.0] - 2026-07-13

### Added

#### Dashboard Redesign
- **React + TypeScript SPA** - Migrated from static HTML to Vite + React + TypeScript + Tailwind v4
- **shadcn/ui Components** - Modern UI component library integration
- **Light Blue Theme** - Redesigned from dark teal to clean light blue palette
- **Workflow Execution Graph** - Visual node-based workflow progress tracking
- **Task Purge UI** - Physical deletion of cancelled tasks from the dashboard
- **Memory Supersede Actions** - Supersede and update memories directly from the dashboard
- **GitHub Backup Controls** - Privacy-safe backup management with plaintext upload warnings
- **Search & Analytics** - Full-text search across memory, tasks, radio, and backups
- **Tools Icon Table** - Tool connections rendered as icon-based status table
- **Dashboard Backend Modularization** - 13+ extracted API modules (memory, tasks, workflows, projects, radio, dispatch, metrics, settings, health, search, backups, tools, realtime)

#### Workflow Node System (5 Phases)
- **Node-Level Execution History** - Track individual node execution with timestamps and status
- **Auto-Create Nodes** - Workflow nodes created automatically from recipe steps
- **Auto-Update Status** - Node status updated from command execution results
- **Status Derivation** - Workflow-level status derived from aggregated node states
- **Execution Graph UI** - Visual representation of workflow node dependencies and progress

#### Permission Policy Layer (3 Phases)
- **Data Layer + Resolver + CLI** - Policy rules, role resolution, and CLI commands
- **Dashboard Integration** - Policy management UI in the dashboard
- **Dispatch Preflight Enforcement** - Pre-dispatch policy checks and approval gates

#### Approval Gates
- **Data Layer + CLI** - Machine-readable approval gates for dispatch operations
- **Dispatch Integration** - Gates wired into the dispatch flow for automated enforcement

#### Quality Gate Rules
- **minimalImplementation Rule** - Validates minimum implementation completeness
- **dependencyBudget Rule** - Enforces dependency count and size limits

#### Event-Driven Daemon
- **Heartbeat Monitoring** - Daemon reports health via periodic heartbeats
- **Cycle-Start Heartbeat** - Heartbeat at each dispatch cycle start
- **Lights-Out Gate Handling** - Automated quality gate enforcement in daemon mode
- **Skill Self-Improvement** - Daemon can suggest and apply skill refinements

#### CDP Bridge
- **Chrome DevTools Protocol Bridge** - Connect non-CLI tools (VS Code, browsers) via CDP
- **VS Code Extension Generator** - Auto-generate VS Code extensions for tool integration
- **Enhanced VS Code Detection** - Improved tool detection and verification

#### Infrastructure
- **Generic RPC Envelope** - Standardized RPC over dispatch APIs
- **Handoff Bus Sync Model** - Cross-tool context transfer via handoff bus
- **File Locks + Notifications** - Infrastructure for concurrent access and cross-tool notifications
- **Session Relay** - Session context transfer between tools

#### Prompt & Search
- **Prompt Templates** - Reusable prompt templates for common workflows
- **FTS5 Search** - Full-text search with SQLite FTS5 for fast memory retrieval
- **Loop Checkpoint** - Checkpoint support for long-running loop operations

#### Backup & Archiving
- **Automatic Backup Pruning** - Configurable retention policies (daily/weekly/monthly)
- **Task/Radio Archiving** - Archive completed tasks and delivered radio messages
- **Privacy-Safe GitHub Backup** - Warnings before plaintext uploads, sensitive data scanning

#### New Tool Support
- **Coze Tool Support** - Verified integration with Coze AI platform
- **MiMo Code Adapter** - Memory hub adapter for MiMo Code
- **Device Tagging** - Track which device originated each memory/task
- **Native Merge Command** - Merge memories from multiple sources

#### Security
- **Security Check Report** - Comprehensive security audit documentation
- **looksSensitive Regex** - Improved detection of sensitive data in memories

### Changed
- Dashboard backend refactored from monolithic to 13+ modular API files
- Task review states improved with better status transitions
- Dashboard UX and accessibility improvements
- Privacy controls for backup uploads

### Fixed
- Daemon tools field stored as array instead of string
- MiMo Code dispatch prompt formatting
- Dashboard missing CSS imports and wrapper class

## [0.2.0] - 2026-06-11

### Added

#### Hermes Agent Integration
- **Hermes Agent 支持** - 已验证适配：记忆写入（events.jsonl）、任务管理（task CLI）、Radio 通信（messages.jsonl）
- **Hermes Agent 模板** - `templates/HERMES_AGENTS.md` 集成指南
- **Cron 同步方案** - 30 分钟周期的 no_agent cron 自动同步
- **config.example.json 更新** - 添加 Hermes 工具配置示例

#### Documentation
- README 添加 Hermes Agent 到已验证支持列表
- 新增 Hermes Agent 集成模板文档

## [0.1.0] - 2026-06-09

### Added

#### Core Features (11)
- **replyTo Field & Message Tracking** - Bidirectional message tracking with replyTo field and response/status filtering
- **Unified Async State Machine** - 7-state async call management (pending/dispatched/acked/retrying/failed/completed/abandoned)
- **Session Handoff** - Cross-tool context transfer with sessions.jsonl and CLI commands
- **RPC Communication** - Synchronous request-response mechanism for tool-to-tool calls
- **Unified Notification Bus** - Severity-based routing (info/warning/error/critical/need_input) with multi-channel delivery
- **VS Code Extension Template** - Extension template with status bar, sync, and task viewing
- **Context Packs** - Task-specific memory bundles with relevant memories and recent radio
- **Scheduler Queue** - Priority-based dispatch queue with retry controls and timeout management
- **Workflow Recipes** - JSON-driven collaboration templates (docs-cleanup, implement-and-review, multi-tool-review)
- **Operational Metrics** - Success rates, average durations, by-tool counts, recent failures
- **Auto-Update System** - Version checking and automatic updates with `--check` and `--force` options

#### Tool Support
- **Gemini CLI Runner** - Automatic dispatch support for Gemini CLI (`gemini -p`)
- **3 Verified CLI Runners** - Codex, Claude, Gemini can now be auto-dispatched
- **35+ Tools Pre-configured** - Adapter notes for major AI tools

#### Documentation
- **Comprehensive README** - 717 lines with complete feature list, installation guide, quick start, architecture
- **CLI Reference Documentation** - Complete 60+ command reference with examples (docs/CLI.md)
- **Update Guide** - Auto-update instructions and troubleshooting (docs/UPDATE.md)

### Changed
- Improved relay status with thread-level queries and project/tool filtering
- Enhanced dispatch with priority sorting (urgent > high > normal > low)
- Context packs now include relevantMemories, recentRadio, task/workflow details

### Fixed
- ES module compatibility with `__dirname` and `__filename`
- Recipe validation for role references and dependency cycles
- Queue entry status transitions with automatic retry logic

### Technical Details
- **Lines of Code**: 2,918 (1,698 core + 1,220 docs)
- **Git Commits**: 12
- **Recipe Templates**: 3
- **CLI Commands**: 60+
- **Supported Tools**: 35+ (13 connected, 3 runnable)

### Architecture
- Local-first, no LLM proxying
- Pure JSONL append-only event logs
- File-based locking for concurrent safety
- Tool-neutral collaboration layer

## [Unreleased]

### Planned
- Test framework and CI/CD
- Thread-aware memory search
- Enhanced async relay loop with delivery callbacks

---

## Version History

- **0.3.0** (2026-07-13) - Dashboard redesign, workflow nodes, policy layer, approval gates, event-driven daemon
- **0.2.0** (2026-06-11) - Hermes Agent integration
- **0.1.0** (2026-06-09) - Initial release with 13 core features

### Documentation updates

- Documented Skill Registry GC safety and rollback.
- Documented the single-main branch baseline and daemon restart verification.

