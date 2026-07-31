import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGithubLinks } from "../src/github-links.js";

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
