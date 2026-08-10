// verify-button-contrast.mjs only ever looks at <button> labels. Badges, meta text,
// timestamps, table cells and muted subtitles -- the majority of the pixels on these
// pages -- have never been measured. An expert review claimed the homepage status
// badge renders at ~1.4:1; this probe exists so that claim can be settled by
// measurement instead of by eyeballing a hex value in the stylesheet.
//
// Method: for every element that owns a non-empty direct text node, composite its
// own background over its ancestors' backgrounds until an opaque layer is reached,
// composite the text colour (including inherited opacity) over that, and apply the
// WCAG 2.1 1.4.3 thresholds (4.5:1 normal, 3:1 large).
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:5271'
const ROUTES = [
  '/', '/workflows', '/tasks', '/memory', '/radio', '/projects', '/chat',
  '/skills', '/extensions', '/tools', '/health', '/settings', '/backups',
  '/search', '/dispatch', '/analytics',
]
// A route that renders almost nothing must not be able to report "0 FAIL". An HMR
// reload mid-run once emptied five routes down to the bare shell (nav + skip link,
// ~28 text nodes) and every one of them "passed". The reliable signal is the panel
// count -- an unmounted route body has zero panels -- so that is the real guard and
// this floor only catches a shell that somehow still renders a panel.
const MIN_SAMPLES = 20

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

let inflight = 0
page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight += 1 })
page.on('requestfinished', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight -= 1 })
page.on('requestfailed', r => { if (new URL(r.url()).pathname.startsWith('/api/')) inflight -= 1 })

async function settle(p) {
  try {
    await p.waitForSelector('[data-slot="page-shell"]', { state: 'attached', timeout: 8000 })
    // The lazy-route Suspense fallback also renders inside the shell. Measuring it
    // yielded "samples=1 fail=0" for /extensions and /search -- a vacuous pass that
    // hid two entire routes. Wait for the real route to swap in.
    await p.waitForFunction(() => !document.querySelector('.route-fallback'), null, { timeout: 15000 })
  } catch {
    return false
  }
  for (let i = 0; i < 40 && inflight > 0; i += 1) await p.waitForTimeout(150)
  await p.waitForTimeout(350)
  return true
}

