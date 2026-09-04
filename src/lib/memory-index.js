// Memory 索引构建 / 富化 / 快照渲染 / 重要性打分 / 引用解析
//
// 从 src/index.js 下沉（v3.0 重构第 31 批）。本簇是单一连通簇：12 个函数只互相引用，
// 外加 41 个来自已沉 lib 的符号（memory-normalize / format / resolve / util /
// tools-detect / entity-factory / io）与 node 内置 fs、path —— 无 index.js 内部符号，
// 因此全部直连 import，无需 init 注入。
//
// 依赖方向（单向，勿反向引用 index.js）：
//   index.js -> memory-index.js -> {memory-normalize, format, resolve, util,
//                                   tools-detect, entity-factory, io}
//
// 8 个打分/限制常量（STALE_OPERATIONAL_RADIO_AFTER_DAYS ... STARTUP_MEMORY_LIMIT）
// 随簇迁来 —— 经核对它们在 index.js 中仅被本簇函数消费，无簇外引用。
//
// 只 export 被 index.js 或其它命令消费的 5 个符号；其余 7 个为模块内部函数。
//   export: buildMemoryIndex / renderMemorySnapshot / renderBootstrapSnapshot
//           resolveReference / analyzeInstructionIncludes
//   内部:   enrichMemory / selectStartupMemoryRecords / scoreImportance
//           scoreMemoryAccessHeat / scoreStaleMemoryAccessPenalty
//           getStaleWorkingContextPenalty / isStaleOperationalRadioMemory

import fs from "node:fs";
import path from "node:path";
import { mergeMemoryAccessMetadata, normalizeRefValues } from "./entity-factory.js";
import {
  countBy,
  extractInstructionIncludes,
  extractKeywords,
  getMemoryAgeDays,
  inferScope,
  sanitizeInlineText,
  sortByImportance,
  textMentionsResolveQuery
} from "./format.js";
import { readMemoryLifecycleOperations } from "./io.js";
import {
  applyMemoryLifecycleOperations,
  applyMemorySupersedeState,
  buildMemorySupersededBy,
  chooseMemoryLayer,
  flattenMemoryRefs,
  getDaysSinceTimestamp,
  getMemoryAccessStats,
  getMemoryIdentityKeys,
  getMemoryRecordStableKey,
  inferTopics,
  isMemoryLifecycleVisible,
  isOperationalRadioMemory,
  isStartupMemoryRecord,
  normalizeConfidence,
  normalizeList,
  normalizeMemoryAccessCount,
  normalizeMemoryKind,
  normalizeMemoryMetadata,
  normalizeMemoryProject,
  normalizeMemoryRefs,
  normalizeMemoryScope,
  readLedger,
  renderMemoryLine,
  resolveSnapshotLimits
} from "./memory-normalize.js";
import {
  extractFilesystemPathCandidates,
  normalizeResolveQuery,
  pathMatchesResolveQuery,
  resolvePossiblyHomePath
} from "./resolve.js";
import { getInstructionIncludeFiles } from "./tools-detect.js";
import { getDirectResolveCandidates, normalizeCandidatePath } from "./util.js";

// 打分与快照限额常量：仅本模块使用。

const STALE_OPERATIONAL_RADIO_AFTER_DAYS = 7;
const OPERATIONAL_RADIO_DECAY_RATE_PER_DAY = 8;
const MEMORY_ACCESS_RECENT_DAYS = 7;
const MEMORY_ACCESS_STALE_AFTER_DAYS = 45;
const MEMORY_ACCESS_STALE_DECAY_RATE_PER_DAY = 0.5;
const MEMORY_ACCESS_MAX_HEAT = 12;
const MEMORY_ACCESS_MAX_STALE_PENALTY = 24;
const STARTUP_MEMORY_LIMIT = 8;

function isStaleOperationalRadioMemory(memory, text) {
  return isOperationalRadioMemory(memory, text) && getMemoryAgeDays(memory) > STALE_OPERATIONAL_RADIO_AFTER_DAYS;
}

function getStaleWorkingContextPenalty(memory, text) {
  if (!isStaleOperationalRadioMemory(memory, text)) {
    return 0;
  }
  const ageDays = getMemoryAgeDays(memory);
  return Math.min(90, Math.ceil(ageDays * OPERATIONAL_RADIO_DECAY_RATE_PER_DAY));
}

