// Does the nested PageShell add an extra exposed landmark/region to the a11y
// tree? An unnamed <section> should be role=generic, not role=region.
// Usage: node scripts/probe-shell-landmarks.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5271';
const ROUTES = ['/workflows', '/projects', '/tools', '/settings'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-slot="page-shell"]', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(400);

  const shells = page.locator('[data-slot="page-shell"]');
  const n = await shells.count();
  const roles = [];
  for (let i = 0; i < n; i += 1) {
    const el = shells.nth(i);
    roles.push({
      role: await el.evaluate((e) => e.getAttribute('role')),
      ariaLabel: await el.evaluate((e) => e.getAttribute('aria-label')),
      ariaLabelledby: await el.evaluate((e) => e.getAttribute('aria-labelledby')),
    });
  }

  // Count what AT actually sees as a landmark region. Playwright's role engine
  // applies the real spec rule: <section> only maps to role=region when it has
  // an accessible name.
  const regions = await page.getByRole('region').count();

  console.log(route + '  shells=' + n + '  regionsInA11yTree=' + regions +
    '  shellAttrs=' + JSON.stringify(roles));
}

await browser.close();
