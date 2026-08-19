// AMH SQLite dual-write mirror (Phase 2, step: shadow writes)
//
// 作用：在 JSONL 事件流仍然是唯一真相源的前提下，把 task/project/workflow 的
// 变更同步镜像到 SQLite（amh.db），为后续"读切换"积累数据与置信度。
//
// 开启条件（两者同时满足，缺一不可）：
//   1. 环境变量 AMH_SQLITE_DUALWRITE=1
//   2. node 以 --experimental-sqlite 启动且 node:sqlite 可用
// 默认行为：完全 no-op —— 不开开关时对现有系统零影响。
//
// 失败语义：镜像失败只打 stderr 日志，绝不抛出、绝不影响 JSONL 主路径。
import path from "node:path";
import {
  openStore,
  upsertTask,
  upsertProject,
  upsertWorkflow
} from "./sqlite-store.js";

const ENABLED = process.env.AMH_SQLITE_DUALWRITE === "1";
const UPSERTERS = {
  task: upsertTask,
  project: upsertProject,
  workflow: upsertWorkflow
};
const TABLES = { task: "tasks", project: "projects", workflow: "workflows" };

function getDb(memoryDir) {
  if (!ENABLED) return null;
  try {
    return openStore(path.join(path.resolve(memoryDir), "amh.db"));
  } catch (error) {
    console.error("[sqlite-dualwrite] open db failed:", error.message);
    return null;
  }
}

function withTransaction(db, fn) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw error;
  }
}

/**
 * Upsert a batch of records into SQLite. No-op when disabled.
 * @returns {boolean} true if mirrored successfully
 */
export function mirrorUpsert(memoryDir, entity, records) {
  if (!ENABLED || !Array.isArray(records) || records.length === 0) return false;
  const upsert = UPSERTERS[entity];
  if (!upsert) return false;
  const db = getDb(memoryDir);
  if (!db) return false;
  try {
    withTransaction(db, () => {
      for (const record of records) {
        if (record) upsert(db, record);
      }
    });
    return true;
  } catch (error) {
    console.error(`[sqlite-dualwrite] upsert ${entity} x${records.length} failed:`, error.message);
    return false;
  }
}

/**
 * Delete one row from SQLite. No-op when disabled.
 */
export function mirrorDelete(memoryDir, entity, id) {
  if (!ENABLED || !id) return false;
  const table = TABLES[entity];
  if (!table) return false;
  const db = getDb(memoryDir);
  if (!db) return false;
  try {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(String(id));
    return true;
  } catch (error) {
    console.error(`[sqlite-dualwrite] delete ${entity}/${id} failed:`, error.message);
    return false;
  }
}

/**
 * Full-set convergence sync: upsert every record, delete SQLite rows whose id
 * is no longer present in the JSONL-side set. Use only at call sites that
 * carry full-set semantics (writeEntityRecords materializes a full projection).
 * @returns {boolean} true if mirrored successfully
 */
export function mirrorSync(memoryDir, entity, records) {
  if (!ENABLED) return false;
  const table = TABLES[entity];
  const upsert = UPSERTERS[entity];
  if (!table || !upsert) return false;
  const db = getDb(memoryDir);
  if (!db) return false;
  const keepIds = new Set((Array.isArray(records) ? records : []).filter(Boolean).map((r) => String(r.id || "")).filter(Boolean));
  try {
    withTransaction(db, () => {
      for (const record of records || []) {
        if (record) upsert(db, record);
      }
      const rows = db.prepare(`SELECT id FROM ${table}`).all();
      for (const row of rows) {
        if (!keepIds.has(String(row.id))) {
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(String(row.id));
        }
      }
    });
    return true;
  } catch (error) {
    console.error(`[sqlite-dualwrite] sync ${entity} x${records ? records.length : 0} failed:`, error.message);
    return false;
  }
}

/** For tests / diagnostics: is the mirror enabled in this process? */
export function isMirrorEnabled() {
  return ENABLED;
}
