import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("dashboard memory API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const memoryModule = await readRepoFile("src/dashboard/memory.js");

  assert.match(index, /from\s+["']\.\/dashboard\/memory\.js["']/);
  assert.match(index, /createDashboardMemoryApi\(/);
  assert.match(index, /dashboardMemory\.getDashboardMemory/);
  assert.match(index, /dashboardMemory\.createMemorySupersedeEvent/);
  assert.doesNotMatch(index, /function\s+getDashboardMemory\(/);
  assert.doesNotMatch(index, /function\s+formatDashboardMemoryRecord\(/);
  assert.doesNotMatch(index, /function\s+createMemorySupersedeEvent\(/);

  assert.match(memoryModule, /export\s+function\s+createDashboardMemoryApi/);
  assert.match(memoryModule, /function\s+getDashboardMemory\(/);
  assert.match(memoryModule, /function\s+formatDashboardMemoryRecord\(/);
  assert.match(memoryModule, /function\s+createMemorySupersedeEvent\(/);
});

test("dashboard radio read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const radioModule = await readRepoFile("src/dashboard/radio.js");

  assert.match(index, /from\s+["']\.\/dashboard\/radio\.js["']/);
  assert.match(index, /createDashboardRadioApi\(/);
  assert.match(index, /dashboardRadio\.getDashboardRadio/);
  assert.doesNotMatch(index, /function\s+getDashboardRadio\(/);

  assert.match(radioModule, /export\s+function\s+createDashboardRadioApi/);
  assert.match(radioModule, /function\s+getDashboardRadio\(/);
  assert.match(radioModule, /readRadioMessages\(memoryDir\)\.slice\(-50\)/);
});

test("dashboard task read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const tasksModule = await readRepoFile("src/dashboard/tasks.js");

  assert.match(index, /from\s+["']\.\/dashboard\/tasks\.js["']/);
  assert.match(index, /createDashboardTasksApi\(/);
  assert.match(index, /dashboardTasks\.getDashboardTasks/);
  assert.doesNotMatch(index, /function\s+getDashboardTasks\(/);

  assert.match(tasksModule, /export\s+function\s+createDashboardTasksApi/);
  assert.match(tasksModule, /function\s+getDashboardTasks\(/);
  assert.match(tasksModule, /readTasks\(memoryDir\)/);
  assert.match(tasksModule, /\.slice\(0,\s*200\)/);
});
