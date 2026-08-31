import { fileURLToPath } from "node:url";
import path from "node:path";

// 仓库根目录。从 src/index.js 搬到 src/lib/ 后相对深度变了：
// src/lib/paths.js -> dirname=src/lib -> "../.." = 仓库根（原来是 src/index.js -> ".."）
export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}
