#!/usr/bin/env node
// 读取 find-leaf-functions.mjs --deps 的输出，计算「自洽簇」。
// 自洽簇 = 一组互相（或单向）内部依赖的函数，且整组的外部 index.js 依赖
// 必须要么被组内覆盖，要么是叶子函数（可连带），要么依赖的是 import（lib）——
// 这样的组可整体从 index.js 搬到新模块或已有 lib 模块。
// 用法：NODE_PATH=<acorn> node scripts/refactor/find-leaf-functions.mjs --deps | node scripts/refactor/find-clusters.mjs
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const deps = new Map(); // name -> [internal deps]
let reading = false;
for await (const line of rl) {
  if (line === "=== ALL_NONLEAF_DEPS ===") { reading = true; continue; }
  if (!reading || !line.trim()) continue;
  const tab = line.indexOf("\t");
  if (tab < 0) continue;
  const name = line.slice(0, tab).trim();
  const depList = line.slice(tab + 1).split(",").map((s) => s.trim()).filter(Boolean);
  deps.set(name, depList);
}
const allNames = new Set(deps.keys());

// 闭包：从某函数出发，把其内部依赖（若也在 index.js 顶层函数集合里）全部并入。
function closure(start, seen = new Set()) {
  if (seen.has(start)) return seen;
  seen.add(start);
  for (const d of deps.get(start) || []) {
    if (allNames.has(d)) closure(d, seen);
  }
  return seen;
}

// 自洽判定：簇内每个成员的全部 internal deps，若指向 index.js 内其他函数，必须在簇内；
// 若指向叶子/已下沉（不在 allNames 里即已 import 或叶子），视为已满足。
function isSelfContained(members) {
  const memberSet = new Set(members);
  for (const m of members) {
    for (const d of deps.get(m) || []) {
      if (allNames.has(d) && !memberSet.has(d)) return false;
    }
  }
  return true;
}

const visited = new Set();
const clusters = [];
for (const name of allNames) {
  if (visited.has(name)) continue;
  const cl = closure(name);
  const members = [...cl].sort();
  for (const m of members) visited.add(m);
  clusters.push({ members, size: members.length, selfContained: isSelfContained(members) });
}
const seenKey = new Set();
const unique = clusters.filter((c) => {
  const k = c.members.join("|");
  if (seenKey.has(k)) return false;
  seenKey.add(k);
  return true;
});

const sc = unique.filter((c) => c.selfContained).sort((a, b) => b.size - a.size);
console.log(`非叶子函数 ${allNames.size} 个 → ${unique.length} 个连通簇`);
console.log(`自洽簇（可整体下沉） ${sc.length} 个:`);
for (const c of sc) {
  console.log(`\n[${c.size} 函数] ${c.members.join(", ")}`);
}
const nsc = unique.filter((c) => !c.selfContained).sort((a, b) => b.size - a.size);
console.log(`\n非自洽簇 ${nsc.length} 个（需先拆依赖或留在 index.js）:`);
for (const c of nsc.slice(0, 12)) {
  const memberSet = new Set(c.members);
  const external = [];
  for (const m of c.members) for (const d of deps.get(m) || []) if (allNames.has(d) && !memberSet.has(d) && !external.includes(d)) external.push(d);
  console.log(`[${c.size} 函数] ${c.members.join(", ")}`);
  console.log(`   未覆盖外部依赖: ${external.join(", ")}`);
}
