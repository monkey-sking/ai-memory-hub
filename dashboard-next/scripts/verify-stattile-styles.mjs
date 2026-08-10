// Measures the computed typography of migrated StatTile / Panel headers against the
// values the legacy Dashboard.css rules used to enforce. Those rules key off DOM that
// the shell components no longer emit ([data-slot="card-title"], .text-3xl,
// .dashboard-panel-header, .metric-value, .metric-label), so they stopped applying
// silently -- no build error, no lint error. This probe makes the drift measurable.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTES = ['/', '/dispatch', '/analytics', '/tools', '/health', '/backups', '/search']

// What Dashboard.css:1262 / :1323 asked for, before the DOM changed underneath it.
const LEGACY = {
  metricLabel: { fontSize: '12px', fontWeight: '750' },
  metricValue: { fontSize: '32px' },
  panelTitle: { fontSize: '15px' }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const rows = []

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const sample = await page.evaluate(() => {
    const px = el => {
      if (!el) return null
      const s = getComputedStyle(el)
      return {
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        letterSpacing: s.letterSpacing,
        color: s.color,
        text: (el.textContent || '').trim().slice(0, 24)
      }
    }
    const tile = document.querySelector('[data-slot="stat-tile"]')
    const spans = tile ? tile.querySelectorAll(':scope > div > span, :scope > span') : []
    return {
      tiles: document.querySelectorAll('[data-slot="stat-tile"]').length,
      tileMinHeight: tile ? getComputedStyle(tile).minHeight : null,
      tileHeight: tile ? Math.round(tile.getBoundingClientRect().height) : null,
      label: px(spans[0]),
      value: px(tile ? tile.querySelector(':scope > span') : null),
      panelTitle: px(document.querySelector('section h2')),
      // Prove the legacy hooks really are gone from the rendered tree.
      deadHooks: {
        cardTitleInMetric: document.querySelectorAll('.dashboard-metric-card [data-slot="card-title"]').length,
        text3xlInMetric: document.querySelectorAll('.dashboard-metric-card .text-3xl').length,
        panelHeader: document.querySelectorAll('.dashboard-panel-header').length,
        metricValueCls: document.querySelectorAll('.metric-value').length,
        metricLabelCls: document.querySelectorAll('.metric-label').length,
        metricHeader: document.querySelectorAll('.dashboard-metric-header').length,
        metricContent: document.querySelectorAll('.dashboard-metric-content').length
      }
    }
  })

  rows.push({ route, ...sample })
}

await browser.close()

let drift = 0
let deadTotal = 0
for (const r of rows) {
  console.log(`\n${r.route}  tiles=${r.tiles} tileHeight=${r.tileHeight} minHeight=${r.tileMinHeight}`)
  if (r.label) {
    const bad = r.label.fontSize !== LEGACY.metricLabel.fontSize || r.label.fontWeight !== LEGACY.metricLabel.fontWeight
    if (bad) drift++
    console.log(`  label "${r.label.text}" size=${r.label.fontSize} weight=${r.label.fontWeight} color=${r.label.color}` +
      (bad ? `   DRIFT! legacy wanted ${LEGACY.metricLabel.fontSize}/${LEGACY.metricLabel.fontWeight}` : ''))
  }
  if (r.value) {
    const bad = r.value.fontSize !== LEGACY.metricValue.fontSize
    if (bad) drift++
    console.log(`  value "${r.value.text}" size=${r.value.fontSize} weight=${r.value.fontWeight} ls=${r.value.letterSpacing}` +
      (bad ? `   DRIFT! legacy wanted ${LEGACY.metricValue.fontSize}` : ''))
  }
  if (r.panelTitle) {
    const bad = r.panelTitle.fontSize !== LEGACY.panelTitle.fontSize
    if (bad) drift++
    console.log(`  panelTitle "${r.panelTitle.text}" size=${r.panelTitle.fontSize} weight=${r.panelTitle.fontWeight}` +
      (bad ? `   DRIFT! legacy wanted ${LEGACY.panelTitle.fontSize}` : ''))
  }
  const dead = Object.entries(r.deadHooks).filter(([, n]) => n > 0)
  deadTotal += dead.length
  console.log(`  legacy hooks still in DOM: ${dead.length ? dead.map(([k, n]) => `${k}=${n}`).join(' ') : 'none (all CSS keyed to them is dead)'}`)
}

console.log(`\n=== typography drift findings: ${drift} | routes still emitting legacy hooks: ${deadTotal} ===`)
