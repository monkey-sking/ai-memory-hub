# Approval and Review Gates — Design

**Task ID:** TBD  
**Priority:** P0 #3  
**Status:** Design + Implementation  
**Author:** Claude  
**Date:** 2026-06-17

## Problem Statement

From `docs/nocobase-benchmark-optimization.md`:

> NocoBase workflows support human-machine collaboration through manual approval nodes. AMH has review notes, but approval is still too informal.

Current gaps:

1. **Permission policy `ask` decisions have no approval UI** — Phase 3 of the policy layer blocks dispatch with exitCode 451 and logs "approval gate not yet implemented."
2. **Workflow review is append-only text** — no structured approved/rejected/needs_changes state.
3. **Task completion ignores pending approvals** — a task can be marked done even when a required review is missing.
4. **No dashboard UI for approval queues** — reviewers cannot see "things waiting for my approval" in one place.

This blocks:
- **Policy enforcement** — `ask` decisions need a place to go
- **Workflow quality gates** — review-required workflows need explicit approval records
- **Dispatch retry after needs_changes** — no way to resume after human fixes

## Goals

1. **First-class approval gate records** — structured state (requested/approved/rejected/needs_changes/waived) stored in append-only event log.
2. **Integration with policy layer** — when `resolvePermission` returns `ask`, create an approval gate record; dispatch waits until approved/rejected.
3. **Integration with workflow nodes** — workflow nodes in `waiting` status can reference an approval gate.
4. **Dashboard approval queue** — show all pending gates, grouped by reviewer.
5. **CLI approval commands** — create, approve, reject, waive gates from terminal.

## Non-Goals

- **Not replacing workflow reviews** — `workflow.reviews[]` remains for free-text commentary. Gates are for structured decisions.
- **Not a full approval routing engine** — we won't support multi-stage cascading approvals (yet). One gate = one decision.
- **Not automatic approval expiry** — gates can have an optional `expiresAt`, but no automatic cleanup in P0.

## Design

### 1. Data Model

#### 1.1 Approval Gate Event Schema

Append-only event log: `C:\Users\Administrator\.ai-memory\gates\approvals.jsonl`

Each gate event:

```jsonc
{
  "type": "approval.gate",
  "gateId": "abc123...",          // unique gate ID
  "status": "approved",           // requested|approved|rejected|needs_changes|waived
  "scope": "dispatch",            // dispatch|workflow|task|operation|push|delete|install-dependencies
  "actor": "codex",               // who needs approval
  "reviewer": "human",            // who approves (default: "human")
  "project": "ai-memory-hub",     // project context
  "operation": "dispatch",        // POLICY_OPERATIONS value (if scope=dispatch/operation)
  "refId": "radio:abc123",        // reference ID (dispatch job ID, workflow ID, task ID, etc.)
  "refType": "dispatch-job",      // dispatch-job|workflow|task|command
  "reason": "Policy requires approval for codex dispatch",
  "requestedAt": "2026-06-17T10:00:00Z",
  "decidedAt": "2026-06-17T10:05:00Z",  // when approved/rejected/waived (null if pending)
  "decisionNote": "",             // reviewer's comment
  "evidence": [],                 // optional: refs to context (files, diffs, logs)
  "expiresAt": "",                // optional: auto-reject after this time (not enforced in P0)
  "ts": "2026-06-17T10:05:00Z",   // event timestamp
  "isFinal": true                 // true once status is terminal
}
```

**Terminal statuses:** `approved`, `rejected`, `waived`.  
**Active status:** `requested`, `needs_changes`.

#### 1.2 Status Semantics

| Status | Meaning | Is Final |
|--------|---------|----------|
| `requested` | Waiting for approval decision | No |
| `needs_changes` | Reviewer asked for changes, gate remains open | No |
| `approved` | Approved, proceed | Yes |
| `rejected` | Denied, do not proceed | Yes |
| `waived` | Skipped/bypassed by authorized user | Yes |

#### 1.3 Scope Values

- `dispatch` — approving a dispatch job
- `workflow` — approving workflow start/review
- `task` — approving task claim/complete
- `operation` — approving a generic operation (push/delete/install-dependencies)
- `push` / `delete` / `install-dependencies` / etc. — specific operation types

### 2. Storage

**File:** `C:\Users\Administrator\.ai-memory\gates\approvals.jsonl`

**Write pattern:** append-only. Each gate lifecycle = 1 requested event + 1 terminal event (approved/rejected/waived).

**Read pattern:** replay events, group by `gateId`, take most recent event per gate.

### 3. CLI Surface

#### 3.1 Gate Lifecycle Commands

```bash
# Create a gate (usually done by policy layer or workflow commands, not manual)
ai-memory-hub gate request --actor codex --scope dispatch --operation dispatch --ref radio:abc123 --ref-type dispatch-job --reason "Policy requires approval"

# Approve a gate
ai-memory-hub gate approve --id <gateId> --by human --note "Reviewed and approved"

# Reject a gate
ai-memory-hub gate reject --id <gateId> --by human --note "Insufficient context"

# Request changes (keep gate open, actor must retry)
ai-memory-hub gate needs-changes --id <gateId> --by human --note "Fix tests first"

# Waive a gate (authorized override)
ai-memory-hub gate waive --id <gateId> --by human --note "Emergency bypass"
```

#### 3.2 Query Commands

