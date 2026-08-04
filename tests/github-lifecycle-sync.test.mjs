import assert from "node:assert/strict";
import test from "node:test";
import { parseGithubWebhook, syncGithubLifecycle } from "../src/github-lifecycle.js";

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

test("github lifecycle sync auto-links task references and preserves issue links", () => {
  const result = syncGithubLifecycle([
    { id: "task-1", status: "in_progress", githubLinks: { issue: "https://github.com/acme/amh/issues/7" } },
    { id: "task-2", status: "open" }
  ], [
    {
      html_url: "https://github.com/acme/amh/pull/22",
      title: "[AMH-TASK-task-1] Ship the integration",
      body: "Fixes #7",
      merged_at: "2026-08-04T00:00:00Z",
      merge_commit_sha: "def"
    },
    {
      html_url: "https://github.com/acme/amh/pull/23",
      title: "[AMH-TASK-task-2] Prepare the follow-up",
      merged: false
    }
  ]);

  assert.equal(result.changes.length, 2);
  const task1 = result.changes.find((change) => change.id === "task-1");
  assert.equal(task1.patch.status, "done");
  assert.deepEqual(task1.patch.githubLinks, {
    issue: "https://github.com/acme/amh/issues/7",
    pullRequest: "https://github.com/acme/amh/pull/22"
  });
  assert.equal(task1.patch.githubSync.mergeCommit, "def");

  const task2 = result.changes.find((change) => change.id === "task-2");
  assert.equal(task2.patch.status, undefined);
  assert.equal(task2.patch.githubLinks.pullRequest, "https://github.com/acme/amh/pull/23");
});

test("github webhook normalization keeps task references for auto-linking", () => {
  const webhook = parseGithubWebhook({
    action: "opened",
    repository: { full_name: "acme/amh" },
    pull_request: {
      number: 8,
      html_url: "https://github.com/acme/amh/pull/8",
      title: "[AMH-TASK-task-8] Add webhook support",
      body: "Relates to #9"
    }
  });

  assert.equal(webhook.accepted, true);
  assert.deepEqual(webhook.pullRequest.taskIds, ["task-8"]);
  assert.deepEqual(webhook.pullRequest.issueRefs, ["#9"]);
});

test("github lifecycle sync accepts GitHub-shaped pull request collections", () => {
  const result = syncGithubLifecycle(
    [{ id: "task-3", status: "open" }],
    { pullRequests: [{ html_url: "https://github.com/acme/amh/pull/30", title: "[AMH-TASK-task-3] Link this PR" }] }
  );
  assert.equal(result.changes[0].patch.githubLinks.pullRequest, "https://github.com/acme/amh/pull/30");
});