function scoreImportance(memory, topics, ordinal, total, access = {}) {
  const text = String(memory.text || "");
  const kind = memory.metadata?.kind || "note";
  let score = 20;
  if (["preference", "workflow", "correction"].includes(kind)) score += 45;
  if (["project", "lesson"].includes(kind)) score += 30;
  if (["reference", "raw", "note"].includes(kind)) score += 10;
  if (/must|always|never|必须|不要|偏好|规范|规则|纠错|红线|合规|错误|lesson/i.test(text)) score += 18;
  if (/github|git|lark|feishu|qclaw|coze|扣子|claude|codex|opencode|mimocode|mimo code|grok|xai|memory|飞书|微信|小游戏/i.test(text)) score += 8;
  if (topics.length > 0) score += Math.min(10, topics.length * 2);
  const recency = total > 0 ? ordinal / total : 0;
  score += Math.round(recency * 8);
  score += Number(access.accessHeat || 0);
  score -= Number(access.staleAccessPenalty || 0);
  score -= getStaleWorkingContextPenalty(memory, text);
  return Math.max(1, Math.min(100, score));
}

function scoreMemoryAccessHeat(access = {}) {
  const count = normalizeMemoryAccessCount(access.accessCount);
  if (count <= 0) {
    return 0;
  }
  const countBoost = Math.min(MEMORY_ACCESS_MAX_HEAT, Math.log2(count + 1) * 3);
  const daysSinceAccess = getDaysSinceTimestamp(access.lastAccessedAt);
  const recencyBoost = access.lastAccessedAt && daysSinceAccess <= MEMORY_ACCESS_RECENT_DAYS ? 2 : 0;
  return Math.min(MEMORY_ACCESS_MAX_HEAT, Math.round(countBoost + recencyBoost));
}

function scoreStaleMemoryAccessPenalty(access = {}) {
  if (!access.hasAccessTelemetry || !access.lastAccessedAt) {
    return 0;
  }
  const daysSinceAccess = getDaysSinceTimestamp(access.lastAccessedAt);
  if (daysSinceAccess <= MEMORY_ACCESS_STALE_AFTER_DAYS) {
    return 0;
  }
  return Math.min(
    MEMORY_ACCESS_MAX_STALE_PENALTY,
    Math.ceil((daysSinceAccess - MEMORY_ACCESS_STALE_AFTER_DAYS) * MEMORY_ACCESS_STALE_DECAY_RATE_PER_DAY)
  );
}

function enrichMemory(memory, ordinal, total) {
  const metadata = normalizeMemoryMetadata(memory.metadata || {}, memory);
  const kind = normalizeMemoryKind(metadata.kind || "note");
  const tags = normalizeList(metadata.tags);
  const project = normalizeMemoryProject(metadata.project || memory.project || "");
  const refs = normalizeMemoryRefs(metadata.refs || memory.refs || {}, { ...memory, ...metadata });
  const canonicalMemory = {
    ...memory,
    project,
    tags,
    refs,
    metadata: {
      ...metadata,
      project,
      tags,
      kind,
      refs
    }
  };
  const topics = inferTopics(canonicalMemory);
  const access = getMemoryAccessStats(canonicalMemory);
  const accessHeat = scoreMemoryAccessHeat(access);
  const staleAccessPenalty = scoreStaleMemoryAccessPenalty(access);
  const importance = scoreImportance(canonicalMemory, topics, ordinal, total, {
    accessHeat,
    staleAccessPenalty
  });
  const confidence = normalizeConfidence(metadata.confidence);
  const staleWorkingContext = isStaleOperationalRadioMemory(canonicalMemory, memory.text);
  const layer = staleWorkingContext ? "archive" : chooseMemoryLayer(kind, importance);
  const scope = normalizeMemoryScope(metadata.scope) || inferScope(kind, topics, project);
  const enrichedMetadata = mergeMemoryAccessMetadata({
    ...metadata,
    kind,
    project,
    tags,
    scope,
    confidence,
    staleWorkingContext,
    refs
  }, access, { heat: accessHeat, stalePenalty: staleAccessPenalty });
  return {
    ...memory,
    schemaVersion: 2,
    kind,
    project,
    tags,
    refs,
    confidence,
    metadata: enrichedMetadata,
    layer,
    importance,
    accessCount: access.accessCount,
    lastAccessedAt: access.lastAccessedAt,
    accessHeat,
    staleAccessPenalty,
    staleWorkingContext,
    scope,
    topics,
    keywords: extractKeywords(`${memory.text} ${project} ${tags.join(" ")} ${flattenMemoryRefs(refs).join(" ")} ${(topics || []).join(" ")}`)
  };
}

