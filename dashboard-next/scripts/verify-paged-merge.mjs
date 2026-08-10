/**
 * Regression probe for the PAGED-IN branch of `mergeSnapshotCollection`
 * (src/pages/Dashboard.tsx:335-344).
 *
 * Why this exists: `verify-toast-and-cancel.mjs` part C cancels a brand-new task
 * while only page 0 is loaded, so the merge returns via the wholesale
 * short-circuit at Dashboard.tsx:322 and the paged-in branch never runs. This
 * probe scrolls extra pages in first, then exercises both directions:
 *
 *   A  a record is ADDED   server-side -> no held record may be evicted
 *   B  a record is DELETED server-side -> its row must disappear, and records
 *      must not be resurrected at the wrong end of the list
 *
 * A is the one that catches the covered-range boundary bug: page 0 is capped at
 * `limit`, so one new arrival at the head pushes the record at index `limit - 1`
 * out of the snapshot. If `coveredCount` is not reduced by the number of new
 * arrivals, that record looks "deleted" and is dropped from client state. It is
 * then unreachable: `loadMoreCollection` pages by `offset = currentItems.length`
 * (Dashboard.tsx:176), which is now short by one and skips straight past the
 * hole, so scrolling cannot bring it back — only a full reload can.
 *
 * B then shows the follow-on symptom: on a later merge the evicted record is no
 * longer in `knownKeys`, so it is classified as a brand-new arrival and spliced
 * onto the *head* of a newest-first list — a mid-list task silently jumps to the
 * top.
 *
 * Usage:  node scripts/verify-paged-merge.mjs
 *   BASE=http://localhost:5271  dev server origin
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROWS = '[role="group"][tabindex="0"]'
const failures = []
const made = []
const line = s => console.log(s)
const fail = s => { failures.push(s); console.log(`  FAIL ${s}`) }
const pass = s => console.log(`  ok   ${s}`)
const info = s => console.log(`  --   ${s}`)

const post = (p, b) =>
  fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    .then(r => r.json())
const page0 = async () => {
  const j = await fetch(`${BASE}/api/tasks?limit=200`).then(r => r.json())
  return { items: j.tasks || j.items || j.data || [], total: j.total, limit: j.limit }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const requests = []
page.on('request', r => {
  const u = new URL(r.url())
  if (u.pathname === '/api/tasks') requests.push(u.search || '(page0)')
})

// The header pill counts the records the client is actually holding.
const held = () =>
  page.evaluate(() =>
    Number((document.querySelector('[data-slot="panel-header"] span')?.innerText || '').replace(/[^\d]/g, '')) || 0
  )
const clearSearch = async () => { await page.fill('#task-search', ''); await page.waitForTimeout(600) }
const rowsFor = async term => {
  await clearSearch()
  await page.fill('#task-search', term)
  await page.waitForTimeout(800)
  const n = await page.locator(ROWS).count()
  await clearSearch()
  return n
}
const firstRowText = async () => {
  await clearSearch()
  return (await page.locator(ROWS).first().innerText()).replace(/\s+/g, ' ').slice(0, 60)
}
const refresh = async () => {
  await page.getByRole('button', { name: /刷新|Refresh/i }).first().click()
  await page.waitForTimeout(3000)
}
// TasksPanel.loadMore expands a LOCAL window before it ever asks the server, so
// one "load more" click does not page in — keep clicking until the held count
// actually passes the server page size.
const exhaust = async () => {
  for (let i = 0; i < 12; i += 1) {
    const more = page.getByRole('button', { name: /^加载更多$|^Load more$/ })
    if (!(await more.count())) return
    await more.first().click()
    await page.waitForTimeout(1200)
  }
}

try {
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' })
  await page.waitForSelector(ROWS, { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(1500)
  await clearSearch()
  await exhaust()

  const baseline = await held()
  const snap = await page0()
  const pageSize = snap.limit || snap.items.length
  if (baseline <= pageSize) {
    fail(`could not page past the first server page (held=${baseline}, pageSize=${pageSize}) — the paged-in branch is unreachable, so this probe would pass vacuously`)
    throw new Error('setup')
  }
  // The record at the tail of page 0 is the one a new arrival pushes out.
  const victim = snap.items[snap.items.length - 1]
  const victimTerm = String(victim.title).slice(0, 24)
  const headTitle = String(snap.items[0].title).slice(0, 24)
  line(`setup: held=${baseline}, server total=${snap.total}, pageSize=${pageSize}`)
  line(`       boundary record = index ${snap.items.length - 1} "${String(victim.title).slice(0, 40)}" (${victim.id})`)
  if ((await rowsFor(victimTerm)) === 0) {
    fail('boundary record is not rendered before the test — cannot measure eviction')
    throw new Error('setup')
  }

  // ---- A: an arrival must not evict the covered-range boundary -----------
  line('\nA  new arrival while extra pages are loaded')
  const throwaway = `throwaway-merge-${Date.now()}`
  await post('/api/task/add', { title: throwaway, from: 'dashboard-qa', project: 'ai-memory-hub', priority: 'low' })
  const throwawayId = (await page0()).items.find(x => String(x.title) === throwaway)?.id
  made.push(throwawayId)
  await refresh()
  const afterAdd = await held()
  const victimRows = await rowsFor(victimTerm)
  if (afterAdd === baseline + 1) pass(`held ${baseline} -> ${afterAdd}`)
  else fail(`held ${baseline} -> ${afterAdd}, expected ${baseline + 1} — ${baseline + 1 - afterAdd} live record(s) evicted by the merge`)
  if (victimRows > 0) pass('boundary record survived the arrival')
  else fail(`boundary record "${String(victim.title).slice(0, 40)}" (${victim.id}) was evicted — it is still on the server`)

  // ---- A2: severity — is the evicted record recoverable by scrolling? -----
  if (victimRows === 0) {
    await exhaust()
    const exhausted = await held()
    const recovered = await rowsFor(victimTerm)
    const serverTotal = (await page0()).total
    info(`after paging to the end: held=${exhausted}, server total=${serverTotal}, recovered=${recovered > 0}`)
    if (recovered === 0)
      fail('the evicted record cannot be recovered by scrolling — loadMoreCollection offsets by currentItems.length and skips the hole; only a full reload restores it')
  }

  // ---- B: a deletion must remove the row, without resurrecting others -----
  line('\nB  delete while extra pages are loaded')
  const heldBeforeDelete = await held()
  await post('/api/task/status', { id: throwawayId, status: 'cancelled', by: 'dashboard-qa' })
  await refresh()
  const afterDelete = await held()
  const throwawayRows = await rowsFor(throwaway.slice(0, 24))
  const topRow = await firstRowText()
  if (throwawayRows === 0) pass('deleted record left the list without a reload')
  else fail(`deleted record still rendered (${throwawayRows} rows) — stale zombie row`)
  if (afterDelete > pageSize) pass(`paged-in history kept (held=${afterDelete} > pageSize=${pageSize})`)
  else fail(`held collapsed to ${afterDelete} (<= pageSize ${pageSize}) — paged-in history was discarded`)
  // Exact arithmetic is only meaningful once A passes; report it either way.
  if (afterDelete === heldBeforeDelete - 1) pass(`held ${heldBeforeDelete} -> ${afterDelete}`)
  else info(`held ${heldBeforeDelete} -> ${afterDelete} (ideal ${heldBeforeDelete - 1}); a mismatch here is a knock-on of A, not an independent defect`)
  // Follow-on symptom: a record evicted in A is no longer in knownKeys, so the
  // next merge treats it as a brand-new arrival and prepends it to a
  // newest-first list.
  if (topRow.includes(String(victim.title).slice(0, 12)))
    fail(`evicted record was resurrected at the TOP of the newest-first list ("${topRow}") — a mid-list task silently jumped to row 0`)
  else pass(`top row is unchanged ("${topRow.slice(0, 32)}…", expected head "${headTitle.slice(0, 24)}…")`)
} catch (nextError) {
  if (String(nextError.message) !== 'setup') fail(`probe crashed: ${nextError.message}`)
} finally {
  line(`\n/api/tasks requests: ${JSON.stringify(requests)}`)
  await browser.close()
  for (const id of made) if (id) await post('/api/task/status', { id, status: 'cancelled', by: 'dashboard-qa' }).catch(() => null)
  line(`cleaned up: ${made.filter(Boolean).join(', ') || '(none)'}`)
  line(`\nFAILURES: ${failures.length}`)
  for (const f of failures) line(`  - ${f}`)
  process.exit(failures.length ? 1 : 0)
}
