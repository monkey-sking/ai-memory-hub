import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  closeStore,
  isMigrated,
  listProjects,
  listTasks,
  listWorkflows,
  openStore,
  verifyMirror
} from "../src/sqlite-store.js";

async function makeTempRoot(prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.mkdir(path.join(root, "tasks"), { recursive: true });
  await fs.mkdir(path.join(root, "projects"), { recursive: true });
  await fs.mkdir(path.join(root, "workflows"), { recursive: true });
  return root;
}

function writeJsonl(file, records) {
  return fs.writeFile(file, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}

function taskEvent(id, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: `evt-${id}`,
    entityId: `task-${id}`,
    action: "upsert",
    ts: now,
    record: { id: `task-${id}`, title: `Task ${id}`, status: "pending", project: "p1", createdAt: now, updatedAt: now, ...overrides }
  };
}

test("dual-write mirror is ON by default, opt-out with env AMH_SQLITE_DUALWRITE=0", async () => {
  delete process.env.AMH_SQLITE_DUALWRITE;
  const mod = await import("../src/sqlite-dualwrite.js?default-on");
  assert.equal(mod.isMirrorEnabled(), true);

  process.env.AMH_SQLITE_DUALWRITE = "0";
  const off = await import("../src/sqlite-dualwrite.js?opt-out");
  assert.equal(off.isMirrorEnabled(), false);
  delete process.env.AMH_SQLITE_DUALWRITE;
});

test("first write auto-migrates existing JSONL into SQLite", async () => {
  const root = await makeTempRoot("amh-dualwrite-migrate-");
  try {
    const now = new Date().toISOString();
    await writeJsonl(path.join(root, "tasks", "events.jsonl"), [taskEvent(1), taskEvent(2)]);
    await writeJsonl(path.join(root, "projects", "projects.jsonl"), [{ id: "p1", name: "proj", status: "active", createdAt: now, updatedAt: now }]);
    await writeJsonl(path.join(root, "workflows", "workflows.jsonl"), [{ id: "wf-1", title: "W1", status: "pending", createdAt: now, updatedAt: now }]);

    const mod = await import("../src/sqlite-dualwrite.js?auto-migrate");
    // trigger the store open without adding data (delete of a non-existent id still opens the db)
    assert.equal(mod.mirrorDelete(root, "task", "does-not-exist"), true);

    const db = openStore(path.join(root, "amh.db"));
    assert.equal(isMigrated(db), true, "auto-migration should have run on first open");
    assert.equal(listTasks(db).length, 2);
    assert.equal(listProjects(db).length, 1);
    assert.equal(listWorkflows(db).length, 1);

    const verdict = verifyMirror(db, root);
    assert.equal(verdict.consistent, true);
    assert.equal(verdict.tasks.jsonl, 2);
    assert.equal(verdict.tasks.sqlite, 2);
    assert.equal(verdict.tasks.drift, 0);
    assert.equal(verdict.projects.drift, 0);
    assert.equal(verdict.workflows.drift, 0);
  } finally {
    closeStore();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("write path keeps SQLite mirror consistent with JSONL", async () => {
  const root = await makeTempRoot("amh-dualwrite-write-");
  try {
    await writeJsonl(path.join(root, "tasks", "events.jsonl"), [taskEvent(1)]);

    const mod = await import("../src/sqlite-dualwrite.js?write-path");
    // real flow: JSONL append first, then mirror upsert — both sides must carry the SAME record
    const now = new Date().toISOString();
    const task2 = { id: "task-2", title: "Task 2", status: "pending", project: "p1", createdAt: now, updatedAt: now };
    await writeJsonl(path.join(root, "tasks", "events.jsonl"), [taskEvent(1), { id: "evt-task-2", entityId: "task-2", action: "upsert", ts: now, record: task2 }]);
    assert.equal(mod.mirrorUpsert(root, "task", [task2]), true);

    const db = openStore(path.join(root, "amh.db"));
    const verdict = verifyMirror(db, root);
    assert.equal(verdict.consistent, true);
    assert.equal(verdict.tasks.sqlite, 2);
    assert.equal(verdict.tasks.drift, 0);
  } finally {
    closeStore();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("verify reports drift when SQLite diverges from JSONL", async () => {
  const root = await makeTempRoot("amh-dualwrite-drift-");
  try {
    await writeJsonl(path.join(root, "tasks", "events.jsonl"), [taskEvent(1)]);

    const mod = await import("../src/sqlite-dualwrite.js?drift");
    assert.equal(mod.mirrorDelete(root, "task", "does-not-exist"), true);
    const db = openStore(path.join(root, "amh.db"));
    assert.equal(listTasks(db).length, 1);

    // simulate divergence: drop the row from SQLite only
    db.prepare("DELETE FROM tasks WHERE id = ?").run("task-1");

    const verdict = verifyMirror(db, root);
    assert.equal(verdict.consistent, false);
    assert.ok(verdict.tasks.missing.includes("task-1"));
    assert.equal(verdict.tasks.drift, 1);
  } finally {
    closeStore();
    await fs.rm(root, { recursive: true, force: true });
  }
});
