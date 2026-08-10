// Safe dead-CSS pruner (span-based, preserves comments + formatting).
// Deletes only selectors that BOTH (a) match nothing in the rendered app per
// verify-dead-css.mjs AND (b) have NO class token referenced anywhere in the
// component source (src/**/*.{ts,tsx}). Condition (b) guards against the probe's
// false negatives for interactive-only styles (dialogs/menus not auto-opened).
// Grouped selectors drop only their dead parts; alive parts are kept.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SHEETS = ['src/pages/Dashboard.css', 'src/components/Layout.css', 'src/components/Sidebar.css']
const REPO = process.cwd()

// ---- 1. read the dead list produced by verify-dead-css.mjs ----
const log = readFileSync(join(REPO, 'scripts', '.deadcss.log'), 'utf8')
const dead = new Set()
for (const line of log.split('\n')) {
  const m = line.match(/^\s+\.([\w\-[\]="'().#>+~*: ]+?)\s*$/)
  if (m) dead.add('.' + m[1].trim())
}
console.log(`dead selectors from probe: ${dead.size}`)

// ---- 2. source haystack (ts/tsx ONLY, never css) ----
function walk(dir, acc) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) { if (e !== 'node_modules' && e !== 'dist') walk(p, acc) }
    else if (/\.(tsx?|jsx?)$/.test(e)) acc.push(readFileSync(p, 'utf8'))
  }
}
const srcFiles = []
walk(join(REPO, 'src'), srcFiles)
const srcTokens = new Set()
const tokenRe = /[a-zA-Z][\w-]*/g
for (const f of srcFiles) {
  let m; while ((m = tokenRe.exec(f))) srcTokens.add(m[0])
}
function referencedInSource(sel) {
  for (const t of [...sel.matchAll(/\.([\w-]+)/g)].map((x) => x[1])) {
    if (srcTokens.has(t)) return true
  }
  return false
}
const safeDead = new Set([...dead].filter((s) => !referencedInSource(s)))
console.log(`safe-to-delete (unreferenced in source): ${safeDead.size}`)
const kept = [...dead].filter((s) => !safeDead.has(s))
if (kept.length) console.log(`kept (referenced in source, likely interactive): ${kept.length} e.g. ${kept.slice(0, 6).join(', ')}`)

// ---- 3. brace-aware span scan (handles @media nesting) ----
function scan(css, start, end, rules) {
  let lastEnd = start, i = start
  while (i < end) {
    if (css[i] === '{') {
      const selStart = lastEnd, selEnd = i
      let depth = 1, j = i + 1
      while (j < end && depth > 0) {
        if (css[j] === '{') depth++
        else if (css[j] === '}') depth--
        if (depth > 0) j++
      }
      const closeBrace = j, ruleEnd = j + 1
      const selText = css.slice(selStart, selEnd).trim()
      rules.push({ selStart, selEnd, ruleStart: selStart, ruleEnd, selText, at: selText.startsWith('@') })
      if (!selText.startsWith('@')) scan(css, i + 1, j, rules) // nested rules inside @media
      lastEnd = ruleEnd; i = ruleEnd
    } else if (css[i] === '}') { lastEnd = i + 1; i++ }
    else i++
  }
}

// ---- 4. apply removals, right-to-left so indices stay valid ----
for (const sheet of SHEETS) {
  const file = join(REPO, sheet)
  let css; try { css = readFileSync(file, 'utf8') } catch { continue }
  const rules = []
  scan(css, 0, css.length, rules)
  const edits = [] // {ruleStart,ruleEnd,selStart,selEnd,newSel|null}
  let fullDeletes = 0, partDeletes = 0
  for (const r of rules) {
    if (r.at) continue
    const parts = r.selText.split(',').map((s) => s.trim()).filter(Boolean)
    const deadParts = parts.filter((p) => safeDead.has(p))
    if (!deadParts.length) continue
    if (deadParts.length === parts.length) {
      edits.push({ ruleStart: r.ruleStart, ruleEnd: r.ruleEnd, selStart: r.selStart, selEnd: r.selEnd, newSel: null })
      fullDeletes++
    } else {
      const keptParts = parts.filter((p) => !safeDead.has(p))
      edits.push({ ruleStart: r.ruleStart, ruleEnd: r.ruleEnd, selStart: r.selStart, selEnd: r.selEnd, newSel: keptParts.join(', ') })
      partDeletes += deadParts.length
    }
  }
  if (!edits.length) { console.log(`${sheet}: no safe deletions`); continue }
  edits.sort((a, b) => b.ruleStart - a.ruleStart) // right to left
  for (const e of edits) {
    if (e.newSel === null) css = css.slice(0, e.ruleStart) + css.slice(e.ruleEnd)
    else css = css.slice(0, e.selStart) + e.newSel + css.slice(e.selEnd)
  }
  writeFileSync(file, css)
  console.log(`${sheet}: full-rule deletes=${fullDeletes}, grouped-part deletes=${partDeletes}, total=${fullDeletes + partDeletes}`)
}
