// Why /radio shows 0 rows for a term that 249/500 messages contain.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const TERM = process.env.TERM_ || 'dashboard'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 160)) })

await page.goto(BASE + '/radio')
await page.waitForSelector('[data-slot="page-shell"]', { timeout: 20000 })
await page.waitForTimeout(2500)

const snap = async label => {
  const r = await page.evaluate(() => {
    const header = document.querySelector('[data-slot="panel-header"]')
    return {
      panelHeaders: document.querySelectorAll('[data-slot="panel-header"]').length,
      headerText: (header?.innerText || '').replace(/\n/g, ' | ').slice(0, 80),
      virtualItems: document.querySelectorAll('.virtual-list-item').length,
      virtualViewport: document.querySelectorAll('.virtual-list-viewport').length,
      groupRows: document.querySelectorAll('[role="group"][tabindex="0"]').length,
      msgClassRows: document.querySelectorAll('.radio-message, .radio-item, [data-slot="radio-message"]').length,
      searchValue: document.querySelector('#search')?.value ?? null,
      bodyLen: document.body.innerText.length,
      emptyText: (document.querySelector('[data-slot="panel-body"]')?.innerText || '').replace(/\n/g, ' | ').slice(0, 120)
    }
  })
  console.log(`${label}: ${JSON.stringify(r, null, 1)}`)
  return r
}

console.log('--- before typing ---')
await snap('idle')

await page.fill('#search', TERM)
await page.waitForTimeout(1500)
console.log(`--- after typing "${TERM}" ---`)
await snap('filtered')

console.log('errs:', errs.slice(0, 5))
await browser.close()
