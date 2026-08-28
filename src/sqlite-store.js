/**
 * SQLite truth-source layer for AMH core entities (tasks, projects, workflows).
 *
 * Design principles:
 * - WAL mode for concurrent read access (hub + dashboard read simultaneously)
 * - Projections: latest state per entity (not event log — events stay as JSONL)
 * - Thin adapter: read from SQLite, write to both SQLite + JSONL (dual-write transition)
 * - Migration: one-time import from existing JSONL files
 *
 * Node 22 has `node:sqlite` as experimental — we gate on availability.
 */

import path from "node:path";
import fs from "node:fs";

let Database = null;
try {
  // node:sqlite is experimental in Node 22.x — exports DatabaseSync
  const mod = await import("node:sqlite");
  Database = mod.DatabaseSync;
} catch {
  Database = null;
}

// Per-path handle cache. A single global handle broke multi-directory use
// (e.g. tests, or tools operating on several hubs) — each path keeps its own.
const dbCache = new Map();

/**
 * Open (or create) the SQLite database at the given path.
 * Returns the Database handle or null if node:sqlite is unavailable.
 */
export function openStore(dbPath) {
  const resolved = path.resolve(dbPath);
  const cached = dbCache.get(resolved);
  if (cached) return cached;
  if (!Database) {
    console.warn("[sqlite-store] node:sqlite not available — falling back to JSONL");
    return null;
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const handle = new Database(resolved);
  handle.exec("PRAGMA journal_mode = WAL");
  handle.exec("PRAGMA synchronous = NORMAL");
  handle.exec("PRAGMA foreign_keys = ON");
  initSchema(handle);
  dbCache.set(resolved, handle);
  return handle;
}

function initSchema(database) {
  database.exec(`
    -- ── tasks projection (latest state, not event log) ──
    CREATE TABLE IF NOT EXISTS tasks (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'pending',
      priority      TEXT NOT NULL DEFAULT 'normal',
      project       TEXT NOT NULL DEFAULT '',
      assignee      TEXT NOT NULL DEFAULT '',
      created_by    TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT '',
      updated_at    TEXT NOT NULL DEFAULT '',
      completed_at  TEXT NOT NULL DEFAULT '',
      data          TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);

    -- ── projects ──
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL DEFAULT '',
      display_name  TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'active',
      type          TEXT NOT NULL DEFAULT '',
      description   TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT '',
      updated_at    TEXT NOT NULL DEFAULT '',
      data          TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

    -- ── workflows ──
    CREATE TABLE IF NOT EXISTS workflows (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'pending',
      priority      TEXT NOT NULL DEFAULT 'normal',
      project       TEXT NOT NULL DEFAULT '',
      created_by    TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT '',
      updated_at    TEXT NOT NULL DEFAULT '',
      completed_at  TEXT NOT NULL DEFAULT '',
      data          TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_status  ON workflows(status);
    CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project);

    -- ── migration metadata ──
    CREATE TABLE IF NOT EXISTS _meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ── memory_events: SOURCE OF TRUTH for the durable memory domain ──
    -- Append-only event log (replaces inbox/events.jsonl as the authority).
    -- JSONL remains only as a write-through export for backward compat.
    CREATE TABLE IF NOT EXISTS memory_events (
      rowid  INTEGER PRIMARY KEY AUTOINCREMENT,
      id      TEXT UNIQUE NOT NULL,
      ts      TEXT NOT NULL DEFAULT '',
      source  TEXT NOT NULL DEFAULT '',
      kind    TEXT NOT NULL DEFAULT '',
      project TEXT NOT NULL DEFAULT '',
      text    TEXT NOT NULL DEFAULT '',
      data    TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_memory_events_ts      ON memory_events(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_events_source  ON memory_events(source);
    CREATE INDEX IF NOT EXISTS idx_memory_events_kind    ON memory_events(kind);
    CREATE INDEX IF NOT EXISTS idx_memory_events_project ON memory_events(project);

    -- FTS5 over memory text (external-content, kept in sync by triggers).
    -- trigram tokenizer: indexes 3-char substrings, so CJK substring search
    -- (e.g. "红包版") works without a dedicated CJK segmenter.
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_events_fts USING fts5(
      text, content='memory_events', content_rowid='rowid', tokenize='trigram'
    );
    CREATE TRIGGER IF NOT EXISTS memory_events_ai AFTER INSERT ON memory_events BEGIN
      INSERT INTO memory_events_fts(rowid, text) VALUES (new.rowid, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS memory_events_ad AFTER DELETE ON memory_events BEGIN
      INSERT INTO memory_events_fts(memory_events_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
    END;
    CREATE TRIGGER IF NOT EXISTS memory_events_au AFTER UPDATE ON memory_events BEGIN
      INSERT INTO memory_events_fts(memory_events_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
      INSERT INTO memory_events_fts(rowid, text) VALUES (new.rowid, new.text);
    END;
  `);
}

// ── CRUD: tasks ─────────────────────────────────────────────

export function upsertTask(database, task) {
  const data = { ...task };
  database.prepare(`
    INSERT INTO tasks (id, title, status, priority, project, assignee, created_by, created_at, updated_at, completed_at, data)
    VALUES (@id, @title, @status, @priority, @project, @assignee, @created_by, @created_at, @updated_at, @completed_at, @data)
    ON CONFLICT(id) DO UPDATE SET
      title = @title, status = @status, priority = @priority, project = @project,
      assignee = @assignee, created_by = @created_by, created_at = @created_at,
      updated_at = @updated_at, completed_at = @completed_at, data = @data
  `).run({
    id: data.id || "",
    title: data.title || "",
    status: data.status || "pending",
    priority: data.priority || "normal",
    project: data.project || "",
    assignee: data.assignee || data.createdBy || "",
    created_by: data.createdBy || "",
    created_at: data.createdAt || "",
    updated_at: data.updatedAt || "",
    completed_at: data.completedAt || "",
    data: JSON.stringify(data)
  });
}

export function getTask(database, id) {
  const row = database.prepare("SELECT data FROM tasks WHERE id = ?").get(id);
  return row ? JSON.parse(row.data) : null;
}

export function listTasks(database, { status = null, project = null, limit = 100 } = {}) {
  let sql = "SELECT data FROM tasks";
  const conditions = [];
  const params = [];
  if (status) { conditions.push("status = ?"); params.push(status); }
  if (project) { conditions.push("project = ?"); params.push(project); }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY updated_at DESC LIMIT ?";
  params.push(limit);
  return database.prepare(sql).all(...params).map((row) => JSON.parse(row.data));
}

// ── CRUD: projects ──────────────────────────────────────────

export function upsertProject(database, project) {
  const data = { ...project };
  database.prepare(`
    INSERT INTO projects (id, name, display_name, status, type, description, created_at, updated_at, data)
    VALUES (@id, @name, @display_name, @status, @type, @description, @created_at, @updated_at, @data)
    ON CONFLICT(id) DO UPDATE SET
      name = @name, display_name = @display_name, status = @status, type = @type,
      description = @description, created_at = @created_at, updated_at = @updated_at, data = @data
  `).run({
    id: data.id || "",
    name: data.name || "",
    display_name: data.displayName || data.name || "",
    status: data.status || "active",
    type: data.type || "",
    description: data.description || "",
    created_at: data.createdAt || "",
    updated_at: data.updatedAt || "",
    data: JSON.stringify(data)
  });
}

export function listProjects(database, { status = null } = {}) {
  let sql = "SELECT data FROM projects";
  const params = [];
  if (status) { sql += " WHERE status = ?"; params.push(status); }
  sql += " ORDER BY updated_at DESC";
  return database.prepare(sql).all(...params).map((row) => JSON.parse(row.data));
}

// ── CRUD: workflows ─────────────────────────────────────────

export function upsertWorkflow(database, workflow) {
  const data = { ...workflow };
  database.prepare(`
    INSERT INTO workflows (id, title, status, priority, project, created_by, created_at, updated_at, completed_at, data)
    VALUES (@id, @title, @status, @priority, @project, @created_by, @created_at, @updated_at, @completed_at, @data)
    ON CONFLICT(id) DO UPDATE SET
      title = @title, status = @status, priority = @priority, project = @project,
      created_by = @created_by, created_at = @created_at, updated_at = @updated_at,
      completed_at = @completed_at, data = @data
  `).run({
    id: data.id || "",
    title: data.title || "",
    status: data.status || "pending",
    priority: data.priority || "normal",
    project: data.project || "",
    created_by: data.createdBy || "",
    created_at: data.createdAt || "",
    updated_at: data.updatedAt || "",
    completed_at: data.completedAt || "",
    data: JSON.stringify(data)
  });
}

export function listWorkflows(database, { status = null, project = null } = {}) {
  let sql = "SELECT data FROM workflows";
  const conditions = [];
  const params = [];
  if (status) { conditions.push("status = ?"); params.push(status); }
  if (project) { conditions.push("project = ?"); params.push(project); }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY updated_at DESC";
  return database.prepare(sql).all(...params).map((row) => JSON.parse(row.data));
}

// ── Migration ───────────────────────────────────────────────

/**
 * One-time migration: import existing JSONL data into SQLite.
 * Reads the latest projection for each entity from the event log.
 * Returns { tasks, projects, workflows, durationMs }.
 */
export function migrateFromJsonl(database, memoryDir) {
  const startedAt = Date.now();
  let taskCount = 0, projectCount = 0, workflowCount = 0;

  // Tasks: project latest state from events.jsonl
  const tasksEventsPath = path.join(memoryDir, "tasks", "events.jsonl");
  if (fs.existsSync(tasksEventsPath)) {
    const tasks = new Map();
    const content = fs.readFileSync(tasksEventsPath, "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.entityId && event.record) {
          tasks.set(event.entityId, event.record);
        }
      } catch { /* skip malformed lines */ }
    }
    const upsert = database.prepare(`
      INSERT INTO tasks (id, title, status, priority, project, assignee, created_by, created_at, updated_at, completed_at, data)
      VALUES (@id, @title, @status, @priority, @project, @assignee, @created_by, @created_at, @updated_at, @completed_at, @data)
      ON CONFLICT(id) DO UPDATE SET
        title = @title, status = @status, priority = @priority, project = @project,
        assignee = @assignee, created_by = @created_by, created_at = @created_at,
        updated_at = @updated_at, completed_at = @completed_at, data = @data
    `);
    database.exec("BEGIN");
    try {
      for (const task of [...tasks.values()]) {
        const data = { ...task };
        upsert.run({
          id: data.id || "", title: data.title || "", status: data.status || "pending",
          priority: data.priority || "normal", project: data.project || "",
          assignee: data.assignee || data.createdBy || "", created_by: data.createdBy || "",
          created_at: data.createdAt || "", updated_at: data.updatedAt || "",
          completed_at: data.completedAt || "", data: JSON.stringify(data)
        });
        taskCount++;
      }
      database.exec("COMMIT");
    } catch (txErr) {
      database.exec("ROLLBACK");
      throw txErr;
    }
  }

  // Projects: simple JSONL
  const projectsPath = path.join(memoryDir, "projects", "projects.jsonl");
  if (fs.existsSync(projectsPath)) {
    const content = fs.readFileSync(projectsPath, "utf8");
    database.exec("BEGIN");
    try {
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const project = JSON.parse(line);
          upsertProject(database, project);
          projectCount++;
        } catch { /* skip */ }
      }
      database.exec("COMMIT");
    } catch (txErr) {
      database.exec("ROLLBACK");
      throw txErr;
    }
  }

  // Workflows: simple JSONL
  const workflowsPath = path.join(memoryDir, "workflows", "workflows.jsonl");
  if (fs.existsSync(workflowsPath)) {
    const content = fs.readFileSync(workflowsPath, "utf8");
    database.exec("BEGIN");
    try {
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const workflow = JSON.parse(line);
          upsertWorkflow(database, workflow);
          workflowCount++;
        } catch { /* skip */ }
      }
      database.exec("COMMIT");
    } catch (txErr) {
      database.exec("ROLLBACK");
      throw txErr;
    }
  }

  database.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)")
    .run("migrated_at", new Date().toISOString());
  database.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)")
    .run("migrated_from", "jsonl");

  return {
    tasks: taskCount,
    projects: projectCount,
    workflows: workflowCount,
    durationMs: Date.now() - startedAt
  };
}

