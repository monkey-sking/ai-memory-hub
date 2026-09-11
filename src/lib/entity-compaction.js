// Entity event-log compaction — the *planner* half of `amh compact`.
//
// WHY THIS EXISTS
// ---------------
// Tasks / projects / workflows / prompts are stored event-sourced: every
// mutation appends one event carrying a **full snapshot** of the record
// (see createEntityEvent in entity-store.js). So a task that is touched 48
// times contributes 48 complete copies of itself — including its entire
// `notes` array — to `tasks/events.jsonl`. Growth is therefore O(n²) in the
// number of updates, and every `amh backup` copies that log verbatim.
//
// Measured on the real hub before this module existed: 424 task events for
// only 65 distinct tasks, 2.08 MB total, of which 1.37 MB (66%) was the
// repeatedly re-snapshotted `notes` array.
//
// WHAT A FOLD IS
// --------------
// The projection file is a *pure replay* of the events (last state event per
// id wins; a delete removes the id). So for each entity id we only need the
// event that decides the current state:
//
//   * last state event (upsert/create/update/snapshot)  -> keep it
//   * last event is a delete                           -> keep nothing for
//                                                         that id (an absent
//                                                         entity replays the
//                                                         same as a deleted one)
//   * every earlier event for that id                  -> drop
//   * anything we do not understand (compaction markers, other entity types,
//     events without an id, malformed lines)           -> keep verbatim
//
// Folding is state-preserving *by construction*, but "by construction" is not
// a guarantee — the command re-derives the projection from both the old and the
// new event stream and refuses to write unless they are identical.
//
// Dropped lines are not destroyed: the command archives them gzipped, so the
// audit trail survives while the hot log (the one that gets rewritten, backed
// up and re-read on every replay) shrinks back to its information content.
//
// This module is pure data-in/data-out and imports nothing — the atomicity of
// the surrounding write is `src/compaction-lock.js`'s job, and the file IO is
// the command's.
//
// @module entity-compaction

/** Actions that carry a full record snapshot able to reproduce state. */
export const STATE_ACTIONS = new Set(["upsert", "create", "update", "snapshot"]);
/** Actions that retire an entity id. */
export const DELETE_ACTIONS = new Set(["delete", "remove", "tombstone"]);

/** Separator for the entity+id composite key (NUL cannot appear in either). */
const KEY_SEP = "\u0000";
/** Event-type prefix used by src/compaction-lock.js for its three-phase markers. */
const MARKER_PREFIX = "compaction.";

function actionOf(event) {
  return String(event.action || String(event.type || "").split(".").pop() || "").toLowerCase();
}

/** Recognise a compaction marker, if this event is one. */
function markerOf(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const type = String(event.type || "");
  if (!type.startsWith(MARKER_PREFIX)) return null;
  const sessionId = String(event.entityId || event.record?.sessionId || "").trim();
  if (!sessionId) return null;
  return { sessionId, phase: type.slice(MARKER_PREFIX.length) };
}

/**
 * Decide what an event line means for compaction.
 *
 * @param {object|null} event - parsed event, or null when the line is not JSON
 * @returns {{kind:"state"|"delete"|"marker"|"opaque", key?:string, entity?:string, entityId?:string, sessionId?:string, phase?:string}}
 */
export function classifyEntityEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { kind: "opaque" };
  }
  const marker = markerOf(event);
  if (marker) {
    return {
      kind: "marker",
      key: `marker${KEY_SEP}${marker.sessionId}${KEY_SEP}${marker.phase}`,
      entity: "compaction",
      entityId: marker.sessionId,
      sessionId: marker.sessionId,
      phase: marker.phase
    };
  }
  const entity = String(event.entity || "");
  const entityId = String(event.entityId || event.record?.id || "").trim();
  if (!entityId) {
    // replayEntityEvents skips these too; keeping them is always safe.
    return { kind: "opaque" };
  }
  const action = actionOf(event);
  if (DELETE_ACTIONS.has(action)) return { kind: "delete", entity, entityId, key: entity + KEY_SEP + entityId };
  if (STATE_ACTIONS.has(action)) return { kind: "state", entity, entityId, key: entity + KEY_SEP + entityId };
  return { kind: "opaque" };
}

function bytesOf(text) {
  return Buffer.byteLength(text || "", "utf8");
}

/**
 * Plan a fold over raw JSONL lines.
 *
 * Returns the original lines partitioned into `keep` / `drop`, plus stats for
 * the CLI to print. `keep` is ordered so that replaying it reproduces both the
 * same records *and* the same record order as the original stream; `drop` is in
 * file order for the archive. Nothing is mutated; callers can
 * preview with confidence.
 *
 * @param {string[]} rawLines - file content split on "\n" (blank lines allowed)
 * @returns {{
 *   keep: {index:number, raw:string, size:number}[],
 *   drop: {index:number, raw:string, key:string, entity:string, entityId:string, size:number}[],
 *   stats: {
 *     totalEvents:number, keptEvents:number, droppedEvents:number,
 *     totalBytes:number, keptBytes:number, droppedBytes:number,
 *     ids:number, foldedIds:number, maxEventsPerId:number, dropRatio:number
 *   }
 * }}
 */
