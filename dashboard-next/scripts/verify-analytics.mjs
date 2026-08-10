// Data-honesty probe for /analytics and /dispatch.
//
// The bug class this guards against: the page renders a confident number that
// contradicts the API response it just received (a "0" next to a 200 that said 240),
// or a number that is really an array length capped server-side (100 rows shown as
// "100 active" when 4 are actually running).
//
// So every assertion here compares the RENDERED DOM against the API payload captured
// off the wire during the same direct load (page.goto, never client-side navigation --
// client-side navigation leaves stale sections in the store and would mask the bug).
//
// Exits non-zero on any divergence.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5271';

// Resting states of the relay state machine (src/index.js ASYNC_CALL_TRANSITIONS plus
// the terminal "failed-permanent" written by the dispatch runner). Everything else is
// still in flight and therefore genuinely active.
const TERMINAL_RELAY_STATES = new Set(['completed', 'failed', 'failed-permanent', 'abandoned']);
// Must match ACTIVE_TASK_STATUSES in src/pages/Dashboard.tsx.
const ACTIVE_TASK_STATUSES = ['open', 'claimed', 'in_progress'];

const results = [];
function check(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n        ${detail}` : ''}`);
}

/** "1,234" -> 1234. Rendered numbers go through toLocaleString(). */
function parseRendered(text) {
  const cleaned = String(text ?? '').replace(/[^0-9.-]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

function sortedPairs(map) {
  return Object.entries(map || {})
    .map(([key, value]) => [key, Number(value)])
    .filter(([key, value]) => key && value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Scrape every shell Panel: its title, its BarList rows, and whether it fell back to
 * an EmptyState. Uses the design-system data-slot contract rather than layout classes.
 */
const SCRAPE = () => {
  const panels = [...document.querySelectorAll('[data-slot="panel"]')].map((panel) => {
    const body = panel.querySelector('[data-slot="panel-body"]') || panel;
    return {
      title: (panel.querySelector('[data-slot="panel-header"] h2')?.innerText || '').trim(),
      rows: [...body.querySelectorAll('.bar-row')].map((row) => [
        (row.querySelector('.bar-row-label span')?.innerText || '').trim(),
        (row.querySelector('.bar-row-label strong')?.innerText || '').trim()
      ]),
      empty: (body.querySelector('[data-slot="empty-state"] p')?.innerText || '').trim()
    };
  });
  const summary = (line) =>
    [...document.querySelectorAll(`${line} > span`)].map((span) => {
      const value = (span.querySelector('strong')?.innerText || '').trim();
      return { value, label: span.innerText.replace(value, '').trim() };
    });
  return {
    panels,
    analyticsSummary: summary('.dashboard-summary-line'),
    dispatchSummary: summary('.dispatch-summary-line'),
    emptyStateTexts: [...document.querySelectorAll('[data-slot="empty-state"] p')]
      .map((p) => p.innerText.trim())
      .filter((text) => text === '暂无数据')
  };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message}`));

/** Capture API payloads as the page itself fetches them -- not via a side-channel. */
const captured = new Map();
page.on('response', async (response) => {
  const path = new URL(response.url()).pathname;
  if (!path.startsWith('/api/')) return;
  if (!response.ok()) return;
  try { captured.set(path, await response.json()); } catch { /* non-JSON */ }
});

/**
 * Direct load only. Waits for the route's own API call rather than a fixed delay --
 * a cold Vite transform can push the first fetch past `networkidle` and would
 * otherwise produce a spurious "no response captured" failure.
 */
async function loadRoute(route, apiPath) {
  captured.clear();
  consoleErrors.length = 0;
  const settled = page
    .waitForResponse((r) => new URL(r.url()).pathname === apiPath && r.ok(), { timeout: 30000 })
    .catch(() => null);
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await settled;
  await page.waitForTimeout(1000);
}

// ---------------------------------------------------------------- /analytics
console.log('=== direct load: /analytics ===');
await loadRoute('/analytics', '/api/metrics');

const metrics = captured.get('/api/metrics');
check(Boolean(metrics), '/analytics fetched /api/metrics on direct load',
  metrics ? `tasks.total=${metrics.tasks.total} radio.total=${metrics.radio?.total} relay.total=${metrics.relay.total}` : 'no /api/metrics response captured');

if (!metrics) {
  await browser.close();
  process.exit(1);
}

const analytics = await page.evaluate(SCRAPE);
const panelByTitle = new Map(analytics.panels.map((p) => [p.title, p]));

console.log('\n  API  tasks.byStatus     = ' + JSON.stringify(metrics.tasks.byStatus));
console.log('  API  tasks.total        = ' + metrics.tasks.total);
console.log('  API  radio.byType       = ' + JSON.stringify(metrics.radio?.byType));
console.log('  API  relay.byStatus     = ' + JSON.stringify(metrics.relay.byStatus));
console.log('  DOM  summary line       = ' + JSON.stringify(analytics.analyticsSummary));
for (const panel of analytics.panels) {
  console.log(`  DOM  panel "${panel.title}" = ${panel.rows.length ? JSON.stringify(panel.rows) : `EMPTY(${panel.empty || '?'})`}`);
}
console.log('');

// 1. The task-status chart must equal metrics.tasks.byStatus exactly (key AND count).
const taskPanel = panelByTitle.get('任务状态分布');
if (!taskPanel) {
  check(false, 'task-status chart is present', 'no panel titled 任务状态分布');
} else {
  const expected = sortedPairs(metrics.tasks.byStatus);
  const rendered = taskPanel.rows.map(([key, value]) => [key, parseRendered(value)]);
  check(JSON.stringify(rendered) === JSON.stringify(expected),
    'rendered task-status chart == metrics.tasks.byStatus',
    `rendered=${JSON.stringify(rendered)}\n        expected=${JSON.stringify(expected)}`);
}

// 2. The rendered total must equal metrics.tasks.total, and the chart must add up to it.
const totalTile = analytics.analyticsSummary.find((item) => item.label === '任务总数');
check(Boolean(totalTile) && parseRendered(totalTile.value) === metrics.tasks.total,
  'rendered 任务总数 == metrics.tasks.total',
  `rendered=${totalTile ? totalTile.value : '<missing tile>'} expected=${metrics.tasks.total}`);

const chartSum = Object.values(metrics.tasks.byStatus).reduce((sum, n) => sum + Number(n), 0);
check(chartSum === metrics.tasks.total,
  'task-status chart accounts for every task',
  `sum(byStatus)=${chartSum} total=${metrics.tasks.total}`);

// 3. 活跃任务 must be the non-terminal slice of byStatus, never the whole total.
const activeTile = analytics.analyticsSummary.find((item) => item.label === '活跃任务');
const expectedActive = ACTIVE_TASK_STATUSES.reduce((sum, s) => sum + Number(metrics.tasks.byStatus[s] || 0), 0);
check(Boolean(activeTile) && parseRendered(activeTile.value) === expectedActive,
  'rendered 活跃任务 == sum of open/claimed/in_progress',
  `rendered=${activeTile ? activeTile.value : '<missing tile>'} expected=${expectedActive}`);

// 4. Radio / relay / project charts must also come from the full-dataset aggregates.
for (const [title, source] of [
  ['Radio 类型分布', metrics.radio?.byType],
  ['Relay 状态分布', metrics.relay.byStatus]
]) {
  const panel = panelByTitle.get(title);
  const expected = sortedPairs(source).slice(0, 8);
  const rendered = panel ? panel.rows.map(([key, value]) => [key, parseRendered(value)]) : null;
  check(Boolean(panel) && JSON.stringify(rendered) === JSON.stringify(expected),
    `rendered "${title}" == full-dataset aggregate`,
    `rendered=${JSON.stringify(rendered)}\n        expected=${JSON.stringify(expected)}`);
}

const projectPanel = panelByTitle.get('项目排行');
const expectedProjects = sortedPairs(metrics.projects?.byActivity).slice(0, 10);
check(Boolean(projectPanel) && JSON.stringify(projectPanel.rows.map(([k, v]) => [k, parseRendered(v)])) === JSON.stringify(expectedProjects),
  'rendered "项目排行" == metrics.projects.byActivity (top 10)',
  `rendered=${JSON.stringify(projectPanel ? projectPanel.rows.map(([k, v]) => [k, parseRendered(v)]) : null)}\n        expected=${JSON.stringify(expectedProjects)}`);

// 5. No "暂无数据" may survive while the API is returning data.
const apiHasData = metrics.tasks.total > 0;
check(!apiHasData || analytics.emptyStateTexts.length === 0,
  'zero "暂无数据" blocks on /analytics while the API returns data',
  `暂无数据 blocks=${analytics.emptyStateTexts.length} (api tasks.total=${metrics.tasks.total})`);

check(consoleErrors.length === 0, '/analytics console errors == 0',
  consoleErrors.slice(0, 3).join(' | '));

// ---------------------------------------------------------------- /dispatch
console.log('\n=== direct load: /dispatch ===');
await loadRoute('/dispatch', '/api/dispatch');

const dispatch = captured.get('/api/dispatch');
check(Boolean(dispatch), '/dispatch fetched /api/dispatch on direct load',
  dispatch ? `relay[]=${dispatch.relay.length} logs[]=${dispatch.logs.length}` : 'no /api/dispatch response captured');

if (!dispatch) {
  await browser.close();
  process.exit(1);
}

// Ground truth for "active" is derived independently of the relayActive field under
// test: /api/metrics aggregates relay state over the FULL thread set (103 here), while
// /api/dispatch.relay is a 100-entry display window.
const fullRelayByStatus = metrics.relay.byStatus;
const expectedActiveRelay = Object.entries(fullRelayByStatus)
  .filter(([state]) => !TERMINAL_RELAY_STATES.has(state))
  .reduce((sum, [, n]) => sum + Number(n), 0);

const dispatchDom = await page.evaluate(SCRAPE);
console.log('\n  API  dispatch.relay[].length = ' + dispatch.relay.length + '  (display window)');
console.log('  API  dispatch.relayActive    = ' + dispatch.relayActive);
console.log('  API  dispatch.logs[].length  = ' + dispatch.logs.length + '  (display window)');
console.log('  API  dispatch.logsTotal      = ' + dispatch.logsTotal);
console.log('  API  metrics.relay.byStatus  = ' + JSON.stringify(fullRelayByStatus) + `  -> non-terminal=${expectedActiveRelay}`);
console.log('  DOM  summary line            = ' + JSON.stringify(dispatchDom.dispatchSummary) + '\n');

const activeDispatchTile = dispatchDom.dispatchSummary.find((item) => item.label === '活跃调度');
check(Boolean(activeDispatchTile) && parseRendered(activeDispatchTile.value) === expectedActiveRelay,
  'rendered 活跃调度 == count of non-terminal relay threads (full set)',
  `rendered=${activeDispatchTile ? activeDispatchTile.value : '<missing tile>'} expected=${expectedActiveRelay}`);

check(Boolean(activeDispatchTile) && parseRendered(activeDispatchTile.value) !== dispatch.relay.length,
  'rendered 活跃调度 is NOT the relay array length',
  `rendered=${activeDispatchTile ? activeDispatchTile.value : '<missing tile>'} relay[].length=${dispatch.relay.length}`);

const totalRunsTile = dispatchDom.dispatchSummary.find((item) => item.label === '运行记录总数');
check(Boolean(totalRunsTile) && parseRendered(totalRunsTile.value) === dispatch.logsTotal,
  'rendered 运行记录总数 == dispatch.logsTotal (uncapped)',
  `rendered=${totalRunsTile ? totalRunsTile.value : '<missing tile>'} expected=${dispatch.logsTotal}`);

const recentRunsTile = dispatchDom.dispatchSummary.find((item) => item.label === '最近运行记录');
check(Boolean(recentRunsTile) && parseRendered(recentRunsTile.value) === dispatch.logs.length,
  'rendered 最近运行记录 == number of records actually shown',
  `rendered=${recentRunsTile ? recentRunsTile.value : '<missing tile>'} expected=${dispatch.logs.length}`);

check(!dispatchDom.dispatchSummary.some((item) => item.label === '运行记录'),
  'the saturating "运行记录" label is gone',
  JSON.stringify(dispatchDom.dispatchSummary.map((i) => i.label)));

check(consoleErrors.length === 0, '/dispatch console errors == 0',
  consoleErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
if (failed.length) {
  console.log('FAILED:\n' + failed.map((f) => `  - ${f.label}`).join('\n'));
  process.exit(1);
}
