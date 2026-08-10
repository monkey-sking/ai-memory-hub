// Panel titles measured at three different sizes across routes (13px/600, 14px/500,
// 14px/600). shell/Panel.tsx:88 declares `text-sm font-semibold` = 14px/600, so
// anything else is an override. This reports which rule wins, per route.
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTES = ['/', '/workflows', '/tasks', '/radio', '/projects', '/tools', '/health', '/backups', '/search', '/dispatch', '/analytics', '/settings', '/memory']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const seen = new Map()

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 8000 }).catch(() => null)
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 8000 }).catch(() => null)
  await page.waitForTimeout(300)

  const rows = await page.evaluate(() => {
    // Only panel headers, so page <h1> and dialog titles do not pollute the sample.
    const heads = [...document.querySelectorAll('[data-slot="panel-header"] h2')]
    return heads.slice(0, 8).map(h => {
      const s = getComputedStyle(h)
      return {
        text: (h.textContent || '').trim().slice(0, 18),
        size: s.fontSize,
        weight: s.fontWeight,
        ls: s.letterSpacing,
        color: s.color,
        cls: (typeof h.className === 'string' ? h.className : '').slice(0, 70),
        // Which ancestor class could be retargeting it.
        panelCls: (h.closest('[data-slot="panel"]')?.className || '').split(/\s+/).filter(c => c.startsWith('dashboard-') || c.startsWith('overview-')).join(' ')
      }
    })
  })

  console.log('\n== ' + route + '  (panel-header h2 count: ' + rows.length + ')')
  for (const r of rows) {
    const key = r.size + '/' + r.weight + '/' + r.ls
    seen.set(key, (seen.get(key) || 0) + 1)
    console.log(`   ${r.size.padStart(5)}/${r.weight}  ls=${r.ls.padStart(7)}  "${r.text}"  panel=[${r.panelCls || '-'}]`)
  }
}

await browser.close()
console.log('\n=== distinct panel-title typographies: ' + seen.size + ' ===')
for (const [k, n] of [...seen].sort((a, b) => b[1] - a[1])) console.log('   ' + k + '  x' + n)
if (seen.size > 1) {
  console.log('\nMore than one panel-title treatment means the same structural element')
  console.log('renders at different sizes depending on route. That is an inconsistency.')
  process.exitCode = 1
}
