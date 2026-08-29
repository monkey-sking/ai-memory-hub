import fs from "node:fs"
import os from "node:os"
import path from "node:path"
// Requires the hub to run with `node --experimental-sqlite` (the dashboard
// start script already does). On SQLite-backed runners we read their native
// session databases directly. If the flag is absent this import throws at
// module load time, so keep the hub launched with --experimental-sqlite.
import sqlite3 from "node:sqlite"

/**
 * Cost & Sessions collector.
 *
 * Scans each runner's native session store and extracts real token usage
 * (no fabricated numbers). Borrowed parsing patterns from the open-source
 * agentsview project (MIT) for opencode / mimocode / gemini / antigravity.
 *
 * Output contract (consumed by GET /api/cost-sessions):
 *   {
 *     generatedAt, pricingNote,
 *     totals: { sessionCount, inputTokens, outputTokens, cacheReadTokens,
 *               cacheWriteTokens, totalTokens, estCostUsd, runnersWithData },
 *     byAgent: AgentCost[],   // each: agent, available, sessionCount, tokens, estCostUsd, lastActive, model, reason?
 *     trend: [{ date, totalTokens, estCostUsd }]  // last 30 days, ascending
 *   }
 */

// Reference prices in USD per 1M tokens. These are mixed-class estimates and
// are explicitly labelled as estimates in the UI. Override here when the real
// rate card is known. Sources: codex~OpenAI, claude~Anthropic, opencode/mimocode
// ~ deepseek-class, gemini/antigravity ~ Gemini 2.5 Pro class.
const PRICING = {
  codex: { input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 2.5 },
  claude: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  opencode: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0.27 },
  mimocode: { input: 0.3, output: 1.2, cacheRead: 0.1, cacheWrite: 0.3 },
  gemini: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 1.25 },
  antigravity: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 1.25 }
}
const DEFAULT_PRICING = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }

const RUNNERS = [
  { name: "codex", parse: (h) => parseCodex(h) },
  { name: "claude", parse: (h) => parseClaude(h) },
  { name: "opencode", parse: (h) => parseOpenCodeSqlite(h, "opencode") },
  { name: "mimocode", parse: (h) => parseOpenCodeSqlite(h, "mimocode") },
  { name: "gemini", parse: (h) => parseGemini(h) },
  { name: "antigravity", parse: (h) => parseAntigravitySqlite(h) }
]

