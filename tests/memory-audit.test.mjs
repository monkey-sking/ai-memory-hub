import assert from "node:assert/strict";
import test from "node:test";
import { auditMemories } from "../src/memory-audit.js";

test("memory audit groups exact semantic duplicates and keeps newest", () => {
  const result = auditMemories([
    { id: "old", text: "同一条需要长期保留的跨工具协作规则内容和验收要求", ts: "2026-06-01T00:00:00Z" },
    { id: "new", text: "同一条 需要长期保留的跨工具协作规则内容和验收要求", ts: "2026-06-02T00:00:00Z" },
    { id: "correction", text: "旧算法已作废，当前版本使用新算法", ts: "2026-06-03T00:00:00Z" }
  ]);
  assert.equal(result.duplicateGroups.length, 1);
  assert.equal(result.duplicateRecords, 1);
  assert.equal(result.duplicateGroups[0].keep.id, "new");
  assert.equal(result.autoArchiveCandidates[0].id, "old");
  assert.equal(result.reviewCandidates.length, 1);
});
