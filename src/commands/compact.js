// `amh compact` — fold superseded entity events out of the event logs.
//
// Reads the *why* first: src/lib/entity-compaction.js explains why the logs
// grow O(n²) and what a fold preserves.
//
// Contract shared with `health repair` / `capture repair`:
//   * default is a DRY RUN — it prints the plan and touches nothing
//   * `--apply` backs the hub up first, then writes (`--no-backup` opts out;
//     scheduled `--auto` runs should use it — see the comment in compactCommand)
//   * the write is wrapped in the hub lock and bracketed by the three-phase
//     compaction markers from src/compaction-lock.js, so an interrupted run
//     is detectable (orphan lock) instead of silently half-done
//   * it refuses to write unless the projection replayed from the folded log
//     is byte-identical to the projection replayed from the original — the
//     fold is provably state-preserving or it does not happen
//   * dropped events are archived gzipped, never destroyed
//
// Idempotent: a second run finds nothing to fold and reports a no-op. That is
// what makes `--auto` safe to schedule.
//
// Dependency injection: this module never imports src/index.js.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { getOption, hasFlag, parsePositiveIntegerOption, positionalArgs } from "../lib/cli.js";
import { writeFileAtomic } from "../atomic-write.js";
import { withHubLock } from "../lib/io.js";
import { getEntityEventsFile, getEntityProjectionFile, readEntityEvents, replayEntityEvents, materializeEntityProjection } from "../lib/entity-store.js";
import { mirrorSync } from "../sqlite-dualwrite.js";
import {
  getProjectEventStoreDefinition,
  getPromptEventStoreDefinition,
  getTaskEventStoreDefinition,
  getWorkflowEventStoreDefinition
} from "../lib/entity-models.js";
import { formatBytes, planCompaction, renderCompacted, splitJsonl } from "../lib/entity-compaction.js";
import { acquireCompactionLock, releaseCompactionLock, summarizeCompaction } from "../compaction-lock.js";

// 归档保留份数：折叠是少见的运维动作，5 份足够回溯「哪一轮动了什么」。
const ARCHIVE_KEEP = 5;
// `--auto` 的默认触发线：日志小于 1MiB 就不值得动手（重写本身有成本）。
const DEFAULT_AUTO_THRESHOLD_BYTES = 1024 * 1024;

function entityDefinitions() {
  return {
    task: getTaskEventStoreDefinition,
    project: getProjectEventStoreDefinition,
    workflow: getWorkflowEventStoreDefinition,
    prompt: getPromptEventStoreDefinition
  };
}

function resolveTargets(argv) {
  const defs = entityDefinitions();
  const requested = (getOption(argv, "--entity") || "all").trim().toLowerCase();
  if (requested === "all" || requested === "") return Object.keys(defs);
  const names = requested.split(",").map((item) => item.trim()).filter(Boolean);
  for (const name of names) {
    if (!defs[name]) {
      throw new Error(`Unknown entity "${name}". Known: ${Object.keys(defs).join(", ")}, all`);
    }
  }
  return names;
}

/** Parse raw content into the same event shape `readEntityEvents` would yield. */
function entityEventsFromContent(content, definition) {
  return splitJsonl(content)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((event) => event.entity === definition.entity || String(event.type || "").startsWith(`${definition.entity}.`));
}

/**
 * Order-sensitive fingerprint of replayed state.
 *
 * Deliberately ordered: the projection file is written in replay order, so a
 * fold that changed the order would shuffle `task list` output even though the
 * record set is unchanged. Comparing ordered sequences makes that a refusal
 * rather than a silent regression.
 */
