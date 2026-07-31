import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDaemonHeartbeat } from "../src/daemon-health.js";

test("fresh heartbeat is alive only when its process is alive", () => {
  const result = evaluateDaemonHeartbeat({
    heartbeat: {
      pid: 123,
      cycle: 4,
      ts: "2026-07-31T10:00:00.000Z"
    },
    now: "2026-07-31T10:00:05.000Z",
    staleMs: 30_000,
    processAlive: true
  });

  assert.deepEqual(result, {
    alive: true,
    stale: false,
    dead: false,
    ageMs: 5_000,
    pid: 123,
    cycle: 4,
    lastTs: "2026-07-31T10:00:00.000Z",
    reason: "OK"
  });
});

test("fresh heartbeat is dead when the recorded process has exited", () => {
  const result = evaluateDaemonHeartbeat({
    heartbeat: { pid: 456, ts: "2026-07-31T10:00:00.000Z" },
    now: "2026-07-31T10:00:05.000Z",
    staleMs: 30_000,
    processAlive: false
  });

  assert.equal(result.alive, false);
  assert.equal(result.stale, false);
  assert.equal(result.dead, true);
  assert.match(result.reason, /process 456 is not running/i);
});

test("old heartbeat is stale even when its process appears alive", () => {
  const result = evaluateDaemonHeartbeat({
    heartbeat: { pid: 789, cycle: 9, ts: "2026-07-31T09:59:00.000Z" },
    now: "2026-07-31T10:00:00.000Z",
    staleMs: 30_000,
    processAlive: true
  });

  assert.equal(result.alive, false);
  assert.equal(result.stale, true);
  assert.equal(result.dead, false);
  assert.equal(result.ageMs, 60_000);
});