export function buildMemoryIndex(memories, config) {
  const sorted = [...memories].sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  const enrichedRecords = sorted.map((memory, index) => enrichMemory(memory, index, sorted.length));
  const lifecycleRecords = applyMemoryLifecycleOperations(enrichedRecords, readMemoryLifecycleOperations(config.memoryDir), getMemoryIdentityKeys);
  const supersededBy = buildMemorySupersededBy(lifecycleRecords);
  const records = lifecycleRecords.map((record) => applyMemorySupersedeState(record, supersededBy));
  const snapshotLimits = resolveSnapshotLimits(config);
  const stats = {
    records: records.length,
    core: records.filter((item) => item.layer === "core").length,
    working: records.filter((item) => item.layer === "working").length,
    archive: records.filter((item) => item.layer === "archive").length,
    snapshotLimit: snapshotLimits.snapshotLimit,
    snapshotCoreLimit: snapshotLimits.coreLimit,
    snapshotRecentLimit: snapshotLimits.recentLimit,
    rebuiltAt: new Date().toISOString()
  };
  return {
    version: 2,
    schemaVersion: 2,
    memoryDir: config.memoryDir,
    stats,
    topics: countBy(records.flatMap((item) => item.topics)),
    kinds: countBy(records.map((item) => item.kind || item.metadata?.kind || "note")),
    projects: countBy(records.map((item) => item.project || item.metadata?.project || "").filter(Boolean)),
    scopes: countBy(records.map((item) => item.scope || "").filter(Boolean)),
    tags: countBy(records.flatMap((item) => item.tags || [])),
    threads: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.thread))),
    tasks: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.taskId))),
    workflows: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.workflowId))),
    radios: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.radioId))),
    sources: countBy(records.map((item) => item.source || "unknown")),
    records
  };
}

function selectStartupMemoryRecords(records = [], _config = {}) {
  return [...records]
    .filter((record) => !record.superseded && isStartupMemoryRecord(record))
    .sort(sortByImportance)
    .slice(0, STARTUP_MEMORY_LIMIT);
}

export function renderMemorySnapshot(index, config, options = {}) {
  const snapshotLimits = resolveSnapshotLimits(config);
  const coreLimit = snapshotLimits.coreLimit;
  const recentLimit = snapshotLimits.recentLimit;
  const totalLimit = Number(options.limit || snapshotLimits.snapshotLimit || 0);
  const visibleRecords = index.records.filter((item) => !item.superseded && isMemoryLifecycleVisible(item));
  const startup = selectStartupMemoryRecords(visibleRecords, config);
  const startupKeys = new Set(startup.map(getMemoryRecordStableKey).filter(Boolean));
  const allCore = visibleRecords
    .filter((item) => item.layer === "core" && !startupKeys.has(getMemoryRecordStableKey(item)))
    .sort(sortByImportance);
  const allRecent = [...visibleRecords]
    .filter((item) => (options.filterSummary || item.layer === "working") && !startupKeys.has(getMemoryRecordStableKey(item)))
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  let core = allCore.slice(0, coreLimit);
  let recent = allRecent.slice(0, recentLimit);
  if (totalLimit > 0) {
    core = allCore.slice(0, Math.min(coreLimit, totalLimit));
    const remaining = Math.max(0, totalLimit - core.length);
    recent = allRecent.slice(0, Math.min(recentLimit, remaining));
  }
  const lines = [
    "# Shared AI Memory",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "This snapshot is intentionally short. Full local history is in `memories/ledger.jsonl`; structured search data is in `memories/index.json`; readable grouped index is in `INDEX.md`.",
    "",
    "Use `ai-memory-hub search <query> --limit 10` when task-specific context is needed.",
    "",
    "Startup-critical records are repeated in `BOOTSTRAP.md` and pinned below.",
    ""
  ];
  if (options.filterSummary) {
    lines.push(`Filtered view: ${options.filterSummary}.`);
    lines.push("");
  }
  if (visibleRecords.length === 0) {
    lines.push("No memories found.");
    lines.push("");
    return lines.join("\n");
  }

  if (startup.length > 0) {
    lines.push("## Startup Essentials");
    lines.push("");
    for (const memory of startup) {
      lines.push(renderMemoryLine(memory));
    }
    lines.push("");
  }

  lines.push("## Core Memory");
  lines.push("");
  for (const memory of core) {
    lines.push(renderMemoryLine(memory));
  }
  lines.push("");
  lines.push("## Recent Working Context");
  lines.push("");
  for (const memory of recent) {
    lines.push(renderMemoryLine(memory));
  }
  lines.push("");
  lines.push("## Index Summary");
  lines.push("");
  lines.push(`- Records: ${index.stats.records}; core: ${index.stats.core}; working: ${index.stats.working}; archive: ${index.stats.archive}.`);
  lines.push(`- Top topics: ${index.topics.slice(0, 12).map((item) => `${item.key}(${item.count})`).join(", ") || "none"}.`);
  lines.push(`- Top projects: ${index.projects.slice(0, 8).map((item) => `${item.key}(${item.count})`).join(", ") || "none"}.`);
  lines.push("");
  return lines.join("\n");
}

