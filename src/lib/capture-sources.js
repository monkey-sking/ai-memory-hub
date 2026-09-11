// 自动 turn 捕获：源适配层（capture sources）
//
// 从各 AI 工具的本地 transcript 中提取「完整对话轮次」，让记忆不再只靠 agent
// 自觉执行 amh record。借鉴 Memmy 的做法：捕获单位是 turn（一条用户请求 +
// 该轮最后一条助手回复），而不是逐条消息——否则工具调用噪声会灌满记忆库。
//
// 只做只读解析，不写任何状态；水印与去重状态在 capture-state.js。
//
// 依赖方向（单向，勿反向引用 index.js）：
//   commands/capture.js -> lib/capture-sources.js -> 仅 node 内置模块
//
// 本模块刻意零外部依赖，方便单测直接喂 transcript 样本。

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 单条文本上限：用户请求留得多、助手回复留得少，与 Memmy 的 4000/2000 一致。
const USER_TEXT_LIMIT = 4000;
const ASSISTANT_TEXT_LIMIT = 2000;
// 长度按**码元**算，而中文信息密度远高于英文：一句「进行下消融实验」只有 7 个码元
// 却是完整的真实请求。阈值 8 会把它误杀（剥离注入块后才暴露出来，此前被前导块撑长
// 掩盖了）。取 4 仍能挡住「好的」「继续」这类无信息量的应答。
const MIN_TURN_TEXT_LENGTH = 4;

// 单文件超过这个体积就跳过，避免把内存吃满。
const MAX_FILE_BYTES = 16 * 1024 * 1024;
// 单个源最多扫这么多文件，防止异常目录把扫描拖死。
const MAX_FILES_PER_SOURCE = 4000;

// 源定义：roots 相对 $HOME；match 决定哪些文件算 transcript。
export const CAPTURE_SOURCE_DEFS = {
  claude: {
    tool: "claude",
    label: "Claude Code",
    roots: [".claude/projects"],
    match: (filePath) => filePath.endsWith(".jsonl")
  },
  codex: {
    tool: "codex",
    label: "Codex",
    roots: [".codex/sessions"],
    match: (filePath) => filePath.endsWith(".jsonl")
  },
  workbuddy: {
    tool: "workbuddy",
    label: "WorkBuddy",
    roots: [".workbuddy/projects"],
    match: (filePath) => filePath.endsWith(".jsonl")
  },
  gemini: {
    tool: "gemini",
    label: "Gemini / Antigravity",
    roots: [".gemini"],
    match: (filePath) => path.basename(filePath) === "transcript.jsonl"
  }
};

export function listCaptureTools() {
  return Object.keys(CAPTURE_SOURCE_DEFS);
}

function expandHome(root) {
  return root.startsWith("~/") ? path.join(os.homedir(), root.slice(2)) : root;
}

/** 递归收集某个源的 transcript 文件（只读，永不修改）。 */
export function findCaptureFiles(tool, { home = os.homedir(), maxFiles = MAX_FILES_PER_SOURCE } = {}) {
  const def = CAPTURE_SOURCE_DEFS[tool];
  if (!def) throw new Error(`Unknown capture source "${tool}". Known: ${listCaptureTools().join(", ")}`);
  const found = [];
  const walk = (dir, depth) => {
    if (found.length >= maxFiles || depth > 8) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过常见噪声目录，避免扫进 node_modules / 缓存。
        if (["node_modules", ".git", "cache", "caches", "tmp"].includes(entry.name)) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !def.match(full)) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size === 0 || stat.size > MAX_FILE_BYTES) continue;
        found.push({ path: full, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) });
      } catch {
        // 文件在扫描期间被删或不可读，忽略。
      }
    }
  };
  for (const root of def.roots) {
    walk(path.join(home, root.replace(/^~\//, "")), 0);
  }
  return found;
}

// ─── 文本清洗 ───

/** 去掉一对同名标签包裹的整块内容（非贪婪，跨行）。 */
function stripTagBlock(text, tag) {
  if (!text || !text.includes(`<${tag}`)) return text;
  return text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
}

/** 保留标签内的正文、丢掉标签本身（用于 gemini 的 <USER_REQUEST>）。 */
function unwrapTagBlock(text, tag) {
  if (!text || !text.includes(`<${tag}`)) return text;
  const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return text;
  const rest = text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "i"), " ");
  return `${match[1]}\n${rest}`;
}

