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
const append = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
};
const readLedger = async (dir) => (await fs.readFile(path.join(dir, "memories", "ledger.jsonl"), "utf8"))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

// 早期噪声过滤漏了交互客户端注入的 ambient 块，已入库记录的正文会以环境状态开头，
// 真人请求被挤到后面。capture repair 负责把这段前缀剥掉。
const POLLUTED = [
  '<in-app-browser-context source="ambient-ui-state">',
  "This block is automatically supplied ambient UI state, not part of the user's request.",
  "- Current URL: file:///x/index.html",
  "</in-app-browser-context>",
  "",
  "## My request:",
  "进行下消融实验"
].join("\n");
const CLEAN = "帮我把 lock 事件日志加上保留策略";

async function seedHub(dir) {
  assert.equal(run(dir, ["init"]).status, 0);
  await append(path.join(dir, "inbox", "events.jsonl"), {
    id: "polluted", ts: "2026-09-10T00:00:00.000Z", source: "codex", text: POLLUTED,
    metadata: { kind: "turn", project: "aion" }
  });
  await append(path.join(dir, "inbox", "events.jsonl"), {
    id: "clean", ts: "2026-09-10T00:01:00.000Z", source: "codex", text: CLEAN,
    metadata: { kind: "turn", project: "aion" }
  });
  assert.equal(run(dir, ["sync"]).status, 0);
}

test("capture repair previews without touching the ledger", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-capture-repair-"));
  try {
    await seedHub(dir);
    const before = await readLedger(dir);

    const preview = run(dir, ["capture", "repair"]);
    assert.equal(preview.status, 0, preview.stderr || preview.stdout);
    const plan = JSON.parse(preview.stdout);
    assert.equal(plan.apply, false);
    assert.equal(plan.repairable, 1);
    assert.equal(plan.applied.ledgerRecordsUpdated, 0);

    // 只读预览不得改动账本。
    assert.deepEqual(await readLedger(dir), before);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("capture repair strips the injected prefix and leaves clean records alone", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-capture-repair-apply-"));
  try {
    await seedHub(dir);
    const cleanBefore = (await readLedger(dir)).find((item) => item.localEventId === "clean");

    const applied = run(dir, ["capture", "repair", "--apply"]);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const result = JSON.parse(applied.stdout);
    assert.equal(result.applied.ledgerRecordsUpdated, 1);
    assert.equal(result.after.pollutedRecords, 0);

    const ledger = await readLedger(dir);
    const repaired = ledger.find((item) => item.localEventId === "polluted");
    assert.equal(repaired.text, "进行下消融实验");
    assert.ok(!repaired.text.includes("in-app-browser-context"));
    assert.ok(repaired.repairedAt);
    // 去重键不能被改动，否则同一条会被重复入账。
    assert.equal(repaired.localEventId, "polluted");

    const clean = ledger.find((item) => item.localEventId === "clean");
    assert.equal(clean.text, cleanBefore.text);
    assert.equal(clean.repairedAt, undefined);

    // 幂等：再跑一次没有可修的东西，也不该落盘。
    const second = JSON.parse(run(dir, ["capture", "repair", "--apply"]).stdout);
    assert.equal(second.repairable, 0);
    assert.equal(second.applied.ledgerRecordsUpdated, 0);

    // 修复不会动记录条数。
    assert.equal(ledger.length, 2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
