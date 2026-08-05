import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeSkillId, normalizeSkillVersion } from "./shared-skills.js";

const IGNORED_NAMES = new Set([".git", "node_modules", "cache", "caches"]);

export async function readSkillPackManifest(root) {
  let packagePath = path.resolve(String(root || ""));
  for (;;) {
    const manifestPath = path.join(packagePath, "amh-pack.json");
    const raw = await fs.readFile(manifestPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (raw !== null) {
      let value;
      try {
        value = JSON.parse(raw);
      } catch (error) {
        throw new Error(`Invalid Skill pack manifest ${manifestPath}: ${error.message}`);
      }
      return normalizeSkillPackManifest(value, packagePath);
    }
    const parent = path.dirname(packagePath);
    if (parent === packagePath) return null;
    packagePath = parent;
  }
}

export function normalizeSkillPackManifest(value, root) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Skill pack manifest must be an object");
  const id = normalizeSkillId(value.id);
  const version = normalizeSkillVersion(value.version);
  if (!Array.isArray(value.skills) || !value.skills.length) throw new Error(`Skill pack ${id} must declare at least one skill`);
  const skills = value.skills.map((entry) => {
    const item = typeof entry === "string" ? { id: path.basename(entry), path: entry } : entry;
    if (!item || typeof item !== "object") throw new Error(`Invalid skill entry in pack ${id}`);
    const skillPath = safeRelativePath(item.path, root);
    return { id: normalizeSkillId(item.id || path.basename(skillPath)), path: skillPath };
  });
  const dependencies = normalizeDependencies(value.dependencies, id);
  const credentials = Array.isArray(value.credentials) ? value.credentials.map((entry) => {
    if (typeof entry === "string") return { id: entry };
    if (!entry || typeof entry !== "object" || !entry.id) throw new Error(`Invalid credential declaration in pack ${id}`);
    return { id: String(entry.id), envVar: entry.envVar ? String(entry.envVar) : "" };
  }) : [];
  return {
    id,
    version,
    name: String(value.name || id),
    description: String(value.description || ""),
    skills,
    dependencies,
    credentials,
    targets: Array.isArray(value.targets) ? value.targets.map(String) : [],
    root: path.resolve(root)
  };
}

export async function validateSkillPack(root) {
  const requestedPath = path.resolve(String(root || ""));
  const packagePath = (await readSkillPackManifest(requestedPath))?.root || requestedPath;
  const stat = await fs.stat(packagePath).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Skill pack directory not found: ${packagePath}`);
  const manifest = await readSkillPackManifest(packagePath);
  if (!manifest) throw new Error(`Skill pack must contain amh-pack.json: ${packagePath}`);
  const skills = [];
  for (const entry of manifest.skills) {
    const skillRoot = path.resolve(packagePath, entry.path);
    const skillFile = path.join(skillRoot, "SKILL.md");
    const content = await fs.readFile(skillFile, "utf8").catch(() => null);
    if (content === null) throw new Error(`Skill pack member must contain SKILL.md: ${entry.id}`);
    skills.push({ ...entry, root: skillRoot, skillFile, contentHash: hashText(content) });
  }
  const files = await listPackFiles(packagePath);
  return { valid: true, root: packagePath, manifest, skills, files, contentHash: await hashFiles(packagePath, files) };
}

export async function listPackFiles(root) {
  const packagePath = path.resolve(String(root || ""));
  const files = [];
  await walk(packagePath, packagePath, files);
  return files.sort((a, b) => a.localeCompare(b));
}

export function hashFiles(root, relativeFiles) {
  const hash = crypto.createHash("sha256");
  return Promise.all(relativeFiles.map(async (relativeFile) => ({ relativeFile, content: await fs.readFile(path.join(root, relativeFile)) }))).then((entries) => {
    for (const entry of entries.sort((a, b) => a.relativeFile.localeCompare(b.relativeFile))) {
      hash.update(entry.relativeFile, "utf8");
      hash.update("\0");
      hash.update(entry.content);
      hash.update("\0");
    }
    return `sha256:${hash.digest("hex")}`;
  });
}

function normalizeDependencies(value, packId) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Dependencies for pack ${packId} must be an array`);
  return value.map((entry) => {
    if (typeof entry === "string") return { id: normalizeSkillId(entry), constraint: "*" };
    if (!entry || typeof entry !== "object") throw new Error(`Invalid dependency in pack ${packId}`);
    return { id: normalizeSkillId(entry.id), constraint: String(entry.constraint || "*") };
  });
}

function safeRelativePath(value, root) {
  const relative = String(value || "").trim();
  if (!relative || path.isAbsolute(relative)) throw new Error(`Invalid Skill pack path: ${value}`);
  const resolved = path.resolve(root, relative);
  const base = `${path.resolve(root)}${path.sep}`;
  if (!resolved.startsWith(base)) throw new Error(`Skill pack path escapes package root: ${value}`);
  return relative.replaceAll("\\", "/");
}

async function walk(root, directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, files);
    else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll("\\", "/"));
  }
}

function hashText(value) {
  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
}