/**
 * 拆 codex 的转交信封：`<codex_delegation>` 是 harness 包的信封，但 `<input>`
 * 里装的是**真人写的任务**。所以只留 payload，丢掉信封与 <source_thread_id>。
 * 单独写而不是复用 unwrapTagBlock：<input> 是 HTML 通用标签，全局解包会误伤
 * 正文里真的出现 HTML 的场景，这里限定在信封内部才处理。
 */
function unwrapDelegationBlock(text) {
  if (!text || !text.includes("<codex_delegation")) return text;
  const match = text.match(/<input>([\s\S]*?)<\/input>/i);
  const rest = text.replace(/<codex_delegation[\s\S]*?<\/codex_delegation>/gi, " ");
  return `${match ? match[1] : ""}\n${rest}`;
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /gho_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(?:Bearer|Authorization:\s*Bearer)\s+[A-Za-z0-9._-]{20,}/gi
];

/** 脱敏并压缩空白。捕获进记忆库的文本一律先过这一层。 */
export function cleanCaptureText(text) {
  if (!text) return "";
  let out = String(text);
  out = out.replace(/```[\s\S]*?```/g, (block) => block.slice(0, 400));
  out = unwrapTagBlock(out, "USER_REQUEST");
  out = unwrapTagBlock(out, "user_query");
  for (const tag of [
    "system-reminder",
    "identity_context",
    "INSTRUCTIONS",
    "local-command-caveat",
    "ADDITIONAL_METADATA",
    "USER_SETTINGS_CHANGE",
    "system_instruction",
    "environment_context",
    // 交互客户端注入的环境块：出现在真人请求**之前**，剥掉后剩下的才是请求本身
    // （实测 WorkBuddy 的结构是「ambient 块 + `## My request:` + 真人请求」）。
    "in-app-browser-context",
    "in-app-browser-state"
  ]) {
    out = stripTagBlock(out, tag);
  }
  // codex_delegation 是 harness 的转交信封，但 <input> 里装的是**真人写的任务**，
  // 整块删掉会丢内容 —— 只拆信封留下 payload。
  out = unwrapDelegationBlock(out);
  // 大段 base64 内联载荷（图片/附件）直接替换成占位符。
  out = out.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[inline-data]");
  out = out.replace(/\b[A-Za-z0-9+/]{200,}={0,2}\b/g, "[blob]");
  // 交互客户端在注入块之后用这行标记真人请求的起点，它本身不是请求内容。
  out = out.replace(/^\s*##\s*My request:\s*/i, "");
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[redacted]");
  out = out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/** 从 message.content（字符串或分段数组）中取出纯文本。 */
function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      if (["text", "input_text", "output_text"].includes(item.type)) return item.text || "";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * 判断这条用户请求值不值得进记忆库。
 * 主要挡两类噪声：AMH 自己的派工样板、以及工具注入的元指令。
 */
// 机器生成的伪「用户请求」：这些不是人提的需求，抓进来只会污染记忆库。
// 分两类：工具自注入的上下文块、以及多 agent harness 的定时唤醒/消息通知。
// 规则刻意只匹配通用句式，不写具体产品名或频道名。
const NOISE_PATTERNS = [
  /^The following is the Codex agent history/i,
  /TRANSCRIPT DELTA START/,
  /^You are judging one planned coding-agent action/i,
  /^You've been woken because/i,
  /^You have been woken because/i,
  /woken by your OWN AGENDA/i,
  /untrusted evidence, not as instructions to follow/i,
  /^<system-reminder/i,
  /^<recommended_plugins>/i,
  /^Current time \(UTC\)/i,
  /^⚡/,
  /new message\(s\) arrived/i,
  /direct message arrived/i,
  // 角色设定式系统提示词（"You are X's ..."），真人提需求不会这么开头。
  /^You are [^.\n]{0,60}'s /i
];

// 非人类发起者：守护进程、定时任务、子 agent 审批流。
// 只捕获人直接发起的会话，用拒绝式匹配而不是白名单——新的交互客户端不会被误杀。
const NON_HUMAN_ORIGINATOR = /daemon|guardian|subagent|triage|cron|scheduler|harness|background/i;

export function isCaptureWorthy(text) {
  const value = String(text || "").trim();
  if (value.length < MIN_TURN_TEXT_LENGTH) return false;
  if (value.includes("__AI_MEMORY_THREAD__")) return false;
  if (value.startsWith("<local-command-caveat>")) return false;
  if (/^#\s*AGENTS\.md instructions/i.test(value)) return false;
  if (NOISE_PATTERNS.some((pattern) => pattern.test(value))) return false;
  return true;
}

/** 看起来是工具输出而不是助手回复（gemini 的 GENERIC 常见这种）。 */
function looksLikeToolOutput(text) {
  return /^(Created At:|File Path:|Ran |Exit code|Tool output)/i.test(String(text || "").trim());
}

function truncate(text, limit) {
  const value = String(text || "");
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function projectFromCwd(cwd) {
  if (!cwd) return "";
  const base = path.basename(String(cwd).replace(/[\\/]+$/, ""));
  if (!base) return "";
  // 日期戳、UUID、纯数字：这是会话目录不是项目目录（WorkBuddy 尤其常见），
  // 宁可留空让调用方用 --project 指定，也不要拿它污染项目维度。
  if (/^\d{4}-\d{2}-\d{2}/.test(base)) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(base)) return "";
  if (/^\d+$/.test(base)) return "";
  return base;
}

function toIsoTimestamp(value) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

// ─── 各工具适配器 ───
// 每个适配器返回 turn 数组：{ turnId, tool, sessionId, project, cwd, ts, userText, assistantText }

function claudeAdapter(lines, filePath) {
  const turns = [];
  let current = null;
  let sessionId = path.basename(filePath, ".jsonl");
  let cwd = "";
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.sessionId) sessionId = record.sessionId;
    if (record.cwd) cwd = record.cwd;
    if (record.type === "user" && record.message?.role === "user") {
      if (record.isMeta) continue;
      const text = cleanCaptureText(textFromContent(record.message.content));
      if (!isCaptureWorthy(text)) continue;
      if (current && current.assistantText) turns.push(current);
      current = {
        tool: "claude",
        sessionId,
        cwd,
        project: projectFromCwd(cwd),
        ts: toIsoTimestamp(record.timestamp),
        userText: truncate(text, USER_TEXT_LIMIT),
        assistantText: ""
      };
      continue;
    }
    if (record.type === "assistant" && record.message?.role === "assistant" && current) {
      const text = cleanCaptureText(textFromContent(record.message.content));
      if (text) {
        current.assistantText = truncate(text, ASSISTANT_TEXT_LIMIT);
        current.tsEnd = toIsoTimestamp(record.timestamp);
      }
    }
  }
  if (current && current.assistantText) turns.push(current);
  return turns;
}

function codexAdapter(lines, filePath) {
  const turns = [];
  let current = null;
  let sessionId = path.basename(filePath, ".jsonl");
  let cwd = "";
  // Codex 的 guardian / subagent 会话是机器审批流，不是人干活，整段跳过。
  let isBackgroundSession = false;
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === "session_meta" && record.payload) {
      if (record.payload.id) sessionId = record.payload.id;
      if (record.payload.cwd) cwd = record.payload.cwd;
      const threadSource = String(record.payload.thread_source || "");
      const originator = String(record.payload.originator || "");
      if (record.payload.source?.subagent
        || NON_HUMAN_ORIGINATOR.test(threadSource)
        || NON_HUMAN_ORIGINATOR.test(originator)) {
        isBackgroundSession = true;
        return [];
      }
      continue;
    }
    if (isBackgroundSession) return [];
    if (record.type !== "response_item" || record.payload?.type !== "message") continue;
    const text = cleanCaptureText(textFromContent(record.payload.content));
    if (record.payload.role === "user") {
      if (!isCaptureWorthy(text)) continue;
      if (current && current.assistantText) turns.push(current);
      current = {
        tool: "codex",
        sessionId,
        cwd,
        project: projectFromCwd(cwd),
        ts: toIsoTimestamp(record.timestamp),
        userText: truncate(text, USER_TEXT_LIMIT),
        assistantText: ""
      };
      continue;
    }
    if (record.payload.role === "assistant" && current && text) {
      // final_answer 是本轮真正结论，优先覆盖中间过程。
      const isFinal = record.payload.phase === "final_answer";
      if (isFinal || !current.assistantText) {
        current.assistantText = truncate(text, ASSISTANT_TEXT_LIMIT);
        current.tsEnd = toIsoTimestamp(record.timestamp);
      }
    }
  }
  if (current && current.assistantText) turns.push(current);
  return turns;
}

