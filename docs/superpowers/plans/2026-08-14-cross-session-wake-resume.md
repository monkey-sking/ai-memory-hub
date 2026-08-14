# Claude Cross-Session Wake and Resume Implementation Plan

> For agentic workers: use TDD and execute each step with verification.

**Goal:** Make session follow-up messages reach the target session through Claude resume, direct-runner fresh-run, or durable queue without duplicate delivery.

**Architecture:** Reuse agent-wake and runner capability services. Add a narrow daemon-facing consumer that claims pending session-targeted Radio messages, routes by verified capability, records lifecycle and retry state, and never injects arbitrary terminal stdin.

**Tech Stack:** Node.js ESM, JSONL AMH state, node:test.

---

### Task 1: Map existing contracts

Files: src/agent-wake.js, src/agent-wake-service.js, src/runner-wake-service.js, src/session-supervisor-service.js, src/index.js, tests/*wake*.test.mjs.

- [ ] Confirm the message envelope, runner capability shape, daemon dispatch entrypoint, and existing status transition helpers.

### Task 2: Add RED tests

Files: create tests/session-follow-up-dispatch.test.mjs.

- [ ] Test Claude session target routes to resume with the session id and prompt.
- [ ] Test a non-resume direct runner routes to fresh-run while preserving session/thread linkage.
- [ ] Test unsupported targets remain queued.
- [ ] Test duplicate idempotency keys execute once and completed/stale sessions are rejected.

Run: node --test tests/session-follow-up-dispatch.test.mjs. Expected: fail because the daemon consumer is not implemented.

### Task 3: Implement the smallest green path

Files: create or modify the narrow wake consumer module and src/index.js daemon integration.

- [ ] Claim one pending session-targeted message under the AMH lock.
- [ ] Route through existing capability selection and runner adapters.
- [ ] Persist accepted, processing, completed, failed, and abandoned outcomes with bounded retry metadata.
- [ ] Reject stale/completed sessions and duplicate idempotency keys.

Run: node --test tests/session-follow-up-dispatch.test.mjs. Expected: pass.

### Task 4: Regression verification

- [ ] Run focused wake, runner capability, session supervisor, and dispatch tests.
- [ ] Run node --check on changed modules and git diff --check.
- [ ] Run the relevant full npm test subset and record any pre-existing failures separately.

### Task 5: Delivery

- [ ] Update docs/CLI.md or the cross-session design doc if the command contract changes.
- [ ] Commit only owned implementation/test/docs files on main.
- [ ] Push origin/main and verify clean status.
- [ ] Mark task 7c1909c020dd4d15 done only after tests and end-to-end behavior are verified.

