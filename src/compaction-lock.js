/**
 * Compaction lock — three-phase event-sourcing marker for atomic memory
 * compaction / archival.
 *
 * WHY: AMH may later compact or archive its event-sourced memory. That work
 * spans several JSONL appends and is not atomic on its own. If the process
 * crashes mid-way, we must be able to tell "this compaction was interrupted"
 * apart from "this compaction finished cleanly" — otherwise a half-done pass
 * would be mis-reported as complete.
 *
 * HOW: a compaction pass writes exactly three markers to the hub's own event
 * log, in order:
 *
 *   compaction.start    -> began; carries a sessionId + (optional) metadata
 *   compaction.summary  -> intermediate summary of what was compacted
 *   compaction.end      -> finished cleanly (the only "safe" terminal state)
 *
 * `scanCompactionLocks` replays the events and reports every start/summary
 * that has no matching end — i.e. an *orphan lock* = a crash interrupted the
 * pass. A future compactor should detect these and resume/abort instead of
 * trusting the data as fully compacted.
 *
 * This module only emits and scans markers; it does NOT itself compact. It is
 * the atomicity primitive that a compactor calls into. No task data is touched
 * here, so it never breaks existing task-list compatibility and needs no
 * migration of existing records.
 *
 * @module compaction-lock
 */
import fs from "node:fs";
import path from "node:path";
import { appendJsonl } from "./event-writer.js";

export const COMPACTION_START = "compaction.start";
export const COMPACTION_SUMMARY = "compaction.summary";
export const COMPACTION_END = "compaction.end";

const PHASE_TO_EVENT = {
  start: COMPACTION_START,
  summary: COMPACTION_SUMMARY,
  end: COMPACTION_END,
};

const COMPLETING_EVENTS = new Set([COMPACTION_END]);

/** True when the phase is one a compaction pass emits. */
export function isCompactionEvent(type) {
  return type === COMPACTION_START || type === COMPACTION_SUMMARY || type === COMPACTION_END;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(seed) {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build the marker event object for a compaction phase.
 * @param {string} sessionId - scopes one compaction pass (any string)
 * @param {string} phase - 'start' | 'summary' | 'end'
 * @param {object} [metadata] - extra fields (e.g. { count, bytes, source })
 */
export function makeCompactionEvent(sessionId, phase, metadata = {}) {
  if (!PHASE_TO_EVENT[phase]) {
    throw new Error(`Invalid compaction phase '${phase}'. Expected start|summary|end.`);
  }
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("compaction sessionId is required.");
  }
  return {
    id: makeId(),
    schemaVersion: 1,
    ts: nowIso(),
    source: "ai-memory-hub",
    entity: "compaction",
    action: phase,
    type: PHASE_TO_EVENT[phase],
    entityId: sessionId,
    reason: `compaction:${phase}`,
    record: {
      sessionId,
      phase,
      ...metadata,
    },
  };
}

/**
 * Append a compaction marker to the given events.jsonl file (hub-owned log).
 * @param {string} file - absolute or relative path to the JSONL events file
 * @param {string} sessionId
 * @param {string} phase - 'start' | 'summary' | 'end'
 * @param {object} [metadata]
 * @returns {object} the written event
 */
export function appendCompactionMarker(file, sessionId, phase, metadata = {}) {
  const event = makeCompactionEvent(sessionId, phase, metadata);
  appendJsonl(file, event);
  return event;
}

/**
 * Begin a compaction pass. If an un-ended lock already exists for the same
 * session, it is reported as an orphan (the caller should decide to resume or
 * abort before continuing).
 *
 * @param {string} file - events.jsonl path to read + append
 * @param {string} sessionId
 * @param {object} [metadata]
 * @returns {{event:object, orphan:boolean, priorLocks:object[]}}
 */
export function acquireCompactionLock(file, sessionId, metadata = {}) {
  const events = readCompactionEvents(file);
  const priorLocks = scanCompactionLocks(events);
  const priorForSession = priorLocks.filter((l) => l.sessionId === sessionId);
  const event = appendCompactionMarker(file, sessionId, "start", metadata);
  return { event, orphan: priorForSession.length > 0, priorLocks: priorForSession };
}

/**
 * Emit the intermediate summary phase for a compaction pass.
 */
export function summarizeCompaction(file, sessionId, metadata = {}) {
  return appendCompactionMarker(file, sessionId, "summary", metadata);
}

/**
 * Emit the terminal end marker — the only "safe" completion state.
 */
export function releaseCompactionLock(file, sessionId, metadata = {}) {
  return appendCompactionMarker(file, sessionId, "end", metadata);
}

/**
 * Read compaction marker events from a JSONL file (tolerates missing file).
 * @param {string} file
 * @returns {object[]} marker events in file order
 */
export function readCompactionEvents(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return [];
  const events = [];
  try {
    const lines = fs.readFileSync(resolved, "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev && isCompactionEvent(ev.type)) events.push(ev);
      } catch {
        /* skip malformed lines; the log may be mid-write */
      }
    }
  } catch {
    /* unreadable file -> treat as empty */
  }
  return events;
}

/**
 * Detect orphan compaction locks: every start/summary marker that has no
 * matching end marker for the same session (and no LATER start that supersedes
 * it). Returns the orphans with the reason they are considered orphaned.
 *
 * @param {object[]} events - compaction markers (from readCompactionEvents)
 * @returns {object[]} orphan locks, each { sessionId, type, ts, event, reason }
 */
export function scanCompactionLocks(events) {
  const bySession = new Map();
  for (const ev of events) {
    const sessionId = ev.entityId || ev.record?.sessionId || "";
    if (!sessionId) continue;
    if (!bySession.has(sessionId)) bySession.set(sessionId, []);
    bySession.get(sessionId).push(ev);
  }

  const orphans = [];
  for (const [sessionId, sessionEvents] of bySession) {
    let open = false;
    let openEvent = null;
    let openType = null;
    for (const ev of sessionEvents) {
      if (COMPLETING_EVENTS.has(ev.type)) {
        open = false;
        openEvent = null;
        openType = null;
      } else {
        // start or summary opens/re-opens the lock window; end closes it.
        // A summary after a start keeps the same logical lock open; a fresh
        // start supersedes a prior one.
        open = true;
        openEvent = ev;
        openType = ev.type;
      }
    }
    if (open) {
      orphans.push({
        sessionId,
        type: openType,
        ts: openEvent?.ts || "",
        event: openEvent,
        reason: `compaction:${openType} with no matching compaction:end`,
      });
    }
  }
  return orphans;
}

/**
 * Convenience: is a given session currently mid-compaction (started, not ended)?
 * @param {object[]} events
 * @param {string} sessionId
 */
export function isCompactionLocked(events, sessionId) {
  return scanCompactionLocks(events).some((l) => l.sessionId === sessionId);
}