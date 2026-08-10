import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTES = ['/', '/tasks', '/workflows', '/memory', '/radio', '/projects', '/tools', '/backups', '/search', '/health', '/skills', '/extensions']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// A route whose API calls have not landed renders a stripped-down page and would
// sail through with "0 mismatched rows": /tools measured 7 buttons instead of 49
// because the probe moved on while /api/tools was still in flight, then cancelled
// it by navigating away. So track in-flight /api/* requests and refuse to call a
// page settled until they have all landed. Aborts are excluded from the error
// list -- they are this script's own navigations, not app failures.
let apiFailures = []
let inflight = 0
page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight += 1 })
page.on('response', r => {
  const u = new URL(r.url())
  if (!u.pathname.startsWith('/api/')) return
  if (r.status() >= 400) apiFailures.push(`${r.status()} ${u.pathname}`)
})
page.on('requestfinished', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight -= 1 })
page.on('requestfailed', r => {
  const u = new URL(r.url())
  if (!u.pathname.startsWith('/api/')) return
  inflight -= 1
  if (!String(r.failure()?.errorText || '').includes('ERR_ABORTED')) apiFailures.push(`${r.failure()?.errorText} ${u.pathname}`)
})

let failures = 0
let groupsChecked = 0

// `networkidle` never settles on this app (live polling keeps the connection
// warm), so it used to fall through to a 30s timeout and measure a route that
// had not painted yet. A route measuring zero buttons is a probe failure, not a
// pass -- the same 12x under-count that made this script report 22 groups on one
// dev server and 281 on another.
const unmeasured = []
// Measuring too early is as wrong as measuring a blank page: virtual lists keep
// mounting rows for several seconds, and a snapshot taken at first paint saw 38
// groups where a fully settled page has ~280. So: gate on paint (no vacuous
// pass), then poll until the button count stops growing (full coverage).
async function load(route) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`${BASE}${route}`).catch(() => {})
    const shell = await page
      .waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 20000 })
      .catch(() => null)
    if (!shell) continue
    const painted = await page
      .waitForFunction(() => document.querySelectorAll('button').length > 0, null, { timeout: 15000 })
      .catch(() => null)
    if (painted) return true
  }
  return false
}
const count = () => page.evaluate(() => document.querySelectorAll('button').length)
async function settle(maxMs = 45000) {
  let prev = -1
  let stable = 0
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(1000)
    const n = await count()
    stable = n === prev && inflight <= 0 ? stable + 1 : 0
    prev = n
    if (stable >= 2) break
  }
  return prev
}

for (const route of ROUTES) {
  apiFailures = []
  inflight = 0
  const ok = await load(route)
  if (!ok) { unmeasured.push(route); console.log(`UNMEASURED ${route} -- never painted a button`); continue }
  const settledButtons = await settle()
  if (apiFailures.length) {
    unmeasured.push(`${route}(api:${apiFailures[0]})`)
    console.log(`  UNMEASURED ${route}: ${settledButtons} buttons but ${apiFailures.length} failed API call(s) -- degraded render, not a pass`)
    continue
  }

  const report = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
      .filter(b => {
        const r = b.getBoundingClientRect()
        const cs = getComputedStyle(b)
        if (r.width === 0 || r.height === 0) return false
        if (cs.visibility === 'hidden' || cs.display === 'none') return false
        // skip icon-only buttons (square) — they legitimately differ
        return true
      })
    // group siblings that share a parent AND sit on the same visual row
    const groups = new Map()
    for (const b of btns) {
      const p = b.parentElement
      if (!p) continue
      const r = b.getBoundingClientRect()
      const key = `${p.className || p.tagName}|row${Math.round(r.top / 8)}`
      if (!groups.has(key)) groups.set(key, [])
      const cs = getComputedStyle(b)
      groups.get(key).push({
        text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 18),
        h: Math.round(r.height),
        w: Math.round(r.width),
        fs: cs.fontSize,
        fw: cs.fontWeight,
        // A selected tab is *supposed* to be heavier than its siblings
        // (StatusTabs renders font-semibold when selected, font-medium
        // otherwise), so weight is only comparable within one state bucket.
        state:
          b.getAttribute('aria-selected') ??
          b.getAttribute('aria-pressed') ??
          b.getAttribute('data-state') ??
          'none',
        cls: (b.className || '').toString().slice(0, 60),
      })
    }
    const out = []
    for (const [key, items] of groups) {
      if (items.length < 2) continue
      // ignore groups made only of square icon buttons
      const nonSquare = items.filter(i => Math.abs(i.w - i.h) > 6)
      if (nonSquare.length < 2) continue
      const heights = [...new Set(nonSquare.map(i => i.h))]
      const sizes = [...new Set(nonSquare.map(i => i.fs))]
      // Compare weights only among buttons sharing a selected-state, so an
      // intentionally bolded active tab is not reported as a misalignment —
      // while a genuine weight drift between same-state siblings still is.
      const byState = new Map()
      for (const i of nonSquare) {
        if (!byState.has(i.state)) byState.set(i.state, new Set())
        byState.get(i.state).add(i.fw)
      }
      const weights = [...byState.values()].some(s => s.size > 1)
        ? [...new Set(nonSquare.map(i => i.fw))]
        : []
      out.push({ key, items: nonSquare, heights, weights, sizes })
    }
    return out
  })

  console.log(`  ${route}: ${report.length} comparable group(s) from ${settledButtons} settled buttons`)
  for (const g of report) {
    groupsChecked++
    const bad = []
    if (g.heights.length > 1) bad.push(`height ${g.heights.join('/')}`)
    if (g.weights.length > 1) bad.push(`font-weight ${g.weights.join('/')}`)
    if (g.sizes.length > 1) bad.push(`font-size ${g.sizes.join('/')}`)
    if (bad.length) {
      failures++
      console.log(`FAIL ${route}  [${g.key}]  ${bad.join(' | ')}`)
      for (const i of g.items) console.log(`        "${i.text}" ${i.h}px ${i.fs} w${i.fw}  .${i.cls}`)
    }
  }
}

console.log(`\n=== groups checked: ${groupsChecked} | mismatched rows: ${failures} | routes unmeasured: ${unmeasured.length} ${unmeasured.join(',')} ===`)
await browser.close()
process.exit(failures || unmeasured.length ? 1 : 0)
