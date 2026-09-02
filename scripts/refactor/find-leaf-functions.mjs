#!/usr/bin/env node
// 找出 src/index.js 中可以安全下沉的「叶子函数」：不依赖 index.js 内部顶层符号。
//
// 背景：早先用正则做这件事会漏检模板字符串 ${} 内的调用（例如
// formatMemoryFilterSummary 里的 normalizeMemoryProject），产生危险的假阳性，
// 所以改成 acorn AST 分析。
//
// 用法：
//   node scripts/refactor/find-leaf-functions.mjs                 # 默认 src/index.js
//   node scripts/refactor/find-leaf-functions.mjs src/other.js
//   node scripts/refactor/find-leaf-functions.mjs --sinkable      # 只列脚本能自动处理的
//   node scripts/refactor/find-leaf-functions.mjs --group         # 按依赖来源分组，决定往哪儿沉
//
// 前置：需要 acorn。项目里没有装，用 NODE_PATH 指过去：
//   NODE_PATH=<含 acorn 的 node_modules> node scripts/refactor/find-leaf-functions.mjs
// 或 npm i -D acorn。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let acorn;
try {
  acorn = require("acorn");
} catch {
  console.error("需要 acorn：npm i -D acorn，或设置 NODE_PATH 指向含 acorn 的 node_modules");
  process.exit(1);
}

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const file = args[0] ? path.resolve(process.cwd(), args[0]) : path.join(root, "src", "index.js");

const src = fs.readFileSync(file, "utf8");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });

const GLOBALS = new Set([
  "console", "process", "require", "module", "exports", "globalThis", "Buffer", "URL", "URLSearchParams",
  "Set", "Map", "JSON", "Math", "Date", "Object", "Array", "String", "Number", "Boolean",
  "Error", "TypeError", "RangeError", "SyntaxError", "EvalError", "ReferenceError",
  "Promise", "RegExp", "Symbol", "WeakMap", "WeakSet", "Intl", "AbortController", "AbortSignal",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "queueMicrotask",
  "structuredClone", "undefined", "NaN", "Infinity", "global", "__dirname", "__filename",
  "arguments", "this", "super", "decodeURIComponent", "encodeURIComponent", "parseInt", "parseFloat",
  "isNaN", "isFinite", "Reflect", "Proxy", "BigInt", "TextEncoder", "TextDecoder", "fetch", "crypto",
]);

// sink-functions.mjs 只会自动补这几种 node 内置 import；依赖项目内模块的函数要手工补。
const SINKABLE_BUILTINS = new Set([
  "node:fs", "node:path", "node:os", "node:crypto",
  "fs", "path", "os", "crypto",
]);

// 1. 顶层绑定 + import 来源
const topLevel = new Set();
const imported = new Map();
function collectPatternNames(node, out) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": out.add(node.name); break;
    case "ObjectPattern":
      for (const p of node.properties) collectPatternNames(p.type === "RestElement" ? p.argument : p.value, out);
      break;
    case "ArrayPattern": for (const e of node.elements) if (e) collectPatternNames(e, out); break;
    case "AssignmentPattern": collectPatternNames(node.left, out); break;
    case "RestElement": collectPatternNames(node.argument, out); break;
    default: break;
  }
}
for (const node of ast.body) {
  if (node.type === "ImportDeclaration") {
    for (const spec of node.specifiers) {
      const name = spec.local.name;
      topLevel.add(name);
      imported.set(name, node.source.value);
    }
  } else if (node.type === "FunctionDeclaration" && node.id) {
    topLevel.add(node.id.name);
  } else if (node.type === "ClassDeclaration" && node.id) {
    topLevel.add(node.id.name);
  } else if (node.type === "VariableDeclaration") {
    for (const d of node.declarations) collectPatternNames(d.id, topLevel);
  } else if (node.type === "ExportNamedDeclaration" && node.declaration) {
    const d = node.declaration;
    if (d.type === "FunctionDeclaration" && d.id) topLevel.add(d.id.name);
    else if (d.type === "VariableDeclaration") for (const v of d.declarations) collectPatternNames(v.id, topLevel);
  }
}

