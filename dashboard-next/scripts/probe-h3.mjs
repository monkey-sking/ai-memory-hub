import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const routes = [
  '/tools',
  '/health',
  '/settings',
  '/backups',
  '/search',
  '/dispatch',
  '/analytics',
  '/tasks',
  '/memory',
  '/radio',
]

const browser = await chromium.launch()
const page = await browser.newPage()

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(700)
  const info = await page.evaluate(() =>
    [...document.querySelectorAll('h3')].map((h) => ({
      text: (h.textContent || '').trim().slice(0, 28),
      cls: h.className,
      slot: h.closest('[data-slot]')?.getAttribute('data-slot') || '',
      parentCls: h.parentElement?.className || '',
    }))
  )
  console.log(`\n### ${route}  (${info.length} h3)`)
  const seen = new Set()
  for (const i of info) {
    const key = `${i.cls}|${i.slot}|${i.parentCls}`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`   text="${i.text}"`)
    console.log(`     class=${i.cls}`)
    console.log(`     slot=${i.slot}  parent=${i.parentCls}`)
  }
}

await browser.close()
