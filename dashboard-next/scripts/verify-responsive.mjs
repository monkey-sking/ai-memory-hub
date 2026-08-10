/**
 * Horizontal-overflow audit across viewport widths.
 *
 * Every check so far ran at 1440px. `shell.css` contains zero media queries,
 * so the layout relies entirely on Tailwind responsive utilities and on
 * `min-w-0` discipline — and a single missing `min-w-0` on a grid child blows
 * the page out sideways with no build error and no console warning.
 *
 * We flag a route when the document scrolls horizontally, and name the widest
 * offending elements so the fix is actionable rather than "something is wide".
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const widths = [1440, 1280, 1024, 768, 390]
const routes = [
  '/', '/workflows', '/tasks', '/memory', '/radio', '/projects', '/chat',
  '/skills', '/extensions', '/tools', '/health', '/settings', '/backups',
  '/search', '/dispatch', '/analytics',
]

const browser = await chromium.launch()
const failures = []

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    const res = await page.evaluate(w => {
      const doc = document.documentElement
      const overflow = doc.scrollWidth - doc.clientWidth
      const offenders = []
      if (overflow > 1) {
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const r = el.getBoundingClientRect()
          if (r.right > w + 1 && r.width > 40) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: String(el.className || '').slice(0, 46),
              right: Math.round(r.right),
              width: Math.round(r.width),
            })
          }
        }
        offenders.sort((a, b) => b.right - a.right)
      }
      return { overflow, offenders: offenders.slice(0, 3) }
    }, width)

    if (res.overflow > 1) {
      failures.push({ width, route, ...res })
      console.log(`  OVERFLOW ${String(width).padStart(4)}px ${route.padEnd(12)} +${res.overflow}px`)
      for (const o of res.offenders) {
        console.log(`            <${o.tag}> right=${o.right} w=${o.width} class="${o.cls}"`)
      }
    }
  }
  console.log(`${String(width).padStart(4)}px done`)
  await page.close()
}

console.log(`\n=== horizontal overflow failures: ${failures.length} across ${widths.length} widths x ${routes.length} routes ===`)
await browser.close()
process.exit(failures.length ? 1 : 0)
