# AMH Improvement Roadmap

> **For agentic workers:** A phase may be *implemented* only after its **baseline acceptance** passes. For Phase 0 specifically, "baseline acceptance" means every checkbox in Phase 0 is ticked and the event-envelope contract (below) is written down and reviewed — that *is* the gate, so Phase 0 is not circular. Later phases use the `Acceptance:` lines as their gate. Keep the existing shared-memory safety rules and do not touch unrelated worktree changes.

**Goal:** Evolve AI Memory Hub from shared filesystem state into a reliable, observable, multi-agent collaboration platform.

**Architecture:** Establish one event and health foundation first, then build workflow coordination and review quality on top of it. Skill mining, Dashboard visualization, and GitHub integration consume the stable task/workflow event model rather than inventing separate state paths.

**Tech Stack:** Node.js, existing `src/index.js` CLI/daemon, `src/cdp-bridge.js`, Dashboard modules under `src/dashboard/` (API) and `dashboard-next/` (React frontend), JSONL event stores, existing workflow/recipe system, and the repository test suite.

### Current Status (as of 2026-08)

This roadmap is incremental, not greenfield. The following already exist in the repo and should be **refactored/extended**, not rebuilt:

- `src/daemon-health.js` — daemon heartbeat / stale detection (Phase 1 baseline).
- `src/skill-mining.js` — candidate-skill extraction (Phase 3 baseline).
- `src/github-lifecycle.js` — GitHub Issue/PR linking (Phase 4 baseline).
- `external-domain-packs` design + `skills/multi-expert-doc-review` skill pack — Phase 3 skill distribution baseline (see `docs/superpowers/specs/2026-08-03-external-domain-packs-design.md`).
- `dashboard-next/` — React dashboard frontend (Phase 4 visualization baseline).

### Glossary

| Term | Meaning |
| --- | --- |
| Event envelope | Immutable record appended to `events.jsonl`: `{ schemaVersion, type, entity, id, project, source, ts, seq, dedupKey, sensitivity }`. Carries **no** mutable delivery state. |
| Delivery state / cursor | Per-subscriber progress (last consumed `seq`). Stored separately from the envelope, **not** inside `events.jsonl`. |
| Fan-out | Push of an event to subscribed clients; suppressed by `dedupKey` + cursor. |
| Delivery health | Dashboard signal summarizing staleness/lag of delivered events (Phase 4). Same concept as "delivery state" above — unified term is **delivery health**. |
| Projection | Derived view (e.g. `tasks.jsonl`) rebuilt from `events.jsonl`; `events.jsonl` is authoritative. |

---

## Execution Order

### Phase 0: Baseline and Contracts

**0a — Envelope, schema, and rebuild**

- [ ] Inventory daemon, CDP, task, radio, workflow, and Dashboard event paths (`src/index.js`, `src/cdp-bridge.js`, `src/dashboard/realtime.js`, `src/dashboard/tasks.js`, `src/dashboard/workflows.js`, `recipes/*.json`).
- [ ] Define one **immutable** event envelope: `{ schemaVersion, type, entity, id, project, source, ts, seq, dedupKey, sensitivity }`. `seq` is a monotonic per-`(project)` sequence; `dedupKey` de-duplicates retries; `sensitivity` is `public | internal | secret` and drives redaction. **Delivery state / cursor is NOT in the envelope** — see 0b.
- [ ] Declare `events.jsonl` as the **authoritative** store; `tasks.jsonl` and other views are **projections** rebuilt by a `ai-memory-hub rebuild` command. Define a version-migration path for `schemaVersion` (dual-read compatibility for existing JSONL).
- [ ] Add secret scanning at the **write** path (not just export): reject/redact `secret`-sensitivity payloads before append; verify `src/file-locks.js` covers every JSONL write path (multi-writer append atomicity).

**0b — Delivery, cursor, and concurrency**

- [ ] Move delivery state out of the envelope into a per-subscriber **cursor** (last consumed `seq`), stored separately. Fan-out = push new `seq` > cursor, suppressed by `dedupKey`.
- [ ] Define the ordering contract: single-file total order per `project`; cross-project logs MAY be sharded. State whether the model is single-writer or multi-writer and where append atomicity is guaranteed.
- [ ] Define "no lost events" measurement: an idempotency/reconciliation script (counts `events.jsonl` vs projections) that also counts process-crash and disk-write-failure cases.

**Baseline acceptance (gate for starting Phase 0 implementation):** every checkbox above is ticked and the envelope contract is written and reviewed.

**Runtime acceptance (machine-verifiable, wired into `node --test`):**

- `node --test` passes the new envelope/lock tests.
- `ai-memory-hub rebuild` reproduces `tasks.jsonl` from `events.jsonl` byte-for-byte on a fixture.
- Reconciliation script reports zero drift on the fixture; duplicate `dedupKey` appends are collapsed.

### Phase 1: Health and Realtime Foundation

- [ ] Implement daemon heartbeat monitoring and stale-process recovery/alert reporting (build on existing `src/daemon-health.js`).
- [ ] Replace timer-only Heartbeat checks with event-driven notifications where possible, retaining bounded polling as a fallback.
- [ ] Add task/radio push notifications through the CDP bridge.
- [ ] **Secure the CDP bridge:** bind to `127.0.0.1` only, require a one-time token, and authorize subscriptions per `project` (do not cross-project broadcast by default). The bridge is a local unauthenticated port otherwise — any local process or malicious page could subscribe to cross-project memory.
- [ ] Verify duplicate messages are suppressed (via `dedupKey` + cursor from Phase 0b) and failed deliveries are retryable.

