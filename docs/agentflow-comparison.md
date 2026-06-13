# AgentFlow Reference Comparison for AI Memory Hub

This document captures AgentFlow-inspired design context for AI Memory Hub
(AMHD). It is a reference comparison, not a claim that every listed capability
already exists in this repository.

## Summary

AgentFlow appears optimized around managed multi-agent software delivery:
parallel workers, isolated task workspaces, runnable task specs, structured
execution records, repair loops, review gates, and approval surfaces.

AI Memory Hub is a local-first coordination layer for existing AI tools. It is
stronger at cross-tool memory, radio messages, shared tasks, workflow state,
and running inside the user's own machine and accounts. Its roadmap should
borrow AgentFlow's execution discipline without turning AMHD into a hosted
LLM proxy or a replacement for each tool's native account, model, and billing.

## Similarities

| Area | AgentFlow reference | AI Memory Hub direction |
| --- | --- | --- |
| Multi-agent work | Planner, executor, reviewer, observer roles | Workflow roles plus shared task/radio state |
| Task handoff | Structured task specs and worker assignment | JSONL tasks, workflows, dispatch, and task-spec commands |
| Execution tracking | Run records, logs, status, retries | `dispatch-runs`, relay state, status, metrics |
| Review loop | Diff/review/approval before merge | Radio review requests, workflow reviewer role, task notes |
| Failure handling | Repair attempts after failed runs | Bounded dispatch retry and failure guardrails |
| Operational visibility | Task status, logs, queues | CLI status, dashboard, metrics, dispatch status |

## Differences

| Area | AgentFlow | AI Memory Hub |
| --- | --- | --- |
| Control plane | Product-managed orchestration | Local files and CLI commands |
| AI providers | Likely integrated into the platform | Each tool keeps its own model provider and credentials |
| State model | Centralized service state | Local append-only JSONL files plus derived indexes |
| Execution isolation | Dedicated worker workspaces | Optional Git worktrees with `--isolate-worktree`; current main tree remains the default |
| Approval UX | Built-in review and approval surfaces | CLI/dashboard today; Feishu/mobile approval is a planned task |
| Remote execution | Remote nodes or managed runners | Local runners today; remote nodes remain a design target |
| Memory | Execution oriented | Durable memory plus task/workflow/radio context |

## Current AMHD Strengths

- Local-first and account-neutral: AMHD does not read or proxy model tokens.
- Cross-tool coordination: Codex, Claude, Gemini, QClaw, Marvis, and other tools
  can share memory, tasks, radio messages, and workflow state.
- Append-friendly state: JSONL files make recovery, auditing, and manual
  inspection practical.
- Runner diagnostics: `doctor` reports direct runners, shared-state-only tools,
  shim type, prompt mode, and warning normalization.
- Dispatch lifecycle: relay status, retry guardrails, response/status radio
  records, progress heartbeats, and structured run logs are now visible.
- Runnable project commands: `.tasks.json` and `task-spec` provide repeatable
  test/build/check declarations without relying on human memory.

## Current AMHD Gaps

- Isolation is incomplete: most local work still happens in the main working
  tree unless a human or tool manually creates a worktree.
- Review approval is not yet a first-class state transition. PASS notes exist,
  but approve/reject decisions are not consistently modeled as dedicated
  records.
- Diff collection is still mostly Git-driven and manual. Dispatch records point
  to logs, but not always to a normalized diff summary.
- Mobile or Feishu approval is still a backlog task.
- Remote execution nodes are not implemented.
- Some task records created by other tools can claim commits that do not exist
  in the current repository, so completion should be verified against actual
  files, commits, and tests.

## Implementation Roadmap

### 1. Execution Records and Runnable Specs

Status: mostly implemented.

- Keep `state/dispatch-runs.jsonl` as the canonical run history.
- Keep raw stdout/stderr under `dispatch-runs/`.
- Use `.tasks.json` for project-local runnable command declarations.
- Extend task specs only when real project needs appear, such as long-running
  services, port readiness checks, or artifact declarations.

### 2. Isolated Workspaces

Status: implemented as an explicit dispatch/daemon option.

Optional Git worktree allocation per task:

- Create deterministic worktree paths under `.ai-worktrees/` by default.
- Create task branches such as `amh/<tool>/<project>/<ref>`.
- Record worktree path, branch, base commit, current head, dirty status, and
  diff stat in task, relay, and dispatch run state.
- Require explicit review before merging back to the main working tree.
- Never delete worktrees automatically without user approval.

### 3. Diff and Review Gates

Status: partially manual.

Add first-class review records:

- Capture changed file list, diff stat, test summary, and run log references.
- Store approve/reject decisions with reviewer, timestamp, and scope.
- Support "needs changes" without closing the task.
- Mark a task complete only after implementation, verification, and required
  review gates are satisfied.

### 4. Repair Loop

Status: bounded retry guardrails exist; automated repair remains limited.

Recommended flow:

- Detect failed run.
- Link failure to run log paths and task/workflow source.
- Create a bounded repair attempt with a clear reason.
- Re-run declared task specs.
- Stop after configured attempt limits and write a task note.

### 5. Approval Surfaces

Status: backlog.

Expose task review state through dashboard and Feishu/mobile:

- Show task title, owner, branch/worktree, diff summary, run logs, and review
  status.
- Provide approve/reject actions.
- Record the approval back into AMHD task/workflow state.
- Keep destructive actions such as push, delete, reset, or cleanup behind fresh
  explicit approval.

### 6. Remote Nodes

Status: design target.

Remote execution should be added only after local execution state is reliable:

- Register node capabilities and runner profiles.
- Dispatch tasks to nodes based on project, tool, and resource needs.
- Stream run status back into the same relay/run record model.
- Preserve the local-first guarantee: AMHD coordinates work, but does not become
  a shared model credential broker.

## Practical Priority Order

1. Keep structured run logs and task specs stable.
2. Add Git worktree execution for isolated task work.
3. Add normalized diff summaries and review decision records.
4. Add dashboard or Feishu approval for completed work.
5. Add remote worker nodes after local review and recovery are boring.

## Design Guardrails

- Prefer append-only records for shared state.
- Verify task completion against actual files, commits, tests, and review notes.
- Do not treat a radio PASS or task note as sufficient when the referenced commit
  or artifact is missing.
- Keep runner prompts under the user's current guardrails: no push, no deletion,
  no dependency install, and no system configuration changes without fresh
  approval.
- Keep AMHD provider-neutral. Each AI tool should keep its own model provider,
  token, and billing account.
