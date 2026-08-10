import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const routes = ['/search', '/dispatch', '/analytics', '/tools']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const info = await page.evaluate(() => {
    const sel =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
    const all = Array.from(document.querySelectorAll(sel))
    const sized = all.filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const main = document.querySelector('[data-slot="page-shell-content"]') || document.body
    return {
      totalMatches: all.length,
      withSize: sized.length,
      firstFew: all.slice(0, 6).map(el => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return `${el.tagName.toLowerCase()}"${(el.textContent || '').trim().slice(0, 14)}" ${Math.round(r.width)}x${Math.round(r.height)} disp=${cs.display} vis=${cs.visibility}`
      }),
      bodyTextLen: document.body.innerText.length,
      mainTextHead: main.innerText.trim().slice(0, 160).replace(/\n+/g, ' | '),
    }
  })
  console.log(`\n${route}`)
  console.log(`   focusable matches=${info.totalMatches}  withNonZeroSize=${info.withSize}  bodyText=${info.bodyTextLen}`)
  console.log(`   content: ${info.mainTextHead}`)
  for (const f of info.firstFew) console.log(`     - ${f}`)
}
await browser.close()
