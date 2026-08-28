// Locks the v2.3 extraction: eventsCommand lives in src/commands/events.js and
// receives its CLI helpers via the `deps` injection (no index.js internals).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eventsCommand } from "../src/commands/events.js";
import * as memoryStore from "../src/memory-store.js";
import { closeStore } from "../src/sqlite-store.js";

function tmpHub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmd-events-"));
  fs.mkdirSync(path.join(dir, "inbox"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "inbox", "events.jsonl"),
    [
      JSON.stringify({ id: "1", ts: "2026-01-01T00:00:00Z", source: "manual", text: "红包版配置调整", project: "hwy" }),
      JSON.stringify({ id: "2", ts: "2026-01-02T00:00:00Z", source: "codex", text: "悟空推箱子关卡", project: "bbwk" }),
    ].join("\n") + "\n",
    "utf8"
  );
  return dir;
}

function depsFor(dir, overrides = {}) {
  return {
    loadConfig: () => ({ memoryDir: dir }),
    ensureHub: () => {},
    hasFlag: () => false,
    getOption: () => undefined,
    positionalArgs: (a) => a,
    memoryStore,
    fs,
    ...overrides,
  };
}

test("eventsCommand is exported and callable via injection", () => {
  assert.equal(typeof eventsCommand, "function");
});

test("events verify reports consistent after migration", () => {
  const dir = tmpHub();
  try {
    // Migrate the temp hub's JSONL into SQLite so the truth source matches.
    memoryStore.migrateMemoryEvents(dir);
    const chunks = [];
    const orig = process.stdout.write;
    process.stdout.write = (c) => { chunks.push(c); return true; };
    try {
      eventsCommand(["verify"], depsFor(dir));
    } finally {
      process.stdout.write = orig;
    }
    const out = chunks.join("");
    assert.match(out, /verdict: consistent/);
  } finally {
    closeStore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("events search hits via injected deps (2-char fallback path)", () => {
  const dir = tmpHub();
  try {
    const chunks = [];
    const orig = process.stdout.write;
    process.stdout.write = (c) => { chunks.push(c); return true; };
    try {
      eventsCommand(["search", "悟空"], depsFor(dir));
    } finally {
      process.stdout.write = orig;
    }
    const out = chunks.join("");
    assert.match(out, /悟空推箱子关卡/);
  } finally {
    closeStore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
