import fs from "node:fs/promises";
import path from "node:path";
import { normalizeSkillId, normalizeSkillVersion } from "./shared-skills.js";

export const PROJECT_SKILL_MANIFEST_VERSION = 2;

export async function loadProjectSkillManifest(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd());
  const file = path.join(root, ".amh", "skills.json");
  const value = await fs.readFile(file, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT") return { version: PROJECT_SKILL_MANIFEST_VERSION, skills: {}, groups: {}, targets: [] };
    throw new Error(`Invalid project Skill manifest ${file}: ${error.message}`);
  });
  return normalizeManifest(value, root);
}

export async function saveProjectSkillManifest(projectRoot, manifest) {
  const root = path.resolve(projectRoot || process.cwd());
  const normalized = normalizeManifest(manifest, root);
  const dir = path.join(root, ".amh");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "skills.json"), `${JSON.stringify({
    version: normalized.version,
    skills: normalized.skills,
    groups: normalized.groups,
    targets: normalized.targets
  }, null, 2)}\n`, "utf8");
  return normalized;
}

export async function setProjectSkill(projectRoot, id, constraint = "*") {
  const manifest = await loadProjectSkillManifest(projectRoot);
  const skillId = normalizeSkillId(id);
  manifest.skills[skillId] = { constraint: normalizeConstraint(constraint), enabled: true };
  return saveProjectSkillManifest(projectRoot, manifest);
}

export async function disableProjectSkill(projectRoot, id) {
  const manifest = await loadProjectSkillManifest(projectRoot);
  const skillId = normalizeSkillId(id);
  manifest.skills[skillId] = { constraint: manifest.skills[skillId]?.constraint || "*", enabled: false };
  return saveProjectSkillManifest(projectRoot, manifest);
}

export async function selectProjectSkillVersion(projectRoot, id, constraint = "*") {
  return setProjectSkill(projectRoot, id, constraint);
}

export async function removeProjectSkill(projectRoot, id) {
  const manifest = await loadProjectSkillManifest(projectRoot);
  delete manifest.skills[normalizeSkillId(id)];
  return saveProjectSkillManifest(projectRoot, manifest);
}

export async function setProjectSkillGroup(projectRoot, id, skills, options = {}) {
  const manifest = await loadProjectSkillManifest(projectRoot);
  const groupId = normalizeGroupId(id);
  manifest.groups[groupId] = normalizeGroup({
    description: options.description || "",
    targets: options.targets || [],
    enabled: options.enabled !== false,
    skills
  });
  return saveProjectSkillManifest(projectRoot, manifest);
}

export async function setProjectSkillGroupEnabled(projectRoot, id, enabled) {
  const manifest = await loadProjectSkillManifest(projectRoot);
  const groupId = normalizeGroupId(id);
  if (!manifest.groups[groupId]) throw new Error(`Skill group not found: ${groupId}`);
  manifest.groups[groupId].enabled = Boolean(enabled);
  return saveProjectSkillManifest(projectRoot, manifest);
}

export async function removeProjectSkillGroup(projectRoot, id) {
  const manifest = await loadProjectSkillManifest(projectRoot);
  delete manifest.groups[normalizeGroupId(id)];
  return saveProjectSkillManifest(projectRoot, manifest);
}

export function selectProjectSkills(manifest, packages, target = "") {
  const selected = [];
  for (const id of projectSkillIds(manifest, target)) {
    const candidates = packages.filter((item) => item.id === id && constraintsForSkill(manifest, id, target).some((constraint) => satisfies(item.version, constraint)));
    candidates.sort((a, b) => compareVersions(b.version, a.version) || String(a.contentHash).localeCompare(String(b.contentHash)));
    if (candidates[0]) selected.push(candidates[0]);
  }
  return selected;
}

export function selectProjectSkillsForTargets(manifest, packages, targets = []) {
  const result = {};
  for (const rawTarget of targets) {
    const target = normalizeTarget(rawTarget);
    result[target] = selectProjectSkills(manifest, packages, target);
  }
  return result;
}