// 2. 逐函数求自由变量
function analyzeFunction(fnNode) {
  const bindings = new Set();
  const refs = new Map();
  const skip = new Set();
  const addPattern = (node) => collectPatternNames(node, bindings);
  const markSkipPattern = (node) => {
    if (!node) return;
    if (node.type === "Identifier") skip.add(node);
    else if (node.type === "ObjectPattern") for (const p of node.properties) markSkipPattern(p.value);
    else if (node.type === "ArrayPattern") for (const e of node.elements) if (e) markSkipPattern(e);
    else if (node.type === "AssignmentPattern") markSkipPattern(node.left);
    else if (node.type === "RestElement") markSkipPattern(node.argument);
  };

  // 必须前序：父节点先于子节点。acorn-walk 的 walk.full 是后序，
  // skip/bindings 标记会晚一步，把局部变量和属性名全误判成外部引用（结果是 0 个叶子）。
  const walkPre = (node, visit) => {
    if (!node || typeof node.type !== "string") return;
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "loc" || key === "range" || key === "start" || key === "end") continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const v of val) if (v && typeof v.type === "string") walkPre(v, visit);
      } else if (val && typeof val.type === "string") {
        walkPre(val, visit);
      }
    }
  };

  walkPre(fnNode, (node) => {
    switch (node.type) {
      case "MemberExpression":
        if (!node.computed && node.property.type === "Identifier") skip.add(node.property);
        break;
      case "Property":
        if (!node.computed && node.key.type === "Identifier") skip.add(node.key);
        break;
      case "MethodDefinition":
      case "PropertyDefinition":
        if (!node.computed && node.key.type === "Identifier") skip.add(node.key);
        break;
      case "LabeledStatement": skip.add(node.label); break;
      case "BreakStatement":
      case "ContinueStatement": if (node.label) skip.add(node.label); break;
      case "VariableDeclarator": addPattern(node.id); markSkipPattern(node.id); break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (node.id) { bindings.add(node.id.name); skip.add(node.id); }
        for (const p of node.params) { addPattern(p); markSkipPattern(p); }
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.id) { bindings.add(node.id.name); skip.add(node.id); }
        break;
      case "CatchClause":
        if (node.param) { addPattern(node.param); markSkipPattern(node.param); }
        break;
      case "Identifier":
        if (!skip.has(node) && !bindings.has(node.name)) {
          if (!refs.has(node.name)) refs.set(node.name, node.loc.start.line);
        }
        break;
      default: break;
    }
  });

  const names = [...refs.keys()];
  return {
    internalDeps: names.filter((n) => topLevel.has(n) && !imported.has(n)).sort(),
    externalDeps: names.filter((n) => imported.has(n)).sort(),
    unknownRefs: names.filter((n) => !topLevel.has(n) && !GLOBALS.has(n)).sort(),
  };
}

const results = [];
for (const node of ast.body) {
  if (node.type !== "FunctionDeclaration" || !node.id) continue;
  const start = node.loc.start.line;
  const end = node.loc.end.line;
  const r = analyzeFunction(node);
  const sources = [...new Set(r.externalDeps.map((n) => imported.get(n)))];
  results.push({
    name: node.id.name,
    start,
    end,
    size: end - start + 1,
    sources,
    sinkable: sources.every((s) => SINKABLE_BUILTINS.has(s)),
    ...r,
  });
}

const leaves = results.filter((r) => r.internalDeps.length === 0);
const safeLeaves = leaves.filter((r) => r.unknownRefs.length === 0);
const sinkableLeaves = safeLeaves.filter((r) => r.sinkable);
const lines = (arr) => arr.reduce((s, r) => s + r.size, 0);

console.log(`${path.relative(root, file)} 顶层函数 ${results.length} 个`);
console.log(`叶子函数（无内部依赖）${leaves.length} 个，约 ${lines(leaves)} 行`);
console.log(`  无未识别引用、可下沉      ${safeLeaves.length} 个，约 ${lines(safeLeaves)} 行`);
console.log(`  其中仅依赖 node 内置模块  ${sinkableLeaves.length} 个，约 ${lines(sinkableLeaves)} 行  ← sink-functions.mjs 可直接处理`);

const list = flags.has("--sinkable") ? sinkableLeaves : safeLeaves;
const limit = Number(process.env.LIMIT || 30);
console.log(`\n=== 候选 Top ${Math.min(limit, list.length)}（按行数降序）===`);
for (const r of list.slice(0, limit)) {
  const ext = r.externalDeps.length ? `  [import: ${r.externalDeps.join(", ")}]` : "";
  const mark = r.sinkable ? " " : "!";
  console.log(`${mark}${String(r.size).padStart(4)} 行  L${String(r.start).padStart(5)}  ${r.name}${ext}`);
}
if (!flags.has("--sinkable")) {
  console.log("\n（行首 ! 表示依赖项目内模块，下沉需手工补 import）");
}

// 按「依赖哪些 import 来源」分组。同组函数下沉到同一个目标模块时，
// 整组的 import 清单是一样的 —— 用它来决定往哪儿沉最省事：
// 若某组只依赖 ./lib/format.js，直接沉进 format.js 就一个 import 都不用加。
if (flags.has("--group")) {
  console.log(`\n=== 按依赖来源分组（可下沉 ${safeLeaves.length} 个 / ${lines(safeLeaves)} 行）===`);
  const groups = new Map();
  for (const r of safeLeaves) {
    const key = r.sources.length ? r.sources.join(" + ") : "(无 import 依赖)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [key, list] of [...groups.entries()].sort((a, b) => lines(b[1]) - lines(a[1]))) {
    console.log(`\n### ${key}  (${list.length} 个 / ${lines(list)} 行)`);
    for (const r of list.sort((a, b) => b.size - a.size)) {
      console.log(`  ${String(r.size).padStart(4)} 行 L${String(r.start).padStart(5)}  ${r.name}  → ${r.externalDeps.join(", ")}`);
    }
  }
}

console.log(`\n=== 有内部依赖、不能单独下沉的最大 15 个 ===`);
const nonLeaf = results.filter((r) => r.internalDeps.length > 0).sort((a, b) => b.size - a.size);
for (const r of nonLeaf.slice(0, 15)) {
  console.log(`${String(r.size).padStart(4)} 行  L${String(r.start).padStart(5)}  ${r.name}  → ${r.internalDeps.slice(0, 6).join(", ")}${r.internalDeps.length > 6 ? " ..." : ""}`);
}

// --deps 模式：输出所有非叶子函数的 name → internalDeps（供簇分析脚本消费）
if (flags.has("--deps")) {
  console.log("\n=== ALL_NONLEAF_DEPS ===");
  for (const r of nonLeaf) {
    console.log(`${r.name}\t${r.internalDeps.join(",")}`);
  }
}
