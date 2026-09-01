#!/usr/bin/env node
// 把 src/index.js 中的「叶子函数」下沉到 src/lib/util.js（v3.0 重构 P0-2）。
//
// 前置：先用 analysis 确认目标函数没有 index.js 内部依赖。可用
//   node scripts/refactor/check-deps.mjs   （deps 注入完整性）
// 配合人工确认。下沉后必须跑三件套验证 + HTTP 冒烟。
//
// 用法:
//   node scripts/refactor/sink-functions.mjs <函数名...>            # 下沉到 util.js
//   node scripts/refactor/sink-functions.mjs <函数名...> --to lib/xx.js
//
// 已有文件会走追加模式：保留原有函数，合并 import，不会覆盖。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let acorn;
try {
  acorn = require("acorn");
} catch {
  console.error("需要 acorn：先在项目里安装，或设置 NODE_PATH 指向含 acorn 的 node_modules");
  process.exit(1);
}

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const indexPath = path.join(root, "src", "index.js");

// 解析参数
const args = process.argv.slice(2);
let targetFile = "lib/util.js";
const toIdx = args.indexOf("--to");
if (toIdx !== -1) {
  targetFile = args[toIdx + 1];
  args.splice(toIdx, 2);
}
const targets = new Set(args.filter((a) => !a.startsWith("--")));

if (targets.size === 0) {
  console.error("用法: node scripts/refactor/sink-functions.mjs <函数名...> [--to lib/xx.js]");
  process.exit(1);
}

const targetPath = path.join(root, "src", targetFile);
const src = fs.readFileSync(indexPath, "utf8");
const lines = src.split("\n");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });

// 收集目标函数源码
const found = [];
for (const node of ast.body) {
  if (node.type !== "FunctionDeclaration" || !node.id) continue;
  if (!targets.has(node.id.name)) continue;
  const start = node.loc.start.line - 1;
  const end = node.loc.end.line - 1;
  found.push({ name: node.id.name, start, end, code: lines.slice(start, end + 1).join("\n") });
}

const missing = [...targets].filter((t) => !found.some((f) => f.name === t));
if (missing.length > 0) {
  console.error("未找到函数: " + missing.join(", "));
  process.exit(1);
}
found.sort((a, b) => a.start - b.start);

// 已存在则走追加模式：保留原有内容，合并 import
let existingBody = "";
const existingImports = new Set();
if (fs.existsSync(targetPath)) {
  const content = fs.readFileSync(targetPath, "utf8");
  for (const line of content.split("\n")) {
    if (/^import\s+/.test(line)) existingImports.add(line.trim());
  }
  existingBody = content
    .split("\n")
    .filter((l) => !/^import\s+/.test(l) && !/^\/\/ (从 src\/index\.js 下沉|这些函数不依赖 index\.js)/.test(l))
    .join("\n")
    .trim();
}

// 目标文件需要的 node 内置模块
const bodyText = [existingBody, ...found.map((f) => f.code)].join("\n");
const builtins = [];
if (/\bfs\./.test(bodyText)) builtins.push('import fs from "node:fs";');
if (/\bpath\./.test(bodyText)) builtins.push('import path from "node:path";');
if (/\bos\./.test(bodyText)) builtins.push('import os from "node:os";');
if (/\bcrypto\./.test(bodyText)) builtins.push('import crypto from "node:crypto";');

const allImports = [...new Set([...existingImports, ...builtins])].sort();
const newFns = found.map((f) => f.code.replace(/^function /, "export function ")).join("\n\n");

const out = [
  "// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。",
  "// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。",
  "",
  ...allImports,
  ...(allImports.length ? [""] : []),
  existingBody,
  ...(existingBody ? ["", ""] : []),
  newFns,
  "",
].join("\n");

fs.writeFileSync(targetPath, out.replace(/\n{3,}/g, "\n\n"));

// 从 index.js 删除（从后往前，避免行号偏移）
for (const f of [...found].reverse()) {
  lines.splice(f.start, f.end - f.start + 1);
}

// 在最后一条 import 之后插入引用
let lastImport = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^import\s+.*from\s+["']/.test(lines[i])) lastImport = i;
}
if (lastImport < 0) {
  console.error("未在 index.js 中找到 import 语句，已中止（index.js 未改动）");
  fs.writeFileSync(indexPath, src);
  process.exit(1);
}
const importLine = `import { ${found.map((f) => f.name).join(", ")} } from "./${targetFile}";`;
lines.splice(lastImport + 1, 0, importLine);
fs.writeFileSync(indexPath, lines.join("\n"));

console.log(`已下沉 ${found.length} 个函数到 src/${targetFile}:`);
for (const f of found) console.log(`  - ${f.name}（原 L${f.start + 1}，${f.end - f.start + 1} 行）`);
console.log(`index.js 从 ${src.split("\n").length} 行减到 ${lines.length} 行`);
