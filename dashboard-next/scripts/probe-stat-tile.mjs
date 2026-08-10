// Measures whether legacy Dashboard.css rules are overriding shell/StatTile's
// intended visual design on the homepage metric cards.
//
// Context: MetricCard was migrated from ui/card to shell/StatTile but kept the
// legacy `dashboard-metric-card` class. Dashboard.css:1262 sets a flat
// `background: var(--color-surface)` and a border on that class, while StatTile
// itself asks for `bg-gradient-to-br from-accent-tint/60 to-surface` + shadow-xs.
// Same specificity (0,1,0) => source order decides, so this must be measured,
// not reasoned about.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}${process.env.ROUTE || "/"}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const tiles = await page.$$eval('[data-slot="stat-tile"]', nodes =>
  nodes.map(node => {
    const cs = getComputedStyle(node)
    const valueEl = node.querySelector('span.tabular-nums:not([class*="rounded-full"])')
    const labelEl = node.querySelector('span.uppercase')
    const vs = valueEl ? getComputedStyle(valueEl) : null
    const ls = labelEl ? getComputedStyle(labelEl) : null
    return {
      label: labelEl ? labelEl.textContent.trim() : '(none)',
      hasGradient: cs.backgroundImage !== 'none',
      backgroundImage: cs.backgroundImage.slice(0, 60),
      backgroundColor: cs.backgroundColor,
      boxShadow: cs.boxShadow === 'none' ? 'none' : 'present',
      minHeight: cs.minHeight,
      height: Math.round(node.getBoundingClientRect().height),
      valueFontSize: vs ? vs.fontSize : null,
      labelFontSize: ls ? ls.fontSize : null,
      labelTransform: ls ? ls.textTransform : null
    }
  })
)

console.log(`stat tiles found: ${tiles.length}`)
let flattened = 0
let shrunk = 0
for (const t of tiles) {
  if (!t.hasGradient) flattened++
  if (t.valueFontSize && parseFloat(t.valueFontSize) < 32) shrunk++
  console.log(
    `  ${t.label.padEnd(18)} gradient=${String(t.hasGradient).padEnd(5)} bg=${t.backgroundColor.padEnd(20)} shadow=${t.boxShadow.padEnd(7)} value=${t.valueFontSize} label=${t.labelFontSize} minH=${t.minHeight} h=${t.height}`
  )
}

console.log(
  `\n=== tiles with StatTile gradient suppressed: ${flattened}/${tiles.length} | tiles whose value is smaller than the legacy 32px: ${shrunk}/${tiles.length} ===`
)

await browser.close()
process.exit(flattened > 0 || shrunk > 0 ? 1 : 0)
