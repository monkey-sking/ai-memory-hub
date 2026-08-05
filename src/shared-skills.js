import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { validateSkillPack } from "./shared-skill-pack.js";
import { PROTECTED_SKILL_IDS } from "./shared-skill-scan.js";

export const SKILL_REGISTRY_VERSION = 1;
const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function normalizeSkillId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!SKILL_ID_PATTERN.test(id)) throw new Error(`Invalid skill id: ${value}`);
  return id;
}

export function normalizeSkillVersion(value = "1.0.0") {
  const version = String(value || "").trim();
  if (!VERSION_PATTERN.test(version)) throw new Error(`Invalid skill version: ${value}`);
  return version;
}

export function hashSkillContent(content) {
  return `sha256:${crypto.createHash("sha256").update(String(content), "utf8").digest("hex")}`;
}

export async function hashSkillPackage(root) {
  const files = [];
  await collectSkillFiles(path.resolve(String(root || "")), path.resolve(String(root || "")), files);
  const hash = crypto.createHash("sha256");
  for (const file of files.sort((a, b) => a.relative.localeCompare(b.relative))) {
    hash.update(file.relative, "utf8");
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function validateSkillPackage(sourcePath) {
  const root = path.resolve(String(sourcePath || ""));
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Skill directory not found: ${root}`);
  const skillFile = path.join(root, "SKILL.md");
  const content = await fs.readFile(skillFile, "utf8").catch(() => {
    throw new Error(`Skill package must contain SKILL.md: ${root}`);
  });
  const inferredId = path.basename(root).toLowerCase();
  const id = normalizeSkillId(inferredId);
  return { valid: true, id, root, skillFile, content, contentHash: await hashSkillPackage(root) };
}

export async function readSkillPackage(packagePath) {
  const metadata = JSON.parse(await fs.readFile(path.join(packagePath, "skill.json"), "utf8"));
  return {
    id: metadata.id,
    version: metadata.version,
    contentHash: metadata.contentHash,
    packagePath: path.resolve(packagePath)
  };
}

export async function importSharedSkill(memoryDir, sourcePath, metadata = {}) {
  const validation = await validateSkillPackage(sourcePath);
  const id = normalizeSkillId(metadata.id || validation.id);
  if (PROTECTED_SKILL_IDS.has(id)) throw new Error(`Skill ${id} is protected and cannot be imported into the AMH registry`);
  const version = normalizeSkillVersion(metadata.version || "1.0.0");
  const registryRoot = path.join(path.resolve(memoryDir), "skill-store");
  const packageBase = path.join(registryRoot, "packages", id, version);
  const existingPath = path.join(packageBase, "skill.json");
  const existing = await fs.readFile(existingPath, "utf8").then(JSON.parse).catch(() => null);
  if (existing?.contentHash === validation.contentHash) {
    return { ...existing, packagePath: packageBase, registryVersion: SKILL_REGISTRY_VERSION, reused: true };
  }

  const suffix = existing ? `-${validation.contentHash.slice("sha256:".length, "sha256:".length + 12)}` : "";
  const packagePath = `${packageBase}${suffix}`;
  await fs.mkdir(packagePath, { recursive: true });
  await copyTree(validation.root, packagePath);
  const record = {
    registryVersion: SKILL_REGISTRY_VERSION,
    id,
    version,
    contentHash: validation.contentHash,
    packagePath,
    source: metadata.source || { kind: "local", location: path.resolve(sourcePath) },
    importedAt: new Date().toISOString(),
    status: "installed",
    conflict: Boolean(existing)
  };
  await fs.writeFile(path.join(packagePath, "skill.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(packagePath, "provenance.json"), `${JSON.stringify({ source: record.source, importedAt: record.importedAt, contentHash: record.contentHash }, null, 2)}\n`, "utf8");
  await appendRegistryEvent(registryRoot, { action: "import", package: record });
  return record;
}

export async function importSharedPack(memoryDir, sourcePath, metadata = {}) {
  const validation = await validateSkillPack(sourcePath);
  const protectedMember = validation.skills.find((member) => PROTECTED_SKILL_IDS.has(member.id));
  if (protectedMember) throw new Error(`Skill ${protectedMember.id} is protected and cannot be imported into the AMH registry`);
  const registryRoot = path.join(path.resolve(memoryDir), "skill-store");
  const packageBase = path.join(registryRoot, "packs", validation.manifest.id, validation.manifest.version);
  const packageManifestPath = path.join(packageBase, "pack.json");
  const existing = await fs.readFile(packageManifestPath, "utf8").then(JSON.parse).catch(() => null);
  if (existing?.contentHash !== validation.contentHash) {
    const suffix = existing ? `-${validation.contentHash.slice("sha256:".length, "sha256:".length + 12)}` : "";
    const target = `${packageBase}${suffix}`;
    await copyTree(validation.root, target);
    const record = {
      package: true,
      id: validation.manifest.id,
      version: validation.manifest.version,
      name: validation.manifest.name,
      description: validation.manifest.description,
      contentHash: validation.contentHash,
      packagePath: target,
      source: metadata.source || { kind: "local", location: path.resolve(sourcePath) },
      dependencies: validation.manifest.dependencies,
      credentials: validation.manifest.credentials.map(({ id, envVar }) => ({ id, envVar })),
      targets: validation.manifest.targets,
      skills: validation.skills.map(({ id, path: memberPath, contentHash }) => ({ id, path: memberPath, contentHash })),
      importedAt: new Date().toISOString(),
      status: "installed"
    };
    await fs.writeFile(path.join(target, "pack.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(target, "provenance.json"), `${JSON.stringify({ source: record.source, importedAt: record.importedAt, contentHash: record.contentHash }, null, 2)}\n`, "utf8");
    const members = [];
    for (const member of validation.skills) {
      members.push(await importSharedSkill(memoryDir, member.root, {
        id: member.id,
        version: validation.manifest.version,
        source: { kind: "pack", location: path.resolve(sourcePath), packId: record.id }
      }));
    }
    await appendRegistryEvent(registryRoot, { action: "pack-import", package: record });
    return { ...record, skills: members, reused: false };
  }
  return { ...existing, packagePath: path.dirname(packageManifestPath), reused: true };
}

export async function listSharedSkillPackages(memoryDir) {
  const root = path.join(path.resolve(memoryDir), "skill-store", "packages");
  const ids = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const packages = [];
  for (const idEntry of ids) {
    if (!idEntry.isDirectory()) continue;
    const versions = await fs.readdir(path.join(root, idEntry.name), { withFileTypes: true }).catch(() => []);
    for (const versionEntry of versions) {
      if (!versionEntry.isDirectory()) continue;
      const metadata = await fs.readFile(path.join(root, idEntry.name, versionEntry.name, "skill.json"), "utf8").then(JSON.parse).catch(() => null);
      if (metadata) packages.push({ ...metadata, packagePath: path.join(root, idEntry.name, versionEntry.name) });
    }
  }
  return packages.sort((a, b) => `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`));
}

export async function findSharedSkillPackage(memoryDir, id, version = "") {
  const normalized = normalizeSkillId(id);
  const packages = (await listSharedSkillPackages(memoryDir)).filter((item) => item.id === normalized);
  if (version) return packages.find((item) => item.version === version) || null;
  return packages.at(-1) || null;
}

async function appendRegistryEvent(registryRoot, event) {
  await fs.mkdir(registryRoot, { recursive: true });
  await fs.appendFile(path.join(registryRoot, "registry.jsonl"), `${JSON.stringify({ id: crypto.randomUUID(), ts: new Date().toISOString(), ...event })}\n`, "utf8");
}

async function copyTree(sourceRoot, targetRoot) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  await fs.mkdir(targetRoot, { recursive: true });
  for (const entry of entries) {
    if (isIgnoredSkillEntry(entry.name)) continue;
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    if (entry.isDirectory()) await copyTree(source, target);
    else if (entry.isFile()) await fs.copyFile(source, target);
  }
}

async function collectSkillFiles(root, directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (isIgnoredSkillEntry(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectSkillFiles(root, absolute, files);
    else if (entry.isFile()) files.push({ relative: path.relative(root, absolute).replaceAll("\\", "/"), content: await fs.readFile(absolute) });
  }
}

function isIgnoredSkillEntry(name) {
  return name === ".git" || name === "node_modules" || name === ".env" || name.startsWith(".env.") || /(?:credentials?|secrets?)\.(?:json|ya?ml|toml)$/i.test(name) || /\.(?:pem|key)$/i.test(name);
}
