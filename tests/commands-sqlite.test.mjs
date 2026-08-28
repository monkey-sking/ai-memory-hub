// Locks the `sqlite` command extraction contract: sqliteCommand(argv, { loadConfig })
// must read its deps via DI and behave identically when wired to a temp hub.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as sqliteStore from "../src/sqlite-store.js";
import { sqliteCommand } from "../src/commands/sqlite.js";

function tmpHub() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "amh-sqlite-test-"));
}

function capture(fn) {
  const chunks = [];
  const orig = process.stdout.write;
  process.stdout.write = (c) => { chunks.push(c); return true; };
  try {
    const rc = fn();
    return { rc, out: chunks.join("") };
  } finally {
    process.stdout.write = orig;
  }
}

test("sqlite status reports an empty consistent hub", () => {
  const dir = tmpHub();
  try {
    const { rc, out } = capture(() => sqliteCommand(["status"], { loadConfig: () => ({ memoryDir: dir }) }));
    assert.strictEqual(rc, 0);
    assert.match(out, /SQLite \(/);
    assert.match(out, /tasks=\d+ projects=\d+ workflows=\d+/);
  } finally {
    try { sqliteStore.closeStore(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

test("sqlite verify reports consistent on an empty hub", () => {
  const dir = tmpHub();
  try {
    const { rc, out } = capture(() => sqliteCommand(["verify"], { loadConfig: () => ({ memoryDir: dir }) }));
    assert.strictEqual(rc, 0);
    assert.match(out, /verdict: consistent/);
  } finally {
    try { sqliteStore.closeStore(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
