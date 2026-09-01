// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import path from "node:path";

export function getToolDeclarationsFile(memoryDir) {
  return path.join(memoryDir, "state", "tool-declarations.jsonl");
}

export function getModelsCacheFile(memoryDir) {
  return path.join(memoryDir, "state", "tool-models.json");
}

export function getRadioCursorFile(memoryDir, consumer) {
  const safe = String(consumer || "all").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(memoryDir, "radio", "cursors", `${safe}.json`);
}

export function getAgentRegistryFile(memoryDir) {
  return path.join(path.resolve(memoryDir), "agents", "agents.jsonl");
}

export function getRoleRegistryFile(memoryDir) {
  return path.join(path.resolve(memoryDir), "roles", "roles.jsonl");
}

export function getTeamRegistryFile(memoryDir) {
  return path.join(path.resolve(memoryDir), "teams", "teams.jsonl");
}

export function getPolicyRulesFile(memoryDir) {
  return path.join(memoryDir, "policy", "rules.jsonl");
}