export function createDashboardCostSessionsApi({ homeDir } = {}) {
  const home = homeDir || os.homedir()

  function getCostSessions() {
    const byAgent = []
    const allSessions = []

    for (const runner of RUNNERS) {
      const result = runner.parse(home)
      if (!result.available) {
        byAgent.push({
          agent: runner.name,
          available: false,
          sessionCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
          estCostUsd: 0,
          lastActive: "",
          model: "",
          reason: result.reason || "未检测到原生会话或暂未接入 token 解析"
        })
        continue
      }
      const price = PRICING[runner.name] || DEFAULT_PRICING
      for (const s of result.sessions) {
        s.estCostUsd =
          (s.inputTokens / 1e6) * price.input +
          (s.outputTokens / 1e6) * price.output +
          (s.cacheReadTokens / 1e6) * price.cacheRead +
          (s.cacheWriteTokens / 1e6) * price.cacheWrite
      }
      const agg = aggregateSessions(result.sessions, price)
      // Prefer a real billed cost when the runner reports one (e.g. claude's
      // ~/.claude.json lastCost). Otherwise fall back to the reference-price
      // estimate. Either way, the token counts above are the real accumulated
      // values; only the cost figure may be real vs estimated.
      const estCostUsd = result.realCostUsd && result.realCostUsd > 0 ? result.realCostUsd : agg.estCostUsd
      byAgent.push({
        agent: runner.name,
        available: true,
        sessionCount: result.sessionCount,
        inputTokens: agg.inputTokens,
        outputTokens: agg.outputTokens,
        cacheReadTokens: agg.cacheReadTokens,
        cacheWriteTokens: agg.cacheWriteTokens,
        totalTokens: agg.totalTokens,
        estCostUsd,
        lastActive: result.lastActive,
        model: result.model,
        mirrorOf: result.mirrorOf || null,
        note: result.note || null
      })
      // Mirrored runners (e.g. gemini sharing antigravity's DB) are shown for
      // visibility but excluded from totals to avoid double-counting.
      if (!result.mirrorOf) allSessions.push(...result.sessions)
    }

    const totals = aggregateSessions(allSessions, DEFAULT_PRICING)
    // Mirrored runners (e.g. gemini sharing antigravity's DB) are shown in their
    // own row but must not inflate the grand total — exclude them here.
    totals.estCostUsd = byAgent.reduce((sum, a) => sum + (a.mirrorOf ? 0 : (a.estCostUsd || 0)), 0)
    const runnersWithData = byAgent.filter((a) => a.available && a.sessionCount > 0).length

    return {
      generatedAt: new Date().toISOString(),
      pricingNote:
        "估算成本基于参考单价（USD / 1M tokens）：codex 按 OpenAI 级、claude 按 Anthropic 级、opencode/mimocode 按 deepseek 级、gemini/antigravity 按 Gemini 2.5 Pro 级混估，仅供参考，非账单。可在 src/dashboard/cost-sessions.js 的 PRICING 覆盖真实价卡。",
      totals: {
        sessionCount: totals.sessionCount,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
        totalTokens: totals.totalTokens,
        estCostUsd: totals.estCostUsd,
        runnersWithData
      },
      byAgent,
      trend: buildTrend(allSessions, 30)
    }
  }

  return { getCostSessions }
}

/* ----------------------------------------------------------------- helpers */

function walkJsonl(dir, limit = 400, depth = 0, found = []) {
  if (depth > 5 || found.length >= limit) return found
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (found.length >= limit) break
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkJsonl(full, limit, depth + 1, found)
    else if (entry.name.endsWith(".jsonl") && !entry.name.startsWith(".")) found.push(full)
  }
  return found
}

function walkFiles(dir, exts, limit = 400, depth = 0, skip = [], found = []) {
  if (depth > 6 || found.length >= limit) return found
  if (skip.includes(path.basename(dir))) return found
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (found.length >= limit) break
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, exts, limit, depth + 1, skip, found)
    else if (exts.some((e) => entry.name.endsWith(e)) && !entry.name.startsWith(".")) found.push(full)
  }
  return found
}

function readTail(filePath, maxBytes = 65536) {
  const stat = fs.statSync(filePath)
  const size = stat.size
  const start = Math.max(0, size - maxBytes)
  const len = Math.min(maxBytes, size)
  const buf = Buffer.alloc(len)
  const fd = fs.openSync(filePath, "r")
  try {
    fs.readSync(fd, buf, 0, len, start)
  } finally {
    fs.closeSync(fd)
  }
  return { text: buf.toString("utf8"), mtime: stat.mtime }
}

