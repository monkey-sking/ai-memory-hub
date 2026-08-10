// How long does a route actually take to stop mounting buttons? The settle
// heuristic exited at 13 buttons on /skills in one script and 314 in another.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTES = (process.env.ROUTES_ || '/skills,/backups,/tasks').split(',')

const browser = await chromium.launch()
for (const route of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE + route).catch(() => {})
  await page.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 20000 }).catch(() => {})
  const series = []
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(1000)
    series.push(await page.evaluate(() => document.querySelectorAll('button').length))
  }
  console.log(`${route}: ${series.join(',')}`)
  await page.close()
}
await browser.close()