export function isMigrated(database) {
  const row = database.prepare("SELECT value FROM _meta WHERE key = 'migrated_at'").get();
  return !!row;
}

/**
 * One-time auto-migration guard: seed SQLite from existing JSONL when the
 * store was never migrated. Makes the mirror complete (not partial) so a
 * later read-path switch can trust it.
 * @returns {object|null} migration result, or null when already migrated
 */
export function ensureMigrated(database, memoryDir) {
  if (isMigrated(database)) return null;
  return migrateFromJsonl(database, memoryDir);
}

/**
 * Reconcile the SQLite mirror against the JSONL truth for tasks / projects /
 * workflows. Uses the same projection method as migrateFromJsonl so both
 * sides are compared on an equal footing.
 * @returns {{tasks:object,projects:object,workflows:object,consistent:boolean}}
 */
export function verifyMirror(database, memoryDir) {
  const tasksJsonl = replayLatestFromEvents(path.join(memoryDir, "tasks", "events.jsonl"));
  const projectsJsonl = readSimpleJsonl(path.join(memoryDir, "projects", "projects.jsonl"));
  const workflowsJsonl = readSimpleJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"));

  const results = {
    tasks: compareSets(tasksJsonl, listTasks(database, { limit: 1000000 })),
    projects: compareSets(projectsJsonl, listProjects(database)),
    workflows: compareSets(workflowsJsonl, listWorkflows(database))
  };
  results.consistent = Object.values(results).every((item) => item.drift === 0);
  return results;
}