function readWhole(filePath) {
  const stat = fs.statSync(filePath)
  return { text: fs.readFileSync(filePath, "utf8"), mtime: stat.mtime }
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function toIso(value) {
  if (value == null) return null
  if (typeof value === "number") {
    let t = value
    if (value > 1e12) t = value
    else if (value > 0) t = value * 1000
    const d = new Date(t)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function aggregateSessions(sessions, price) {
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let estCostUsd = 0
  for (const s of sessions) {
    inputTokens += s.inputTokens
    outputTokens += s.outputTokens
    cacheReadTokens += s.cacheReadTokens
    cacheWriteTokens += s.cacheWriteTokens
    estCostUsd +=
      (s.inputTokens / 1e6) * price.input +
      (s.outputTokens / 1e6) * price.output +
      (s.cacheReadTokens / 1e6) * price.cacheRead +
      (s.cacheWriteTokens / 1e6) * price.cacheWrite
  }
  return {
    sessionCount: sessions.length,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    estCostUsd
  }
}

function buildTrend(sessions, days) {
  const buckets = new Map()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    buckets.set(d.toISOString().slice(0, 10), { totalTokens: 0, estCostUsd: 0 })
  }
  for (const s of sessions) {
    if (!s.date) continue
    const bucket = buckets.get(s.date)
    if (bucket) {
      bucket.totalTokens += s.totalTokens
      bucket.estCostUsd += s.estCostUsd
    }
  }
  return [...buckets.entries()].map(([date, v]) => ({ date, totalTokens: v.totalTokens, estCostUsd: v.estCostUsd }))
}

function safeExists(p) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function textOf(value) {
  return value === undefined || value === null ? "" : String(value)
}

/* ------------------------------------------------------------ codex parser */

function parseCodex(home) {
  const dir = path.join(home, ".codex", "sessions")
  if (!safeExists(dir)) return { available: false, reason: "未检测到 codex 会话目录" }
  const files = walkJsonl(dir, 400)
  if (!files.length) return { available: false, reason: "codex 会话目录为空" }

  const sessions = []
  let model = ""
  for (const file of files) {
    let tail
    try {
      tail = readTail(file)
    } catch {
      continue
    }
    // total_token_usage is a cumulative summary written near end of file.
    const lines = tail.text.split("\n").filter(Boolean).slice(-6)
    for (const line of lines) {
      const usage = extractCodexUsage(line)
      if (!usage) continue
      sessions.push({
        id: file,
        date: tail.mtime.toISOString().slice(0, 10),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        totalTokens: usage.totalTokens,
        estCostUsd: 0,
        lastActive: tail.mtime.toISOString()
      })
      if (!model && usage.model) model = usage.model
      break
    }
  }
  if (!sessions.length) return { available: false, reason: "codex 会话中未找到 token 用量记录" }
  return {
    available: true,
    sessionCount: sessions.length,
    model,
    lastActive: sessions.reduce((max, s) => (s.lastActive > max ? s.lastActive : max), ""),
    sessions
  }
}

function extractCodexUsage(line) {
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }
  const t = obj?.payload?.info?.total_token_usage
  if (!t || typeof t !== "object") return null
  const inputTokens = num(t.input_tokens)
  const outputTokens = num(t.output_tokens) + num(t.reasoning_output_tokens)
  const cacheReadTokens = num(t.cached_input_tokens)
  const cacheWriteTokens = num(t.cache_write_input_tokens)
  if (inputTokens + outputTokens === 0) return null
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    model: textOf(obj?.payload?.model) || textOf(obj?.model)
  }
}

/* ----------------------------------------------------------- claude parser */

