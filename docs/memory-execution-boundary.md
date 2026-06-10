# Memory And Execution State Boundary

This document defines the boundary between durable memory, collaboration state,
and runtime execution state in AI Memory Hub.

The rule is simple: a fact should become durable memory only when it is useful
outside the immediate task or run. Delivery status, retries, logs, and transient
tool failures should stay in collaboration or execution state unless they are
promoted into a durable lesson or workflow rule.

## State Classes

| Class | Purpose | Storage | Mutation Rules |
| --- | --- | --- | --- |
| Durable memory | Long-lived user preferences, project facts, corrections, workflow rules, and reviewed lessons. | `memories/ledger.jsonl`, `memories/index.json`, `INDEX.md`, `MEMORY.md` | Append through inbox/sync or future memory operations. Do not edit ledger records in place. Derived indexes and snapshots may be rebuilt. |
| Collaboration state | Shared handoffs, tasks, workflow plans, reviews, approvals, and radio messages that coordinate tools. | `radio/messages.jsonl`, `tasks/tasks.jsonl`, `workflows/workflows.jsonl`, sessions, notifications, context packs | May be updated through task/workflow/radio APIs. This is auditable working state, not startup memory by default. |
| Runtime execution state | Dispatch attempts, process results, runner logs, retry timers, daemon status, and queue entries. | `dispatch/queue.jsonl`, `state/relay-status.jsonl`, `state/dispatch-runs.jsonl`, `dispatch-runs/*.log`, `daemon-status.json`, `daemon.pid` | Operational state. It can be retried, compacted, archived, or rebuilt from source events when safe. It must not be treated as durable knowledge. |

## Durable Memory

Durable memory answers: "What should future tools know before they start?"

Examples:

- User preference: do not push without explicit approval.
- Project rule: Claude Code on Windows should use stdin mode with `claude.exe`.
- Correction: a previous implementation note was wrong and superseded.
- Workflow rule: high-risk autonomous tasks need tests and cross-AI review.

Durable memory should not include raw command output, full run logs, or every
task note. If an execution failure teaches a reusable rule, record a short
lesson as a new memory event and link it back to the task or thread through
metadata refs.

## Collaboration State

Collaboration state answers: "What are agents doing together right now?"

Examples:

- A shared task is `claimed`, `blocked`, or `done`.
- A workflow is in planning, execution, review, or delivery.
- A radio message asks another tool to review a diff.
- A task review is approved or rejected from the dashboard.

Collaboration state is allowed to change as work progresses. It can contain
handoff notes, review summaries, and current ownership. It should reference
durable memory when a long-lived rule matters, but it should not copy the full
startup snapshot into each task.

## Runtime Execution State

Runtime execution state answers: "What happened during this run?"

Examples:

- Dispatch run `exitCode`, stdout/stderr paths, duration, and runner command.
- Retry attempt counters and next retry timestamps.
- Daemon heartbeat and active process id.
- Queue item status such as `queued`, `running`, `failed`, or `completed`.

Execution state is not proof that a task is complete. A task is complete only
when collaboration state is updated with verification and review notes. A
dispatch run can fail while the task remains open, or a dispatch run can pass
while the task still needs human approval.

## Promotion Paths

Use explicit promotion instead of mixing state classes:

- Execution to collaboration: summarize a run in a task note, workflow result,
  workflow review, or radio response.
- Collaboration to durable memory: record a reusable lesson, correction,
  preference, or project rule through `record` or inbox events, then `sync`.
- Durable memory to collaboration: use `search`, `snapshot`, or context packs to
  pull relevant rules into the active task or workflow.

Promotion should be short and selective. Full logs remain in execution storage;
the promoted summary captures the lesson or decision.

## Boundary Examples

| Event | Correct Class | Reason |
| --- | --- | --- |
| "User allowed local commits tonight but no push or deletion." | Durable memory if it should persist beyond the session; collaboration note if only for one run. | Guardrail affects future autonomous behavior. |
| "Gemini returned PASS for thread X." | Collaboration state. | It verifies a specific task; not generally useful as startup memory. |
| "`node --test` failed with assertion Y." | Runtime execution state, plus collaboration note if it blocks the task. | Raw failure details belong to logs; task state records impact. |
| "On Windows, prefer `.cmd` shims or `node src/index.js` over `.ps1`." | Durable memory. | Reusable workflow correction. |
| "Daemon pid is 1234." | Runtime execution state. | Process-local and expires quickly. |

## Anti-Patterns

- Writing dispatch stdout/stderr directly into `MEMORY.md`.
- Marking a task done only because a dispatch process exited with code 0.
- Editing `memories/ledger.jsonl` to correct a task or workflow status.
- Storing secrets, access tokens, or raw provider credentials in any memory or
  collaboration file.
- Using `state/dispatch-runs.jsonl` as the source of truth for review approval.
- Treating a stale task handoff as a durable project fact without a reviewed
  memory event.

## Implementation Rules

- `sync` and `index` rebuild durable memory outputs from the ledger and optional
  future operation overlays.
- `task`, `workflow`, and `radio` commands own collaboration state.
- `dispatch`, `queue`, and `daemon` commands own runtime execution state.
- Cross-class links should use ids and refs, not copied blobs.
- Deletion or destructive cleanup requires explicit user approval and backups.

This boundary keeps the hub useful for multi-agent coordination without letting
temporary execution noise become long-term memory.
