// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

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
