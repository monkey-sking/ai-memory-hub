// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import fs from "node:fs";
import path from "node:path";
export function parseRunnerModelList(tool, runner, stdout) {
  const format = runner.modelListFormat || "";
  const text = String(stdout || "");
  const seen = new Set();
  const models = [];
  const add = (value) => {
    const clean = String(value || "").trim().replace(/\s*\(default\)\s*$/i, "");
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      models.push(clean);
    }
  };
  if (format === "grok") {
    for (const line of text.split("\n")) {
      const clean = line.trim();
      const defaultMatch = clean.match(/^Default model:\s*([A-Za-z0-9._/:@-]+)/i);
      if (defaultMatch) {
        add(defaultMatch[1]);
        continue;
      }
      const bulletMatch = clean.match(/^\*+\s*([A-Za-z0-9._/:@-]+)/);
      if (bulletMatch) {
        add(bulletMatch[1]);
        continue;
      }
    }
  } else if (format === "provider-model") {
    for (const line of text.split("\n")) {
      const clean = line.trim();
      if (clean && !clean.startsWith("(") && /^[A-Za-z0-9._-]+(\/|:)[A-Za-z0-9._:/@-]+$/.test(clean)) {
        add(clean);
      }
    }
  } else {
    for (const line of text.split("\n")) {
      const clean = line.trim();
      if (clean && /^[A-Za-z0-9._:/@-]+$/.test(clean) && !clean.includes(" ")) {
        add(clean);
      }
    }
  }
  return models;
}

export function semanticSearch(records, query, limit) {
  if (records.length === 0) return [];
  const STOPWORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "can", "of", "in", "to", "for", "with", "on", "at", "from", "by", "as", "and", "or", "not", "but", "if", "then", "else", "when", "up", "out", "about", "into", "over", "after"]);
  function tokenize(text) {
    const words = String(text || "").toLowerCase().match(/[a-z0-9\u4e00-\u9fff]+/g) || [];
    return words.filter(w => w.length > 1 && !STOPWORDS.has(w));
  }
  const df = new Map();
  const docTokens = records.map(r => {
    const tokens = tokenize(r.text + " " + (r.metadata?.tags || []).join(" ") + " " + (r.metadata?.project || ""));
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
    return tokens;
  });
  const N = records.length;
  function idf(term) { const freq = df.get(term) || 0; return Math.log((N + 1) / (freq + 1)) + 1; }
  const queryTokens = tokenize(query);
  const queryVector = new Map();
  for (const t of queryTokens) queryVector.set(t, (queryVector.get(t) || 0) + 1);
  for (const [t, tf] of queryVector) queryVector.set(t, tf * idf(t));
  const queryNorm = Math.sqrt([...queryVector.values()].reduce((s, v) => s + v * v, 0));
  if (queryNorm === 0) return [];
  const scored = records.map((r, i) => {
    const tokens = docTokens[i];
    const tfMap = new Map();
    for (const t of tokens) tfMap.set(t, (tfMap.get(t) || 0) + 1);
    let dotProduct = 0, docNorm = 0;
    for (const [t, tf] of tfMap) {
      const weight = tf * idf(t);
      docNorm += weight * weight;
      if (queryVector.has(t)) dotProduct += weight * queryVector.get(t);
    }
    docNorm = Math.sqrt(docNorm);
    const score = docNorm > 0 ? dotProduct / (queryNorm * docNorm) : 0;
    return { ...r, score };
  });
  return scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function checkProcessLiveness(pid) {
  if (!pid) {
    return {
      running: false,
      reason: "missing pid"
    };
  }
  try {
    process.kill(pid, 0);
    return {
      running: true,
      reason: pid === process.pid ? "current process" : "signal 0 succeeded"
    };
  } catch (error) {
    if (error.code === "EPERM") {
      return {
        running: true,
        reason: "permission denied, process exists"
      };
    }
    return {
      running: false,
      reason: error.code || error.message || "not running"
    };
  }
}

export function getContentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

export function readRequestJson(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function findProjectIndex(projects, query) {
  const clean = String(query || "").trim();
  if (!clean) {
    return -1;
  }
  const exact = projects.findIndex((project) => project.id === clean);
  if (exact !== -1) {
    return exact;
  }
  const normalized = clean.toLowerCase();
  const alias = projects.findIndex((project) => (
    [project.name, project.displayName, ...(project.aliases || [])]
      .some((value) => String(value || "").toLowerCase() === normalized)
  ));
  if (alias !== -1) {
    return alias;
  }
  const prefixMatches = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => String(project.id || "").toLowerCase().startsWith(normalized));
  return prefixMatches.length === 1 ? prefixMatches[0].index : -1;
}

export function expandSynonyms(terms) {
  const synonyms = [
    ["feishu", "飞书", "lark", "lark-feishu"],
    ["git", "github", "gitee"],
    ["wechat", "微信", "wx", "wechat-mini-game"],
    ["game", "游戏", "play"],
    ["task", "任务", "todo"],
    ["workflow", "工作流", "collaboration"],
    ["memory", "记忆", "hub"]
  ];
  const expanded = new Set(terms);
  for (const term of terms) {
    for (const group of synonyms) {
      if (group.includes(term)) {
        for (const word of group) {
          expanded.add(word);
        }
      }
    }
  }
  return [...expanded];
}

export function scanBackupFilesForSecrets(files) {
  const issues = [];
  const patterns = [
    { kind: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,255}\b/ },
    { kind: "openai-api-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
    { kind: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
    { kind: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
    { kind: "local-absolute-path", pattern: /\b[A-Za-z]:[\\/](?:Users|Project|Work|Workspace)[\\/][^\s"'<>]+/i },
    { kind: "internal-feishu-url", pattern: new RegExp("\\bhttps://(?:my|applink)\\.feishu\\.cn\\b", "i") }
  ];
  for (const file of files) {
    const stat = fs.statSync(file.target);
    if (stat.size > 5 * 1024 * 1024) {
      continue;
    }
    const text = fs.readFileSync(file.target, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (pattern.pattern.test(line)) {
          issues.push({
            file: file.name,
            line: index + 1,
            kind: pattern.kind
          });
        }
      }
    });
  }
  return {
    ok: issues.length === 0,
    issues
  };
}
