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

// ⚠️ 回归：superseded 的**两种写法**必须都被隐藏。
//
// `memory op` 写的是 `lifecycle.state = "superseded"`，而 `amh health repair --apply`
// 写的是 `superseded: true` + `metadata.lifecycle.superseded: true`，**不写 `state`**。
// 修复前 `isMemoryLifecycleVisible` 只认前者，于是真实 hub 上 25 条被软标记的重复记录
// （含 2026-09-08 那批「已修复」的历史重复）全部照旧出现在 search 结果里。
// 这个用例专门覆盖 health-repair 那种写法。
test("search hides records marked superseded without a lifecycle.state", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-superseded-visibility-"));
  try {
    assert.equal(run(dir, ["init"]).status, 0);
    await append(path.join(dir, "inbox", "events.jsonl"), {
      id: "dup-keeper", ts: "2026-09-12T00:00:00.000Z", source: "codex",
      text: "Keeper duplicate fact", metadata: { kind: "note", project: "aion" }
    });
    assert.equal(run(dir, ["sync"]).status, 0);

    // 模拟 `amh health repair --apply` 的产物：只写 superseded 标记，**不写 lifecycle.state**。
    const ledgerFile = path.join(dir, "memories", "ledger.jsonl");
    const lines = (await fs.readFile(ledgerFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const keeper = lines[0];
    const loser = {
      ...keeper,
      id: "dup-loser",
      localEventId: "dup-loser",
      text: "Loser superseded fact",
      superseded: true,
      supersededBy: ["dup-keeper"],
      metadata: {
        ...keeper.metadata,
        superseded: true,
        supersededBy: ["dup-keeper"],
        lifecycle: {
          ...(keeper.metadata?.lifecycle || {}),
          superseded: true,
          healthExcluded: true,
          healthRepair: { status: "superseded-duplicate", healthExcluded: true, duplicateOf: "dup-keeper" }
        }
      }
    };
    assert.equal(loser.metadata.lifecycle.state, undefined, "regression shape: no lifecycle.state is written");
    await fs.writeFile(ledgerFile, `${[...lines, loser].map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
    assert.equal(run(dir, ["index"]).status, 0);

    // 用两条记录各自**不同的文本**做判据，避免「搜索本身按文本去重」造成的假通过。
    const hidden = run(dir, ["search", "Loser superseded fact", "--limit", "10"]);
    assert.equal(hidden.status, 0, hidden.stderr || hidden.stdout);
    assert.doesNotMatch(hidden.stdout, /Loser superseded fact/, "a superseded record must not be searchable");

    const kept = run(dir, ["search", "Keeper duplicate fact", "--limit", "10"]);
    assert.equal(kept.status, 0, kept.stderr || kept.stdout);
    assert.match(kept.stdout, /Keeper duplicate fact/, "the keeper must stay searchable");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
