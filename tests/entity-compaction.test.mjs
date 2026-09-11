import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { planCompaction, renderCompacted, splitJsonl } from "../src/lib/entity-compaction.js";

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
const readLines = async (file) => (await fs.readFile(file, "utf8")).split(/\r?\n/).filter((line) => line.trim());

// 事件日志膨胀的正解：任务只存「全量快照」事件，改 48 次就有 48 份完整记录。
// 折算只保留每个 id 决定当前状态的那一条，其余归档。这个测试锁死两件事：
//   1. 折算后的投影必须与折算前**逐字节相同**（否则就是 silently 改了数据）
//   2. 重复执行是幂等的（这样 --auto 才能挂到定时器上）

function taskEvent(id, notes, updatedAt) {
  return {
    id: `evt-${id}-${updatedAt}`,
    schemaVersion: 1,
    ts: updatedAt,
    source: "ai-memory-hub",
    entity: "task",
    action: "upsert",
    type: "task.upsert",
    entityId: id,
    reason: "task:write",
    record: {
      id,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt,
      createdBy: "workbuddy",
      status: "in_progress",
      priority: "P1",
      project: "aion",
      title: `task ${id}`,
      notes
    }
  };
}

test("planCompaction keeps the last state event per id and drops the rest", () => {
  // 故意让 a、b 的「首次出现」顺序与「最后出现」顺序相反：
  //   a 先出现（0），但 a 的锚点（4）排在 b 的锚点（2）之后。
  // 按锚点位次输出会得到 [b, a]，重放顺序就与原日志相反了。
  const lines = [
    JSON.stringify(taskEvent("a", ["n1"], "2026-09-01T01:00:00.000Z")),
    JSON.stringify(taskEvent("b", ["m1"], "2026-09-01T01:00:00.000Z")),
    JSON.stringify(taskEvent("b", ["m1", "m2"], "2026-09-01T02:00:00.000Z")),
    JSON.stringify(taskEvent("a", ["n1", "n2"], "2026-09-01T02:00:00.000Z")),
    JSON.stringify(taskEvent("a", ["n1", "n2", "n3"], "2026-09-01T03:00:00.000Z"))
  ];

  const plan = planCompaction(lines);
  assert.equal(plan.stats.totalEvents, 5);
  assert.equal(plan.stats.keptEvents, 2);
  assert.equal(plan.stats.droppedEvents, 3);
  assert.equal(plan.stats.ids, 2);
  assert.equal(plan.stats.foldedIds, 2);
  assert.equal(plan.stats.maxEventsPerId, 3);

  // 保留下来的必须是「最后一条」，即 notes 最全的那些。
  const kept = plan.keep.map((entry) => JSON.parse(entry.raw));
  assert.deepEqual(kept.map((event) => event.record.notes.length), [3, 2]);
  // 关键：输出顺序按「该 id 首次出现的位次」（a=0 在 b=1 前），不按锚点位次。
  assert.deepEqual(plan.keep.map((entry) => entry.index), [4, 2]);
  assert.equal(renderCompacted(plan.keep).split("\n").filter(Boolean).length, 2);
});

test("planCompaction retires an id whose last event is a delete", () => {
  const lines = [
    JSON.stringify(taskEvent("gone", ["n1"], "2026-09-01T01:00:00.000Z")),
    JSON.stringify({
      id: "evt-del", ts: "2026-09-01T02:00:00.000Z", source: "ai-memory-hub",
      entity: "task", action: "delete", type: "task.delete", entityId: "gone", reason: "task:delete"
    })
  ];
  const plan = planCompaction(lines);
  // 实体已不存在，留不留事件都不影响重放结果——两条都可以丢。
  assert.equal(plan.stats.totalEvents, 2);
  assert.equal(plan.stats.keptEvents, 0);
  assert.equal(plan.stats.droppedEvents, 2);
});

