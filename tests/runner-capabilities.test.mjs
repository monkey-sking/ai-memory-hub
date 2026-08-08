import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRunnerCapabilities, selectRunnerWakeAction } from "../src/runner-capabilities.js";

test("normalizes a resume-capable direct runner", () => {
  const capabilities = normalizeRunnerCapabilities({
    available: true,
    capabilities: ["direct-dispatch", "stdin-prompt", "session-resume"],
    resumeArgs: () => ["--resume", "session-1"]
  });
  assert.deepEqual(capabilities, {
    freshRun: true,
    resume: true,
    liveSend: false,
    sharedQueue: false
  });
  assert.equal(selectRunnerWakeAction(capabilities, "session-1"), "resume");
});

test("uses fresh-run for direct runners without resume and queue for shared-state tools", () => {
  const direct = normalizeRunnerCapabilities({ available: true, capabilities: ["direct-dispatch", "stdin-prompt"] });
  const shared = normalizeRunnerCapabilities({ sharedStateOnly: true, capabilities: [] });
  assert.equal(selectRunnerWakeAction(direct, "session-1"), "fresh-run");
  assert.equal(selectRunnerWakeAction(shared, "session-1"), "queue");
});

test("live-send takes precedence when a concrete live session exists", () => {
  const capabilities = normalizeRunnerCapabilities({ available: true, capabilities: ["direct-dispatch", "live-send"] });
  assert.equal(selectRunnerWakeAction(capabilities, "session-1", { liveSessionId: "session-1" }), "live-send");
  assert.equal(selectRunnerWakeAction(capabilities, "session-2", { liveSessionId: "session-1" }), "fresh-run");
});
