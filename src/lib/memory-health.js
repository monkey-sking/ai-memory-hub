// Memory 健康诊断 / 修复编排
//
// 从 src/index.js 下沉（v3.0 重构第 32 批）。本簇是单一连通簇：9 个符号只互相引用，
// 外加 28 个来自已沉 lib 与 dashboard/health.js 的符号 —— 无 index.js 内部符号，
// 因此全部直连 import，无需 init 注入。
//
// 依赖方向（单向，勿反向引用 index.js）：
//   index.js -> memory-health.js -> {memory-index, memory-normalize, format, io, util,
//                                    radio-messages, backup, ../dashboard/health}
//
// ⚠️ 本簇原本存在**依赖闭环**（第 32 批的关键难点）：
//     dashboardHealth（工厂对象）依赖 analyzeMemoryHealth + renderMemoryHealthReport，
//     而 runMemoryHealthRepair 又依赖 dashboardHealth —— 三者互相咬住。
//     解法：dashboardHealth 只是 createDashboardHealthApi({...}) 的一个 11 行对象字面量，
//     其 9 个参数中只有 2 个是本簇函数、其余 7 个全在已沉 lib —— 故把对象随簇一起迁入本模块，
//     环就地解开。另把 hub 函数 rebuildMemoryOutputs 于同批先拔到 memory-index.js。
//
// 导出策略：只 export 被 index.js 消费的 2 个符号 ——
//   dashboardHealth（appCommandDeps + healthCommand）
//   runMemoryHealthRepair（appCommandDeps + healthRepairCommand）
// 其余 7 个为模块内部函数。

import path from "node:path";
import { createDashboardHealthApi } from "../dashboard/health.js";
import { backupHub } from "./backup.js";
import {
  findDuplicateMemoryGroups,
  formatBytes,
  formatMemoryRecordPointer,
  formatPercent,
  formatTopCounts,
  sanitizeInlineText,
  sanitizeLedgerText,
  summarizeHealthAnalysisForRepair,
  truncateText
} from "./format.js";
import { countJsonlLines, writeLedger } from "./io.js";
import { analyzeInstructionIncludes, buildMemoryIndex, rebuildMemoryOutputs } from "./memory-index.js";
import {
  formatMemoryHealthRepairPlan,
  getMemoryGrowthTrend,
  getMemoryPrimaryKey,
  isMemoryHealthExcluded,
  markDuplicateLedgerRecordSuperseded,
  normalizeList,
  normalizeMemoryMetadata,
  readLedger,
  recoverMemoryEventFromRawText
} from "./memory-normalize.js";
import { containsCorruptionMarker } from "./radio-messages.js";
import { createHealthRepairAction, getMemoryStorageSummary } from "./util.js";


export const dashboardHealth = createDashboardHealthApi({
  analyzeMemoryHealth,
  buildMemoryIndex,
  formatBytes,
  formatMemoryRecordPointer,
  formatPercent,
  readLedger,
  renderMemoryHealthReport,
  sanitizeInlineText,
  truncateText
});

