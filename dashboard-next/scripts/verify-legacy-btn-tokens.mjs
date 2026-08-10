import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5199'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// expected values derived from ui/button.tsx:
//   sm: h-8 (32px) text-sm (14px);  md: h-9 (36px) text-sm (14px);  base font-medium (500)
const EXPECT = {
  '.btn:not(.small)': { h: 36, fs: '14px', fw: '500' },
  '.btn.small': { h: 32, fs: '14px', fw: '500' },
  '.task-action-menu-trigger': { h: 32, fs: '14px', fw: '500' },
  '.command-center-hero h1': { fs: '24px', fw: '400' },
}

const ROUTES = ['/', '/tasks', '/tools', '/backups', '/search']
const seen = new Map()

for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(3000)
  for (const sel of Object.keys(EXPECT)) {
    const got = await page.evaluate(s => {
      const el = Array.from(document.querySelectorAll(s)).find(e => e.getBoundingClientRect().height > 0)
      if (!el) return null
      const cs = getComputedStyle(el)
      return { h: Math.round(el.getBoundingClientRect().height), fs: cs.fontSize, fw: cs.fontWeight }
    }, sel)
    if (got && !seen.has(sel)) seen.set(sel, { route, got })
  }
}

let fail = 0
for (const [sel, exp] of Object.entries(EXPECT)) {
  const hit = seen.get(sel)
  if (!hit) { console.log(`SKIP  ${sel}  (not rendered on probed routes)`); continue }
  const { route, got } = hit
  const bad = []
  if (exp.h !== undefined && got.h !== exp.h) bad.push(`height ${got.h} != ${exp.h}`)
  if (exp.fs && got.fs !== exp.fs) bad.push(`font-size ${got.fs} != ${exp.fs}`)
  if (exp.fw && got.fw !== exp.fw) bad.push(`font-weight ${got.fw} != ${exp.fw}`)
  if (bad.length) { fail++; console.log(`FAIL  ${sel}  @${route}  ${bad.join(', ')}`) }
  else console.log(`PASS  ${sel}  @${route}  h=${got.h} fs=${got.fs} fw=${got.fw}`)
}

console.log(`\n=== ${fail} FAIL / ${seen.size} measured ===`)
await browser.close()
process.exit(fail ? 1 : 0)
