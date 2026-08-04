import fs from "node:fs/promises";
import path from "node:path";

const IGNORED = new Set(["node_modules", ".git", "cache", "caches", "backups", "backup"]);

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
      results.push({ id, path: directory, skillFile, tool, contentHash: `sha256:${(await import("node:crypto")).createHash("sha256").update(content, "utf8").digest("hex")}`, ownership: marker ? "amh-managed" : "user" });
    });
  }
  const groups = new Map();
  for (const result of results) {
    const group = groups.get(result.id) || new Set();
    group.add(result.contentHash);
    groups.set(result.id, group);
  }
  return results.map((item) => ({ ...item, conflict: (groups.get(item.id)?.size || 0) > 1 }));
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
