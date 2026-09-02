// 公共 AST 扫描能力，供 check-undefined.mjs / fix-imports.mjs 共用。
// 两个工具对「什么是声明、什么是引用」的判定必须完全一致，否则会出现
// 一个报缺失、另一个补不上的情况，所以只保留一份实现。
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let acorn;
try {
  acorn = require("acorn");
} catch {
  console.error("需要 acorn：npm i -D acorn，或设置 NODE_PATH 指向含 acorn 的 node_modules");
  process.exit(1);
}

// 运行时确实存在的全局量：node 内置 + 语言内置 + 本项目注入的
export const KNOWN_GLOBALS = new Set([
  "console", "process", "Buffer", "URL", "URLSearchParams", "TextEncoder", "TextDecoder",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate",
  "queueMicrotask", "structuredClone", "AbortController", "AbortSignal", "Event", "EventTarget",
  "fetch", "Request", "Response", "Headers", "FormData", "Blob", "File",
  "globalThis", "global", "undefined", "NaN", "Infinity", "arguments", "this", "super", "Reflect",
  "JSON", "Math", "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt",
  "Date", "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "EvalError", "URIError",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURI", "decodeURI",
  "encodeURIComponent", "decodeURIComponent", "escape", "unescape", "eval",
  "Promise", "Map", "Set", "WeakMap", "WeakSet", "Proxy", "Intl", "WeakRef", "FinalizationRegistry",
  "ArrayBuffer", "SharedArrayBuffer", "Atomics", "DataView", "Uint8Array", "Int8Array",
  "Uint8ClampedArray", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array",
  "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
  "Intl", "Worker", "MessageChannel", "MessagePort",
  "ReadableStream", "WritableStream", "TransformStream",
  "require", "module", "exports", "__dirname", "__filename", "import",
  "structuredClone", "atob", "btoa", "crypto", "performance", "navigator",
]);

export function parseFile(file) {
  const code = fs.readFileSync(file, "utf8");
  return { code, ast: acorn.parse(code, { ecmaVersion: "latest", sourceType: "module", locations: true }) };
}

function collectPatternNames(node, out) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": out.add(node.name); break;
    case "ObjectPattern":
      for (const p of node.properties) collectPatternNames(p.type === "RestElement" ? p.argument : p.value, out);
      break;
    case "ArrayPattern": for (const e of node.elements) collectPatternNames(e, out); break;
    case "AssignmentPattern": collectPatternNames(node.left, out); break;
    case "RestElement": collectPatternNames(node.argument, out); break;
    default: break;
  }
}

// 形参是声明不是引用。默认值里的表达式（如 `a = someGlobal()`）仍是引用，
// 交给 collectPatternNames 递归处理。漏掉这条会有上百个误报。
function declareParams(node, declare) {
  for (const p of node.params || []) declare(p);
}

/**
 * 前序遍历收集「声明的名字」和「引用的名字」。
 *
 * 必须自己写前序：acorn-walk 的 walk.full 是后序（先子节点后父节点），
 * 收集声明会晚一步，把局部变量和属性名全误判成外部引用。
 *
 * 判定策略：只报「整份文件里没有任何同名声明」的引用 —— 牺牲作用域精度
 * 换零误报，适合当门禁。
 */
export function collectIdentifiers(ast) {
  const declared = new Set();
  const refs = [];

  const declare = (node) => collectPatternNames(node, declared);

  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node.type !== "string") return;

    switch (node.type) {
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
        declareParams(node, declare);
        break;
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (node.id) declared.add(node.id.name);
        declareParams(node, declare);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.id) declared.add(node.id.name);
        break;
      case "VariableDeclarator":
        declare(node.id);
        break;
      case "CatchClause":
        declare(node.param);
        break;
      case "LabeledStatement":
        declared.add(node.label.name);
        break;
      case "Identifier":
        refs.push({ name: node.name, node });
        break;
      case "MetaProperty":
        break;
      default:
        break;
    }

    // import.meta / new.target 整体不是引用，连子节点一起跳过
    if (node.type === "MetaProperty") return;

    for (const key of Object.keys(node)) {
      if (["type", "loc", "range", "start", "end"].includes(key)) continue;
      const value = node[key];
      if (!value || typeof value !== "object") continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === "string") visit(child);
      } else if (typeof value.type === "string") {
        // 已在上 switch 里按声明处理过的子节点不要重复遍历
        if ((node.type === "MemberExpression") && (key === "object" || (key === "property" && !node.computed))) continue;
        if ((node.type === "Property") && key === "key" && !node.computed) continue;
        if ((node.type === "MethodDefinition" || node.type === "PropertyDefinition") && key === "key") continue;
        if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") && key === "params") continue;
        visit(value);
      }
    }
  };

  visit(ast.body);

  const problems = new Map();
  for (const ref of refs) {
    if (KNOWN_GLOBALS.has(ref.name)) continue;
    if (declared.has(ref.name)) continue;
    const line = ref.node.loc ? ref.node.loc.start.line : "?";
    if (!problems.has(ref.name)) problems.set(ref.name, new Set());
    problems.get(ref.name).add(line);
  }

  return { declared, refs, missing: problems };
}

// 收集一个文件导出的所有具名符号
export function collectExports(code) {
  const names = new Set();
  const patterns = [
    /^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
    /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+class\s+([A-Za-z_$][\w$]*)/gm,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code))) names.add(m[1]);
  }
  // export { a, b as c }
  for (const m of code.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

// 列出目录下的所有 .js 文件
export function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}
