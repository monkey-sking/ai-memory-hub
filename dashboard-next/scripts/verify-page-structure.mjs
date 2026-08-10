// Independent structural probe: one <h1> per route, no legacy class residue,
// no console errors, and a sane heading order.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5271';
const ROUTES = [
  '/', '/workflows', '/tasks', '/memory', '/radio', '/projects', '/chat',
  '/skills', '/extensions', '/tools', '/health', '/settings', '/backups',
  '/search', '/dispatch', '/analytics',
];
const LEGACY = [
  'btn', 'empty-state', 'inline-error', 'loading-state', 'notice',
  'chat-page', 'chat-shell', 'chat-messages', 'chat-input',
  'skills-page', 'skills-header', 'skill-row', 'skills-empty',
  'extensions-page', 'extensions-row', 'extensions-list', 'extensions-empty',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));

let noH1 = 0;
let legacyHits = 0;
let errRoutes = 0;
let skipRoutes = 0;
const unreachable = [];

// `networkidle` is not a render signal here: the app holds a live realtime WebSocket,
// so the network can go quiet before React has swapped the route in. A fixed sleep on
// top of that produced a real false negative (a route measured blank -> looked like a
// missing h1 and hid its own heading skip). Wait for the structural marker the shell
// renders on every route instead, then let the frame settle.
async function waitForRoute(p) {
  try {
    await p.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 8000 });
  } catch {
    return false;
  }
  // Body text is the second guard: the shell can mount while the route is still a
  // skeleton. Poll rather than sleep a fixed amount.
  try {
    await p.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 8000 });
  } catch {
    return false;
  }
  await p.waitForTimeout(250);
  return true;
}

for (const route of ROUTES) {
  errs.length = 0;
  const res = await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => null);
  if (!res || !res.ok()) {
    // Never silently `continue` -- an unmeasured route is a failure, not a pass.
    unreachable.push(route + ' (http ' + (res ? res.status() : 'no response') + ')');
    console.log('UNREACHABLE ' + route);
    continue;
  }
  let rendered = await waitForRoute(page);
  if (!rendered) {
    // One deliberate retry, so a genuinely broken route is still reported as broken
    // but a slow one is not miscounted as a regression.
    await page.reload({ waitUntil: 'networkidle' }).catch(() => null);
    rendered = await waitForRoute(page);
  }
  if (!rendered) {
    unreachable.push(route + ' (never rendered a page shell with content)');
    console.log('NEVER RENDERED ' + route);
    continue;
  }

  const d = await page.evaluate((legacy) => ({
    h1: [...document.querySelectorAll('h1')].map((e) => e.innerText.trim()),
    legacy: legacy
      .map((c) => [c, document.querySelectorAll('.' + c).length])
      .filter((pair) => pair[1] > 0),
    textLen: document.body.innerText.length,
    headings: [...document.querySelectorAll('h1,h2,h3,h4')].map((e) => e.tagName).join('>'),
  }), LEGACY);

  if (d.h1.length !== 1) noH1 += 1;
  if (d.legacy.length) legacyHits += 1;
  if (errs.length) errRoutes += 1;

  // WCAG 1.3.1 heading order: a page may not jump a level going down
  // (h1 -> h3 is a skip). Going back up any distance is fine.
  const levels = d.headings ? d.headings.split('>').filter(Boolean).map((t) => Number(t[1])) : [];
  const skips = [];
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] - levels[i - 1] > 1) skips.push('H' + levels[i - 1] + '->H' + levels[i]);
  }
  if (skips.length) skipRoutes += 1;

  const pad = route + ' '.repeat(Math.max(0, 12 - route.length));
  console.log(
    pad + ' h1=' + d.h1.length + (d.h1.length ? ' ' + JSON.stringify(d.h1) : '') +
    ' legacy=' + JSON.stringify(d.legacy) +
    ' len=' + d.textLen +
    ' err=' + errs.length + (errs.length ? ' :: ' + errs[0].slice(0, 100) : '')
  );
  console.log('             headings: ' + d.headings.slice(0, 130) +
    (skips.length ? '   SKIP! ' + [...new Set(skips)].join(',') : ''));
}

await browser.close();
if (unreachable.length) {
  console.log('\nROUTES THAT COULD NOT BE MEASURED (counted as failures):');
  for (const r of unreachable) console.log('  ' + r);
}
console.log('\n=== routes without exactly one h1: ' + noH1 +
  ' | routes with legacy classes: ' + legacyHits +
  ' | routes with console errors: ' + errRoutes +
  ' | routes with heading-level skips: ' + skipRoutes +
  ' | routes not measured: ' + unreachable.length + ' ===');
if (noH1 || legacyHits || errRoutes || skipRoutes || unreachable.length) process.exitCode = 1;
