import fs from "node:fs";
import path from "node:path";
import { getEnabledPacks } from "./domain-packs.js";

export const SKILL_TYPES = ["agent", "project", "capability", "integration", "workflow", "package"];
export const SKILL_STATUSES = ["active", "outdated", "conflict", "disabled"];
const AGENT_TARGETS = new Set(["codex", "claude", "gemini", "antigravity", "qclaw", "openclaw", "opencode", "mimocode", "marvis"]);

export function classifySkill(input = {}) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : input;
  const id = String(input.id || metadata.id || "").toLowerCase();
  const name = String(input.name || metadata.name || "").toLowerCase();
  const targets = normalizeList(metadata.targets || input.targets);
  const explicitType = String(metadata.type || metadata.kind || "").toLowerCase();
  const type = SKILL_TYPES.includes(explicitType) ? explicitType : inferSkillType({ id, name, targets, metadata });
  const explicitStatus = String(metadata.status || "").toLowerCase();
  const status = SKILL_STATUSES.includes(explicitStatus) ? explicitStatus : (input.conflict ? "conflict" : "active");
  const scope = String(metadata.scope || (type === "project" ? "project" : "global")).toLowerCase();
  const owner = String(metadata.owner || (type === "agent" && targets.length === 1 ? targets[0] : type === "project" ? "project" : "shared"));
  return { type, owner, scope, status, targets };
}

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
      const name = readTitle(content) || entry.name;
      skills.push({ id: entry.name, name, path: file, preview: content.replace(/^---[\s\S]*?---\s*/m, "").trim().slice(0, 240), source: root === path.join(memoryDir, "skills") ? "local" : "domain-pack", classification: classifySkill({ id: entry.name, name, metadata: parseFrontmatter(content) }) });
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
        const name = readTitle(content) || metadata.id || idEntry.name;
        skills.push({
          id: metadata.id || idEntry.name,
          name,
          path: skillPath,
          packagePath: packageRoot,
          version: metadata.version || versionEntry.name,
          contentHash: metadata.contentHash || "",
          preview: content.replace(/^---[\s\S]*?---\s*/m, "").trim().slice(0, 240),
          source: "registry",
          classification: classifySkill({ ...metadata, id: metadata.id || idEntry.name, name, metadata: { ...metadata, ...parseFrontmatter(content) } })
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

function inferSkillType({ id, name, targets, metadata }) {
  if (targets.some((target) => AGENT_TARGETS.has(target)) || AGENT_TARGETS.has(String(metadata.owner || "").toLowerCase())) return "agent";
  if (String(metadata.scope || "").toLowerCase() === "project") return "project";
  if (/^(feishu|lark|github|wecom|slack|notion)([-_.]|$)/i.test(id) || /(feishu|lark|github|wecom|slack|notion)/i.test(name)) return "integration";
  if (/workflow|orchestrat|handoff/i.test(`${id} ${name}`)) return "workflow";
  if (metadata.package === true || metadata.pack === true) return "package";
  return "capability";
}

function parseFrontmatter(content) {
  const match = String(content || "").match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (!item) continue;
    const value = item[2].replace(/^['"]|['"]$/g, "");
    metadata[item[1]] = value.includes(",") ? normalizeList(value) : value;
  }
  return metadata;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}