**Acceptance (machine-verifiable, wired into `node --test`):**

- `ai-memory-hub status --json | jq '.daemon.stale'` is `true` after the daemon is stopped (visible stale status).
- Creating/updating a task or radio entry appears in a subscribed client before the full polling interval elapses (event-driven path asserted by a test).
- After a daemon restart, the reconciliation script reports no duplicate `seq` for prior events.

### Phase 2: Collaboration and Review

- [ ] Implement cross-loop state sharing for workflows operating on the same project.
- [ ] Add recipe `reviewDimensions` support with explicit verifier output.
- [ ] Add an adversarial verifier role that can reject a result and record actionable findings.
- [ ] Keep review state separate from task completion state.

Acceptance (machine-verifiable): `ai-memory-hub workflow result --role reviewer` for a `rejected` verdict sets review state to `rejected` and `ai-memory-hub task show <id> --json | jq '.approved'` is `false`; a second `result` with `approved` is required before `.approved` becomes `true`. Two workflow loops reading the same project context is asserted by a shared-state test.

### Phase 3: Compounding Skills

- [ ] Extract candidate skills from completed task/workflow outcomes, corrections, and verification evidence (build on existing `src/skill-mining.js`).
- [ ] Store candidates separately from active shared rules.
- [ ] Add observer-generated skill deltas and require reviewer approval before merge.
- [ ] **Authenticate reviewer approval:** each `source` holds a local key; approvals are signed and **self-approve is forbidden** (`--by codex` alone is not proof — any agent could impersonate a reviewer). Without this, "require reviewer approval" is cosmetic.
- [ ] **Close the distribution gap:** define how an *approved* skill reaches each tool — export a skill pack and sync it to tool skill-pack / MCP tool lists, with explicit enable/disable and revocation semantics. Reuse the existing `external-domain-packs` format (`docs/superpowers/specs/2026-08-03-external-domain-packs-design.md`) rather than inventing a new one.
- [ ] Preserve provenance, source task, evidence, supersession history, and an **append-only, tamper-evident** audit trail (ledger uses a forward hash chain + periodic anchor — plain writable files are not sufficient).

Acceptance (machine-verifiable): completing a task can produce a candidate without modifying `MEMORY.md` directly; only approved (signed, non-self) candidates enter the managed memory/skill layer; rejected candidates remain auditable but inactive; an approved candidate produces a valid skill pack consumable by `skill list`/`searchSkills`.

### Phase 4: Visibility and External Lifecycle

- [ ] Upgrade Dashboard (`dashboard-next/`) with Agent Kanban, progress, blocked state, review state, and **delivery health** (same concept as "delivery state" in Phase 0 — unified term).
- [ ] Connect task/workflow lifecycle fields to GitHub Issue and PR references (build on existing `src/github-lifecycle.js`).
- [ ] **GitHub is a one-way, read-only projection.** AMH is the source of truth; sync direction is AMH → GitHub only. If bidirectional sync is ever needed, external changes enter the memory layer behind the same injection/redaction guards as other inputs — do not let GitHub become a second source of truth.
- [ ] **Credentials:** tokens come from OS keychain / `gh auth`; AMH holds only a handle, never the secret. Avoid storing credentials in AMH memory data.
- [ ] **Privacy:** secret scanning runs at the write path (Phase 0a) and again at export. Before any task/radio note or review text is pushed to a public Issue/PR, show a diff preview and require explicit confirmation; `secret`-sensitivity payloads are never exported.

Acceptance (machine-verifiable): Dashboard state is derived from the same event source as `ai-memory-hub status`; `ai-memory-hub github link --dry-run --json` shows the exact payload and flags any `secret`-sensitivity field before it would be sent; a fixture with a credential in a note is blocked by the export check; no credential string appears in any JSONL under `~/.ai-memory/`.

### Phase 5: Documentation and Adoption

- [ ] Write the single-tool-user value proposition after the preceding capabilities are real.
- [ ] Include loop checkpoints, durable memory, local recovery, auditability, and optional future handoff value.
- [ ] Document the minimum setup path and the operational limits honestly.

Acceptance: documentation reflects shipped behavior (cross-check against the **Current Status** block above), includes verification commands for every claim, and does not promise unavailable automation. The minimum setup path is stated up front, not deferred to this phase.

## Delivery Rules

- Keep each phase independently testable **and independently rollbackable** (ship behind a feature flag / CLI subcommand so rollback = disable the flag, not a full revert).
- **Every `Acceptance:` line must be machine-verifiable** — express it as a command + expected assertion and wire it into `node --test`. A phase is not "passing" on narrative alone.
- This roadmap is **incremental, not greenfield**: Phase 0–4 each start from an existing implementation (see Current Status). Extend/refactor those files; do not rewrite from scratch.
- Do not mark a phase complete from a design note alone; run its acceptance checks.
- Do not edit `MEMORY.md` or `memories/ledger.jsonl` directly; use inbox events and `ai-memory-hub sync`. Enforce the ban with file permissions or a pre-commit/watcher check, not just this document.
- Preserve existing user worktree changes: before committing, diff against the phase's declared file allowlist (`git status`) so unrelated worktree edits are not swept in.
