// Proves the `@layer base` fix in src/index.css actually landed:
// every solid (primary/danger) button must render white label text at >= 4.5:1,
// and `.text-sm` buttons must be 13px regardless of their parent's font-size.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5271';
const ROUTES = [
  '/', '/workflows', '/tasks', '/memory', '/radio',
  '/projects', '/chat', '/skills', '/extensions',
];

function srgb(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function lum([r, g, b]) {
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function parse(str) {
  const m = String(str).match(/-?[\d.]+/g);
  if (!m) return null;
  return [Number(m[0]), Number(m[1]), Number(m[2]), m[3] === undefined ? 1 : Number(m[3])];
}
function over(fg, bg) {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
}
function cr(fg, bg) {
  const l1 = lum(fg);
  const l2 = lum(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// A route whose API calls have not landed renders a stripped-down page: /skills
// once measured 13 buttons instead of 314 and this script reported "0 FAIL". So
// track in-flight /api/* requests and refuse to call a page settled until they
// have landed. Aborts are excluded -- those are this script's own navigations.
let apiFailures = [];
let inflight = 0;
page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight += 1; });
page.on('response', r => {
  const u = new URL(r.url());
  if (u.pathname.startsWith('/api/') && r.status() >= 400) apiFailures.push(`${r.status()} ${u.pathname}`);
});
page.on('requestfinished', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight -= 1; });
page.on('requestfailed', r => {
  const u = new URL(r.url());
  if (!u.pathname.startsWith('/api/')) return;
  inflight -= 1;
  if (!String(r.failure()?.errorText || '').includes('ERR_ABORTED')) apiFailures.push(`${r.failure()?.errorText} ${u.pathname}`);
});

const fails = [];
const sizeFails = [];
let measured = 0;
let sized = 0;

// This is an SPA: res.ok() only proves index.html was served, and `networkidle`
// never settles because the app keeps polling -- so the old wait fell through to
// a timeout and could measure an unpainted route as "0 buttons, 0 FAIL".
// A route that paints no button is a probe failure, not a pass.
const unmeasured = [];
async function load(route) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(BASE + route).catch(() => {});
    const shell = await page
      .waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 20000 })
      .catch(() => null);
    if (!shell) continue;
    const painted = await page
      .waitForFunction(() => document.querySelectorAll('button').length > 0, null, { timeout: 15000 })
      .catch(() => null);
    if (painted) return true;
  }
  return false;
}

// Virtual lists keep mounting buttons for several seconds, so snapshotting at
// first paint under-measures badly. Poll until the count stops growing.
const count = () => page.evaluate(() => document.querySelectorAll('button').length);
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
  return prev;
}

for (const route of ROUTES) {
  apiFailures = [];
  inflight = 0;
  if (!(await load(route))) {
    unmeasured.push(route);
    console.log(`UNMEASURED ${route} -- never painted a button`);
    continue;
  }
  const settled = await settle();
  if (apiFailures.length) {
    unmeasured.push(`${route}(api:${apiFailures[0]})`);
    console.log(`  UNMEASURED ${route}: ${settled} buttons but ${apiFailures.length} failed API call(s) -- degraded render, not a pass`);
    continue;
  }
  console.log(`  ${route}: ${settled} settled buttons`);

  const rows = await page.evaluate(() => {
    const solid = [];
    for (const el of document.querySelectorAll('button, a[role="button"], [data-slot="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(el);
      // walk up for an opaque background
      let bg = cs.backgroundColor;
      let node = el;
      while (node && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
        node = node.parentElement;
        if (!node) break;
        bg = getComputedStyle(node).backgroundColor;
      }
      solid.push({
        label: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24),
        cls: el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || ''),
        color: cs.color,
        bg,
        ownBg: cs.backgroundColor,
        fontSize: cs.fontSize,
        parentFontSize: el.parentElement ? getComputedStyle(el.parentElement).fontSize : null,
      });
    }
    return solid;
  });

  for (const b of rows) {
    const isSolid = /(bg-\[|bg-brand|bg-danger|bg-primary)/.test(b.cls) || /text-white/.test(b.cls);
    const fg = parse(b.color);
    const bg = parse(b.bg);
    if (isSolid && fg && bg) {
      measured += 1;
      const ratio = cr(over(fg, bg), bg);
      if (ratio < 4.5) {
        fails.push(`${route} "${b.label}" ${b.color} on ${b.bg} = ${ratio.toFixed(2)}:1`);
      }
    }
    if (/\btext-sm\b/.test(b.cls)) {
      sized += 1;
      if (b.fontSize !== '13px') {
        sizeFails.push(`${route} "${b.label}" text-sm rendered ${b.fontSize} (parent ${b.parentFontSize})`);
      }
    }
  }
}

await browser.close();

console.log(`\ncontrast: ${measured} solid buttons measured, ${fails.length} FAIL`);
for (const f of fails) console.log('  FAIL ' + f);
console.log(`text-sm: ${sized} buttons measured, ${sizeFails.length} FAIL`);
for (const f of sizeFails) console.log('  FAIL ' + f);
console.log(`routes unmeasured: ${unmeasured.length} ${unmeasured.join(',')}`);

process.exit(fails.length + sizeFails.length + unmeasured.length ? 1 : 0);
