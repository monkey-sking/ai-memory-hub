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

let db = null;

/**
 * Open (or create) the SQLite database at the given path.
 * Returns the Database handle or null if node:sqlite is unavailable.
 */
export function openStore(dbPath) {
  if (db) return db;
  if (!Database) {
    console.warn("[sqlite-store] node:sqlite not available — falling back to JSONL");
    return null;
  }
  db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  initSchema(db);
  return db;
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

export function closeStore() {
  if (db) {
    db.close();
    db = null;
  }
}
