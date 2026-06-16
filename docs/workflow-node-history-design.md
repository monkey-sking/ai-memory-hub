# Workflow Execution History with Node States — Design

**Task ID:** `66472edaa3d8c2df`  
**Priority:** P0  
**Status:** Design review  
**Author:** Claude (接手 codex)  
**Date:** 2026-06-16

## Problem Statement

AMH workflows track role-based collaboration (planner/executor/reviewer/observer) and high-level status (`open|in_progress|review|blocked|done`), but execution remains opaque:

- **No visibility into execution progress** — you cannot tell whether a workflow is stuck on planning, waiting for executor input, or blocked on review without reading radio messages and task notes.
- **No structured execution graph** — the plan is free text; results and reviews are append-only text arrays. There's no canonical "this node is waiting / this node failed" state machine.
- **Approval gates are informal** — review is tracked via `workflow.reviews[]` text append and radio handoffs. NocoBase's manual-approval node is a first-class waiting state; ours is not.

This blocks **P0-#1 (permission matrix)** and **P0-#2 (approval gates)** because both need a place to record "waiting for permission decision" or "review gate pending" as durable, queryable state.

## Goals

1. **Node-level execution history** — every workflow can record a sequence of execution nodes, each with status (`queued|running|waiting|completed|failed|error|cancelled|rejected`).
2. **Structured progress** — dashboard and CLI can show "where the workflow is stuck" without parsing free-text notes.
3. **Foundation for approval gates** — a `waiting` node naturally represents "waiting for human approval / permission grant / external signal."
4. **Backward compatible** — existing workflows remain valid; node history is opt-in.

## Non-Goals

- **Not replacing the workflow status field** — `workflow.status` remains the top-level summary. Node states feed into it.
- **Not a visual workflow builder** — NocoBase has drag-and-drop. We're adding data primitives; UI can follow.
- **Not automatic plan parsing** — we won't magically infer nodes from free-text plans. Tools must explicitly record nodes.

## Design

### 1. Data Model

#### 1.1 Node Event Schema

Append-only event log: `C:\Users\Administrator\.ai-memory\workflows\nodes.jsonl`

Each node event has this shape:

```jsonc
{
  "type": "workflow.node",
  "workflowId": "66472e...",     // parent workflow
  "nodeId": "66472e...:plan",    // unique within workflow (format: `<workflowId>:<slug>`)
  "slug": "plan",                // short human-readable key (plan|exec|review|approval-gate-1)
  "label": "Planning phase",     // display name
  "role": "planner",             // planner|executor|reviewer|observer|system|approval
  "actor": "codex",              // tool/human who owns this node
  "status": "completed",         // queued|running|waiting|completed|failed|error|cancelled|rejected
  "ts": "2026-06-16T05:00:00Z",
  "createdAt": "2026-06-16T04:58:00Z",
  "startedAt": "2026-06-16T04:58:05Z",
  "completedAt": "2026-06-16T05:00:00Z",
  "input": {                     // optional structured input refs
    "plan": "See workflow.plan",
    "context": ["task:abc123"]
  },
  "output": {                    // optional structured output refs
    "result": "Plan written to workflow.plan",
    "artifacts": ["file://plan.md"]
  },
  "error": "",                   // error message if status=error|failed
  "note": "",                    // free-text progress note
  "isRequired": true,            // if false, workflow can complete without this node
  "isFinal": true                // true once status is terminal (completed|failed|error|cancelled|rejected)
}
```

**Terminal statuses:** `completed`, `failed`, `error`, `cancelled`, `rejected`.  
**Active statuses:** `queued`, `running`, `waiting`.

#### 1.2 Status Semantics

| Status | Meaning | Is Final |
|--------|---------|----------|
| `queued` | Node created but not started | No |
| `running` | Actively executing | No |
| `waiting` | Blocked on external input (approval, permission, signal) | No |
| `completed` | Succeeded | Yes |
| `failed` | Failed with retryable error | Yes |
| `error` | Failed with non-retryable error | Yes |
| `cancelled` | User-cancelled before completion | Yes |
| `rejected` | Review rejected / approval denied | Yes |

