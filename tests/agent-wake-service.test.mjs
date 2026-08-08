import assert from "node:assert/strict";
import test from "node:test";
import { createAgentWakeService } from "../src/agent-wake-service.js";

test("wake service enqueues durable envelopes and plans resume delivery", () => {
  const writes = [];
  const service = createAgentWakeService({
    memoryDir: "C:/memory",
    now: () => "2026-08-08T00:00:00.000Z",
    appendJsonl: (file, value) => writes.push({ file, value })
  });
  const envelope = service.enqueue({
    from: "tool:codex",
    to: "session:claude:abc",
    text: "Continue.",
    project: "amh"
  });
  const planned = service.plan(envelope, { sessionId: "abc", resume: true });
  assert.equal(planned.action, "wake");
  assert.equal(planned.state, "resolving");
  assert.equal(planned.attempt, 1);
  assert.equal(writes.length, 2);
});

test("wake service queues targets without a verified adapter", () => {
  const service = createAgentWakeService({ memoryDir: "C:/memory", appendJsonl: () => {} });
  const envelope = service.enqueue({ to: "tool:marvis", text: "Please continue." });
  const planned = service.plan(envelope, {});
  assert.equal(planned.action, "queue");
  assert.equal(planned.state, "accepted");
});