const MEASURE = () => {
  const srgb = c => { const s = Math.max(0, Math.min(255, c)) / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
  // Tailwind v4's `/40` opacity modifier compiles to color-mix(in oklab, ...), and
  // Chromium serializes that as `oklab(0.97 0.01 0.06 / 0.4)`. Reading the first
  // three numbers as RGB turned that into near-black and invented 28 contrast
  // failures (a warning-tinted row "measured" as rgb(153,153,153)). Convert properly.
  const lin2srgb = v => {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, s * 255))
  }
  const oklabToRgb = (L, a, b) => {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b
    const l = l_ ** 3; const m = m_ ** 3; const s = s_ ** 3
    return [
      lin2srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      lin2srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      lin2srgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ]
  }
  const num = (tok, scale) => {
    if (tok === undefined || tok === 'none') return 0
    if (String(tok).endsWith('%')) return (parseFloat(tok) / 100) * scale
    return parseFloat(tok)
  }
  const parse = str => {
    const raw = String(str || '').trim()
    if (!raw || raw === 'none') return null
    if (raw === 'transparent') return [0, 0, 0, 0]
    const fn = raw.match(/^([a-z]+)\((.*)\)$/i)
    if (!fn) {
      const hex = raw.match(/^#([0-9a-f]{3,8})$/i)
      if (!hex) return null
      let h = hex[1]
      if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('')
      const v = i => parseInt(h.slice(i * 2, i * 2 + 2), 16)
      return [v(0), v(1), v(2), h.length === 8 ? v(3) / 255 : 1]
    }
    const name = fn[1].toLowerCase()
    const parts = fn[2].split('/')
    const args = parts[0].trim().split(/[\s,]+/).filter(Boolean)
    const slashAlpha = parts[1] !== undefined ? num(parts[1].trim(), 1) : null
    const alpha = slashAlpha !== null ? slashAlpha : (args[3] !== undefined ? num(args[3], 1) : 1)
    if (name === 'rgb' || name === 'rgba') return [num(args[0], 255), num(args[1], 255), num(args[2], 255), alpha]
    if (name === 'oklab') return [...oklabToRgb(num(args[0], 1), num(args[1], 0.4), num(args[2], 0.4)), alpha]
    if (name === 'oklch') {
      const L = num(args[0], 1); const C = num(args[1], 0.4); const H = (parseFloat(args[2]) || 0) * Math.PI / 180
      return [...oklabToRgb(L, C * Math.cos(H), C * Math.sin(H)), alpha]
    }
    if (name === 'color') {
      if (args[0] !== 'srgb') return null
      return [num(args[1], 1) * 255, num(args[2], 1) * 255, num(args[3], 1) * 255, slashAlpha === null ? 1 : slashAlpha]
    }
    return null
  }
  // Chromium is the ground truth for what a colour actually paints as: it keeps
  // out-of-gamut oklab channels unclamped through compositing and only clamps at
  // the end, so reimplementing the maths here disagrees by a few percent on exactly
  // the colours Tailwind v4 emits. Paint each colour over black and over white and
  // solve for (colour, alpha) instead. Channels are deliberately left unclamped.
  const cv = document.createElement('canvas')
  cv.width = 1; cv.height = 1
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const paint = (color, under) => {
    ctx.globalCompositeOperation = 'copy'
    ctx.fillStyle = under; ctx.fillRect(0, 0, 1, 1)
    ctx.globalCompositeOperation = 'source-over'
    // An unparseable value leaves fillStyle untouched, which would silently score
    // the previous colour. Sentinel first so that case is detectable.
    ctx.fillStyle = '#010203'
    ctx.fillStyle = color
    if (ctx.fillStyle === '#010203' && color.replace(/\s/g, '').toLowerCase() !== '#010203') return null
    ctx.fillRect(0, 0, 1, 1)
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
  }
  const memo = new Map()
  const resolve = str => {
    const key = String(str || '')
    if (memo.has(key)) return memo.get(key)
    let value = null
    const onBlack = paint(key, '#000')
    const onWhite = paint(key, '#fff')
    if (onBlack && onWhite) {
      const alphas = [0, 1, 2].map(i => 1 - (onWhite[i] - onBlack[i]) / 255)
      const a = Math.max(0, Math.min(1, Math.max(...alphas)))
      value = a < 0.004 ? [0, 0, 0, 0] : [onBlack[0] / a, onBlack[1] / a, onBlack[2] / a, a]
    } else {
      value = parse(key) // fallback for anything canvas refuses
    }
    memo.set(key, value)
    return value
  }
  // Guard the black/white solve itself against colours whose answer is known.
  const selfTest = () => {
    const bad = []
    const cases = [
      ['rgb(255, 0, 0)', [255, 0, 0, 1]],
      ['rgba(0, 0, 0, 0.4)', [0, 0, 0, 0.4]],
      ['#3a7f6c', [58, 127, 108, 1]],
      ['rgba(255, 255, 255, 0.5)', [255, 255, 255, 0.5]],
      ['transparent', [0, 0, 0, 0]],
    ]
    for (const [input, want] of cases) {
      const got = resolve(input)
      if (!got) { bad.push(`${input}: unresolved`); continue }
      const dRgb = Math.max(...[0, 1, 2].map(i => Math.abs(got[i] - want[i]) * (want[3] > 0 ? 1 : 0)))
      if (dRgb > 2 || Math.abs(got[3] - want[3]) > 0.01) {
        bad.push(`${input}: got ${got.map(v => Math.round(v * 100) / 100)} want ${want}`)
      }
    }
    return bad
  }
  const over = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]))
  const cr = (a, b) => {
    const l1 = lum(a); const l2 = lum(b)
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
    return (hi + 0.05) / (lo + 0.05)
  }
  // Effective backdrop: walk up compositing every translucent layer until opaque.
  const backdrop = el => {
    let acc = null
    let node = el
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node)
      const bg = resolve(cs.backgroundColor)
      if (bg && bg[3] > 0) {
        const layer = [bg[0], bg[1], bg[2], bg[3] * Number(cs.opacity || 1)]
        acc = acc === null ? layer : [...over(acc, layer), Math.min(1, acc[3] + layer[3])]
        if (acc[3] >= 0.999) return acc.slice(0, 3)
      }
      node = node.parentElement
    }
    const page = [255, 255, 255]
    return acc === null ? page : over([...acc.slice(0, 3), acc[3]], page)
  }
  const inheritedOpacity = el => {
    let o = 1
    let node = el
    while (node && node.nodeType === 1) { o *= Number(getComputedStyle(node).opacity || 1); node = node.parentElement }
    return o
  }
  const label = el => {
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).slice(0, 3).join('.')
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '')
  }

  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ')
    if (!own) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    // WCAG 1.4.3 exempts disabled controls and purely decorative text.
    if (el.closest('[disabled],[aria-disabled="true"],[aria-hidden="true"]')) continue
    const op = inheritedOpacity(el)
    if (op < 0.05) continue
    const fg = resolve(cs.color)
    if (!fg) continue
    const bg = backdrop(el.parentElement || el)
    const own_bg = resolve(cs.backgroundColor)
    let base = own_bg && own_bg[3] > 0 ? over([own_bg[0], own_bg[1], own_bg[2], own_bg[3]], bg) : bg
    const size = parseFloat(cs.fontSize)
    const weight = Number(cs.fontWeight) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const text = over([fg[0], fg[1], fg[2], fg[3] * op], base)

    // A gradient lives in background-image, so background-color reads as transparent
    // and the text looks like it sits on whatever is behind the element. That scored
    // the /tools icon initials at 1.22:1 against a surface they never touch. Score
    // every gradient stop instead and keep the worst one.
    const img = cs.backgroundImage
    let indeterminate = null
    let ratio = cr(text, base)
    if (img && img !== 'none') {
      if (/url\(/.test(img)) {
        indeterminate = 'background-image: url()'
      } else {
        const stops = (img.match(/(?:rgba?|oklab|oklch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/gi) || []).map(resolve).filter(Boolean)
        if (stops.length) {
          let worst = null
          for (const s of stops) {
            const stopBase = over([s[0], s[1], s[2], s[3]], bg)
            const r = cr(over([fg[0], fg[1], fg[2], fg[3] * op], stopBase), stopBase)
            if (worst === null || r < worst.r) worst = { r, stopBase }
          }
          ratio = worst.r
          base = worst.stopBase
        }
      }
    }

    out.push({
      sel: label(el),
      text: own.slice(0, 28),
      ratio: Math.round(ratio * 100) / 100,
      need: large ? 3 : 4.5,
      size, weight,
      color: cs.color,
      bg: `rgb(${base.map(v => Math.round(v)).join(' ')})`,
      indeterminate,
    })
  }
  return {
    rows: out,
    parserIssues: selfTest(),
    panels: document.querySelectorAll('[data-slot="panel"]').length,
  }
}

