# ai-memory-hub

Language: [中文](#中文说明) | [English](#english)

## 中文说明

`ai-memory-hub` 是一个给多个 AI 工具共用的本地协作层。它让 Codex、Claude、Gemini、Antigravity、QClaw、OpenClaw、OpenCode、Marvis 等工具使用同一个本地目录共享记忆、消息和任务，同时每个工具继续使用自己的模型 Token、服务商和计费账户。

它不代理 LLM 请求，不要求统一配置模型 Key，也不会读取或复制各 AI 工具的 Token。

### 本地目录

```text
~/.ai-memory/
  profile.md
  MEMORY.md
  INDEX.md
  inbox/
  synced/
  memories/
    ledger.jsonl
    index.json
  radio/
    messages.jsonl
  tasks/
    tasks.jsonl
  workflows/
    workflows.jsonl
  backups/
  locks/
  tools/
  state/
```

核心文件：

- `MEMORY.md`：给 AI 工具读取的短快照，只保留核心记忆和最近工作上下文。
- `INDEX.md`：可读的分层索引，按 core、working、archive 分组。
- `memories/ledger.jsonl`：完整长期记忆账本。
- `memories/index.json`：结构化索引，可用于搜索和后续扩展。
- `radio/messages.jsonl`：AI 工具之间的短消息总线。
- `tasks/tasks.jsonl`：AI 工具之间共享的当前任务和交接状态。
- `workflows/workflows.jsonl`：多 AI、多角色协作工作流。
- `locks/hub.lock`：本地写入锁，避免多个工具同时整理同一份状态。
- `backups/`：同步、重建、备份前保存关键文件。

### 快速开始

```bash
npm install -g .
ai-memory-hub init
ai-memory-hub detect
ai-memory-hub status
```

记录长期记忆：

```bash
ai-memory-hub record "User prefers concise Chinese explanations." --source codex --kind preference
ai-memory-hub record "Project memory with tags." --source codex --kind project --project ai-memory-hub --tags schema,memos --confidence 0.8
ai-memory-hub sync
```

重建分层记忆索引：

```bash
ai-memory-hub index
ai-memory-hub search "git commit rules" --limit 5
```

启动本地 Dashboard：

```bash
ai-memory-hub app --port 38787
```

打开：

```text
http://127.0.0.1:38787
```

### 分层记忆和 Token 成本

本项目的本地记录、同步、备份、索引和 watcher 不调用模型，所以它们本身不消耗模型 Token。

Token 消耗实际发生在 AI 工具将 `MEMORY.md` 纳入自身上下文时。为避免记忆持续膨胀，当前设计把记忆分成：

- `core`：长期稳定偏好、规则、纠错和高重要度事实。
- `working`：近期项目事实、工作流、参考信息。
- `archive`：完整历史保存在账本和索引里，默认不塞进短快照。

生命周期策略见 `docs/memory-lifecycle.md`：账本长期保留，索引和快照可重建，过期/纠错先通过追加新记忆表达，不自动删除 durable facts。

可以在 `~/.ai-memory/config.json` 调整快照大小：

```json
{
  "sync": {
    "coreLimit": 40,
    "recentLimit": 20
  }
}
```

AI 工具需要任务相关上下文时，应优先用搜索：

```bash
ai-memory-hub search "麻将 体力" --limit 10
```

### AI 工具之间如何相互对话

这里的“对话”不是一个模型直接调用另一个模型，也不是让一个工具消耗另一个工具的 Token。实际机制是本地异步协作：

1. 一个 AI 工具把消息写入 `radio/messages.jsonl`，或者把任务写入 `tasks/tasks.jsonl`。
2. 另一个 AI 工具在会话开始、收到用户提示、定时任务或手动命令时读取这些本地状态。
3. 该工具用自己的模型账号和上下文处理消息或任务。

短消息用 Agent Radio：

```bash
ai-memory-hub radio send "请检查 README 的任务列表说明" --from codex --to qclaw --type review --project ai-memory-hub
ai-memory-hub radio list --limit 10
```

重要消息可以提升为长期记忆：

```bash
ai-memory-hub radio promote --id <message-id>
ai-memory-hub sync
```

### 多对多工作流

当一件事需要多个 AI 工具分工时，用 `workflow` 比单独的 Radio 或 Task 更清楚。一个工作流可以同时指定 `planner`、`executor`、`reviewer`、`observer`，也可以把多个工具放进同一个角色；它会记录计划、验收标准、风险、执行结果、评审意见、状态变化，并能自动生成角色任务和通知消息。

这个设计参考了 [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) 的生命周期思路：创建/救援任务、查看状态、取结果、取消任务、做评审。但 `ai-memory-hub` 不做 Claude 到 Codex 的单向桥接，而是保持本地优先、工具中立、多对多协作。

常用命令：

```bash
ai-memory-hub workflow create "实现共享工作流" --from codex --project ai-memory-hub --planner codex --executor claude --reviewer qclaw --observer gemini --spawn-tasks --notify
ai-memory-hub workflow list --status active
ai-memory-hub workflow start --id <workflow-id> --by codex
ai-memory-hub workflow result --id <workflow-id> --role executor "已实现并通过本地测试。" --by claude
ai-memory-hub workflow review --id <workflow-id> --role reviewer "评审通过。" --by qclaw
ai-memory-hub workflow signal --id <workflow-id> --to reviewer "可以开始最终检查。" --by codex
ai-memory-hub workflow done --id <workflow-id> --by codex
```

建议用法：

- 多工具参与同一目标时，用 `workflow create --spawn-tasks --notify` 同时生成角色任务和 Radio 通知。
- 执行方用 `workflow result` 汇报结果，评审方用 `workflow review` 留下评审意见。
- 中途需要转交、提醒或补充上下文时，用 `workflow signal` 发给某个角色或具体工具。
- 小的单人事项仍然用 `task`；短提醒仍然用 `radio`。

### 联系 Codex 和其他 AI 工具

当一个 AI 工具需要明确让另一个 AI 工具检查、执行、评审或接手时，用 `connect`。它会写入 Radio 消息，也可以同时创建一条指派给目标工具的共享任务。

```bash
ai-memory-hub connect status
ai-memory-hub connect request --from gemini --to codex --project ai-memory-hub --text "请检查当前任务列表并继续实现。" --task
ai-memory-hub connect review --from qclaw --to codex --project ai-memory-hub --text "请评审这次互操作改动。" --task
ai-memory-hub connect handoff --from marvis --to codex --project ai-memory-hub --text "这是交接上下文和下一步。" --task
ai-memory-hub dispatch --to codex --project ai-memory-hub
ai-memory-hub dispatch --to codex --project ai-memory-hub --run
```

不加 `--run` 时，请求只是共享本地状态，目标工具下次读取 Radio/Task 时会看到。加 `--run` 只适合已经验证过 CLI runner 的目标；目前 `codex` 可以被自动触发，其它工具优先通过共享状态自行读取。

### 共享任务表

共享任务表用于“当前正在做什么、谁认领了、进展如何、如何交接”。它比 Radio 更持久，但又不应该进入长期记忆。

常用命令：

```bash
ai-memory-hub task add "补充 README 的 AI 工具互相对话章节" --from codex --project ai-memory-hub --priority high
ai-memory-hub task list --status active
ai-memory-hub task claim --id <task-id> --by qclaw
ai-memory-hub task status --id <task-id> --status in_progress --by qclaw
ai-memory-hub task note --id <task-id> "中文部分已检查，英文还要同步。" --by qclaw
ai-memory-hub task done --id <task-id> --by codex
```

状态包括：

```text
open | claimed | in_progress | blocked | done | cancelled
```

建议用法：

- 开始较大的工作前先运行 `ai-memory-hub task list --status active`。
- 多个 AI 同时参与同一项目时，先 `claim` 再修改。
- 中途切换 AI 工具时，用 `task note` 写清已做内容、剩余风险和下一步。
- 完成后用 `task done` 关闭任务。
- 长期规则和偏好写入记忆；当前进度和交接写入任务；短提醒写入 Radio。

### 并发与备份

多个 AI 工具可能同时追加记忆、消息或任务。约束是：

- AI 工具可以追加 `inbox/events.jsonl` 和使用 `radio`、`task` 命令。
- AI 工具不应直接编辑 `memories/ledger.jsonl`、`MEMORY.md`、`INDEX.md` 或 `memories/index.json`。
- `sync`、`index`、`pull`、`backup` 和任务写操作会通过 `locks/hub.lock` 串行执行。

手动备份：

```bash
ai-memory-hub backup --reason before-large-change
```

备份会包含 `MEMORY.md`、`profile.md`、inbox、ledger、radio、tasks、workflows 和 config。

### 自动化

需要区分两种“自动”：

- 自动整理记忆：watcher 看到 inbox 有新长期记忆事件后自动 `sync`。
- 自动触发 AI 工具：dispatch 把 Radio/Task 变成 CLI 调用，但只支持有可验证 CLI runner 的工具。

最稳妥的自动整理方式是长期运行 watcher：

```bash
ai-memory-hub watch --interval-ms 30000
```

AI 工具写入长期记忆后，如果能执行命令，可以顺手运行 `ai-memory-hub sync`；如果不能执行命令，watcher 会稍后整理。

任务和 Radio 不需要 `sync` 才能被其他工具读取，它们写入后就是本地可见状态。

自动触发 AI 工具使用 `dispatch`：

```bash
ai-memory-hub dispatch --to codex --project who-is-undercover-20260605-01
ai-memory-hub dispatch --to codex --project who-is-undercover-20260605-01 --run
```

不加 `--run` 时只是 dry-run，显示哪些任务或消息可被触发。加 `--run` 才会真正调用对应工具的 CLI，并消耗该工具自己的模型 Token。成功调度过的 job 会写入 `~/.ai-memory/state/dispatch-log.jsonl`，默认不会重复触发；需要重跑时加 `--force`。

当前本机已验证的自动 runner：

```text
codex    可通过 codex exec 触发
claude   命令包装器存在但当前安装路径损坏，暂不启用
qclaw/gemini/openclaw/opencode/app 类工具   已能共享状态，但没有已验证 CLI runner，不能自动拉起
```

所以“谁是卧底”这类测试，只有接到 `codex` 的消息可以被 `dispatch --run` 自动触发；发给 qclaw、gemini、openclaw 等工具的消息目前只能等它们自己读取，或者等我们拿到它们的 CLI/API 入口后再集成 runner。

### 配置 AI 工具

预览安装指令：

```bash
ai-memory-hub install --tool codex
ai-memory-hub install --tool claude
ai-memory-hub install --tool gemini
```

实际写入：

```bash
ai-memory-hub install --tool codex --apply
ai-memory-hub install --tool claude --apply
ai-memory-hub install --tool gemini --apply
```

Windows 上会写入：

```text
%USERPROFILE%\.codex\AGENTS.md
%USERPROFILE%\.claude\CLAUDE.md
%USERPROFILE%\.gemini\GEMINI.md
```

QClaw、OpenClaw、OpenCode 使用 Skill 目录：

```bash
ai-memory-hub install --tool qclaw --apply
ai-memory-hub install --tool openclaw --apply
ai-memory-hub install --tool opencode --apply
```

App 类型工具如果没有稳定指令注入点，`install` 会在 `~/.ai-memory/tools/` 生成安全适配说明，不会侵入式修改内部数据库。

### 当前支持矩阵

```text
Codex CLI      通过 ~/.codex/AGENTS.md 直接注入指令
Claude         通过 ~/.claude/CLAUDE.md 直接注入指令
Gemini         通过 ~/.gemini/GEMINI.md 直接注入指令
QClaw          通过 ~/.qclaw/skills/ai-memory-hub/SKILL.md 安装 Skill
OpenClaw       通过 ~/.openclaw/skills/ai-memory-hub/SKILL.md 安装 Skill
OpenCode       通过 ~/.config/opencode/skills/ai-memory-hub/SKILL.md 安装 Skill
Antigravity    检测并生成 ~/.ai-memory/tools 适配说明
Codex App      检测并生成 ~/.ai-memory/tools 适配说明
Marvis         检测并生成 ~/.ai-memory/tools 适配说明，深度集成待验证
Cursor/Windsurf/VS Code/Continue/Cline/Roo Code/Trae/Kiro/Zed/ChatGPT/Ollama/LM Studio/Jan/AnythingLLM/Cherry Studio/Dify/Open WebUI/Aider/Tabby/Codeium/Augment/Supermaven
               预支持，生成安全适配说明
```

### 命令

```text
init       创建共享目录和配置。
detect     检测当前机器上的 AI 工具。
status     显示 hub、工具、索引、Radio 和任务状态。
record     追加一条长期记忆事件。
radio      发送、列出和提升跨工具短消息。
task       添加、列出、认领、备注、更新和完成共享任务。
workflow   编排 planner/executor/reviewer/observer 多角色协作。
connect    检查工具连接，或向另一个工具发送请求、评审、交接。
dispatch   把 Radio/Task 调度给已验证的 CLI runner。
sync       把 inbox 事件整理进长期记忆账本。
index      重建 MEMORY.md、INDEX.md 和 memories/index.json。
search     搜索本地记忆索引。
diff       查看保存的 MEMORY.md 游标之间的差异。
pull       从账本重建共享快照和索引。
backup     备份关键本地状态文件。
watch      定时整理待处理 inbox 事件。
app        启动本地 Dashboard。
install    显示或应用每个工具的指令片段。
help       显示 CLI 帮助。
```

### 安全性

本项目不会复制、读取或统一管理各 AI 工具的模型 Token。长期记忆同步会跳过看起来像密钥、密码或 Token 的文本。

本地记忆目录是个人运行时状态，不应上传到 GitHub 或公开仓库。仓库 `.gitignore` 已忽略 `.ai-memory/` 和 `**/.ai-memory/`。默认真实目录是 `~/.ai-memory`，位于仓库之外；如果把 `memoryDir` 改到项目目录内，也应保持该目录被忽略。

### 新增高优先级功能

- 备份保留策略：默认保留最近 50 份备份，`maxAgeDays` 默认关闭；可以通过 `sync.backupRetention` 调整。
- 记忆诊断：`index` 会在 `memories/index.json` 和 `INDEX.md` 中显示重复记忆和潜在冲突，但不会修改 `memories/ledger.jsonl`。
- 快照游标与差异：每次重建 `MEMORY.md` 都会写入稳定 cursor，并保存到 `state/memory-snapshots/`；用 `ai-memory-hub diff` 查看上次和当前快照差异。
- 搜索相关性：搜索会过滤没有真实命中的结果，并支持少量中英同义词，例如 backup/备份、commit/提交、rules/规范、LAN/局域网、Internet/互联网。
- 多对多工作流：`workflow` 支持 planner/executor/reviewer/observer 角色、结果/评审/风险记录、状态流转、角色任务生成和 Radio 通知。

常用命令：

```bash
ai-memory-hub backup cleanup --dry-run
ai-memory-hub diff --list
ai-memory-hub diff --from previous --to current
ai-memory-hub search "git commit rules" --limit 5
```

## English

`ai-memory-hub` is a local collaboration layer for multiple AI tools. It lets Codex, Claude, Gemini, Antigravity, QClaw, OpenClaw, OpenCode, Marvis, and similar tools share one local directory for memory, messages, and task state while each tool keeps its own model token, provider, and billing account.

It does not proxy LLM traffic, does not require a shared model key, and does not read or copy AI tool tokens.

### Local Directory

```text
~/.ai-memory/
  profile.md
  MEMORY.md
  INDEX.md
  inbox/
  synced/
  memories/
    ledger.jsonl
    index.json
  radio/
    messages.jsonl
  tasks/
    tasks.jsonl
  workflows/
    workflows.jsonl
  backups/
  locks/
  tools/
  state/
```

Key files:

- `MEMORY.md`: a compact snapshot read by AI tools.
- `INDEX.md`: a readable layered index grouped by core, working, and archive.
- `memories/ledger.jsonl`: the full durable memory ledger.
- `memories/index.json`: structured local search/index data.
- `radio/messages.jsonl`: short cross-tool messages.
- `tasks/tasks.jsonl`: shared current tasks and handoff state.
- `workflows/workflows.jsonl`: many-to-many workflow orchestration state.
- `locks/hub.lock`: a local write lock.
- `backups/`: snapshots of key files before sync, rebuild, or backup actions.

### Quick Start

```bash
npm install -g .
ai-memory-hub init
ai-memory-hub detect
ai-memory-hub status
```

Record durable memory:

```bash
ai-memory-hub record "User prefers concise Chinese explanations." --source codex --kind preference
ai-memory-hub record "Project memory with tags." --source codex --kind project --project ai-memory-hub --tags schema,memos --confidence 0.8
ai-memory-hub sync
```

Memory records keep the raw ledger format backward-compatible while the rebuilt index adds canonical structured fields: `schemaVersion`, `kind`, `project`, `tags`, `scope`, and numeric `confidence` from `0` to `1`.

Rebuild and search the layered index:

```bash
ai-memory-hub index
ai-memory-hub search "git commit rules" --limit 5
```

Start the local dashboard:

```bash
ai-memory-hub app --port 38787
```

Open:

```text
http://127.0.0.1:38787
```

### Layered Memory And Token Cost

Local recording, syncing, backups, indexing, and the watcher do not call a model, so they do not consume model tokens by themselves.

Tokens are consumed when an AI tool reads `MEMORY.md` and includes it in its own context. To keep that small, memory is layered:

- `core`: stable preferences, rules, corrections, and high-importance facts.
- `working`: recent project facts, workflow information, and references.
- `archive`: full history kept in the ledger and index, not loaded by default.

See `docs/memory-lifecycle.md` for the durable memory lifecycle policy: the ledger is retained, indexes and snapshots are derived, and stale facts are superseded by new memories before any destructive cleanup exists.

Tune snapshot size in `~/.ai-memory/config.json`:

```json
{
  "sync": {
    "coreLimit": 40,
    "recentLimit": 20
  }
}
```

For task-specific context, search instead of loading the full ledger:

```bash
ai-memory-hub search "mahjong stamina" --limit 10
```

### How AI Tools Talk To Each Other

This is not direct model-to-model calling, and it does not make one tool spend another tool's tokens. It is local asynchronous collaboration:

1. One AI tool writes a message to `radio/messages.jsonl` or a task to `tasks/tasks.jsonl`.
2. Another AI tool reads that local state at session start, after a user prompt, from a scheduled task, or by manual command.
3. That tool handles the message or task with its own model account and context.

Short messages use Agent Radio:

```bash
ai-memory-hub radio send "Please review the README task-list section" --from codex --to qclaw --type review --project ai-memory-hub
ai-memory-hub radio list --limit 10
```

Promote an important message into durable memory:

```bash
ai-memory-hub radio promote --id <message-id>
ai-memory-hub sync
```

### Many-To-Many Workflows

Use `workflow` when one goal needs several AI tools to coordinate instead of a single owner. A workflow can assign `planner`, `executor`, `reviewer`, and `observer` roles, including multiple tools per role. It stores the plan, acceptance criteria, risks, execution results, review notes, status transitions, linked tasks, and linked Radio messages.

This borrows the useful lifecycle shape from [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc): review, rescue/delegation, status, result, and cancel. The model is different: `ai-memory-hub` stays local-first, tool-neutral, and many-to-many instead of acting as a one-way Claude-to-Codex bridge.

Common commands:

```bash
ai-memory-hub workflow create "Implement shared workflow support" --from codex --project ai-memory-hub --planner codex --executor claude --reviewer qclaw --observer gemini --spawn-tasks --notify
ai-memory-hub workflow list --status active
ai-memory-hub workflow start --id <workflow-id> --by codex
ai-memory-hub workflow result --id <workflow-id> --role executor "Implemented and tested." --by claude
ai-memory-hub workflow review --id <workflow-id> --role reviewer "Review passed." --by qclaw
ai-memory-hub workflow signal --id <workflow-id> --to reviewer "Ready for final review." --by codex
ai-memory-hub workflow done --id <workflow-id> --by codex
```

Recommended use:

- Use `workflow create --spawn-tasks --notify` to create role tasks and Radio notifications together.
- Executors report with `workflow result`; reviewers report with `workflow review`.
- Use `workflow signal` for handoffs, reminders, or role-specific context.
- Keep small single-owner items in `task`, and short pings in `radio`.

### Contact Codex And Other AI Tools

Use `connect` when one AI tool needs a specific target tool to inspect, execute, review, or continue work. It writes a Radio message and can also create an assigned shared task for the target.

```bash
ai-memory-hub connect status
ai-memory-hub connect request --from gemini --to codex --project ai-memory-hub --text "Please inspect the current task list and continue implementation." --task
ai-memory-hub connect review --from qclaw --to codex --project ai-memory-hub --text "Please review this interoperability change." --task
ai-memory-hub connect handoff --from marvis --to codex --project ai-memory-hub --text "Handoff context and next step." --task
ai-memory-hub dispatch --to codex --project ai-memory-hub
ai-memory-hub dispatch --to codex --project ai-memory-hub --run
```

Without `--run`, the request remains shared local state until the target reads Radio or Task state. Use `--run` only for targets with verified CLI runners; currently `codex` can be auto-triggered, while most other tools should read shared state themselves.

### Shared Task List

The shared task list tracks what is currently being worked on, who claimed it, what progress exists, and how another tool can take over. It is more durable than Radio, but it should not become long-term memory.

Common commands:

```bash
ai-memory-hub task add "Document how AI tools talk to each other" --from codex --project ai-memory-hub --priority high
ai-memory-hub task list --status active
ai-memory-hub task claim --id <task-id> --by qclaw
ai-memory-hub task status --id <task-id> --status in_progress --by qclaw
ai-memory-hub task note --id <task-id> "Chinese section reviewed; English still needs sync." --by qclaw
ai-memory-hub task done --id <task-id> --by codex
```

Statuses:

```text
open | claimed | in_progress | blocked | done | cancelled
```

Recommended use:

- Run `ai-memory-hub task list --status active` before substantial work.
- When multiple tools work on one project, claim the task before editing.
- During handoff, add a note with completed work, remaining risk, and next step.
- Close finished work with `task done`.
- Store long-lived rules in memory, current progress in tasks, and short pings in Radio.

### Concurrency And Backups

Multiple AI tools may append memories, messages, and task updates. The rules are:

- Tools may append `inbox/events.jsonl` and use `radio` or `task` commands.
- Tools should not directly edit `memories/ledger.jsonl`, `MEMORY.md`, `INDEX.md`, or `memories/index.json`.
- `sync`, `index`, `pull`, `backup`, and task writes are serialized through `locks/hub.lock`.

Manual backup:

```bash
ai-memory-hub backup --reason before-large-change
```

Backups include `MEMORY.md`, `profile.md`, inbox, ledger, radio, tasks, workflows, and config.

Backup retention is configured under `sync.backupRetention`. By default, cleanup is enabled and keeps the newest 50 backup directories; age-based cleanup is disabled with `maxAgeDays: 0`.

Preview backup cleanup:

```bash
ai-memory-hub backup cleanup --dry-run
```

### Memory Diagnostics And Diff

`index`, `sync`, and `pull` rebuild the structured index with non-mutating diagnostics. Duplicate and potential-conflict groups are surfaced in `memories/index.json`, `INDEX.md`, and `status`, but the durable ledger is not changed.

Each `MEMORY.md` rebuild writes a stable snapshot cursor and saves the snapshot under `state/memory-snapshots/`. Use `diff` to inspect changes between saved cursors:

```bash
ai-memory-hub diff --list
ai-memory-hub diff --from previous --to current
```

Search ranking filters out records that only matched by importance and includes a small synonym map for common mixed Chinese/English queries such as `git commit rules`, `backup retention`, and `局域网 互联网`.

### Automation

There are two different kinds of automation:

- Automatic memory indexing: the watcher sees new durable inbox events and runs `sync`.
- Automatic AI triggering: `dispatch` turns Radio/Task work into CLI calls, but only for tools with verified CLI runners.

The most reliable automatic indexing path is to keep the watcher running:

```bash
ai-memory-hub watch --interval-ms 30000
```

After an AI tool writes durable memory, it should run `ai-memory-hub sync` when command execution is available. If it cannot, the watcher will index the event later.

Tasks and Radio do not require `sync`; once written, they are locally visible.

Use `dispatch` to trigger AI tools:

```bash
ai-memory-hub dispatch --to codex --project who-is-undercover-20260605-01
ai-memory-hub dispatch --to codex --project who-is-undercover-20260605-01 --run
ai-memory-hub dispatch status --thread <thread-id> --project ai-memory-hub
ai-memory-hub dispatch status --recent 10 --project ai-memory-hub
ai-memory-hub dispatch status --recent --state failed --to claude
ai-memory-hub dispatch retry --project ai-memory-hub --to qclaw --run --limit 1
```

Without `--run`, dispatch is a dry run and only reports what can be triggered. With `--run`, it calls the target tool CLI and spends that tool's own model tokens. Successful dispatches are logged in `~/.ai-memory/state/dispatch-log.jsonl` and are not repeated by default; use `--force` to rerun.

For relay observability, `dispatch status` supports both a single-thread deep view and a recent summary view. Use `--thread`, `--thread-key`, or `--ref-id` to inspect one relay timeline with source, related objects, and matching dispatch log entries. Use `--recent` to list the latest relay state for multiple threads, optionally filtered by `--project`, `--to`, or `--state`. The summary counts are computed across the full filtered result set, while `items` is the top-N slice controlled by `--recent` or `--limit`.

Verified runner status on this machine:

```text
codex    Can be triggered through codex exec
claude   Wrapper exists but the current install path is broken, so it is disabled
qclaw/gemini/openclaw/opencode/app-style tools   Shared state works, but no verified CLI runner is available yet
```

For demos such as Who Is Undercover, messages addressed to `codex` can be auto-triggered with `dispatch --run`. Messages addressed to qclaw, gemini, openclaw, or app-style tools remain shared local state until those tools read them or a verified CLI/API runner is added.

### Configure AI Tools

Preview instruction installation:

```bash
ai-memory-hub install --tool codex
ai-memory-hub install --tool claude
ai-memory-hub install --tool gemini
```

Apply:

```bash
ai-memory-hub install --tool codex --apply
ai-memory-hub install --tool claude --apply
ai-memory-hub install --tool gemini --apply
```

On Windows, this writes:

```text
%USERPROFILE%\.codex\AGENTS.md
%USERPROFILE%\.claude\CLAUDE.md
%USERPROFILE%\.gemini\GEMINI.md
```

QClaw, OpenClaw, and OpenCode use Skill directories:

```bash
ai-memory-hub install --tool qclaw --apply
ai-memory-hub install --tool openclaw --apply
ai-memory-hub install --tool opencode --apply
```

For app-style tools without a stable instruction injection point, `install` generates safe adapter notes under `~/.ai-memory/tools/`. It does not invasively modify internal app databases.

### Current Support Matrix

```text
Codex CLI      Direct instruction injection via ~/.codex/AGENTS.md
Claude         Direct instruction injection via ~/.claude/CLAUDE.md
Gemini         Direct instruction injection via ~/.gemini/GEMINI.md
QClaw          Skill installed via ~/.qclaw/skills/ai-memory-hub/SKILL.md
OpenClaw       Skill installed via ~/.openclaw/skills/ai-memory-hub/SKILL.md
OpenCode       Skill installed via ~/.config/opencode/skills/ai-memory-hub/SKILL.md
Antigravity    Detected; adapter note generated under ~/.ai-memory/tools
Codex App      Detected; adapter note generated under ~/.ai-memory/tools
Marvis         Detected; adapter note generated under ~/.ai-memory/tools; deeper integration is unverified
Cursor/Windsurf/VS Code/Continue/Cline/Roo Code/Trae/Kiro/Zed/ChatGPT/Ollama/LM Studio/Jan/AnythingLLM/Cherry Studio/Dify/Open WebUI/Aider/Tabby/Codeium/Augment/Supermaven
               Pre-supported through safe adapter notes
```

### Commands

```text
init       Create the shared directory and config.
detect     Detect AI tools on this machine.
status     Show hub, tool, index, Radio, and task status.
record     Append a durable memory event.
radio      Send, list, and promote cross-tool short messages.
task       Add, list, claim, note, update, and complete shared tasks.
workflow   Orchestrate planner/executor/reviewer/observer work across tools.
connect    Check tool connections or send requests, reviews, and handoffs.
dispatch   Dispatch Radio/Task work to verified CLI runners.
sync       Index inbox events into the durable memory ledger.
index      Rebuild MEMORY.md, INDEX.md, and memories/index.json.
search     Search the local memory index.
diff       Show MEMORY.md changes between saved cursors.
pull       Rebuild the shared snapshot and index from the ledger.
backup     Back up key local state files.
watch      Periodically index pending inbox events.
app        Start the local Dashboard.
install    Show or apply per-tool instruction snippets.
help       Show CLI help.
```

### Safety

This project does not copy, read, or centrally manage model tokens from AI tools. Durable memory sync skips text that looks like an API key, password, secret, or token.

The local memory directory is personal runtime state and should not be uploaded to GitHub or public repositories. The repository `.gitignore` ignores `.ai-memory/` and `**/.ai-memory/`. The default real directory is `~/.ai-memory`, outside the repository. If you move `memoryDir` into a project folder, keep that directory ignored.
