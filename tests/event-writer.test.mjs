import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendJsonl } from "../src/event-writer.js";
import * as memoryStore from "../src/memory-store.js";
import { closeStore } from "../src/sqlite-store.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ew-test-"));

test("非 memory 文件：仅写 JSONL + 自动建父目录", () => {
  const file = path.join(tmp, "nested", "relations.jsonl");
  appendJsonl(file, { type: "relation", from: "a", to: "b" });
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { type: "relation", from: "a", to: "b" });
});

test("memory events 文件：JSONL + SQLite 双写", () => {
  const dir = path.join(tmp, "hub");
  const file = path.join(dir, "inbox", "events.jsonl");
  appendJsonl(file, { source: "evt", text: "统一写入验证" });
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).text, "统一写入验证");
  const events = memoryStore.readMemoryEvents(dir, {});
  assert.ok(events.some((e) => e.text === "统一写入验证"));
});

test("重复写入累计多行", () => {
  const file = path.join(tmp, "multi.jsonl");
  appendJsonl(file, { n: 1 });
  appendJsonl(file, { n: 2 });
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
});

process.on("exit", () => { try { closeStore(); } catch { /* ignore */ } });
