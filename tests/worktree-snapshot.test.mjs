import assert from "node:assert/strict";
import test from "node:test";
import { buildWorktreeSnapshot } from "../src/worktree-snapshot.js";

test("worktree snapshot exposes commits, diff, and review blockers", () => {
  const snapshot = buildWorktreeSnapshot({
    path: "C:/worktree",
    base: "base-commit",
    head: "head-commit",
    branch: "amh/codex/task-1"
  }, {
    runGit: (args) => ({
      "status --short": " M src/index.js",
      "diff --stat": " src/index.js | 10 +++++++---",
      "log": "head-commit\thead\tCodex\t2026-08-03T10:00:00Z\tAdd feature\nbase-commit\tbase\tCodex\t2026-08-02T10:00:00Z\tBase"
    })[args] || ""
  });
  assert.equal(snapshot.dirty, true);
  assert.equal(snapshot.diffStat, "src/index.js | 10 +++++++---");
  assert.equal(snapshot.commits.length, 2);
  assert.equal(snapshot.commits[0].subject, "Add feature");
  assert.equal(snapshot.reviewReady, true);
});

test("worktree snapshot remains safe when path is missing", () => {
  const snapshot = buildWorktreeSnapshot({ path: "C:/missing", base: "", head: "" }, { exists: false });
  assert.equal(snapshot.exists, false);
  assert.equal(snapshot.reviewReady, false);
  assert.ok(snapshot.reviewBlockers.includes("path missing"));
});

