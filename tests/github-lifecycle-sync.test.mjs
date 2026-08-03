import assert from "node:assert/strict";
import test from "node:test";
import { syncGithubLifecycle } from "../src/github-lifecycle.js";

test("github lifecycle sync marks only linked merged pull requests done", () => {
  const result = syncGithubLifecycle([
    { id: "task-1", status: "in_progress", githubLinks: { pullRequest: "https://github.com/acme/amh/pull/12" } },
    { id: "task-2", status: "in_progress", githubLinks: { pullRequest: "https://github.com/acme/amh/pull/13" } }
  ], [
    { url: "https://github.com/acme/amh/pull/12", merged: true, mergedAt: "2026-08-03T10:00:00Z", mergeCommit: "abc" },
    { url: "https://github.com/acme/amh/pull/13", merged: false }
  ]);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].id, "task-1");
  assert.equal(result.changes[0].patch.status, "done");
  assert.equal(result.unchanged.length, 1);
});

