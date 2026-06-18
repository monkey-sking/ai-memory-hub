import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(relativePath) {
  try {
    await fs.access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

test("project cleanup keeps verification scripts under tests", async () => {
  const rootVerifyFiles = [
    "verify-phase3.js",
    "verify-phase4.js",
    "verify-workflow-nodes.js",
    "verify-workflow-nodes.spec.js"
  ];

  for (const relativePath of rootVerifyFiles) {
    assert.equal(
      await exists(relativePath),
      false,
      `${relativePath} should not live in the repo root`
    );
    assert.equal(
      await exists(path.join("tests", path.basename(relativePath))),
      true,
      `${relativePath} should move into tests/`
    );
  }
});

test("project cleanup stores review artifacts under docs", async () => {
  assert.equal(await exists("ISSUES.md"), false, "ISSUES.md should move into docs/");
  assert.equal(await exists(path.join("docs", "ISSUES.md")), true, "docs/ISSUES.md should exist");

  assert.equal(await exists("screenshots"), false, "screenshots/ should move under docs/");
  assert.equal(
    await exists(path.join("docs", "screenshots")),
    true,
    "docs/screenshots/ should exist"
  );
});

test("project cleanup removes root public copy and tracks generated directories in gitignore", async () => {
  assert.equal(await exists("public"), false, "public/ should not live in the repo root");

  const gitignore = await fs.readFile(path.join(repoRoot, ".gitignore"), "utf8");
  for (const entry of [
    "logs/",
    "public/",
    "dashboard-next/dist/",
    "dashboard-next/node_modules/",
    "dashboard-next/test-results/"
  ]) {
    assert.match(gitignore, new RegExp(`(^|\\r?\\n)${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\r?\\n|$)`));
  }
});
