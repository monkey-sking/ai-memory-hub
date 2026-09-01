// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import os from "node:os";
import path from "node:path";

export function normalizeResolveQuery(query) {
  const clean = String(query || "").trim().replace(/^@+/, "");
  return clean.replace(/^["']|["']$/g, "");
}

export function extractFilesystemPathCandidates(text) {
  const source = String(text || "");
  const matches = [
    ...(source.match(/[A-Za-z]:\\[^\s`'")\]}，。；;]+/g) || []),
    ...(source.match(/~[\\/][^\s`'")\]}，。；;]+/g) || []),
    ...(source.match(/\/[^\s`'")\]}，。；;]+/g) || [])
  ];
  return matches.map((item) => item.replace(/[.,，。；;:]+$/g, ""));
}

export function resolvePossiblyHomePath(value) {
  const clean = String(value || "").trim().replace(/^["']|["']$/g, "");
  if (!clean) {
    return "";
  }
  if (clean === "~") {
    return os.homedir();
  }
  if (clean.startsWith("~/") || clean.startsWith("~\\")) {
    return path.join(os.homedir(), clean.slice(2));
  }
  return clean;
}

export function pathMatchesResolveQuery(candidatePath, normalizedQuery) {
  if (!normalizedQuery) {
    return false;
  }
  const candidate = path.normalize(candidatePath).toLowerCase();
  const query = path.normalize(normalizedQuery).toLowerCase();
  if (candidate === query || candidate.endsWith(`${path.sep}${query}`)) {
    return true;
  }
  return path.basename(candidate).toLowerCase() === path.basename(query).toLowerCase();
}
