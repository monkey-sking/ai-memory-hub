#!/usr/bin/env node
// deps 注入完整性检查（v3.0 重构守卫）
//
// 命令族群拆到 src/commands/*.js 后，横切依赖全部走 deps 注入。漏传一个字段
// 就会在运行时炸出 "Cannot read properties of undefined (reading 'xxx')"，
// 而且只有跑到那条命令才会暴露。本脚本静态检查两类问题：
//
//   1. missing            — 模块用到的 deps.X 不在 index.js 对应的 *CommandDeps 对象里
//   2. call-missing-deps  — 跨模块调用命令函数时压根没传第二个 deps 参数
//   3. call-insufficient  — 传了 deps，但被调函数需要的字段没给全
//
// 用法: node scripts/refactor/check-deps.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const indexPath = path.join(root, "src", "index.js");
const cmdDir = path.join(root, "src", "commands");
const JS_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "typeof", "function", "new", "await"]);

function findMatchingBrace(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(body) {
  const items = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      items.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) items.push(cur);
  return items;
}

function parseObjectFields(body) {
  const fields = new Set();
  for (const raw of splitTopLevel(body)) {
    const item = raw.trim();
    if (!item) continue;
    let m = item.match(/^get\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) { fields.add(m[1]); continue; }
    m = item.match(/^'([^']+)'\s*:/) || item.match(/^"([^"]+)"\s*:/);
    if (m) { fields.add(m[1]); continue; }
    m = item.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (m) { fields.add(m[1]); continue; }
    m = item.match(/^([A-Za-z_$][\w$]*)$/);
    if (m) { fields.add(m[1]); continue; }
  }
  return fields;
}

// 按 export function 切分一个模块，得到每个函数的名字、行范围和函数体
function parseExportedFunctions(src) {
  const lines = src.split("\n");
  const starts = [];
  lines.forEach((line, i) => {
    const m = line.match(/^export function\s+([A-Za-z_$][\w$]*)/);
    if (m) starts.push({ name: m[1], line: i });
  });
  return starts.map((s, idx) => {
    const endLine = idx + 1 < starts.length ? starts[idx + 1].line : lines.length;
    return { name: s.name, startLine: s.line + 1, endLine, body: lines.slice(s.line, endLine).join("\n") };
  });
}

function collectDepsUse(body) {
  const used = new Set();
  const re = /\bdeps\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(body)) !== null) used.add(m[1]);
  return used;
}

// 找出函数体中对其他模块导出命令函数的调用，以及第二个实参（deps）的形式
function collectCalls(body, knownFuncs) {
  const calls = [];
  // 双参数：name(arg1, depsExpr)
  const two = /(?:^|[^\w$.])(?:deps\.)?([A-Za-z_$][\w$]*)\(\s*[^(),]*?\s*,\s*(deps(?:\.[A-Za-z_$][\w$]*)?|\{[^}]*\})\s*\)/g;
  let m;
  while ((m = two.exec(body)) !== null) {
    const name = m[1];
    if (JS_KEYWORDS.has(name) || !knownFuncs.has(name)) continue;
    const arg = m[2];
    calls.push({ name, arg, line: body.slice(0, m.index).split("\n").length });
  }
  // 单参数：name(arg1) —— 可能是漏传 deps
  const one = /(?:^|[^\w$.])(?:deps\.)?([A-Za-z_$][\w$]*)\(\s*[^(),]*?\s*\)/g;
  while ((m = one.exec(body)) !== null) {
    const name = m[1];
    if (JS_KEYWORDS.has(name) || !knownFuncs.has(name)) continue;
    if (calls.some((c) => c.name === name && Math.abs(c.line - body.slice(0, m.index).split("\n").length) === 0)) continue;
    calls.push({ name, arg: null, line: body.slice(0, m.index).split("\n").length });
  }
  return calls;
}

const indexSrc = fs.readFileSync(indexPath, "utf8");

// 1. index.js 里的 *Deps 对象
const depsObjects = new Map();
const depsRe = /const\s+([A-Za-z_$][\w$]*Deps)\s*=\s*\{/g;
let m;
while ((m = depsRe.exec(indexSrc)) !== null) {
  const open = m.index + m[0].length - 1;
  const close = findMatchingBrace(indexSrc, open);
  if (close < 0) continue;
  depsObjects.set(m[1], parseObjectFields(indexSrc.slice(open + 1, close)));
}

// 2. index.js 从 ./commands/*.js 导入的命令函数
const moduleCommands = new Map();
const importRe = /import\s*\{([^}]+)\}\s*from\s*"\.\/commands\/([^"]+)\.js"/g;
while ((m = importRe.exec(indexSrc)) !== null) {
  const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
  if (!moduleCommands.has(m[2])) moduleCommands.set(m[2], []);
  moduleCommands.get(m[2]).push(...names);
}

// 3. 解析所有命令模块
const moduleFiles = fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js")).sort();
const modules = new Map();
for (const file of moduleFiles) {
  const base = file.replace(/\.js$/, "");
  const src = fs.readFileSync(path.join(cmdDir, file), "utf8");
  const funcs = parseExportedFunctions(src).map((f) => ({ ...f, used: collectDepsUse(f.body) }));
  const moduleUsed = new Set();
  for (const f of funcs) for (const u of f.used) moduleUsed.add(u);
  modules.set(base, { base, file, src, funcs, moduleUsed });
}

