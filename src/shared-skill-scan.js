import fs from "node:fs/promises";
import path from "node:path";

const IGNORED = new Set(["node_modules", ".git", "cache", "caches", "backups", "backup"]);
export const PROTECTED_SKILL_IDS = new Set(["ai-memory-hub"]);

export async function scanSkillRoots(roots = []) {
  const results = [];
  for (const entry of roots) {
    const root = path.resolve(typeof entry === "string" ? entry : entry.path);
    const tool = typeof entry === "string" ? "unknown" : String(entry.tool || "unknown");
    await walk(root, async (directory) => {
      const skillFile = path.join(directory, "SKILL.md");
      const content = await fs.readFile(skillFile, "utf8").catch(() => null);
      if (content === null) return;
      const id = path.basename(directory).toLowerCase();
      const marker = await fs.access(path.join(directory, ".amh-managed.json")).then(() => true).catch(() => false);
      const pack = await findContainingPack(directory, root);
      results.push({ id, path: directory, skillFile, tool, contentHash: `sha256:${(await import("node:crypto")).createHash("sha256").update(content, "utf8").digest("hex")}`, ownership: marker ? "amh-managed" : "user", protected: PROTECTED_SKILL_IDS.has(id), packageId: pack?.id || "", packageVersion: pack?.version || "", packagePath: pack?.path || "" });
    });
  }
  const groups = new Map();
  for (const result of results) {
    const group = groups.get(result.id) || new Set();
    group.add(result.contentHash);
    groups.set(result.id, group);
  }
  return results.map((item) => ({ ...item, protected: PROTECTED_SKILL_IDS.has(item.id), conflict: (groups.get(item.id)?.size || 0) > 1 }));
}

export function aggregateSkillSources(results = []) {
  const groups = new Map();
  for (const source of results) {
    const id = String(source.id || "").trim().toLowerCase();
    if (!id) continue;
    const group = groups.get(id) || {
      id,
      sources: [],
      contentHashes: [],
      sourceCount: 0,
      duplicateCount: 0,
      conflict: false,
      protected: PROTECTED_SKILL_IDS.has(id),
      variant: false,
      importable: !PROTECTED_SKILL_IDS.has(id),
      status: "discovered",
      packageId: source.packageId || ""
    };
    group.sources.push(source);
    if (source.packageId && !group.packageId) group.packageId = source.packageId;
    if (source.contentHash && !group.contentHashes.includes(source.contentHash)) group.contentHashes.push(source.contentHash);
    group.sourceCount = group.sources.length;
    group.duplicateCount = Math.max(0, group.sourceCount - group.contentHashes.length);
    group.conflict = group.contentHashes.length > 1;
    const hashSourceCounts = new Map();
    for (const item of group.sources) hashSourceCounts.set(item.contentHash, (hashSourceCounts.get(item.contentHash) || 0) + 1);
    group.variant = group.conflict && [...hashSourceCounts.values()].some((count) => count > 1);
    group.status = group.protected ? "protected" : group.variant ? "variant" : group.conflict ? "conflict" : group.duplicateCount > 0 ? "duplicate" : "discovered";
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function walk(directory, onDirectory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  if (!entries.length) return;
  await onDirectory(directory);
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED.has(entry.name.toLowerCase()) || entry.name.startsWith(".")) continue;
    await walk(path.join(directory, entry.name), onDirectory);
  }
}

async function findContainingPack(directory, scanRoot) {
  let current = path.resolve(directory);
  const boundary = path.resolve(scanRoot);
  while (current.startsWith(boundary)) {
    const manifestPath = path.join(current, "amh-pack.json");
    const manifest = await fs.readFile(manifestPath, "utf8").then(JSON.parse).catch(() => null);
    if (manifest?.id) return { id: String(manifest.id), version: String(manifest.version || ""), path: current };
    if (current === boundary) break;
    current = path.dirname(current);
  }
  return null;
}

export function defaultSkillRoots(home = process.env.USERPROFILE || process.env.HOME || "") {
  return [
    ["codex", path.join(home, ".codex", "skills")],
    ["agents", path.join(home, ".agents", "skills")],
    ["claude", path.join(home, ".claude", "skills")],
    ["gemini", path.join(home, ".gemini", "skills")],
    ["qclaw", path.join(home, ".qclaw", "skills")],
    ["openclaw", path.join(home, ".openclaw", "skills")],
    ["opencode", path.join(home, ".config", "opencode", "skills")],
    ["mimocode", path.join(home, ".config", "mimocode", "skills")]
  ].map(([tool, pathValue]) => ({ tool, path: pathValue }));
}
