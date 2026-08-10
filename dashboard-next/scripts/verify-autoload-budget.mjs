// One user action must cost at most one page fetch.
//
// VirtualizedList auto-loads when its end-of-list sentinel enters the viewport.
// When a filter cuts the list down to a handful of rows the sentinel is *already*
// in view and never leaves, so an unguarded `onEndReached` re-fires on every
// render and walks the whole collection: typing one word in the /radio filter
// pulled 50 -> 650 records in a single interaction. The guard lives in
// VirtualizedList.tsx (in-flight check + a one-shot gate re-armed by
// src/lib/virtualization.ts createEndReachedGate), and this is what proves it.
//
// A filter that matches nothing proves nothing -- the sentinel needs rows to sit
// below -- so the script fails if the result set is empty.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
// Long on purpose: a runaway loop needs time to show itself. 6s was enough to
// miss two of the three extra fetches.
const WAIT = Number(process.env.WAIT || 20000)
const BUDGET = Number(process.env.BUDGET || 1)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const api = []
page.on('request', r => {
  const u = new URL(r.url())
  if (u.pathname.startsWith('/api/')) api.push(u.pathname + u.search)
})

const fails = []

async function probe(route, inputSelector, term) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const start = api.length
  await page.fill(inputSelector, term)
  await page.waitForTimeout(WAIT)
  const during = api.slice(start).filter(u => !u.startsWith('/api/health'))
  const state = await page.evaluate(() => ({
    rows: document.querySelectorAll('.virtual-list-item').length,
    pill: document.querySelector('[data-slot="panel-header"] span')?.innerText || '',
    footer: (document.querySelector('[data-slot="panel-footer"]')?.innerText || '').replace(/\n/g, ' | ')
  }))
  const counts = {}
  for (const u of during) { const k = u.split('?')[0]; counts[k] = (counts[k] || 0) + 1 }

  console.log(`\n${route} filter="${term}" -> rows=${state.rows} pill=${JSON.stringify(state.pill)}`)
  console.log(`  /api/* requests caused by that one action: ${during.length} (budget ${BUDGET}) ${JSON.stringify(counts)}`)
  for (const u of during.slice(0, 30)) console.log('    ' + u)
  console.log(`  footer: ${JSON.stringify(state.footer)}`)

  if (state.rows === 0) fails.push(`${route}: filter "${term}" matched nothing -- no sentinel pressure, result is vacuous`)
  if (during.length > BUDGET) fails.push(`${route}: ${during.length} requests for one filter action (budget ${BUDGET})`)
}

// Hardcoded terms rot: "direct" and "supervisor" both stopped matching as the
// data moved on, and the script then reported "0 rows" for two runs in a row.
// Derive a term from the page the client actually loads (the newest slice), so
// the sentinel always has rows below it.
async function termFor(path, listKey, field, fallback) {
  try {
    const json = await fetch(`${BASE}${path}`).then(r => r.json())
    const list = json[listKey] || json.items || json.data || json
    const counts = new Map()
    for (const item of list) {
      for (const word of new Set(String(item[field] || '').toLowerCase().match(/[a-z]{5,}/g) || [])) {
        counts.set(word, (counts.get(word) || 0) + 1)
      }
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best && best[1] >= 5) {
      console.log(`derived filter for ${path}: "${best[0]}" (${best[1]} of ${list.length} loaded records)`)
      return best[0]
    }
  } catch { /* fall through to the fallback below */ }
  return fallback
}

const radioTerm = process.env.RADIO_TERM || (await termFor('/api/radio', 'messages', 'text', 'dispatch'))
const taskTerm = process.env.TASK_TERM || (await termFor('/api/tasks?limit=200', 'tasks', 'title', 'dashboard'))
await probe('/radio', '#search', radioTerm)
await probe('/tasks', '#task-search', taskTerm)
await browser.close()

console.log(`\n=== over-budget actions: ${fails.length} ===`)
fails.forEach(f => console.log('  FAIL ' + f))
if (fails.length) process.exitCode = 1
