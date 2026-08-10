import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:5271'
const WIDTHS = [1440, 1024, 768, 640, 390]

const browser = await chromium.launch()
let bad = 0
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(`${BASE}/workflows`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-slot="page-shell"]', { timeout: 20000 })
  await page.waitForSelector('.workflow-card-grid', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(700)
  const info = await page.evaluate(() => {
    const grid = document.querySelector('.workflow-card-grid')
    if (!grid) return null
    const gs = getComputedStyle(grid)
    const card = grid.querySelector('.workflow-card')
    const cs = card ? getComputedStyle(card) : null
    const scoped = document.querySelector('.dashboard-section-workflows')
    let overflowing = 0
    let worst = null
    if (card) {
      for (const child of card.children) {
        const r = child.getBoundingClientRect()
        const cr = card.getBoundingClientRect()
        const over = Math.round(r.right - cr.right)
        if (over > 1) {
          overflowing++
          if (!worst || over > worst.over) worst = { cls: child.className, over }
        }
      }
    }
    return {
      classes: grid.className,
      scopedPresent: Boolean(scoped),
      cols: gs.gridTemplateColumns,
      colCount: gs.gridTemplateColumns.split(' ').filter(Boolean).length,
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : 0,
      cardScrollW: card ? card.scrollWidth : 0,
      cardClientW: card ? card.clientWidth : 0,
      cardMinHeight: cs ? cs.minHeight : '',
      cardCols: cs ? cs.gridTemplateColumns : '',
      cardColCount: cs ? cs.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      overflowing,
      worst,
      count: grid.querySelectorAll('.workflow-card').length
    }
  })
  if (!info) {
    console.log(`w=${width} GRID NOT FOUND`)
    bad++
    await page.close()
    continue
  }
  const listMode = info.classes.includes('workflow-list')
  const colViolation = listMode && info.colCount !== 1
  const overflowViolation = info.cardScrollW > info.cardClientW + 1 || info.overflowing > 0
  if (colViolation || overflowViolation) bad++
  console.log(
    `w=${width} scoped=${info.scopedPresent} cols=${info.colCount} cardW=${info.cardWidth} scrollW=${info.cardScrollW} clientW=${info.cardClientW} minH=${info.cardMinHeight} innerCols="${info.cardCols}" childOverflow=${info.overflowing}${info.worst ? ` worst=${info.worst.cls}(+${info.worst.over}px)` : ''} n=${info.count} ${colViolation ? 'COL-VIOLATION ' : ''}${overflowViolation ? 'OVERFLOW-VIOLATION' : (colViolation ? '' : 'ok')}`
  )
  await page.close()
}
await browser.close()
console.log(`=== workflow grid violations: ${bad} ===`)
process.exit(bad ? 1 : 0)
