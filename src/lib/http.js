// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import fs from "node:fs";
import path from "node:path";

export function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

export function sendPlain(res, text, status = 200) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

export function sendJson(res, value, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(value, null, 2));
}

export function sendErrorEnvelope(res, status, message, details) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify({ ok: false, error: message, details: details || undefined, ts: new Date().toISOString() }, null, 2));
}

export function parsePageParam(value, fallback) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getSafeStaticRelativePath(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return "";
  }
  const relativePath = decodedPath.replace(/^\/+/, "").replace(/\\/g, "/");
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    return "";
  }
  return segments.join(path.sep);
}

export function readTextIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
