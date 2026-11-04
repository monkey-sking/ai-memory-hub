import fs from "node:fs";
import path from "node:path";
import { appendJsonl } from "./event-writer.js";
import { createId } from "./lib/cli.js";
import { readEvents } from "./lib/io.js";
import { listSkills } from "./skill-registry.js";

export const SKILL_USAGE_SIGNALS = Object.freeze([
  "search_hit",
  "loaded",
  "adopted",
  "pinned",
  "unpinned"
]);

const SIGNAL_WEIGHTS = Object.freeze({
  search_hit: 0.35,
  loaded: 1,
  adopted: 2.25,
  pinned: 0,
  unpinned: 0
});

const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_LIMIT = 20;
const DEFAULT_EMPTY_SKILL_CHARS = 320;

export function getSkillUsageFile(memoryDir) {
  return path.join(path.resolve(memoryDir), "skill-usage", "events.jsonl");
}

export function readSkillUsageEvents(memoryDir) {
  return readEvents(getSkillUsageFile(memoryDir))
    .map((event) => normalizeStoredEvent(event))
    .filter(Boolean);
}

export function recordSkillUsage(memoryDir, input = {}) {
  const event = normalizeSkillUsageEvent(input);
  if (event.sessionId) {
    const duplicate = readSkillUsageEvents(memoryDir).find((current) => (
      current.sessionId === event.sessionId &&
      current.skill.toLowerCase() === event.skill.toLowerCase() &&
      current.agent.toLowerCase() === event.agent.toLowerCase() &&
      current.project.toLowerCase() === event.project.toLowerCase() &&
      current.signal === event.signal
    ));
    if (duplicate) return { recorded: false, duplicate: true, event: duplicate };
  }

  appendJsonl(getSkillUsageFile(memoryDir), event);
  return { recorded: true, duplicate: false, event };
}

export function listSkillUsageEvents(memoryDir, filters = {}) {
  const limit = normalizeLimit(filters.limit, 100);
  const agent = normalizeToken(filters.agent);
  const project = normalizeToken(filters.project);
  const skill = normalizeToken(filters.skill);
  return readSkillUsageEvents(memoryDir)
    .filter((event) => !agent || normalizeToken(event.agent) === agent)
    .filter((event) => !project || normalizeToken(event.project) === project)
    .filter((event) => !skill || normalizeToken(event.skill) === skill)
    .sort((left, right) => right.ts.localeCompare(left.ts))
    .slice(0, limit);
}

export function buildSkillUsageReport(memoryDir, options = {}) {
  const now = parseDate(options.now) || new Date();
  const agentFilter = normalizeToken(options.agent);
  const projectFilter = normalizeToken(options.project);
  const limit = normalizeLimit(options.limit, DEFAULT_LIMIT);
  const budget = normalizeBudget(options.budget);
  const halfLifeDays = normalizeHalfLife(options.halfLifeDays);
  const events = readSkillUsageEvents(memoryDir)
    .filter((event) => eventInScope(event, agentFilter, projectFilter))
    .sort((left, right) => left.ts.localeCompare(right.ts));
  const registry = preferredRegistrySkills(memoryDir)
    .filter((skill) => skillTargetsAgent(skill, agentFilter));
  const bySkill = new Map();

  for (const skill of registry) {
    bySkill.set(normalizeToken(skill.id), buildSkillAccumulator(skill));
  }
  for (const event of events) aggregateEvent(bySkill, event, { agentFilter, projectFilter, now, halfLifeDays });

  const recommendations = [...bySkill.values()]
    .map((entry) => finalizeRecommendation(entry, now))
    .sort(compareRecommendations);
  const core = recommendations.filter((item) => item.category === "core").slice(0, limit);
  const recent = recommendations.filter((item) => item.category === "recent").slice(0, limit);
  const searchable = recommendations.filter((item) => item.category === "searchable").slice(0, limit);

  const fitted = fitBudget(core, recent, searchable, budget);
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    filters: {
      agent: options.agent || "",
      project: options.project || ""
    },
    eventCount: events.length,
    totals: {
      skills: recommendations.length,
      core: fitted.core.length,
      recent: fitted.recent.length,
      searchable: fitted.searchable.length
    },
    budget: {
      requested: budget,
      usedChars: fitted.usedChars,
      exceeded: Boolean(budget && fitted.exceededBecauseCore)
    },
    core: fitted.core,
    recent: fitted.recent,
    searchable: fitted.searchable
  };
}

