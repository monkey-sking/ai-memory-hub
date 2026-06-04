## Shared AI Memory

Use `{{MEMORY_DIR}}/MEMORY.md` as the shared durable memory snapshot.

Append durable memory events to `{{MEMORY_DIR}}/inbox/events.jsonl` as JSONL. Never store secrets, tokens, or short-lived chat details.
