import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:5271'
const results = []
const log = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} :: ${detail}`) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

async function go(route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}

// 1) Search results: time must sit next to the title, not pushed to far right.
try {
  await go('/search')
  await page.fill('.search-main-input input', 'a')
  await page.getByRole('button', { name: /搜索|Search|运行|globalSearch/i }).first().click().catch(() => {})
  await page.waitForSelector('.search-result-card', { timeout: 8000 }).catch(() => {})
  const card = await page.$('.search-result-card')
  if (!card) { log('search/has-result', false, 'no result card rendered') }
  else {
    const data = await page.evaluate(() => {
      const c = document.querySelector('.search-result-card')
      const strong = c.querySelector('strong')
      const time = c.querySelector('.search-result-time')
      if (!strong || !time) return { ok: false }
      const cr = c.getBoundingClientRect(), sr = strong.getBoundingClientRect(), tr = time.getBoundingClientRect()
      return { ok: true, cardRight: cr.right, strongRight: sr.right, timeLeft: tr.left, timeRight: tr.right, gap: tr.left - sr.right }
    })
    if (!data.ok) log('search/time-present', false, '.search-result-time or strong missing')
    else {
      const nearTitle = data.gap >= -4 && data.gap <= 60
      const notFarRight = (data.cardRight - data.timeRight) >= 30
      log('search/time-near-title', nearTitle, `gap=${Math.round(data.gap)}px`)
      log('search/time-not-far-right', notFarRight, `space-to-card-right=${Math.round(data.cardRight - data.timeRight)}px`)
    }
  }

  // Search page layout sanity: summary spacing, command row gap, content grid columns.
  const layout = await page.evaluate(() => {
    const summary = document.querySelector('.search-result-summary')
    const row = document.querySelector('.search-command-row')
    const grid = document.querySelector('.search-content-grid')
    return {
      summaryDisplay: summary ? getComputedStyle(summary).display : null,
      summaryGap: summary ? parseFloat(getComputedStyle(summary).gap) || 0 : 0,
      rowDisplay: row ? getComputedStyle(row).display : null,
      rowGap: row ? parseFloat(getComputedStyle(row).gap) || 0 : 0,
      gridDisplay: grid ? getComputedStyle(grid).display : null,
      gridTemplate: grid ? getComputedStyle(grid).gridTemplateColumns : null
    }
  })
  log('search/summary-flex', layout.summaryDisplay === 'flex', `display=${layout.summaryDisplay}`)
  log('search/summary-gap', layout.summaryGap >= 16, `gap=${layout.summaryGap}px`)
  log('search/command-flex', layout.rowDisplay === 'flex', `display=${layout.rowDisplay}`)
  log('search/command-gap', layout.rowGap >= 8, `gap=${layout.rowGap}px`)
  const gridCols = layout.gridTemplate ? layout.gridTemplate.split(' ').length : 0
  log('search/grid-two-col', layout.gridDisplay === 'grid' && gridCols === 2 && layout.gridTemplate.startsWith('260px'), `template=${layout.gridTemplate}`)
} catch (e) { log('search', false, String(e)) }

// 2) Workflow card: updated time must be inside the left title block, removed from actions row.
try {
  await go('/workflows')
  await page.waitForSelector('.workflow-card', { timeout: 8000 }).catch(() => {})
  const wf = await page.$('.workflow-card')
  if (!wf) log('workflow/has-card', false, 'no workflow card')
  else {
    const data = await page.evaluate(() => {
      const card = document.querySelector('.workflow-card')
      const updated = card.querySelector('.workflow-updated')
      const inActions = !!(card.querySelector('.workflow-actions .workflow-updated'))
      if (!updated) return { ok: false }
      const cr = card.getBoundingClientRect(), ur = updated.getBoundingClientRect()
      return { ok: true, cardCenterX: cr.left + cr.width / 2, updatedCenterX: ur.left + ur.width / 2, inActions }
    })
    if (!data.ok) log('workflow/updated-present', false, '.workflow-updated missing')
    else {
      log('workflow/removed-from-actions', !data.inActions, data.inActions ? 'still in actions row' : 'moved out of actions')
      log('workflow/updated-on-left', data.updatedCenterX < data.cardCenterX, `updatedCenterX=${Math.round(data.updatedCenterX)} cardCenterX=${Math.round(data.cardCenterX)}`)
    }
  }
} catch (e) { log('workflow', false, String(e)) }

// 3) Projects table: updated column removed; time now a subtitle line in the name cell.
try {
  await go('/projects')
  await page.waitForSelector('table tbody tr', { timeout: 8000 }).catch(() => {})
  const row = await page.$('table tbody tr')
  if (!row) log('projects/has-row', false, 'no table row')
  else {
    const data = await page.evaluate(() => {
      const row = document.querySelector('table tbody tr')
      const numericTd = row.querySelector('td[numeric]')
      const nameCell = row.querySelectorAll('td')[1]
      const subtitle = nameCell ? nameCell.querySelector('.text-ink-3') : null
      const cellChildren = nameCell ? nameCell.querySelectorAll(':scope > div > *').length : 0
      return { hasNumericCol: !!numericTd, hasSubtitle: !!subtitle, cellChildren }
    })
    log('projects/no-numeric-updated-col', !data.hasNumericCol, data.hasNumericCol ? 'numeric updated column still present' : 'removed')
    log('projects/time-in-name-cell', data.hasSubtitle, `nameCell children=${data.cellChildren}`)
  }
} catch (e) { log('projects', false, String(e)) }

// 4) Dispatch card: orphaned bottom .muted-text removed; date now in header left block.
try {
  await go('/dispatch')
  await page.waitForSelector('.dispatch-card', { timeout: 8000 }).catch(() => {})
  const dc = await page.$('.dispatch-card')
  if (!dc) log('dispatch/has-card', false, 'no dispatch card')
  else {
    const data = await page.evaluate(() => {
      const card = document.querySelector('.dispatch-card')
      const orphan = card.querySelector('.muted-text')
      const date = card.querySelector('.dispatch-card-date')
      const inHeader = !!(card.querySelector('.dispatch-card-header .dispatch-card-date'))
      const ws = date ? getComputedStyle(date).whiteSpace : null
      return { hasOrphan: !!orphan, hasDate: !!date, inHeader, ws }
    })
    log('dispatch/no-orphan-date', !data.hasOrphan, data.hasOrphan ? 'bottom .muted-text still present' : 'removed')
    log('dispatch/date-in-header', data.inHeader, data.inHeader ? 'in header left block' : 'missing')
    log('dispatch/date-wraps', data.ws === 'normal', `computed white-space=${data.ws}`)
  }
} catch (e) { log('dispatch', false, String(e)) }

log('console-errors', errors.length === 0, errors.slice(0, 3).join(' | '))

// Mobile viewport (390px): time must stay visible and the page must not overflow horizontally.
await page.setViewportSize({ width: 390, height: 800 })
const mobile = []
const mlog = (name, pass, detail) => { mobile.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} :: ${detail}`) }
async function goM(route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
}
const noHScroll = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 2)
const visible = async (sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }, sel)