test("planCompaction never touches lines it does not understand", () => {
  const opaque = [
    '{"entity":"compaction","action":"start","type":"compaction.start","entityId":"s1"}',
    "{ this is not json",
    JSON.stringify({ type: "task.upsert" }) // 没有 id -> 重放时本来就被跳过
  ];
  const lines = [
    opaque[0],
    JSON.stringify(taskEvent("a", ["n1"], "2026-09-01T01:00:00.000Z")),
    opaque[1],
    JSON.stringify(taskEvent("a", ["n1", "n2"], "2026-09-01T02:00:00.000Z")),
    opaque[2]
  ];
  const plan = planCompaction(lines);
  const keptRaw = plan.keep.map((entry) => entry.raw);
  // 无法识别的行逐字保留，且顺序不变。
  assert.deepEqual(keptRaw, [opaque[0], lines[3], opaque[1], opaque[2]]);
  assert.equal(plan.stats.droppedEvents, 1);
});

test("planCompaction is a no-op on an already-folded log", () => {
  const lines = [
    JSON.stringify(taskEvent("a", ["n1"], "2026-09-01T01:00:00.000Z")),
    JSON.stringify(taskEvent("b", ["m1"], "2026-09-01T01:00:00.000Z"))
  ];
  assert.equal(planCompaction(lines).stats.droppedEvents, 0);
  // 空文件与全空行同样安全。
  assert.equal(planCompaction([]).stats.totalEvents, 0);
  assert.equal(planCompaction([""]).stats.totalEvents, 0);
});

test("planCompaction drops marker noise but keeps an unended start", () => {
  const marker = (phase, sessionId) => JSON.stringify({
    id: `m-${sessionId}-${phase}`, ts: "2026-09-01T00:00:00.000Z", source: "ai-memory-hub",
    entity: "compaction", action: phase, type: `compaction.${phase}`, entityId: sessionId
  });
  const openStart = marker("start", "s-open");
  const lines = [
    marker("end", "s-orphan"),                       // 0 孤立 end（没有 start）-> 噪声
    JSON.stringify(taskEvent("a", ["n1"], "2026-09-01T01:00:00.000Z")),
    JSON.stringify(taskEvent("a", ["n1", "n2"], "2026-09-01T02:00:00.000Z")),
    openStart                                        // 3 未收尾的 start -> 必须留
  ];

  const plan = planCompaction(lines);
  const keptRaw = plan.keep.map((entry) => entry.raw);
  // 未收尾的 start 留着（它正是「上次折算被中断」的证据），孤立 end 丢掉。
  assert.deepEqual(keptRaw, [lines[2], openStart]);
  assert.equal(plan.stats.droppedEvents, 2); // 被取代的 a + 孤立的 end
});

test("splitJsonl drops only the trailing newline artifact", () => {
  assert.deepEqual(splitJsonl("a\nb\n"), ["a", "b"]);
  assert.deepEqual(splitJsonl("a\nb"), ["a", "b"]);
  assert.deepEqual(splitJsonl(""), []);
});

async function seedHub(dir) {
  assert.equal(run(dir, ["init"]).status, 0);
  const file = path.join(dir, "tasks", "events.jsonl");
  // 同一个任务写 4 次（模拟 notes 越滚越大），另一个任务写 2 次。
  await append(file, taskEvent("task-a", ["n1"], "2026-09-01T01:00:00.000Z"));
  await append(file, taskEvent("task-b", ["m1"], "2026-09-01T01:00:00.000Z"));
  await append(file, taskEvent("task-a", ["n1", "n2"], "2026-09-01T02:00:00.000Z"));
  await append(file, taskEvent("task-a", ["n1", "n2", "n3"], "2026-09-01T03:00:00.000Z"));
  await append(file, taskEvent("task-b", ["m1", "m2"], "2026-09-01T02:00:00.000Z"));
  await append(file, taskEvent("task-a", ["n1", "n2", "n3", "n4"], "2026-09-01T04:00:00.000Z"));
  // sync 会 rebuildEventSourcedProjections，把事件重放成 tasks.jsonl。
  const sync = run(dir, ["sync"]);
  assert.equal(sync.status, 0, sync.stderr || sync.stdout);
}