function compareSets(jsonlRecords, sqliteRecords) {
  const jsonl = new Map(jsonlRecords.map((record) => [String(record.id || ""), JSON.stringify(record)]));
  const sqlite = new Map(sqliteRecords.map((record) => [String(record.id || ""), JSON.stringify(record)]));
  const missing = [...jsonl.keys()].filter((id) => !sqlite.has(id));
  const extra = [...sqlite.keys()].filter((id) => !jsonl.has(id));
  const mismatched = [...jsonl.keys()].filter((id) => jsonl.has(id) && sqlite.has(id) && jsonl.get(id) !== sqlite.get(id));
  return {
    jsonl: jsonl.size,
    sqlite: sqlite.size,
    missing,
    extra,
    mismatched,
    drift: missing.length + extra.length + mismatched.length
  };
}

function replayLatestFromEvents(file) {
  if (!fs.existsSync(file)) return [];
  const byId = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.entityId && event.record) byId.set(event.entityId, event.record);
    } catch { /* skip malformed lines */ }
  }
  return [...byId.values()];
}

function readSimpleJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const records = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record && record.id) records.push(record);
    } catch { /* skip */ }
  }
  return records;
}

export function closeStore() {
  for (const handle of dbCache.values()) {
    try { handle.close(); } catch { /* ignore */ }
  }
  dbCache.clear();
}

