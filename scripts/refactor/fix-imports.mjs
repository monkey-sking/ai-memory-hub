#!/usr/bin/env node
// 自动补齐下沉后缺失的 import（v3.0 重构 P0-2）
//
// sink-functions.mjs 只会自动补 node 内置模块（fs/path/os/crypto），
// 项目内模块（./lib/cli.js 的 createId、./lib/io.js 的 readEvents 等）要手工补。
// 一批几十个函数时手工补既慢又容易漏，这个脚本按名字反查导出它的模块，
// 生成 import 并插到文件顶部。
//
// 用法:
//   node scripts/refactor/fix-imports.mjs <文件...>      # 补指定文件
//   node scripts/refactor/fix-imports.mjs --all          # 扫 src/ 下所有 .js
//   node scripts/refactor/fix-imports.mjs --all --dry    # 只打印不落盘
//
// 前置：需要 acorn。
//
// 解析优先级：index.js 已有的同名 import > 唯一导出者 > src/lib/ 下的模块。
// 解析不到的名字会单独列出来，需要人工判断（多半是拼错或尚未下沉）。
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
const argv = process.argv.slice(2);
const all = argv.includes("--all");
const dry = argv.includes("--dry");
const files = argv.filter((a) => !a.startsWith("--"));

// node 内置：名字 -> { source, named }
const BUILTINS = {
  fs: { source: "node:fs", default: true },
  path: { source: "node:path", default: true },
  os: { source: "node:os", default: true },
  crypto: { source: "node:crypto", default: true },
  http: { source: "node:http", default: true },
  spawnSync: { source: "node:child_process", named: true },
  execSync: { source: "node:child_process", named: true },
  spawn: { source: "node:child_process", named: true },
  execFileSync: { source: "node:child_process", named: true },
  fileURLToPath: { source: "node:url", named: true },
};

function listJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listJs(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

// ---- 1. 收集 index.js 的 import 映射（名字 -> 来源），优先级最高 ----
const indexPath = path.join(root, "src", "index.js");
const indexSrc = fs.readFileSync(indexPath, "utf8");
const indexImportOf = new Map();
{
  const ast = acorn.parse(indexSrc, { ecmaVersion: "latest", sourceType: "module" });
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration") continue;
    for (const spec of node.specifiers) {
      if (spec.type !== "ImportSpecifier" && spec.type !== "ImportDefaultSpecifier") continue;
      indexImportOf.set(spec.local.name, node.source.value);
    }
  }
}

// ---- 2. 收集全项目导出（名字 -> 模块绝对路径列表）----
const exportsOf = new Map();
for (const file of listJs(path.join(root, "src"))) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });
  } catch {
    continue;
  }
  const add = (name) => {
    if (!exportsOf.has(name)) exportsOf.set(name, new Set());
    exportsOf.get(name).add(file);
  };
  for (const node of ast.body) {
    if (node.type === "ExportNamedDeclaration" && node.declaration) {
      const d = node.declaration;
      if (d.type === "FunctionDeclaration" && d.id) add(d.id.name);
      else if (d.type === "VariableDeclaration") {
        for (const v of d.declarations) {
          if (v.id.type === "Identifier") add(v.id.name);
        }
      }
    } else if (node.type === "ExportNamedDeclaration" && node.specifiers) {
      for (const s of node.specifiers) if (s.exported) add(s.exported.name ?? s.local.name);
    }
  }
}

