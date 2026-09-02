// skill 候选与增量（delta）的 JSONL 事件存取（v3.0 重构 P0-2 第19批下沉）。
// 从 src/index.js 迁出，汇聚两类共享技能评审事件存储：
//   - candidates：skill candidate 发现结果（append/update/read）
//   - deltas：skill delta 评审流（approve/reject/merge/read/write）
// 仅依赖 node 内置 + lib/独立模块，不反向 import src/index.js。

import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "./paths.js";
import { ensureDir } from "./cli.js";
import { readEvents } from "./io.js";
import { writeFileAtomic } from "../atomic-write.js";

const SKILL_DELTA_FILE = "skill-deltas.jsonl";
const SKILL_CANDIDATE_FILE = "skill-candidates.jsonl";

// ---- candidates ----

function getSkillCandidatesFile(memoryDir) {
  return path.join(memoryDir, "prompts", SKILL_CANDIDATE_FILE);
}

export function readSkillCandidates(memoryDir) {
  const file = getSkillCandidatesFile(memoryDir);
  return fs.existsSync(file) ? readEvents(file) : [];
}

export function appendSkillCandidates(memoryDir, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const existing = readSkillCandidates(memoryDir);
  const existingIds = new Set(existing.map((candidate) => candidate.id));
  const fresh = candidates.filter((candidate) => !existingIds.has(candidate.id));
  if (fresh.length === 0) return [];
  const file = getSkillCandidatesFile(memoryDir);
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, fresh.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n", "utf8");
  return fresh;
}

export function updateSkillCandidate(memoryDir, id, updater) {
  const candidates = readSkillCandidates(memoryDir);
  const index = candidates.findIndex((candidate) => candidate.id === id || candidate.id.startsWith(id));
  if (index === -1) throw new Error(`Skill candidate not found: ${id}`);
  candidates[index] = updater(candidates[index]);
  const file = getSkillCandidatesFile(memoryDir);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, candidates.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n", "utf8");
  return candidates[index];
}

// ---- deltas ----

function getSkillDeltasFile(memoryDir) {
  return path.join(memoryDir, "prompts", SKILL_DELTA_FILE);
}

export function readSkillDeltas(memoryDir) {
  const file = getSkillDeltasFile(memoryDir);
  if (!fs.existsSync(file)) return [];
  return readEvents(file);
}

export function approveSkillDelta(memoryDir, id, reviewer) {
  const deltas = readSkillDeltas(memoryDir);
  const index = deltas.findIndex((d) => d.id === id || d.id.startsWith(id));
  if (index === -1) throw new Error(`Skill delta not found: ${id}`);
  deltas[index].status = "approved";
  deltas[index].reviewedBy = reviewer;
  deltas[index].reviewedAt = new Date().toISOString();
  writeSkillDeltas(memoryDir, deltas);
  return deltas[index];
}

export function rejectSkillDelta(memoryDir, id, reviewer, reason) {
  const deltas = readSkillDeltas(memoryDir);
  const index = deltas.findIndex((d) => d.id === id || d.id.startsWith(id));
  if (index === -1) throw new Error(`Skill delta not found: ${id}`);
  deltas[index].status = "rejected";
  deltas[index].reviewedBy = reviewer;
  deltas[index].reviewedAt = new Date().toISOString();
  if (reason) deltas[index].rejectReason = reason;
  writeSkillDeltas(memoryDir, deltas);
  return deltas[index];
}

export function mergeSkillDelta(memoryDir, id) {
  const deltas = readSkillDeltas(memoryDir);
  const index = deltas.findIndex((d) => d.id === id || d.id.startsWith(id));
  if (index === -1) throw new Error(`Skill delta not found: ${id}`);
  const delta = deltas[index];
  if (delta.status !== "approved") {
    throw new Error(`Delta must be approved before merging. Current status: ${delta.status}`);
  }

  // Find and update the skill template
  const toolName = delta.tool;
  // 注意：原实现在 index.js 里 `path.join(__dirname, "..", "templates")` 指向项目根 templates；
  // 迁到 src/lib 后 __dirname 层级变了，改用 projectRoot() 保持指向项目根 templates。
  const templateDir = path.join(projectRoot(), "templates");
  const possibleFiles = [
    path.join(templateDir, `${toolName.toUpperCase()}.md`),
    path.join(templateDir, `${toolName.toUpperCase()}_SKILL.md`),
    path.join(templateDir, "shared-skill-layer.md"),
    path.join(templateDir, "shared-instructions.md")
  ];

  let merged = false;
  for (const file of possibleFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (delta.original && content.includes(delta.original)) {
      const updated = content.replace(delta.original, delta.proposed);
      writeFileAtomic(file, updated, "utf8");
      delta.status = "merged";
      delta.mergedAt = new Date().toISOString();
      merged = true;
      break;
    }
  }

  if (!merged) {
    throw new Error(`Could not find original text in any template file for tool: ${toolName}`);
  }

  writeSkillDeltas(memoryDir, deltas);
  return delta;
}

export function writeSkillDeltas(memoryDir, deltas) {
  const file = getSkillDeltasFile(memoryDir);
  ensureDir(path.dirname(file));
  const lines = deltas.map((d) => JSON.stringify(d)).join("\n") + "\n";
  writeFileAtomic(file, lines, "utf8");
}