// Claude Code persists per-project session SUMMARIES (not full history) in
// $HOME/.claude.json: projects[projectPath].lastTotalInputTokens /
// lastTotalOutputTokens / lastTotalCacheReadInputTokens /
// lastTotalCacheCreationInputTokens / lastCost. These are the most recent
// session's real token counts per project (the per-message transcripts under
// ~/.claude/projects/*.jsonl report all-zero usage on this machine). So claude
// token totals here are "most-recent-session-per-project" granularity.
function parseClaude(home) {
  const f = path.join(home, ".claude.json")
  if (!safeExists(f)) return { available: false, reason: "未检测到 ~/.claude.json" }
  let root
  try {
    root = JSON.parse(fs.readFileSync(f, "utf8"))
  } catch {
    return { available: false, reason: "~/.claude.json 解析失败" }
  }
  const projects = root.projects || {}
  const sessions = []
  let lastActiveIso = ""
  let model = ""
  let realCostUsd = 0
  for (const [proj, pdata] of Object.entries(projects)) {
    if (!pdata || typeof pdata !== "object") continue
    const inT = num(pdata.lastTotalInputTokens)
    const outT = num(pdata.lastTotalOutputTokens)
    const cr = num(pdata.lastTotalCacheReadInputTokens)
    const cw = num(pdata.lastTotalCacheCreationInputTokens)
    if (inT + outT === 0) continue
    realCostUsd += num(pdata.lastCost)
    const iso = (toIso(pdata.lastSessionModified) || toIso(pdata.lastStartTime) || new Date()).toISOString()
    if (iso > lastActiveIso) lastActiveIso = iso
    sessions.push({
      id: proj,
      date: iso.slice(0, 10),
      inputTokens: inT,
      outputTokens: outT,
      cacheReadTokens: cr,
      cacheWriteTokens: cw,
      totalTokens: inT + outT + cr + cw,
      estCostUsd: 0,
      lastActive: iso
    })
    if (!model && pdata.lastModelUsage && typeof pdata.lastModelUsage === "object") {
      model = Object.keys(pdata.lastModelUsage)[0]
    }
  }
  if (!sessions.length) return { available: false, reason: "~/.claude.json 中无 token 用量记录" }
  return {
    available: true,
    sessionCount: sessions.length,
    model,
    lastActive: lastActiveIso,
    realCostUsd,
    sessions,
    note: "口径=各项目最近一次会话（~/.claude.json 仅持久化最近会话汇总，非全量历史）"
  }
}

/* ----------------------------------------------- opencode / mimocode (SQLite) */

// Both opencode and mimocode store sessions in a SQLite database using the
// same schema. Tokens live in message.data.tokens.{input,output,cache.read,
// cache.write} (per agentsview: "MiMoCode uses OpenCode's storage format").
function parseOpenCodeSqlite(home, agent) {
  const dbPath = findOpenCodeDb(home, agent)
  if (!dbPath) {
    return {
      available: false,
      reason:
        agent === "opencode"
          ? "未检测到 opencode 会话数据库（~/.local/share/opencode/opencode.db）"
          : "未检测到 mimocode 会话数据库（本机未运行过 mimocode 或路径不同）"
    }
  }
  let db
  try {
    db = new sqlite3.DatabaseSync("file:" + dbPath + "?mode=ro", { readonly: true })
  } catch (e) {
    return { available: false, reason: "无法只读打开 " + agent + " 会话数据库：" + e.message }
  }
  try {
    const sessRows = db.prepare("SELECT id, time_created, time_updated FROM session").all()
    if (!sessRows.length) return { available: false, reason: agent + " 会话表为空" }

    // One pass over all messages, grouped by session id (data holds tokens).
    const msgRows = db.prepare("SELECT session_id, data FROM message").all()
    const bySess = new Map()
    let model = ""
    for (const m of msgRows) {
      let d
      try {
        d = JSON.parse(m.data)
      } catch {
        continue
      }
      const t = d.tokens
      if (!t) continue
      const acc = bySess.get(m.session_id) || { in: 0, out: 0, cr: 0, cw: 0 }
      acc.in += num(t.input)
      acc.out += num(t.output)
      acc.cr += num(t.cache?.read)
      acc.cw += num(t.cache?.write)
      bySess.set(m.session_id, acc)
      if (!model && (d.modelID || (d.model && d.model.modelID))) model = textOf(d.modelID || d.model.modelID)
    }
    if (!bySess.size) return { available: false, reason: agent + " 会话中未找到 token 用量记录" }

    const sessions = []
    let lastActiveIso = ""
    for (const sr of sessRows) {
      const acc = bySess.get(sr.id)
      if (!acc) continue
      if (acc.in + acc.out === 0) continue
      const updated = toIso(sr.time_updated) || toIso(sr.time_created) || new Date()
      const iso = updated.toISOString()
      if (iso > lastActiveIso) lastActiveIso = iso
      sessions.push({
        id: sr.id,
        date: iso.slice(0, 10),
        inputTokens: acc.in,
        outputTokens: acc.out,
        cacheReadTokens: acc.cr,
        cacheWriteTokens: acc.cw,
        totalTokens: acc.in + acc.out + acc.cr + acc.cw,
        estCostUsd: 0,
        lastActive: iso
      })
    }
    if (!sessions.length) return { available: false, reason: agent + " 会话中未找到 token 用量记录" }
    return {
      available: true,
      sessionCount: sessions.length,
      model,
      lastActive: lastActiveIso,
      sessions
    }
  } catch (e) {
    return { available: false, reason: agent + " 会话数据库解析失败：" + e.message }
  } finally {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
}

function findOpenCodeDb(home, agent) {
  if (agent === "opencode") {
    const p = path.join(home, ".local", "share", "opencode", "opencode.db")
    return safeExists(p) ? p : null
  }
  // mimocode: search ~/.mimocode recursively for the same opencode-format db.
  const root = path.join(home, ".mimocode")
  if (!safeExists(root)) return null
  let found = null
  const walk = (dir, depth) => {
    if (found || depth > 5) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (found) return
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, depth + 1)
      else if (e.name === "opencode.db" || (e.name.endsWith(".db") && !e.name.startsWith("."))) found = full
    }
  }
  walk(root, 0)
  return found
}

