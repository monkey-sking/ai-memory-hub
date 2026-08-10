// Overlay behaviour on /tasks that no other probe can see. Three parts:
//   A: heading order inside the task-detail dialog for tasks that actually
//      populate the CONDITIONAL sections (description / handoff / lastError /
//      activity log). scripts/verify-dialog-structure.mjs only ever opens row 0,
//      so a skip hiding behind `task.handoff ? ... : null` survives it.
//   B: ToastStack hit-testing -- a click in the toast column must reach the row
//      underneath, with NO {force:true} anywhere in this file.
//   C: the Cancel confirm path, end to end, on a task this script creates and
//      then cancels itself.
//
// Side effect: part C adds one task named `throwaway-cancel-<ts>` and cancels it.
// Part B injects a 500 on /api/pull to raise a real error toast; that request is
// intercepted in the browser and never reaches the hub, so no data is touched.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROWS = '[role="group"][tabindex="0"]'
const fails = []
const line = s => console.log(s)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 120)) })

async function gotoTasks() {
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' })
  await page.waitForSelector(ROWS, { state: 'visible', timeout: 15000 })
}

// The search box filters only the rows already loaded, so walk the footer
// "load more" until the target appears rather than assuming it is in page 1.
async function findRow(term, maxPages = 10) {
  await page.fill('#task-search', '')
  await page.fill('#task-search', term)
  for (let i = 0; i < maxPages; i += 1) {
    await page.waitForTimeout(350)
    if (await page.locator(ROWS).count() > 0) return true
    const more = page.getByRole('button', { name: /^加载更多$|^Load more$/ })
    if (!(await more.count())) return false
    await more.first().click()
    await page.waitForTimeout(700)
  }
  return false
}

async function dialogHeadings() {
  await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 8000 })
  await page.waitForTimeout(300)
  return page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const hs = [...d.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    return {
      title: (d.querySelector('[data-slot="dialog-title"]')?.textContent || '').trim().slice(0, 34),
      headings: hs.map(h => h.tagName + ':' + (h.textContent || '').trim().slice(0, 12)),
      levels: hs.map(h => Number(h.tagName[1])),
      h4: d.querySelectorAll('h4,h5,h6').length,
      sections: [...d.querySelectorAll('.task-detail-section')].length,
      // Prove the CSS retarget landed: the old rule was scoped to h4.
      firstSectionHeadFontSize: (() => {
        const h = d.querySelector('.task-detail-section h3')
        return h ? getComputedStyle(h).fontSize : null
      })()
    }
  })
}

// ---------------------------------------------------------------- PART A
line('=== A. task-detail dialog headings on tasks with every section populated ===')
await gotoTasks()

// Pick the subjects from live data instead of hardcoding titles, and say so out
// loud when a section cannot be exercised -- a silent pass here would mean the
// conditional headings were never rendered at all.
const all = await fetch(`${BASE}/api/tasks?limit=400`).then(r => r.json())
const tasks = all.tasks || all.items || all.data || all || []
const firstWith = pred => tasks.find(t => pred(t) && String(t.title || '').trim().length > 6)
const CASES = [
  { task: firstWith(t => t.description && t.handoff), want: 'description + handoff' },
  { task: firstWith(t => t.lastError), want: 'lastError' },
  { task: firstWith(t => (t.notes || []).length > 0), want: 'activity log' }
].filter((c, i, arr) => c.task && arr.findIndex(x => x.task?.id === c.task.id) === i)
  .map(c => ({ ...c, term: String(c.task.title).trim().slice(0, 14) }))
