import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSessionSupervisor } from "../src/session-supervisor-service.js";

test("session supervisor persists and reloads lease lifecycle", () => {
  const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), "amh-supervisor-"));
  const times = [
    "2026-08-08T04:00:00.000Z",
    "2026-08-08T04:01:00.000Z",
    "2026-08-08T04:02:00.000Z"
  ];
  const supervisor = createSessionSupervisor({ memoryDir, now: () => times.shift() });
  supervisor.start({ sessionId: "s1", tool: "codex", pid: null });
  supervisor.heartbeat("s1", "2026-08-08T04:00:30.000Z");
  const finished = supervisor.finish("s1", { status: "completed", exitCode: 0 });
  assert.equal(finished.status, "completed");
  assert.equal(fs.readFileSync(supervisor.files.leaseFile, "utf8").trim().split(/\r?\n/).length, 3);

  const reloaded = createSessionSupervisor({ memoryDir, now: () => "2026-08-08T04:03:00.000Z" });
  const inspected = reloaded.inspect("s1", { processAlive: true });
  assert.equal(inspected.lease.status, "completed");
  assert.equal(inspected.state, "completed");
});

test("reconcile marks exited AMH-owned sessions failed when requested", () => {
  const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), "amh-supervisor-"));
  const supervisor = createSessionSupervisor({ memoryDir, now: () => "2026-08-08T04:00:00.000Z" });
  supervisor.start({ sessionId: "s2", tool: "gemini", pid: 999 });
  const result = supervisor.reconcile({ processAlive: false, markDead: true });
  assert.equal(result[0].state, "dead");
  assert.equal(supervisor.inspect("s2", { processAlive: false }).lease.status, "failed");
});