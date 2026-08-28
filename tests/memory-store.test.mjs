/**
 * memory-store.test.mjs — single-writer truth for the memory event log.
 *
 * Architectural contract under test:
 *   - memory-store owns SQLite (memory_events) = SOURCE OF TRUTH (FTS5 search).
 *   - The legacy JSONL stream (inbox staging queue) is written by the
 *     appendJsonl chokepoint in index.js, NOT by memory-store. So writes in
 *     the real system always hit BOTH. These tests simulate that chokepoint
 *     (writeEvent helper) where the SQLite↔JSONL reconciliation (verify) is
 *     exercised, and test memory-store in isolation otherwise.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";
import * as ms from "../src/memory-store.js";
import { closeStore } from "../src/sqlite-store.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "amh-mem-store-"));

// Simulate the index.js appendJsonl chokepoint: SQLite (truth) + legacy inbox JSONL.
function writeEvent(dir, event) {
  ms.appendMemoryEvent(dir, event);
  const file = path.join(dir, "inbox", "events.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
}

after(() => { closeStore(); fs.rmSync(root, { recursive: true, force: true }); });

test("appendMemoryEvent writes to SQLite as source of truth", () => {
  const dir = path.join(root, "a");
  const ev = ms.appendMemoryEvent(dir, { source: "codex", kind: "preference", project: "amh", text: "用户偏好中文回复" });
  assert.ok(ev.id, "event should get a generated id");
  const all = ms.readMemoryEvents(dir, { limit: 100 });
  assert.equal(all.length, 1);
  assert.equal(all[0].source, "codex");
});

test("FTS5 trigram search works for Chinese substrings", () => {
  const dir = path.join(root, "b");
  ms.appendMemoryEvent(dir, { source: "claude", kind: "project", project: "hwyxxl", text: "脑瓜转一转红包版对接 OPPO SDK" });
  ms.appendMemoryEvent(dir, { source: "gemini", kind: "correction", project: "amh", text: "git stash 不能带大目录跑" });

  const hit = ms.searchMemoryEvents(dir, "红包版");
  assert.ok(hit.length >= 1, "should match 红包版");
  assert.ok(hit[0].text.includes("OPPO"), "match should be the OPPO event");

  const oppo = ms.searchMemoryEvents(dir, "OPPO");
  assert.ok(oppo.length >= 1);

  const both = ms.searchMemoryEvents(dir, "红包版 OPPO");
  assert.ok(both.length >= 1);
});

test("verifyMemory reconciles SQLite against the JSONL stream (chokepoint writes both)", () => {
  const dir = path.join(root, "c");
  writeEvent(dir, { source: "codex", kind: "preference", project: "amh", text: "用户偏好中文回复" });
  writeEvent(dir, { source: "claude", kind: "project", project: "hwyxxl", text: "脑瓜转一转红包版对接 OPPO SDK" });
  writeEvent(dir, { source: "gemini", kind: "correction", project: "amh", text: "git stash 不能带大目录跑" });

  const v = ms.verifyMemory(dir);
  assert.equal(v.sqlite, v.jsonl, "sqlite count must equal JSONL stream count");
  assert.equal(v.drift, 0);
  assert.equal(v.consistent, true);
});

test("verifyMemory flags drift when only SQLite is written (JSONL missing)", () => {
  const dir = path.join(root, "d");
  ms.appendMemoryEvent(dir, { source: "codex", text: "只有 SQLite 没有 JSONL" });
  const v = ms.verifyMemory(dir);
  assert.equal(v.drift, 1, "missing JSONL line should register as drift");
  assert.equal(v.consistent, false);
});

test("read falls back to JSONL when SQLite has no rows", () => {
  const dir = path.join(root, "e");
  fs.mkdirSync(path.join(dir, "memories"), { recursive: true });
  fs.writeFileSync(path.join(dir, "memories", "ledger.jsonl"),
    `${JSON.stringify({ id: "x1", ts: new Date().toISOString(), source: "old", text: "历史记忆条目" })}\n`);
  const rows = ms.readMemoryEvents(dir, { limit: 10 });
  assert.ok(rows.length >= 1, "should fall back to ledger JSONL");
  assert.ok(rows.some((r) => r.text.includes("历史记忆")));
});
