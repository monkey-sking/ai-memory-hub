#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const base = 'http://localhost:5199'
const outDir = path.resolve('.runtime/ui-dialogs')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`) })
page.on('pageerror', e => errors.push(`${page.url()} :: ${e.message}`))

async function shot(name) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, name + '.png') })
  process.stdout.write('shot ' + name + '\n')
}
async function clickText(txt, opts = {}) {
  const el = page.getByText(txt, { exact: false }).first()
  await el.waitFor({ state: 'visible', timeout: 4000 })
  await el.click()
  await page.waitForTimeout(600)
}
async function clickRole(name, txt) {
  const el = page.getByRole(name, { name: txt, exact: false }).first()
  await el.waitFor({ state: 'visible', timeout: 4000 })
  await el.click()
  await page.waitForTimeout(600)
}

// 1. Tasks — create dialog
await page.goto(base + '/tasks', { waitUntil: 'networkidle' })
try { await clickText('新建任务'); await shot('tasks-create'); } catch (e) { process.stdout.write('tasks-create FAIL ' + e.message + '\n') }
// close
await page.keyboard.press('Escape'); await page.waitForTimeout(300)

// 2. Workflows — create dialog
await page.goto(base + '/workflows', { waitUntil: 'networkidle' })
try { await clickText('新建工作流'); await shot('workflows-create'); } catch (e) { process.stdout.write('workflows-create FAIL ' + e.message + '\n') }
await page.keyboard.press('Escape'); await page.waitForTimeout(300)

// 3. Memory — add dialog
await page.goto(base + '/memory', { waitUntil: 'networkidle' })
try { await clickText('添加记忆'); await shot('memory-add'); } catch (e) { process.stdout.write('memory-add FAIL ' + e.message + '\n') }
await page.keyboard.press('Escape'); await page.waitForTimeout(300)

// 4. Projects — edit dialog (click first row's 编辑)
await page.goto(base + '/projects', { waitUntil: 'networkidle' })
try { await clickText('编辑'); await shot('projects-edit'); } catch (e) { process.stdout.write('projects-edit FAIL ' + e.message + '\n') }
await page.keyboard.press('Escape'); await page.waitForTimeout(300)

// 5. Tasks — row action menu (click first task row to open detail)
await page.goto(base + '/tasks', { waitUntil: 'networkidle' })
try {
  const row = page.locator('table tbody tr').first()
  await row.click({ position: { x: 5, y: 20 } })
  await page.waitForTimeout(700)
  await shot('task-detail')
} catch (e) { process.stdout.write('task-detail FAIL ' + e.message + '\n') }

// 6. Table button alignment zoom: projects + tasks + workflow console
await page.goto(base + '/projects', { waitUntil: 'networkidle' })
await shot('projects-grid')
await page.goto(base + '/tasks', { waitUntil: 'networkidle' })
await shot('tasks-grid')

await browser.close()
if (errors.length) process.stdout.write('\nconsole errors (' + errors.length + '):\n' + errors.slice(0, 20).join('\n') + '\n')
process.stdout.write('\nwrote ' + outDir + '\n')
