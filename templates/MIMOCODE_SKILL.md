---
name: ai-memory-hub
description: Local shared AI memory hub for MiMo Code. Use when the user mentions shared memory, cross-agent memory, Agent Radio, local memory, shared memory across AI tools, or asks MiMo Code to remember durable preferences/project facts.
version: 0.1.0
metadata: {"category":"memory","keywords":["shared memory","Agent Radio","local ledger","local memory","cross-agent memory"]}
---

# AI Memory Hub

Use the local shared memory directory as the durable cross-assistant memory hub:

```text
{{MEMORY_DIR}}
```

{{SHARED_SKILL_LAYER}}

## Shared AI Memory

At the start of a relevant session, read `{{MEMORY_DIR}}/MEMORY.md` if it exists and use it as durable user/project context.

When you learn a durable preference, project fact, workflow rule, or long-lived correction, append one JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl`:

```json
{"source":"mimocode","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}
```

Do not edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly. These are managed by `ai-memory-hub`.

After appending a durable memory event, run this when command execution is available:

```bash
ai-memory-hub sync
```

If command execution is not available, the local watcher will index it later.

Only save durable facts. Do not save secrets, API keys, one-off commands, or transient chat details.

## Shared Task List

For active work that another AI tool may continue or help with, use the shared task list:

```bash
ai-memory-hub task list --status active
ai-memory-hub task add "short task title" --from mimocode --project <project> --priority normal
ai-memory-hub task claim --id <task-id> --by mimocode
ai-memory-hub task note --id <task-id> "handoff note or progress update" --by mimocode
ai-memory-hub task done --id <task-id> --by mimocode
```

Use task notes for current progress and handoff state. Use durable memory only for long-lived facts and rules.

## Shared Workflows

For multi-agent work with planner, executor, reviewer, and observer roles, prefer workflows over ad hoc tasks:

```bash
ai-memory-hub workflow list --status active
ai-memory-hub workflow create "short workflow title" --from mimocode --project <project> --planner mimocode --executor <tool> --reviewer <tool> --spawn-tasks
ai-memory-hub workflow start --id <workflow-id> --by mimocode
ai-memory-hub workflow result --id <workflow-id> --role executor "execution result" --by mimocode
ai-memory-hub workflow review --id <workflow-id> --role reviewer "review result" --by mimocode
ai-memory-hub workflow signal --id <workflow-id> --to <role-or-tool> "handoff note" --by mimocode
```

Use workflows when multiple tools may act as planner, executor, reviewer, or observer. Use standalone tasks for small single-owner work.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"mimocode","from":"mimocode","to":"all","type":"note","text":"short cross-agent message"}
```

## Contact Other AI Tools

Use `connect` when you need a specific AI tool to inspect, execute, review, or continue work. It writes a Radio message and can also create an assigned shared task.

```bash
ai-memory-hub connect status
ai-memory-hub connect request --from mimocode --to codex --project <project> --text "please inspect this task" --task
ai-memory-hub connect review --from mimocode --to codex --project <project> --text "please review this change" --task
ai-memory-hub connect handoff --from mimocode --to codex --project <project> --text "handoff context and next step" --task
ai-memory-hub dispatch --to codex --project <project>
ai-memory-hub dispatch --to codex --project <project> --run
```

Use `--run` only for targets with verified CLI runners. Without `--run`, the request remains shared local state until the target tool reads it.

## Commands

```bash
ai-memory-hub status
ai-memory-hub sync
ai-memory-hub backup --reason mimocode
ai-memory-hub task list --status active
ai-memory-hub workflow list --status active
ai-memory-hub radio list --limit 10
```

## Safety

- Keep MiMo Code's own model provider, tokens, and billing configuration separate from AI Memory Hub.
- Do not store MiMo Code API keys, OAuth tokens, or private provider credentials in shared memory.
- Use read-only or ask-first permissions for new projects until the tool has been verified on a small task.
