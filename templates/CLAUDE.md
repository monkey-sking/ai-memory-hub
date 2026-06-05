## Shared AI Memory

Read `{{MEMORY_DIR}}/MEMORY.md` for durable cross-assistant context.

When a durable preference, workflow rule, or project fact should be remembered, append a JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl`. Do not store secrets.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"{{TOOL}}","from":"{{TOOL}}","to":"all","type":"note","text":"short cross-agent message"}
```
