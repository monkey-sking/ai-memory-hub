// Entity event-store engine (v2.6).
//
// This is the event-sourced storage core that underpins tasks, workflows and
// projects. It was previously inlined inside the 18k-line index.js monolith
// alongside the command logic that calls it.
//
// Design note: the engine is fully parameterised by a `definition` object that
// carries the entity-specific `normalize` / `isValid` predicates. That keeps
// this module free of any knowledge of normalizeTask / normalizeWorkflow /
// normalizeProject (those stay in index.js and are injected via the
// definition), so extracting the engine does not drag the whole data layer
// along with it.
//
// Dependency direction (no cycles):
//   entity-store -> io (pure JSONL IO)
//                -> cli (createId / ensureDir / isPlainObject)
//                -> atomic-write (writeFileAtomic)
//                -> event-writer (appendJsonl)
//                -> sqlite-dualwrite (mirror* SQLite mirror calls)
// None of those modules import entity-store or index.js.
import fs from "node:fs";
import path from "node:path";
import { createId, ensureDir, isPlainObject } from "./cli.js";
import { writeFileAtomic } from "../atomic-write.js";
import { appendJsonl } from "../event-writer.js";
import { readEvents, parseJsonlLine, countJsonlLines } from "./io.js";
import { mirrorSync, mirrorUpsert, mirrorDelete } from "../sqlite-dualwrite.js";

export function getEntityProjectionFile(memoryDir, definition) {
  return path.join(memoryDir, definition.dirName, definition.projectionName);
}

export function getEntityEventsFile(memoryDir, definition) {
  return path.join(memoryDir, definition.dirName, "events.jsonl");
}

export function readEntityEvents(memoryDir, definition) {
  return readEvents(getEntityEventsFile(memoryDir, definition))
    .filter((event) => event.entity === definition.entity || String(event.type || "").startsWith(`${definition.entity}.`));
}

export function bootstrapEntityEventsFromProjection(memoryDir, definition) {
  const eventsFile = getEntityEventsFile(memoryDir, definition);
  if (countJsonlLines(eventsFile) > 0) {
    return;
  }
  const records = readEvents(getEntityProjectionFile(memoryDir, definition))
    .map(definition.normalize)
    .filter(definition.isValid);
  if (records.length === 0) {
    return;
  }
  appendEntityEvents(memoryDir, definition, records, {
    action: "upsert",
    source: "migration",
    reason: `${definition.projectionName}:import`
  });
  materializeEntityProjection(memoryDir, definition);
}

export function writeEntityRecords(memoryDir, definition, records, options = {}) {
  const normalized = records
    .map(definition.normalize)
    .filter(definition.isValid);
  const current = new Map(replayEntityEvents(readEntityEvents(memoryDir, definition), definition).map((record) => [record.id, record]));
  const upserts = normalized.filter((record) => {
    const existing = current.get(record.id);
    if (!existing) {
      return true;
    }
    if (!isEntityRecordNewerOrSame(record, existing)) {
      return false;
    }
    return JSON.stringify(record) !== JSON.stringify(existing);
  });
  if (upserts.length > 0) {
    appendEntityEvents(memoryDir, definition, upserts, {
      action: "upsert",
      source: options.source || "ai-memory-hub",
      reason: options.reason || `${definition.entity}:write`
    });
  }
  materializeEntityProjection(memoryDir, definition);
  mirrorSync(memoryDir, definition.entity, normalized);
}

export function appendEntityRecord(memoryDir, definition, record, options = {}) {
  const normalized = definition.normalize(record);
  if (!definition.isValid(normalized)) {
    throw new Error(`Invalid ${definition.entity} record: ${normalized.id || "missing id"}`);
  }
  appendEntityEvents(memoryDir, definition, [normalized], {
    action: "upsert",
    source: options.source || "ai-memory-hub",
    reason: options.reason || `${definition.entity}:upsert`
  });
  materializeEntityProjection(memoryDir, definition);
  mirrorUpsert(memoryDir, definition.entity, [normalized]);
  return normalized;
}

export function deleteEntityRecord(memoryDir, definition, id, options = {}) {
  const entityId = String(id || "").trim();
  if (!entityId) {
    throw new Error(`Invalid ${definition.entity} id`);
  }
  appendEntityEvents(memoryDir, definition, [{ id: entityId }], {
    action: "delete",
    source: options.source || "ai-memory-hub",
    reason: options.reason || `${definition.entity}:delete`
  });
  materializeEntityProjection(memoryDir, definition);
  mirrorDelete(memoryDir, definition.entity, entityId);
}

export function appendEntityEvents(memoryDir, definition, records, { action = "upsert", source = "ai-memory-hub", reason = "" } = {}) {
  const file = getEntityEventsFile(memoryDir, definition);
  for (const record of records) {
    appendJsonl(file, createEntityEvent(definition, action, record, { source, reason }));
  }
}

export function createEntityEvent(definition, action, record, { source = "ai-memory-hub", reason = "" } = {}) {
  const ts = new Date().toISOString();
  const entityId = record.id || record.entityId || "";
  return {
    id: createId(`${definition.entity}:${action}:${entityId}:${JSON.stringify(record)}:${ts}`),
    schemaVersion: 1,
    ts,
    source,
    entity: definition.entity,
    action,
    type: `${definition.entity}.${action}`,
    entityId,
    reason,
    record: action === "delete" ? undefined : record
  };
}

export function replayEntityEvents(events, definition) {
  const byId = new Map();
  for (const event of events) {
    const action = String(event.action || String(event.type || "").split(".").pop() || "").toLowerCase();
    const record = event.record || event[definition.entity] || event.payload;
    const entityId = String(event.entityId || record?.id || "").trim();
    if (!entityId) {
      continue;
    }
    if (["delete", "remove", "tombstone"].includes(action)) {
      byId.delete(entityId);
      continue;
    }
    if (!["upsert", "create", "update", "snapshot"].includes(action) || !isPlainObject(record)) {
      continue;
    }
    const normalized = definition.normalize(record);
    if (definition.isValid(normalized)) {
      byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()];
}

export function materializeEntityProjection(memoryDir, definition) {
  const records = replayEntityEvents(readEntityEvents(memoryDir, definition), definition);
  const file = getEntityProjectionFile(memoryDir, definition);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
  return records;
}

export function isEntityRecordNewerOrSame(record, existing) {
  const recordTime = Date.parse(record.updatedAt || record.createdAt || "");
  const existingTime = Date.parse(existing.updatedAt || existing.createdAt || "");
  if (Number.isNaN(recordTime) || Number.isNaN(existingTime)) {
    return true;
  }
  return recordTime >= existingTime;
}
