## Shared AI Memory

Use `{{MEMORY_DIR}}/MEMORY.md` as the shared durable memory snapshot.

Append durable memory events to `{{MEMORY_DIR}}/inbox/events.jsonl` as JSONL. Never store secrets, tokens, or short-lived chat details.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"{{TOOL}}","from":"{{TOOL}}","to":"all","type":"note","text":"short cross-agent message"}
```
