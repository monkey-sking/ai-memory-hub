import test from "node:test";
import assert from "node:assert/strict";
import { applyCandidateDecision, mineSkillCandidates } from "../src/skill-mining.js";

test("skill mining extracts durable-looking completion notes as pending candidates", () => {
  const candidates = mineSkillCandidates({
    id: "task-1",
    title: "Fix parser",
    project: "demo",
    notes: [
      { by: "codex", text: "Correction: always validate the header before decoding payloads." },
      { by: "codex", text: "Completed by codex." },
      { by: "codex", text: "Short update" }
    ]
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, "pending");
  assert.equal(candidates[0].sourceTaskId, "task-1");
  assert.match(candidates[0].text, /validate the header/);
});

test("skill mining does not invent candidates from ordinary completion notes", () => {
  assert.deepEqual(
    mineSkillCandidates({ id: "task-2", notes: [{ text: "Ran tests." }] }),
    []
  );
});

test("candidate decisions preserve review provenance", () => {
  const updated = applyCandidateDecision(
    { id: "candidate-1", status: "pending" },
    { status: "approved", reviewer: "human", note: "Evidence is sufficient" },
    "2026-07-31T10:00:00.000Z"
  );

  assert.deepEqual(updated, {
    id: "candidate-1",
    status: "approved",
    reviewedBy: "human",
    reviewedAt: "2026-07-31T10:00:00.000Z",
    reviewNote: "Evidence is sufficient"
  });
});
