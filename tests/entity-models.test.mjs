import test from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_STATUSES,
  getProjectEventStoreDefinition,
  getPromptEventStoreDefinition,
  getTaskEventStoreDefinition,
  getWorkflowEventStoreDefinition,
  normalizeDispatchWorktreeMetadata,
  normalizeNonNegativeInteger,
  normalizePriority,
  normalizeProject,
  normalizePrompt,
  normalizeQualityGate,
  normalizeTask,
  normalizeWorkflow,
  parseProjectListOption,
  uniqueStringList
} from "../src/lib/entity-models.js";

test("task normalization defaults invalid status, priority, and filters empty notes", () => {
  const normalized = normalizeTask({
    title: "Ship v2.7",
    status: "not-a-status",
    priority: "URGENT",
    notes: [{ text: "kickoff" }, { text: "" }]
  });

  assert.equal(normalized.title, "Ship v2.7");
  assert.equal(normalized.status, "open");
  assert.equal(normalized.priority, "urgent");
  assert.equal(normalized.assignee, "");
  assert.equal(normalized.worktree, null);
  assert.equal(normalized.notes.length, 1);
  assert.equal(normalized.notes[0].text, "kickoff");
  assert.equal(normalized.notes[0].by, "unknown");
});

test("task ids are deterministic for the same input", () => {
  const first = normalizeTask({ title: "Stable id" });
  const second = normalizeTask({ title: "Stable id" });
  assert.equal(first.id, second.id);
  assert.ok(first.id);
});

test("task normalization preserves OPC v1.1 custom fields", () => {
  const normalized = normalizeTask({
    title: "Budgeted",
    budget: { maxTokens: 100 },
    failType: "timeout",
    failCount: 2,
    lastFailAt: "2026-08-28T00:00:00Z",
    evaluationSignals: [{ name: "ok" }]
  });
  assert.deepEqual(normalized.budget, { maxTokens: 100 });
  assert.equal(normalized.failType, "timeout");
  assert.equal(normalized.failCount, 2);
  assert.equal(normalized.lastFailAt, "2026-08-28T00:00:00Z");
  assert.deepEqual(normalized.evaluationSignals, [{ name: "ok" }]);
});

test("workflow normalization splits role strings and arrays", () => {
  const normalized = normalizeWorkflow({
    title: "Refactor",
    status: "bogus",
    planner: "codex, claude",
    executor: ["gemini"]
  });

  assert.equal(normalized.status, "open");
  assert.deepEqual(normalized.planner, ["codex", "claude"]);
  assert.deepEqual(normalized.executor, ["gemini"]);
  assert.deepEqual(normalized.reviewer, []);
  assert.deepEqual(normalized.observer, []);
  assert.equal(normalized.usesDerivedStatus, false);
});

test("workflow and task quality gates share the same normalizer", () => {
  const gate = normalizeQualityGate({ verifyCommands: ["npm test", "  "] });
  assert.deepEqual(gate.verifyCommands, [{ command: "npm test", args: [] }]);

  const task = normalizeTask({ title: "gated", verifyCommands: ["npm run lint"] });
  const workflow = normalizeWorkflow({ title: "gated", verifyCommands: ["npm run lint"] });
  assert.deepEqual(task.qualityGate, workflow.qualityGate);
  assert.deepEqual(task.qualityGate.verifyCommands, [{ command: "npm run lint", args: [] }]);
});

test("project normalization validates status and dedupes aliases", () => {
  const normalized = normalizeProject({
    id: "amh",
    name: "AI Memory Hub",
    status: "ACTIVE",
    aliases: ["hub", "HUB", " amh "]
  });

  assert.equal(normalized.status, "active");
  assert.equal(normalized.displayName, "AI Memory Hub");
  assert.deepEqual(normalized.aliases, ["hub", "amh"]);
  assert.deepEqual(normalized.resources, {});
});

test("project normalization rejects unknown statuses", () => {
  assert.throws(
    () => normalizeProject({ id: "x", name: "X", status: "nope" }),
    new RegExp(`Expected ${PROJECT_STATUSES.join("\\|")}`)
  );
});

test("prompt normalization applies prompt defaults", () => {
  const normalized = normalizePrompt({ name: "standup" });
  assert.equal(normalized.type, "general");
  assert.equal(normalized.createdBy, "unknown");
  assert.equal(normalized.version, 1);
  assert.deepEqual(normalized.variables, []);
  assert.equal(normalized.content, "");
});

test("event-store definitions describe entity layout and validity", () => {
  const taskDef = getTaskEventStoreDefinition();
  assert.equal(taskDef.entity, "task");
  assert.equal(taskDef.dirName, "tasks");
  assert.equal(taskDef.projectionName, "tasks.jsonl");
  // isValid returns `id && title`, i.e. a truthy string / falsy value rather than a boolean
  assert.ok(taskDef.isValid({ id: "t1", title: "T" }));
  assert.ok(!taskDef.isValid({ id: "t1" }));
  assert.ok(!taskDef.isValid({ title: "T" }));

  assert.equal(getProjectEventStoreDefinition().projectionName, "projects.jsonl");
  assert.equal(getWorkflowEventStoreDefinition().dirName, "workflows");
  assert.equal(getPromptEventStoreDefinition().projectionName, "templates.jsonl");

  for (const definition of [
    getTaskEventStoreDefinition(),
    getProjectEventStoreDefinition(),
    getWorkflowEventStoreDefinition(),
    getPromptEventStoreDefinition()
  ]) {
    assert.equal(typeof definition.normalize, "function");
  }
});

test("shared helpers keep their list and integer semantics", () => {
  assert.deepEqual(uniqueStringList([" a ", "A", "b", ""]), ["a", "b"]);
  assert.deepEqual(parseProjectListOption(" x, y ,,z "), ["x", "y", "z"]);
  assert.equal(normalizePriority("URGENT"), "urgent");
  assert.equal(normalizePriority("nonsense"), "normal");
  assert.equal(normalizeNonNegativeInteger("3"), 3);
  assert.equal(normalizeNonNegativeInteger(-1), null);
  assert.equal(normalizeNonNegativeInteger(""), null);
  assert.equal(normalizeDispatchWorktreeMetadata(null), null);
  assert.equal(normalizeDispatchWorktreeMetadata({ branch: "feat/x" }).branch, "feat/x");
});
