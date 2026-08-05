import fs from "node:fs/promises";
import path from "node:path";

const MARKER = ".amh-managed.json";

export async function syncSkillProjections(projectRoot, packages, targets = ["codex", "claude", "gemini", "antigravity"]) {
  const root = path.resolve(projectRoot || process.cwd());
  const results = [];
  for (const tool of targets) {
    const targetRoot = targetRootFor(root, tool);
    for (const pkg of packages) {
      const destination = path.join(targetRoot, pkg.id);
      const markerPath = path.join(destination, MARKER);
      const marker = await fs.readFile(markerPath, "utf8").then(JSON.parse).catch(() => null);
      if (marker && marker.contentHash !== pkg.contentHash) {
        results.push({ tool, id: pkg.id, state: "drifted", path: destination });
        continue;
      }
      const existing = await fs.stat(destination).catch(() => null);
      if (existing && !marker) {
        results.push({ tool, id: pkg.id, state: "conflict", path: destination });
        continue;
      }
      await copySkillPayload(pkg.packagePath, destination);
      await fs.writeFile(markerPath, `${JSON.stringify({ managedBy: "ai-memory-hub", id: pkg.id, version: pkg.version, contentHash: pkg.contentHash, packagePath: pkg.packagePath }, null, 2)}\n`, "utf8");
      results.push({ tool, id: pkg.id, state: marker ? "updated" : "created", path: destination });
    }
  }
  return results;
}

export async function doctorSkillProjections(projectRoot, packages, targets = ["codex", "claude", "gemini", "antigravity"]) {
  const root = path.resolve(projectRoot || process.cwd());
  const results = [];
  for (const tool of targets) {
    for (const pkg of packages) {
      const destination = path.join(targetRootFor(root, tool), pkg.id);
      const marker = await fs.readFile(path.join(destination, MARKER), "utf8").then(JSON.parse).catch(() => null);
      results.push({ tool, id: pkg.id, path: destination, state: !marker ? ((await fs.stat(destination).catch(() => null)) ? "conflict" : "missing") : marker.contentHash === pkg.contentHash ? "current" : "drifted" });
    }
  }
  return results;
}

function targetRootFor(projectRoot, tool) {
  const roots = { codex: [".agents", "skills"], agents: [".agents", "skills"], claude: [".claude", "skills"], gemini: [".gemini", "skills"], antigravity: [".gemini", "skills"], qclaw: [".qclaw", "skills"], opencode: [".config", "opencode", "skills"] };
  return path.join(projectRoot, ...(roots[tool] || [".amh", "skills", tool]));
}

async function copySkillPayload(sourceRoot, targetRoot) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  await fs.mkdir(targetRoot, { recursive: true });
  for (const entry of entries) {
    if (entry.name === "skill.json" || entry.name === "provenance.json" || isSensitiveSkillFile(entry.name)) continue;
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    if (entry.isDirectory()) await copySkillPayload(source, target);
    else if (entry.isFile()) await fs.copyFile(source, target);
  }
}

function isSensitiveSkillFile(name) {
  return name === ".env" || name.startsWith(".env.") || /(?:credentials?|secrets?)\.(?:json|ya?ml|toml)$/i.test(name) || /\.(?:pem|key)$/i.test(name);
}