// 函数名 -> 所属模块
const funcToModule = new Map();
for (const [base, mod] of modules) {
  for (const f of mod.funcs) funcToModule.set(f.name, base);
}

// 4. 求 deps 需求的传递闭包。
// 很多命令函数是 dispatcher：自己不用 deps.xxx，只是把 deps 原样转给子函数。
// 只算函数自身引用会漏掉整条调用链上的真实需求，所以沿「传 deps 本身」的调用边扩散。
const needKey = (base, fn) => `${base}#${fn}`;
const needMap = new Map();
for (const [base, mod] of modules) {
  for (const f of mod.funcs) needMap.set(needKey(base, f.name), new Set(f.used));
}
const forwardEdges = [];
for (const [base, mod] of modules) {
  for (const fn of mod.funcs) {
    for (const call of collectCalls(fn.body, funcToModule)) {
      const toBase = funcToModule.get(call.name);
      if (call.arg === "deps") forwardEdges.push([needKey(base, fn.name), needKey(toBase, call.name)]);
    }
  }
}
let changed = true;
while (changed) {
  changed = false;
  for (const [from, to] of forwardEdges) {
    const src = needMap.get(from);
    const dst = needMap.get(to);
    if (!src || !dst) continue;
    for (const d of dst) {
      if (!src.has(d)) { src.add(d); changed = true; }
    }
  }
}
const needOf = (base, fn) => needMap.get(needKey(base, fn)) || new Set();

const findings = [];

// 5a. index.js 直接装配的命令：deps 需求必须在对应 *CommandDeps 对象里
for (const [base, mod] of modules) {
  const commands = moduleCommands.get(base) || [];
  if (commands.length === 0) continue;
  const available = new Set();
  const relevant = [];
  for (const cmd of commands) {
    const depsName = cmd.endsWith("Command") ? cmd + "Deps" : cmd + "CommandDeps";
    if (depsObjects.has(depsName)) {
      relevant.push(depsName);
      for (const f of depsObjects.get(depsName)) available.add(f);
    }
  }
  if (relevant.length === 0) continue;
  for (const fn of mod.funcs) {
    if (!commands.includes(fn.name)) continue;
    for (const want of needOf(base, fn.name)) {
      if (!available.has(want)) {
        findings.push({
          kind: "missing",
          file: mod.file,
          detail: `${fn.name} 用到 deps.${want}，但 ${relevant.join("/")} 未提供`,
          line: fn.startLine,
        });
      }
    }
  }
}

// 5b. 跨模块调用：被调方需要的 deps 必须被传进去
for (const [base, mod] of modules) {
  for (const fn of mod.funcs) {
    for (const call of collectCalls(fn.body, funcToModule)) {
      const calleeModule = funcToModule.get(call.name);
      if (calleeModule === base) continue;
      const callee = modules.get(calleeModule).funcs.find((f) => f.name === call.name);
      const calleeNeed = needOf(calleeModule, call.name);
      if (!callee || calleeNeed.size === 0) continue;

      if (call.arg === null) {
        findings.push({
          kind: "call-missing-deps",
          file: mod.file,
          detail: `${fn.name} 调用 ${call.name}（${calleeModule}.js）时未传 deps，而它需要 ${[...calleeNeed].join(", ")}`,
          line: fn.startLine + call.line - 1,
        });
        continue;
      }

      let provided;
      if (call.arg === "deps") {
        continue; // 整体传递，静态无法确定具体字段，跳过
      } else if (call.arg.startsWith("deps.")) {
        const objName = call.arg.slice(5);
        provided = depsObjects.get(objName);
        if (!provided) {
          findings.push({
            kind: "call-unknown-deps",
            file: mod.file,
            detail: `${fn.name} 调用 ${call.name} 时传入 deps.${objName}，但 index.js 未定义该对象`,
            line: fn.startLine + call.line - 1,
          });
          continue;
        }
      } else {
        provided = parseObjectFields(call.arg.slice(1, -1));
      }

      const short = [...calleeNeed].filter((u) => !provided.has(u));
      if (short.length > 0) {
        findings.push({
          kind: "call-insufficient",
          file: mod.file,
          detail: `${fn.name} 调用 ${call.name}（${calleeModule}.js）时缺少 ${short.join(", ")}`,
          line: fn.startLine + call.line - 1,
        });
      }
    }
  }
}

// 5. 报告
const order = { missing: 0, "call-missing-deps": 1, "call-insufficient": 2, "call-unknown-deps": 3 };
findings.sort((a, b) => (order[a.kind] - order[b.kind]) || a.file.localeCompare(b.file));

for (const f of findings) {
  console.log(`[${f.kind}] src/commands/${f.file}:${f.line}`);
  console.log(`  ${f.detail}`);
}

const injected = [...modules.values()].filter((m) => m.moduleUsed.size > 0).length;
console.log(`\n${"-".repeat(64)}`);
console.log(`扫描 ${moduleFiles.length} 个命令模块（${injected} 个使用 deps 注入），index.js 中 ${depsObjects.size} 个 *Deps 对象`);
console.log(findings.length === 0 ? "未发现 deps 注入问题" : `发现 ${findings.length} 处 deps 注入问题`);
process.exit(findings.length > 0 ? 1 : 0);