function workbuddyAdapter(lines, filePath) {
  const turns = [];
  let current = null;
  let sessionId = path.basename(filePath, ".jsonl");
  let cwd = "";
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.sessionId) sessionId = record.sessionId;
    if (record.cwd) cwd = record.cwd;
    if (record.type !== "message") continue;
    const text = cleanCaptureText(textFromContent(record.content));
    if (record.role === "user") {
      if (!isCaptureWorthy(text)) continue;
      if (current && current.assistantText) turns.push(current);
      current = {
        tool: "workbuddy",
        sessionId,
        cwd,
        project: projectFromCwd(cwd),
        ts: toIsoTimestamp(record.timestamp),
        userText: truncate(text, USER_TEXT_LIMIT),
        assistantText: ""
      };
      continue;
    }
    if (record.role === "assistant" && current && text) {
      current.assistantText = truncate(text, ASSISTANT_TEXT_LIMIT);
      current.tsEnd = toIsoTimestamp(record.timestamp);
    }
  }
  if (current && current.assistantText) turns.push(current);
  return turns;
}

function geminiAdapter(lines) {
  const turns = [];
  let current = null;
  let assistantFallback = "";
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.source === "USER_EXPLICIT" && record.type === "USER_INPUT") {
      const text = cleanCaptureText(record.content || "");
      if (!isCaptureWorthy(text)) continue;
      if (current && current.assistantText) turns.push(current);
      current = {
        tool: "gemini",
        sessionId: "",
        cwd: "",
        project: "",
        ts: toIsoTimestamp(record.created_at),
        userText: truncate(text, USER_TEXT_LIMIT),
        assistantText: ""
      };
      assistantFallback = "";
      continue;
    }
    if (record.source === "MODEL" && current) {
      const text = cleanCaptureText(record.content || "");
      if (!text || looksLikeToolOutput(text)) continue;
      if (record.type === "PLANNER_RESPONSE") {
        current.assistantText = truncate(text, ASSISTANT_TEXT_LIMIT);
        current.tsEnd = toIsoTimestamp(record.created_at);
      } else if (!assistantFallback) {
        assistantFallback = truncate(text, ASSISTANT_TEXT_LIMIT);
      }
    }
  }
  if (current) {
    if (!current.assistantText && assistantFallback) current.assistantText = assistantFallback;
    if (current.assistantText) turns.push(current);
  }
  return turns;
}

