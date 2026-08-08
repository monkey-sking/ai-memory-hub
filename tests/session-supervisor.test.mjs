import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionLease,
  updateSessionHeartbeat,
  finishSessionLease,
  evaluateSessionLease
} from "../src/session-supervisor.js";

test("creates and heartbeats an active session lease", () => {
  const lease = createSessionLease({
    sessionId: "abc",
    tool: "gemini",
    project: "amh",
    cwd: "D:/Project/ai-memory-hub",
    pid: 123,
    now: "2026-08-08T04:00:00.000Z"
  });
  assert.equal(lease.status, "active");
  assert.equal(lease.lastHeartbeat, lease.startedAt);
  const updated = updateSessionHeartbeat(lease, "2026-08-08T04:01:00.000Z");
  assert.equal(updated.lastHeartbeat, "2026-08-08T04:01:00.000Z");
  assert.equal(evaluateSessionLease(updated, { now: "2026-08-08T04:01:10.000Z", processAlive: true }).state, "active");
});

test("marks a lease stale when heartbeat expires", () => {
  const lease = createSessionLease({ sessionId: "abc", tool: "codex", now: "2026-08-08T04:00:00.000Z" });
  const result = evaluateSessionLease(lease, { now: "2026-08-08T04:01:00.000Z", staleMs: 30_000, processAlive: true });
  assert.equal(result.state, "stale");
  assert.equal(result.reason, "heartbeat-expired");
});

test("records a terminal result and does not revive it", () => {
  const lease = createSessionLease({ sessionId: "abc", tool: "claude", now: "2026-08-08T04:00:00.000Z" });
  const finished = finishSessionLease(lease, { status: "completed", exitCode: 0, now: "2026-08-08T04:02:00.000Z" });
  assert.equal(finished.status, "completed");
  assert.equal(finished.completedAt, "2026-08-08T04:02:00.000Z");
  assert.throws(() => updateSessionHeartbeat(finished, "2026-08-08T04:03:00.000Z"), /terminal session lease/);
});
