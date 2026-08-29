import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  promptCommand,
  renderPrompt,
  extractVariables,
  findPromptIndex,
  createPrompt,
} from "../src/commands/prompt.js";

// Isolated temp memory dir + DI deps so the command group runs without the
// real hub or file lock.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amh-prompt-test-"));
const deps = {
  loadConfig: () => ({ memoryDir: tmp, sync: { lockStaleMs: 1000 } }),
  ensureHub: () => {},
  withHubLock: (_dir, _owner, fn) => fn(),
};

test("extractVariables finds unique template vars", () => {
  assert.deepEqual(extractVariables("Hi {{name}} {{name}} {{age}}").sort(), ["age", "name"]);
  assert.deepEqual(extractVariables("no vars here"), []);
});

test("renderPrompt substitutes variables", () => {
  assert.equal(renderPrompt("Hi {{name}}", { name: "X" }), "Hi X");
  assert.equal(renderPrompt("{{a}}-{{b}}", { a: "1", b: "2" }), "1-2");
});

test("findPromptIndex prefers exact id match", () => {
  const ps = [{ id: "a" }, { id: "ab" }, { id: "A" }];
  assert.equal(findPromptIndex(ps, "A"), 0);
  assert.equal(findPromptIndex(ps, "ab"), 1);
  assert.equal(findPromptIndex(ps, "z"), -1);
});

test("createPrompt builds a normalized record", () => {
  const p = createPrompt({ name: "t", type: "prd", content: "c" });
  assert.ok(/^[0-9a-f]{16}$/.test(p.id), "id should be a 16-char hex hash from createId");
  assert.equal(p.version, 1);
  assert.equal(p.content, "c");
  assert.deepEqual(p.variables, []);
});

test("prompt create writes templates.jsonl and extracts variables", () => {
  promptCommand(["create", "mytpl", "--type", "prd", "--content", "Hello {{x}}"], deps);
  const file = path.join(tmp, "prompts", "templates.jsonl");
  assert.ok(fs.existsSync(file), "templates.jsonl should exist");
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const p = JSON.parse(lines[0]);
  assert.equal(p.name, "mytpl");
  assert.deepEqual(p.variables, ["x"]);
});

test("prompt list returns the created template", () => {
  const log = [];
  const orig = console.log;
  console.log = (...a) => log.push(a.join(" "));
  try {
    promptCommand(["list"], deps);
  } finally {
    console.log = orig;
  }
  const parsed = JSON.parse(log[0]);
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.some((p) => p.name === "mytpl"));
});
