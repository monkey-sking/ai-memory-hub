import { chromium } from 'playwright'

const BASE = 'http://localhost:5271'
const browser = await chromium.launch()

const results = {}

// ---- Desktop: list roles + <time> presence per section ----
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function collect(route) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => null)
  await page.waitForTimeout(900)
  return page.evaluate(() => {
    const listEls = document.querySelectorAll('.virtual-list-content[role="list"]').length
    const itemEls = document.querySelectorAll('.virtual-list-item[role="listitem"]').length
    const timeEls = document.querySelectorAll('time[datetime]').length
    // meta container visibility (was hidden lg:flex)
    const metaEls = Array.from(document.querySelectorAll('.virtual-list-item [role="group"] > div'))
    let metaHidden = 0
    metaEls.forEach(d => {
      const cs = getComputedStyle(d)
      if (cs.display === 'none') metaHidden++
    })
    return { listEls, itemEls, timeEls, metaContainers: metaEls.length, metaHidden }
  })
}

// Only tasks/memory/radio use VirtualizedList; overview uses plain rows.
const VIRTUAL_ROUTES = ['/tasks', '/memory', '/radio']
for (const route of ['/', ...VIRTUAL_ROUTES]) {
  results[route] = await collect(route)
}

// ---- Mobile (375px): meta hidden so actions stay reachable ----
// /tasks' visible rows currently have no action buttons (data-dependent), so
// the reachability regression test targets /backups, whose "恢复预览" button the
// prior review found clipped off-screen by an unconstrained meta.
const mobile = await browser.newPage({ viewport: { width: 375, height: 800 } })
await mobile.goto(BASE + '/backups', { waitUntil: 'networkidle' }).catch(() => null)
await mobile.waitForTimeout(800)
// The dashboard scrolls an inner container, not the window, so bring a row's
// action button into view via its own scroller before measuring.
await mobile.evaluate(() => {
  const btn = document.querySelector('.virtual-list-item [role="group"] button')
  if (btn) btn.scrollIntoView({ block: 'center' })
})
await mobile.waitForTimeout(700)
const mobileCheck = await mobile.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.virtual-list-item [role="group"]'))
  const btns = Array.from(document.querySelectorAll('.virtual-list-item [role="group"] button'))
  let actionReachable = false
  let checked = 0
  let anyClipped = false
  for (const btn of btns) {
    const r = btn.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const inView = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth
    if (!inView) continue
    checked++
    if (r.right > window.innerWidth + 0.5) anyClipped = true
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (hit && (hit === btn || btn.contains(hit))) actionReachable = true
  }
  return { rowCount: rows.length, buttonsChecked: checked, actionReachable, anyClipped }
})
results['/backups @375px'] = mobileCheck

// ---- Tablet (768px): meta badges MUST be visible again ----
const tablet = await browser.newPage({ viewport: { width: 768, height: 900 } })
await tablet.goto(BASE + '/tasks', { waitUntil: 'networkidle' }).catch(() => null)
await tablet.waitForTimeout(900)
const tabletCheck = await tablet.evaluate(() => {
  const badges = Array.from(document.querySelectorAll('.virtual-list-item [data-slot="badge"]'))
  let visible = 0
  badges.forEach(b => { if (getComputedStyle(b).display !== 'none') visible++ })
  return { total: badges.length, visible }
})
results['/tasks @768px'] = tabletCheck

// ---- Desktop /tasks: FilterBar primitive replaced the hand-rolled toolbar ----
const filterCheck = await (async () => {
  const fp = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await fp.goto(BASE + '/tasks', { waitUntil: 'networkidle' }).catch(() => null)
  await fp.waitForTimeout(900)
  const out = await fp.evaluate(() => {
    const bar = document.querySelector('[data-slot="filter-bar"]')
    const search = document.querySelector('#task-search')
    const multiTriggers = document.querySelectorAll('[data-slot="filter-bar"] [aria-haspopup="listbox"]').length
    const clearBtn = Array.from(document.querySelectorAll('[data-slot="filter-bar"] button')).find(b => /清除|Clear/.test(b.textContent || ''))
    const oldToolbar = document.querySelector('.task-filter-toolbar, .task-multi-filter')
    return {
      hasFilterBar: Boolean(bar),
      hasSearch: Boolean(search),
      multiTriggerCount: multiTriggers,
      hasClear: Boolean(clearBtn),
      leftoverOldToolbar: Boolean(oldToolbar)
    }
  })
  await fp.close()
  return out
})()
results['/tasks filter-bar'] = filterCheck

await browser.close()
console.log(JSON.stringify(results, null, 2))

// ---- assertions ----
let ok = true
for (const route of VIRTUAL_ROUTES) {
  const r = results[route]
  if (r.listEls === 0) { console.log('FAIL: no role=list on', route); ok = false }
  if (r.itemEls === 0) { console.log('FAIL: no role=listitem on', route); ok = false }
}
for (const route of ['/', '/tasks', '/memory', '/radio']) {
  if (results[route].timeEls === 0) { console.log('FAIL: no <time datetime> on', route); ok = false }
}
if (results['/backups @375px'].anyClipped) { console.log('FAIL: /backups action button clipped past viewport at 375px'); ok = false }
if (results['/backups @375px'].buttonsChecked > 0 && !results['/backups @375px'].actionReachable) { console.log('FAIL: /backups in-view action button not hit by elementFromPoint'); ok = false }
if (results['/tasks @768px'].visible === 0) { console.log('FAIL: meta badges not visible at tablet'); ok = false }
if (!results['/tasks filter-bar'].hasFilterBar) { console.log('FAIL: /tasks has no FilterBar'); ok = false }
if (!results['/tasks filter-bar'].hasSearch) { console.log('FAIL: /tasks FilterBar missing search'); ok = false }
if (results['/tasks filter-bar'].multiTriggerCount < 2) { console.log('FAIL: /tasks FilterBar missing multi filters'); ok = false }
if (!results['/tasks filter-bar'].hasClear) { console.log('FAIL: /tasks FilterBar missing clear'); ok = false }
if (results['/tasks filter-bar'].leftoverOldToolbar) { console.log('FAIL: /tasks still has old hand-rolled filter toolbar'); ok = false }
console.log(ok ? '\nALL BATCH-2 PROBE CHECKS PASSED' : '\nPROBE FOUND FAILURES')
process.exit(ok ? 0 : 1)