export function planCompaction(rawLines) {
  const lines = Array.isArray(rawLines) ? rawLines : [];

  const entries = [];
  let totalBytes = 0;
  let totalEvents = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = String(lines[index] ?? "");
    if (!raw.trim()) continue; // blank separators are dropped implicitly
    totalEvents += 1;
    const size = bytesOf(raw) + 1; // +1 for the newline it will re-occupy
    totalBytes += size;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const cls = classifyEntityEvent(parsed);
    entries.push({ index, raw, size, ...cls });
  }

  // Which line is the state-deciding event for each entity id? We also remember
  // the position where each id *first* appeared, because that is what decides
  // the record order the replay produces.
  const lastStatefulByKey = new Map();
  const eventsPerKey = new Map();
  const firstIndexByKey = new Map();
  for (const entry of entries) {
    if (entry.kind !== "state" && entry.kind !== "delete") continue;
    if (!firstIndexByKey.has(entry.key)) firstIndexByKey.set(entry.key, entry.index);
    lastStatefulByKey.set(entry.key, entry);
    eventsPerKey.set(entry.key, (eventsPerKey.get(entry.key) || 0) + 1);
  }

  // A trailing delete means the id no longer exists: nothing needs to survive.
  const retiredKeys = new Set();
  for (const [key, entry] of lastStatefulByKey) {
    if (entry.kind === "delete") retiredKeys.add(key);
  }

  // Compaction markers are bookkeeping, not entity state. A `start` with no
  // `end` is a genuine orphan lock and must survive so it can be reported; an
  // `end`/`summary` with no `start` is pure noise (it can only come from a
  // compactor that lost its own start marker) and is dropped.
  const startedSessions = new Set();
  for (const entry of entries) {
    if (entry.kind === "marker" && entry.phase === "start") startedSessions.add(entry.sessionId);
  }
  const isOrphanMarker = (entry) =>
    entry.kind === "marker" && entry.phase !== "start" && !startedSessions.has(entry.sessionId);

  // Anchors are emitted at their id's *first-appearance* position, not at the
  // position of the event we happen to keep. Replay inserts records in
  // first-appearance order, so emitting anchors at their original anchor index
  // would silently reorder the projection file (and with it `task list` output).
  // Opaque lines keep their own index, which preserves their relative position.
  const staged = [];
  const drop = [];
  let keptBytes = 0;
  let droppedBytes = 0;
  for (const entry of entries) {
    if (entry.kind === "opaque") {
      staged.push({ sortKey: entry.index, out: { index: entry.index, raw: entry.raw, size: entry.size } });
      keptBytes += entry.size;
      continue;
    }
    if (entry.kind === "marker") {
      if (isOrphanMarker(entry)) {
        drop.push({
          index: entry.index,
          raw: entry.raw,
          key: entry.key,
          entity: entry.entity,
          entityId: entry.entityId,
          size: entry.size,
        });
        droppedBytes += entry.size;
      } else {
        staged.push({ sortKey: entry.index, out: { index: entry.index, raw: entry.raw, size: entry.size } });
        keptBytes += entry.size;
      }
      continue;
    }
    const isAnchor = !retiredKeys.has(entry.key) && lastStatefulByKey.get(entry.key) === entry;
    if (isAnchor) {
      staged.push({
        sortKey: firstIndexByKey.get(entry.key),
        out: { index: entry.index, raw: entry.raw, size: entry.size }
      });
      keptBytes += entry.size;
    } else {
      drop.push({
        index: entry.index,
        raw: entry.raw,
        key: entry.key,
        entity: entry.entity,
        entityId: entry.entityId,
        size: entry.size,
      });
      droppedBytes += entry.size;
    }
  }
  // sortKeys are unique (an index is either an opaque line or one group's first
  // event of exactly one group), so this ordering is total and stable.
  staged.sort((left, right) => left.sortKey - right.sortKey);
  const keep = staged.map((item) => item.out);

  let maxEventsPerId = 0;
  let foldedIds = 0;
  for (const count of eventsPerKey.values()) {
    if (count > maxEventsPerId) maxEventsPerId = count;
    if (count > 1) foldedIds += 1;
  }

  return {
    keep,
    drop,
    stats: {
      totalEvents,
      keptEvents: keep.length,
      droppedEvents: drop.length,
      totalBytes,
      keptBytes,
      droppedBytes,
      ids: eventsPerKey.size,
      foldedIds,
      maxEventsPerId,
      dropRatio: totalBytes > 0 ? droppedBytes / totalBytes : 0,
    },
  };
}

/** Split file content into lines, dropping a single trailing empty line. */
export function splitJsonl(content) {
  const text = String(content || "");
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Render the kept entries back into file content (one JSONL line each).
 * Kept lines are written verbatim — we never re-serialize a record, so
 * whitespace, key order and unknown fields survive untouched.
 */
export function renderCompacted(keep) {
  if (!Array.isArray(keep) || keep.length === 0) return "";
  return `${keep.map((entry) => entry.raw).join("\n")}\n`;
}

/** Human-friendly byte formatting for CLI output. */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}
