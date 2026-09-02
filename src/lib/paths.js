// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import path from "node:path";
import { fileURLToPath } from "node:url";

// 仓库根目录。从 src/index.js 搬到 src/lib/ 后相对深度变了：
// src/lib/paths.js -> dirname=src/lib -> "../.." = 仓库根（原来是 src/index.js -> ".."）
export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function recipeReadLocations(memoryDir) {
  return [
    { source: "user", dir: path.join(memoryDir, "recipes") },
    { source: "builtin", dir: path.join(projectRoot(), "recipes") }
  ];
}

export function recipeListLocations(memoryDir) {
  return [
    { source: "builtin", dir: path.join(projectRoot(), "recipes") },
    { source: "user", dir: path.join(memoryDir, "recipes") }
  ];
}
