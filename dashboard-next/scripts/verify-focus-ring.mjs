/**
 * Keyboard focus-visible audit.
 *
 * A green build cannot detect a missing focus ring: the CSS parses fine, the
 * component renders fine, and only a keyboard user ever notices. So we tab
 * through each route for real and compare each element's computed
 * outline/box-shadow WHILE focused against the same element's resting style.
 *
 * An element passes if focusing it changes outline-width or box-shadow. It
 * fails if it looks byte-identical focused and unfocused — that is an
 * invisible focus ring.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const MAX_TABS = Number(process.env.MAX_TABS || 45)

const routes = [
  '/', '/workflows', '/tasks', '/memory', '/radio', '/projects', '/chat',
  '/skills', '/extensions', '/tools', '/health', '/settings', '/backups',
  '/search', '/dispatch', '/analytics',
]

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

let totalChecked = 0
const failures = []
const skipped = []

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  // 500ms was not enough: /search, /dispatch and /analytics still render a
  // loading skeleton with zero focusables at that point and were silently
  // skipped, which made the audit look complete when it had covered nothing.
  await page.waitForTimeout(1500)

  // Tag every focusable element and snapshot its resting style.
  const baseline = await page.evaluate(sel => {
    const els = Array.from(document.querySelectorAll(sel)).filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const out = {}
    els.forEach((el, i) => {
      el.setAttribute('data-focusprobe', String(i))
      const cs = getComputedStyle(el)
      out[i] = { outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, boxShadow: cs.boxShadow }
    })
    return out
  }, FOCUSABLE)

  const baselineCount = Object.keys(baseline).length
  if (baselineCount === 0) {
    // Never skip silently — a route with no focusable element is either a
    // render failure or a keyboard dead end, and both are defects.
    skipped.push(route)
    console.log(`${route.padEnd(12)} focusable=  0  <-- NOTHING TO FOCUS, investigate`)
    continue
  }

  await page.evaluate(() => document.body.focus())
  const seen = new Set()

  for (let i = 0; i < Math.min(MAX_TABS, baselineCount + 5); i++) {
    await page.keyboard.press('Tab')
    const hit = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const cs = getComputedStyle(el)
      return {
        idx: el.getAttribute('data-focusprobe'),
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
        matchesFocusVisible: el.matches(':focus-visible'),
        outlineWidth: cs.outlineWidth,
        outlineStyle: cs.outlineStyle,
        boxShadow: cs.boxShadow,
      }
    })
    if (!hit || hit.idx === null) continue
    if (seen.has(hit.idx)) continue
    seen.add(hit.idx)

    const base = baseline[hit.idx]
    if (!base) continue
    totalChecked++

    const outlineChanged =
      hit.outlineWidth !== base.outlineWidth || hit.outlineStyle !== base.outlineStyle
    const shadowChanged = hit.boxShadow !== base.boxShadow
    const hasSolidOutline = hit.outlineStyle !== 'none' && parseFloat(hit.outlineWidth) > 0

    if (!outlineChanged && !shadowChanged && !hasSolidOutline) {
      failures.push({
        route,
        tag: hit.tag,
        label: hit.label,
        focusVisible: hit.matchesFocusVisible,
        outline: `${hit.outlineStyle} ${hit.outlineWidth}`,
        boxShadow: hit.boxShadow === 'none' ? 'none' : 'present-but-unchanged',
      })
    }
  }

  console.log(`${route.padEnd(12)} focusable=${String(baselineCount).padStart(3)} tabbed=${seen.size}`)
}

console.log('\n=== elements with NO visible focus indicator ===')
if (failures.length === 0) {
  console.log('  none')
} else {
  for (const f of failures) {
    console.log(
      `  FAIL ${f.route} <${f.tag}> "${f.label}" focus-visible=${f.focusVisible} outline=${f.outline} shadow=${f.boxShadow}`
    )
  }
}
console.log(
  `\n=== checked ${totalChecked} focus stops | invisible rings: ${failures.length} | routes with nothing focusable: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''} ===`
)

await browser.close()
process.exit(failures.length || skipped.length ? 1 : 0)
