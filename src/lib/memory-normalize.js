// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import os from "node:os";
import { getOption, isPlainObject } from "./cli.js";
import { mergeMemoryAccessMetadata, normalizeRefValues } from "./entity-factory.js";
import { sanitizeInlineText } from "./format.js";

export function normalizeMemoryKind(kind) {
  const clean = String(kind || "note").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
  return clean || "note";
}

export function normalizeMemoryProject(project) {
  return String(project || "").trim().toLowerCase().replace(/\s+/g, "-");
}

export function normalizeMemoryScope(scope) {
  const clean = String(scope || "").trim().toLowerCase().replace(/\s+/g, "-");
  return clean;
}

export function normalizeList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => normalizeList(item)))];
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [...new Set(String(value)
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean))];
}

export function firstDefinedRef(source, fallback, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
    if (fallback[key] !== undefined && fallback[key] !== null && fallback[key] !== "") {
      return fallback[key];
    }
  }
  return "";
}

export function hasMemoryFilters(filters = {}) {
  return Boolean(
    filters.project ||
    (filters.tags && filters.tags.length > 0) ||
    filters.thread ||
    filters.taskId ||
    filters.workflowId ||
    filters.radioId
  );
}

export function normalizeRefToken(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeConfidence(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  if (numeric > 1) {
    return Math.max(0, Math.min(1, numeric / 100));
  }
  return Math.max(0, Math.min(1, numeric));
}

export function applyMemoryAccessFields(record, access = {}) {
  if (!access.hasAccessTelemetry) {
    return record;
  }
  return {
    ...record,
    accessCount: access.accessCount,
    ...(access.firstAccessedAt ? { firstAccessedAt: access.firstAccessedAt } : {}),
    lastAccessedAt: access.lastAccessedAt || ""
  };
}

export function normalizeMemoryAccessCount(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }
  return Math.floor(count);
}

export function normalizeMemoryAccessTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString();
}

export function firstDefinedValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function getDaysSinceTimestamp(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) {
    return 0;
  }
  return Math.max(0, (Date.now() - time) / 86400000);
}

export function isMemoryLifecycleVisible(record) {
  const lifecycle = record.lifecycle || record.metadata?.lifecycle || {};
  if (["archived", "superseded", "revoked", "stale"].includes(lifecycle.state)) return false;
  const expiresAt = record.metadata?.expiresAt || lifecycle.expiresAt;
  return !expiresAt || !Number.isFinite(Date.parse(expiresAt)) || new Date(expiresAt) >= new Date();
}

export function normalizeSupersedeToken(value) {
  return String(value || "").trim().toLowerCase();
}

export function hasExplicitSyncKey(config, key) {
  const explicitKeys = config.sync?._explicitKeys;
  if (explicitKeys instanceof Set) {
    return explicitKeys.has(key);
  }
  return Boolean(config.sync && Object.hasOwn(config.sync, key));
}

export function readPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

export function isMemoryHealthExcluded(record) {
  const lifecycle = record.metadata?.lifecycle || {};
  const repair = lifecycle.healthRepair || record.metadata?.healthRepair || {};
  return Boolean(
    record.superseded ||
    record.metadata?.superseded ||
    record.healthExcluded ||
    record.metadata?.healthExcluded ||
    lifecycle.healthExcluded ||
    repair.healthExcluded ||
    repair.status === "archived-corrupted" ||
    repair.status === "superseded-duplicate"
  );
}

export function formatMemoryHealthRepairPlan(plan) {
  return {
    totalActions: plan.totalActions,
    corruptedRecords: plan.corrupted.length,
    recoverableCorruptedRecords: plan.corrupted.filter((item) => item.recoverable).length,
    duplicateGroups: plan.duplicateGroups.length,
    duplicateRecordsToSupersede: plan.duplicateGroups.reduce((sum, group) => sum + group.losers.length, 0),
    corrupted: plan.corrupted.slice(0, 20),
    duplicates: plan.duplicateGroups.slice(0, 20).map((group) => ({
      keeperId: group.keeperId,
      keeperKey: group.keeperKey,
      example: group.example,
      losers: group.losers
    }))
  };
}

