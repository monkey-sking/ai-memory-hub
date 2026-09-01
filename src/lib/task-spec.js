// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import path from "node:path";

export function normalizeTaskSpecEnv(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)]));
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

export function normalizeTaskSpecList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => item && typeof item === "object" ? item : String(item));
}

export function normalizeTaskSpecLogs(logs) {
  if (!logs || typeof logs !== "object" || Array.isArray(logs)) {
    return {};
  }
  return {
    stdout: logs.stdout ? String(logs.stdout) : "",
    stderr: logs.stderr ? String(logs.stderr) : ""
  };
}

export function selectPlatformCommand(commandSpec) {
  if (process.platform === "win32" && commandSpec.windowsCommand) {
    return commandSpec.windowsCommand;
  }
  return commandSpec.command || commandSpec.windowsCommand || "";
}

export function getTaskSpecProcessStatus(completed) {
  if (completed?.error?.code === "ETIMEDOUT") {
    return "timed_out";
  }
  return completed?.status === 0 ? "passed" : "failed";
}

export function resolveInside(root, target) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, target);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${target}`);
  }
  return resolved;
}
