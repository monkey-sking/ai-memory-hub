import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");

function runCli(memoryDir, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, AI_MEMORY_DIR: memoryDir },
    encoding: "utf8",
  });
}

function parseJson(r) {
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

async function withHub(fn) {
  const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), "amh-compaction-"));
  try {
    const init = runCli(memoryDir, ["init"]);
    assert.equal(init.status, 0, init.stderr || init.stdout);
    await fn(memoryDir);
  } finally {
    fs.rmSync(memoryDir, { recursive: true, force: true });
  }
}

test("compaction lock: clean pass is not an orphan", async () => {
  const mod = await import(path.join(repoRoot, "src", "compaction-lock.js"));
  const file = path.join(os.tmpdir(), "compaction-clean-" + Date.now() + ".jsonl");
  try {
    mod.acquireCompactionLock(file, "sess-ok", { count: 100 });
    mod.summarizeCompaction(file, "sess-ok", { done: 100 });
    mod.releaseCompactionLock(file, "sess-ok", { count: 100 });
    const orphans = mod.scanCompactionLocks(mod.readCompactionEvents(file));
    assert.equal(orphans.length, 0, "clean pass should have no orphan lock");
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("compaction lock: interrupted pass is flagged as orphan", async () => {
  const mod = await import(path.join(repoRoot, "src", "compaction-lock.js"));
  const file = path.join(os.tmpdir(), "compaction-crash-" + Date.now() + ".jsonl");
  try {
    mod.acquireCompactionLock(file, "sess-crash", { count: 200 });
    const orphans = mod.scanCompactionLocks(mod.readCompactionEvents(file));
    assert.equal(orphans.length, 1, "one orphan expected");
    assert.equal(orphans[0].sessionId, "sess-crash");
    assert.match(orphans[0].type, /start/);
    assert.match(orphans[0].reason, /no matching compaction:end/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("blockReason: block stores machine code + message, resume clears it", async () => {
  await withHub((memoryDir) => {
    const task = parseJson(runCli(memoryDir, ["task", "add", "tmp-blockreason", "--project", "hermes", "--by", "hermes"]));
    const id = task.id;
    const blocked = parseJson(runCli(memoryDir, ["task", "status", "--id", id, "--status", "blocked", "--code", "quota-exceeded", "--message", "upstream down"]));
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.blockReason.code, "quota-exceeded");
    assert.equal(blocked.blockReason.message, "upstream down");

    const bad = runCli(memoryDir, ["task", "status", "--id", id, "--status", "blocked", "--code", "BAD CODE!"]);
    assert.notEqual(bad.status, 0, "invalid code must be rejected");

    const resumed = parseJson(runCli(memoryDir, ["task", "status", "--id", id, "--status", "in_progress"]));
    assert.equal(resumed.blockReason, undefined, "blockReason cleared on resume");

    const list = parseJson(runCli(memoryDir, ["task", "list", "--status", "active"]));
    assert.ok(list.find((t) => t.id === id), "task still listable (zero migration)");
  });
});