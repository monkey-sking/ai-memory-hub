## Shared AI Memory

Use `{{MEMORY_DIR}}/MEMORY.md` as the shared durable memory snapshot.

Append durable memory events to `{{MEMORY_DIR}}/inbox/events.jsonl` as JSONL. Do not edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly.

After appending a durable memory event, run `ai-memory-hub sync` when command execution is available. If not, the local watcher will index it later. Never store secrets, tokens, or short-lived chat details.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"{{TOOL}}","from":"{{TOOL}}","to":"all","type":"note","text":"short cross-agent message"}
```