export function sanitizeRawJsonCandidate(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

export function getMemoryGrowthTrend(records, limit = 14) {
  const counts = new Map();
  for (const record of records) {
    const date = String(record.ts || record.indexedAt || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([date, count]) => ({ date, count }));
}

export function chooseMemoryLayer(kind, importance) {
  if (["preference", "workflow", "correction"].includes(kind) || importance >= 70) {
    return "core";
  }
  if (["project", "lesson", "reference"].includes(kind) || importance >= 45) {
    return "working";
  }
  return "archive";
}

export function parseListOption(value) {
  return normalizeList(value);
}

export function parseMemoryTagFilters(argv) {
  return normalizeList([
    getOption(argv, "--tag"),
    getOption(argv, "--tags")
  ]);
}

export function formatMemoryFilterSummary(filters = {}) {
  const parts = [];
  if (filters.project) {
    parts.push(`project=${normalizeMemoryProject(filters.project)}`);
  }
  if (filters.tags?.length) {
    parts.push(`tags=${filters.tags.join(",")}`);
  }
  if (filters.thread) {
    parts.push(`thread=${normalizeRefToken(filters.thread)}`);
  }
  if (filters.taskId) {
    parts.push(`taskId=${normalizeRefToken(filters.taskId)}`);
  }
  if (filters.workflowId) {
    parts.push(`workflowId=${normalizeRefToken(filters.workflowId)}`);
  }
  if (filters.radioId) {
    parts.push(`radioId=${normalizeRefToken(filters.radioId)}`);
  }
  return parts.join(" ");
}

export function matchesMemoryTags(memory, queryTags = []) {
  const requested = normalizeList(queryTags);
  if (requested.length === 0) {
    return true;
  }
  const candidates = normalizeList(memory.tags?.length ? memory.tags : memory.metadata?.tags);
  return requested.every((tag) => candidates.includes(tag));
}

export function getMemoryAccessStats(memory = {}) {
  const lifecycle = isPlainObject(memory.metadata?.lifecycle) ? memory.metadata.lifecycle : {};
  const lifecycleAccess = isPlainObject(lifecycle.access) ? lifecycle.access : {};
  const accessCountValue = firstDefinedValue(
    memory.accessCount,
    memory.metadata?.accessCount,
    lifecycleAccess.accessCount,
    lifecycleAccess.count
  );
  const firstAccessedAt = normalizeMemoryAccessTimestamp(firstDefinedValue(
    memory.firstAccessedAt,
    memory.metadata?.firstAccessedAt,
    lifecycleAccess.firstAccessedAt
  ));
  const lastAccessedAt = normalizeMemoryAccessTimestamp(firstDefinedValue(
    memory.lastAccessedAt,
    memory.metadata?.lastAccessedAt,
    lifecycleAccess.lastAccessedAt
  ));
  const hasAccessTelemetry = [
    memory.accessCount,
    memory.lastAccessedAt,
    memory.firstAccessedAt,
    memory.metadata?.accessCount,
    memory.metadata?.lastAccessedAt,
    memory.metadata?.firstAccessedAt,
    lifecycleAccess.accessCount,
    lifecycleAccess.count,
    lifecycleAccess.lastAccessedAt,
    lifecycleAccess.firstAccessedAt
  ].some((value) => value !== undefined && value !== null && value !== "");

  return {
    accessCount: normalizeMemoryAccessCount(accessCountValue),
    firstAccessedAt,
    lastAccessedAt,
    hasAccessTelemetry
  };
}

export function applyMemoryLifecycleOperations(records, operations, getIdentityKeys) {
  const lookup = new Map();
  for (const record of records) {
    for (const key of getIdentityKeys(record)) lookup.set(normalizeSupersedeToken(key), record);
  }
  const overlays = new Map();
  for (const operation of [...operations].sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")))) {
    const target = lookup.get(normalizeSupersedeToken(operation.target?.recordId));
    if (!target) continue;
    const key = getIdentityKeys(target)[0];
    if (!key) continue;
    const current = overlays.get(key) || {};
    let state = operation.patch?.lifecycle?.state || current.state || "active";
    if ((operation.action === "pin" || operation.action === "review") && current.state !== "revoked") state = "active";
    if (operation.action === "supersede") state = "superseded";
    if (operation.action === "revoke") state = "revoked";
    if (operation.action === "archive") state = "archived";
    overlays.set(key, {
      ...current,
      state,
      reason: operation.reason || current.reason || "",
      reviewedAt: operation.action === "review" ? operation.ts : current.reviewedAt,
      supersededBy: operation.refs?.supersededBy || current.supersededBy || []
    });
  }
  return records.map((record) => {
    const overlay = overlays.get(getIdentityKeys(record)[0]);
    const lifecycle = { ...(record.metadata?.lifecycle || {}), ...(overlay || {}), state: overlay?.state || record.metadata?.lifecycle?.state || "active" };
    return { ...record, lifecycle, metadata: { ...(record.metadata || {}), lifecycle } };
  });
}

export function normalizeSupersedeRefs(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(normalizeSupersedeRefs))];
  }
  if (isPlainObject(value)) {
    return normalizeSupersedeRefs(Object.values(value));
  }
  return String(value || "")
    .split(",")
    .map(normalizeSupersedeToken)
    .filter(Boolean);
}

