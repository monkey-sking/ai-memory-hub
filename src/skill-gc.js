import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { listSharedSkillPackages } from "./shared-skills.js";
import { loadProjectSkillManifest, selectProjectSkills } from "./shared-skill-project.js";

const CONFIRM_TOKEN = "GC";

export async function planSkillGarbageCollection(memoryDir, projectRoot) {
  const packages = await listSharedSkillPackages(memoryDir);
  const manifest = await loadProjectSkillManifest(projectRoot);
  const selected = selectProjectSkills(manifest, packages);
  const protectedPaths = new Set(selected.map((item) => path.resolve(item.packagePath)));
  const protectedPackages = packages.filter((item) => protectedPaths.has(path.resolve(item.packagePath)));
  const candidates = packages.filter((item) => !protectedPaths.has(path.resolve(item.packagePath)));
  return {
    apply: false,
    memoryDir: path.resolve(memoryDir),
    projectRoot: path.resolve(projectRoot),
    manifestSkills: Object.entries(manifest.skills || {})
      .filter(([, entry]) => entry?.enabled)
      .map(([id, entry]) => ({ id, constraint: entry.constraint })),
    total: packages.length,
    protected: protectedPackages,
    candidates
  };
}

export async function applySkillGarbageCollection(memoryDir, projectRoot, options = {}) {
  if (options.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Skill GC apply requires confirm=${CONFIRM_TOKEN}.`);
  }
  const plan = await planSkillGarbageCollection(memoryDir, projectRoot);
  const operationId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  const packagesRoot = path.join(path.resolve(memoryDir), "skill-store", "packages");
  const backupRoot = path.join(path.resolve(memoryDir), "skill-store", "gc-backups", operationId);
  const removed = [];

  for (const item of plan.candidates) {
    const packagePath = assertPackagePath(packagesRoot, item.packagePath);
    const relative = path.relative(packagesRoot, packagePath);
    const backupPath = path.join(backupRoot, "packages", relative);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.cp(packagePath, backupPath, { recursive: true, errorOnExist: true });
    await fs.rm(packagePath, { recursive: true, force: false });
    removed.push({ ...item, relative, backupPath });
  }

  const operation = {
    operationId,
    createdAt: new Date().toISOString(),
    projectRoot: plan.projectRoot,
    protected: plan.protected,
    removed: removed.map(({ backupPath, ...item }) => item)
  };
  await fs.mkdir(backupRoot, { recursive: true });
  await fs.writeFile(path.join(backupRoot, "operation.json"), `${JSON.stringify(operation, null, 2)}\n`, "utf8");
  return { ...operation, backupRoot };
}

export async function rollbackSkillGarbageCollection(memoryDir, operationId) {
  const safeId = String(operationId || "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(safeId)) throw new Error(`Invalid Skill GC operation id: ${operationId}`);
  const memoryRoot = path.resolve(memoryDir);
  const backupRoot = path.join(memoryRoot, "skill-store", "gc-backups", safeId);
  const operation = JSON.parse(await fs.readFile(path.join(backupRoot, "operation.json"), "utf8"));
  const packagesRoot = path.join(memoryRoot, "skill-store", "packages");
  const restored = [];
  for (const item of operation.removed || []) {
    const relative = assertRelativePackagePath(item.relative);
    const target = path.join(packagesRoot, relative);
    const source = path.join(backupRoot, "packages", relative);
    if (await exists(target)) throw new Error(`Cannot rollback over existing package: ${target}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true, errorOnExist: true });
    restored.push({ ...item, packagePath: target });
  }
  return { operationId: safeId, restored, backupRoot };
}

function assertPackagePath(packagesRoot, packagePath) {
  const root = path.resolve(packagesRoot);
  const target = path.resolve(packagePath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Refusing to modify path outside Skill Registry: ${target}`);
  return target;
}

function assertRelativePackagePath(relative) {
  const value = String(relative || "");
  if (!value || path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) throw new Error(`Invalid Skill package path: ${relative}`);
  return value;
}

async function exists(target) {
  return Boolean(await fs.stat(target).catch(() => null));
}