#### 1.3 Node ID Convention

`nodeId = <workflowId>:<slug>`

- `slug` must be unique within a workflow.
- Common slugs: `plan`, `exec`, `review`, `approval-gate-<N>`, `verify`, `deploy`.

### 2. Storage

**File:** `C:\Users\Administrator\.ai-memory\workflows\nodes.jsonl`

**Write pattern:** append-only. Each node lifecycle generates multiple events (one per status transition).

**Read pattern:** replay events, group by `nodeId`, take the most recent event per node. The most recent event's `status` is the current node status.

**Projection:** `C:\Users\Administrator\.ai-memory\workflows\nodes-projection.jsonl` (optional; can rebuild from events).

### 3. CLI Surface

#### 3.1 Node Lifecycle Commands

```bash
# Create a new node (status=queued by default)
ai-memory-hub workflow node add --workflow <id> --slug plan --label "Planning phase" --role planner --actor codex --required

# Start a node (queued → running)
ai-memory-hub workflow node start --workflow <id> --node <nodeId|slug>

# Mark node as waiting (running → waiting)
ai-memory-hub workflow node wait --workflow <id> --node <nodeId|slug> --note "Waiting for approval"

# Complete a node (running|waiting → completed)
ai-memory-hub workflow node done --workflow <id> --node <nodeId|slug> --output '{"result":"Plan written"}'

# Fail a node (running → failed|error)
ai-memory-hub workflow node fail --workflow <id> --node <nodeId|slug> --error "Timeout" [--retryable]

# Cancel a node (any active → cancelled)
ai-memory-hub workflow node cancel --workflow <id> --node <nodeId|slug>

# Reject a node (waiting → rejected; for approval gates)
ai-memory-hub workflow node reject --workflow <id> --node <nodeId|slug> --note "Design needs revision"
```

#### 3.2 Query Commands

```bash
# List nodes for a workflow
ai-memory-hub workflow node list --workflow <id>

# Show node detail
ai-memory-hub workflow node show --workflow <id> --node <nodeId|slug>

# Show workflow graph summary (ASCII tree of node statuses)
ai-memory-hub workflow graph --id <id>
```

### 4. Workflow Status Derivation Rules

Today: `workflow.status` is set manually via `workflow start|done` commands.

**After node history:** `workflow.status` can be **derived** from node states:

| Workflow Status | Condition |
|-----------------|-----------|
| `open` | No nodes yet, or all nodes are `queued` |
| `in_progress` | At least one node is `running` |
| `waiting` | At least one node is `waiting`, none `running` |
| `review` | All required exec nodes done, at least one review node pending |
| `blocked` | At least one required node is `failed|error|rejected`, none `running|waiting` |
| `done` | All required nodes are `completed` |
| `cancelled` | Workflow explicitly cancelled, or all nodes cancelled |

**Migration:** Existing workflows without node history keep their manually-set status. Only workflows with node events use derived status.

### 5. Integration Points

#### 5.1 Dispatch

When `dispatch` spawns a workflow:

1. Create workflow record
2. Create node events for planner/executor/reviewer (if assigned)
3. Set planner node → `running`, others → `queued`

#### 5.2 Workflow Result/Review Commands

- `workflow result` appends to `workflow.results[]` **and** marks the executor node → `completed`
- `workflow review` appends to `workflow.reviews[]` **and** marks the reviewer node → `completed` or `rejected`

#### 5.3 Dashboard

`WorkflowsPanel.tsx` gains a new section:

