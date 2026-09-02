import path from "node:path";
import { extractCjkNgrams } from "./util.js";

export function extractInstructionIncludes(text) {
  const includes = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*@([A-Za-z0-9_.-][A-Za-z0-9_.\\/-]*)\s*$/);
    if (match) {
      includes.push(`@${match[1]}`);
    }
  }
  return [...new Set(includes)];
}

export function normalizeSeverity(severity) {
  const clean = String(severity || "info").toLowerCase();
  return ["info", "warning", "error", "critical", "need_input"].includes(clean) ? clean : "info";
}

export function formatTopCounts(items = [], limit = 8) {
  const selected = items.slice(0, limit);
  return selected.length ? selected.map((item) => `${item.key}(${item.count})`).join(", ") : "none";
}

export function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} ${units[unit]}` : `${value.toFixed(1)} ${units[unit]}`;
}

export function sanitizeDisplayText(value) {
  return String(value || "")
    .replace(/\u0000/g, "\\0")
    .replace(/\ufffd/g, "?")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
}

export function getMemoryAgeDays(memory) {
  const time = Date.parse(memory.ts || memory.indexedAt || "");
  if (!Number.isFinite(time)) {
    return 0;
  }
  return Math.max(0, (Date.now() - time) / 86400000);
}

export function inferScope(kind, topics, project = "") {
  if (kind === "preference") return "user";
  if (kind === "workflow" || kind === "correction" || kind === "lesson") return "workflow";
  if (project) return "project";
  if (topics.includes("ai-memory-hub")) return "memory-hub";
  if (topics.includes("game") || topics.includes("wechat-mini-game")) return "project";
  return "general";
}

export function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u3000\s]+/g, " ")
    .trim();
}

export function countBy(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function sortByImportance(a, b) {
  return Number(b.importance || 0) - Number(a.importance || 0) || String(b.ts || "").localeCompare(String(a.ts || ""));
}

export function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function looksSensitive(text) {
  // 1. Bare keys like sk- openai tokens (at least 16 chars)
  if (/sk-[A-Za-z0-9_-]{16,}/i.test(text)) {
    return true;
  }
  // 2. Generic secret assignments (e.g. token: "xxx" or password = "yyy")
  if (/\b(api[_-]?key|password|secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{8,}/i.test(text)) {
    return true;
  }
  return false;
}

export function formatEventLocation(entry) {
  return `${entry.file}:${entry.lineNumber}`;
}

export function extractSection(text, heading, nextHeading = "") {
  const index = text.indexOf(heading);
  if (index === -1) {
    return "";
  }
  if (!nextHeading) {
    return text.slice(index);
  }
  const nextIndex = text.indexOf(nextHeading, index + heading.length);
  return nextIndex === -1 ? text.slice(index) : text.slice(index, nextIndex);
}

export function extractSectionBeforeAny(text, heading, nextHeadings = []) {
  const index = text.indexOf(heading);
  if (index === -1) {
    return "";
  }
  let nextIndex = text.length;
  for (const nextHeading of nextHeadings) {
    const found = text.indexOf(nextHeading, index + heading.length);
    if (found !== -1 && found < nextIndex) {
      nextIndex = found;
    }
  }
  return text.slice(index, nextIndex);
}

export function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] || "");
}

export function trimOutput(value, limit = 4000) {
  const text = String(value || "").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n...[truncated]`;
}

export function summarizeText(value, limit = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }
  const safeLimit = Math.max(0, Number(limit) || 0);
  return `${text.slice(0, Math.max(0, safeLimit - 3)).trimEnd()}...`;
}

export function textMentionsResolveQuery(text, normalizedQuery) {
  const basename = path.basename(normalizedQuery).toLowerCase();
  const normalizedText = normalizeSearchText(text);
  return normalizedText.includes(normalizeSearchText(normalizedQuery)) ||
    (basename && normalizedText.includes(basename));
}

export function summarizeHealthAnalysisForRepair(analysis) {
  return {
    score: analysis.score,
    status: analysis.status,
    totalRecords: analysis.totalRecords,
    qualityRecords: analysis.qualityRecords,
    duplicateRecords: analysis.duplicateRecords,
    corruptedRecords: analysis.corruptedRecords.length,
    storageDisplay: formatBytes(analysis.storage.totalBytes)
  };
}

export function sanitizeLedgerText(value) {
  return sanitizeDisplayText(value).trim();
}

export function normalizeDuplicateMemoryText(text) {
  return normalizeSearchText(text)
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeInlineText(value) {
  return sanitizeDisplayText(value).replace(/\s+/g, " ").trim();
}

export function extractKeywords(text) {
  const normalized = normalizeSearchText(text);
  const latin = normalized.match(/[a-z0-9][a-z0-9_.-]{1,}/g) || [];
  const cjk = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const ngrams = extractCjkNgrams(normalized);
  const stop = new Set(["the", "and", "for", "with", "when", "this", "that", "into", "from", "should", "memory", "local"]);
  return [...new Set([...latin, ...cjk, ...ngrams].filter((term) => term && !stop.has(term)).slice(0, 120))];
}

export function extractCompactVariants(text) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  const compact = normalized.replace(/[\s`~!@#$%^&*()\-_=+\[\]{}\\|;:'",<.>/?。，、；：！？（）【】《》“”‘’]+/g, "");
  return compact && compact !== normalized ? [compact] : [];
}

export function getMemoryEventSkipReason(normalizedEvent) {
  if (!normalizedEvent.text) {
    return "missing text";
  }
  if (looksSensitive(normalizedEvent.text)) {
    return "looks sensitive";
  }
  return "";
}
