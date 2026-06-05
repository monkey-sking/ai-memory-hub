## Shared AI Memory

Read the shared memory snapshot at `{{MEMORY_DIR}}/MEMORY.md` when available.

For durable memories, append JSONL events to `{{MEMORY_DIR}}/inbox/events.jsonl`. Do not edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly.

After appending a durable memory event, run `ai-memory-hub sync` when command execution is available. If not, the local watcher will index it later. Do not save secrets or transient details.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"{{TOOL}}","from":"{{TOOL}}","to":"all","type":"note","text":"short cross-agent message"}
```