export function renderBootstrapSnapshot(index, config) {
  const startup = selectStartupMemoryRecords(index.records || [], config);
  const lines = [
    "# AI Memory Hub Bootstrap",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "This file repeats startup-critical records that should remain reachable even when `MEMORY.md` is compacted.",
    "",
    "If an instruction include such as `@RTK.md` is missing, run `ai-memory-hub resolve \"@RTK.md\"` and then use the resolved local path when reading the include.",
    "",
    "## Startup Essentials",
    ""
  ];
  if (startup.length === 0) {
    lines.push("- No startup-critical memories found.");
  } else {
    for (const memory of startup) {
      lines.push(renderMemoryLine(memory));
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function resolveReference(query, config, options = {}) {
  const normalizedQuery = normalizeResolveQuery(query);
  const fromFile = options.fromFile ? resolvePossiblyHomePath(options.fromFile) : "";
  const records = Array.isArray(options.records)
    ? options.records
    : buildMemoryIndex(readLedger(config.memoryDir), config).records;
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidatePath, source, evidence = "", confidence = 50) => {
    const resolvedPath = normalizeCandidatePath(candidatePath);
    if (!resolvedPath || !pathMatchesResolveQuery(resolvedPath, normalizedQuery)) {
      return;
    }
    const key = resolvedPath.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      path: resolvedPath,
      exists: fs.existsSync(resolvedPath),
      source,
      confidence,
      evidence: sanitizeInlineText(evidence).slice(0, 240)
    });
  };

  for (const candidate of getDirectResolveCandidates(normalizedQuery, config, fromFile)) {
    addCandidate(candidate.path, candidate.source, candidate.evidence, candidate.confidence);
  }

  for (const record of records) {
    const text = String(record.text || "");
    if (!text || !textMentionsResolveQuery(text, normalizedQuery)) {
      continue;
    }
    for (const candidatePath of extractFilesystemPathCandidates(text)) {
      addCandidate(
        candidatePath,
        `memory:${record.localEventId || record.id || record.source || "record"}`,
        text,
        70 + Math.min(25, Number(record.importance || 0) / 4)
      );
    }
  }

  candidates.sort((a, b) =>
    Number(b.exists) - Number(a.exists) ||
    Number(b.confidence || 0) - Number(a.confidence || 0) ||
    a.path.localeCompare(b.path)
  );
  const limited = candidates.slice(0, Number(options.limit || 10));
  return {
    ok: limited.length > 0,
    query,
    normalizedQuery,
    fromFile,
    best: limited[0] || null,
    candidates: limited
  };
}

export function analyzeInstructionIncludes(config, options = {}) {
  const records = Array.isArray(options.records) ? options.records : buildMemoryIndex(readLedger(config.memoryDir), config).records;
  const files = getInstructionIncludeFiles(config.memoryDir);
  const diagnostics = {
    filesScanned: 0,
    includesChecked: 0,
    missing: []
  };
  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }
    diagnostics.filesScanned += 1;
    const text = fs.readFileSync(file, "utf8");
    for (const include of extractInstructionIncludes(text)) {
      diagnostics.includesChecked += 1;
      const expectedPath = path.resolve(path.dirname(file), normalizeResolveQuery(include));
      if (fs.existsSync(expectedPath)) {
        continue;
      }
      const resolved = resolveReference(include, config, {
        fromFile: file,
        records,
        limit: 5
      });
      diagnostics.missing.push({
        file,
        include,
        expectedPath,
        suggestions: resolved.candidates.filter((candidate) => candidate.exists).slice(0, 5)
      });
    }
  }
  diagnostics.ok = diagnostics.missing.length === 0;
  return diagnostics;
}
