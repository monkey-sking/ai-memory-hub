import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5199'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const logs = []
page.on('console', m => logs.push(`[console.${m.type()}] ${m.text()}`))
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))

await page.goto(`${BASE}/workflows`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// Find the first workflow card and its action buttons
const card = page.locator('article.workflow-card').first()
await card.waitFor({ timeout: 10000 })

async function probe(label, btnText) {
  // close any open dialog first
  const openDlg = page.locator('[role="dialog"]')
  if (await openDlg.count()) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
  // Secondary workflow actions live in the "更多操作" overflow menu
  // (role="menu"), not as inline buttons on the card — open it first.
  const moreBtn = card.locator('button:has-text("更多操作")').first()
  if (await moreBtn.count()) {
    await moreBtn.click()
    await page.waitForTimeout(300)
  }
  const before = await page.locator('[role="dialog"]').count()
  // The menu now renders in a portal on document.body, so locate the
  // menuitem at page scope rather than inside the card.
  const btn = page.locator(`[role="menuitem"]:has-text("${btnText}")`).first()
  const n = await btn.count()
  if (!n) { console.log(`PROBE ${label}: button "${btnText}" NOT FOUND`); return }
  await btn.click()
  await page.waitForTimeout(700)
  const dlg = page.locator('[role="dialog"]').first()
  const after = await page.locator('[role="dialog"]').count()
  let title = '(none)'
  let bodySnippet = '(none)'
  if (await dlg.count()) {
    title = (await dlg.locator('[data-slot="dialog-title"]').first().innerText().catch(() => '(no title slot)')).trim()
    // detect graph: presence of .workflow-graph-list / "Planning"/"Execution"
    const hasGraph = await dlg.locator('.workflow-graph-list, .workflow-graph-node').count()
    bodySnippet = hasGraph ? 'GRAPH-NODE-PRESENT' : 'no-graph-node'
  }
  console.log(`PROBE ${label}: btn="${btnText}" dialogBefore=${before} dialogAfter=${after} title="${title}" ${bodySnippet}`)
}

await probe('edit', '编辑工作流')
await probe('result', '执行结果')
await probe('review', '审核意见')
await probe('note', '备注')
await probe('signal', '发送 Signal')
await probe('delete', '删除工作流')

if (logs.length) console.log('\n--- page logs ---\n' + logs.slice(0, 30).join('\n'))
await browser.close()
