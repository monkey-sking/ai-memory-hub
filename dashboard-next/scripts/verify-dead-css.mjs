// Finds selectors in the legacy stylesheets that no longer match anything in the
// rendered app. The shell migration kept some class hooks (.dashboard-panel-card,
// .dashboard-metric-card) but changed the DOM *inside* them, so rules keyed to the old
// internals stopped applying silently -- no build error, no lint error, no visual diff
// anyone would notice until the values drift apart.
//
// A selector is only reported dead if it matches on ZERO routes AND zero open dialogs.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5271'
const SHEETS = ['src/pages/Dashboard.css', 'src/components/Layout.css', 'src/components/Sidebar.css']
const ROUTES = ['/', '/workflows', '/tasks', '/memory', '/radio', '/projects', '/chat', '/skills',
  '/extensions', '/tools', '/health', '/settings', '/backups', '/search', '/dispatch', '/analytics']

// Pull selectors out of the CSS text. Deliberately crude but conservative: anything we
// cannot confidently parse is skipped rather than reported as dead.
function selectorsOf(css) {
  const out = new Set()
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /(^|[}{;])\s*([^{}@;]+?)\s*\{/g
  let m
  while ((m = re.exec(noComments))) {
    const chunk = m[2].trim()
    if (!chunk || chunk.startsWith('@') || chunk.includes(':root')) continue
    for (const sel of chunk.split(',')) {
      const s = sel.trim()
      if (!s) continue
      // Skip pseudo-element/state-only selectors: they cannot be matched by querySelector
      // in a meaningful way (:hover, ::before, :focus-visible ...).
      if (/::|:hover|:focus|:active|:disabled|:checked|:is\(|:where\(|:has\(|:not\(/.test(s)) continue
      if (!/^[.#a-zA-Z\[]/.test(s)) continue
      out.add(s)
    }
  }
  return [...out]
}

const all = new Map()
for (const sheet of SHEETS) {
  let css
  try { css = readFileSync(sheet, 'utf8') } catch { continue }
  for (const s of selectorsOf(css)) if (!all.has(s)) all.set(s, sheet)
}
const selectors = [...all.keys()]
console.log(`Parsed ${selectors.length} matchable selectors from ${SHEETS.length} stylesheets.`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const hits = new Map(selectors.map(s => [s, 0]))

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => null)
  await page.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 8000 }).catch(() => null)
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 8000 }).catch(() => null)
  await page.waitForTimeout(250)

  const counts = await page.evaluate(sels => sels.map(s => {
    try { return document.querySelectorAll(s).length } catch { return -1 }
  }), selectors)

  counts.forEach((n, i) => { if (n > 0) hits.set(selectors[i], hits.get(selectors[i]) + n) })
}

// Dialogs are their own layer -- a selector used only inside an overlay is NOT dead.
const OVERLAYS = [
  { route: '/tasks', open: p => p.locator('[role="group"][tabindex="0"]').first().click() },
  { route: '/tasks', open: p => p.getByRole('button', { name: /新增任务|New task/i }).first().click() },
  { route: '/radio', open: p => p.locator('[role="group"][tabindex="0"]').first().click() },
  { route: '/memory', open: p => p.locator('[role="group"][tabindex="0"]').first().click() },
  { route: '/workflows', open: p => p.getByRole('button', { name: /新建工作流|New workflow/i }).first().click() }
]
let overlaysOpened = 0
for (const o of OVERLAYS) {
  await page.goto(BASE + o.route, { waitUntil: 'networkidle' }).catch(() => null)
  await page.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 8000 }).catch(() => null)
  await page.waitForTimeout(1200)
  try {
    await o.open(page)
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })
    overlaysOpened += 1
  } catch { continue }
  const counts = await page.evaluate(sels => sels.map(s => {
    try { return document.querySelectorAll(s).length } catch { return -1 }
  }), selectors)
  counts.forEach((n, i) => { if (n > 0) hits.set(selectors[i], hits.get(selectors[i]) + n) })
  await page.keyboard.press('Escape').catch(() => null)
}

await browser.close()

const dead = selectors.filter(s => hits.get(s) === 0)
console.log(`Measured ${ROUTES.length} routes and ${overlaysOpened}/${OVERLAYS.length} overlays.\n`)
console.log(`=== selectors matching nothing anywhere: ${dead.length} / ${selectors.length} ===`)
const byFile = new Map()
for (const s of dead) {
  const f = all.get(s)
  if (!byFile.has(f)) byFile.set(f, [])
  byFile.get(f).push(s)
}
for (const [f, list] of byFile) {
  console.log(`\n${f}  (${list.length})`)
  for (const s of list.sort()) console.log('   ' + s)
}
if (overlaysOpened < OVERLAYS.length) {
  console.log(`\nWARNING: ${OVERLAYS.length - overlaysOpened} overlay(s) did not open; selectors used only there could be misreported as dead.`)
  process.exitCode = 1
}