function renderMemoryHealthReport(config, index, options = {}) {
  const analysis = options.analysis || analyzeMemoryHealth(config, index, options);
  const lines = [
    "# AI Memory Hub Health Report",
    "",
    `Generated at ${analysis.generatedAt}.`,
    "",
    "## Summary",
    "",
    `- Health score: ${analysis.score}/100 (${analysis.status})`,
    `- Memory records: ${analysis.totalRecords}`,
    `- Duplicate records: ${analysis.duplicateRecords} (${formatPercent(analysis.duplicateRate)})`,
    `- Corrupted records: ${analysis.corruptedRecords.length}`,
    `- Storage used: ${formatBytes(analysis.storage.totalBytes)}`,
    "",
    "## Distribution",
    "",
    `- Layers: core ${index.stats.core}, working ${index.stats.working}, archive ${index.stats.archive}`,
    `- Kinds: ${formatTopCounts(index.kinds, 8)}`,
    `- Projects: ${formatTopCounts(index.projects, 8)}`,
    `- Tags: ${formatTopCounts(index.tags, 8)}`,
    `- Topics: ${formatTopCounts(index.topics, 8)}`,
    "",
    "## Growth Trend",
    ""
  ];

  if (analysis.growthTrend.length === 0) {
    lines.push("- No dated records found.");
  } else {
    for (const item of analysis.growthTrend) {
      lines.push(`- ${item.date}: ${item.count}`);
    }
  }

  lines.push("");
  lines.push("## Storage");
  lines.push("");
  for (const item of analysis.storage.items) {
    lines.push(`- ${item.label}: ${formatBytes(item.bytes)}`);
  }

  lines.push("");
  lines.push("## Issues");
  lines.push("");
  if (analysis.issues.length === 0) {
    lines.push("- No optimization issues detected.");
  } else {
    for (const issue of analysis.issues) {
      lines.push(`- **${issue.level}** ${issue.title}: ${issue.detail}`);
    }
  }

  lines.push("");
  lines.push("## Recommended Actions");
  lines.push("");
  if (analysis.repairSuggestions.length === 0) {
    lines.push("- No repair actions suggested.");
  } else {
    for (const action of analysis.repairSuggestions) {
      const command = action.command ? ` Command: \`${action.command}\`.` : "";
      lines.push(`- ${action.label}: ${action.detail}${command}`);
    }
  }

  if (analysis.duplicateGroups.length > 0) {
    lines.push("");
    lines.push("## Duplicate Examples");
    lines.push("");
    for (const group of analysis.duplicateGroups.slice(0, analysis.issueLimit)) {
      lines.push(`- ${group.count}x ${group.example}`);
    }
  }

  if (analysis.corruptedRecords.length > 0) {
    lines.push("");
    lines.push("## Corrupted Record Examples");
    lines.push("");
    for (const record of analysis.corruptedRecords.slice(0, analysis.issueLimit)) {
      lines.push(`- ${formatMemoryRecordPointer(record)} ${truncateText(record.text, 120)}`);
    }
  }

  if (analysis.includeDiagnostics?.missing?.length > 0) {
    lines.push("");
    lines.push("## Instruction Include Diagnostics");
    lines.push("");
    for (const item of analysis.includeDiagnostics.missing.slice(0, analysis.issueLimit)) {
      const suggestions = item.suggestions.length
        ? ` Suggestions: ${item.suggestions.map((candidate) => `\`${candidate.path}\``).join(", ")}.`
        : " No existing local suggestions found.";
      lines.push(`- ${item.include} in \`${item.file}\` is missing at \`${item.expectedPath}\`.${suggestions}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function analyzeMemoryHealth(config, index, options = {}) {
  const records = index.records || [];
  const totalRecords = records.length;
  const qualityRecords = records.filter((record) => !isMemoryHealthExcluded(record));
  const issueLimit = Number(options.issueLimit || 5);
  const duplicateGroups = findDuplicateMemoryGroups(qualityRecords);
  const duplicateRecords = duplicateGroups.reduce((sum, group) => sum + group.count - 1, 0);
  const duplicateRate = qualityRecords.length > 0 ? duplicateRecords / qualityRecords.length : 0;
  const corruptedRecords = qualityRecords.filter(isCorruptedMemoryRecord);
  const storage = getMemoryStorageSummary(config.memoryDir);
  const growthTrend = getMemoryGrowthTrend(records, 14);
  const pendingInbox = countJsonlLines(path.join(config.memoryDir, "inbox", "events.jsonl"));
  const includeDiagnostics = analyzeInstructionIncludes(config, { records });
  const issues = [];
  const repairSuggestions = [];

  const addIssue = (issue) => {
    issues.push(issue);
    if (issue.action) {
      repairSuggestions.push(issue.action);
    }
  };

  if (corruptedRecords.length > 0) {
    addIssue({
      level: "high",
      title: "Corrupted records detected",
      detail: `${corruptedRecords.length} record(s) contain null bytes, replacement characters, or raw unparsed JSONL text.`,
      action: createHealthRepairAction({
        id: "repair-corrupted-records",
        label: "Repair corrupted records",
        command: "ai-memory-hub health repair --apply",
        detail: "Create a backup, recover parseable raw JSON records, archive unrecoverable corrupted records, and rebuild generated memory outputs.",
        endpoint: "/api/health/repair",
        method: "POST"
      })
    });
  }
  if (duplicateRecords > 0) {
    addIssue({
      level: duplicateRate >= 0.1 ? "high" : "medium",
      title: "Duplicate memory content",
      detail: `${duplicateRecords} duplicate record(s) across ${duplicateGroups.length} repeated text group(s).`,
      action: createHealthRepairAction({
        id: "repair-duplicate-groups",
        label: "Supersede duplicate records",
        command: "ai-memory-hub health repair --apply",
        detail: "Keep the highest-quality record in each duplicate group, mark older duplicate records as superseded, and rebuild generated memory outputs.",
        endpoint: "/api/health/repair",
        method: "POST"
      })
    });
  }
  if (pendingInbox > 0) {
    addIssue({
      level: pendingInbox >= 50 ? "medium" : "low",
      title: "Pending inbox events",
      detail: `${pendingInbox} event(s) remain in inbox/events.jsonl; run sync when ready.`,
      action: createHealthRepairAction({
        id: "sync-pending-inbox",
        label: "Sync pending inbox",
        command: "ai-memory-hub sync",
        detail: "Index pending inbox events into the ledger and rebuild the readable snapshot.",
        endpoint: "/api/sync",
        method: "POST"
      })
    });
  }
  if (includeDiagnostics.missing.length > 0) {
    const first = includeDiagnostics.missing[0];
    addIssue({
      level: "medium",
      title: "Missing instruction includes",
      detail: `${includeDiagnostics.missing.length} @include reference(s) are missing from tool instruction files. First missing include: ${first.include} in ${first.file}.`,
      action: createHealthRepairAction({
        id: "resolve-missing-instruction-include",
        label: "Resolve missing instruction include",
        command: `ai-memory-hub resolve "${first.include}" --from "${first.file}"`,
        detail: "Resolve the missing include from local candidate paths and shared memory before assuming the referenced instruction file is unavailable."
      })
    });
  }
  if (storage.backupsBytes > storage.ledgerBytes && storage.backupsBytes > 0) {
    addIssue({
      level: "low",
      title: "Backup storage exceeds ledger size",
      detail: `backups/ uses ${formatBytes(storage.backupsBytes)} versus ledger ${formatBytes(storage.ledgerBytes)}.`,
      action: createHealthRepairAction({
        id: "backup-storage-review",
        label: "Review backup storage",
        command: "ai-memory-hub backup list",
        detail: "Inspect backup age and retention status before running any explicit prune operation."
      })
    });
  }

  const score = Math.max(0, 100
    - Math.min(40, Math.round(duplicateRate * 200))
    - Math.min(35, corruptedRecords.length * 8)
    - Math.min(10, pendingInbox)
    - Math.min(10, includeDiagnostics.missing.length * 3));

  return {
    generatedAt: new Date().toISOString(),
    score,
    status: score >= 90 ? "good" : score >= 70 ? "needs attention" : "critical",
    totalRecords,
    qualityRecords: qualityRecords.length,
    duplicateGroups,
    duplicateRecords,
    duplicateRate,
    corruptedRecords,
    includeDiagnostics,
    storage,
    growthTrend,
    issues,
    repairSuggestions,
    issueLimit
  };
}

export function runMemoryHealthRepair(config, { apply = false, issueLimit = 10 } = {}) {
  const beforeDiagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit });
  const plan = buildMemoryHealthRepairPlan(beforeDiagnostic.analysis);
  const result = {
    ok: true,
    apply,
    generatedAt: new Date().toISOString(),
    before: summarizeHealthAnalysisForRepair(beforeDiagnostic.analysis),
    plan: formatMemoryHealthRepairPlan(plan),
    backup: null,
    applied: {
      ledgerRecordsUpdated: 0,
      corruptedRecovered: 0,
      corruptedArchived: 0,
      duplicateSuperseded: 0
    },
    after: null
  };

  if (!apply || plan.totalActions === 0) {
    return result;
  }

  const backup = backupHub(config.memoryDir, "pre-health-repair");
  const ledger = readLedger(config.memoryDir);
  const applied = applyMemoryHealthRepairPlan(ledger, plan);
  writeLedger(config.memoryDir, applied.ledger);
  rebuildMemoryOutputs(config, applied.ledger);

  const afterDiagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit });
  return {
    ...result,
    backup,
    applied: applied.summary,
    after: summarizeHealthAnalysisForRepair(afterDiagnostic.analysis)
  };
}

function buildMemoryHealthRepairPlan(analysis) {
  const corrupted = analysis.corruptedRecords.map((record) => ({
    key: getMemoryPrimaryKey(record) || record.id || "",
    id: record.localEventId || record.id || "",
    pointer: formatMemoryRecordPointer(record),
    text: truncateText(record.text, 160),
    recoverable: Boolean(recoverMemoryEventFromRawText(record.text))
  })).filter((item) => item.key);

  const duplicateGroups = analysis.duplicateGroups.map((group) => {
    const keeper = chooseDuplicateKeeper(group.records);
    const keeperKey = getMemoryPrimaryKey(keeper) || keeper.id || "";
    const losers = group.records
      .filter((record) => record !== keeper)
      .map((record) => ({
        key: getMemoryPrimaryKey(record) || record.id || "",
        id: record.localEventId || record.id || "",
        pointer: formatMemoryRecordPointer(record),
        ts: record.ts || record.indexedAt || ""
      }))
      .filter((item) => item.key);
    return {
      keeperKey,
      keeperId: keeper.localEventId || keeper.id || "",
      example: group.example,
      count: group.count,
      losers
    };
  }).filter((group) => group.keeperKey && group.losers.length > 0);

  const duplicateLosers = duplicateGroups.reduce((sum, group) => sum + group.losers.length, 0);
  return {
    corrupted,
    duplicateGroups,
    totalActions: corrupted.length + duplicateLosers
  };
}

function applyMemoryHealthRepairPlan(ledger, plan) {
  const now = new Date().toISOString();
  const corruptedByKey = new Map(plan.corrupted.map((item) => [item.key, item]));
  const duplicateByKey = new Map();
  for (const group of plan.duplicateGroups) {
    for (const loser of group.losers) {
      duplicateByKey.set(loser.key, group);
    }
  }
  const summary = {
    ledgerRecordsUpdated: 0,
    corruptedRecovered: 0,
    corruptedArchived: 0,
    duplicateSuperseded: 0
  };

  const repairedLedger = ledger.map((record) => {
    const key = getMemoryPrimaryKey(record) || record.id || "";
    let next = record;
    if (corruptedByKey.has(key)) {
      const repaired = repairCorruptedLedgerRecord(next, now);
      next = repaired.record;
      summary.ledgerRecordsUpdated += 1;
      if (repaired.action === "recovered") {
        summary.corruptedRecovered += 1;
      } else {
        summary.corruptedArchived += 1;
      }
    }
    const duplicateGroup = duplicateByKey.get(key);
    if (duplicateGroup && !isMemoryHealthExcluded(next)) {
      next = markDuplicateLedgerRecordSuperseded(next, duplicateGroup.keeperKey, now);
      summary.ledgerRecordsUpdated += 1;
      summary.duplicateSuperseded += 1;
    }
    return next;
  });

  return { ledger: repairedLedger, summary };
}

function chooseDuplicateKeeper(records) {
  return [...records].sort((a, b) => {
    const corruptDelta = Number(isCorruptedMemoryRecord(a)) - Number(isCorruptedMemoryRecord(b));
    if (corruptDelta !== 0) return corruptDelta;
    const importanceDelta = Number(b.importance || 0) - Number(a.importance || 0);
    if (importanceDelta !== 0) return importanceDelta;
    return String(b.ts || b.indexedAt || "").localeCompare(String(a.ts || a.indexedAt || ""));
  })[0];
}

function repairCorruptedLedgerRecord(record, repairedAt) {
  const recovered = recoverMemoryEventFromRawText(record.text);
  if (recovered && recovered.text && !containsCorruptionMarker(recovered.text)) {
    return {
      action: "recovered",
      record: {
        ...record,
        source: recovered.source || (record.source === "raw" ? "health-repair" : record.source),
        text: sanitizeLedgerText(recovered.text),
        metadata: normalizeMemoryMetadata({
          ...record.metadata,
          ...recovered.metadata,
          lifecycle: {
            ...(record.metadata?.lifecycle || {}),
            healthRepair: {
              status: "recovered-corrupted",
              repairedAt,
              originalSource: record.source || "",
              originalKind: record.metadata?.kind || record.kind || ""
            }
          }
        }, recovered)
      }
    };
  }

  return {
    action: "archived",
    record: {
      ...record,
      source: record.source === "raw" ? "health-repair" : record.source,
      text: sanitizeLedgerText(record.text),
      superseded: true,
      supersededBy: ["health-repair"],
      healthExcluded: true,
      metadata: normalizeMemoryMetadata({
        ...record.metadata,
        kind: "archived",
        scope: "archive",
        confidence: 0.1,
        tags: [...normalizeList(record.metadata?.tags), "health-repair", "corrupted"],
        superseded: true,
        supersededBy: ["health-repair"],
        healthExcluded: true,
        lifecycle: {
          ...(record.metadata?.lifecycle || {}),
          healthExcluded: true,
          healthRepair: {
            status: "archived-corrupted",
            healthExcluded: true,
            repairedAt,
            originalSource: record.source || "",
            originalKind: record.metadata?.kind || record.kind || ""
          }
        }
      }, record)
    }
  };
}

function isCorruptedMemoryRecord(record) {
  if (isMemoryHealthExcluded(record)) {
    return false;
  }
  const text = String(record.text || "");
  return record.source === "raw" ||
    record.kind === "raw" ||
    containsCorruptionMarker(text);
}
