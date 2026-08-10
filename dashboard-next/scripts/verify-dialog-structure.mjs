// Heading order INSIDE overlays. verify-page-structure.mjs only ever sees the page
// with every dialog closed, so an entire UI layer has never been measured. Radix
// DialogPrimitive.Title renders <h2>, so any <h4> inside a dialog body is an
// H2->H4 skip (WCAG 1.3.1) that no page-level probe can see.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'

// Each entry: how to reach a dialog, described the way a user would reach it.
const CASES = [
  // ListRow.tsx renders the clickable row as role="group" tabindex="0".
  { name: 'task detail', route: '/tasks', open: async p => {
      const row = p.locator('[role="group"][tabindex="0"]').first()
      await row.waitFor({ state: 'visible', timeout: 10000 })
      await row.click()
    } },
  { name: 'radio message detail', route: '/radio', open: async p => {
      const row = p.locator('[role="group"][tabindex="0"]').first()
      await row.waitFor({ state: 'visible', timeout: 10000 })
      await row.click()
    } },
  { name: 'memory detail', route: '/memory', open: async p => {
      const row = p.locator('[role="group"][tabindex="0"]').first()
      await row.waitFor({ state: 'visible', timeout: 10000 })
      await row.click()
    } },
  { name: 'new task', route: '/tasks', open: async p => {
      await p.getByRole('button', { name: /新增任务|New task/i }).first().click()
    } },
  { name: 'send radio', route: '/radio', open: async p => {
      await p.getByRole('button', { name: /发送 Radio|Send radio/i }).first().click()
    } },
  { name: 'new workflow', route: '/workflows', open: async p => {
      await p.getByRole('button', { name: /新建工作流|New workflow/i }).first().click()
    } },
  { name: 'workflow detail', route: '/workflows', open: async p => {
      const card = p.locator('[data-slot="list-row"], .workflow-card').first()
      await card.waitFor({ state: 'visible', timeout: 10000 })
      await card.click()
    } }
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))

let skipRoutes = 0
let unopened = 0
let unlabelled = 0

for (const c of CASES) {
  errs.length = 0
  await page.goto(BASE + c.route, { waitUntil: 'networkidle' }).catch(() => null)
  await page.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 8000 }).catch(() => null)
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 8000 }).catch(() => null)

  let opened = true
  try {
    await c.open(page)
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 6000 })
  } catch {
    opened = false
  }

  if (!opened) {
    // An overlay we cannot open is an unmeasured layer, not a pass.
    unopened += 1
    console.log(`\n${c.name.padEnd(22)} ${c.route}  COULD NOT OPEN -- layer left unmeasured`)
    continue
  }

  await page.waitForTimeout(400)

  const d = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]')
    if (!dlg) return null
    const heads = [...dlg.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    return {
      title: (dlg.querySelector('[data-slot="dialog-title"]')?.textContent || '').trim().slice(0, 40),
      titleTag: dlg.querySelector('[data-slot="dialog-title"]')?.tagName || null,
      headings: heads.map(h => h.tagName + ':' + (h.textContent || '').trim().slice(0, 14)),
      levels: heads.map(h => Number(h.tagName[1])),
      // Radix needs an accessible name; an unnamed dialog is announced as just "dialog".
      accName: dlg.getAttribute('aria-label') || dlg.getAttribute('aria-labelledby') || null
    }
  })

  const skips = []
  for (let i = 1; i < d.levels.length; i += 1) {
    if (d.levels[i] - d.levels[i - 1] > 1) skips.push('H' + d.levels[i - 1] + '->H' + d.levels[i])
  }
  if (skips.length) skipRoutes += 1
  if (!d.accName) unlabelled += 1

  console.log(`\n${c.name.padEnd(22)} ${c.route}`)
  console.log(`  title=<${d.titleTag}> "${d.title}"  accessibleName=${d.accName ? 'yes' : 'NO'}`)
  console.log(`  headings: ${d.headings.join(' > ') || '(none)'}`)
  if (skips.length) console.log(`  SKIP! ${[...new Set(skips)].join(',')}`)
  if (errs.length) console.log(`  pageerror: ${errs[0].slice(0, 120)}`)

  await page.keyboard.press('Escape').catch(() => null)
  await page.waitForTimeout(200)
}

await browser.close()
console.log(`\n=== dialogs with heading-level skips: ${skipRoutes} | dialogs that would not open: ${unopened} | dialogs with no accessible name: ${unlabelled} ===`)
if (skipRoutes || unopened || unlabelled) process.exitCode = 1
