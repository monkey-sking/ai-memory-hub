// The overview used to ship its own `command-*` card vocabulary. This asserts
// it now renders the shared Panel + ListRow pair, with real rows in them — a
// panel that renders zero rows would otherwise "pass" a structure-only check.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:5271'
const LEGACY = [
  'command-center-hero',
  'command-section',
  'command-side-block',
  'agent-work-card',
  'attention-task-card',
  'command-recent-item',
  'command-radio-item'
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-slot="page-shell"]', { timeout: 20000 })
await page.waitForSelector('[data-slot="panel"]', { timeout: 20000 })
// Rows arrive with the snapshot fetch; wait for the network to settle.
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(500)

const result = await page.evaluate(legacy => {
  const panels = [...document.querySelectorAll('[data-slot="page-shell-content"] [data-slot="panel"]')]
  return {
    panels: panels.map(p => ({
      title: p.querySelector('[data-slot="panel-header"] h2')?.textContent?.trim() || '',
      count: p.querySelector('[data-slot="panel-header"] span')?.textContent?.trim() || '',
      rows: p.querySelectorAll('[role="group"][tabindex="0"]').length,
      empty: Boolean(p.querySelector('[data-slot="empty-state"], .text-ink-3'))
    })),
    legacyFound: legacy.filter(cls => document.querySelector('.' + cls)),
    h1: document.querySelector('h1')?.textContent?.trim() || ''
  }
}, LEGACY)

let bad = 0
console.log(`h1="${result.h1}"`)
for (const p of result.panels) {
  console.log(`  panel "${p.title}" count=${p.count} rows=${p.rows}`)
}
if (result.panels.length < 4) {
  console.log(`FAIL: expected 4 overview panels, found ${result.panels.length}`)
  bad++
}
const totalRows = result.panels.reduce((sum, p) => sum + p.rows, 0)
if (totalRows === 0) {
  console.log('FAIL: every overview panel is empty — the probe would pass vacuously, so this is a failure')
  bad++
}
for (const p of result.panels) {
  const declared = Number.parseInt(p.count, 10)
  if (Number.isFinite(declared) && declared > 0 && p.rows !== declared) {
    console.log(`FAIL: panel "${p.title}" header says ${declared} but renders ${p.rows} rows`)
    bad++
  }
}
if (result.legacyFound.length) {
  console.log(`FAIL: legacy overview classes still in the DOM: ${result.legacyFound.join(', ')}`)
  bad++
}

await browser.close()
console.log(`\n=== overview panels: ${result.panels.length} | rows: ${totalRows} | violations: ${bad} ===`)
process.exit(bad ? 1 : 0)
