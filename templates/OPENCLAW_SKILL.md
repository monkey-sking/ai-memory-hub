---
name: ai-memory-hub
description: Local shared AI memory hub for OpenClaw. Use when the user mentions AI Memory Hub, shared memory, cross-agent memory, Agent Radio, local memory, shared memory across AI tools, or asks OpenClaw to remember durable preferences/project facts.
version: 0.1.0
metadata: {"category":"memory","keywords":["AI Memory Hub","shared memory","Agent Radio","local ledger","local memory","cross-agent memory"]}
---

# AI Memory Hub

Use the local shared memory directory as the durable cross-assistant memory hub:

```text
{{MEMORY_DIR}}
```

## Shared AI Memory

At the start of a relevant session, read `{{MEMORY_DIR}}/MEMORY.md` if it exists and use it as durable user/project context.

When you learn a durable preference, project fact, workflow rule, or long-lived correction, append one JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl`:

```json
{"source":"openclaw","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}
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
ai-memory-hub task add "short task title" --from openclaw --project <project> --priority normal
ai-memory-hub task claim --id <task-id> --by openclaw
ai-memory-hub task note --id <task-id> "handoff note or progress update" --by openclaw
ai-memory-hub task done --id <task-id> --by openclaw
```

Use task notes for current progress and handoff state. Use durable memory only for long-lived facts and rules.

## Shared Workflows

For multi-agent work with planner, executor, reviewer, and observer roles, prefer workflows over ad hoc tasks:

```bash
ai-memory-hub workflow list --status active
ai-memory-hub workflow create "short workflow title" --from openclaw --project <project> --planner openclaw --executor <tool> --reviewer <tool> --spawn-tasks --notify
ai-memory-hub workflow start --id <workflow-id> --by openclaw
ai-memory-hub workflow result --id <workflow-id> --role executor "execution result" --by openclaw
ai-memory-hub workflow review --id <workflow-id> --role reviewer "review result" --by openclaw
ai-memory-hub workflow signal --id <workflow-id> --to <role-or-tool> "handoff note" --by openclaw
```

Use workflows when multiple tools may act as planner, executor, reviewer, or observer. Use standalone tasks for small single-owner work.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"openclaw","from":"openclaw","to":"all","type":"note","text":"short cross-agent message"}
```

## Commands

```bash
ai-memory-hub status
ai-memory-hub sync
ai-memory-hub backup --reason openclaw
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
  -d "{\"text\":\"Find all PDF invoices in D:\\Documents and convert them to a single Excel file at D:\\Documents\\invoices.xlsx\",\"from\":\"openclaw\",\"project\":\"<project-name>\"}"
```

Marvis will not reply synchronously. It checks radio messages when the user instructs it to. The user will see a Windows desktop notification when your task is queued.

**What to delegate to Marvis:**
- Windows file operations (find, organize, convert, clean up)
- Windows system settings (display, audio, network, power)
- Android app operations (Xiaohongshu, Meituan, Duolingo, WeChat mini-programs, etc.)
- Windows desktop app interactions (CapCut Pro, WeChat PC, Steam games)
- APK/app/game installation and management

**Do NOT delegate to Marvis:** web browsing, web search, code generation, git operations, cloud infrastructure.