const covered = new Set()
if (CASES.length < 3) fails.push(`A: only ${CASES.length}/3 distinct subjects available -- sections left unmeasured`)
for (const c of CASES) {
  const found = await findRow(c.term)
  if (!found) { fails.push(`A: row not found for "${c.term}"`); line(`  "${c.term}" -> ROW NOT FOUND`); continue }
  await page.locator(ROWS).first().click()
  const d = await dialogHeadings()
  const skips = []
  for (let i = 1; i < d.levels.length; i += 1) if (d.levels[i] - d.levels[i - 1] > 1) skips.push(`H${d.levels[i - 1]}->H${d.levels[i]}`)
  d.headings.slice(1).forEach(h => covered.add(h.split(':')[1]))
  line(`  "${c.term}" (expects ${c.want})`)
  line(`    title="${d.title}" sections=${d.sections} h4+=${d.h4} sectionH3fontSize=${d.firstSectionHeadFontSize}`)
  line(`    headings: ${d.headings.join(' > ')}`)
  line(`    skips: ${skips.length ? skips.join(',') : 'none'}`)
  if (d.sections < 2) fails.push(`A: ${c.term} rendered only ${d.sections} section(s) -- nothing meaningful measured`)
  if (d.h4) fails.push(`A: ${c.term} still has ${d.h4} h4/h5/h6`)
  if (skips.length) fails.push(`A: ${c.term} heading skip ${skips.join(',')}`)
  if (d.firstSectionHeadFontSize !== '13px') fails.push(`A: ${c.term} section heading font-size=${d.firstSectionHeadFontSize}, expected 13px`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
line(`  distinct section headings actually rendered: ${[...covered].join(', ') || '(none)'} (${covered.size})`)
if (covered.size < 4) fails.push(`A: only ${covered.size} distinct section headings rendered -- the rest were never measured`)

// ---------------------------------------------------------------- PART B
line('\n=== B. ToastStack pointer-events (no force:true anywhere below) ===')
await gotoTasks()
await page.fill('#task-search', '')
await page.waitForTimeout(400)

// The historical dead zone: the toast column's x-range over the full height of
// the page, which is what the stretched stack used to cover. A point in here,
// over a row and clear of the live toast, is the thing that used to be unclickable.
const pickPoint = () => page.evaluate(() => {
  const stack = document.querySelector('.toast-stack')
  if (!stack) return { mounted: false }
  const box = stack.getBoundingClientRect()
  const sr = { left: box.left, right: box.right, top: 18, bottom: window.innerHeight }
  const toastBoxes = [...stack.querySelectorAll('.toast')].map(t => t.getBoundingClientRect())
  const rows = [...document.querySelectorAll('[role="group"][tabindex="0"]')]
  for (const row of rows) {
    const rr = row.getBoundingClientRect()
    const lo = Math.max(sr.left, rr.left)
    const hi = Math.min(sr.right, rr.right)
    if (hi - lo < 8) continue
    const y = Math.round(rr.top + rr.height / 2)
    if (y < sr.top || y > sr.bottom) continue
    // Walk across the overlap and take the first spot that is NOT an action
    // button -- clicking a row action would mutate data, and "the row opened"
    // is the assertion we want anyway.
    let x = null
    let hit = null
    for (let px = Math.round(hi) - 4; px >= Math.round(lo) + 4; px -= 8) {
      const el = document.elementFromPoint(px, y)
      if (!el) continue
      if (el.closest('button,a,[role="menuitem"],summary,input')) continue
      x = px
      hit = el
      break
    }
    if (x === null) continue
    if (toastBoxes.some(t => y >= t.top && y <= t.bottom && x >= t.left && x <= t.right)) continue
    return {
      mounted: true,
      pointerEvents: getComputedStyle(stack).pointerEvents,
      rect: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
      toasts: toastBoxes.length,
      probe: { x, y },
      hitTag: hit?.tagName || null,
      hitInsideStack: stack.contains(hit),
      hitInsideRow: !!hit?.closest('[role="group"][tabindex="0"]'),
      rowLabel: row.getAttribute('aria-label')?.slice(0, 30) || null
    }
  }
  return { mounted: true, noOverlap: true, rect: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } }
})

const idle = await pickPoint()
line(`  idle: mounted=${idle.mounted} pointerEvents=${idle.pointerEvents} toasts=${idle.toasts} rect=${JSON.stringify(idle.rect)}`)
line(`  idle: point ${JSON.stringify(idle.probe)} over row "${idle.rowLabel}" hits <${idle.hitTag}> insideStack=${idle.hitInsideStack} insideRow=${idle.hitInsideRow}`)
if (idle.noOverlap) fails.push('B: toast-stack box does not overlap any row -- cannot test')
if (idle.pointerEvents !== 'none') fails.push(`B: idle .toast-stack pointer-events=${idle.pointerEvents}`)
if (idle.hitInsideStack) fails.push('B: idle .toast-stack still wins hit-testing over the row')
if (!idle.hitInsideRow) fails.push('B: idle probe point does not hit the row underneath')

// The only toast source in the app is runHubAction (Dashboard.tsx:122-136), wired
// to the header overflow menu. Intercepting /api/pull raises a real error toast
// without the request ever reaching the hub, so no data is touched.
await page.route('**/api/pull', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"probe-injected failure"}' }))

async function raiseToast() {
  await page.locator('button.hub-icon-btn.grid').last().click()
  await page.waitForSelector('.hub-menu-item', { state: 'visible', timeout: 5000 })
  await page.locator('.hub-menu-item').first().click()
  await page.waitForSelector('.toast', { state: 'visible', timeout: 6000 })
}

await raiseToast()
const live = await pickPoint()
const toastInfo = await page.evaluate(() => {
  const t = document.querySelector('.toast')
  const r = t.getBoundingClientRect()
  return {
    visible: r.width > 0 && r.height > 0,
    pointerEvents: getComputedStyle(t).pointerEvents,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    text: t.textContent.trim().slice(0, 40)
  }
})
line(`  toast up: visible=${toastInfo.visible} toast.pointerEvents=${toastInfo.pointerEvents} rect=${JSON.stringify(toastInfo.rect)} text="${toastInfo.text}"`)
line(`  toast up: stack box is now ${JSON.stringify(live.rect)} (content-sized, was 360x866 full-height)`)
line(`  toast up: point ${JSON.stringify(live.probe)} in the old dead zone hits <${live.hitTag}> insideStack=${live.hitInsideStack} row="${live.rowLabel}"`)
if (!toastInfo.visible) fails.push('B: no visible toast to test under')
if (toastInfo.pointerEvents !== 'auto') fails.push(`B: toast pointer-events=${toastInfo.pointerEvents}`)
if (live.noOverlap) fails.push('B: no point inside the stack box overlaps a row while a toast is up')
if (!live.rowLabel) fails.push('B: point under the toast column does not hit a row')

// Real mouse click, no force, while the toast is still on screen.
await page.mouse.click(live.probe.x, live.probe.y)
const opened = await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
const openedTitle = opened ? await page.locator('[data-slot="dialog-title"]').first().innerText().catch(() => '') : ''
line(`  click-through (no force): dialog opened=${opened} title="${openedTitle.slice(0, 34)}"`)
if (!opened) fails.push('B: plain click under the toast column did not reach the row')
if (opened) { await page.keyboard.press('Escape'); await page.waitForTimeout(250) }

// The toast's own box must still take clicks.
await page.waitForSelector('.toast', { state: 'detached', timeout: 8000 }).catch(() => null)
await raiseToast()
const before = await page.locator('.toast').count()
await page.locator('.toast button').first().click()
await page.waitForTimeout(300)
const after = await page.locator('.toast').count()
line(`  toast dismiss button (no force): toasts ${before} -> ${after}`)
if (!(after < before)) fails.push('B: toast dismiss button was not clickable')
await page.unroute('**/api/pull')

// ---------------------------------------------------------------- PART C
line('\n=== C. Cancel confirm path, driven on a throwaway task created via the API ===')
const MARK = `throwaway-cancel-${Date.now()}`
await fetch(`${BASE}/api/task/add`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: MARK, from: 'dashboard-qa', project: 'ai-memory-hub', priority: 'low' })
}).then(r => r.json())
const listOf = j => (j.tasks || j.items || j.data || j || []).filter(t => String(t.title || '').includes(MARK))
const apiBefore = await fetch(`${BASE}/api/tasks?limit=400`).then(r => r.json())
const b = listOf(apiBefore)
line(`  created "${MARK}"`)
line(`  API before: ${b.length} match(es) ${JSON.stringify(b.map(t => ({ id: t.id, status: t.status })))}`)
if (b.length !== 1 || b[0].status === 'cancelled') fails.push('C: throwaway task is not in the expected open state')

