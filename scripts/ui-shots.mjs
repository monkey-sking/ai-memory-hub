#!/usr/bin/env node
/**
 * Capture full-page screenshots of every console route for design review.
 *
 * Usage: node scripts/ui-shots.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const base = process.argv[2] || 'http://localhost:5199'
const outDir = path.resolve(process.argv[3] || '.runtime/ui-shots')

const routes = [
  ['dashboard', '/dashboard'],
  ['tasks', '/tasks'],
  ['workflows', '/workflows'],
  ['memory', '/memory'],
  ['radio', '/radio'],
  ['dispatch', '/dispatch'],
  ['tools', '/tools'],
  ['skills', '/skills'],
  ['extensions', '/extensions'],
  ['chat', '/chat'],
  ['analytics', '/analytics'],
  ['search', '/search'],
  ['backups', '/backups'],
  ['projects', '/projects'],
  ['health', '/health'],
  ['settings', '/settings']
]

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2
})
const page = await context.newPage()

const errors = []
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(`${page.url()} :: ${msg.text()}`)
})
page.on('pageerror', err => errors.push(`${page.url()} :: ${err.message}`))

for (const [name, route] of routes) {
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true })
  process.stdout.write(`shot ${name}\n`)
}

// One narrow capture to sanity-check the responsive rail.
await page.setViewportSize({ width: 900, height: 900 })
await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(outDir, 'dashboard-900w.png'), fullPage: true })
process.stdout.write('shot dashboard-900w\n')

await browser.close()

if (errors.length) {
  process.stdout.write(`\nconsole errors (${errors.length}):\n${errors.join('\n')}\n`)
}
process.stdout.write(`\nwrote to ${outDir}\n`)