/* ------------------------------------------------------------- gemini parser */

// Gemini CLI stores each session as <project>/chats/session-*.jsonl under
// ~/.gemini/tmp, with a `tokens` object per turn:
//   {"input":N,"output":N,"cached":N,"thoughts":N,"tool":N,"total":N}
// Note: `total` is not input+output (it excludes cached), so we sum the
// individual fields instead of trusting it.
//
// IMPORTANT: do NOT locate these with a plain recursive walk of ~/.gemini —
// that directory's top level accumulates 100+ `backup_*_settings.json` files
// which exhaust any file limit before the real transcripts are reached (this
// is exactly the bug that made gemini look like it had no data).
function parseGemini(home) {
  const root = path.join(home, ".gemini")
  if (!safeExists(root)) return { available: false, reason: "未检测到 ~/.gemini 目录" }
  const files = findGeminiSessionFiles(root)
  if (!files.length) return { available: false, reason: "~/.gemini/tmp 下未找到 gemini 会话转录" }

  const sessions = []
  let model = ""
  let lastActiveIso = ""
  for (const file of files) {
    let raw
    try {
      raw = fs.readFileSync(file, "utf8")
    } catch {
      continue
    }
    const parsed = parseGeminiFile(raw, file)
    if (!parsed) continue
    if (!model && parsed.model) model = parsed.model
    const mtime = fs.statSync(file).mtime
    const iso = mtime.toISOString()
    if (iso > lastActiveIso) lastActiveIso = iso
    sessions.push({
      id: file,
      date: iso.slice(0, 10),
      inputTokens: parsed.input,
      outputTokens: parsed.output,
      cacheReadTokens: parsed.cached,
      cacheWriteTokens: 0,
      totalTokens: parsed.input + parsed.output + parsed.cached,
      estCostUsd: 0,
      lastActive: iso
    })
  }
  if (!sessions.length) return { available: false, reason: "gemini 会话转录中未找到 token 用量记录" }
  return {
    available: true,
    sessionCount: sessions.length,
    model,
    lastActive: lastActiveIso,
    sessions
  }
}

