// Locks the shared CLI helper layer (src/lib/cli.js) contract.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getOption,
  hasFlag,
  hasOption,
  positionalArgs,
  parsePositiveIntegerOption,
  createId,
  readJson,
  writeJson,
  countJsonlFiles,
} from "../src/lib/cli.js";

test("getOption parses --name value", () => {
  assert.strictEqual(getOption(["--limit", "20"], "--limit"), "20");
});

test("getOption returns empty when value is another flag", () => {
  assert.strictEqual(getOption(["--limit", "--verbose"], "--limit"), "");
});

test("getOption returns empty when absent", () => {
  assert.strictEqual(getOption(["x"], "--limit"), "");
});

test("hasFlag / hasOption", () => {
  assert.strictEqual(hasFlag(["--force"], "--force"), true);
  assert.strictEqual(hasFlag(["x"], "--force"), false);
  assert.strictEqual(hasOption(["--force"], "--force"), true);
});

test("positionalArgs skips --key value pairs", () => {
  assert.deepStrictEqual(positionalArgs(["a", "--limit", "20", "b"]), ["a", "b"]);
});

test("parsePositiveIntegerOption", () => {
  assert.strictEqual(parsePositiveIntegerOption("5", "--n"), 5);
  assert.strictEqual(parsePositiveIntegerOption("", "--n", { allowEmpty: true, defaultValue: 3 }), 3);
  assert.throws(() => parsePositiveIntegerOption("0", "--n"), /positive integer/);
  assert.throws(() => parsePositiveIntegerOption("x", "--n"), /positive integer/);
});

test("createId returns 16-char hex", () => {
  assert.match(createId("seed"), /^[0-9a-f]{16}$/);
});

test("readJson/writeJson round-trip + countJsonlFiles", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amh-cli-test-"));
  try {
    const file = path.join(dir, "data.json");
    writeJson(file, { a: 1 });
    assert.deepStrictEqual(readJson(file), { a: 1 });
    fs.writeFileSync(path.join(dir, "x.jsonl"), "{}");
    assert.strictEqual(countJsonlFiles(dir), 1);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