function projectionFingerprint(records) {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

function planEntity(memoryDir, name, definition) {
  const file = getEntityEventsFile(memoryDir, definition);
  const result = {
    entity: name,
    file,
    exists: fs.existsSync(file),
    skipped: false,
    reason: "",
    totalEvents: 0,
    keptEvents: 0,
    droppedEvents: 0,
    ids: 0,
    foldedIds: 0,
    maxEventsPerId: 0,
    beforeBytes: 0,
    afterBytes: 0,
    reclaimedBytes: 0,
    dropRatio: 0,
    projectionPreserved: true
  };
  if (!result.exists) {
    result.skipped = true;
    result.reason = "no event log";
    return result;
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = splitJsonl(content);
  const plan = planCompaction(lines);
  const keptContent = renderCompacted(plan.keep);

  // The whole point: prove the fold does not change observable state.
  const before = replayEntityEvents(readEntityEvents(memoryDir, definition), definition);
  const after = replayEntityEvents(entityEventsFromContent(keptContent, definition), definition);
  const preserved = projectionFingerprint(before) === projectionFingerprint(after);

  result.totalEvents = plan.stats.totalEvents;
  result.keptEvents = plan.stats.keptEvents;
  result.droppedEvents = plan.stats.droppedEvents;
  result.ids = plan.stats.ids;
  result.foldedIds = plan.stats.foldedIds;
  result.maxEventsPerId = plan.stats.maxEventsPerId;
  result.beforeBytes = Buffer.byteLength(content, "utf8");
  result.afterBytes = Buffer.byteLength(keptContent, "utf8");
  result.reclaimedBytes = Math.max(0, result.beforeBytes - result.afterBytes);
  result.dropRatio = plan.stats.dropRatio;
  result.projectionPreserved = preserved;
  result.records = before.length;
  return { ...result, plan, content, keptContent };
}

function pruneArchives(archiveDir) {
  let entries;
  try {
    entries = fs.readdirSync(archiveDir).filter((name) => name.endsWith(".jsonl.gz"));
  } catch {
    return [];
  }
  const sorted = entries.sort(); // ISO-derived names sort chronologically
  const stale = sorted.slice(0, Math.max(0, sorted.length - ARCHIVE_KEEP));
  const removed = [];
  for (const name of stale) {
    const target = path.join(archiveDir, name);
    try {
      fs.rmSync(target, { force: true });
      removed.push(target);
    } catch {
      /* best effort; an undeletable archive is not worth failing the run over */
    }
  }
  return removed;
}

function archiveDropped(dir, dropped) {
  if (dropped.length === 0) return null;
  const archiveDir = path.join(dir, "archive");
  fs.mkdirSync(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(archiveDir, `events-${stamp}.jsonl.gz`);
  const payload = `${dropped.map((entry) => entry.raw).join("\n")}\n`;
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(payload, "utf8")));
  return {
    file,
    lines: dropped.length,
    bytes: fs.statSync(file).size,
    removed: pruneArchives(archiveDir)
  };
}

/**
 * Fold one entity's event log. Caller must already hold the hub lock.
 * Returns the report row plus what was written (for the caller's summary).
 */
function applyEntity(config, name, definition, planned, { keepArchive }) {
  const dir = path.dirname(planned.file);
  const sessionId = `compact-${name}-${Date.now().toString(36)}`;

  // Three-phase markers bracket the rewrite so an interrupted pass leaves a
  // detectable orphan (src/compaction-lock.js). The `start` marker is appended
  // to the very log we are about to replace, which means the plan — already
  // computed by now — predates it. It must therefore be re-emitted into the
  // rewritten content by hand: without this the fold erases its own start
  // marker and a crash mid-rewrite would leave no trace at all.
  const lock = acquireCompactionLock(planned.file, sessionId, {
    entity: name,
    droppedEvents: planned.droppedEvents,
    reason: "amh compact"
  });

  const archived = keepArchive ? archiveDropped(dir, planned.plan.drop) : null;
  writeFileAtomic(planned.file, `${planned.keptContent}${JSON.stringify(lock.event)}\n`, "utf8");

  // Re-materialize from the folded log. The projections are equivalent by the
  // check in planEntity, so this normally rewrites identical bytes — but if the
  // projection on disk had drifted (hand edit, older code), this heals it, and
  // we report that it did so nobody mistakes it for the fold's doing.
  const projectionFile = getEntityProjectionFile(config.memoryDir, definition);
  const projectionBefore = fs.existsSync(projectionFile) ? fs.readFileSync(projectionFile, "utf8") : "";
  const records = materializeEntityProjection(config.memoryDir, definition);
  const projectionRewritten = fs.readFileSync(projectionFile, "utf8") !== projectionBefore;
  mirrorSync(config.memoryDir, name, records);

  summarizeCompaction(planned.file, sessionId, {
    entity: name,
    keptEvents: planned.keptEvents,
    droppedEvents: planned.droppedEvents,
    beforeBytes: planned.beforeBytes,
    afterBytes: planned.afterBytes,
    archivedEvents: archived ? archived.lines : 0
  });
  releaseCompactionLock(planned.file, sessionId, {
    entity: name,
    keptEvents: planned.keptEvents,
    droppedEvents: planned.droppedEvents
  });

  return { lock, archived, records: records.length, projectionRewritten };
}

export function compactCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const apply = hasFlag(argv, "--apply");
  const auto = hasFlag(argv, "--auto");
  const keepArchive = !hasFlag(argv, "--no-archive");
  // A hub backup is the conservative default for a hand-run --apply. Scheduled
  // runs (--auto) should pass --no-backup: every dropped line is archived, and
  // the fold is proven state-preserving, so a fresh ~3MB snapshot on every tick
  // buys nothing while churning the retention window.
  const wantBackup = !hasFlag(argv, "--no-backup");
  const threshold = parsePositiveIntegerOption(getOption(argv, "--threshold-bytes"), "--threshold-bytes", {
    allowEmpty: true,
    defaultValue: DEFAULT_AUTO_THRESHOLD_BYTES
  });
  const targets = resolveTargets(argv);
  const defs = entityDefinitions();
  // `positionalArgs` is accepted but unused today; kept so a stray entity name
  // like `amh compact task` errors loudly rather than being silently ignored.
  const stray = positionalArgs(argv);
  if (stray.length > 0) {
    throw new Error(`Unexpected argument "${stray[0]}". Use --entity ${Object.keys(defs).join("|")}|all.`);
  }

  const runPass = () => {
    const rows = [];
    for (const name of targets) {
      const definition = defs[name]();
      const planned = planEntity(config.memoryDir, name, definition);
      const row = { ...planned, applied: false, archive: null, lockSession: null, projectionRewritten: false };
      delete row.plan;
      delete row.content;
      delete row.keptContent;

      if (planned.exists && !planned.projectionPreserved) {
        row.skipped = true;
        row.reason = "projection replay mismatch — refusing to write";
        rows.push(row);
        continue;
      }
      // Report the most informative reason first: an already-folded log is more
      // specific than "smaller than the auto threshold".
      if (planned.exists && planned.droppedEvents === 0) {
        row.skipped = true;
        row.reason = "nothing to fold";
        rows.push(row);
        continue;
      }
      if (planned.exists && auto && planned.beforeBytes < threshold) {
        row.skipped = true;
        row.reason = `below --auto threshold (${formatBytes(threshold)})`;
        rows.push(row);
        continue;
      }
      if (apply && planned.exists && planned.droppedEvents > 0) {
        const outcome = applyEntity(config, name, definition, planned, { keepArchive });
        row.applied = true;
        row.lockSession = outcome.lock.event.entityId;
        row.projectionRewritten = outcome.projectionRewritten;
        row.archive = outcome.archived
          ? { file: outcome.archived.file, lines: outcome.archived.lines, bytes: outcome.archived.bytes, pruned: outcome.archived.removed.length }
          : null;
        row.records = outcome.records;
      }
      rows.push(row);
    }
    return rows;
  };

  const backup = apply && wantBackup ? deps.backupHub(config.memoryDir, "pre-compact") : null;
  const rows = apply ? withHubLock(config.memoryDir, "compact", runPass) : runPass();

  const totals = rows.reduce(
    (acc, row) => ({
      beforeBytes: acc.beforeBytes + row.beforeBytes,
      afterBytes: acc.afterBytes + row.afterBytes,
      reclaimedBytes: acc.reclaimedBytes + row.reclaimedBytes,
      totalEvents: acc.totalEvents + row.totalEvents,
      keptEvents: acc.keptEvents + row.keptEvents,
      droppedEvents: acc.droppedEvents + row.droppedEvents
    }),
    { beforeBytes: 0, afterBytes: 0, reclaimedBytes: 0, totalEvents: 0, keptEvents: 0, droppedEvents: 0 }
  );

  console.log(JSON.stringify({
    ok: rows.every((row) => row.projectionPreserved),
    apply,
    auto,
    memoryDir: config.memoryDir,
    archiveEnabled: keepArchive,
    totals: {
      ...totals,
      beforeDisplay: formatBytes(totals.beforeBytes),
      afterDisplay: formatBytes(totals.afterBytes),
      reclaimedDisplay: formatBytes(totals.reclaimedBytes)
    },
    entities: rows.map((row) => ({
      ...row,
      beforeDisplay: formatBytes(row.beforeBytes),
      afterDisplay: formatBytes(row.afterBytes),
      reclaimedDisplay: formatBytes(row.reclaimedBytes),
      dropRatio: Number(row.dropRatio.toFixed(4))
    })),
    backup,
    hint: apply ? null : "Dry run. Re-run with --apply to write (a hub backup is taken first)."
  }, null, 2));
}
