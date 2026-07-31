import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAdversarialVerifier,
  normalizeReviewDimensions,
  validateAdversarialVerifier,
  validateReviewDimensions
} from "../src/review-config.js";

test("review dimensions normalize to unique non-empty strings", () => {
  assert.deepEqual(
    normalizeReviewDimensions(["correctness", " tests ", "correctness", ""]),
    ["correctness", "tests"]
  );
  assert.deepEqual(normalizeReviewDimensions("security, scope"), ["security", "scope"]);
});

test("adversarial verifier normalizes enabled checks", () => {
  assert.deepEqual(
    normalizeAdversarialVerifier({
      enabled: true,
      checks: ["Find a failing input", "", "Check edge cases"]
    }),
    { enabled: true, checks: ["Find a failing input", "Check edge cases"] }
  );
  assert.deepEqual(normalizeAdversarialVerifier(false), { enabled: false, checks: [] });
});

test("review configuration validators reject malformed input", () => {
  assert.equal(validateReviewDimensions(["correctness", "tests"]).valid, true);
  assert.equal(validateReviewDimensions(["correctness", ""]).valid, false);
  assert.equal(validateAdversarialVerifier({ enabled: true, checks: ["edge cases"] }).valid, true);
  assert.equal(validateAdversarialVerifier({ enabled: "yes" }).valid, false);
});