```tsx
<Card>
  <CardHeader>Execution Graph</CardHeader>
  <CardContent>
    {nodes.map(node => (
      <div key={node.nodeId} className="flex items-center gap-2">
        <Badge variant={statusVariant(node.status)}>{node.status}</Badge>
        <span>{node.label}</span>
        <span className="text-muted-foreground">{node.actor}</span>
      </div>
    ))}
  </CardContent>
</Card>
```

### 6. Acceptance Criteria (from nocobase-benchmark-optimization.md)

| Criterion | How Met |
|-----------|---------|
| "A workflow can show where it is stuck without reading radio/task notes" | `workflow graph --id <id>` and dashboard render node statuses directly |
| "Waiting human approval and rejected review are explicit states" | `waiting` and `rejected` are first-class node statuses |
| "Failed configuration, runtime error, cancellation, and review rejection are distinguishable" | Separate statuses: `failed` (retryable), `error` (config/fatal), `cancelled`, `rejected` (review denial) |
| "Completion requires all required nodes to reach completed" | Workflow status derivation rule: `done` iff all `isRequired=true` nodes are `completed` |

### 7. Migration & Backward Compatibility

#### 7.1 Old Workflows

Workflows created before this feature have no node events. They continue to work:

- `workflow.status` is read as-is
- CLI and dashboard show "No execution graph available" or infer a single implicit node from status

#### 7.2 Opt-In

Tools must explicitly call `workflow node add` to start recording node history. The feature is **opt-in by design** — no automatic migration.

#### 7.3 Forward Path

Once P0-#2 (approval gates) is implemented, `dispatch` and `workflow create --spawn-tasks` can automatically create approval gate nodes when `qualityGate.reviewRequired=true`.

### 8. Implementation Phases

> **Status: All phases (1-5) implemented and verified. Commits:**
> - Phase 1: data layer + CLI
> - Phase 2: dashboard integration
> - Phase 3: command integration
> - Phase 4: dispatch/creation integration
> - Phase 5: status derivation

#### Phase 1: Data Layer (MVP for acceptance) ✅

- [x] Add `readWorkflowNodes(memoryDir, workflowId)` — replay events, return current node array
- [x] Add `appendWorkflowNodeEvent(memoryDir, event)` — append to `nodes.jsonl`
- [x] CLI: `workflow node add|start|wait|done|fail|cancel|reject`
- [x] CLI: `workflow node list|show`
- [x] Add `deriveWorkflowStatusFromNodes(nodes)` helper

#### Phase 2: Dashboard Integration ✅

- [x] Dashboard API: `GET /api/workflows/:id/nodes` → return node array
- [x] `WorkflowsPanel.tsx`: add expandable "Execution Graph" section
- [x] Render node status badges with status icons (✓ ✗ ⊗ ⊘ ▶ ⏸ ◦)

#### Phase 3: Workflow Commands Integration ✅

- [x] `workflow result --role executor` auto-marks executor node → `completed`
- [x] `workflow review --role reviewer` auto-marks reviewer node → `completed|rejected`
      (rejection detected via keywords: reject/block/fail/不通过/拒绝/驳回)
- [x] `workflow done` checks node states, errors if required nodes not completed

#### Phase 4: Dispatch Integration ✅

- [x] `autoCreateWorkflowNodes` creates planner/executor/reviewer nodes on workflow creation
      (wired into both `workflowCreateCommand` and `createWorkflowFromRecipe`)
- [x] Set planner node → `running`, others → `queued`

#### Phase 5: Status Derivation (opt-in) ✅

- [x] Add `usesDerivedStatus` + `derivedStatus` fields (normalized + persisted)
- [x] CLI: `workflow status --auto` switches a workflow to derived-status mode
- [x] Once opted in, `workflow.status` is always recomputed from nodes on read
      (manual status changes are blocked with a clear error)
- [x] Performance: `readWorkflowNodesByWorkflow` reads nodes.jsonl once per `readWorkflows`

### 9. Open Questions