let measured = 0
let failCount = 0
const thin = []
const unreachable = []
const undecided = []
const parserIssues = []
const worst = []

for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch(() => null)
  const ok = await settle(page)
  if (!ok) { unreachable.push(route); console.log(`${route.padEnd(12)} UNREACHABLE -- not measured`); continue }

  const result = await page.evaluate(MEASURE)
  if (result.parserIssues.length) parserIssues.push(...result.parserIssues)
  const all = result.rows
  // Text over a raster background cannot be scored from computed styles. Report it
  // rather than silently counting it as a pass.
  const rows = all.filter(r => !r.indeterminate)
  const unscorable = all.filter(r => r.indeterminate)
  if (unscorable.length) undecided.push(`${route}: ${unscorable.length} (${unscorable[0].sel})`)
  measured += rows.length
  // /chat is a transcript, not a panel layout -- it is the one route with no Panel.
  const needsPanel = route !== '/chat'
  if (rows.length < MIN_SAMPLES || (needsPanel && result.panels === 0)) {
    thin.push(`${route} (${rows.length} nodes, ${result.panels} panels)`)
  }

  const fails = rows.filter(r => r.ratio < r.need)
  failCount += fails.length
  const min = rows.reduce((a, r) => (a === null || r.ratio < a.ratio ? r : a), null)
  console.log(`${route.padEnd(12)} samples=${String(rows.length).padStart(4)} panels=${String(result.panels).padStart(2)} fail=${String(fails.length).padStart(3)} min=${min ? min.ratio : '-'} (${min ? min.sel : '-'})`)
  for (const f of fails.slice(0, 6)) {
    console.log(`    ${String(f.ratio).padStart(5)}:1 need ${f.need}  ${f.sel}  ${f.size}px/${f.weight}  ${f.color} on ${f.bg}  "${f.text}"`)
  }
  if (fails.length > 6) console.log(`    ... ${fails.length - 6} more`)
  if (min) worst.push({ route, ...min })
}

await browser.close()

worst.sort((a, b) => a.ratio - b.ratio)
console.log('\n=== lowest-contrast text per route (5 worst) ===')
for (const w of worst.slice(0, 5)) console.log(`  ${String(w.ratio).padStart(5)}:1  ${w.route.padEnd(12)} ${w.sel}  ${w.size}px/${w.weight}  "${w.text}"`)

if (undecided.length) console.log(`\nunscorable (raster background, needs a human eye): ${undecided.join(' | ')}`)
const uniqueParserIssues = [...new Set(parserIssues)]
if (uniqueParserIssues.length) {
  console.log('\n!!! COLOUR PARSER DISAGREES WITH THE BROWSER -- every number above is suspect:')
  for (const i of uniqueParserIssues) console.log('  ' + i)
} else {
  console.log('\ncolour parser self-test vs canvas ground truth: ok')
}
console.log(`\n=== text nodes measured: ${measured} | contrast failures: ${failCount} | routes unreachable: ${unreachable.length} | routes with too few samples: ${thin.length} ${thin.join(',')} ===`)
if (failCount || unreachable.length || thin.length || uniqueParserIssues.length) process.exitCode = 1