export function normalizeSkillUsageEvent(input = {}) {
  const skill = String(input.skill || input.skillId || "").trim();
  const agent = String(input.agent || input.tool || "").trim();
  if (!skill) throw new Error("Skill usage event requires --skill <id>.");
  if (!agent) throw new Error("Skill usage event requires --agent <agent>.");

  const signal = String(input.signal || "loaded").trim().toLowerCase();
  if (!SKILL_USAGE_SIGNALS.includes(signal)) {
    throw new Error(`Invalid Skill usage signal: ${signal}. Expected one of: ${SKILL_USAGE_SIGNALS.join(", ")}.`);
  }
  const ts = parseDate(input.ts) || new Date();
  const project = String(input.project || "").trim();
  const source = String(input.source || "cli").trim() || "cli";
  const sessionId = String(input.sessionId || input.session || "").trim();
  const version = String(input.version || input.skillVersion || "").trim();
  const evidence = normalizeEvidence(input.evidence);
  const event = {
    id: String(input.id || "").trim(),
    schemaVersion: 1,
    skill,
    agent,
    project,
    signal,
    source,
    sessionId,
    version,
    ts: ts.toISOString()
  };
  if (evidence.length) event.evidence = evidence;
  if (!event.id) event.id = createId(JSON.stringify(event));
  return event;
}

function normalizeStoredEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const skill = String(event.skill || event.skillId || "").trim();
  const agent = String(event.agent || event.tool || "").trim();
  const signal = String(event.signal || "").trim().toLowerCase();
  const ts = parseDate(event.ts);
  if (!skill || !agent || !SKILL_USAGE_SIGNALS.includes(signal) || !ts) return null;
  return {
    ...event,
    schemaVersion: 1,
    id: String(event.id || ""),
    skill,
    agent,
    project: String(event.project || "").trim(),
    signal,
    source: String(event.source || "").trim(),
    sessionId: String(event.sessionId || event.session || "").trim(),
    version: String(event.version || event.skillVersion || "").trim(),
    ts: ts.toISOString(),
    evidence: normalizeEvidence(event.evidence)
  };
}

function preferredRegistrySkills(memoryDir) {
  const byId = new Map();
  for (const skill of listSkills(memoryDir)) {
    const key = normalizeToken(skill.id);
    const current = byId.get(key);
    if (!current || compareVersions(skill.version, current.version) >= 0) byId.set(key, skill);
  }
  return [...byId.values()];
}

function buildSkillAccumulator(skill) {
  return {
    skill,
    score: 0,
    signals: {},
    agents: {},
    projects: {},
    sessions: new Set(),
    firstUsedAt: "",
    lastUsedAt: "",
    pinned: false,
    pinnedAt: ""
  };
}

function aggregateEvent(bySkill, event, context) {
  const key = normalizeToken(event.skill);
  let entry = bySkill.get(key);
  if (!entry) {
    entry = buildSkillAccumulator({
      id: event.skill,
      name: event.skill,
      source: "unregistered",
      path: "",
      classification: {}
    });
    bySkill.set(key, entry);
  }

  entry.signals[event.signal] = (entry.signals[event.signal] || 0) + 1;
  if (event.agent) entry.agents[event.agent] = (entry.agents[event.agent] || 0) + 1;
  if (event.project) entry.projects[event.project] = (entry.projects[event.project] || 0) + 1;
  entry.sessions.add(event.sessionId || event.id || `${event.skill}:${event.ts}`);
  if (!entry.firstUsedAt || event.ts < entry.firstUsedAt) entry.firstUsedAt = event.ts;
  if (!entry.lastUsedAt || event.ts > entry.lastUsedAt) entry.lastUsedAt = event.ts;

  if (event.signal === "pinned" || event.signal === "unpinned") {
    if (event.ts >= entry.pinnedAt) {
      entry.pinned = event.signal === "pinned";
      entry.pinnedAt = event.ts;
    }
    return;
  }

  const decay = recencyDecay(event.ts, context.now, context.halfLifeDays);
  const relevance = scopeRelevance(event, context.agentFilter, context.projectFilter);
  entry.score += (SIGNAL_WEIGHTS[event.signal] || 0) * decay * relevance;
}

