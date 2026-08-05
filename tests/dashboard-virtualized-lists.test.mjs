import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createDashboardRadioApi } from "../src/dashboard/radio.js";
import { createDashboardTasksApi } from "../src/dashboard/tasks.js";
import { mergeDashboardPage } from "../dashboard-next/src/lib/dashboardPagination.ts";
import { createEndReachedGate, getVirtualRange } from "../dashboard-next/src/lib/virtualization.ts";

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

test("memory pagination preserves the expanded virtual window", async () => {
  const source = await readDashboardSource("components/MemoryPanel.tsx");

  assert.doesNotMatch(
    source,
    /useEffect\(\(\) => \{\s*setVisibleCount\(60\)\s*\}, \[memoryRecords\.length\]\)/,
    "loading another API page must not collapse the visible memory window back to 60 rows"
  );
});

test("a 1000-item list mounts only the visible window and overscan", () => {
  const range = getVirtualRange({
    itemCount: 1000,
    itemHeight: 100,
    scrollTop: 50_000,
    viewportHeight: 620,
    overscan: 4
  });

  assert.deepEqual(range, { firstVisible: 496, lastVisible: 511 });
  assert.equal(range.lastVisible - range.firstVisible, 15);
});

test("end reached gate suppresses duplicate callbacks until reset", () => {
  const gate = createEndReachedGate();

  assert.equal(gate.tryEnter(), true);
  assert.equal(gate.tryEnter(), false);
  gate.reset();
  assert.equal(gate.tryEnter(), true);
});

test("virtual range clamps invalid geometry instead of producing NaN or Infinity", () => {
  assert.deepEqual(
    getVirtualRange({
      itemCount: 12.9,
      itemHeight: 0,
      scrollTop: -10,
      viewportHeight: -1,
      overscan: -2
    }),
    { firstVisible: 0, lastVisible: 0 }
  );
});

test("pagination keeps records without keys while deduplicating keyed records", () => {
  const current = [{ id: "one" }, { label: "unkeyed-current" }];
  const next = [{ id: "one" }, { label: "unkeyed-next" }, { id: "two" }];

  assert.deepEqual(
    mergeDashboardPage("tasks", current, next, item => item.id || "").map(item => item.id || item.label),
    ["one", "unkeyed-current", "unkeyed-next", "two"]
  );
});

test("older radio pages are prepended before the panel reverses them", () => {
  const current = [{ id: "message-3" }, { id: "message-4" }];
  const older = [{ id: "message-1" }, { id: "message-2" }, { id: "message-3" }];

  assert.deepEqual(
    mergeDashboardPage("radio", current, older, item => item.id).map(item => item.id),
    ["message-1", "message-2", "message-3", "message-4"]
  );
});
