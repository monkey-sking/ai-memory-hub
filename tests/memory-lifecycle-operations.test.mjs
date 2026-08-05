import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");
const run = (dir, args) => spawnSync(process.execPath, [cliPath, ...args], { cwd: repoRoot, env: { ...process.env, AI_MEMORY_DIR: dir }, encoding: "utf8", windowsHide: true });
const append = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.appendFile(file, JSON.stringify(value) + "\n", "utf8"); };

test("memory lifecycle operations are append-only and hide revoked records", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-lifecycle-"));
  try {
    assert.equal(run(dir, ["init"]).status, 0);
    await append(path.join(dir, "inbox", "events.jsonl"), { id: "old", ts: "2026-08-01T00:00:00.000Z", source: "codex", text: "Old fact", metadata: { kind: "project" } });
    await append(path.join(dir, "inbox", "events.jsonl"), { id: "new", ts: "2026-08-02T00:00:00.000Z", source: "codex", text: "New fact", metadata: { kind: "correction" } });
    assert.equal(run(dir, ["sync"]).status, 0);
    let result = run(dir, ["memory", "op", "create", "--action", "supersede", "--record", "old", "--superseded-by", "new", "--reason", "correction", "--by", "codex"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    result = run(dir, ["memory", "op", "create", "--action", "revoke", "--record", "new", "--reason", "unsafe", "--by", "codex"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const operations = (await fs.readFile(path.join(dir, "memories", "operations.jsonl"), "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(operations.map((item) => item.action), ["supersede", "revoke"]);
    const ledger = (await fs.readFile(path.join(dir, "memories", "ledger.jsonl"), "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(ledger.find((item) => item.localEventId === "old")?.text || ledger.find((item) => item.id === "old")?.text, "Old fact");
    assert.equal(run(dir, ["sync"]).status, 0);
    const index = JSON.parse(await fs.readFile(path.join(dir, "memories", "index.json"), "utf8"));
    assert.equal(index.records.find((item) => item.localEventId === "old" || item.id === "old").metadata.lifecycle.state, "superseded");
    assert.equal(index.records.find((item) => item.localEventId === "new" || item.id === "new").metadata.lifecycle.state, "revoked");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("memory lifecycle apply supports dry-run and pin/review cannot undo revoke", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-lifecycle-apply-"));
  try {
    assert.equal(run(dir, ["init"]).status, 0);
    await append(path.join(dir, "inbox", "events.jsonl"), { id: "fact", ts: "2026-08-01T00:00:00.000Z", source: "codex", text: "Fact", metadata: { kind: "project" } });
    assert.equal(run(dir, ["sync"]).status, 0);
    for (const args of [
      ["memory", "op", "create", "--action", "revoke", "--record", "fact", "--reason", "unsafe", "--by", "codex"],
      ["memory", "op", "create", "--action", "pin", "--record", "fact", "--reason", "reviewed", "--by", "codex"],
      ["memory", "op", "create", "--action", "review", "--record", "fact", "--reason", "checked", "--by", "codex"]
    ]) assert.equal(run(dir, args).status, 0);
    const preview = run(dir, ["memory", "op", "apply", "--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr || preview.stdout);
    assert.equal(JSON.parse(preview.stdout).dryRun, true);
    assert.equal(run(dir, ["memory", "op", "apply"]).status, 0);
    const index = JSON.parse(await fs.readFile(path.join(dir, "memories", "index.json"), "utf8"));
    assert.equal(index.records.find((item) => item.localEventId === "fact" || item.id === "fact").metadata.lifecycle.state, "revoked");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("memory archive lowers stale records through operations without rewriting the ledger", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-memory-archive-"));
  try {
    assert.equal(run(dir, ["init"]).status, 0);
    await append(path.join(dir, "inbox", "events.jsonl"), { id: "old-low", ts: "2020-01-01T00:00:00.000Z", source: "codex", text: "Temporary working note", metadata: { kind: "note", priority: "low" } });
    assert.equal(run(dir, ["sync"]).status, 0);
    const before = await fs.readFile(path.join(dir, "memories", "ledger.jsonl"), "utf8");
    const result = run(dir, ["memory", "archive"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const after = await fs.readFile(path.join(dir, "memories", "ledger.jsonl"), "utf8");
    assert.equal(after, before);
    const operations = (await fs.readFile(path.join(dir, "memories", "operations.jsonl"), "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const ledgerRecord = JSON.parse(before.trim().split(/\r?\n/)[0]);
    assert.equal(operations.at(-1).action, "archive");
    assert.equal(operations.at(-1).target.recordId, ledgerRecord.id);
    const index = JSON.parse(await fs.readFile(path.join(dir, "memories", "index.json"), "utf8"));
    assert.equal(index.records.find((item) => item.localEventId === "old-low")?.metadata.lifecycle.state, "archived");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
