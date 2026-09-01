#!/usr/bin/env node
// 静态查找「引用了但没有声明」的标识符（v3.0 重构守卫）
//
// 为什么需要它：`node --check` 只查语法，不查名字解析。把函数从 src/index.js
// 下沉到 src/lib/*.js 之后，如果忘了把名字加回 import，语法完全合法，
// 只有真正跑到那行代码才会炸 ReferenceError。index.js 一万多行、几百个函数，
// 靠冒烟测试覆盖不全，所以需要静态扫描兜底。
//
// 用法：
//   node scripts/refactor/check-undefined.mjs                 # 默认扫 src/index.js
//   node scripts/refactor/check-undefined.mjs src/foo.js      # 扫指定文件
//   node scripts/refactor/check-undefined.mjs --all           # 扫 src/ 下所有 .js
//
// 误报处理：脚本只报「整份文件里都没有任何同名声明」的引用，属于偏保守的
// 判定（作用域遮蔽导致的同名冲突不会误报，但跨作用域的漏声明也不会漏报）。
// 若某个名字确实是运行时注入的全局量，加进下面的 KNOWN_GLOBALS。
//
// 注意：acorn-walk 的 walk.full 是后序遍历，收集声明会晚一步，
// 这里自己写前序遍历（踩过这个坑，详见 REFACTOR-V3-TODO.md）。
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

const args = process.argv.slice(2);
const scanAll = args.includes("--all");
const targets = args.filter((a) => !a.startsWith("--"));

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = scanAll
  ? listSourceFiles(path.join(root, "src"))
  : (targets.length ? targets : ["src/index.js"]).map((f) => path.resolve(root, f));

// 运行时确实存在的全局量：node 内置 + 语言内置 + 本项目注入的
const KNOWN_GLOBALS = new Set([
  "console", "process", "Buffer", "URL", "URLSearchParams", "TextEncoder", "TextDecoder",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate",
  "queueMicrotask", "structuredClone", "AbortController", "AbortSignal", "Event", "EventTarget",
  "fetch", "Request", "Response", "Headers", "FormData", "Blob", "File",
  "globalThis", "global", "undefined", "NaN", "Infinity", "arguments", "this", "super", "Reflect",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURI", "decodeURI",
  "encodeURIComponent", "decodeURIComponent", "escape", "unescape", "eval",
  "JSON", "Math", "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt",
  "Date", "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "EvalError", "URIError",
  "Promise", "Map", "Set", "WeakMap", "WeakSet", "Proxy", "Intl", "WeakRef", "FinalizationRegistry",
  "ArrayBuffer", "SharedArrayBuffer", "Atomics", "DataView", "Uint8Array", "Int8Array",
  "Uint8ClampedArray", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array",
  "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
  "require", "module", "exports", "__dirname", "__filename", "import",
  "structuredClone", "atob", "btoa", "crypto", "performance", "navigator",
  "Worker", "MessageChannel", "MessagePort", "ReadableStream", "WritableStream", "TransformStream",
]);

// 形参是声明而非引用。默认值里的表达式（如 `a = someGlobal()`）仍是引用，
// 交给 declarePattern 递归处理。
function declareParams(node, declarePattern) {
  for (const p of node.params || []) declarePattern(p);
}

