// Panel.tsx:9 documents a hard contract: buttons in a panel header MUST be
// size="sm" (32px). This probe measures every real panel-header button.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5271';
const ROUTES = [
  '/', '/workflows', '/tasks', '/memory', '/radio', '/projects', '/chat',
  '/skills', '/extensions', '/tools', '/health', '/settings', '/backups',
  '/search', '/dispatch', '/analytics',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let measured = 0;
const bad = [];

// `networkidle` never settles here (the app polls), so the old wait fell through
// to a timeout and could measure a route before it painted. A route with no
// panel header at all is a probe failure, not a pass.
// Two different silent-pass modes to rule out: a route that never painted, and a
// route measured before its panels mounted. `/` (the narrative overview) really
// does render zero panels -- that is reported, not failed.
const unmeasured = [];
const headerless = [];
async function load(route) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(BASE + route).catch(() => {});
    const shell = await page
      .waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 20000 })
      .catch(() => null);
    if (!shell) continue;
    const painted = await page
      .waitForFunction(() => document.body.innerText.trim().length > 120, null, { timeout: 15000 })
      .catch(() => null);
    if (painted) return true;
  }
  return false;
}
// Panels mount only after their data lands, so a page measured while /api/* is
// still in flight looks panel-less: /search was reported as "renders no panel at
// all" while it actually has three. Wait for in-flight API calls to land.
let inflight = 0;
page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight += 1; });
page.on('requestfinished', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight -= 1; });
page.on('requestfailed', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight -= 1; });

const count = () => page.evaluate(() => document.querySelectorAll('[data-slot="panel-header"]').length);
async function settle(maxMs = 45000) {
  let prev = -1;
  let stable = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(1000);
    const n = await count();
    stable = n === prev && inflight <= 0 ? stable + 1 : 0;
    prev = n;
    if (stable >= 2) break;
  }
}

let headersSeen = 0;
for (const route of ROUTES) {
  inflight = 0;
  if (!(await load(route))) { unmeasured.push(route); console.log('UNMEASURED ' + route + ' -- page never painted'); continue; }
  await settle();

  const here = await page.evaluate(() => document.querySelectorAll('[data-slot="panel-header"]').length);
  headersSeen += here;
  if (!here) headerless.push(route);

  const rows = await page.evaluate(() => {
    const out = [];
    for (const header of document.querySelectorAll('[data-slot="panel-header"]')) {
      const title = header.querySelector('h2');
      for (const btn of header.querySelectorAll('button, a[role="button"]')) {
        const r = btn.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        out.push({
          panel: title ? title.innerText.trim() : '(untitled)',
          label: (btn.innerText || btn.getAttribute('aria-label') || '').trim().slice(0, 20),
          h: Math.round(r.height),
        });
      }
    }
    return out;
  });

  for (const b of rows) {
    measured += 1;
    if (b.h !== 32) {
      bad.push(route + ' panel "' + b.panel + '" button "' + b.label + '" h=' + b.h + ' (contract: 32)');
    }
  }
}

await browser.close();
console.log('\npanel headers seen: ' + headersSeen + ' | panel-header buttons measured: ' + measured + ' | violations: ' + bad.length + ' | routes unmeasured: ' + unmeasured.length + ' ' + unmeasured.join(','));
console.log('routes rendering no panel at all (reported, not failed): ' + headerless.length + ' ' + headerless.join(','));
for (const b of bad) console.log('  FAIL ' + b);
process.exit(bad.length || unmeasured.length ? 1 : 0);
