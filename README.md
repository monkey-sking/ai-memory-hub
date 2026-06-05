# ai-memory-hub

Language: [中文](#中文说明) | [English](#english)

## 中文说明

`ai-memory-hub` 是一个给多个 AI 工具共用的本地记忆中枢。它让 Codex、Claude、Gemini、Antigravity、QClaw、OpenClaw 等工具使用同一个本地记忆目录，同时每个工具继续使用自己的模型 Token、服务商和计费账户。

它不代理 LLM 请求，也不要求统一配置模型 Key。每个 AI 工具只负责读写本地目录，`ai-memory-hub` 负责把这些事件整理成共享记忆快照。

共享目录结构：

```text
~/.ai-memory/
  profile.md
  MEMORY.md
  inbox/
  synced/
  memories/
  radio/
  backups/
  locks/
  tools/
  state/
```

核心机制：

- `inbox/events.jsonl`：各 AI 工具写入的待处理长期记忆事件。
- `memories/ledger.jsonl`：项目自己的本地长期记忆账本。
- `MEMORY.md`：给各 AI 工具读取的共享记忆快照。
- `radio/messages.jsonl`：Agent 之间的短期协作消息。
- `locks/hub.lock`：整理账本和重建快照时使用的本地锁。
- `backups/`：每次整理或重建前自动生成的备份。

### 为什么做这个项目

很多 AI 工具都有自己的本地记忆，但彼此不互通。这个项目提供一个统一的本地共享层，让不同 AI 工具在不共享模型 Token 的前提下共享上下文。

我们的特色是：

- 本地优先：默认不依赖外部记忆平台。
- Token 独立：每个 AI 工具继续使用自己的账号和模型配置。
- 可审计：所有长期记忆都进入本地 JSONL 账本。
- 可协作：Agent Radio 支持跨工具交接、审查请求和状态同步。
- 非侵入：检测 AI App 状态，不读取或复制模型 Token。

### 快速开始

```bash
npm install -g .
ai-memory-hub init
ai-memory-hub detect
ai-memory-hub status
```

记录一条长期记忆事件：

```bash
ai-memory-hub record "User prefers concise Chinese explanations." --source codex
```

把本地 inbox 事件整理进本地记忆账本，并重建 `MEMORY.md`：

```bash
ai-memory-hub sync
```

从本地记忆账本重建共享快照：

```bash
ai-memory-hub pull
```

运行长期 watcher，定时整理新的 inbox 事件：

```bash
ai-memory-hub watch --interval-ms 30000
```

启动本地 Dashboard 应用：

```bash
ai-memory-hub app --port 38787
```

打开：

```text
http://127.0.0.1:38787
```

Dashboard 可以：

- 显示本地 hub 状态。
- 显示共享记忆目录。
- 显示本地待处理记忆事件。
- 显示本地长期记忆账本数量。
- 记录新的长期记忆事件。
- 发送和查看 Agent Radio 消息。
- 触发 `sync` 和 `pull`。
- 检测已安装的 AI 工具和应用。

### 本地记忆账本

`sync` 命令会读取：

```text
~/.ai-memory/inbox/events.jsonl
```

然后把有效的长期记忆事件写入：

```text
~/.ai-memory/memories/ledger.jsonl
```

最后重建：

```text
~/.ai-memory/MEMORY.md
```

AI 工具不需要任何共享平台 Key。它们只需要通过指令或 hook 读取和写入 `~/.ai-memory`。

### 并发与备份

多个 AI 工具可以同时追加 `inbox/events.jsonl`。它们不应该直接修改 `memories/ledger.jsonl` 或 `MEMORY.md`。

`sync`、`pull` 和 `backup` 会通过 `locks/hub.lock` 串行执行，避免多个进程同时整理账本或重建快照。锁超过 `lockStaleMs` 后会被视为过期。

每次 `sync` 或 `pull` 前都会自动备份关键文件到：

```text
~/.ai-memory/backups/
```

也可以手动备份：

```bash
ai-memory-hub backup --reason before-large-change
```

### 自动化

最稳妥的自动化方式是长期运行 watcher：

```bash
ai-memory-hub watch --interval-ms 30000
```

AI 工具写入长期记忆事件后，如果能执行命令，可以顺手运行 `ai-memory-hub sync`；如果不能执行命令，watcher 会在后台自动整理。

### Token 成本控制

本项目的本地记录、同步、备份和 watcher 不调用模型，因此本身不消耗模型 Token。

真正消耗 Token 的地方，是某个 AI 工具在会话里读取 `MEMORY.md`，并把它放进自己的上下文。默认 `snapshotLimit` 是 200 条，但建议只保存长期有效的偏好、项目事实、工作流规则和纠错，不保存临时聊天、命令日志、失败堆栈或大段文档。

如果记忆变多，可以在 `~/.ai-memory/config.json` 里调低：

```json
{
  "sync": {
    "snapshotLimit": 50
  }
}
```

`ledger.jsonl` 可以保留完整历史，`MEMORY.md` 只放最近或最重要的一小部分，降低每个 AI 工具启动时的上下文成本。

### Agent Radio

Agent Radio 是 `ai-memory-hub` 内置的本地跨 Agent 消息总线。

消息以 JSONL 格式保存：

```text
~/.ai-memory/radio/messages.jsonl
```

适合用于短期协作：

- Agent 之间的交接
- 审查请求
- 风险提示
- 完成或状态更新
- 不应立即写入长期记忆的协作信息

发送消息：

```bash
ai-memory-hub radio send "Please review the latest implementation." --from codex --to claude --type review
```

列出最近消息：

```bash
ai-memory-hub radio list --limit 10
```

把重要的 radio 消息提升为长期记忆事件：

```bash
ai-memory-hub radio promote --id <message-id>
ai-memory-hub sync
```

### AI 助手集成模型

推荐集成方式：

1. 在每个 AI 助手的本地指令文件中加入一小段说明。
2. 要求助手在会话开始时读取 `~/.ai-memory/MEMORY.md`。
3. 要求助手把长期记忆事件追加到 `~/.ai-memory/inbox/events.jsonl`。
4. 手动、通过计划任务或以 daemon 方式运行 `ai-memory-hub sync`。

这种方式可以保持每个助手的模型 Token 相互独立。

### 配置 AI 工具

使用 `install` 可以把共享记忆指令注入到支持的工具里。它不会写入模型 Key，也不会修改模型服务商配置。

先预览：

```bash
ai-memory-hub install --tool codex
ai-memory-hub install --tool claude
ai-memory-hub install --tool gemini
```

实际应用：

```bash
ai-memory-hub install --tool codex --apply
ai-memory-hub install --tool claude --apply
ai-memory-hub install --tool gemini --apply
```

在 Windows 上，这会写入：

```text
%USERPROFILE%\.codex\AGENTS.md
%USERPROFILE%\.claude\CLAUDE.md
%USERPROFILE%\.gemini\GEMINI.md
```

QClaw 支持通过自己的 Skill 目录接入：

```bash
ai-memory-hub install --tool qclaw --apply
ai-memory-hub install --tool openclaw --apply
```

这会写入：

```text
%USERPROFILE%\.qclaw\skills\ai-memory-hub\SKILL.md
%USERPROFILE%\.openclaw\skills\ai-memory-hub\SKILL.md
```

对于还没有稳定指令注入点的 App 类型工具，`install` 会在共享记忆目录下生成安全的适配说明：

```bash
ai-memory-hub install --tool antigravity --apply
ai-memory-hub install --tool codex-app --apply
ai-memory-hub install --tool marvis --apply
```

这些命令会创建类似下面的文件：

```text
%USERPROFILE%\.ai-memory\tools\antigravity-shared-memory.md
%USERPROFILE%\.ai-memory\tools\codex-app-shared-memory.md
%USERPROFILE%\.ai-memory\tools\marvis-shared-memory.md
```

这些是安全的适配说明，不会侵入式修改内部 App 数据库或不透明状态文件。

#### 当前支持矩阵

```text
Codex CLI      通过 ~/.codex/AGENTS.md 直接注入指令
Claude         通过 ~/.claude/CLAUDE.md 直接注入指令
Gemini         通过 ~/.gemini/GEMINI.md 直接注入指令
Antigravity    已检测；在 ~/.ai-memory/tools 下生成适配说明
Codex App      已检测；在 ~/.ai-memory/tools 下生成适配说明
Marvis         已检测；在 ~/.ai-memory/tools 下生成适配说明；深度 MCP/知识库接入待验证
QClaw          通过 ~/.qclaw/skills/ai-memory-hub/SKILL.md 安装为 QClaw Skill
OpenClaw       通过 ~/.openclaw/skills/ai-memory-hub/SKILL.md 安装为 OpenClaw Skill
CC Switch      已检测；暂未直接注入
```

### 命令

```text
init       创建共享记忆目录和配置。
detect     检测当前机器上安装的 AI 工具。
status     显示 hub 和工具状态。
record     向 inbox 追加一条本地记忆事件。
radio      发送、列出和提升跨 Agent radio 消息。
sync       把待处理 inbox 事件整理进本地记忆账本。
pull       从本地记忆账本重建 MEMORY.md。
backup     备份 MEMORY.md、账本、inbox、profile 和 radio 文件。
watch      定时整理待处理 inbox 事件。
app        启动本地 Dashboard 应用。
install    显示或应用每个工具的指令片段。
help       显示 CLI 帮助。
```

### 安全性

安装器默认是 dry-run。只有加上 `--apply` 时，才会编辑工具的指令文件。

项目不会复制、读取或统一管理各 AI 工具的模型 Token。长期记忆也会跳过看起来像密钥、密码或 Token 的文本。

## English

`ai-memory-hub` is a local memory hub for multiple AI tools. It lets Codex, Claude, Gemini, Antigravity, QClaw, OpenClaw, and similar tools use one shared local memory directory while each tool keeps its own model token, provider, and billing account.

It does not proxy LLM traffic and does not require a shared model key. Each AI tool only reads and writes the local directory. `ai-memory-hub` indexes those events into a shared memory snapshot.

Shared directory layout:

```text
~/.ai-memory/
  profile.md
  MEMORY.md
  inbox/
  synced/
  memories/
  radio/
  backups/
  locks/
  tools/
  state/
```

Core mechanism:

- `inbox/events.jsonl`: pending durable memory events written by AI tools.
- `memories/ledger.jsonl`: the project's own local durable memory ledger.
- `MEMORY.md`: the shared snapshot read by AI tools.
- `radio/messages.jsonl`: short-lived cross-agent collaboration messages.
- `locks/hub.lock`: the local lock used while indexing the ledger or rebuilding the snapshot.
- `backups/`: automatic backups created before indexing or snapshot rebuilds.

### Why

Most AI tools keep separate local memory. This project provides a unified local layer so different AI tools can share context without sharing model tokens.

What makes it distinct:

- Local-first: no external memory platform is required by default.
- Token-independent: each AI tool keeps its own account and model configuration.
- Auditable: durable memories are stored in a local JSONL ledger.
- Collaborative: Agent Radio supports handoffs, review requests, and status updates.
- Non-invasive: detection reports local app state without reading or copying model tokens.

### Quick Start

```bash
npm install -g .
ai-memory-hub init
ai-memory-hub detect
ai-memory-hub status
```

Record a durable memory event:

```bash
ai-memory-hub record "User prefers concise Chinese explanations." --source codex
```

Index local inbox events into the local memory ledger and rebuild `MEMORY.md`:

```bash
ai-memory-hub sync
```

Rebuild the shared snapshot from the local memory ledger:

```bash
ai-memory-hub pull
```

Run a long-lived watcher that periodically indexes new inbox events:

```bash
ai-memory-hub watch --interval-ms 30000
```

Start the local dashboard app:

```bash
ai-memory-hub app --port 38787
```

Open:

```text
http://127.0.0.1:38787
```

The dashboard can:

- Show local hub status.
- Show the shared memory directory.
- Show pending local memory events.
- Show local ledger count.
- Record new durable memory events.
- Send and inspect Agent Radio messages.
- Trigger `sync` and `pull`.
- Detect installed AI tools and apps.

### Local Ledger

The `sync` command reads:

```text
~/.ai-memory/inbox/events.jsonl
```

Then it writes valid durable memory events into:

```text
~/.ai-memory/memories/ledger.jsonl
```

Finally it rebuilds:

```text
~/.ai-memory/MEMORY.md
```

AI tools do not need any shared platform key. They only need instructions or hooks that read and write `~/.ai-memory`.

### Concurrency And Backups

Multiple AI tools may append to `inbox/events.jsonl` at the same time. They should not edit `memories/ledger.jsonl` or `MEMORY.md` directly.

`sync`, `pull`, and `backup` run behind `locks/hub.lock`, so ledger indexing and snapshot rebuilds are serialized. Locks older than `lockStaleMs` are treated as stale.

Before each `sync` or `pull`, the hub automatically backs up key files into:

```text
~/.ai-memory/backups/
```

You can also create a manual backup:

```bash
ai-memory-hub backup --reason before-large-change
```

### Automation

The most reliable automation path is to keep the watcher running:

```bash
ai-memory-hub watch --interval-ms 30000
```

After an AI tool appends a durable memory event, it should run `ai-memory-hub sync` when command execution is available. If it cannot run commands, the watcher will index the event in the background.

### Token Cost Control

Local recording, syncing, backups, and the watcher do not call a model, so they do not consume model tokens by themselves.

Tokens are consumed when an AI tool reads `MEMORY.md` and includes it in its own context. The default `snapshotLimit` is 200 records, but the intended use is to save only durable preferences, project facts, workflow rules, and corrections. Do not save temporary chat details, command logs, failure stacks, or long documents.

If memory grows, lower this in `~/.ai-memory/config.json`:

```json
{
  "sync": {
    "snapshotLimit": 50
  }
}
```

`ledger.jsonl` can keep the full history while `MEMORY.md` stays small, which reduces context cost when AI tools start.

### Agent Radio

Agent Radio is a local cross-agent message bus built into `ai-memory-hub`.

Messages are stored as JSONL:

```text
~/.ai-memory/radio/messages.jsonl
```

Use it for short-lived collaboration:

- handoffs between agents
- review requests
- risk notes
- done/status updates
- coordination that should not immediately become long-term memory

Send a message:

```bash
ai-memory-hub radio send "Please review the latest implementation." --from codex --to claude --type review
```

List recent messages:

```bash
ai-memory-hub radio list --limit 10
```

Promote an important radio message into a durable memory event:

```bash
ai-memory-hub radio promote --id <message-id>
ai-memory-hub sync
```

### Assistant Integration Model

The recommended integration is:

1. Add a short instruction to each assistant's local instruction file.
2. Ask the assistant to read `~/.ai-memory/MEMORY.md` at session start.
3. Ask the assistant to append durable memory events to `~/.ai-memory/inbox/events.jsonl`.
4. Run `ai-memory-hub sync` manually, from a scheduler, or as a daemon.

This keeps each assistant's model token independent.

### Configure AI Tools

Use `install` to inject shared-memory instructions into supported tools. This does not write model keys and does not change model provider configuration.

Preview first:

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

QClaw can be connected through its own Skill directory:

```bash
ai-memory-hub install --tool qclaw --apply
ai-memory-hub install --tool openclaw --apply
```

This writes:

```text
%USERPROFILE%\.qclaw\skills\ai-memory-hub\SKILL.md
%USERPROFILE%\.openclaw\skills\ai-memory-hub\SKILL.md
```

For app-style tools where a stable instruction injection point is not yet guaranteed, `install` generates adapter notes under the shared memory directory:

```bash
ai-memory-hub install --tool antigravity --apply
ai-memory-hub install --tool codex-app --apply
ai-memory-hub install --tool marvis --apply
```

These create files such as:

```text
%USERPROFILE%\.ai-memory\tools\antigravity-shared-memory.md
%USERPROFILE%\.ai-memory\tools\codex-app-shared-memory.md
%USERPROFILE%\.ai-memory\tools\marvis-shared-memory.md
```

They are safe adapter notes, not invasive edits to internal app databases or opaque state files.

#### Current Support Matrix

```text
Codex CLI      Direct instruction injection via ~/.codex/AGENTS.md
Claude         Direct instruction injection via ~/.claude/CLAUDE.md
Gemini         Direct instruction injection via ~/.gemini/GEMINI.md
Antigravity    Detected; adapter note generated under ~/.ai-memory/tools
Codex App      Detected; adapter note generated under ~/.ai-memory/tools
Marvis         Detected; adapter note generated under ~/.ai-memory/tools; deeper MCP/knowledgebase integration is not yet verified
QClaw          Installed as a QClaw Skill via ~/.qclaw/skills/ai-memory-hub/SKILL.md
OpenClaw       Installed as an OpenClaw Skill via ~/.openclaw/skills/ai-memory-hub/SKILL.md
CC Switch      Detected; no direct injection yet
```

### Commands

```text
init       Create the shared memory directory and config.
detect     Detect installed AI tools on this machine.
status     Show hub and tool status.
record     Append a local memory event to inbox.
radio      Send, list, and promote cross-agent radio messages.
sync       Index pending inbox events into the local memory ledger.
pull       Rebuild MEMORY.md from the local memory ledger.
backup     Back up MEMORY.md, ledger, inbox, profile, and radio files.
watch      Periodically index pending inbox events.
app        Start the local dashboard app.
install    Show or apply per-tool instruction snippets.
help       Show CLI help.
```

### Safety

The installer defaults to dry-run. Use `--apply` when you want it to edit a tool instruction file.

The project does not copy, read, or centrally manage model tokens from AI tools. Durable memory indexing also skips text that looks like an API key, password, secret, or token.
