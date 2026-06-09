import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");

async function withHub(fn) {
  const memoryDir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-core-test-"));
  try {
    const init = runCli(memoryDir, ["init"]);
    assert.equal(init.status, 0, init.stderr || init.stdout);
    await fn(memoryDir);
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
}

function runCli(memoryDir, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AI_MEMORY_DIR: memoryDir
    },
    encoding: "utf8",
    windowsHide: true
  });
}

function parseJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

async function writeRecipe(memoryDir, name, recipe) {
  const recipesDir = path.join(memoryDir, "recipes");
  await fs.mkdir(recipesDir, { recursive: true });
  await fs.writeFile(path.join(recipesDir, `${name}.json`), JSON.stringify(recipe, null, 2), "utf8");
}

test("task add creates normalized task records", async () => {
  await withHub(async (memoryDir) => {
    const task = parseJson(runCli(memoryDir, [
      "task",
      "add",
      "Build task telemetry",
      "--from",
      "codex",
      "--project",
      "ai-memory-hub",
      "--priority",
      "high",
      "--description",
      "Show execution metadata",
      "--handoff",
      "Use local task state"
    ]));

    assert.match(task.id, /^[a-f0-9]{16}$/);
    assert.equal(task.status, "open");
    assert.equal(task.assignee, "");
    assert.equal(task.createdBy, "codex");
    assert.equal(task.project, "ai-memory-hub");
    assert.equal(task.priority, "high");
    assert.equal(task.title, "Build task telemetry");
    assert.equal(task.description, "Show execution metadata");
    assert.equal(task.handoff, "Use local task state");
    assert.deepEqual(task.notes, []);

    const tasks = parseJson(runCli(memoryDir, [
      "task",
      "list",
      "--status",
      "open",
      "--project",
      "ai-memory-hub"
    ]));
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, task.id);
  });
});

test("workflow create normalizes role lists and metadata", async () => {
  await withHub(async (memoryDir) => {
    const workflow = parseJson(runCli(memoryDir, [
      "workflow",
      "create",
      "Ship dashboard flow",
      "--from",
      "codex",
      "--project",
      "ai-memory-hub",
      "--priority",
      "urgent",
      "--planner",
      "claude,codex",
      "--executor",
      "gemini",
      "--reviewer",
      "qclaw",
      "--observer",
      "marvis",
      "--plan",
      "Plan, build, review",
      "--acceptance",
      "All checks pass"
    ]));

    assert.match(workflow.id, /^[a-f0-9]{16}$/);
    assert.equal(workflow.status, "open");
    assert.equal(workflow.createdBy, "codex");
    assert.equal(workflow.project, "ai-memory-hub");
    assert.equal(workflow.priority, "urgent");
    assert.deepEqual(workflow.planner, ["claude", "codex"]);
    assert.deepEqual(workflow.executor, ["gemini"]);
    assert.deepEqual(workflow.reviewer, ["qclaw"]);
    assert.deepEqual(workflow.observer, ["marvis"]);
    assert.equal(workflow.plan, "Plan, build, review");
    assert.equal(workflow.acceptance, "All checks pass");
    assert.deepEqual(workflow.results, []);
    assert.deepEqual(workflow.reviews, []);

    const workflows = parseJson(runCli(memoryDir, [
      "workflow",
      "list",
      "--status",
      "open",
      "--project",
      "ai-memory-hub"
    ]));
    assert.equal(workflows.length, 1);
    assert.equal(workflows[0].id, workflow.id);
  });
});

test("recipe validate rejects invalid role and dependency references", async () => {
  await withHub(async (memoryDir) => {
    await writeRecipe(memoryDir, "bad-role", {
      name: "bad-role",
      title: "Bad Role",
      roles: { planner: {} },
      steps: [
        { id: "implementation", role: "executor", task: "Implement" }
      ]
    });

    const badRole = runCli(memoryDir, ["recipe", "validate", "bad-role"]);
    assert.equal(badRole.status, 1);
    assert.match(JSON.parse(badRole.stdout).error, /undefined role: executor/);

    await writeRecipe(memoryDir, "bad-dep", {
      name: "bad-dep",
      title: "Bad Dependency",
      roles: { planner: {} },
      steps: [
        { id: "planning", role: "planner", task: "Plan", dependsOn: ["missing"] }
      ]
    });

    const badDep = runCli(memoryDir, ["recipe", "validate", "bad-dep"]);
    assert.equal(badDep.status, 1);
    assert.match(JSON.parse(badDep.stdout).error, /depends on non-existent step: missing/);
  });
});

test("recipe create validates and creates workflow tasks", async () => {
  await withHub(async (memoryDir) => {
    await writeRecipe(memoryDir, "implement-and-review", {
      name: "implement-and-review",
      title: "Implement and Review",
      description: "Build with review",
      version: "1.0.0",
      variables: { priority: "normal" },
      roles: {
        planner: {},
        executor: {},
        reviewer: {}
      },
      steps: [
        { id: "plan", role: "planner", task: "Plan the change" },
        { id: "implementation", role: "executor", task: "Implement the change", dependsOn: ["plan"] },
        { id: "review", role: "reviewer", task: "Review the change", dependsOn: ["implementation"] }
      ]
    });

    const validation = parseJson(runCli(memoryDir, ["recipe", "validate", "implement-and-review"]));
    assert.deepEqual(validation, { valid: true, message: "Recipe is valid" });

    const result = parseJson(runCli(memoryDir, [
      "recipe",
      "create",
      "--recipe",
      "implement-and-review",
      "--tools",
      "planner:claude,executor:codex,reviewer:gemini",
      "--project",
      "ai-memory-hub",
      "--var",
      "priority=high"
    ]));

    assert.equal(result.workflow.title, "Implement and Review - ai-memory-hub");
    assert.equal(result.workflow.project, "ai-memory-hub");
    assert.equal(result.workflow.priority, "high");
    assert.deepEqual(result.workflow.planner, ["claude"]);
    assert.deepEqual(result.workflow.executor, ["codex"]);
    assert.deepEqual(result.workflow.reviewer, ["gemini"]);
    assert.equal(result.recipe.name, "implement-and-review");
    assert.equal(result.recipe.steps, 3);
    assert.deepEqual(result.tasks.map((task) => task.assignee), ["claude", "codex", "gemini"]);
    assert.deepEqual(result.tasks.map((task) => task.title), [
      "[implement-and-review] Plan the change",
      "[implement-and-review] Implement the change",
      "[implement-and-review] Review the change"
    ]);
  });
});