1. **Should we store the projection (`nodes-projection.jsonl`) or always replay?**  
   **Answer:** Start with replay-only (simpler). Add projection if performance becomes an issue (unlikely with <1000 nodes per workflow).

2. **Can a workflow have multiple nodes with the same role?**  
   **Answer:** Yes. `role` is a category; `nodeId` is the unique key. Example: `approval-gate-1` and `approval-gate-2` both have `role=approval`.

3. **What if a tool calls `workflow node done` twice for the same node?**  
   **Answer:** Append the event anyway. Read logic takes the most recent. Idempotent.

4. **Should node events be scoped per-workflow (separate file per workflow)?**  
   **Answer:** No. Single append-only `workflows/nodes.jsonl` for all workflows, filter by `workflowId` on read. Consistent with `tasks/events.jsonl` pattern.

5. **Do we need node dependencies / DAG edges?**  
   **Answer:** Not in P0. NocoBase has a visual graph editor that records edges. We can add `node.dependencies: [nodeId]` later if dispatch needs it.

### 10. Example Usage

```bash
# Dispatcher spawns a workflow
ai-memory-hub workflow create "Build feature X" --planner codex --executor claude --reviewer gemini --spawn-tasks

# Dispatcher creates nodes
ai-memory-hub workflow node add --workflow abc123 --slug plan --role planner --actor codex --required
ai-memory-hub workflow node add --workflow abc123 --slug exec --role executor --actor claude --required
ai-memory-hub workflow node add --workflow abc123 --slug review --role reviewer --actor gemini --required

# Planner starts
ai-memory-hub workflow node start --workflow abc123 --node plan

# Planner completes
ai-memory-hub workflow node done --workflow abc123 --node plan --output '{"plan":"D:\\plan.md"}'

# Executor starts
ai-memory-hub workflow node start --workflow abc123 --node exec

# Executor hits a permission gate
ai-memory-hub workflow node wait --workflow abc123 --node exec --note "Waiting for npm install approval"

# Permission granted (out of band)
ai-memory-hub workflow node start --workflow abc123 --node exec  # resume from waiting

# Executor completes
ai-memory-hub workflow node done --workflow abc123 --node exec --output '{"commits":["abc123"]}'

# Reviewer starts
ai-memory-hub workflow node start --workflow abc123 --node review

# Reviewer rejects
ai-memory-hub workflow node reject --workflow abc123 --node review --note "Tests failing"

# Check status
ai-memory-hub workflow graph --id abc123
# Output:
# Workflow abc123: blocked
#   [✓] plan (planner:codex) — completed
#   [✓] exec (executor:claude) — completed
#   [✗] review (reviewer:gemini) — rejected
```

### 11. Testing Strategy

- **Unit:** `readWorkflowNodes` replays events correctly, handles out-of-order timestamps
- **Integration:** CLI round-trip: add → start → done, verify final status
- **E2E:** Spawn workflow via dispatch, simulate planner/executor/reviewer lifecycle, check dashboard renders correct node tree

### 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Event log grows unbounded | Acceptable for P0 scope (<1000 workflows, <10 nodes each = ~10k events). Add archival in P1 if needed. |
| Replay is slow | Add in-memory cache keyed by `(workflowId, mtime)`. Rebuild only if `nodes.jsonl` changed. |
| Breaking change if we switch to derived status | Phase 5 is opt-in. Old workflows keep manual status forever. |
| Confusing if node and workflow status diverge | Dashboard shows both. CLI warns if `workflow.status=done` but required nodes pending. |

---

## Decision: Ready for Implementation?

This design is **complete and self-contained**. Once approved:

1. Implement Phase 1 (data layer + CLI)
2. Add Phase 2 (dashboard)
3. Write acceptance tests per Section 6
4. Mark task `66472edaa3d8c2df` → `done`

**Estimated effort:** 6-8 hours (data + CLI + dashboard + tests).

**Review checkpoint:** After Phase 1, stop and validate CLI usage + event replay before continuing to dashboard.
