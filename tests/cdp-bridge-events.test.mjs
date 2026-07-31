import test from "node:test";
import assert from "node:assert/strict";
import CDPBridge from "../src/cdp-bridge.js";

test("CDP bridge creates a normalized file-change event for task updates", () => {
  const bridge = new CDPBridge(0, "C:/amh-test-memory");

  assert.deepEqual(
    bridge.createFileChangeEvent("tasks/events.jsonl", "change", "2026-07-31T10:00:00.000Z"),
    {
      type: "amh.file-change",
      kind: "task",
      source: "tasks/events.jsonl",
      eventType: "change",
      sequence: 1,
      ts: "2026-07-31T10:00:00.000Z"
    }
  );
});

test("CDP bridge classifies radio and task files for subscribers", () => {
  const bridge = new CDPBridge(0, "C:/amh-test-memory");

  assert.equal(bridge.getWatchedFileKind("radio/messages.jsonl"), "radio");
  assert.equal(bridge.getWatchedFileKind("tasks/events.jsonl"), "task");
  assert.equal(bridge.getWatchedFileKind("inbox/events.jsonl"), "memory");
  assert.equal(bridge.getWatchedFileKind("other.jsonl"), null);
});
