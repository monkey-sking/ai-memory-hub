import assert from "node:assert/strict";
import test from "node:test";
import {
  createWakeEnvelope,
  resolveAgentTarget,
  selectWakeAction,
  transitionWakeState
} from "../src/agent-wake.js";

test("resolves a concrete session actor before falling back to a tool actor", () => {
  assert.deepEqual(resolveAgentTarget("session:claude:abc-123"), {
    kind: "session",
    tool: "claude",
    sessionId: "abc-123",
    actor: "session:claude:abc-123"
  });
  assert.deepEqual(resolveAgentTarget("codex"), {
    kind: "tool",
    tool: "codex",
    sessionId: "",
    actor: "tool:codex"
  });
});

test("creates a stable idempotent wake envelope", () => {
  const first = createWakeEnvelope({
    from: "tool:codex",
    to: "session:claude:abc-123",
    text: "Please continue the review.",
    project: "ai-memory-hub",
    thread: "task-1",
    messageId: "radio-1"
  });
  const second = createWakeEnvelope({
    from: "tool:codex",
    to: "session:claude:abc-123",
    text: "Please continue the review.",
    project: "ai-memory-hub",
    thread: "task-1",
    messageId: "radio-1"
  });
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.target.sessionId, "abc-123");
  assert.equal(first.state, "pending");
});

test("prefers live delivery, then resume, then shared-state fallback", () => {
  assert.equal(selectWakeAction({ live: true, resume: true }), "send");
  assert.equal(selectWakeAction({ live: false, resume: true }), "wake");
  assert.equal(selectWakeAction({ live: false, resume: false }), "queue");
});

test("enforces the wake state machine", () => {
  assert.equal(transitionWakeState("pending", "resolving"), "resolving");
  assert.equal(transitionWakeState("resolving", "accepted"), "accepted");
  assert.equal(transitionWakeState("accepted", "processing"), "processing");
  assert.equal(transitionWakeState("processing", "completed"), "completed");
  assert.throws(() => transitionWakeState("completed", "processing"), /Invalid wake transition/);
});