await gotoTasks()
const foundThrowaway = await findRow(MARK)
line(`  UI before: rows matching "${MARK}" = ${await page.locator(ROWS).count()}`)
if (!foundThrowaway) fails.push('C: throwaway row not visible in the UI')

// NB: the header overflow trigger carries the same accessible name, so scope the
// lookup to the row's own trigger class rather than the role+name.
await page.locator('.task-action-menu-trigger').first().click()
await page.waitForSelector('.task-action-menu-items', { state: 'visible', timeout: 4000 })
const menuGeom = await page.evaluate(() => {
  const items = document.querySelector('.task-action-menu-items')
  const r = items.getBoundingClientRect()
  const clip = document.querySelector('.virtual-list-viewport')?.getBoundingClientRect()
  const mid = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + 12))
  return {
    rect: { y: Math.round(r.y), h: Math.round(r.height) },
    clipTop: clip ? Math.round(clip.top) : null,
    withinClip: clip ? r.top >= clip.top - 1 : null,
    topHit: mid?.tagName + '.' + (mid?.getAttribute('role') || '')
  }
})
line(`  menu: rect=${JSON.stringify(menuGeom.rect)} viewportTop=${menuGeom.clipTop} withinClip=${menuGeom.withinClip} topHit=${menuGeom.topHit}`)
if (menuGeom.withinClip === false) fails.push('C: action menu is painted above the clipping viewport (unclickable)')

