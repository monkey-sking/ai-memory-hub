# Actor Model

AI Memory Hub currently stores many targets as short strings such as `codex`,
`claude`, `all`, `dashboard`, or `manual`. This document defines the explicit
actor model those strings represent, so future protocol work does not confuse a
tool, a running session, a human, a workflow role, and a broadcast group.

The current JSON fields remain backward compatible. The model below is the
semantic layer for interpreting and evolving them.

## Actor Types

| Type | Canonical Form | Examples | Meaning |
| --- | --- | --- | --- |
| Tool actor | `tool:<name>` | `tool:codex`, `tool:claude`, `tool:gemini` | A named AI tool or integration identity. May be directly runnable or shared-state-only. |
| Session actor | `session:<tool>:<sessionId>` | `session:claude:abc-123` | A concrete conversation or runner session for one tool. |
| Human actor | `user:<name>` | `user:dashboard`, `user:owner` | A human or UI-originated action. |
| System actor | `system:<name>` | `system:ai-memory-hub`, `system:daemon`, `system:recipe` | Hub-owned automation or generated records. |
| Group actor | `group:<name>` | `group:all`, `group:project:ai-memory-hub` | A broadcast or logical group, not a direct runner target. |
| Role actor | `role:<workflowId>:<role>` | `role:wf123:reviewer` | A workflow role that must resolve to one or more concrete actors. |

Legacy strings map as follows:

- Known runner names such as `codex`, `claude`, `gemini`, `opencode`, or
  `qoder-cn` mean `tool:<name>`.
- Shared-state-only names such as `marvis`, `qclaw`, `openclaw`,
  `codex-app`, and `claude-desktop` still mean tool actors, but dispatch must
  not assume they can be launched directly.
- `all` means `group:all`.
- `dashboard`, `manual`, and `user` mean human actors unless a specific tool
  profile later claims those names.
- `ai-memory-hub`, `daemon`, and `recipe` mean system actors.

## Field Semantics

| Field | Actor Meaning |
| --- | --- |
| `radio.from` | Actor that authored the message. |
| `radio.to` | Intended recipient actor, role, or group. Dispatch only launches concrete runnable tool actors. |
| `task.createdBy` | Actor that created the shared task. |
| `task.assignee` | Actor expected to own the task. Today this should resolve to one tool actor or remain blank. |
| `workflow.planner`, `workflow.executor`, `workflow.reviewer`, `workflow.observer` | Actor lists assigned to workflow roles. |
| `session.createdBy` | Actor that created the handoff session. |
| `session.participants` | Actors involved in the session, not only tool names. |
| `dispatch.tool` | Concrete tool actor selected for one runtime attempt. |
| `threadKey` | Runtime delivery key `{tool}:{project}:{ref}`. The first segment is the concrete target tool actor, not a session id. |

## Resolution Rules

1. Normalize names with the same lowercase kebab-case rules already used for
   tools, projects, and tags.
2. Resolve workflow roles to assigned actor lists before dispatch.
3. Resolve group actors to readable shared state, not direct CLI fanout. A
   broadcast to `group:all` should be read by tools or selectively dispatched
   only after a concrete target is chosen.
4. Dispatch may launch only concrete tool actors whose runner profile is
   runnable. Shared-state-only tool actors receive work through radio, tasks, or
   their own gateway.
5. Session actors are continuity hints. They do not replace the tool actor in a
   dispatch target.
6. Human and system actors may create, approve, reject, or annotate state, but
   they are not dispatch runner targets.

## Message Examples

Legacy radio remains valid:

```json
{
  "from": "codex",
  "to": "gemini",
  "type": "review",
  "thread": "memory-filters-2026-06-10"
}
```

Semantic interpretation:

```json
{
  "fromActor": "tool:codex",
  "toActor": "tool:gemini"
}
```

A dashboard approval:

```json
{
  "fromActor": "user:dashboard",
  "action": "task.review.approved",
  "target": "task:db50b69824a48245"
}
```

A workflow role assignment:

```json
{
  "roleActor": "role:wf123:reviewer",
  "resolvedActors": ["tool:gemini", "tool:claude"]
}
```

## Compatibility Plan

No storage migration is required for the current implementation. Future schema
extensions should add actor-specific fields next to legacy strings:

- `fromActor`
- `toActor`
- `assigneeActor`
- `participantActors`
- `resolvedActors`

The legacy string fields should remain the compact display and CLI form until
all tools understand canonical actor ids.

## Safety Rules

- Do not treat `all` as a direct dispatch target.
- Do not treat `sessionId` as an actor identity.
- Do not assume a detected tool is runnable; check runner profile and
  `sharedStateOnly`.
- Do not use workflow role names as tools until they resolve to concrete actors.
- Preserve unknown actor forms when reading records, so future integrations can
  add provider-specific or gateway-specific actor ids.
