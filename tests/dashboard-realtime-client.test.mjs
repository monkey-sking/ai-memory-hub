import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const dashboardRoot = path.join(repoRoot, "dashboard-next", "src");

async function readDashboardSource(relativePath) {
  return readFile(path.join(dashboardRoot, relativePath), "utf8");
}

test("dashboard realtime client reconnects and cleans up its WebSocket", async () => {
  const realtime = await readDashboardSource("lib/realtime.ts");

  assert.match(realtime, /export function createDashboardRealtimeClient/);
  assert.match(realtime, /new WebSocket\(/);
  assert.match(realtime, /setTimeout\([\s\S]*connect\(\)/);
  assert.match(realtime, /Math\.min\(/);
  assert.match(realtime, /clearTimeout\(/);
  assert.match(realtime, /(?:socket|currentSocket|nextSocket)\.close\(/);
});

test("Dashboard subscribes to realtime snapshots instead of polling", async () => {
  const dashboard = await readDashboardSource("pages/Dashboard.tsx");

  assert.match(dashboard, /from ['"]\.\.\/lib\/realtime['"]/);
  assert.match(dashboard, /createDashboardRealtimeClient\(/);
  assert.match(dashboard, /onSnapshot/);
  assert.doesNotMatch(dashboard, /setInterval\(/);
});
