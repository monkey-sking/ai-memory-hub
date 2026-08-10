// Guards against legacy unlayered CSS silently stripping the shell design
// system's surface treatment off its own components.
//
// Dashboard.css is unlayered, so it wins over Tailwind's @layer utilities no
// matter the specificity. When a legacy class like `dashboard-metric-card` is
// left on a shell component, rules such as `background: transparent; border: 0`
// erase the component's intended surface while every structural probe still
// passes. Height, heading level and contrast checks cannot see this.
//
// Contract, from shell/Panel.tsx and shell/StatTile.tsx:
//   panel      -> 1px border, opaque background, no shadow at rest (elevation L1)
//   stat-tile  -> 1px border, gradient background, shadow-xs
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTES = [
  '/', '/workflows', '/tasks', '/memory', '/radio', '/projects', '/chat',
  '/skills', '/extensions', '/tools', '/health', '/settings', '/backups',
  '/search', '/dispatch', '/analytics'
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

let failures = 0
let checked = 0

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const found = await page.$$eval('[data-slot="panel"], [data-slot="stat-tile"]', nodes =>
    nodes.map(n => {
      const cs = getComputedStyle(n)
      const transparent = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent'
      return {
        slot: n.getAttribute('data-slot'),
        label: (n.querySelector('h2, span.uppercase')?.textContent || '').trim().slice(0, 20),
        borderWidth: cs.borderTopWidth,
        borderStyle: cs.borderTopStyle,
        hasBackground: !transparent || cs.backgroundImage !== 'none',
        hasGradient: cs.backgroundImage !== 'none',
        hasShadow: cs.boxShadow !== 'none',
        legacyClasses: (n.className || '')
          .split(/\s+/)
          .filter(c => c.startsWith('dashboard-') || c.startsWith('overview-'))
      }
    })
  )

  for (const el of found) {
    checked++
    const problems = []
    if (el.borderStyle === 'none' || parseFloat(el.borderWidth) === 0) problems.push('border stripped')
    if (!el.hasBackground) problems.push('background transparent')
    if (el.slot === 'stat-tile' && !el.hasGradient) problems.push('gradient stripped')
    if (el.slot === 'stat-tile' && !el.hasShadow) problems.push('shadow stripped')
    if (problems.length) {
      failures++
      console.log(
        `FAIL ${route.padEnd(12)} ${el.slot.padEnd(10)} "${el.label}" -> ${problems.join(', ')}` +
          (el.legacyClasses.length ? `  [legacy: ${el.legacyClasses.join(' ')}]` : '')
      )
    }
  }
}

console.log(`\n=== shell surfaces checked: ${checked} | suppressed: ${failures} ===`)
await browser.close()
process.exit(failures > 0 ? 1 : 0)
