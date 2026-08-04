import fs from "node:fs/promises";
import path from "node:path";
import { normalizeSkillId, normalizeSkillVersion } from "./shared-skills.js";

export const PROJECT_SKILL_MANIFEST_VERSION = 1;

export async function loadProjectSkillManifest(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd());
  const file = path.join(root, ".amh", "skills.json");
  const value = await fs.readFile(file, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT") return { version: PROJECT_SKILL_MANIFEST_VERSION, skills: {}, targets: [] };
    throw new Error(`Invalid project Skill manifest ${file}: ${error.message}`);
  });
  return normalizeManifest(value, root);
}

export async function saveProjectSkillManifest(projectRoot, manifest) {
  const root = path.resolve(projectRoot || process.cwd());
  const normalized = normalizeManifest(manifest, root);
  const dir = path.join(root, ".amh");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "skills.json"), `${JSON.stringify({ version: normalized.version, skills: normalized.skills, targets: normalized.targets }, null, 2)}\n`, "utf8");
  return normalized;
}

export async function setProjectSkill(projectRoot, id, constraint = "*") {
  const manifest = await loadProjectSkillManifest(projectRoot);
  const skillId = normalizeSkillId(id);
  manifest.skills[skillId] = { constraint: normalizeConstraint(constraint), enabled: true };
  return saveProjectSkillManifest(projectRoot, manifest);
}

export async function removeProjectSkill(projectRoot, id) {
  const manifest = await loadProjectSkillManifest(projectRoot);
  delete manifest.skills[normalizeSkillId(id)];
  return saveProjectSkillManifest(projectRoot, manifest);
}

export function selectProjectSkills(manifest, packages) {
  const selected = [];
  for (const [id, entry] of Object.entries(manifest.skills || {})) {
    if (!entry?.enabled) continue;
    const candidates = packages.filter((item) => item.id === id && satisfies(item.version, entry.constraint));
    candidates.sort((a, b) => compareVersions(b.version, a.version) || String(a.contentHash).localeCompare(String(b.contentHash)));
    if (candidates[0]) selected.push(candidates[0]);
  }
  return selected;
}

function normalizeManifest(value, root) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Project Skill manifest must be an object");
  const skills = {};
  for (const [rawId, rawEntry] of Object.entries(value.skills || {})) {
    const id = normalizeSkillId(rawId);
    const entry = typeof rawEntry === "string" ? { constraint: rawEntry, enabled: true } : rawEntry || {};
    skills[id] = { constraint: normalizeConstraint(entry.constraint || "*"), enabled: entry.enabled !== false };
  }
  return { projectRoot: root, version: Number(value.version || PROJECT_SKILL_MANIFEST_VERSION), skills, targets: Array.isArray(value.targets) ? value.targets.map(String) : [] };
}

function normalizeConstraint(value) {
  const constraint = String(value || "*").trim();
  if (constraint !== "*" && !/^(?:\^|~)?\d+\.\d+\.\d+$/.test(constraint)) throw new Error(`Invalid Skill version constraint: ${value}`);
  return constraint;
}

function satisfies(version, constraint = "*") {
  if (constraint === "*") return true;
  const actual = parseVersion(version);
  const wanted = parseVersion(constraint.replace(/^[~^]/, ""));
  if (!actual || !wanted) return false;
  if (constraint.startsWith("^")) return actual[0] === wanted[0] && compareVersions(actual, wanted) >= 0;
  if (constraint.startsWith("~")) return actual[0] === wanted[0] && actual[1] === wanted[1] && compareVersions(actual, wanted) >= 0;
  return compareVersions(actual, wanted) === 0;
}

function compareVersions(a, b) {
  const left = Array.isArray(a) ? a : parseVersion(a);
  const right = Array.isArray(b) ? b : parseVersion(b);
  for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

function parseVersion(value) {
  const match = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}
