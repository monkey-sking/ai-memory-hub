import test from "node:test";
import assert from "node:assert/strict";
import {
  formatGithubCommitMessage,
  formatGithubTaskTag,
  normalizeGithubLinks
} from "../src/github-links.js";

test("github links normalize issue and pull request references", () => {
  assert.deepEqual(
    normalizeGithubLinks({
      issue: "https://github.com/acme/demo/issues/12",
      pullRequest: "#34"
    }),
    {
      issue: "https://github.com/acme/demo/issues/12",
      pullRequest: "#34"
    }
  );
});

test("empty github links are omitted", () => {
  assert.deepEqual(normalizeGithubLinks({ issue: "", pullRequest: null }), {});
});

test("github task tags are stable and commit messages are idempotent", () => {
  assert.equal(formatGithubTaskTag({ id: "task-1" }), "[AMH-TASK-task-1]");
  assert.equal(formatGithubCommitMessage("Fix the sync path", { id: "task-1" }), "[AMH-TASK-task-1] Fix the sync path");
  assert.equal(formatGithubCommitMessage("[AMH-TASK-task-1] Fix the sync path", { id: "task-1" }), "[AMH-TASK-task-1] Fix the sync path");
});
