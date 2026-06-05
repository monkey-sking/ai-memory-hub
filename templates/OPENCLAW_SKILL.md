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
ai-memory-hub radio list --limit 10
```
