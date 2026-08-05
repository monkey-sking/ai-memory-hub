import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ENTITY_TYPES = new Set(["memory", "skill", "skill-pack", "project", "task", "workflow", "agent", "tool"]);
const RELATION_TYPES = new Set(["uses", "supports", "belongs-to", "depends-on", "enabled-in", "derived-from", "related-to"]);

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
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function readJsonLines(file) { if (!fs.existsSync(file)) return []; return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
