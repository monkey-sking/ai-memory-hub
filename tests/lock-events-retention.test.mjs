import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendLockEvent } from "../src/lib/io.js";

// lock-events.jsonl 是 append-only 的诊断日志，必须有保留策略，否则无上限增长。
// 上界 600 条（保留 500 + 100 的裁剪缓冲），裁剪只保留最新的。

const OVERFLOW = 700; // 必须 > 600（RETENTION + SLACK）才会触发裁剪

function withLockHub(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amh-lock-events-"));
  try {
    fs.mkdirSync(path.join(dir, "locks"));
    fs.mkdirSync(path.join(dir, "state"));
    return fn(dir, path.join(dir, "locks", "hub.lock"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readEntries(dir) {
  return fs.readFileSync(path.join(dir, "state", "lock-events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("appendLockEvent keeps the event log bounded", () => {
  withLockHub((dir, lockPath) => {
    for (let i = 0; i < OVERFLOW; i += 1) {
      appendLockEvent(lockPath, { type: "acquired", owner: `t${i}`, pid: 1, host: "h" });
    }
    const entries = readEntries(dir);
    assert.ok(entries.length <= 600, `expected <=600 lines, got ${entries.length}`);
    assert.ok(entries.length >= 500, `expected >=500 lines after trimming, got ${entries.length}`);
  });
});

test("appendLockEvent trimming keeps the newest events", () => {
  withLockHub((dir, lockPath) => {
    for (let i = 0; i < OVERFLOW; i += 1) {
      appendLockEvent(lockPath, { type: "acquired", owner: `t${i}`, pid: 1, host: "h" });
    }
    const entries = readEntries(dir);
    assert.equal(entries[entries.length - 1].owner, `t${OVERFLOW - 1}`);
    assert.notEqual(entries[0].owner, "t0");
  });
});

test("appendLockEvent writes well-formed entries and never blocks on trim failure", () => {
  withLockHub((dir, lockPath) => {
    appendLockEvent(lockPath, { type: "released", owner: "sync", pid: 42, host: "h" });
    const [entry] = readEntries(dir);
    assert.equal(entry.type, "released");
    assert.equal(entry.owner, "sync");
    assert.equal(entry.pid, 42);
    assert.ok(entry.ts);
    assert.ok(entry.id);
    assert.equal(entry.path, lockPath);
  });
});