function relModule(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

function resolveSource(name, fromFile) {
  if (BUILTINS[name]) return { source: BUILTINS[name].source, default: !!BUILTINS[name].default, named: BUILTINS[name].named };
  if (indexImportOf.has(name)) {
    // index.js 的来源以 src/index.js 为基准，换算成目标文件的相对路径
    const abs = path.resolve(path.join(root, "src"), indexImportOf.get(name));
    return { source: relModule(fromFile, abs) };
  }
  const mods = exportsOf.get(name);
  if (!mods || mods.size === 0) return null;
  if (mods.size === 1) return { source: relModule(fromFile, [...mods][0]) };
  const inLib = [...mods].filter((m) => m.includes(`${path.sep}lib${path.sep}`));
  const pick = inLib[0] || [...mods][0];
  return { source: relModule(fromFile, pick), ambiguous: [...mods].map((m) => path.relative(root, m)) };
}

// ---- 3. 逐文件处理 ----
const targets = all ? listJs(path.join(root, "src")) : files.map((f) => path.resolve(root, f));
if (targets.length === 0) {
  console.error("用法: node scripts/refactor/fix-imports.mjs <文件...> | --all [--dry]");
  process.exit(1);
}

let totalAdded = 0;
let totalUnresolved = 0;

for (const file of targets) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (err) {
    console.log(`✗ ${path.relative(root, file)}: 解析失败 ${err.message}`);
    continue;
  }

  // 模块级绑定：顶层声明 + import
  const moduleLevel = new Set();
  const collectNames = (n, out) => {
    if (!n) return;
    if (n.type === "Identifier") out.add(n.name);
    else if (n.type === "ObjectPattern") for (const p of n.properties) collectNames(p.type === "RestElement" ? p.argument : p.value, out);
    else if (n.type === "ArrayPattern") for (const e of n.elements) collectNames(e, out);
    else if (n.type === "AssignmentPattern") collectNames(n.left, out);
    else if (n.type === "RestElement") collectNames(n.argument, out);
  };
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      for (const s of node.specifiers) moduleLevel.add(s.local.name);
    } else if (node.type === "FunctionDeclaration" && node.id) {
      moduleLevel.add(node.id.name);
    } else if (node.type === "ClassDeclaration" && node.id) {
      moduleLevel.add(node.id.name);
    } else if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) collectNames(d.id, moduleLevel);
    }
  }

  const GLOBALS = new Set([
    "console", "process", "Buffer", "URL", "URLSearchParams", "Set", "Map", "JSON", "Math", "Date",
    "Object", "Array", "String", "Number", "Boolean", "Error", "TypeError", "RangeError", "SyntaxError",
    "EvalError", "ReferenceError", "Promise", "RegExp", "Symbol", "WeakMap", "WeakSet", "Intl",
    "AbortController", "AbortSignal", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "setImmediate", "queueMicrotask", "structuredClone", "undefined", "NaN", "Infinity", "global",
    "__dirname", "__filename", "arguments", "this", "super", "decodeURIComponent", "encodeURIComponent",
    "parseInt", "parseFloat", "isNaN", "isFinite", "Reflect", "Proxy", "BigInt", "TextEncoder",
    "TextDecoder", "fetch", "crypto", "globalThis", "AbortController", "Worker", "MessageChannel",
  ]);

  // 逐个函数求自由变量（作用域精确）。
  // 千万别用「整份文件有同名就算已声明」的偷懒判定：util.js 里
  // writeTaskSpecProcessLogs(projectRoot, ...) 把 projectRoot 当形参名，
  // 会让同一文件里 getDirectResolveCandidates 真正缺失的 projectRoot import
  // 被判成已声明 —— 漏补，运行时才炸 ReferenceError。
  function freeVariables(fnNode) {
    const bindings = new Set();
    const refs = new Map();
    const skip = new Set();
    const addPattern = (pattern) => {
      collectNames(pattern, bindings);
      const mark = (p) => {
        if (!p) return;
        if (p.type === "Identifier") skip.add(p);
        else if (p.type === "ObjectPattern") for (const q of p.properties) mark(q.value);
        else if (p.type === "ArrayPattern") for (const e of p.elements) mark(e);
        else if (p.type === "AssignmentPattern") mark(p.left);
        else if (p.type === "RestElement") mark(p.argument);
      };
      mark(pattern);
    };
    const walk = (node, visit) => {
      if (!node || typeof node.type !== "string") return;
      visit(node);
      for (const key of Object.keys(node)) {
        if (["type", "loc", "range", "start", "end"].includes(key)) continue;
        const val = node[key];
        if (Array.isArray(val)) for (const v of val) if (v && typeof v.type === "string") walk(v, visit);
        else if (val && typeof val.type === "string") walk(val, visit);
      }
    };
    walk(fnNode, (node) => {
      switch (node.type) {
        case "MetaProperty": break;
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
        case "VariableDeclarator": addPattern(node.id); break;
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
          if (node.id) { bindings.add(node.id.name); skip.add(node.id); }
          for (const p of node.params) addPattern(p);
          break;
        case "ClassDeclaration":
        case "ClassExpression":
          if (node.id) { bindings.add(node.id.name); skip.add(node.id); }
          break;
        case "CatchClause": if (node.param) addPattern(node.param); break;
        case "Identifier":
          if (!skip.has(node) && !bindings.has(node.name) && !refs.has(node.name)) {
            refs.set(node.name, node.loc.start.line);
          }
          break;
        default: break;
      }
    });
    return refs;
  }

  const missing = new Map();
  for (const node of ast.body) {
    if (node.type === "FunctionDeclaration" && node.id) {
      for (const [name, line] of freeVariables(node)) if (!missing.has(name)) missing.set(name, line);
    } else if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "FunctionDeclaration") {
      for (const [name, line] of freeVariables(node.declaration)) if (!missing.has(name)) missing.set(name, line);
    } else if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) {
        if (d.init && (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression")) {
          for (const [name, line] of freeVariables(d.init)) if (!missing.has(name)) missing.set(name, line);
        }
      }
    }
  }
  for (const name of [...missing.keys()]) {
    if (moduleLevel.has(name) || GLOBALS.has(name)) missing.delete(name);
  }

  if (missing.size === 0) continue;

  // 按来源归组
  const bySource = new Map(); // source -> { named:Set, hasDefault:bool }
  const unresolved = [];
  for (const name of missing.keys()) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    const r = resolveSource(name, file);
    if (!r) { unresolved.push(name); continue; }
    if (!bySource.has(r.source)) bySource.set(r.source, { named: new Set(), hasDefault: false });
    const entry = bySource.get(r.source);
    if (r.default) entry.hasDefault = true;
    else entry.named.add(name);
  }

  if (bySource.size === 0) {
    if (unresolved.length) {
      console.log(`⚠ ${path.relative(root, file)}: 无法解析 ${unresolved.join(", ")}`);
      totalUnresolved += unresolved.length;
    }
    continue;
  }

  // 生成 import 行（跳过已 import 的符号）
  const lines = code.split("\n");
  const newImports = [];
  for (const [source, entry] of bySource) {
    const parts = [];
    if (entry.hasDefault) parts.push(source.split("/").pop().replace("node:", ""));
    if (entry.named.size) parts.push(`{ ${[...entry.named].sort().join(", ")} }`);
    newImports.push(`import ${parts.join(", ")} from "${source}";`);
  }

  // 插到最后一个 import 之后；没有则插到文件最前面（跳过 shebang）
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s+/.test(lines[i]) || (/^import\s*\{/.test(lines[i]) && !lines[i].includes("from"))) lastImport = i;
  }
  let insertAt = lastImport + 1;
  if (lastImport < 0) insertAt = lines[0].startsWith("#!") ? 1 : 0;
  lines.splice(insertAt, 0, ...newImports);

  const rel = path.relative(root, file);
  console.log(`${rel}: 补 ${[...missing.keys()].length} 个符号`);
  for (const line of newImports) console.log(`    ${line}`);
  if (unresolved.length) {
    console.log(`  ⚠ 无法解析: ${unresolved.join(", ")}`);
    totalUnresolved += unresolved.length;
  }
  totalAdded += newImports.length;
  if (!dry) fs.writeFileSync(file, lines.join("\n"));
}

console.log("\n----------------------------------------------------------------");
console.log(`新增 ${totalAdded} 行 import${totalUnresolved ? `，${totalUnresolved} 个符号无法解析` : ""}${dry ? "（--dry 未落盘）" : ""}`);
