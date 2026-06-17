# Permission Policy Layer — Design

**Task ID:** `38896fb99a1e0195`
**Priority:** P0 (recommended implementation order #1)
**Plan name:** `permission-policy-layer`
**Status:** Design review
**Author:** Claude
**Date:** 2026-06-16

## Problem Statement

AMH's current capability guardrails are static, uniform, and advisory:

- `buildToolPermissionPolicy` (`src/dashboard/tools.js:195`) returns the **same** hardcoded policy for every tool:
  ```js
  defaultGuardrails: ["no-push", "no-delete-files", "no-install-dependencies"],
  requiresApprovalFor: ["push", "delete-files", "install-dependencies", "system-config", "destructive-commands"]
  ```
- These are **displayed** in the capability registry but **never enforced** at dispatch time.
- Recipe gates (`allowedActions`, `forbiddenActions`, `reviewRequired`) are the closest existing enforcement concept, but they are only rendered into the dispatch prompt as **text guidance**, not checked programmatically.

There is no way to express "tool X may push in project Y but not project Z", or "executor role may modify files but must ask before installing dependencies". NocoBase's ACL model suggests a more expressive matrix.

## Goals

1. **Expressive policy model** — decisions keyed on `actor × project × operation × scope`.
2. **Three-valued decisions** — `allow`, `ask`, `deny`, each with a human-readable reason.
3. **Single resolver** — one function computes the effective decision; CLI, dispatch, and dashboard all call it (no recomputation drift).
4. **Default seeding** — the existing hardcoded guardrails become default policy entries, not scattered special cases.
5. **Backward compatible** — with no custom policy, behavior matches today's defaults.

## Non-Goals

- Not an OS-level sandbox. This is a coordination-layer policy, advisory+preflight, consistent with AMH being a shared-state hub.
- Not replacing recipe gates (they stay; the policy layer is a higher, cross-cutting layer).
- Not storing secrets or credentials.
- Not blocking the human operator's direct CLI use — policy targets *dispatched/automated* actions and surfaces guidance for humans.

## Design

### 1. Dimensions

| Dimension | Values |
|-----------|--------|
| **actor** | tool name (`claude`, `codex`), workflow role (`role:executor`), `human`, `system`, or `*` |
| **project** | exact project id, project group, or `*` |
| **operation** | `read-memory`, `write-memory`, `send-radio`, `claim-task`, `dispatch`, `modify-files`, `run-tests`, `install-dependencies`, `push`, `delete`, `purge`, `archive` |
| **scope** | `all`, `project`, `own` (own task/session data) |
| **decision** | `allow`, `ask`, `deny` |
| **reason** | human-readable string |

### 2. Policy Rule Schema

Append-only event log: `<memoryDir>/policy/rules.jsonl` (consistent with tasks/workflows/nodes pattern).

```jsonc
{
  "type": "policy.rule",
  "id": "rule_<hash>",
  "actor": "claude",          // or "role:executor", "human", "system", "*"
  "project": "*",             // exact id, group, or "*"
  "operation": "push",        // see operation list
  "scope": "all",             // all | project | own
  "decision": "ask",          // allow | ask | deny
  "reason": "Pushing to remote requires human approval",
  "priority": 100,            // higher wins on conflict; defaults seeded at 0
  "createdAt": "...",
  "createdBy": "system",
  "ts": "..."
}
```

### 3. Resolution Algorithm

`resolvePermission(memoryDir, { actor, project, operation, scope })` → `{ decision, reason, matchedRule }`

1. Load all rules (replay events, latest per `id`).
2. Filter rules that **match** the query:
   - `rule.operation === operation` (operation is always exact)
   - `rule.actor` matches: exact actor, OR `role:<role>` when actor carries that role, OR `*`
   - `rule.project` matches: exact, OR group membership, OR `*`
   - `rule.scope` matches: exact, OR rule scope is broader (`all` ⊇ `project` ⊇ `own`)
3. Rank matches by **specificity then priority**:
   - Specificity score: exact actor (+4), exact project (+2), exact scope (+1); wildcards score 0.
   - Tie-break by `priority`, then most recent `ts`.
4. Return the top rule's `decision` + `reason`.
5. **No match** → fall back to the seeded default for that operation (see §4). If still none → `allow` with reason "No policy restricts this operation" (read-style ops) or `ask` for unknown write/destructive ops (fail-safe).

**Fail-safe default:** unknown destructive operations default to `ask`, never silent `allow`.

### 4. Seeded Defaults

On `policy init` (or first resolve when no rules exist), seed these from today's hardcoded guardrails:

| operation | decision | reason |
|-----------|----------|--------|
| `read-memory`, `write-memory`, `send-radio`, `claim-task`, `dispatch`, `run-tests` | `allow` | Standard collaboration operations |
| `modify-files` | `allow` | Editing within the workspace is allowed |
| `install-dependencies` | `ask` | Dependency installs need approval (supply-chain safety) |
| `push` | `ask` | Pushing to remote needs human approval |
| `delete`, `purge` | `ask` | Destructive data operations need approval |
| `archive` | `allow` | Archiving is reversible |

All seeded with `actor: "*"`, `project: "*"`, `scope: "all"`, `priority: 0`. Custom rules override by higher specificity/priority.

### 5. CLI Surface

```bash
# Show effective permissions for a tool/actor (matrix view)
ai-memory-hub capabilities --tool claude        # extend existing command
ai-memory-hub policy show --actor claude [--project X]

# Resolve a single decision (used by dispatch preflight + scripts)
ai-memory-hub policy check --actor claude --operation push --project myproj [--scope all]
# → { decision: "ask", reason: "...", matchedRule: {...} }

# Manage rules
ai-memory-hub policy add --actor codex --operation push --project trusted-proj --decision allow --reason "Codex is trusted in this repo" [--priority 100] [--by human]
ai-memory-hub policy list [--actor X] [--operation Y]
ai-memory-hub policy remove --id <rule-id> --by human
ai-memory-hub policy init   # seed defaults (idempotent)
```

### 6. Integration Points

#### 6.1 Dispatch preflight

Before dispatching a job, call `resolvePermission` for the operation(s) the job implies (at minimum `dispatch`; recipe gates may declare additional operations). Surface the result:
- `allow` → proceed
- `ask` → mark job as needing approval (ties into the future approval-gate work, P0 #3); for now, emit a clear status and skip auto-run unless `--force`
- `deny` → block with the reason

This makes dispatch preflight "explain why an action is allowed, blocked, or requires approval" (acceptance criterion).

#### 6.2 Capability registry

Replace static `buildToolPermissionPolicy` output with resolved decisions per operation:
```jsonc
"permissions": {
  "byOperation": {
    "push": { "decision": "ask", "reason": "..." },
    "modify-files": { "decision": "allow", "reason": "..." },
    ...
  },
  "source": "policy-layer"
}
```
Keep legacy fields (`canAutoDispatch`, etc.) for compatibility during transition.

#### 6.3 Dashboard

`GET /api/policy` → all rules + seeded defaults.
`GET /api/capabilities` already exists; enrich each tool entry with `permissions.byOperation` so the dashboard renders the same resolved matrix without recomputing.

### 7. Acceptance Criteria (from nocobase-benchmark-optimization.md)

| Criterion | How met |
|-----------|---------|
| `ai-memory-hub capabilities` shows effective permissions per tool | capability entry gains `permissions.byOperation` from resolver |
| Dispatch preflight explains allowed/blocked/requires-approval | dispatch calls `resolvePermission`, surfaces decision+reason |
| Dashboard shows same policy result without recomputing | API returns resolved decisions; dashboard renders them |
| Existing hardcoded guardrails become default policy entries | §4 seeds them as `actor:* project:* priority:0` rules |

### 8. Implementation Phases

#### Phase 1: Policy data layer + resolver + CLI
- [ ] `readPolicyRules` / `appendPolicyRule` / `removePolicyRule` (events in `policy/rules.jsonl`)
- [ ] `seedDefaultPolicyRules` (idempotent)
- [ ] `resolvePermission(memoryDir, query)` with specificity ranking + fail-safe
- [ ] CLI: `policy init|add|list|remove|show|check`
- [ ] Unit-style CLI round-trip verification

#### Phase 2: Capability registry + dashboard integration
- [ ] Enrich `buildToolCapabilityEntry` with `permissions.byOperation`
- [ ] `GET /api/policy` endpoint
- [ ] Dashboard: render permission matrix in tools/capabilities view

#### Phase 3: Dispatch preflight enforcement
- [ ] `dispatch` calls `resolvePermission` per job
- [ ] `ask`/`deny` surfaced in dispatch result + relay status
- [ ] `--force` override for `ask` (logged)

### 9. Open Questions

1. **Operation inference for dispatch** — how does a dispatched job declare which operations it will perform? **Answer:** Start with `dispatch` itself as the operation; let recipe gates optionally declare `operations: [...]`. Refine later.
2. **Project groups** — needed now? **Answer:** Schema supports `project` matching a group, but group membership resolution is deferred to a follow-up; for Phase 1, exact-or-wildcard only.
3. **Who can edit policy?** — **Answer:** `policy add/remove` default to `--by human`; a future rule could require `decision=ask` for the `modify-policy` meta-operation. Out of Phase 1 scope.

### 10. Risks

| Risk | Mitigation |
|------|------------|
| Over-blocking breaks existing automation | Defaults mirror today's behavior exactly; enforcement (Phase 3) is opt-in via dispatch preflight, `ask` doesn't hard-block without `--force` semantics |
| Resolver complexity / wrong precedence | Phase 1 ships with explicit specificity tests covering wildcard vs exact, scope nesting, priority tie-break |
| Policy file drift vs hardcoded code | Single resolver is the only source; legacy fields kept read-only during transition then removed |

---

## Decision: Ready for Implementation?

Recommend implementing **Phase 1** (data layer + resolver + CLI) first, then stopping to validate the resolver's precedence behavior before wiring it into dispatch and the dashboard. Phase 3 (enforcement) is the riskiest and should land last, after the approval-gate work (P0 #3) so `ask` decisions have a place to go.
