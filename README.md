# ai-memory-hub

Language: [中文](#中文说明) | [English](#english)

## 中文说明

`ai-memory-hub` 让多个 AI 助手共用一个本地记忆目录，同时每个助手继续使用自己的模型 Token、服务商和计费账户。

它包含两个部分：

- 用于自动化、安装指令片段和同步任务的 CLI。
- 用于查看记忆、已检测 AI 应用、待同步事件和 Mem0 状态的本地 Dashboard 应用。

它不会代理 LLM 请求。Claude、Codex、Gemini、QClaw、OpenClaw 等工具继续使用各自的凭据。共享的只有本地目录：

```text
~/.ai-memory/
  profile.md
  MEMORY.md
  inbox/
  synced/
  memories/
  tools/
  state/
```

本地同步命令可以把 `inbox/` 里的新记忆事件推送到 Mem0，也可以把 Mem0 中的记忆拉回本地 `MEMORY.md`。

项目还内置了 Agent Radio 消息总线，用于不同 Agent 之间的交接、审查请求、风险提示和状态更新。这个功能在 `ai-memory-hub` 内部实现，不依赖 h5i。

### 为什么做这个项目

大多数 AI 工具都有各自独立的本地记忆系统。这个项目提供一个中立的共享位置，让每个工具都可以读写。Mem0 作为共享记忆的云端后端，但只有同步进程需要 Mem0 Key。

### 快速开始

```bash
npm install -g .
ai-memory-hub init
ai-memory-hub detect
ai-memory-hub status
```

记录一条记忆事件：

```bash
ai-memory-hub record "User prefers concise Chinese explanations." --source codex
```

把本地待处理记忆事件同步到 Mem0：

```bash
ai-memory-hub sync
```

把 Mem0 记忆拉取到本地共享快照：

```bash
ai-memory-hub pull
```

运行一个长期 watcher，定时把本地 inbox 事件同步到 Mem0：

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

- 显示 Mem0 连接状态。
- 显示共享记忆目录。
- 显示本地待同步记忆事件。
- 记录新的长期记忆事件。
- 发送和查看 Agent Radio 消息。
- 触发 `sync` 和 `pull`。
- 检测已安装的 AI 工具和应用。

### Mem0

同步命令会读取常规 Mem0 CLI 配置中的凭据：

```text
~/.mem0/config.json
```

可以通过下面的命令创建该配置：

```bash
mem0 init --agent
```

也可以使用你自己的账户：

```bash
mem0 init --api-key m0-xxx --user-id your-user-id
```

AI 工具不需要 Mem0 Key。它们只需要通过指令或 hook 读取和写入 `~/.ai-memory`。

每个 AI 工具保留自己的模型凭据。例如：

- Codex 继续使用自己的 Codex/OpenAI/自定义服务商 Token。
- Claude 继续使用自己的 Anthropic 或兼容服务商 Token。
- Gemini 和 Antigravity 继续使用自己的 OAuth/API 凭据。
- QClaw/OpenClaw 继续使用自己的服务商或账户配置。

Mem0 只是同步进程使用的共享记忆后端。

### Agent Radio

Agent Radio 是 `ai-memory-hub` 管理的本地跨 Agent 消息总线。

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

把重要的 radio 消息提升为记忆 inbox 事件：

```bash
ai-memory-hub radio promote --id <message-id>
ai-memory-hub sync
```

提升操作会把 radio 消息复制到：

```text
~/.ai-memory/inbox/events.jsonl
```

之后普通的 `sync` 命令会把它发送到 Mem0。

### AI 助手集成模型

推荐集成方式：

1. 在每个 AI 助手的本地指令文件中加入一小段说明。
2. 要求助手在会话开始时读取 `~/.ai-memory/MEMORY.md`。
3. 要求助手把长期记忆事件追加到 `~/.ai-memory/inbox/`。
4. 手动、通过计划任务或以 daemon 方式运行 `ai-memory-hub sync`。

这种方式可以保持每个助手的模型 Token 相互独立。

### 配置 AI 工具

使用 `install` 可以把共享记忆指令注入到支持的工具里。它不会把 Mem0 Key 写入这些工具，也不会修改它们的模型服务商配置。

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

注入的指令会要求助手读取：

```text
%USERPROFILE%\.ai-memory\MEMORY.md
```

并把长期记忆事件追加到：

```text
%USERPROFILE%\.ai-memory\inbox\events.jsonl
```

它也会要求助手使用 Agent Radio 处理跨 Agent 消息：

```text
%USERPROFILE%\.ai-memory\radio\messages.jsonl
```

对于还没有稳定指令注入点的 App 类型工具，`install` 会在共享记忆目录下生成安全的适配说明：

```bash
ai-memory-hub install --tool antigravity --apply
ai-memory-hub install --tool qclaw --apply
ai-memory-hub install --tool openclaw --apply
ai-memory-hub install --tool codex-app --apply
```

这些命令会创建类似下面的文件：

```text
%USERPROFILE%\.ai-memory\tools\antigravity-shared-memory.md
%USERPROFILE%\.ai-memory\tools\qclaw-shared-memory.md
%USERPROFILE%\.ai-memory\tools\openclaw-shared-memory.md
%USERPROFILE%\.ai-memory\tools\codex-app-shared-memory.md
```

这些是安全的适配说明，不会侵入式修改内部 App 数据库或不透明状态文件。

#### 当前支持矩阵

```text
Codex CLI      通过 ~/.codex/AGENTS.md 直接注入指令
Claude         通过 ~/.claude/CLAUDE.md 直接注入指令
Gemini         通过 ~/.gemini/GEMINI.md 直接注入指令
Antigravity    已检测；在 ~/.ai-memory/tools 下生成适配说明
Codex App      已检测；在 ~/.ai-memory/tools 下生成适配说明
QClaw          已检测；在 ~/.ai-memory/tools 下生成适配说明
OpenClaw       已检测；在 ~/.ai-memory/tools 下生成适配说明
CC Switch      已检测；暂未直接注入
```

### 已检测应用

检测器会检查下面这些本地状态或配置目录：

- Codex CLI 和 Codex App 状态
- Claude
- Gemini
- Antigravity
- Antigravity Cockpit
- Gemini Antigravity 状态
- QClaw
- OpenClaw
- CC Switch

检测过程刻意保持非侵入式：它只报告本地 App 状态，不读取或复制模型 Token。

### 命令

```text
init       创建共享记忆目录和配置。
detect     检测当前机器上安装的 AI 工具。
status     显示 memory hub 和 Mem0 状态。
record     向 inbox 追加一条本地记忆事件。
radio      发送、列出和提升跨 Agent radio 消息。
sync       把待处理 inbox 事件推送到 Mem0。
pull       把 Mem0 记忆拉取到本地 MEMORY.md。
watch      定时同步待处理 inbox 事件到 Mem0。
app        启动本地 Dashboard 应用。
install    显示或应用每个工具的指令片段。
help       显示 CLI 帮助。
```

### 安全性

安装器默认是 dry-run。只有加上 `--apply` 时，才会编辑工具的指令文件。

项目不会把 Mem0 API Key 复制到助手配置里。Key 会保留在 Mem0 CLI 配置中，或者你为同步进程配置的其他位置。

## English

`ai-memory-hub` gives multiple AI assistants one shared local memory directory while letting every assistant keep its own model token, provider, and billing.

It includes both:

- A CLI for automation, install snippets, and sync jobs.
- A local dashboard app for inspecting memory, detected AI apps, pending inbox items, and Mem0 sync status.

It does not proxy LLM traffic. Claude, Codex, Gemini, QClaw, OpenClaw, and similar tools continue to use their own credentials. The only shared part is a local directory:

```text
~/.ai-memory/
  profile.md
  MEMORY.md
  inbox/
  synced/
  memories/
  tools/
  state/
```

A local sync command can push new memory events from `inbox/` to Mem0 and pull Mem0 memories back into `MEMORY.md`.

It also includes a built-in Agent Radio message bus for cross-agent handoffs, reviews, risk notes, and status updates. This is implemented inside `ai-memory-hub`; it does not depend on h5i.

### Why

Most AI tools have separate local memory systems. This project creates a neutral place that each tool can read from and write to. Mem0 becomes the cloud backend for that shared memory, but only the sync process needs the Mem0 key.

### Quick Start

```bash
npm install -g .
ai-memory-hub init
ai-memory-hub detect
ai-memory-hub status
```

Record a memory event:

```bash
ai-memory-hub record "User prefers concise Chinese explanations." --source codex
```

Sync pending local memory events to Mem0:

```bash
ai-memory-hub sync
```

Pull Mem0 memories into the local shared snapshot:

```bash
ai-memory-hub pull
```

Run a long-lived watcher that syncs new local inbox events to Mem0:

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

- Show Mem0 connection status.
- Show the shared memory directory.
- Show pending local memory events.
- Record new durable memory events.
- Send and inspect Agent Radio messages.
- Trigger `sync` and `pull`.
- Detect installed AI tools and apps.

### Mem0

The sync command reads Mem0 credentials from the normal Mem0 CLI config:

```text
~/.mem0/config.json
```

You can create that config with:

```bash
mem0 init --agent
```

or use your own account:

```bash
mem0 init --api-key m0-xxx --user-id your-user-id
```

AI tools do not need the Mem0 key. They only need instructions or hooks that read and write `~/.ai-memory`.

Each AI tool keeps its own model credentials. For example:

- Codex keeps using its own Codex/OpenAI/custom provider token.
- Claude keeps using its own Anthropic or compatible provider token.
- Gemini and Antigravity keep using their own OAuth/API credentials.
- QClaw/OpenClaw keep using their own provider/account setup.

Mem0 is only the shared memory backend used by the sync process.

### Agent Radio

Agent Radio is a local cross-agent message bus owned by `ai-memory-hub`.

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

Promote an important radio message into the memory inbox:

```bash
ai-memory-hub radio promote --id <message-id>
ai-memory-hub sync
```

Promotion copies the radio message into:

```text
~/.ai-memory/inbox/events.jsonl
```

Then the normal `sync` command sends it to Mem0.

### Assistant Integration Model

The recommended integration is:

1. Add a short instruction to each assistant's local instruction file.
2. Ask the assistant to read `~/.ai-memory/MEMORY.md` at session start.
3. Ask the assistant to append durable memory events to `~/.ai-memory/inbox/`.
4. Run `ai-memory-hub sync` manually, from a scheduler, or as a daemon.

This keeps each assistant's model token independent.

### Configure AI Tools

Use `install` to inject shared-memory instructions into supported tools. This does not write Mem0 keys into those tools and does not change their model provider configuration.

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

The injected instruction tells the assistant to read:

```text
%USERPROFILE%\.ai-memory\MEMORY.md
```

and append durable memory events to:

```text
%USERPROFILE%\.ai-memory\inbox\events.jsonl
```

It also tells the assistant to use Agent Radio for cross-agent messages:

```text
%USERPROFILE%\.ai-memory\radio\messages.jsonl
```

For app-style tools where a stable instruction injection point is not yet guaranteed, `install` generates adapter notes under the shared memory directory:

```bash
ai-memory-hub install --tool antigravity --apply
ai-memory-hub install --tool qclaw --apply
ai-memory-hub install --tool openclaw --apply
ai-memory-hub install --tool codex-app --apply
```

These create files such as:

```text
%USERPROFILE%\.ai-memory\tools\antigravity-shared-memory.md
%USERPROFILE%\.ai-memory\tools\qclaw-shared-memory.md
%USERPROFILE%\.ai-memory\tools\openclaw-shared-memory.md
%USERPROFILE%\.ai-memory\tools\codex-app-shared-memory.md
```

They are safe adapter notes, not invasive edits to internal app databases or opaque state files.

#### Current Support Matrix

```text
Codex CLI      Direct instruction injection via ~/.codex/AGENTS.md
Claude         Direct instruction injection via ~/.claude/CLAUDE.md
Gemini         Direct instruction injection via ~/.gemini/GEMINI.md
Antigravity    Detected; adapter note generated under ~/.ai-memory/tools
Codex App      Detected; adapter note generated under ~/.ai-memory/tools
QClaw          Detected; adapter note generated under ~/.ai-memory/tools
OpenClaw       Detected; adapter note generated under ~/.ai-memory/tools
CC Switch      Detected; no direct injection yet
```

### Detected Apps

The detector checks local state/config directories for:

- Codex CLI and Codex app state
- Claude
- Gemini
- Antigravity
- Antigravity Cockpit
- Gemini Antigravity state
- QClaw
- OpenClaw
- CC Switch

Detection is intentionally non-invasive: it reports local app state and does not read or copy model tokens.

### Commands

```text
init       Create the shared memory directory and config.
detect     Detect installed AI tools on this machine.
status     Show memory hub and Mem0 status.
record     Append a local memory event to inbox.
radio      Send, list, and promote cross-agent radio messages.
sync       Push pending inbox events to Mem0.
pull       Pull Mem0 memories into local MEMORY.md.
watch      Periodically sync pending inbox events to Mem0.
app        Start the local dashboard app.
install    Show or apply per-tool instruction snippets.
help       Show CLI help.
```

### Safety

The installer defaults to dry-run. Use `--apply` when you want it to edit a tool instruction file.

The project does not copy Mem0 API keys into assistant configs. The key remains in the Mem0 CLI config or whatever location you configure for the sync process.
