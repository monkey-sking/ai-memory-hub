---
name: ai-memory-hub
description: Local shared AI memory hub for Marvis. Use when checking cross-agent messages, shared tasks, or reading/writing durable memories that other AI tools (Codex / Claude / Gemini / QClaw / OpenCode / OpenClaw) can see.
version: 0.3.0
metadata: {"category":"memory","keywords":["AI Memory Hub","Agent Radio","shared memory","cross-agent","local memory","共享记忆","多AI同步"]}
---

# AI Memory Hub — Marvis Integration

Memory directory: `{{MEMORY_DIR}}`

{{SHARED_SKILL_LAYER}}

## Trigger Model (how Marvis picks up work)

Marvis has no daemon, only request-response. Cross-agent message pickup uses two triggers:

| Trigger | Frequency | Mechanism |
|---|---|---|
| **Scheduled task** | Every 30 min | `create_scheduled_task` with type=interval polls radio + task queue |
| **User message** | On-demand | When the user sends any message, also run a quick radio + task check before responding |

The scheduled task was created once and runs indefinitely. If it ever stops (e.g. session expiry), check it with the user and recreate.

> Historical note: previously tried startup-only check (fake — Marvis can't detect "session open") and Windows toast notification (fake — Marvis can't receive them). The scheduled task approach is the only mechanism that actually works.

## Processing radio messages

When triggered (by scheduled task or user message), run:

```bash
ai-memory-hub radio list --limit 30
```

Filter for messages where `"to"` is `"marvis"` or `"all"`, not yet processed. For each:

- `handoff` / `request`: execute the task using Sub Agents and Tools.
- `review`: read the referenced work and reply.
- `risk` / `status`: acknowledge and act if needed.

After processing, reply via radio:

```bash
echo '{"source":"marvis","from":"marvis","to":"<sender>","type":"status","text":"<result>","thread":"<thread-id>","project":"<project>"}' >> "{{MEMORY_DIR}}/radio/messages.jsonl"
```

If no pending messages, do nothing — don't mention AI Memory Hub to the user.

## Processing shared tasks

When triggered, also check:

```bash
ai-memory-hub task list --status active
```

For tasks where assignee is `marvis` or created-by implies handoff to marvis:

```bash
ai-memory-hub task claim --id <task-id> --by marvis
ai-memory-hub task status --id <task-id> --status in_progress --by marvis
```

On completion:

```bash
ai-memory-hub task done --id <task-id> --by marvis
```

## Writing durable memory

When you learn a durable preference, project fact, or workflow rule:

```bash
echo '{"source":"marvis","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}' >> "{{MEMORY_DIR}}/inbox/events.jsonl"
ai-memory-hub sync
```

Only save durable facts. Never save secrets, API keys, or transient details.

## Other AI tools calling Marvis

Other tools use the HTTP dispatch endpoint:

```bash
curl -s -X POST http://127.0.0.1:38787/api/dispatch/marvis \
  -H "Content-Type: application/json" \
  -d '{"text":"<task description>","from":"<tool>","project":"<project>"}'
```

This writes to radio + task list. Marvis picks it up within 30 minutes max (on next scheduled poll), or immediately if the user sends any message.

## Marvis capabilities (for other tools)

| Can do | Cannot do |
|---|---|
| Windows file ops (find, convert, organize, clean) | Web browsing / login / form filling |
| Windows system settings (display, audio, network) | Pure web search & summarization |
| Android apps via emulator (Xiaohongshu, Meituan) | Deep code generation / refactoring |
| Windows desktop apps (CapCut, WeChat, Steam) | Git / GitHub / version control |
| APK/app/game install & management | Docker / Kubernetes / cloud infra |
| Local doc Q&A, image/video analysis | — |
| File format conversion (PDF↔Word, etc.) | — |

## Quick reference

```bash
ai-memory-hub status
ai-memory-hub sync
ai-memory-hub radio list --limit 20
ai-memory-hub task list --status active
ai-memory-hub task claim --id <id> --by marvis
ai-memory-hub task done --id <id> --by marvis
```
