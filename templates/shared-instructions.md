# Shared AI Memory

Use the local shared memory directory as the durable cross-assistant memory hub:

```text
{{MEMORY_DIR}}
```

At the start of a session, read `{{MEMORY_DIR}}/MEMORY.md` if it exists and use it as durable user/project context.

When you learn a durable preference, project fact, workflow rule, or long-lived correction, append a JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl` with this shape:

```json
{"source":"{{TOOL}}","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}
```

Do not edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly. After appending a durable memory event, run `ai-memory-hub sync` when command execution is available. If not, the local watcher will index it later.

Only save durable facts. Do not save secrets, API keys, one-off commands, or transient chat details.

## Shared Task List

For shared work tracking, check and update the local task list:

```bash
ai-memory-hub task list --status active
ai-memory-hub task add "short task title" --from {{TOOL}} --project <project> --priority normal
ai-memory-hub task claim --id <task-id> --by {{TOOL}}
ai-memory-hub task note --id <task-id> "handoff note or progress update" --by {{TOOL}}
ai-memory-hub task done --id <task-id> --by {{TOOL}}
```

Use tasks for active handoff state. Use durable memory only for long-lived facts and rules.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"{{TOOL}}","from":"{{TOOL}}","to":"all","type":"note","text":"short cross-agent message"}
```
