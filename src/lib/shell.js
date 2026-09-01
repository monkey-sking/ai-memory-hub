// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import path from "node:path";

export function quoteWindowsCmdArg(value) {
  const text = String(value ?? "");
  if (!text) {
    return "\"\"";
  }
  return `"${text.replace(/"/g, "\"\"").replace(/[%^&|<>()]/g, "^$&")}"`;
}

export function escapeForWindowsCmd(value) {
  return String(value || "")
    .replace(/"/g, '""')
    .replace(/%/g, "%%");
}

export function quoteWindowsCommandArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function quoteShellArg(value) {
  const raw = String(value);
  return /\s/.test(raw) ? `"${raw.replace(/"/g, '\\"')}"` : raw;
}

export function classifyCommandPath(file) {
  const ext = path.extname(String(file || "")).toLowerCase();
  if (ext === ".exe" || ext === ".com") return "executable";
  if (ext === ".cmd") return "cmd-shim";
  if (ext === ".bat") return "cmd-script";
  if (ext === ".ps1") return "powershell-shim";
  return ext ? "file" : "native";
}

export function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}
