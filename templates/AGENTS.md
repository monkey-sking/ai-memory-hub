## Shared AI Memory

Read the shared memory snapshot at `{{MEMORY_DIR}}/MEMORY.md` when available.

For durable memories, append JSONL events to `{{MEMORY_DIR}}/inbox/events.jsonl`. Do not save secrets or transient details.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"{{TOOL}}","from":"{{TOOL}}","to":"all","type":"note","text":"short cross-agent message"}
```