export function isStartupMemoryRecord(record) {
  const tags = normalizeList(record.tags?.length ? record.tags : record.metadata?.tags);
  const scope = normalizeMemoryScope(record.scope || record.metadata?.scope || "");
  const kind = normalizeMemoryKind(record.kind || record.metadata?.kind || "note");
  const text = String(record.text || "");
  if (tags.some((tag) => ["startup", "bootstrap", "boot", "agent-startup", "critical", "pinned"].includes(tag))) {
    return true;
  }
  if (["startup", "bootstrap", "agent-startup"].includes(scope)) {
    return true;
  }
  if (!["preference", "workflow", "correction", "project", "lesson", "reference"].includes(kind)) {
    return false;
  }
  return /RTK\.md|AGENTS\.md|CLAUDE\.md|GEMINI\.md|@include|@引用|Shared AI Memory|Shared Agent Radio|Shared Task List|Shared Workflows|ai-memory-hub search|inbox\/events\.jsonl|memories\/ledger\.jsonl|MEMORY\.md|共享记忆|共同记忆|启动|启动关键|指令/i.test(text);
}

export function resolveSnapshotLimits(config = {}) {
  const snapshotLimit = readPositiveInteger(config.sync?.snapshotLimit, 120);
  const explicitCoreLimit = hasExplicitSyncKey(config, "coreLimit");
  const explicitRecentLimit = hasExplicitSyncKey(config, "recentLimit");
  return {
    snapshotLimit,
    coreLimit: explicitCoreLimit
      ? readPositiveInteger(config.sync.coreLimit, 30)
      : Math.max(10, Math.round(snapshotLimit * 0.25)),
    recentLimit: explicitRecentLimit
      ? readPositiveInteger(config.sync.recentLimit, 18)
      : Math.max(5, Math.round(snapshotLimit * 0.15))
  };
}

export function inferTopics(memory) {
  const tags = normalizeList(memory.tags?.length ? memory.tags : memory.metadata?.tags);
  const text = `${memory.text || ""} ${memory.project || memory.metadata?.project || ""} ${tags.join(" ")}`.toLowerCase();
  const topics = [];
  const rules = [
    ["ai-memory-hub", /ai-memory|shared memory|memory hub|agent radio|opencode|mimocode|mimo code|grok|xai|qclaw|coze|扣子|claude|codex|gemini|共享记忆|本地记忆/],
    ["game", /game|unity|mahjong|match|西游|麻将|小游戏|策划|关卡|体力|广告|分享/],
    ["wechat-mini-game", /wechat|微信|小游戏|wx\.|sendgift|红包|开放能力/],
    ["lark-feishu", /lark|feishu|飞书|多维表格|任务|文档|lark-cli/],
    ["git", /git|github|gitee|commit|提交/],
    ["team", /team|member|role|团队|成员|pm|planner|dev|art/],
    ["automation", /automation|daemon|watcher|script|自动|脚本|后台|签到/],
    ["docs", /readme|doc|文档|prd|gdd|策划文档/],
    ["security", /secret|password|token|key|合规|隐私|上传|ignore|gitignore/]
  ];
  for (const [topic, pattern] of rules) {
    if (pattern.test(text)) topics.push(topic);
  }
  return [...new Set(topics)];
}

export function normalizeMemoryRefs(refs = {}, fallback = {}) {
  const source = isPlainObject(refs) ? refs : {};
  const aliases = {
    thread: ["thread", "threadId", "thread_id", "conversationId", "conversation_id"],
    threadKey: ["threadKey", "thread_key"],
    taskId: ["taskId", "task_id", "task"],
    workflowId: ["workflowId", "workflow_id", "workflow"],
    radioId: ["radioId", "radio_id", "radio", "messageId", "message_id", "replyTo", "reply_to"],
    dispatchId: ["dispatchId", "dispatch_id"],
    sourceId: ["sourceId", "source_id", "localEventId", "local_event_id"]
  };
  const normalized = {};
  for (const [targetKey, keys] of Object.entries(aliases)) {
    const values = normalizeRefValues(firstDefinedRef(source, fallback, keys));
    if (values.length === 1) {
      normalized[targetKey] = values[0];
    } else if (values.length > 1) {
      normalized[targetKey] = values;
    }
  }
  return normalized;
}

