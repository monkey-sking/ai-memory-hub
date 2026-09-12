import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");
const run = (dir, args) => spawnSync(process.execPath, [cliPath, ...args], {
  cwd: repoRoot,
  env: { ...process.env, AI_MEMORY_DIR: dir },
  encoding: "utf8",
  windowsHide: true
});
const parseJson = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};
const appendInbox = async (dir, value) => {
  const file = path.join(dir, "inbox", "events.jsonl");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
};
const searchStatus = (dir) => parseJson(run(dir, ["search", "status"]));
const searchTexts = (dir, query) => run(dir, ["search", query, "--limit", "5", "--json"]).stdout;

// 这个 bug 的症状是「静默少搜」，所以测试必须复现它的**触发条件**：
// FTS5 索引非空（于是 `amh search` 直接走 FTS5 并 return），但落后于账本。
// 在干净 hub 上测不出来 —— 那时 FTS5 是空的，搜索会回落到能搜全账本的 legacy 分支。
//
// 真实事故（2026-09-12）：FTS5 只有 117 条而账本 772 条 —— 85% 的记忆搜不到。
// 根因是 `amh record` 会增量写 FTS5，而 `sync` 完全不碰它，
// 所以凡经 inbox 进来的记录（尤其 capture 抓的全部 turn）永远进不了搜索索引。

async function seedHub(dir) {
  assert.equal(run(dir, ["init"]).status, 0);
  // ① 走 `record`：它会同时写 inbox 和 FTS5（增量插入）。
  assert.equal(run(dir, ["record", "第一条：走 record 通道写入的策展记忆", "--source", "workbuddy", "--project", "aion", "--kind", "workflow"]).status, 0);
  // ② sync 把它并进账本。此时 FTS5 非空（1 条）。
  assert.equal(run(dir, ["sync"]).status, 0);
  assert.equal(searchStatus(dir).byType.memory, 1, "precondition: FTS5 must be non-empty");
}

test("sync rebuilds the FTS5 index so inbox-only records become searchable", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-fts-sync-"));
  try {
    await seedHub(dir);
    // ③ 模拟 capture：事件只进 inbox，不经过 `record` 的增量 FTS5 写入。
    await appendInbox(dir, {
      id: "captured-turn", ts: "2026-09-12T00:00:00.000Z", source: "codex",
      text: "折线图 用 双 Y 轴 展示 转化率 与 客单价 的背离",
      metadata: { kind: "turn", project: "aion" }
    });
    assert.equal(run(dir, ["sync"]).status, 0);

    // FTS5 必须跟上账本，否则下一句搜索就是静默少搜。
    const status = searchStatus(dir);
    assert.equal(status.byType.memory, 2, "FTS5 must cover the newly synced record");

    // 端到端：捕获进来的内容必须搜得到。
    const results = searchTexts(dir, "折线图 双 Y 轴 转化率 背离");
    assert.match(results, /双 Y 轴/, `expected the captured turn in search results, got: ${results.slice(0, 200)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("sync reports the rebuilt search index size", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-fts-report-"));
  try {
    await seedHub(dir);
    const out = run(dir, ["sync"]).stdout;
    assert.match(out, /Rebuilt FTS5 search index: \d+ record\(s\)/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("index rebuilds the search index too, not just MEMORY.md", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-fts-index-"));
  try {
    await seedHub(dir);
    const dbFile = path.join(dir, "search-index.db");
    const hasDb = await fs.access(dbFile).then(() => true, () => false);
    assert.ok(hasDb, "expected the FTS5 database to exist after record+sync");

    const out = run(dir, ["index"]).stdout;
    assert.match(out, /Rebuilt FTS5 search index for \d+ record\(s\)/);
    assert.equal(searchStatus(dir).byType.memory, 1, "index must leave the search index covering the ledger");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("sync keeps the search index fresh even when there is nothing new to index", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-fts-noop-"));
  try {
    await seedHub(dir);
    // 直接往账本灌一条，绕过 sync 的 FTS5 重建 → 制造「FTS5 落后」的状态。
    await fs.appendFile(path.join(dir, "memories", "ledger.jsonl"), `${JSON.stringify({
      id: "sneaked-in", localEventId: "sneaked-in", schemaVersion: 2,
      ts: "2026-09-12T00:00:00.000Z", indexedAt: "2026-09-12T00:00:00.000Z",
      source: "codex", text: "偷偷进了账本的一条", kind: "note", project: "aion", tags: [],
      scope: "", refs: {}, confidence: 1, device: "test", metadata: {}
    })}\n`, "utf8");
    assert.equal(searchStatus(dir).byType.memory, 1, "precondition: index lags the ledger");

    // 无新事件的 sync 是常态路径（capture 定时器多数轮次都扫到 0 条），
    // 它同样必须重建搜索索引，否则落后的索引会一直落后。
    const out = run(dir, ["sync"]).stdout;
    assert.match(out, /No pending memory events/);
    assert.match(out, /Rebuilt FTS5 search index: 2 record\(s\)/);
    assert.equal(searchStatus(dir).byType.memory, 2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("search warns when the FTS5 index lags the ledger", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-fts-warn-"));
  try {
    await seedHub(dir);
    // 直接往账本里灌 4 条，绕过 sync 的 FTS5 重建 —— 只留 FTS5 的 1 条。
    const ledgerFile = path.join(dir, "memories", "ledger.jsonl");
    const extra = Array.from({ length: 4 }, (_, index) => JSON.stringify({
      id: `bulk-${index}`, localEventId: `bulk-${index}`, schemaVersion: 2,
      ts: "2026-09-12T00:00:00.000Z", indexedAt: "2026-09-12T00:00:00.000Z",
      source: "codex", text: `批量注入的记录 ${index}`, kind: "note", project: "aion", tags: [],
      scope: "", refs: {}, confidence: 1, device: "test", metadata: {}
    })).join("\n");
    await fs.appendFile(ledgerFile, `${extra}\n`, "utf8");

    const result = run(dir, ["search", "批量注入"]);
    assert.match(result.stderr, /FTS5 index looks stale/, "expected a staleness warning on stderr");
    assert.match(result.stderr, /search rebuild/, "the warning must point at the repair command");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