try {
  await goM('/search')
  await page.fill('.search-main-input input', 'a')
  await page.getByRole('button', { name: /搜索|Search|运行|globalSearch/i }).first().click().catch(() => {})
  await page.waitForSelector('.search-result-card', { timeout: 8000 }).catch(() => {})
  mlog('mobile/search-time-visible', await visible('.search-result-time'), 'time element has box')
  mlog('mobile/search-no-hscroll', await noHScroll(), 'no horizontal overflow')
} catch (e) { mlog('mobile/search', false, String(e)) }

try {
  await goM('/workflows')
  await page.waitForSelector('.workflow-card', { timeout: 8000 }).catch(() => {})
  mlog('mobile/workflow-updated-visible', await visible('.workflow-updated'), 'updated element has box')
  mlog('mobile/workflow-no-hscroll', await noHScroll(), 'no horizontal overflow')
} catch (e) { mlog('mobile/workflow', false, String(e)) }

try {
  await goM('/projects')
  await page.waitForSelector('table tbody tr', { timeout: 8000 }).catch(() => {})
  mlog('mobile/projects-subtitle-visible', await visible('tbody tr td:nth-child(2) .text-ink-3'), 'name-cell subtitle has box')
} catch (e) { mlog('mobile/projects', false, String(e)) }

try {
  await goM('/dispatch')
  await page.waitForSelector('.dispatch-card', { timeout: 8000 }).catch(() => {})
  mlog('mobile/dispatch-date-visible', await visible('.dispatch-card-date'), 'date element has box')
} catch (e) { mlog('mobile/dispatch', false, String(e)) }

log('mobile-checks', mobile.every(m => m.pass), `${mobile.filter(m => m.pass).length}/${mobile.length} passed`)

await browser.close()
const failed = results.filter(r => !r.pass)
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
process.exit(failed.length ? 1 : 0)