// 收集：声明的名字 + 引用的名字
function collect(node, ctx) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, ctx);
    return;
  }
  if (typeof node.type !== "string") return;

  const declared = ctx.declared;
  const refs = ctx.refs;

  const declarePattern = (pat) => {
    if (!pat) return;
    switch (pat.type) {
      case "Identifier":
        declared.add(pat.name);
        break;
      case "ObjectPattern":
        for (const p of pat.properties) {
          if (p.type === "RestElement") declarePattern(p.argument);
          else declarePattern(p.value);
        }
        break;
      case "ArrayPattern":
        for (const el of pat.elements) declarePattern(el);
        break;
      case "AssignmentPattern":
        declarePattern(pat.left);
        collect(pat.right, ctx);
        break;
      case "RestElement":
        declarePattern(pat.argument);
        break;
      default:
        break;
    }
  };

  switch (node.type) {
    // ---- 声明 ----
    case "ImportDeclaration":
      for (const spec of node.specifiers || []) declared.add(spec.local.name);
      break;
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "ImportSpecifier":
      declared.add(node.local.name);
      break;
    case "FunctionDeclaration":
      if (node.id) declared.add(node.id.name);
      declareParams(node, declarePattern);
      break;
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      if (node.id) declared.add(node.id.name);
      declareParams(node, declarePattern);
      break;
    case "ClassDeclaration":
    case "ClassExpression":
      if (node.id) declared.add(node.id.name);
      break;
    case "VariableDeclarator":
      declarePattern(node.id);
      break;
    case "CatchClause":
      declarePattern(node.param);
      break;
    case "LabeledStatement":
      declared.add(node.label.name);
      break;
    case "MethodDefinition":
    case "PropertyDefinition":
      if (node.computed) collect(node.key, ctx);
      break;

    // ---- 引用 ----
    case "Identifier":
      refs.push({ name: node.name, node });
      break;

    // import.meta / new.target：meta、target 不是真正的标识符引用
    case "MetaProperty":
      break;

    // member expression：只把 object 当引用，property（非 computed）是属性名
    case "MemberExpression":
      collect(node.object, ctx);
      if (node.computed) collect(node.property, ctx);
      break;
    case "Property":
      if (node.computed) collect(node.key, ctx);
      collect(node.value, ctx);
      break;
    case "PropertyDefinition":
    case "MethodDefinition":
      break;
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration":
      break;

    default:
      break;
  }

  // import.meta / new.target 整体不是引用，直接跳过子节点
  if (node.type === "MetaProperty") return;

  // 前序遍历：先处理本节点，再递归子节点
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "range" || key === "start" || key === "end") continue;
    const value = node[key];
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === "string") collect(child, ctx);
    } else if (typeof value.type === "string") {
      // 已在上 switch 里按需处理过的子节点不要重复遍历
      if (node.type === "MemberExpression" && (key === "object" || (key === "property" && !node.computed))) continue;
      if ((node.type === "Property") && (key === "key" && !node.computed)) continue;
      if ((node.type === "MethodDefinition" || node.type === "PropertyDefinition") && key === "key") continue;
      // 形参已由 declareParams 声明过，不能再当引用收集（否则大量误报）
      if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") && key === "params") continue;
      collect(value, ctx);
    }
  }
}

let totalProblems = 0;
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (err) {
    console.error(`✗ ${path.relative(root, file)}: 解析失败 ${err.message}`);
    totalProblems++;
    continue;
  }

  const ctx = { declared: new Set(), refs: [] };
  collect(ast.body, ctx);

  const problems = new Map();
  for (const ref of ctx.refs) {
    if (KNOWN_GLOBALS.has(ref.name)) continue;
    if (ctx.declared.has(ref.name)) continue;
    const line = ref.node.loc ? ref.node.loc.start.line : "?";
    if (!problems.has(ref.name)) problems.set(ref.name, new Set());
    problems.get(ref.name).add(line);
  }

  const rel = path.relative(root, file);
  if (problems.size === 0) {
    console.log(`✓ ${rel}: 未发现未声明引用`);
    continue;
  }
  console.log(`\n${rel}: ${problems.size} 个未声明标识符`);
  for (const [name, lines] of [...problems.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const shown = [...lines].sort((a, b) => a - b).slice(0, 4);
    console.log(`  - ${name}  (行 ${shown.join(", ")}${lines.size > 4 ? ` …共 ${lines.size} 处` : ""})`);
  }
  totalProblems += problems.size;
}

console.log("\n----------------------------------------------------------------");
console.log(totalProblems === 0 ? "未发现未声明引用" : `共 ${totalProblems} 个未声明标识符`);
process.exit(totalProblems === 0 ? 0 : 1);
