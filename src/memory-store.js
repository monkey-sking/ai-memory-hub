/**
 * memory-store.js — SINGLE WRITER for the durable memory domain.
 *
 * This is the architectural flip: SQLite is the SOURCE OF TRUTH for memory
 * events (inbox/events.jsonl domain). JSONL is now only a write-through
 * export kept for backward compatibility with readers that haven't switched.
 *
 * Every memory-domain write MUST go through this module — never append to
 * inbox/events.jsonl directly. That single chokepoint is what eliminates the
 * multi-writer corruption class (no more file-lock races, no multi-layer
 * JSON decode patches).
 *
 * Safety: if node:sqlite is unavailable, writes fall back to JSONL-only
 * (no data loss). Reads prefer SQLite and fall back to JSONL if the store
 * is empty or unavailable.
 */
import fs from "node:fs";
import path from "node:path";
import {
  openStore,
  appendMemoryEvent as dbAppendMemoryEvent,
  readMemoryEventsDb,
  searchMemoryEventsDb,
  countMemoryEventsDb,
  migrateMemoryEvents as dbMigrateMemoryEvents,
  verifyMemory as dbVerifyMemory
} from "./sqlite-store.js";

function dbPathFor(memoryDir) {
  return path.join(path.resolve(memoryDir), "amh.db");
}

/**
 * Append a durable memory event — SINGLE WRITER into SQLite (source of truth).
 * The legacy inbox/events.jsonl + ledger.jsonl JSONL stream is written
 * separately by the appendJsonl chokepoint in index.js (backward compat; the
 * sync flow still owns and drains the inbox staging queue). This module owns
 * SQLite only, so there is exactly one writer per representation — no file
 * races, no dual-write drift.
 * Returns the normalized event (with generated id when absent).
 */
export function appendMemoryEvent(memoryDir, event) {
  const resolved = path.resolve(memoryDir);
  try {
    const db = openStore(dbPathFor(resolved));
    if (db) {
      return dbAppendMemoryEvent(db, event);
    }
  } catch (err) {
    console.error("[memory-store] sqlite write failed:", err.message);
  }
  return { ...event, id: event?.id || null, ts: event?.ts || new Date().toISOString() };
}

/** Read memory events. Prefers SQLite (truth); falls back to JSONL export. */
export function readMemoryEvents(memoryDir, opts = {}) {
  const resolved = path.resolve(memoryDir);
  try {
    const db = openStore(dbPathFor(resolved));
    if (db && countMemoryEventsDb(db) > 0) {
      return readMemoryEventsDb(db, opts);
    }
  } catch (err) {
    console.error("[memory-store] sqlite read failed, falling back to JSONL:", err.message);
  }
  return readMemoryEventsFromJsonl(resolved, opts);
}

/** Full-text search over memory. Prefers FTS5; falls back to substring scan. */
export function searchMemoryEvents(memoryDir, query, opts = {}) {
  const resolved = path.resolve(memoryDir);
  const q = String(query || "").trim();
  try {
    const db = openStore(dbPathFor(resolved));
    if (db && countMemoryEventsDb(db) > 0) {
      const hits = searchMemoryEventsDb(db, q, opts);
      if (hits.length > 0) return hits;
      // FTS5 trigram only forms tokens of >=3 chars, so a 2-char Chinese query
      // (e.g. "重构", "红包") would otherwise match nothing. Fall back to a
      // substring scan over the SQLite rows so the unified read API stays
      // useful for the common short Chinese query.
      if (q.length < 3) {
        const all = readMemoryEventsDb(db, { limit: opts.limit || 50 });
        const needle = q.toLowerCase();
        return all.filter((e) => JSON.stringify(e).toLowerCase().includes(needle)).slice(0, opts.limit || 50);
      }
      return hits;
    }
  } catch (err) {
    console.error("[memory-store] sqlite search failed, falling back to JSONL:", err.message);
  }
  return searchMemoryEventsInJsonl(resolved, q, opts);
}

/** One-time import of existing inbox/events.jsonl into SQLite. Idempotent. */
export function migrateMemoryEvents(memoryDir) {
  const resolved = path.resolve(memoryDir);
  const db = openStore(dbPathFor(resolved));
  if (!db) return 0;
  return dbMigrateMemoryEvents(db, resolved);
}

/** Reconcile SQLite truth against the JSONL export. */
export function verifyMemory(memoryDir) {
  const resolved = path.resolve(memoryDir);
  const db = openStore(dbPathFor(resolved));
  if (!db) return { sqlite: 0, jsonl: 0, drift: 0, consistent: false, unavailable: true };
  return dbVerifyMemory(db, resolved);
}

// ── JSONL fallbacks (used only when SQLite is empty/unavailable) ──
// Reads the full legacy stream: inbox staging queue + synced ledger.
function legacyMemoryFiles(memoryDir) {
  const base = path.resolve(memoryDir);
  return [
    path.join(base, "inbox", "events.jsonl"),
    path.join(base, "memories", "ledger.jsonl")
  ].filter((f) => fs.existsSync(f));
}

function readMemoryEventsFromJsonl(memoryDir, { limit = 1000, source = null, kind = null, project = null } = {}) {
  const out = [];
  for (const file of legacyMemoryFiles(memoryDir)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (source && e.source !== source) continue;
        if (kind && e.kind !== kind) continue;
        if (project && e.project !== project) continue;
        out.push(e);
        if (out.length >= limit) break;
      } catch { /* skip */ }
    }
    if (out.length >= limit) break;
  }
  return out;
}

function searchMemoryEventsInJsonl(memoryDir, query, { limit = 50 } = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const file of legacyMemoryFiles(memoryDir)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const hay = JSON.stringify(e).toLowerCase();
        if (terms.every((t) => hay.includes(t))) out.push(e);
        if (out.length >= limit) break;
      } catch { /* skip */ }
    }
    if (out.length >= limit) break;
  }
  return out;
}
