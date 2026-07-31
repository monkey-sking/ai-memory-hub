# AMH Improvement Roadmap

> **For agentic workers:** Implement each phase only after its acceptance checks pass. Keep the existing shared-memory safety rules and avoid changing unrelated worktree changes.

**Goal:** Evolve AI Memory Hub from shared filesystem state into a reliable, observable, multi-agent collaboration platform.

**Architecture:** Establish one event and health foundation first, then build workflow coordination and review quality on top of it. Skill mining, Dashboard visualization, and GitHub integration consume the stable task/workflow event model rather than inventing separate state paths.

**Tech Stack:** Node.js, existing `src/index.js` CLI/daemon, `src/cdp-bridge.js`, Dashboard modules under `src/dashboard/`, JSONL event stores, existing workflow/recipe system, and the repository test suite.

---

## Execution Order

### Phase 0: Baseline and Contracts

- [ ] Inventory daemon, CDP, task, radio, workflow, and Dashboard event paths.
- [ ] Define one event envelope containing event type, entity type, entity id, project, source, timestamp, and delivery state.
- [ ] Define acceptance checks: no lost events, idempotent delivery, stale daemon detection, bounded retry, and no duplicate fan-out.
- [ ] Add focused tests before changing runtime behavior.

Primary files to inspect: `src/index.js`, `src/cdp-bridge.js`, `src/dashboard/realtime.js`, `src/dashboard/tasks.js`, `src/dashboard/workflows.js`, and `recipes/*.json`.

### Phase 1: Health and Realtime Foundation

- [ ] Implement daemon heartbeat monitoring and stale-process recovery/alert reporting.
- [ ] Replace timer-only Heartbeat checks with event-driven notifications where possible, retaining bounded polling as a fallback.
- [ ] Add task/radio push notifications through the CDP bridge.
- [ ] Verify duplicate messages are suppressed and failed deliveries are retryable.

Acceptance: stopping the daemon produces a visible stale status; creating or updating a task/radio entry reaches subscribed clients without waiting for the full polling interval; restart does not duplicate prior events.

### Phase 2: Collaboration and Review

- [ ] Implement cross-loop state sharing for workflows operating on the same project.
- [ ] Add recipe `reviewDimensions` support with explicit verifier output.
- [ ] Add an adversarial verifier role that can reject a result and record actionable findings.
- [ ] Keep review state separate from task completion state.

Acceptance: two workflow loops can read the same project context; review dimensions are persisted; a rejected result cannot be marked fully approved without a follow-up review.

### Phase 3: Compounding Skills

- [ ] Extract candidate skills from completed task/workflow outcomes, corrections, and verification evidence.
- [ ] Store candidates separately from active shared rules.
- [ ] Add observer-generated skill deltas and require reviewer approval before merge.
- [ ] Preserve provenance, source task, evidence, and supersession history.

Acceptance: completing a task can produce a candidate without modifying `MEMORY.md` directly; only approved candidates enter the managed memory/skill layer; rejected candidates remain auditable but inactive.

### Phase 4: Visibility and External Lifecycle

- [ ] Upgrade Dashboard with Agent Kanban, progress, blocked state, review state, and delivery health.
- [ ] Connect task/workflow lifecycle fields to GitHub Issue and PR references.
- [ ] Keep GitHub integration optional and avoid storing credentials in AMH memory data.
- [ ] Add privacy checks for exported Dashboard and GitHub metadata.

Acceptance: Dashboard state is derived from the same event source as CLI status; GitHub links are traceable but do not become a second source of truth; credentials never enter JSONL exports.

### Phase 5: Documentation and Adoption

- [ ] Write the single-tool-user value proposition after the preceding capabilities are real.
- [ ] Include loop checkpoints, durable memory, local recovery, auditability, and optional future handoff value.
- [ ] Document the minimum setup path and the operational limits honestly.

Acceptance: documentation reflects shipped behavior, includes verification commands, and does not promise unavailable automation.

## Delivery Rules

- Keep each phase independently testable.
- Do not mark a phase complete from a design note alone; run its acceptance checks.
- Do not edit `MEMORY.md` or `memories/ledger.jsonl` directly; use inbox events and `ai-memory-hub sync`.
- Preserve existing user worktree changes and inspect repository status before commits.
