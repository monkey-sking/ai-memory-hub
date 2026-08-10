// Diagnostic: does a route intermittently render zero PageShell/h1, or is that
// a probe timing artifact? Loads the route 5x with error capture and polls for
// the shell instead of trusting a fixed wait.
//
// Usage: node scripts/probe-memory-flake.mjs [route] [baseUrl]
import { chromium } from 'playwright';

const ROUTE = process.argv[2] || '/memory';
const BASE = process.argv[3] || 'http://localhost:5271';
const browser = await chromium.launch();

for (let i = 1; i <= 5; i += 1) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));

  const t0 = Date.now();
  const res = await page.goto(BASE + ROUTE, { waitUntil: 'networkidle' })
    .catch((e) => { errs.push('GOTO ' + e.message.slice(0, 120)); return null; });
  const navMs = Date.now() - t0;

  let appearedAt = null;
  for (let t = 0; t < 80; t += 1) {
    const n = await page.evaluate(() => document.querySelectorAll('[data-slot="page-shell"]').length);
    if (n > 0) { appearedAt = t * 100; break; }
    await page.waitForTimeout(100);
  }

  const d = await page.evaluate(() => ({
    shells: document.querySelectorAll('[data-slot="page-shell"]').length,
    h1: [...document.querySelectorAll('h1')].map((e) => e.innerText.trim()),
    bodyLen: document.body.innerText.length,
    head: document.body.innerText.slice(0, 90).replace(/\s+/g, ' '),
  }));

  console.log('run' + i + ' status=' + (res && res.status()) + ' navMs=' + navMs +
    ' shellAppearedAfterMs=' + appearedAt + ' shells=' + d.shells +
    ' h1=' + JSON.stringify(d.h1) + ' bodyLen=' + d.bodyLen);
  console.log('      body="' + d.head + '"  errs=' + errs.length + (errs.length ? ' :: ' + errs[0] : ''));
  await page.close();
}

await browser.close();
