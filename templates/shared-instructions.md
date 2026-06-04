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

Only save durable facts. Do not save secrets, API keys, one-off commands, or transient chat details.