await page.getByRole('menuitem', { name: /^取消$|^Cancel$/ }).click()
await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })
const confirmDlg = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  return {
    title: (d.querySelector('[data-slot="dialog-title"]')?.textContent || '').trim(),
    desc: (d.querySelector('[data-slot="dialog-description"]')?.textContent || '').trim().slice(0, 44),
    buttons: [...d.querySelectorAll('button')].map(x => x.textContent.trim()).filter(Boolean)
  }
})
line(`  confirm dialog: title="${confirmDlg.title}" describes="${confirmDlg.desc}" buttons=${JSON.stringify(confirmDlg.buttons)}`)
if (!confirmDlg.desc.includes('throwaway')) fails.push('C: confirm dialog does not name the task being cancelled')
const reqs = []
page.on('request', r => { if (r.url().includes('/api/task/status')) reqs.push(r.method() + ' ' + r.url().replace(BASE, '')) })

await page.getByRole('button', { name: /^确认取消任务$|^Cancel task$/ }).click()
await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 }).catch(() => null)
await page.waitForTimeout(1200)
const rowsAfter = await page.locator(ROWS).count()
const rowStatus = rowsAfter ? await page.locator(ROWS).first().innerText().then(t => t.replace(/\s+/g, ' ').slice(0, 70)) : ''
line(`  request fired: ${JSON.stringify(reqs)}`)
line(`  UI after confirm (no reload): rows still matching = ${rowsAfter} ${rowStatus ? `-> "${rowStatus}"` : ''}`)

const apiAfter = await fetch(`${BASE}/api/tasks?limit=400`).then(r => r.json())
const a = listOf(apiAfter)
const apiAll = await fetch(`${BASE}/api/tasks?limit=400&includeCancelled=1`).then(r => r.json()).catch(() => ({}))
const aAll = listOf(apiAll)
line(`  API after: default list matches=${a.length} | includeCancelled=1 matches=${aAll.length} ${JSON.stringify(aAll.map(t => ({ id: t.id, status: t.status })))}`)
if (a.length !== 0) fails.push('C: server still returns the cancelled task in the default list')

// Separate "the cancel did not work" from "the client list is stale".
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector(ROWS, { state: 'visible', timeout: 15000 })
await findRow(MARK, 3)
const rowsReload = await page.locator(ROWS).count()
line(`  UI after reload: rows still matching = ${rowsReload}`)
if (rowsReload !== 0) fails.push(`C: row survives even a reload (${rowsReload})`)
if (rowsAfter !== 0 && rowsReload === 0) fails.push('C: row only leaves the list after a full reload -- client merge keeps deleted records')

// The 500s below are the probe's own injected /api/pull failures from part B.
const realErrs = errs.filter(e => !e.includes('500'))
line(`\n  console/page errors during run: ${errs.length} total, ${realErrs.length} not probe-injected${realErrs.length ? ' -> ' + realErrs.slice(0, 3).join(' | ') : ''}`)
if (realErrs.length) fails.push(`errors: ${realErrs.length}`)

await browser.close()
line(`\n=== FAILURES: ${fails.length} ===`)
fails.forEach(f => line('  FAIL ' + f))
if (fails.length) process.exitCode = 1
