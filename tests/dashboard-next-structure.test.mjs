import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const srcRoot = path.resolve(import.meta.dirname, '..', 'dashboard-next', 'src');
const readSource = relative => readFile(path.join(srcRoot, relative), 'utf8');

test('Dashboard routes are lazy-loaded under the shared layout', async () => {
  const app = await readSource('App.tsx');
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/Overview'\)\)/);
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/Extensions'\)\)/);
  assert.match(app, /<Route path="dashboard" element=\{<Overview \/>\}/);
  assert.match(app, /<Route path="extensions" element=\{<Extensions \/>\}/);
  assert.match(app, /<Suspense fallback=\{<RouteFallback \/>\}>/);
});

test('Dashboard copy and tool metadata remain centralized', async () => {
  const overview = await readSource('pages/Overview.tsx');
  const copy = await readSource('lib/dashboardCopy.ts');
  const tools = await readSource('lib/toolMetadata.ts');
  assert.match(overview, /dashboardLabels/);
  assert.match(copy, /export const dashboardLabels/);
  assert.match(tools, /export const toolIconFiles/);
});

test('Task actions expose accessible menus and protect terminal states', async () => {
  const tasks = await readSource('components/TasksPanel.tsx');
  assert.match(tasks, /aria-haspopup=['"]menu['"]/);
  assert.match(tasks, /role=['"]menuitem['"]/);
  assert.match(tasks, /cancelledTerminal/);
  assert.match(tasks, /status === 'done'/);
});

test('Dashboard panels expose empty states and centralized copy', async () => {
  const overview = await readSource('pages/Overview.tsx');
  const tasks = await readSource('pages/Tasks.tsx');
  assert.match(overview, /EmptyState/);
  assert.match(tasks, /EmptyState/);
  assert.match(overview, /copy\./);
});

test('Dashboard shell keeps responsive layout and design tokens', async () => {
  const css = await readSource('pages/Dashboard.css');
  assert.match(css, /@media\s*\(max-width:/);
  assert.match(css, /\.dashboard-grid/);
  assert.match(css, /\.command-center/);
  assert.match(css, /var\(--(?:accent|color-accent|border|color-line)/);
});

test('Memory supersede and radio reply use dedicated APIs', async () => {
  const memory = await readSource('components/MemoryPanel.tsx');
  const radio = await readSource('components/RadioPanel.tsx');
  assert.match(memory, /memory\/supersede/);
  assert.match(radio, /replyTo/);
  assert.match(radio, /thread/);
});
