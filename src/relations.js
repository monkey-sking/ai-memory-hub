import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// P1 (borrowed from Cumora participants, taken further): `role` is a first-class entity so we can
// ask "who plays what role" and "what permissions a role binds" — Cumora only has flat role fields.
// P2 (AMH-exclusive, Cumora has no team entity): `team` is a first-class org entity so we can model
// who belongs to which team and scope work/permissions per team — going further than Cumora.
const ENTITY_TYPES = new Set(["memory", "skill", "skill-pack", "project", "task", "workflow", "agent", "tool", "role", "team"]);
const RELATION_TYPES = new Set(["uses", "supports", "belongs-to", "depends-on", "enabled-in", "derived-from", "related-to", "plays-role", "member-of"]);

export function readRelations(memoryDir) {
  const file = path.join(path.resolve(memoryDir), "relations", "events.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function recordRelation(memoryDir, input) {
  const relation = normalizeRelation({ ...input, status: "active" });
  const existing = readRelations(memoryDir).find((item) => item.status === "active" && sameRelation(item, relation));
  if (existing) return { ...existing, reused: true };
  const event = { id: crypto.randomUUID(), ts: new Date().toISOString(), ...relation };
  const file = path.join(path.resolve(memoryDir), "relations", "events.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  return { ...event, reused: false };
}

export function recordMemoryRelations(memoryDir, memory = {}) {
  const memoryId = String(memory.localEventId || memory.id || "").trim();
  if (!memoryId) return [];
  return buildMemoryRelations(memory).map((target) => recordRelation(memoryDir, {
    from: { type: "memory", id: memoryId },
    to: { type: target.type, id: target.id },
    relation: target.relation,
    source: "memory-write",
    confidence: 1,
    evidence: target.evidence
  }));
}

export function rebuildMemoryRelations(memoryDir, memories = [], { dryRun = false } = {}) {
  const summary = { memories: memories.length, candidates: 0, created: 0, reused: 0 };
  for (const memory of memories) {
    const candidates = buildMemoryRelations(memory);
    summary.candidates += candidates.length;
    if (dryRun) continue;
    for (const target of candidates) {
      const result = recordRelation(memoryDir, {
        from: { type: "memory", id: String(memory.localEventId || memory.id).trim() },
        to: { type: target.type, id: target.id },
        relation: target.relation,
        source: "memory-migration",
        confidence: 1,
        evidence: { ...target.evidence, migration: "historical-memory-backfill" }
      });
      if (result.reused) summary.reused += 1;
      else summary.created += 1;
    }
  }
  return summary;
}

function buildMemoryRelations(memory = {}) {
  const metadata = memory.metadata && typeof memory.metadata === "object" ? memory.metadata : {};
  const project = String(memory.project || metadata.project || "").trim();
  const skills = normalizeIds(memory.skills || metadata.skills);
  const refs = memory.refs && typeof memory.refs === "object" ? memory.refs : metadata.refs && typeof metadata.refs === "object" ? metadata.refs : {};
  const inputs = [];
  if (project) inputs.push({ type: "project", id: project, relation: "belongs-to", evidence: { source: "memory-write", field: "project" } });
  for (const skill of skills) inputs.push({ type: "skill", id: skill, relation: "supports", evidence: { source: "memory-write", field: "skills" } });
  for (const taskId of normalizeIds(refs.taskId || refs.taskIds)) inputs.push({ type: "task", id: taskId, relation: "related-to", evidence: { source: "memory-write", field: "refs.taskId" } });
  for (const workflowId of normalizeIds(refs.workflowId || refs.workflowIds)) inputs.push({ type: "workflow", id: workflowId, relation: "related-to", evidence: { source: "memory-write", field: "refs.workflowId" } });
  return inputs;
}

export function revokeRelation(memoryDir, relationId, reason = "") {
  const current = readRelations(memoryDir).find((item) => item.id === relationId && item.status === "active");
  if (!current) throw new Error(`Active relation not found: ${relationId}`);
  const file = path.join(path.resolve(memoryDir), "relations", "events.jsonl");
  const event = { id: crypto.randomUUID(), ts: new Date().toISOString(), action: "revoke", target: relationId, reason, status: "revoked" };
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export function listRelatedEntities(memoryDir, entity, { includeSuggestions = true } = {}) {
  const normalized = normalizeEntity(entity);
  const relations = activeRelations(readRelations(memoryDir));
  const explicit = relations.filter((item) => sameEntity(item.from, normalized) || sameEntity(item.to, normalized));
  const suggestions = includeSuggestions ? deriveRelationSuggestions(memoryDir, normalized, relations) : [];
  return { entity: normalized, explicit, suggestions };
}

export function deriveRelationSuggestions(memoryDir, entity, relations = readRelations(memoryDir)) {
  const suggestions = [];
  const records = readJson(path.join(path.resolve(memoryDir), "memories", "index.json"))?.records || [];
  const tasks = readJsonLines(path.join(path.resolve(memoryDir), "tasks", "tasks.jsonl"));
  if (entity.type === "project") {
    for (const record of records) if (String(record.project || record.metadata?.project || "") === entity.id) suggestions.push(suggestion("memory", record.localEventId || record.id, "belongs-to", entity, "metadata.project", 1));
    for (const task of tasks) if (String(task.project || "") === entity.id) suggestions.push(suggestion("task", task.id, "belongs-to", entity, "task.project", 1));
  }
  if (entity.type === "skill") {
    for (const task of tasks) if (Array.isArray(task.skills) && task.skills.includes(entity.id)) suggestions.push(suggestion("task", task.id, "uses", entity, "task.skills", 1));
    for (const record of records) {
      const tags = Array.isArray(record.tags) ? record.tags : Array.isArray(record.metadata?.tags) ? record.metadata.tags : [];
      const text = String(record.text || "").toLowerCase();
      if (tags.includes(entity.id) || text.includes(entity.id.toLowerCase())) suggestions.push(suggestion("memory", record.localEventId || record.id, "supports", entity, tags.includes(entity.id) ? "metadata.tags" : "memory.text", tags.includes(entity.id) ? 0.85 : 0.55));
    }
  }
  return suggestions.filter((item) => !relations.some((relation) => sameRelation(relation, item)));
}

function normalizeRelation(input) {
  if (!RELATION_TYPES.has(String(input.relation || ""))) throw new Error(`Invalid relation type: ${input.relation}`);
  const from = normalizeEntity(input.from);
  const to = normalizeEntity(input.to);
  return { from, to, relation: input.relation, source: input.source || "explicit", confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 1, evidence: input.evidence || {}, status: input.status || "active" };
}

function normalizeEntity(value) {
  if (!value || typeof value !== "object" || !ENTITY_TYPES.has(String(value.type || "")) || !String(value.id || "").trim()) throw new Error("Relation entity requires a supported type and id");
  return { type: String(value.type), id: String(value.id).trim() };
}

function sameEntity(left, right) { return left?.type === right?.type && left?.id === right?.id; }
function sameRelation(left, right) { return sameEntity(left.from, right.from) && sameEntity(left.to, right.to) && left.relation === right.relation; }
function activeRelations(events) {
  const revoked = new Set(events.filter((item) => item.action === "revoke").map((item) => item.target));
  return events.filter((item) => item.status === "active" && !revoked.has(item.id));
}
function suggestion(type, id, relation, target, evidence, confidence) { return { id: `suggested:${type}:${id}:${relation}:${target.type}:${target.id}`, from: { type, id }, to: target, relation, source: "inferred", confidence, evidence, status: "suggested" }; }
function normalizeIds(value) { return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : value ? [String(value).trim()].filter(Boolean) : []; }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function readJsonLines(file) { if (!fs.existsSync(file)) return []; return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
