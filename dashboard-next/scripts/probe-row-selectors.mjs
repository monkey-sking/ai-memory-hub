// Throwaway diagnostic: what is actually clickable on the list routes, so the
// dialog-layer probe can open the right thing instead of guessing selectors.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ['/tasks', '/radio', '/memory']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 8000 }).catch(() => null)
  await page.waitForTimeout(2000)

  const info = await page.evaluate(() => {
    const cls = el => {
      const c = el.className
      const s = typeof c === 'string' ? c : (c && c.baseVal) || ''
      return s.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
    }
    const nodes = [...document.querySelectorAll('[role="button"], button, article, tr, li, [data-slot]')]
      .filter(el => el.getBoundingClientRect().height > 0)
      .slice(0, 18)
    return nodes.map(el =>
      el.tagName +
      (cls(el) ? '.' + cls(el) : '') +
      ' [slot=' + (el.getAttribute('data-slot') || '-') + ']' +
      ' [role=' + (el.getAttribute('role') || '-') + ']' +
      ' "' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"'
    )
  })

  console.log('\n== ' + route)
  for (const line of info) console.log('   ' + line)
}

await browser.close()
