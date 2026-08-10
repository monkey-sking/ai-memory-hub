// Two dev servers disagree by 12x on button-group counts. Find out whether they
// are serving the same build, and why "/" paints no panel-header.
import { chromium } from 'playwright'

const PORTS = (process.env.PORTS || '5271,5273').split(',')
const ROUTE = process.env.ROUTE_ || '/'

const browser = await chromium.launch()
for (const port of PORTS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 140)) })
  const base = `http://127.0.0.1:${port}`
  await page.goto(base + ROUTE).catch(() => {})
  await page.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(4000)
  const r = await page.evaluate(() => ({
    url: location.pathname,
    shell: document.querySelectorAll('[data-slot="page-shell"]').length,
    panelHeaders: document.querySelectorAll('[data-slot="panel-header"]').length,
    panels: document.querySelectorAll('[data-slot="panel"]').length,
    statTiles: document.querySelectorAll('[data-slot="stat-tile"]').length,
    legacyMetricCard: document.querySelectorAll('.dashboard-metric-card').length,
    legacyCardSlot: document.querySelectorAll('[data-slot="card"]').length,
    buttons: document.querySelectorAll('button').length,
    h1: [...document.querySelectorAll('h1')].map(h => h.innerText.trim()).slice(0, 3),
    bodyLen: document.body.innerText.length,
    firstPanelTitles: [...document.querySelectorAll('[data-slot="panel-header"] h2')].map(h => h.innerText.trim()).slice(0, 6)
  }))
  console.log(`\n:${port}${ROUTE} -> ${JSON.stringify(r, null, 1)}`)
  console.log(`  errs: ${errs.slice(0, 3).join(' | ') || 'none'}`)
  await page.close()
}
await browser.close()
