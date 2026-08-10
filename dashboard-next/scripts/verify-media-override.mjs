// Static check: a plain (non-@media) rule that appears AFTER a @media block and
// redeclares the same property for the same selector silently defeats the
// responsive rule at equal specificity. This is invisible to layout probes when
// the overflow is clipped by an ancestor, so catch it in the source instead.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const explicitFiles = process.argv.slice(2).length > 0
const FILES = explicitFiles
  ? process.argv.slice(2)
  : ['src/pages/Dashboard.css', 'src/pages/Skills.css', 'src/components/Layout.css', 'src/components/Sidebar.css', 'src/App.css', 'src/index.css']

/** Split a css string into top-level `{selector, body, atRule, index}` records. */
function parseRules(css, atRule = null, base = 0, out = []) {
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    const selector = css.slice(i, open).trim()
    const body = css.slice(open + 1, j - 1)
    if (selector.startsWith('@')) {
      if (/^@(media|supports|container)/.test(selector)) parseRules(body, selector, base + open + 1, out)
    } else if (selector) {
      out.push({ selector, body, atRule, index: base + i })
    }
    i = j
  }
  return out
}

function normalizeSelector(sel) {
  return sel
    .split(',')
    .map(s => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .sort()
    .join(',')
}

function props(body) {
  const set = new Set()
  for (const decl of body.split(';')) {
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    const name = decl.slice(0, colon).trim().toLowerCase()
    if (name && !name.startsWith('--') && !name.includes('{')) set.add(name)
  }
  return set
}

let violations = 0
let scanned = 0
for (const rel of FILES) {
  let css
  try {
    css = readFileSync(join(REPO, rel), 'utf8')
  } catch (error) {
    if (explicitFiles) {
      console.log(`${rel}: UNREADABLE (${error.code}) — refusing to report a pass for a file that was not scanned`)
      violations++
      continue
    }
    continue
  }
  scanned++
  // Blank out comments without shifting offsets OR line numbers: keep newlines.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  const rules = parseRules(stripped)
  const inMedia = rules.filter(r => r.atRule)
  const plain = rules.filter(r => !r.atRule)

  for (const mediaRule of inMedia) {
    const mSel = normalizeSelector(mediaRule.selector)
    const mProps = props(mediaRule.body)
    if (!mProps.size) continue
    for (const plainRule of plain) {
      if (plainRule.index <= mediaRule.index) continue
      if (normalizeSelector(plainRule.selector) !== mSel) continue
      const clash = [...props(plainRule.body)].filter(p => mProps.has(p))
      if (!clash.length) continue
      violations++
      const line = stripped.slice(0, plainRule.index).split('\n').length
      const mediaLine = stripped.slice(0, mediaRule.index).split('\n').length
      console.log(
        `${rel}:${line} plain rule defeats ${mediaRule.atRule} (line ${mediaLine})\n` +
          `    selector: ${plainRule.selector}\n` +
          `    props:    ${clash.join(', ')}`
      )
    }
  }
}

console.log(`\n=== files scanned: ${scanned} | plain rules defeating @media at equal specificity: ${violations} ===`)
if (!scanned) {
  console.log('=== scanned nothing — treating as FAIL ===')
  process.exit(1)
}
process.exit(violations ? 1 : 0)