// Locate gemini CLI session transcripts. Primary layout is
// ~/.gemini/tmp/<project>/chats/session-*.jsonl. If a future/other release
// stores them elsewhere under ~/.gemini we fall back to a recursive jsonl walk
// that explicitly skips the antigravity product dirs (SQLite, parsed by
// parseAntigravitySqlite) and the antigravity browser profile.
function findGeminiSessionFiles(root) {
  const files = []
  const tmpRoot = path.join(root, "tmp")
  if (safeExists(tmpRoot)) {
    let projects
    try {
      projects = fs.readdirSync(tmpRoot, { withFileTypes: true })
    } catch {
      projects = []
    }
    for (const p of projects) {
      if (!p.isDirectory()) continue
      const chatDir = path.join(tmpRoot, p.name, "chats")
      if (!safeExists(chatDir)) continue
      let entries
      try {
        entries = fs.readdirSync(chatDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith(".jsonl")) files.push(path.join(chatDir, e.name))
      }
    }
  }
  if (!files.length) {
    const skip = [
      "antigravity",
      "antigravity-cli",
      "antigravity-ide",
      "antigravity-browser-profile",
      "extensions",
      "bin",
      "builtin",
      "plugins",
      "browser_recordings",
      "models"
    ]
    files.push(...walkFiles(root, [".jsonl"], 300, 0, skip))
  }
  return files
}

function parseGeminiFile(raw, file) {
  let root
  try {
    root = JSON.parse(raw)
  } catch {
    root = null
  }
  if (root && root.sessionId && Array.isArray(root.messages)) {
    const t = accumulateGeminiTokens(root.messages)
    if (t.input + t.output === 0) return null
    return { ...t, model: textOf(root.model) }
  }
  // JSONL fallback
  let input = 0
  let output = 0
  let cached = 0
  let model = ""
  let ok = false
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (o.type !== "user" && o.type !== "gemini") continue
    const tk = o.tokens
    if (!tk) continue
    input += num(tk.input)
    output += num(tk.output) + num(tk.thoughts)
    cached += num(tk.cached)
    ok = true
    if (!model && o.model) model = textOf(o.model)
  }
  if (!ok) return null
  return { input, output, cached, model }
}

function accumulateGeminiTokens(messages) {
  let input = 0
  let output = 0
  let cached = 0
  for (const m of messages) {
    const tk = m.tokens
    if (!tk) continue
    input += num(tk.input)
    output += num(tk.output) + num(tk.thoughts)
    cached += num(tk.cached)
  }
  return { input, output, cached }
}

/* --------------------------------------------------------- antigravity (SQLite) */

// Antigravity IDE stores one SQLite database per session under
// ~/.gemini/antigravity/conversations/<uuid>.db. Token usage lives in the
// protobuf-encoded `gen_metadata` table as ModelUsageStats (input=2, output=3,
// cache_read=5). The wire format is decoded heuristically below.
// Shared reader: the antigravity IDE and the gemini CLI store their sessions in
// the SAME on-disk location (~/.gemini/antigravity/conversations/*.db). We read
// it once here and let both parseAntigravitySqlite and the gemini fallback reuse
// it, so the SQLite/protobuf logic lives in a single place.
function readAntigravityConversations(home) {
  // Three separate antigravity products keep their own conversations dir:
  //   antigravity/ (IDE), antigravity-cli/ (CLI), antigravity-ide/ (newer IDE)
  // All share the same SQLite + protobuf layout, so all three are read.
  const convDirs = [
    path.join(home, ".gemini", "antigravity", "conversations"),
    path.join(home, ".gemini", "antigravity-cli", "conversations"),
    path.join(home, ".gemini", "antigravity-ide", "conversations"),
    path.join(home, ".antigravity", "conversations")
  ]
  const dbs = []
  for (const dir of convDirs) {
    if (!safeExists(dir)) continue
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".db")) dbs.push(path.join(dir, e.name))
    }
  }
  if (!dbs.length) return { sessions: [], lastActiveIso: "" }
  if (dbs.length > 600) dbs.length = 600 // bound work on very large installs

  const sessions = []
  let lastActiveIso = ""
  for (const dbPath of dbs) {
    let db
    try {
      db = new sqlite3.DatabaseSync("file:" + dbPath + "?mode=ro&immutable=0", { readonly: true })
    } catch {
      continue
    }
    try {
      let rows
      try {
        rows = db.prepare("SELECT data FROM gen_metadata").all()
      } catch {
        continue
      }
      let inT = 0
      let outT = 0
      let crT = 0
      for (const r of rows) {
        if (!(r.data instanceof Uint8Array) && !Buffer.isBuffer(r.data)) continue
        const blob = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data)
        const block = extractAgTokenUsage(protoParse(blob))
        if (!block) continue
        inT += block.uncachedInput
        outT += block.totalOutput
        crT += block.cacheRead
      }
      if (inT + outT === 0) continue
      const mtime = fs.statSync(dbPath).mtime
      const iso = mtime.toISOString()
      if (iso > lastActiveIso) lastActiveIso = iso
      sessions.push({
        id: dbPath,
        date: iso.slice(0, 10),
        inputTokens: inT,
        outputTokens: outT,
        cacheReadTokens: crT,
        cacheWriteTokens: 0,
        totalTokens: inT + outT + crT,
        estCostUsd: 0,
        lastActive: iso
      })
    } finally {
      try {
        db.close()
      } catch {
        /* ignore */
      }
    }
  }
  return { sessions, lastActiveIso }
}

