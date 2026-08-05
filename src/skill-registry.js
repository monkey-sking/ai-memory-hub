import fs from "node:fs";
import path from "node:path";
import { getEnabledPacks } from "./domain-packs.js";

export function listSkills(memoryDir) {
  const roots = [path.join(memoryDir, "skills")];
  for (const pack of getEnabledPacks(memoryDir)) {
    const skillsRoot = pack.entry?.skills ? path.resolve(pack.root, pack.entry.skills) : "";
    if (skillsRoot) roots.push(skillsRoot);
  }
  const skills = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(root, entry.name, "SKILL.md");
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, "utf8");
      skills.push({ id: entry.name, name: readTitle(content) || entry.name, path: file, preview: content.replace(/^---[\s\S]*?---\s*/m, "").trim().slice(0, 240), source: root === path.join(memoryDir, "skills") ? "local" : "domain-pack" });
    }
  }
  const registryRoot = path.join(memoryDir, "skill-store", "packages");
  if (fs.existsSync(registryRoot)) {
    for (const idEntry of fs.readdirSync(registryRoot, { withFileTypes: true })) {
      if (!idEntry.isDirectory()) continue;
      const idRoot = path.join(registryRoot, idEntry.name);
      for (const versionEntry of fs.readdirSync(idRoot, { withFileTypes: true })) {
        if (!versionEntry.isDirectory()) continue;
        const packageRoot = path.join(idRoot, versionEntry.name);
        const metadataPath = path.join(packageRoot, "skill.json");
        const skillPath = path.join(packageRoot, "SKILL.md");
        if (!fs.existsSync(metadataPath) || !fs.existsSync(skillPath)) continue;
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        const content = fs.readFileSync(skillPath, "utf8");
        skills.push({
          id: metadata.id || idEntry.name,
          name: readTitle(content) || metadata.id || idEntry.name,
          path: skillPath,
          packagePath: packageRoot,
          version: metadata.version || versionEntry.name,
          contentHash: metadata.contentHash || "",
          preview: content.replace(/^---[\s\S]*?---\s*/m, "").trim().slice(0, 240),
          source: "registry"
        });
      }
    }
  }
  return skills;
}

export function searchSkills(memoryDir, query) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return listSkills(memoryDir).map((skill) => ({ ...skill, score: terms.reduce((score, term) => score + (JSON.stringify(skill).toLowerCase().includes(term) ? 1 : 0), 0) })).filter((skill) => !terms.length || skill.score > 0).sort((a, b) => b.score - a.score);
}

function readTitle(content) { return String(content || "").match(/^#\s+(.+)$/m)?.[1]?.trim() || ""; }
