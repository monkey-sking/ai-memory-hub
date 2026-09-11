import assert from "node:assert/strict";
import test from "node:test";
import {
  inferBackupRetentionTier,
  planBackupRetention
} from "../src/lib/backup.js";

// 备份保留策略的两条硬规则：
//   1. 只有用户**手动**发起的备份受保护（reason 为空或字面量 "manual"）。
//   2. 其余有上限；未知 reason 归 ad-hoc 而不是 manual —— 早期版本归 manual，
//      导致每次自动修复产生的安全快照都永久保留，备份目录堆到 100MB。
//      （对照提交：把 inferBackupRetentionTier 的默认分支从 manual 改成 ad-hoc。）

function makeBackup(name, reason, tier = inferBackupRetentionTier(reason), createdAt = name.slice(0, 24)) {
  return { name, reason, createdAt, retentionTier: tier, retentionKey: "", bytes: 1024, dir: `/tmp/backups/${name}` };
}

test("inferBackupRetentionTier separates managed tiers from ad-hoc automatic snapshots", () => {
  assert.equal(inferBackupRetentionTier("pre-sync"), "pre-sync");
  assert.equal(inferBackupRetentionTier("pre-sync-daily"), "pre-sync");
  assert.equal(inferBackupRetentionTier("daily"), "daily");
  assert.equal(inferBackupRetentionTier("weekly"), "weekly");
  assert.equal(inferBackupRetentionTier("pre-pull"), "pre-pull");

  // 用户手动：受保护。
  assert.equal(inferBackupRetentionTier(""), "manual");
  assert.equal(inferBackupRetentionTier("manual"), "manual");

  // 自动安全快照：必须有上限，不能归 manual。
  assert.equal(inferBackupRetentionTier("pre-health-repair"), "ad-hoc");
  assert.equal(inferBackupRetentionTier("pre-capture-repair"), "ad-hoc");
  assert.equal(inferBackupRetentionTier("pre-restore"), "ad-hoc");
  // 未知 reason 同样归 ad-hoc：新增一种自动备份不会又把上限撑破。
  assert.equal(inferBackupRetentionTier("before-big-refactor"), "ad-hoc");
});

test("manual backups are protected no matter how many there are", () => {
  const backups = Array.from({ length: 30 }, (_, index) => makeBackup(`2026-09-${String((index % 9) + 1).padStart(2, "0")}T00-00-0${index % 10}-000Z-manual`, "manual"));
  const plan = planBackupRetention(backups, { daily: 1, weekly: 1, preSync: 1, adHoc: 1 });
  assert.equal(plan.prune.length, 0);
  assert.equal(plan.keep.every((backup) => backup.retention === "keep"), true);
});

test("ad-hoc automatic snapshots are capped and the newest ones win", () => {
  const backups = Array.from({ length: 6 }, (_, index) => makeBackup(`2026-09-11T00-00-0${index}-000Z-pre-capture-repair`, "pre-capture-repair"));
  const plan = planBackupRetention(backups, { daily: 0, weekly: 0, preSync: 0, prePull: 0, adHoc: 2 });

  const kept = plan.keep.map((backup) => backup.name);
  assert.equal(kept.length, 2);
  // 保留的是最新的两份（名字里的秒数最大）。
  assert.ok(kept.includes("2026-09-11T00-00-05-000Z-pre-capture-repair"));
  assert.ok(kept.includes("2026-09-11T00-00-04-000Z-pre-capture-repair"));
  assert.equal(plan.prune.length, 4);
  // 被清理的都标成 prune，便于调用方回显。
  assert.equal(plan.prune.every((backup) => backup.retention === "prune"), true);
});

test("pre-sync snapshots honour their own limit independently of ad-hoc", () => {
  const backups = [
    ...Array.from({ length: 4 }, (_, index) => makeBackup(`2026-09-11T00-00-1${index}-000Z-pre-sync`, "pre-sync")),
    ...Array.from({ length: 4 }, (_, index) => makeBackup(`2026-09-11T00-00-2${index}-000Z-pre-capture-repair`, "pre-capture-repair"))
  ];
  const plan = planBackupRetention(backups, { daily: 0, weekly: 0, preSync: 2, prePull: 0, adHoc: 2 });
  assert.equal(plan.keep.length, 4);
  assert.equal(plan.prune.length, 4);
  assert.equal(plan.keep.filter((backup) => backup.retentionTier === "pre-sync").length, 2);
  assert.equal(plan.keep.filter((backup) => backup.retentionTier === "ad-hoc").length, 2);
});

test("the newest backup is always kept even when its tier is way over budget", () => {
  const backups = Array.from({ length: 5 }, (_, index) => makeBackup(`2026-09-11T00-00-0${index}-000Z-pre-capture-repair`, "pre-capture-repair"));
  const plan = planBackupRetention(backups, { daily: 0, weekly: 0, preSync: 0, prePull: 0, adHoc: 0 });
  assert.equal(plan.keep.length, 1);
  assert.equal(plan.keep[0].name, "2026-09-11T00-00-04-000Z-pre-capture-repair");
});