function finalizeRecommendation(entry, now) {
  const distinctSessions = entry.sessions.size;
  const adopted = entry.signals.adopted || 0;
  const loaded = entry.signals.loaded || 0;
  const searched = entry.signals.search_hit || 0;
  let score = entry.score + (entry.pinned ? 5 : 0);
  const ageDays = entry.lastUsedAt ? Math.max(0, (now.getTime() - Date.parse(entry.lastUsedAt)) / 86400000) : Infinity;

  const core = entry.pinned || (
    distinctSessions >= 2 &&
    score >= 2.4 &&
    (adopted > 0 || loaded >= 3)
  );
  const recent = !core && score >= 0.5 && ageDays <= 60;
  const category = core ? "core" : recent ? "recent" : "searchable";
  const reason = entry.pinned
    ? "pinned"
    : adopted
      ? `adopted in ${distinctSessions} session${distinctSessions === 1 ? "" : "s"}`
      : loaded
        ? `loaded in ${distinctSessions} session${distinctSessions === 1 ? "" : "s"}`
        : searched
          ? `matched ${searched} search${searched === 1 ? "" : "es"}`
          : "available on demand";

  return {
    id: entry.skill.id,
    name: entry.skill.name || entry.skill.id,
    source: entry.skill.source || "unregistered",
    pinned: entry.pinned,
    category,
    score: Number(score.toFixed(3)),
    sessions: distinctSessions,
    signals: entry.signals,
    agents: entry.agents,
    projects: entry.projects,
    firstUsedAt: entry.firstUsedAt,
    lastUsedAt: entry.lastUsedAt,
    estimatedChars: estimateSkillChars(entry.skill),
    reason
  };
}

function fitBudget(core, recent, searchable, budget) {
  let usedChars = core.reduce((sum, item) => sum + item.estimatedChars, 0);
  const fittedRecent = [];
  const fittedSearchable = [];
  let exceededBecauseCore = Boolean(budget && usedChars > budget);

  for (const item of recent) {
    if (budget && usedChars + item.estimatedChars > budget) continue;
    fittedRecent.push(item);
    usedChars += item.estimatedChars;
  }
  for (const item of searchable) {
    if (budget && usedChars + item.estimatedChars > budget) continue;
    fittedSearchable.push(item);
    usedChars += item.estimatedChars;
  }
  return {
    core,
    recent: fittedRecent,
    searchable: fittedSearchable,
    usedChars,
    exceededBecauseCore
  };
}

function estimateSkillChars(skill) {
  if (!skill.path) return DEFAULT_EMPTY_SKILL_CHARS;
  try {
    return fs.statSync(skill.path).size;
  } catch {
    return DEFAULT_EMPTY_SKILL_CHARS;
  }
}

function eventInScope(event, agentFilter, projectFilter) {
  if (agentFilter && normalizeToken(event.agent) !== agentFilter && event.agent) return false;
  if (projectFilter && normalizeToken(event.project) !== projectFilter && event.project) return false;
  return true;
}

function scopeRelevance(event, agentFilter, projectFilter) {
  let relevance = 1;
  if (agentFilter) relevance *= event.agent ? 1 : 0.55;
  if (projectFilter) relevance *= event.project ? 1 : 0.45;
  return relevance;
}

function skillTargetsAgent(skill, agentFilter) {
  if (!agentFilter) return true;
  const targets = skill.classification?.targets || [];
  return targets.length === 0 || targets.map(normalizeToken).includes(agentFilter);
}

function compareRecommendations(left, right) {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  return left.id.localeCompare(right.id);
}

function compareVersions(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { numeric: true, sensitivity: "base" });
}

function recencyDecay(ts, now, halfLifeDays) {
  const ageDays = Math.max(0, (now.getTime() - Date.parse(ts)) / 86400000);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function normalizeEvidence(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 5);
  return String(value || "").split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
}

function normalizeLimit(value, fallback) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.floor(limit);
}

function normalizeBudget(value) {
  const budget = Number(value);
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  return Math.floor(budget);
}

function normalizeHalfLife(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_HALF_LIFE_DAYS;
  return days;
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
