# AMH Orca-inspired Agent Execution Roadmap

## Decision

AMH should borrow Orca's execution-console patterns without becoming an Electron IDE. AMH remains the shared control plane for durable memory, tasks, workflows, radio, dispatch, reviews, and cross-tool coordination.

Orca's most relevant ideas are first-class worktrees, explicit agent runtime state, unified activity, follow-up control, unread notifications, and CLI-driven orchestration. The implementation below reuses AMH's existing event streams, sessions, dispatch relay state, isolated worktree metadata, and Dashboard API.

## Target model

```text
Workflow
  └── Task
        └── Agent Session
              ├── Worktree
              ├── Relay / heartbeat
              ├── Radio events
              ├── Commits
              └── Review readiness
```

Task is the durable objective. Agent Session is one concrete execution attempt. Worktree is the execution isolation and review surface. Radio and relay events remain append-only evidence; projections provide the dashboard view.

## Phase 1 — Execution cockpit core (P0)

### Status: implemented (2026-08-03)

The first P0 increment is now live in the AMH Dashboard. Read-only projections
are implemented in `src/dashboard/agent-sessions.js` and
`src/dashboard/worktrees.js`, exposed through `/api/agent-sessions`,
`/api/worktrees`, and additive `agentSessions`/`worktrees` fields on
`/api/dashboard`. The Overview page now renders Agent Cards, a unified
task/relay/dispatch timeline, and worktree review readiness. State projection
distinguishes `working`, `idle`, `blocked`, `waiting_review`, `done`,
`failed`, and `stale`; no cleanup, merge, push, or worktree mutation is
performed by these views.

Verification: projection tests pass, Dashboard build passes, and a real HTTP
smoke test covers all three endpoints.

Goal: turn the Dashboard from a task list into an Agent execution center.

### Agent Session projection

- Project existing `context/sessions.jsonl`, dispatch relay entries, task/workflow links, and heartbeats into a read model.
- Track tool/agent, session ID, task/workflow, project, state, last activity, attempt, progress, error, and completion time.
- Normalize states for display: working, idle, blocked, waiting_review, done, failed, stale.
- Keep machine state and human-facing localized labels separate.

### Worktree projection

- Track worktree ID, path, repo root, branch, base commit, head commit, dirty state, diff summary, reuse flag, and owning session/task.
- Calculate review readiness without deleting or changing worktrees automatically.
- Preserve explicit human approval for cleanup, merge, push, or destructive operations.

### Agent Card and unified timeline

- Add Dashboard Agent Cards showing agent, task, session, worktree, state, recent output, commit, and next action.
- Add a combined timeline for task/workflow/radio/relay/commit/review events.
- Link from Agent Card to the existing Task, Workflow, Radio, Dispatch, and Worktree details.

### Acceptance

- Existing API payloads remain compatible.
- Read models can be rebuilt from existing files/events.
- A stale runner is distinguishable from an idle runner.
- A worktree is never auto-deleted or auto-pushed.
- Dashboard can answer: “What is every agent doing, where is its worktree, and what is blocking merge?”

## Phase 2 — Collaboration controls (P1)

### Status: implemented (2026-08-03)

The collaboration control surface is live through the Dashboard API and CLI:
`/api/agent/follow-up`, `/api/session/follow-up`, `/api/reviews`,
`/api/reviews/request`, `/api/collaboration`, and `/api/unread/read`, plus
`amh agent`, `amh review`, `amh session inspect|follow-up`, and
`amh worktree`. Follow-ups append linked radio events; review requests update
the existing task/workflow projections; unread state is an append-only read
receipt stream. `amh notify execution` bridges terminal/blocked/stale events
to the existing notification bus without duplicating notifications.

Goal: make execution state actionable from AMH.

- Agent follow-up that creates a linked radio/task event.
- Review request and review result linked to task, workflow, session, and worktree.
- Unread state for radio messages, agent completion, blocked state, and review requests.
- Completion/blocked/stale notifications through existing shared radio and optional Feishu/WeCom adapters.
- CLI/MCP commands:

  ```text
  amh agent list|status
  amh session list|inspect|follow-up
  amh worktree list|inspect|snapshot
  amh review request|list
  ```

- Dashboard actions must go through existing approval/policy gates for push, delete, install, and other destructive operations.

## Phase 3 — External execution and companion surfaces (P2)

### Status: implemented as explicit metadata adapters (2026-08-03)

`/api/execution-adapters` and worktree projections expose GitHub issue/PR/check
links, branch and merge-readiness metadata, remote SSH host/path/reconnect
state, and validated port-forward references. These adapters are intentionally
metadata-only: they do not connect, execute remote commands, open tunnels, or
merge/push/delete worktrees. Execution notifications reuse the existing
notification channels and can be delivered through existing adapters.

Goal: extend visibility without moving AMH's source of truth.

- GitHub PR, checks, branch, and merge-readiness links.
- Remote SSH execution/worktree metadata, reconnect state, and port forwarding references.
- Mobile or chat companion for completion, blocked, review, and follow-up notifications.
- Optional browser/design capture for reverse-engineering and UI review workflows.

These are adapters and views, not replacements for AMH's local-first event and memory model.

## Explicitly out of scope for the initial phases

- Electron desktop shell replacement.
- Embedded terminal/PTY and Monaco editor.
- Account switching or provider billing/usage management.
- Copying Orca's persistence format or Zustand store.
- Automatic worktree cleanup, merge, push, or remote execution without policy approval.

## Implementation order

1. Add read-only session/worktree projection modules and tests.
2. Add `/api/agent-sessions` and `/api/worktrees` read endpoints.
3. Add Dashboard Agent Cards and the unified execution timeline.
4. Add follow-up/review/unread controls.
5. Add CLI/MCP surfaces.
6. Add GitHub/SSH/notification adapters only after the core projection is stable.

## Reference

- Orca repository: https://github.com/stablyai/orca
- Orca worktree lifecycle: https://deepwiki.com/stablyai/orca/3.2-worktree-lifecycle-in-the-renderer
- Orca completion and notifications: https://deepwiki.com/stablyai/orca/5.4-agent-completion-and-notifications