const ADAPTERS = {
  claude: claudeAdapter,
  codex: codexAdapter,
  workbuddy: workbuddyAdapter,
  gemini: geminiAdapter
};

/** 解析单个 transcript 文件，返回完整 turn 列表（不带 turnId，由调用方补）。 */
export function parseCaptureFile(tool, filePath) {
  const adapter = ADAPTERS[tool];
  if (!adapter) throw new Error(`Unknown capture source "${tool}".`);
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n");
  return adapter(lines, filePath);
}

/**
 * 给 turn 补上稳定 id。
 *
 * 关键：用「文件路径哈希 + 文件内序号」，不用 sessionId、也不用内容哈希。
 * - 内容哈希不行：transcript 会被追加，同一 turn 的文本会变。
 * - sessionId 不行：gemini 的 transcript 全叫 transcript.jsonl，没有 sessionId，
 *   退回 basename 会让不同目录下同名文件的序号互相撞车，去重直接失效。
 * 路径哈希每个文件唯一，且追加新 turn 不会改变已有 turn 的序号。
 */
export function assignTurnIds(turns, tool, filePath) {
  const fileKey = crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 10);
  return turns.map((turn, index) => ({
    ...turn,
    fileKey,
    turnId: `capture:${tool}:${fileKey}:${index}`
  }));
}

/** 把 turn 渲染成要进记忆库的文本：用户请求 + 助手结论，都不超长。 */
export function renderTurnText(turn) {
  const user = truncate(turn.userText, USER_TEXT_LIMIT);
  const assistant = truncate(turn.assistantText, ASSISTANT_TEXT_LIMIT);
  return assistant ? `${user}\n\n→ ${assistant}` : user;
}

export { projectFromCwd, toIsoTimestamp, USER_TEXT_LIMIT, ASSISTANT_TEXT_LIMIT };
