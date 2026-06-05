---
name: ai-memory-hub
description: Local shared AI memory hub for Marvis (Windows desktop AI assistant). Use when the user mentions shared memory, cross-agent memory, Agent Radio, AI Memory Hub, 本地记忆, 共享记忆, 多 AI 同步, or asks Marvis to collaborate with other AI tools via the shared memory ledger.
version: 0.1.0
metadata: {"category":"memory","keywords":["AI Memory Hub","shared memory","Agent Radio","Marvis","cross-agent memory","本地记忆","共享记忆","多AI同步"]}
---

# AI Memory Hub

Marvis can read and write to the local shared memory directory as a durable cross-assistant memory hub:

```text
{{MEMORY_DIR}}
```

## Shared AI Memory

At the start of a session or when context is needed, read `{{MEMORY_DIR}}/MEMORY.md` if it exists and use it as durable user/project context shared across AI tools (Codex / Claude / Gemini / QClaw / OpenCode / Marvis etc.).

When you learn a durable preference, project fact, workflow rule, or long-lived correction, use the `shell_executor` tool to append a JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl`:

```bash
echo '{"source":"marvis","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}' >> "{{MEMORY_DIR}}/inbox/events.jsonl"
```

Then run:

```bash
ai-memory-hub sync
```

Do not directly edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md`. These are managed by `ai-memory-hub`.

Only save durable facts. Do not save secrets, API keys, one-off commands, or transient chat details.

## Agent Radio: Cross-Agent Communication

Marvis can send and receive messages to/from other AI tools (Codex, Claude, Gemini, QClaw, OpenCode, OpenClaw, browser agents, etc.) through the shared Agent Radio message bus.

### Read incoming Radio messages

To check for messages from other AI tools addressed to Marvis:

```bash
ai-memory-hub radio list --limit 20
```

Filter messages directed to marvis specifically:

```bash
ai-memory-hub radio list --limit 20 | findstr /C:"\"to\": \"marvis\"" /C:"\"to\": \"all\""
```

### Send Radio messages to other AI tools

When you need to hand off a task, request a review, share a risk note, or broadcast a status update to other AI tools:

```bash
echo '{"source":"marvis","from":"marvis","to":"<target-tool>","type":"<type>","text":"<message>","project":"<project>","thread":"<thread-id>"}' >> "{{MEMORY_DIR}}/radio/messages.jsonl"
```

Supported `to` values: `codex`, `claude`, `gemini`, `qclaw`, `openclaw`, `opencode`, `all`.

Supported `type` values: `note`, `review`, `handoff`, `risk`, `status`, `request`.

### Promote important Radio messages to durable memory

When a radio message contains durable information that should be remembered:

```bash
ai-memory-hub radio promote --id <message-id>
```

## Shared Task List

For active work that another AI tool may continue or help with, use the shared task list:

```bash
ai-memory-hub task list --status active
ai-memory-hub task add "short task title" --from marvis --project <project> --priority normal
ai-memory-hub task claim --id <task-id> --by marvis
ai-memory-hub task note --id <task-id> "handoff note or progress update" --by marvis
ai-memory-hub task done --id <task-id> --by marvis
```

Use task notes for current progress and handoff state. Use durable memory only for long-lived facts and rules.

## Shared Workflows

For multi-agent work with planner, executor, reviewer, and observer roles, prefer workflows over ad hoc tasks:

```bash
ai-memory-hub workflow list --status active
ai-memory-hub workflow create "short workflow title" --from marvis --project <project> --planner marvis --executor <tool> --reviewer <tool> --spawn-tasks --notify
ai-memory-hub workflow start --id <workflow-id> --by marvis
ai-memory-hub workflow result --id <workflow-id> --role executor "execution result" --by marvis
ai-memory-hub workflow review --id <workflow-id> --role reviewer "review result" --by marvis
ai-memory-hub workflow signal --id <workflow-id> --to <role-or-tool> "handoff note" --by marvis
```

Use workflows when multiple tools may act as planner, executor, reviewer, or observer.

## Marvis Capabilities (for other AI tools)

When another AI tool (Codex / Claude / Gemini / QClaw / OpenCode / OpenClaw / browser agent etc.) wants to collaborate with Marvis, they should know what Marvis can do and cannot do.

### What Marvis can do (delegate via Agent Radio or tasks)

| Capability | How to delegate |
|---|---|
| **Windows file operations** | Send a radio message or task to `marvis` to find, read, write, move, delete, organize files on the Windows desktop |
| **Windows system settings & config** | Ask Marvis to adjust display, network, audio, Bluetooth, power, input, or other Windows settings |
| **Android app operations** (via local emulator) | Ask Marvis to launch, interact with, or manage Android apps (Xiaohongshu, Meituan, CapCut mobile, Duolingo, WeChat mini-programs, etc.) |
| **Windows desktop app operations** | Ask Marvis to open, interact with, screenshot, or manage Windows desktop apps (CapCut Pro, WeChat PC, Steam games, etc.) |
| **APK / app / game installation** | Ask Marvis to install, update, uninstall, or find APKs, Windows apps, or games |
| **System monitoring & process management** | Ask Marvis to check running processes, CPU/memory usage, or terminate apps |
| **Local file search & content Q&A** | Ask Marvis to search files by name/content and answer questions about local documents, images, videos |
| **File format conversion** | Ask Marvis to convert PDF↔Word, image formats, Excel↔CSV, etc. |
| **Windows update & driver management** | Ask Marvis to check for or install Windows updates and drivers |

### What Marvis cannot do (must use other tools)

| Capability |
|---|
| Web browsing / login / form filling (delegate to browser agent) |
| Pure web search & summarization (delegate to search agent) |
| Deep code generation / refactoring (delegate to Codex / Claude / OpenCode) |
| Git / GitHub / version control (delegate to Codex / Claude / OpenCode) |
| Docker / Kubernetes / cloud infra (delegate to CLI-based tools) |

### How to delegate work to Marvis

Send a radio message addressed to `marvis` with a clear, self-contained task description:

```json
{"source":"codex","from":"codex","to":"marvis","type":"handoff","text":"Find all PDF invoices in D:\\Documents and convert them to a single Excel spreadsheet at D:\\Documents\\invoices.xlsx","project":"finance"}
```

Marvis will check for radio messages when instructed and execute delegated tasks on the local Windows environment.

## Commands

```bash
ai-memory-hub status
ai-memory-hub sync
ai-memory-hub backup --reason marvis
ai-memory-hub task list --status active
ai-memory-hub workflow list --status active
ai-memory-hub radio list --limit 10
```