function parseAntigravitySqlite(home) {
  const { sessions, lastActiveIso } = readAntigravityConversations(home)
  if (!sessions.length) return { available: false, reason: "未检测到 antigravity 会话数据库" }
  return {
    available: true,
    sessionCount: sessions.length,
    model: "",
    lastActive: lastActiveIso,
    sessions
  }
}

/* --- minimal protobuf wire decoder (for antigravity gen_metadata) --- */

function readVarint(buf, offset) {
  let result = 0n
  let shift = 0n
  let i = offset
  while (i < buf.length) {
    const byte = buf[i]
    result |= BigInt(byte & 0x7f) << shift
    shift += 7n
    i++
    if ((byte & 0x80) === 0) break
    if (i - offset > 10) break
  }
  return { value: Number(result), next: i }
}

function protoParse(buf) {
  const fields = []
  let i = 0
  while (i < buf.length) {
    const tag = readVarint(buf, i)
    if (tag.next === i) break
    i = tag.next
    const fieldNo = tag.value >> 3
    const wireType = tag.value & 7
    if (wireType === 0) {
      const v = readVarint(buf, i)
      i = v.next
      fields.push({ number: fieldNo, wire: 0, varint: v.value })
    } else if (wireType === 1) {
      i += 8
      fields.push({ number: fieldNo, wire: 1 })
    } else if (wireType === 2) {
      const len = readVarint(buf, i)
      i = len.next
      const data = buf.subarray(i, i + len.value)
      i += len.value
      fields.push({ number: fieldNo, wire: 2, bytes: data })
    } else if (wireType === 5) {
      i += 4
      fields.push({ number: fieldNo, wire: 5 })
    } else {
      break
    }
  }
  return fields
}

// Recursively search for a ModelUsageStats-shaped message:
//   model (field 1, varint enum in [1000,5000)), input_tokens (2),
//   output_tokens (3), cache_read_tokens (5, optional).
function extractAgTokenUsage(fields) {
  for (const f of fields) {
    if (f.wire !== 2) continue
    const nested = protoParse(f.bytes)
    const model = nested.find((x) => x.number === 1 && x.wire === 0)
    const input = nested.find((x) => x.number === 2 && x.wire === 0)
    const output = nested.find((x) => x.number === 3 && x.wire === 0)
    const cacheRead = nested.find((x) => x.number === 5 && x.wire === 0)
    if (
      model &&
      input &&
      output &&
      model.varint >= 1000 &&
      model.varint < 5000 &&
      input.varint < 2_000_000 &&
      output.varint < 2_000_000
    ) {
      return {
        uncachedInput: input.varint,
        totalOutput: output.varint,
        cacheRead: cacheRead ? cacheRead.varint : 0
      }
    }
    const deep = extractAgTokenUsage(nested)
    if (deep) return deep
  }
  return null
}

/* ------------------------------------------------------- pending / stub */

function parsePending() {
  return { available: false, reason: "暂未接入该 runner 的原生 token 解析" }
}
