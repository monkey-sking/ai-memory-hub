import fs from "node:fs";
import path from "node:path";

export function listSkills(memoryDir) {
  const roots = [path.join(memoryDir, "skills")];
  for (const pack of enabledPacks(memoryDir)) {
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
  return skills;
}

function enabledPacks(memoryDir) {
  const file = path.join(memoryDir, "packs", "registry.jsonl");
  if (!fs.existsSync(file)) return [];
  const state = new Map();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)) {
    const event = JSON.parse(line);
    if (!event.pack?.id) continue;
    state.set(event.pack.id, { ...(state.get(event.pack.id) || {}), ...event.pack, ...(event.action === "enable" ? { enabled: true } : {}), ...(event.action === "disable" ? { enabled: false } : {}) });
  }
  return [...state.values()].filter((pack) => pack.enabled);
}

export function searchSkills(memoryDir, query) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return listSkills(memoryDir).map((skill) => ({ ...skill, score: terms.reduce((score, term) => score + (JSON.stringify(skill).toLowerCase().includes(term) ? 1 : 0), 0) })).filter((skill) => !terms.length || skill.score > 0).sort((a, b) => b.score - a.score);
}

function readTitle(content) { return String(content || "").match(/^#\s+(.+)$/m)?.[1]?.trim() || ""; }
