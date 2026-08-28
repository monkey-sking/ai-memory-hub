import fs from "node:fs";
import path from "node:path";
import * as memoryStore from "./memory-store.js";

// Suffix identifying the durable memory-event log. A write targeting a file
// with this suffix ALSO lands in SQLite (memory_events) via memoryStore, so
// the JSONL + SQLite representations stay in lock-step from a single call site.
export const MEMORY_EVENTS_SUFFIX = path.join("inbox", "events.jsonl");

/**
 * Unified JSONL append for the whole hub — the single writer chokepoint every
 * module should use instead of a private `fs.appendFileSync` wrapper.
 *
 * Behaviour:
 *   - creates the parent dir (recursive) if missing
 *   - appends exactly one JSON line (appendFileSync keeps O_APPEND semantics;
 *     hub-level concurrency is guarded by `withHubLock` at the call sites)
 *   - if the target is the memory-event log, also writes the SQLite truth source
 *
 * Non-memory-domain files (relations/events.jsonl, wake/*, state/*, packs/*)
 * are written as plain JSONL only — the SQLite branch never fires for them,
 * preserving each domain's existing storage layout.
 *
 * @param {string} file - absolute or relative JSONL path
 * @param {any} value - value to serialize as a single line
 */
export function appendJsonl(file, value) {
  const resolved = path.resolve(file);
  if (resolved.endsWith(MEMORY_EVENTS_SUFFIX)) {
    try {
      memoryStore.appendMemoryEvent(path.dirname(path.dirname(resolved)), value);
    } catch (err) {
      console.error("[appendJsonl] memory-store write failed:", err.message);
    }
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.appendFileSync(resolved, `${JSON.stringify(value)}\n`, "utf8");
}