export function flattenMemoryRefs(refs = {}) {
  if (!isPlainObject(refs)) {
    return [];
  }
  return [...new Set(Object.values(refs).flatMap((value) => normalizeRefValues(value)))];
}

export function formatMemoryRefs(refs = {}) {
  if (!isPlainObject(refs)) {
    return "";
  }
  const parts = [];
  for (const key of ["thread", "threadKey", "taskId", "workflowId", "radioId"]) {
    const values = normalizeRefValues(refs[key]).map(sanitizeInlineText).filter(Boolean).slice(0, 3);
    if (values.length > 0) {
      parts.push(`${key}=${values.join(",")}`);
    }
  }
  return parts.join(" ");
}

export function matchesMemoryRef(memory, key, query) {
  if (!query) {
    return true;
  }
  const target = normalizeRefToken(query);
  const candidates = [
    ...(normalizeRefValues(memory.refs?.[key])),
    ...(normalizeRefValues(memory.metadata?.refs?.[key]))
  ];
  return candidates.some((candidate) => {
    const value = normalizeRefToken(candidate);
    return value === target || value.startsWith(target) || target.startsWith(value);
  });
}

export function touchMemoryAccess(record, accessedAt = new Date().toISOString()) {
  const current = getMemoryAccessStats(record);
  const access = {
    ...current,
    accessCount: current.accessCount + 1,
    firstAccessedAt: current.firstAccessedAt || accessedAt,
    lastAccessedAt: normalizeMemoryAccessTimestamp(accessedAt),
    hasAccessTelemetry: true
  };
  const metadata = mergeMemoryAccessMetadata(record.metadata || {}, access);
  return applyMemoryAccessFields({ ...record, metadata }, access);
}

export function getMemorySupersedesRefs(record) {
  return normalizeSupersedeRefs(record.metadata?.supersedes || record.supersedes || record.metadata?.lifecycle?.supersedes);
}

export function isOperationalRadioMemory(memory, text) {
  const source = String(memory.source || "").toLowerCase();
  const kind = String(memory.metadata?.kind || memory.kind || "").toLowerCase();
  const hasRadioRef = normalizeRefValues(memory.refs?.radioId || memory.metadata?.refs?.radioId).length > 0;
  const isRadio = source.startsWith("radio") || kind === "radio" || hasRadioRef;
  if (!isRadio) {
    return false;
  }
  return /status|progress|dispatch|completed|done|pass|failed|review|heartbeat|状态|进度|完成|已完成|通过|失败|审核/i.test(String(text || ""));
}

export function printMemorySearchResults(results, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const item of results) {
    const kind = item.metadata?.kind || "note";
    const topics = (item.topics || []).slice(0, 4).join(",");
    const refs = formatMemoryRefs(item.refs);
    const project = item.project ? `project=${item.project} ` : "";
    const tags = item.tags?.length ? `tags=${item.tags.slice(0, 5).join(",")} ` : "";
    console.log(`[${item.score.toFixed(2)}] ${item.source}/${kind} ${project}${tags}${topics ? `(${topics}) ` : ""}${refs ? `[${refs}] ` : ""}${item.text}`);
  }
}

export function filterMemoryRecords(records, filters = {}) {
  return records
    .filter((record) => isMemoryLifecycleVisible(record))
    .filter((record) => filters.project ? record.project === normalizeMemoryProject(filters.project) : true)
    .filter((record) => matchesMemoryTags(record, filters.tags))
    .filter((record) => matchesMemoryRef(record, "thread", filters.thread))
    .filter((record) => matchesMemoryRef(record, "taskId", filters.taskId))
    .filter((record) => matchesMemoryRef(record, "workflowId", filters.workflowId))
    .filter((record) => matchesMemoryRef(record, "radioId", filters.radioId));
}

export function getMemoryIdentityKeys(record) {
  return [
    record.localEventId,
    record.id,
    record.metadata?.localEventId,
    record.metadata?.id,
    record.metadata?.stableId,
    record.metadata?.key,
    ...flattenMemoryRefs(record.refs || record.metadata?.refs)
  ]
    .map(normalizeSupersedeToken)
    .filter(Boolean);
}