```bash
# List all gates
ai-memory-hub gate list [--status requested] [--actor codex] [--reviewer human]

# Show gate detail
ai-memory-hub gate show --id <gateId>

# List gates pending for a reviewer
ai-memory-hub gate queue --reviewer human
```

### 4. Integration Points

#### 4.1 Policy Layer (dispatch preflight)

When `resolvePermission` returns `decision: "ask"`:

1. Create approval gate: `scope=dispatch`, `operation=dispatch`, `refId=job.id`, `refType=dispatch-job`
2. Block dispatch with exitCode 451, state=`approval-required`, attach `gateId` to relay status
3. Dashboard shows "Pending approval" with link to gate
4. Once gate is `approved`:
   - Dispatch retries automatically (or manual `dispatch retry`)
   - Gate `rejected` → mark job as permanently failed

#### 4.2 Workflow Nodes

Workflow nodes with `status: "waiting"` can reference a gate:

```jsonc
{
  "nodeId": "workflow:abc:approval-gate-1",
  "status": "waiting",
  "waitingOn": "gate:def456",  // approval gate ID
  ...
}
```

Commands:
- `workflow node wait --workflow <id> --node <slug> --gate <gateId>`
- Once gate is `approved` → auto-transition node to `running` (or executor manually calls `workflow node done`)

#### 4.3 Dashboard

New panel: `ApprovalsPanel.tsx`

Shows:
- Pending gates (status=requested|needs_changes)
- Grouped by reviewer
- Each gate shows: actor, scope, operation, reason, requested time
- Actions: Approve / Reject / Needs Changes / Waive

#### 4.4 Task Quality Gates

`workflow done` command checks:
- If workflow has any required approval nodes (`role=approval`)
- If any approval nodes are still `waiting` → check linked gate status
- Block `workflow done` unless all approval gates are `approved|waived`

### 5. Acceptance Criteria

| Criterion | How Met |
|-----------|---------|
| A task cannot be marked complete when a required gate is pending | `workflow done` checks approval node statuses and blocks if any are `waiting` with unapproved gates |
| Dashboard shows review state separately from task notes | `ApprovalsPanel` renders gates as structured cards with approve/reject buttons |
| Dispatch retry/repair can resume from `needs_changes` without closing source | Gate `needs_changes` keeps dispatch job in `approval-required` state; `dispatch retry` re-runs preflight, sees gate is still open, prompts user |

### 6. Implementation Phases

#### Phase 1: Data Layer + CLI

- [ ] Add `C:\Users\Administrator\.ai-memory\gates\approvals.jsonl` event log
- [ ] Add `readApprovalGates(memoryDir, filters)` — replay events, return gate array
- [ ] Add `appendApprovalGateEvent(memoryDir, event)` — append to `approvals.jsonl`
- [ ] CLI: `gate request|approve|reject|needs-changes|waive|list|show|queue`

#### Phase 2: Policy Integration

- [ ] Update `executeDispatch` preflight: when `decision: "ask"`, create gate, attach `gateId` to relay status
- [ ] Add `dispatch retry` gate check: if gate still `requested|needs_changes`, block retry; if `approved`, proceed; if `rejected`, fail permanently
- [ ] Add gate status to dispatch log output

#### Phase 3: Dashboard UI

- [ ] Dashboard API: `GET /api/gates` → return gate list, `POST /api/gates/:id/approve|reject|needs-changes|waive`
- [ ] `ApprovalsPanel.tsx`: render pending gates with approve/reject actions
- [ ] Link from dispatch/workflow panels to approval queue

#### Phase 4: Workflow Integration

- [ ] `workflow node wait --gate <gateId>` attaches gate to node
- [ ] `workflow done` checks approval node gates, blocks if pending
- [ ] Workflow status derivation: if any approval node is `waiting` with pending gate → workflow status = `waiting`

### 7. Open Questions

1. **Who can approve a gate?**  
   **Answer:** P0 scope: only `reviewer: "human"` (default). Later: role-based approval (e.g., `reviewer: "senior-dev"`).

2. **Can a gate be approved by the same actor who requested it?**  
   **Answer:** P0: no validation. P1: add `selfApprovalAllowed` policy flag.

3. **What happens if a gate expires?**  
   **Answer:** P0: `expiresAt` is stored but not enforced. P1: background job auto-rejects expired gates.

4. **Can a gate be re-opened after rejection?**  
   **Answer:** No. Rejections are final. Actor must create a new gate (e.g., retry dispatch after fixes).

### 8. Migration & Backward Compatibility

#### 8.1 Existing Workflows

Workflows without approval nodes continue to work unchanged.

#### 8.2 Policy Layer

Existing policy rules with `decision: "ask"` will start creating gates once Phase 2 is implemented. No migration needed.

#### 8.3 Forward Path

Once gates are working, we can add:
- Expiry enforcement (P1)
- Multi-stage approval chains (P1)
- Approval delegation (P1)
- Approval audit log (P1)

## Summary

Approval gates provide the missing link between policy enforcement, workflow quality gates, and human review. They turn "ask" decisions into structured, queryable, dashboard-visible records that block automated execution until human approval.

**Dependencies:**
- Permission policy layer (P0 #1) — Phase 3 creates gates for `ask` decisions ✅
- Workflow node history (P0 #2) — approval nodes can reference gates ✅

**Blocked by:** None. Can start Phase 1 immediately.
