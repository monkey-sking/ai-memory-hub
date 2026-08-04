import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createDashboardRadioApi } from "../src/dashboard/radio.js";
import { createDashboardTasksApi } from "../src/dashboard/tasks.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function readDashboardSource(relativePath) {
  return readFile(path.join(repoRoot, "dashboard-next", "src", relativePath), "utf8");
}

test("dashboard virtual list renders only the visible window with overscan", async () => {
  const source = await readDashboardSource("components/VirtualizedList.tsx");

  assert.match(source, /export function VirtualizedList/);
  assert.match(source, /overscan/);
  assert.match(source, /scrollTop/);
  assert.match(source, /translateY/);
  assert.match(source, /ResizeObserver/);
});

test("task and radio APIs expose paged windows for lazy loading", () => {
  const tasks = Array.from({ length: 5 }, (_, index) => ({ id: `task-${index}`, status: "open", updatedAt: `2026-08-0${index + 1}` }));
  const radio = Array.from({ length: 5 }, (_, index) => ({ id: `message-${index}`, ts: `2026-08-0${index + 1}` }));
  const taskApi = createDashboardTasksApi({ readTasks: () => tasks });
  const radioApi = createDashboardRadioApi({ readRadioMessages: () => radio });

  assert.deepEqual(taskApi.getDashboardTasks("memory", "all", { offset: 1, limit: 2 }).tasks.map(item => item.id), ["task-3", "task-2"]);
  assert.deepEqual(radioApi.getDashboardRadio("memory", { offset: 1, limit: 2 }).messages.map(item => item.id), ["message-2", "message-3"]);
  assert.equal(taskApi.getDashboardTasks("memory", "all", { offset: 1, limit: 2 }).hasMore, true);
  assert.equal(radioApi.getDashboardRadio("memory", { offset: 1, limit: 2 }).hasMore, true);
});

test("task, radio, and memory panels use virtual lazy lists", async () => {
  const [tasks, radio, memory] = await Promise.all([
    readDashboardSource("components/TasksPanel.tsx"),
    readDashboardSource("components/RadioPanel.tsx"),
    readDashboardSource("components/MemoryPanel.tsx")
  ]);

  for (const source of [tasks, radio, memory]) {
    assert.match(source, /VirtualizedList/);
    assert.match(source, /onEndReached/);
  }
});
