// Diagnoses WHY shell/StatTile renders without its intended surface treatment.
// Checks three things in order: what the element actually computes to, whether
// the utilities resolve at all in isolation, and whether the design tokens the
// utilities reference are even defined.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTE = process.env.ROUTE || '/tools'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE + ROUTE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const info = await page.$$eval('[data-slot="stat-tile"]', nodes =>
  nodes.slice(0, 1).map(n => {
    const cs = getComputedStyle(n)
    return {
      className: n.className,
      borderTopWidth: cs.borderTopWidth,
      borderTopColor: cs.borderTopColor,
      borderTopStyle: cs.borderTopStyle,
      borderRadius: cs.borderTopLeftRadius,
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      boxShadow: cs.boxShadow,
      padding: cs.padding,
      minHeight: cs.minHeight,
      display: cs.display,
      gap: cs.gap
    }
  })
)
console.log('--- actual stat tile ---')
console.log(JSON.stringify(info[0], null, 2))

const isolated = await page.evaluate(() => {
  const d = document.createElement('div')
  d.className = 'bg-gradient-to-br from-accent-tint/60 to-surface shadow-xs border border-line'
  document.body.appendChild(d)
  const cs = getComputedStyle(d)
  const out = {
    backgroundImage: cs.backgroundImage,
    boxShadow: cs.boxShadow,
    borderTopColor: cs.borderTopColor,
    borderTopWidth: cs.borderTopWidth
  }
  d.remove()
  return out
})
console.log('--- same utilities on a bare div (is it the class or the cascade?) ---')
console.log(JSON.stringify(isolated, null, 2))

const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  const names = ['--color-accent-tint', '--color-surface', '--color-line', '--shadow-xs']
  const out = {}
  for (const n of names) out[n] = cs.getPropertyValue(n).trim() || '(unset)'
  return out
})
console.log('--- design tokens ---')
console.log(JSON.stringify(tokens, null, 2))

await browser.close()
