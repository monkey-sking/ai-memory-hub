// Checks whether /analytics renders charts on a direct load, and whether the
// numbers it shows agree with the totals the API reports.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5271';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const seen = [];
page.on('response', async (r) => {
  const u = new URL(r.url());
  if (!u.pathname.startsWith('/api/')) return;
  let body = null;
  try { body = await r.json(); } catch { /* non-json */ }
  seen.push({ path: u.pathname + u.search, status: r.status(), body });
});

await page.goto(BASE + '/analytics', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

console.log('=== API calls made by /analytics ===');
for (const r of seen) console.log('  ' + r.status + ' ' + r.path);

const metrics = seen.find((r) => r.path.startsWith('/api/metrics'));
if (metrics && metrics.body) {
  const m = metrics.body.metrics ?? metrics.body;
  console.log('\n=== what /api/metrics actually returned ===');
  console.log('  top-level keys: ' + Object.keys(m).join(', '));
  for (const k of ['tasks', 'workflows', 'relay']) {
    if (m[k] && typeof m[k] === 'object') {
      const byStatus = m[k].byStatus;
      console.log('  ' + k + '.byStatus = ' + (byStatus ? JSON.stringify(byStatus) : '(absent)'));
      if (m[k].total !== undefined) console.log('  ' + k + '.total = ' + m[k].total);
    }
  }
}

const view = await page.evaluate(() => {
  const txt = document.body.innerText;
  const empties = [...document.querySelectorAll('[data-slot="empty-state"]')]
    .map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 50));
  const headings = [...document.querySelectorAll('h1,h2,h3')].map((e) => e.innerText.trim());
  return { textLen: txt.length, empties, headings, text: txt.slice(0, 700) };
});

console.log('\n=== rendered /analytics ===');
console.log('  headings: ' + JSON.stringify(view.headings));
console.log('  empty-state blocks: ' + view.empties.length + ' ' + JSON.stringify(view.empties));
console.log('  --- visible text ---');
console.log(view.text.split('\n').map((l) => '  | ' + l).join('\n'));

await browser.close();
