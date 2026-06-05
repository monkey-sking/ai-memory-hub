## Shared AI Memory

Read `{{MEMORY_DIR}}/MEMORY.md` for durable cross-assistant context.

When a durable preference, workflow rule, or project fact should be remembered, append a JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl` using this exact shape:

```json
{"source":"{{TOOL}}","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}
```

Do not edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly.

After appending a durable memory event, run `ai-memory-hub sync` when command execution is available. If not, the local watcher will index it later. Do not store secrets.

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
