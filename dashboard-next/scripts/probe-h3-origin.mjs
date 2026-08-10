import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const routes = ['/tools', '/health', '/backups', '/settings', '/search', '/analytics', '/tasks', '/memory', '/radio', '/dispatch']

const browser = await chromium.launch()
const page = await browser.newPage()
for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const rows = await page.$$eval('h3', els =>
    els.slice(0, 3).map(e => ({
      text: (e.textContent || '').trim().slice(0, 26),
      cls: e.className,
      parentCls: e.parentElement?.className || '',
      slot: e.closest('[data-slot]')?.getAttribute('data-slot') || '',
    }))
  )
  console.log(`\n${route}`)
  for (const r of rows) console.log(`   "${r.text}" cls=${r.cls} | parent=${r.parentCls} | slot=${r.slot}`)
}
await browser.close()
