// Sanity check on "45 panel headers but only 4 header buttons": list every
// panel header and whether it carries an action, so a selector miss cannot hide
// behind a small number.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTES = ['/', '/workflows', '/tasks', '/memory', '/radio', '/projects', '/chat', '/skills', '/extensions', '/tools', '/health', '/settings', '/backups', '/search', '/dispatch', '/analytics']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let inflight = 0
page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight += 1 })
page.on('requestfinished', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight -= 1 })
page.on('requestfailed', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight -= 1 })

let total = 0
let withBtn = 0
for (const route of ROUTES) {
  inflight = 0
  await page.goto(BASE + route).catch(() => {})
  await page.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 20000 }).catch(() => {})
  let prev = -1
  let stable = 0
  for (let i = 0; i < 30 && stable < 2; i += 1) {
    await page.waitForTimeout(1000)
    const n = await page.evaluate(() => document.querySelectorAll('[data-slot="panel-header"]').length)
    stable = n === prev && inflight <= 0 ? stable + 1 : 0
    prev = n
  }
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="panel-header"]')].map(h => ({
      title: (h.querySelector('h2')?.innerText || '(untitled)').trim().slice(0, 22),
      btns: [...h.querySelectorAll('button, a[role="button"]')]
        .filter(b => { const r = b.getBoundingClientRect(); return r.width >= 4 && r.height >= 4 })
        .map(b => ({ t: (b.innerText || b.getAttribute('aria-label') || '?').trim().slice(0, 14), h: Math.round(b.getBoundingClientRect().height) }))
    }))
  )
  total += rows.length
  withBtn += rows.filter(r => r.btns.length).length
  console.log(`${route}: ${rows.length} header(s)`)
  for (const r of rows) console.log(`    "${r.title}" -> ${r.btns.length ? JSON.stringify(r.btns) : 'no action'}`)
}
console.log(`\ntotal headers=${total} withAction=${withBtn}`)
await browser.close()