export function getSkillLifecycleState(manifest, packages, id) {
  const skillId = normalizeSkillId(id);
  const entry = manifest.skills?.[skillId] || Object.values(manifest.groups || {})
    .flatMap((group) => Object.keys(group.skills || {}).includes(skillId) ? [{ constraint: group.skills[skillId].constraint }] : [])[0] || null;
  const candidates = packages.filter((item) => item.id === skillId);
  const selected = selectProjectSkills(manifest, candidates)[0] || null;
  const versions = candidates.map((item) => item.version).sort(compareVersions);
  return {
    id: skillId,
    registryVersions: versions,
    selectedVersion: selected?.version || "",
    enabled: Boolean(selected),
    constraint: entry?.constraint || "*",
    updateAvailable: Boolean(selected && versions.some((version) => compareVersions(version, selected.version) > 0)),
    dependencyStatus: "unknown",
    projectionStatus: "unknown"
  };
}

function normalizeManifest(value, root) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Project Skill manifest must be an object");
  const skills = {};
  for (const [rawId, rawEntry] of Object.entries(value.skills || {})) {
    const id = normalizeSkillId(rawId);
    const entry = typeof rawEntry === "string" ? { constraint: rawEntry, enabled: true } : rawEntry || {};
    skills[id] = { constraint: normalizeConstraint(entry.constraint || "*"), enabled: entry.enabled !== false };
  }
  const groups = {};
  for (const [rawId, rawGroup] of Object.entries(value.groups || {})) {
    groups[normalizeGroupId(rawId)] = normalizeGroup(rawGroup);
  }
  return {
    projectRoot: root,
    version: Number(value.version || PROJECT_SKILL_MANIFEST_VERSION),
    skills,
    groups,
    targets: Array.isArray(value.targets) ? value.targets.map(String) : []
  };
}

function normalizeGroup(group) {
  if (!group || typeof group !== "object" || Array.isArray(group)) throw new Error("Skill group must be an object");
  const skills = {};
  const groupSkills = Array.isArray(group.skills)
    ? group.skills
    : Object.entries(group.skills || {}).map(([id, entry]) => ({ id, ...entry }));
  for (const item of groupSkills) {
    const entry = typeof item === "string" ? parseGroupSkill(item) : item || {};
    const id = normalizeSkillId(entry.id || entry.skill || "");
    if (!id) throw new Error("Skill group member requires a Skill id");
    if (skills[id]) throw new Error(`Duplicate Skill group member: ${id}`);
    skills[id] = { constraint: normalizeConstraint(entry.constraint || "*"), enabled: entry.enabled !== false };
  }
  return {
    description: String(group.description || ""),
    targets: Array.isArray(group.targets) ? group.targets.map(normalizeTarget).filter(Boolean) : [],
    enabled: group.enabled !== false,
    skills
  };
}

function parseGroupSkill(value) {
  const [id, constraint] = String(value || "").split("@");
  return { id, constraint: constraint || "*" };
}

function projectSkillIds(manifest, target = "") {
  const ids = new Set();
  for (const [id, entry] of Object.entries(manifest.skills || {})) {
    if (entry?.enabled) ids.add(id);
  }
  const normalizedTarget = normalizeTarget(target);
  for (const group of Object.values(manifest.groups || {})) {
    if (!group.enabled) continue;
    if (normalizedTarget && group.targets.length && !group.targets.includes(normalizedTarget)) continue;
    for (const [id, entry] of Object.entries(group.skills || {})) {
      if (entry.enabled) ids.add(id);
    }
  }
  return ids;
}

function constraintsForSkill(manifest, id, target = "") {
  const skillId = normalizeSkillId(id);
  const direct = manifest.skills?.[skillId];
  if (direct) return direct.enabled ? [direct.constraint] : [];

  const normalizedTarget = normalizeTarget(target);
  const constraints = [];
  for (const group of Object.values(manifest.groups || {})) {
    if (!group.enabled) continue;
    if (normalizedTarget && group.targets.length && !group.targets.includes(normalizedTarget)) continue;
    const entry = group.skills?.[skillId];
    if (entry?.enabled) constraints.push(entry.constraint);
  }
  return constraints.length ? constraints : ["*"];
}

function normalizeGroupId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new Error(`Invalid Skill group id: ${value}`);
  return id;
}

function normalizeTarget(value) {
  return String(value || "").trim().toLowerCase();
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