test("compact previews without rewriting the event log", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-compact-preview-"));
  try {
    await seedHub(dir);
    const eventsFile = path.join(dir, "tasks", "events.jsonl");
    const before = await fs.readFile(eventsFile, "utf8");

    const preview = run(dir, ["compact", "--entity", "task"]);
    assert.equal(preview.status, 0, preview.stderr || preview.stdout);
    const plan = JSON.parse(preview.stdout);
    assert.equal(plan.apply, false);
    assert.equal(plan.backup, null);
    const task = plan.entities.find((row) => row.entity === "task");
    assert.equal(task.droppedEvents, 4);
    assert.equal(task.keptEvents, 2);
    assert.equal(task.projectionPreserved, true);

    assert.equal(await fs.readFile(eventsFile, "utf8"), before);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("compact --apply folds the log, preserves the projection byte-for-byte, and is idempotent", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-compact-apply-"));
  try {
    await seedHub(dir);
    const eventsFile = path.join(dir, "tasks", "events.jsonl");
    const projectionFile = path.join(dir, "tasks", "tasks.jsonl");
    const projectionBefore = await fs.readFile(projectionFile, "utf8");
    assert.equal((await readLines(eventsFile)).length, 6);

    const applied = run(dir, ["compact", "--entity", "task", "--apply"]);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const result = JSON.parse(applied.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.backup.reason, "pre-compact");

    // 事件被折算到每个 id 一条。
    const after = await readLines(eventsFile);
    const taskEvents = after.map((line) => JSON.parse(line)).filter((event) => event.entity === "task");
    assert.equal(taskEvents.length, 2);
    assert.deepEqual(taskEvents.map((event) => event.entityId).sort(), ["task-a", "task-b"]);
    // 留下的是 notes 最全的那版，没有丢状态。
    assert.equal(taskEvents.find((event) => event.entityId === "task-a").record.notes.length, 4);

    // 最关键的保证：投影逐字节不变。
    assert.equal(await fs.readFile(projectionFile, "utf8"), projectionBefore);
    // 折算不该顺带重写投影（投影若被改写说明它原本就漂移了，得单独查）。
    assert.equal(result.entities.find((entry) => entry.entity === "task").projectionRewritten, false);

    // 被丢弃的事件进了 gzip 归档，没有销毁。
    const row = result.entities.find((entry) => entry.entity === "task");
    assert.ok(row.archive, "expected an archive file");
    const archived = zlib.gunzipSync(await fs.readFile(row.archive.file)).toString("utf8").trim().split("\n");
    assert.equal(archived.length, 4);

    // 三阶段标记必须成套落盘：start 若被重写抹掉，崩溃就再也查不出来了。
    const lockMod = await import(path.join(repoRoot, "src", "compaction-lock.js"));
    const markers = lockMod.readCompactionEvents(eventsFile);
    assert.deepEqual(markers.map((event) => event.type).sort(), [
      "compaction.end", "compaction.start", "compaction.summary"
    ]);
    assert.equal(lockMod.scanCompactionLocks(markers).length, 0, "a finished pass must not look orphaned");

    // 幂等：再跑一次没有任何可折算的。
    const second = run(dir, ["compact", "--entity", "task", "--apply"]);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondResult = JSON.parse(second.stdout);
    const secondRow = secondResult.entities.find((entry) => entry.entity === "task");
    assert.equal(secondRow.droppedEvents, 0);
    assert.equal(secondRow.applied, false);
    assert.equal(secondRow.reason, "nothing to fold");
    // 空转不留归档。
    const archives = await fs.readdir(path.join(dir, "tasks", "archive"));
    assert.equal(archives.length, 1);
    assert.equal(await fs.readFile(projectionFile, "utf8"), projectionBefore);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("compact --auto skips a log below the threshold and reports why", async () => {
  const dir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-compact-auto-"));
  try {
    await seedHub(dir);
    const result = JSON.parse(run(dir, ["compact", "--entity", "task", "--apply", "--auto"]).stdout);
    const row = result.entities.find((entry) => entry.entity === "task");
    assert.equal(row.applied, false);
    assert.match(row.reason, /below --auto threshold/);
    assert.equal((await readLines(path.join(dir, "tasks", "events.jsonl"))).length, 6);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
