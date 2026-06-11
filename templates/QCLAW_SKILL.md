---
name: ai-memory-hub
description: Local shared AI memory hub for QClaw. Use when the user mentions AI Memory Hub, shared memory, cross-agent memory, Agent Radio, 本地记忆, 共享记忆, 多 AI 同步, or asks QClaw to remember durable preferences/project facts across AI tools.
version: 0.1.0
metadata: {"category":"memory","keywords":["AI Memory Hub","shared memory","Agent Radio","local ledger","本地记忆","共享记忆","多AI同步"]}
---

# AI Memory Hub

Use the local shared memory directory as the durable cross-assistant memory hub:

```text
{{MEMORY_DIR}}
```

{{SHARED_SKILL_LAYER}}

## Shared AI Memory

At the start of a relevant session, read `{{MEMORY_DIR}}/MEMORY.md` if it exists and use it as durable user/project context.

When you learn a durable preference, project fact, workflow rule, or long-lived correction, append one JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl`:

```json
{"source":"qclaw","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}
```

Do not edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly. These are managed by `ai-memory-hub`.

After appending a durable memory event, run this when command execution is available:

```bash
ai-memory-hub sync
```

If command execution is not available, the local watcher will index the event later.

Only save durable facts. Do not save secrets, API keys, one-off commands, or transient chat details.

## Shared Task List

For active work that another AI tool may continue or help with, use the shared task list:

```bash
ai-memory-hub task list --status active
ai-memory-hub task add "short task title" --from qclaw --project <project> --priority normal
ai-memory-hub task claim --id <task-id> --by qclaw
ai-memory-hub task note --id <task-id> "handoff note or progress update" --by qclaw
ai-memory-hub task done --id <task-id> --by qclaw
```

Use task notes for current progress and handoff state. Use durable memory only for long-lived facts and rules.

## Shared Workflows

For multi-agent work with planner, executor, reviewer, and observer roles, prefer workflows over ad hoc tasks:

```bash
ai-memory-hub workflow list --status active
ai-memory-hub workflow create "short workflow title" --from qclaw --project <project> --planner qclaw --executor <tool> --reviewer <tool> --spawn-tasks
ai-memory-hub workflow start --id <workflow-id> --by qclaw
ai-memory-hub workflow result --id <workflow-id> --role executor "execution result" --by qclaw
ai-memory-hub workflow review --id <workflow-id> --role reviewer "review result" --by qclaw
ai-memory-hub workflow signal --id <workflow-id> --to <role-or-tool> "handoff note" --by qclaw
```

Use workflows when multiple tools may act as planner, executor, reviewer, or observer. Use standalone tasks for small single-owner work.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"qclaw","from":"qclaw","to":"all","type":"note","text":"short cross-agent message"}
```

## Contact Other AI Tools

Use `connect` when you need a specific AI tool to inspect, execute, review, or continue work. It writes a Radio message and can also create an assigned shared task.

```bash
ai-memory-hub connect status
ai-memory-hub connect request --from qclaw --to codex --project <project> --text "please inspect this task" --task
ai-memory-hub connect review --from qclaw --to codex --project <project> --text "please review this change" --task
ai-memory-hub connect handoff --from qclaw --to codex --project <project> --text "handoff context and next step" --task
ai-memory-hub dispatch --to codex --project <project>
ai-memory-hub dispatch --to codex --project <project> --run
```

Use `--run` only for targets with verified CLI runners. Without `--run`, the request remains shared local state until the target tool reads it.

## Commands

```bash
ai-memory-hub status
ai-memory-hub sync
ai-memory-hub backup --reason qclaw
ai-memory-hub task list --status active
ai-memory-hub workflow list --status active
ai-memory-hub radio list --limit 10
```

## Calling Marvis (Windows Desktop AI Assistant)

Marvis is a Windows desktop assistant with access to local files, system settings, Android apps (via emulator), and Windows desktop apps. When you need Marvis to perform a task in the local Windows environment, call its dispatch API.

The AI Memory Hub app server must be running. Start it if needed:

```bash
start /B ai-memory-hub app --port 38787
```

Then send a task to Marvis:

```bash
curl -s -X POST http://127.0.0.1:38787/api/dispatch/marvis ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Find all PDF invoices in D:\\Documents and convert them to a single Excel file at D:\\Documents\\invoices.xlsx\",\"from\":\"qclaw\",\"project\":\"<project-name>\"}"
```

Marvis polls for queued tasks every 30 minutes via scheduled task, or immediately when the user sends any message.

**What to delegate to Marvis:**
- Windows file operations (find, organize, convert, clean up)
- Windows system settings (display, audio, network, power)
- Android app operations (Xiaohongshu, Meituan, Duolingo, WeChat mini-programs, etc.)
- Windows desktop app interactions (CapCut Pro, WeChat PC, Steam games)
- APK/app/game installation and management

**Do NOT delegate to Marvis:** web browsing, web search, code generation, git operations, cloud infrastructure.
