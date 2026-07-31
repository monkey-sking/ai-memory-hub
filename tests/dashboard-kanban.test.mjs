import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskKanban } from "../src/dashboard/tasks.js";

test("task kanban groups work by lifecycle status without losing task order", () => {
  const tasks = [
    { id: "1", status: "open", title: "Open" },
    { id: "2", status: "in_progress", title: "Running" },
    { id: "3", status: "blocked", title: "Blocked" },
    { id: "4", status: "done", title: "Done" }
  ];

  const kanban = buildTaskKanban(tasks);

  assert.deepEqual(kanban.open.map((task) => task.id), ["1"]);
  assert.deepEqual(kanban.in_progress.map((task) => task.id), ["2"]);
  assert.deepEqual(kanban.blocked.map((task) => task.id), ["3"]);
  assert.deepEqual(kanban.done.map((task) => task.id), ["4"]);
  assert.deepEqual(kanban.claimed, []);
});
