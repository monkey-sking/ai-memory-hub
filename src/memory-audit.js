const DUPLICATE_NORMALIZE_PATTERN = /\s+/g;
const REVIEW_SIGNAL_PATTERN = /(已作废|已废弃|被替代|已修正|纠正|不要沿用|当前版本|后续版本|不再使用|deprecated|obsolete|supersed)/i;

export function auditMemories(records = []) {
  const groups = new Map();
  for (const record of records) {
    const key = normalizeMemoryText(record.text);
    if (!key || key.length < 24) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const duplicateGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const newest = selectNewest(group);
      return {
        key: normalizeMemoryText(group[0].text),
        records: group.map(toSummary),
        keep: toSummary(newest),
        archive: group.filter((record) => record !== newest).map(toSummary)
      };
    });
  const reviewCandidates = records
    .filter((record) => REVIEW_SIGNAL_PATTERN.test(String(record.text || "")))
    .map((record) => ({ ...toSummary(record), reason: "contains correction/version/lifecycle signal" }));
  return {
    records: records.length,
    duplicateGroups,
    duplicateRecords: duplicateGroups.reduce((sum, group) => sum + group.archive.length, 0),
    reviewCandidates,
    autoArchiveCandidates: duplicateGroups.flatMap((group) => group.archive)
  };
}

export function normalizeMemoryText(text) {
  return String(text || "").toLowerCase().replace(DUPLICATE_NORMALIZE_PATTERN, "").trim();
}

function selectNewest(records) {
  return [...records].sort((a, b) => String(b.indexedAt || b.ts || "").localeCompare(String(a.indexedAt || a.ts || "")))[0];
}

function toSummary(record) {
  return {
    id: record.id || "",
    localEventId: record.localEventId || "",
    ts: record.ts || "",
    indexedAt: record.indexedAt || "",
    kind: record.kind || record.metadata?.kind || "note",
    project: record.project || record.metadata?.project || "",
    text: String(record.text || "").slice(0, 240)
  };
}
