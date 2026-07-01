/**
 * FTS5 full-text search module for AMH.
 *
 * Uses node:sqlite built-in module (Node 24+) for SQLite FTS5 indexing.
 * Chinese tokenization via character spacing + unicode61 tokenizer.
 * BM25 ranking for relevance scoring.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const INDEX_DB_NAME = "search-index.db";

/**
 * Preprocess text for FTS5: add spaces between CJK characters
 * so the unicode61 tokenizer can index them individually.
 */
export function tokenizeChinese(text) {
  if (!text) return "";
  return String(text)
    .replace(/([\u4e00-\u9fff\u3400-\u4dbf])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Open or create the FTS5 search index database.
 */
export function createSearchDb(memoryDir) {
  const dbPath = path.join(memoryDir, INDEX_DB_NAME);
  const isNew = !fs.existsSync(dbPath);
  const db = new DatabaseSync(dbPath);

  if (isNew) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        entity_type,
        entity_id,
        title,
        content,
        kind,
        project,
        tags,
        ts,
        tokenize='unicode61'
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    setMeta(db, "schema_version", "1");
    setMeta(db, "created_at", new Date().toISOString());
  }

  return db;
}

function getMeta(db, key) {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return row ? row.value : null;
  } catch {
    return null;
  }
}

function setMeta(db, key, value) {
  const safeKey = String(key || "").replace(/'/g, "''");
  const safeValue = String(value || "").replace(/'/g, "''");
  db.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('${safeKey}', '${safeValue}')`);
}

/**
 * Clear and rebuild the search index from all data sources.
 */
export function rebuildIndex(db, memoryDir) {
  // Clear existing index
  db.exec("DELETE FROM search_index");

  let indexed = 0;

  // Index memories/ledger
  const ledgerPath = path.join(memoryDir, "memories", "ledger.jsonl");
  if (fs.existsSync(ledgerPath)) {
    const lines = fs.readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (!record.id) continue;
        const content = tokenizeChinese(record.text || "");
        const title = tokenizeChinese(record.metadata?.title || "");
        const tags = Array.isArray(record.tags) ? record.tags.join(" ") : "";
        db.exec(`INSERT INTO search_index (entity_type, entity_id, title, content, kind, project, tags, ts)
          VALUES ('memory', '${esc(record.id)}', '${esc(title)}', '${esc(content)}', '${esc(record.kind || "")}', '${esc(record.project || "")}', '${esc(tokenizeChinese(tags))}', '${esc(record.ts || "")}')`);
        indexed++;
      } catch { /* skip malformed lines */ }
    }
  }

  // Index tasks
  const tasksPath = path.join(memoryDir, "tasks", "tasks.jsonl");
  if (fs.existsSync(tasksPath)) {
    const lines = fs.readFileSync(tasksPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (!record.id) continue;
        const content = tokenizeChinese(record.description || record.handoff || "");
        const title = tokenizeChinese(record.title || "");
        db.exec(`INSERT INTO search_index (entity_type, entity_id, title, content, kind, project, tags, ts)
          VALUES ('task', '${esc(record.id)}', '${esc(title)}', '${esc(content)}', '${esc(record.status || "")}', '${esc(record.project || "")}', '', '${esc(record.createdAt || "")}')`);
        indexed++;
      } catch { /* skip */ }
    }
  }

  // Index radio messages
  const radioPath = path.join(memoryDir, "radio", "messages.jsonl");
  if (fs.existsSync(radioPath)) {
    const lines = fs.readFileSync(radioPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (!record.id) continue;
        const content = tokenizeChinese(record.text || "");
        db.exec(`INSERT INTO search_index (entity_type, entity_id, title, content, kind, project, tags, ts)
          VALUES ('radio', '${esc(record.id)}', '', '${esc(content)}', '${esc(record.type || "")}', '${esc(record.project || "")}', '', '${esc(record.ts || "")}')`);
        indexed++;
      } catch { /* skip */ }
    }
  }

  // Index workflows
  const workflowsPath = path.join(memoryDir, "workflows", "workflows.jsonl");
  if (fs.existsSync(workflowsPath)) {
    const lines = fs.readFileSync(workflowsPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (!record.id) continue;
        const content = tokenizeChinese(record.description || "");
        const title = tokenizeChinese(record.title || "");
        db.exec(`INSERT INTO search_index (entity_type, entity_id, title, content, kind, project, tags, ts)
          VALUES ('workflow', '${esc(record.id)}', '${esc(title)}', '${esc(content)}', '${esc(record.status || "")}', '${esc(record.project || "")}', '', '${esc(record.createdAt || "")}')`);
        indexed++;
      } catch { /* skip */ }
    }
  }

  // Index prompt templates
  const promptsPath = path.join(memoryDir, "prompts", "templates.jsonl");
  if (fs.existsSync(promptsPath)) {
    const lines = fs.readFileSync(promptsPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (!record.id) continue;
        const content = tokenizeChinese(record.content || "");
        const title = tokenizeChinese(record.name || "");
        db.exec(`INSERT INTO search_index (entity_type, entity_id, title, content, kind, project, tags, ts)
          VALUES ('prompt', '${esc(record.id)}', '${esc(title)}', '${esc(content)}', '${esc(record.type || "")}', '', '', '${esc(record.createdAt || "")}')`);
        indexed++;
      } catch { /* skip */ }
    }
  }

  setMeta(db, "last_rebuilt", new Date().toISOString());
  setMeta(db, "total_indexed", String(indexed));
  return indexed;
}

/**
 * Search the FTS5 index with BM25 ranking.
 */
export function searchIndex(db, query, { limit = 20, entityType = "" } = {}) {
  const tokenizedQuery = tokenizeChinese(query);
  if (!tokenizedQuery.trim()) return [];

  // Build FTS5 MATCH query
  // For Chinese, each character is a separate token, so we use OR to match any
  const terms = tokenizedQuery.split(/\s+/).filter(Boolean);
  const matchExpr = terms.map((t) => `"${t}"`).join(" OR ");

  let sql = `SELECT rowid, entity_type, entity_id, title, content, kind, project, tags, ts, rank
    FROM search_index WHERE search_index MATCH ? ORDER BY rank`;

  if (entityType) {
    sql = `SELECT rowid, entity_type, entity_id, title, content, kind, project, tags, ts, rank
      FROM search_index WHERE search_index MATCH ? AND entity_type = ? ORDER BY rank`;
  }

  try {
    const rows = entityType
      ? db.prepare(sql).all(matchExpr, entityType)
      : db.prepare(sql).all(matchExpr);

    return rows.slice(0, limit).map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      title: detokenizeChinese(row.title),
      content: detokenizeChinese(row.content),
      kind: row.kind,
      project: row.project,
      tags: row.tags,
      ts: row.ts,
      score: Math.abs(row.rank) // BM25 rank is negative, flip to positive
    }));
  } catch {
    // Fallback: if MATCH fails (e.g., special characters), do LIKE search
    return searchIndexLike(db, query, { limit, entityType });
  }
}

/**
 * Fallback LIKE-based search for queries that FTS5 can't handle.
 */
function searchIndexLike(db, query, { limit = 20, entityType = "" }) {
  const tokenized = tokenizeChinese(query);
  const likePattern = `%${escapeLikePattern(tokenized)}%`;

  let sql = `SELECT rowid, entity_type, entity_id, title, content, kind, project, tags, ts
    FROM search_index WHERE (content LIKE ? OR title LIKE ?)`;
  const params = [likePattern, likePattern];

  if (entityType) {
    sql += ` AND entity_type = ?`;
    params.push(entityType);
  }

  sql += " LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  return rows.map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: detokenizeChinese(row.title),
    content: detokenizeChinese(row.content),
    kind: row.kind,
    project: row.project,
    tags: row.tags,
    ts: row.ts,
    score: 1 // LIKE doesn't have ranking
  }));
}

/**
 * Remove spaces added by tokenizeChinese for display.
 */
function detokenizeChinese(text) {
  if (!text) return "";
  // Remove spaces between CJK characters
  return text.replace(/([\u4e00-\u9fff\u3400-\u4dbf])\s+([\u4e00-\u9fff\u3400-\u4dbf])/g, "$1$2");
}

/**
 * Get index statistics.
 */
export function getIndexStats(db) {
  let total = 0;
  const byType = {};

  try {
    const rows = db.prepare("SELECT entity_type, COUNT(*) as cnt FROM search_index GROUP BY entity_type").all();
    for (const row of rows) {
      byType[row.entity_type] = row.cnt;
      total += row.cnt;
    }
  } catch { /* empty index */ }

  return {
    total,
    byType,
    lastRebuilt: getMeta(db, "last_rebuilt") || "never",
    schemaVersion: getMeta(db, "schema_version") || "unknown"
  };
}

/**
 * Escape LIKE wildcard characters.
 */
function escapeLikePattern(str) {
  return String(str || "").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Escape single quotes for SQL.
 */
function esc(str) {
  return String(str || "").replace(/'/g, "''");
}