// ── Memory domain: SOURCE OF TRUTH ──────────────────────────
// These replace direct JSONL appends to inbox/events.jsonl. The JSONL file
// is now only a write-through export; SQLite is the authority.

function normalizeMemoryEvent(event) {
  const e = event && typeof event === "object" ? event : {};
  const text = String(
    e.text ?? e.content ?? e.summary ?? (typeof e.data === "string" ? e.data : "")
  );
  return {
    id: String(e.id || createMemoryEventId(e)),
    ts: String(e.ts || new Date().toISOString()),
    source: String(e.source || e.from || "unknown"),
    kind: String(e.kind || e.type || "event"),
    project: String(e.project || ""),
    text,
    data: JSON.stringify(e)
  };
}

function createMemoryEventId(event) {
  const base = `${event?.source || event?.from || "evt"}:${event?.kind || event?.type || "event"}:${Date.now()}`;
  let hash = 5381;
  for (let i = 0; i < base.length; i++) hash = ((hash << 5) + hash + base.charCodeAt(i)) >>> 0;
  return `mem_${hash.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Append a durable memory event to SQLite (source of truth).
 * Returns the normalized event. Caller is responsible for the JSONL export.
 */
export function appendMemoryEvent(database, event) {
  const e = normalizeMemoryEvent(event);
  database.prepare(`
    INSERT OR IGNORE INTO memory_events (id, ts, source, kind, project, text, data)
    VALUES (@id, @ts, @source, @kind, @project, @text, @data)
  `).run({
    id: e.id, ts: e.ts, source: e.source, kind: e.kind,
    project: e.project, text: e.text, data: e.data
  });
  return e;
}

export function readMemoryEventsDb(database, { limit = 1000, source = null, kind = null, project = null } = {}) {
  let sql = "SELECT id, ts, source, kind, project, text, data FROM memory_events";
  const conditions = [];
  const params = [];
  if (source) { conditions.push("source = ?"); params.push(source); }
  if (kind) { conditions.push("kind = ?"); params.push(kind); }
  if (project) { conditions.push("project = ?"); params.push(project); }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY ts DESC LIMIT ?";
  params.push(limit);
  return database.prepare(sql).all(...params).map(rowToMemoryEvent);
}

export function countMemoryEventsDb(database) {
  const row = database.prepare("SELECT COUNT(*) AS n FROM memory_events").get();
  return row ? row.n : 0;
}

export function searchMemoryEventsDb(database, query, { limit = 50 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  // trigram: join terms with AND so multi-term queries require all substrings.
  const ftsQuery = q.split(/\s+/).filter(Boolean).map((t) => `"${t.replace(/"/g, "")}"`).join(" AND ");
  const rows = database.prepare(`
    SELECT m.id, m.ts, m.source, m.kind, m.project, m.text, m.data
    FROM memory_events_fts f
    JOIN memory_events m ON m.rowid = f.rowid
    WHERE memory_events_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(ftsQuery, limit);
  return rows.map(rowToMemoryEvent);
}

function rowToMemoryEvent(row) {
  let parsed = {};
  try { parsed = JSON.parse(row.data); } catch { /* keep raw */ }
  return {
    id: row.id,
    ts: row.ts,
    source: row.source,
    kind: row.kind,
    project: row.project,
    text: row.text,
    ...parsed
  };
}

/**
 * Import existing inbox/events.jsonl into SQLite (one-time, idempotent via
 * INSERT OR IGNORE). Returns the number imported.
 */
export function migrateMemoryEvents(database, memoryDir) {
  // Import the full legacy JSONL stream: inbox staging queue + synced ledger.
  // Mirrors verifyMemory's reconciliation scope. Idempotent (INSERT OR IGNORE by id).
  const files = [
    path.join(memoryDir, "inbox", "events.jsonl"),
    path.join(memoryDir, "memories", "ledger.jsonl")
  ];
  const events = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  }
  if (events.length === 0) return 0;
  database.exec("BEGIN");
  let imported = 0;
  try {
    for (const event of events) {
      const e = normalizeMemoryEvent(event);
      const res = database.prepare(`
        INSERT OR IGNORE INTO memory_events (id, ts, source, kind, project, text, data)
        VALUES (@id, @ts, @source, @kind, @project, @text, @data)
      `).run({
        id: e.id, ts: e.ts, source: e.source, kind: e.kind,
        project: e.project, text: e.text, data: e.data
      });
      if (res.changes > 0) imported++;
    }
    database.exec("COMMIT");
  } catch (txErr) {
    database.exec("ROLLBACK");
    throw txErr;
  }
  return imported;
}

/**
 * Reconcile SQLite (truth) against the legacy JSONL stream for the memory
 * domain. The JSONL stream is split across two files: the inbox staging
 * queue (inbox/events.jsonl) and the synced ledger (memories/ledger.jsonl).
 * sync moves events from inbox → ledger, so the TOTAL JSONL count should
 * equal the SQLite count. Count-based reconciliation flags any drift.
 */
export function verifyMemory(database, memoryDir) {
  const sqliteCount = countMemoryEventsDb(database);
  const files = [
    path.join(memoryDir, "inbox", "events.jsonl"),
    path.join(memoryDir, "memories", "ledger.jsonl")
  ];
  let jsonlCount = 0;
  const filesSeen = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    filesSeen.push(path.basename(file));
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { JSON.parse(line); jsonlCount++; } catch { /* skip malformed */ }
    }
  }
  const drift = Math.abs(sqliteCount - jsonlCount);
  return { sqlite: sqliteCount, jsonl: jsonlCount, files: filesSeen, drift, consistent: drift === 0 };
}
