export function createDashboardHealthApi({
  analyzeMemoryHealth,
  buildMemoryIndex,
  formatBytes,
  formatMemoryRecordPointer,
  formatPercent,
  readLedger,
  renderMemoryHealthReport,
  sanitizeInlineText,
  truncateText
}) {
  function buildMemoryHealthDiagnostic(config, options = {}) {
    const ledger = readLedger(config.memoryDir);
    const index = buildMemoryIndex(ledger, config);
    const analysis = analyzeMemoryHealth(config, index, options);
    return {
      analysis,
      markdown: renderMemoryHealthReport(config, index, {
        ...options,
        analysis
      })
    };
  }

  function formatHealthAnalysisForDashboard(analysis) {
    const issueLimit = Number(analysis.issueLimit || 10);
    return {
      generatedAt: analysis.generatedAt,
      score: analysis.score,
      status: analysis.status,
      totalRecords: analysis.totalRecords,
      qualityRecords: analysis.qualityRecords,
      duplicateRecords: analysis.duplicateRecords,
      duplicateRate: analysis.duplicateRate,
      duplicateRatePercent: formatPercent(analysis.duplicateRate),
      corruptedRecordsCount: analysis.corruptedRecords.length,
      storage: {
        totalBytes: analysis.storage.totalBytes,
        totalDisplay: formatBytes(analysis.storage.totalBytes),
        ledgerBytes: analysis.storage.ledgerBytes,
        ledgerDisplay: formatBytes(analysis.storage.ledgerBytes),
        backupsBytes: analysis.storage.backupsBytes,
        backupsDisplay: formatBytes(analysis.storage.backupsBytes),
        items: analysis.storage.items.map((item) => ({
          label: item.label,
          bytes: item.bytes,
          display: formatBytes(item.bytes)
        }))
      },
      growthTrend: analysis.growthTrend,
      issues: analysis.issues.map((issue) => ({
        level: issue.level,
        title: issue.title,
        detail: issue.detail,
        action: issue.action || null
      })),
      repairSuggestions: analysis.repairSuggestions,
      duplicateGroups: analysis.duplicateGroups.slice(0, issueLimit).map((group) => ({
        count: group.count,
        example: group.example,
        records: group.records.slice(0, issueLimit).map((record) => ({
          pointer: formatMemoryRecordPointer(record),
          id: sanitizeInlineText(record.localEventId || record.id || ""),
          source: sanitizeInlineText(record.source || "unknown"),
          kind: sanitizeInlineText(record.kind || record.metadata?.kind || "note"),
          ts: sanitizeInlineText(record.ts || record.indexedAt || "")
        }))
      })),
      corruptedRecords: analysis.corruptedRecords.slice(0, issueLimit).map((record) => ({
        pointer: formatMemoryRecordPointer(record),
        text: truncateText(record.text, 160)
      })),
      includeDiagnostics: {
        filesScanned: analysis.includeDiagnostics?.filesScanned || 0,
        includesChecked: analysis.includeDiagnostics?.includesChecked || 0,
        missing: (analysis.includeDiagnostics?.missing || []).slice(0, issueLimit).map((item) => ({
          file: item.file,
          include: item.include,
          expectedPath: item.expectedPath,
          suggestions: item.suggestions
        }))
      }
    };
  }

  return {
    buildMemoryHealthDiagnostic,
    formatHealthAnalysisForDashboard
  };
}
