// Per-domain command: `sqlite` (storage-layer introspection & reconciliation).
// Reads its deps via DI so this module never reaches into index.js internals
// (avoids the giant-file function-hoisting collision that bit us at 2854/7470).
import path from "node:path";
import {
  openStore,
  closeStore,
  isMigrated,
  migrateFromJsonl,
  listTasks,
  listProjects,
  listWorkflows,
  verifyMirror,
  verifyMemory,
  migrateMemoryEvents,
} from "../sqlite-store.js";

export function sqliteCommand(argv, { loadConfig }) {
  const action = String(argv[0] || "status");
  const config = loadConfig();
  const dbPath = path.join(path.resolve(config.memoryDir), "amh.db");
  const db = openStore(dbPath);
  if (!db) {
    console.error("node:sqlite unavailable. Start node with --experimental-sqlite to use SQLite features.");
    return 1;
  }
  try {
    if (action === "migrate") {
      if (isMigrated(db)) {
        console.log("Already migrated. Row counts:");
      } else {
        const result = migrateFromJsonl(db, config.memoryDir);
        console.log(`Migration done in ${result.durationMs}ms: tasks=${result.tasks} projects=${result.projects} workflows=${result.workflows}`);
      }
      const memImported = migrateMemoryEvents(db, config.memoryDir);
      console.log(`memory events imported: ${memImported}`);
    }
    if (action === "migrate" || action === "status") {
      const tasks = listTasks(db, { limit: 1000000 });
      const projects = listProjects(db);
      const workflows = listWorkflows(db);
      console.log(`SQLite (${dbPath})`);
      console.log(`  migrated: ${isMigrated(db) ? "yes" : "no"}`);
      console.log(`  tasks=${tasks.length} projects=${projects.length} workflows=${workflows.length}`);
      console.log(`  dual-write mirror: ${process.env.AMH_SQLITE_DUALWRITE === "0" ? "OFF (env AMH_SQLITE_DUALWRITE=0)" : "ON (default; opt out with AMH_SQLITE_DUALWRITE=0)"}`);
      if (action === "status") {
        const verdict = verifyMirror(db, config.memoryDir);
        const mem = verifyMemory(db, config.memoryDir);
        console.log(`  verify: ${verdict.consistent && mem.consistent ? "consistent" : "DRIFT DETECTED (run \`sqlite verify\` for detail)"}`);
      }
      return 0;
    }
    if (action === "verify") {
      const verdict = verifyMirror(db, config.memoryDir);
      for (const entity of ["tasks", "projects", "workflows"]) {
        const item = verdict[entity];
        console.log(`${entity}: jsonl=${item.jsonl} sqlite=${item.sqlite} drift=${item.drift}`);
        if (item.missing.length) console.log(`  missing in sqlite: ${item.missing.slice(0, 10).join(", ")}${item.missing.length > 10 ? ` (+${item.missing.length - 10})` : ""}`);
        if (item.extra.length) console.log(`  extra in sqlite: ${item.extra.slice(0, 10).join(", ")}${item.extra.length > 10 ? ` (+${item.extra.length - 10})` : ""}`);
        if (item.mismatched.length) console.log(`  content mismatch: ${item.mismatched.slice(0, 10).join(", ")}${item.mismatched.length > 10 ? ` (+${item.mismatched.length - 10})` : ""}`);
      }
      // Memory domain: single-writer truth (SQLite) vs legacy JSONL stream
      const mem = verifyMemory(db, config.memoryDir);
      console.log(`memory: sqlite=${mem.sqlite} jsonl(${(mem.files || []).join("+")})=${mem.jsonl} drift=${mem.drift}`);
      const allConsistent = verdict.consistent && mem.consistent;
      console.log(`verdict: ${allConsistent ? "consistent — JSONL 与 SQLite 完全一致" : "DRIFT DETECTED — 建议先跑 \`ai-memory-hub sqlite resync\` 从 JSONL 重建 SQLite"}`);
      return allConsistent ? 0 : 2;
    }
    if (action === "resync") {
      db.exec("DELETE FROM tasks");
      db.exec("DELETE FROM projects");
      db.exec("DELETE FROM workflows");
      db.exec("DELETE FROM memory_events");
      db.exec("DELETE FROM _meta WHERE key = 'migrated_at'");
      const result = migrateFromJsonl(db, config.memoryDir);
      console.log(`Resync done in ${result.durationMs}ms: tasks=${result.tasks} projects=${result.projects} workflows=${result.workflows}`);
      const memImported = migrateMemoryEvents(db, config.memoryDir);
      console.log(`memory events imported: ${memImported}`);
      return 0;
    }
    console.error(`Unknown sqlite action: ${action}. Usage: ai-memory-hub sqlite <status|verify|migrate|resync>`);
    return 1;
  } finally {
    closeStore();
  }
}