export function normalizeMemoryMetadata(metadata = {}, fallback = {}) {
  const normalized = { ...metadata };
  normalized.kind = normalizeMemoryKind(normalized.kind || normalized.type || fallback.kind || fallback.type || "note");
  normalized.project = normalizeMemoryProject(normalized.project || fallback.project || "");
  normalized.tags = normalizeList(normalized.tags?.length ? normalized.tags : fallback.tags);
  normalized.scope = normalizeMemoryScope(normalized.scope || fallback.scope || "");
  normalized.refs = normalizeMemoryRefs(normalized.refs || normalized.references || {}, { ...fallback, ...normalized });
  normalized.confidence = normalizeConfidence(normalized.confidence ?? fallback.confidence);
  normalized.device = normalized.device || fallback.device || os.hostname();
  return normalized;
}

export function recordMemoryAccess(ledger, results, accessedAt = new Date().toISOString()) {
  const resultKeys = new Set(results.flatMap((result) => getMemoryIdentityKeys(result)));
  if (resultKeys.size === 0) {
    return { ledger, updated: 0 };
  }

  let updated = 0;
  const updatedLedger = ledger.map((record) => {
    const matched = getMemoryIdentityKeys(record).some((key) => resultKeys.has(key));
    if (!matched) {
      return record;
    }
    updated++;
    return touchMemoryAccess(record, accessedAt);
  });

  return { ledger: updatedLedger, updated };
}

export function getMemoryPrimaryKey(record) {
  return getMemoryIdentityKeys(record)[0] || "";
}

export function buildMemorySupersededBy(records) {
  const lookup = new Map();
  for (const record of records) {
    for (const key of getMemoryIdentityKeys(record)) {
      if (!lookup.has(key)) {
        lookup.set(key, record);
      }
    }
  }

  const supersededBy = new Map();
  for (const superseder of records) {
    const refs = getMemorySupersedesRefs(superseder);
    for (const ref of refs) {
      const target = lookup.get(ref);
      if (!target || target === superseder) {
        continue;
      }
      const targetKey = getMemoryPrimaryKey(target);
      if (!targetKey) {
        continue;
      }
      const supersederRef = getMemoryPrimaryKey(superseder);
      const existing = supersededBy.get(targetKey) || [];
      if (supersederRef && !existing.includes(supersederRef)) {
        existing.push(supersederRef);
      }
      supersededBy.set(targetKey, existing);
    }
  }
  return supersededBy;
}

export function applyMemorySupersedeState(record, supersededBy) {
  const supersededByRefs = supersededBy.get(getMemoryPrimaryKey(record)) || [];
  if (supersededByRefs.length === 0) {
    return record;
  }
  const importance = Math.max(1, Number(record.importance || 0) - 50);
  return {
    ...record,
    superseded: true,
    supersededBy: supersededByRefs,
    importance,
    layer: "archive",
    metadata: {
      ...record.metadata,
      superseded: true,
      supersededBy: supersededByRefs,
      lifecycle: {
        ...(record.metadata?.lifecycle || {}),
        superseded: true,
        supersededBy: supersededByRefs
      }
    }
  };
}

export function getMemoryRecordStableKey(record) {
  return getMemoryPrimaryKey(record) || record.id || record.localEventId || record.text || "";
}

export function markDuplicateLedgerRecordSuperseded(record, keeperKey, repairedAt) {
  return {
    ...record,
    superseded: true,
    supersededBy: [keeperKey],
    healthExcluded: true,
    metadata: normalizeMemoryMetadata({
      ...record.metadata,
      superseded: true,
      supersededBy: [keeperKey],
      healthExcluded: true,
      lifecycle: {
        ...(record.metadata?.lifecycle || {}),
        superseded: true,
        supersededBy: [keeperKey],
        healthExcluded: true,
        healthRepair: {
          status: "superseded-duplicate",
          healthExcluded: true,
          repairedAt,
          duplicateOf: keeperKey
        }
      }
    }, record)
  };
}

export function normalizeMemoryEvent(event) {
  const text = event.text ?? event.content ?? event.memory ?? "";
  const metadata = normalizeMemoryMetadata(event.metadata || {}, event);
  if (!metadata.kind && event.type) {
    metadata.kind = normalizeMemoryKind(event.type);
  }
  if (event.tags && !metadata.tags) {
    metadata.tags = normalizeList(event.tags);
  }
  return {
    id: event.id || "",
    ts: event.ts || event.timestamp || event.createdAt || "",
    source: event.source || metadata.source || "unknown",
    text: String(text || "").trim(),
    device: event.device || metadata.device || os.hostname(),
    metadata
  };
}
