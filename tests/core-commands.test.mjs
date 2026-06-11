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

async function writeTaskSpec(memoryDir, name, spec) {
  const file = path.join(memoryDir, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(spec, null, 2), "utf8");
  return file;
}

async function appendJsonl(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
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

    const events = await readJsonl(path.join(memoryDir, "tasks", "events.jsonl"));
    assert.ok(events.some((event) => (
      event.type === "task.upsert" &&
      event.entityId === task.id &&
      event.record.title === "Build task telemetry"
    )));
  });
});

test("project registry CLI manages metadata, aliases, relations, and archive state", async () => {
  await withHub(async (memoryDir) => {
    const visibleSeeds = parseJson(runCli(memoryDir, ["project", "list", "--status", "visible"]));
    assert.ok(visibleSeeds.some((project) => project.id === "ai-memory-hub"));
    assert.ok(visibleSeeds.some((project) => project.id === "sample-media"));
    assert.ok(visibleSeeds.every((project) => project.status !== "archived"));

    const project = parseJson(runCli(memoryDir, [
      "project",
      "add",
      "registry-demo",
      "--name",
      "Registry Test",
      "--display-name",
      "Registry Test Project",
      "--status",
      "planning",
      "--type",
      "tool",
      "--description",
      "Project registry CLI coverage",
      "--aliases",
      "registry-test,registry demo",
      "--feishu",
      "https://example.test/wiki",
      "--repo",
      "<local-repo-path>",
      "--docs",
      "https://example.test/doc-a,https://example.test/doc-b"
    ]));
    assert.equal(project.id, "registry-demo");
    assert.equal(project.status, "planning");
    assert.equal(project.displayName, "Registry Test Project");
    assert.deepEqual(project.aliases, ["registry-test", "registry demo"]);
    assert.equal(project.resources.feishu, "https://example.test/wiki");
    assert.deepEqual(project.resources.docs, ["https://example.test/doc-a", "https://example.test/doc-b"]);

    const aliased = parseJson(runCli(memoryDir, ["project", "show", "registry demo"]));
    assert.equal(aliased.id, "registry-demo");

    const updated = parseJson(runCli(memoryDir, [
      "project",
      "update",
      "registry-demo",
      "--status",
      "active",
      "--description",
      "Updated registry project",
      "--resource",
      "dashboard=https://127.0.0.1:38789"
    ]));
    assert.equal(updated.status, "active");
    assert.equal(updated.description, "Updated registry project");
    assert.equal(updated.resources.dashboard, "https://127.0.0.1:38789");

    const withAlias = parseJson(runCli(memoryDir, ["project", "alias", "registry-demo", "registry-alias"]));
    assert.ok(withAlias.aliases.includes("registry-alias"));

    const related = parseJson(runCli(memoryDir, [
      "project",
      "relate",
      "registry-alias",
      "--based-on",
      "ai-memory-hub",
      "--relation",
      "plugin"
    ]));
    assert.equal(related.metadata.basedOn, "ai-memory-hub");
    assert.equal(related.metadata.relation, "plugin");

    const archived = parseJson(runCli(memoryDir, ["project", "archive", "registry-demo", "--by", "codex"]));
    assert.equal(archived.status, "archived");
    assert.equal(archived.archivedBy, "codex");

    const visibleAfterArchive = parseJson(runCli(memoryDir, ["project", "list", "--status", "visible"]));
    assert.equal(visibleAfterArchive.some((item) => item.id === "registry-demo"), false);

    const migratePreview = parseJson(runCli(memoryDir, ["project", "migrate"]));
    assert.equal(migratePreview.apply, false);
    assert.equal(migratePreview.added, 0);

    const migrateApply = parseJson(runCli(memoryDir, ["project", "migrate", "--apply"]));
    assert.equal(migrateApply.apply, true);
    assert.equal(migrateApply.added, 0);

    const projectsFile = await fs.readFile(path.join(memoryDir, "projects", "projects.jsonl"), "utf8");
    assert.match(projectsFile, /"id":"registry-demo"/);

    const events = await readJsonl(path.join(memoryDir, "projects", "events.jsonl"));
    assert.ok(events.some((event) => event.type === "project.upsert" && event.entityId === "registry-demo"));
    assert.ok(events.some((event) => event.reason === "project:update" && event.record.archivedBy === "codex"));
  });
});

test("task, workflow, and project projections rebuild from event streams", async () => {
  await withHub(async (memoryDir) => {
    const task = parseJson(runCli(memoryDir, [
      "task",
      "add",
      "Rebuild projection task",
      "--from",
      "codex",
      "--project",
      "ai-memory-hub"
    ]));
    const project = parseJson(runCli(memoryDir, [
      "project",
      "add",
      "projection-demo",
      "--name",
      "Projection Demo",
      "--status",
      "planning"
    ]));
    const workflow = parseJson(runCli(memoryDir, [
      "workflow",
      "create",
      "Projection workflow",
      "--from",
      "codex",
      "--project",
      "ai-memory-hub"
    ]));

    await fs.writeFile(path.join(memoryDir, "tasks", "tasks.jsonl"), `${JSON.stringify({
      id: "stale-projection-only",
      title: "Stale projection only",
      project: "ai-memory-hub"
    })}\n`, "utf8");
    await fs.writeFile(path.join(memoryDir, "workflows", "workflows.jsonl"), `${JSON.stringify({
      id: "stale-workflow-projection-only",
      title: "Stale workflow projection only",
      project: "ai-memory-hub"
    })}\n`, "utf8");
    await fs.rm(path.join(memoryDir, "projects", "projects.jsonl"), { force: true });

    const listBeforeSync = parseJson(runCli(memoryDir, ["task", "list", "--status", "all", "--limit", "50"]));
    assert.ok(listBeforeSync.some((item) => item.id === task.id));
    assert.equal(listBeforeSync.some((item) => item.id === "stale-projection-only"), false);

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);
    assert.match(sync.stdout, /Rebuilt event-sourced projections: tasks=/);
    assert.match(sync.stdout, /workflows=/);

    const tasksProjection = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.ok(tasksProjection.some((item) => item.id === task.id));
    assert.equal(tasksProjection.some((item) => item.id === "stale-projection-only"), false);

    const workflowsProjection = await readJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"));
    assert.ok(workflowsProjection.some((item) => item.id === workflow.id));
    assert.equal(workflowsProjection.some((item) => item.id === "stale-workflow-projection-only"), false);

    const projectsProjection = await readJsonl(path.join(memoryDir, "projects", "projects.jsonl"));
    assert.ok(projectsProjection.some((item) => item.id === project.id));
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

    const events = await readJsonl(path.join(memoryDir, "workflows", "events.jsonl"));
    assert.ok(events.some((event) => (
      event.type === "workflow.upsert" &&
      event.entityId === workflow.id &&
      event.record.title === "Ship dashboard flow"
    )));
  });
});

test("normalization preserves flat and nested quality gate fields", async () => {
  await withHub(async (memoryDir) => {
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "gate-task",
      createdAt: "2026-06-11T00:00:00.000Z",
      createdBy: "test",
      title: "Gate task",
      project: "ai-memory-hub",
      verifyCommands: ["npm test"],
      qualityGate: {
        stopWhen: ["review_blocks_remain"],
        reviewRequired: true
      }
    });
    await appendJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"), {
      id: "gate-workflow",
      createdAt: "2026-06-11T00:00:00.000Z",
      createdBy: "test",
      title: "Gate workflow",
      project: "ai-memory-hub",
      maxRepairAttempts: 2,
      qualityGate: {
        allowedActions: ["local_file_edits"]
      }
    });

    const tasks = parseJson(runCli(memoryDir, [
      "task",
      "list",
      "--project",
      "ai-memory-hub"
    ]));
    assert.deepEqual(tasks[0].qualityGate, {
      verifyCommands: [
        { command: "npm test", args: [] }
      ],
      stopWhen: ["review_blocks_remain"],
      reviewRequired: true
    });

    const workflows = parseJson(runCli(memoryDir, [
      "workflow",
      "list",
      "--status",
      "open",
      "--project",
      "ai-memory-hub"
    ]));
    assert.deepEqual(workflows[0].qualityGate, {
      allowedActions: ["local_file_edits"],
      maxRepairAttempts: 2
    });
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

test("recipe validate rejects malformed quality gate fields", async () => {
  await withHub(async (memoryDir) => {
    await writeRecipe(memoryDir, "bad-recipe-gate", {
      name: "bad-recipe-gate",
      title: "Bad Recipe Gate",
      roles: { executor: {} },
      qualityGate: {
        verifyCommands: "npm test"
      },
      steps: [
        { id: "implementation", role: "executor", task: "Implement" }
      ]
    });

    const badRecipeGate = runCli(memoryDir, ["recipe", "validate", "bad-recipe-gate"]);
    assert.equal(badRecipeGate.status, 1);
    assert.match(JSON.parse(badRecipeGate.stdout).error, /Recipe\.qualityGate\.verifyCommands must be an array/);

    await writeRecipe(memoryDir, "bad-step-gate", {
      name: "bad-step-gate",
      title: "Bad Step Gate",
      roles: { executor: {} },
      steps: [
        { id: "repair", role: "executor", task: "Repair", maxRepairAttempts: "3" }
      ]
    });

    const badStepGate = runCli(memoryDir, ["recipe", "validate", "bad-step-gate"]);
    assert.equal(badStepGate.status, 1);
    assert.match(JSON.parse(badStepGate.stdout).error, /Step repair\.maxRepairAttempts must be a non-negative integer/);
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
      qualityGate: {
        verifyCommands: ["npm test"],
        reviewRequired: true,
        maxRepairAttempts: 2,
        stopWhen: ["review blocks remain"]
      },
      roles: {
        planner: {},
        executor: {},
        reviewer: {}
      },
      steps: [
        { id: "plan", role: "planner", task: "Plan the change" },
        {
          id: "implementation",
          role: "executor",
          task: "Implement the change",
          dependsOn: ["plan"],
          verifyCommands: ["node --check src/index.js"],
          maxRepairAttempts: 1
        },
        { id: "review", role: "reviewer", task: "Review the change", dependsOn: ["implementation"], reviewRequired: true }
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
    assert.deepEqual(result.workflow.recipe, {
      name: "implement-and-review",
      title: "Implement and Review",
      version: "1.0.0",
      variables: { priority: "high", project: "ai-memory-hub" },
      steps: 3
    });
    assert.deepEqual(result.workflow.qualityGate, {
      verifyCommands: [
        { command: "npm test", args: [] }
      ],
      stopWhen: ["review blocks remain"],
      reviewRequired: true,
      maxRepairAttempts: 2
    });

    const generatedTasks = parseJson(runCli(memoryDir, [
      "task",
      "list",
      "--project",
      "ai-memory-hub"
    ]));
    const implementationTask = generatedTasks.find((task) => task.recipeStep?.id === "implementation");
    assert.equal(implementationTask.recipe.name, "implement-and-review");
    assert.deepEqual(implementationTask.recipeStep.dependsOn, ["plan"]);
    assert.equal(implementationTask.recipeStep.workflowId, result.workflow.id);
    assert.deepEqual(implementationTask.qualityGate, {
      verifyCommands: [
        { command: "node --check src/index.js", args: [] }
      ],
      stopWhen: ["review blocks remain"],
      reviewRequired: true,
      maxRepairAttempts: 1
    });

    const generatedWorkflows = parseJson(runCli(memoryDir, [
      "workflow",
      "list",
      "--status",
      "open",
      "--project",
      "ai-memory-hub"
    ]));
    assert.equal(generatedWorkflows[0].recipe.name, "implement-and-review");
    assert.equal(generatedWorkflows[0].qualityGate.reviewRequired, true);
  });
});

test("built-in development recipes are discoverable, valid, and runnable", async () => {
  await withHub(async (memoryDir) => {
    const recipes = parseJson(runCli(memoryDir, ["recipe", "list"]));
    const frontend = recipes.find((recipe) => recipe.name === "frontend-feature");
    const backend = recipes.find((recipe) => recipe.name === "backend-service");
    const fullstack = recipes.find((recipe) => recipe.name === "fullstack-feature");
    const lightsOut = recipes.find((recipe) => recipe.name === "lights-out-local");
    assert.equal(frontend.source, "builtin");
    assert.equal(backend.source, "builtin");
    assert.equal(fullstack.source, "builtin");
    assert.equal(lightsOut.source, "builtin");
    assert.deepEqual(fullstack.roles, ["planner", "executor", "reviewer", "observer"]);
    assert.deepEqual(lightsOut.roles, ["planner", "executor", "reviewer", "observer"]);
    assert.equal(lightsOut.steps, 7);

    const validation = parseJson(runCli(memoryDir, ["recipe", "validate", "fullstack-feature"]));
    assert.deepEqual(validation, { valid: true, message: "Recipe is valid" });

    const lightsOutShow = parseJson(runCli(memoryDir, ["recipe", "show", "lights-out-local"]));
    assert.equal(lightsOutShow.steps.at(-1).id, "final-verification-and-closure");
    assert.match(lightsOutShow.description, /Local commits are allowed/);

    const lightsOutValidation = parseJson(runCli(memoryDir, ["recipe", "validate", "lights-out-local"]));
    assert.deepEqual(lightsOutValidation, { valid: true, message: "Recipe is valid" });

    const result = parseJson(runCli(memoryDir, [
      "recipe",
      "create",
      "--recipe",
      "fullstack-feature",
      "--tools",
      "planner:claude,executor:codex,reviewer:gemini,observer:marvis",
      "--project",
      "ai-memory-hub",
      "--var",
      "priority=high"
    ]));

    assert.equal(result.workflow.title, "Fullstack Feature Delivery - ai-memory-hub");
    assert.equal(result.workflow.priority, "high");
    assert.deepEqual(result.workflow.observer, ["marvis"]);
    assert.equal(result.recipe.name, "fullstack-feature");
    assert.equal(result.recipe.steps, 7);
    assert.equal(result.tasks.length, 7);
    assert.deepEqual(result.tasks.map((task) => task.assignee), [
      "claude",
      "claude",
      "claude",
      "marvis",
      "codex",
      "codex",
      "gemini"
    ]);

    const lightsOutResult = parseJson(runCli(memoryDir, [
      "recipe",
      "create",
      "--recipe",
      "lights-out-local",
      "--tools",
      "planner:codex,executor:codex,reviewer:gemini,observer:marvis",
      "--project",
      "lights-out-project",
      "--var",
      "priority=high"
    ]));

    assert.equal(lightsOutResult.workflow.title, "Lights-Out Local Loop Engineering - lights-out-project");
    assert.equal(lightsOutResult.workflow.priority, "high");
    assert.deepEqual(lightsOutResult.workflow.planner, ["codex"]);
    assert.deepEqual(lightsOutResult.workflow.executor, ["codex"]);
    assert.deepEqual(lightsOutResult.workflow.reviewer, ["gemini"]);
    assert.deepEqual(lightsOutResult.workflow.observer, ["marvis"]);
    assert.equal(lightsOutResult.recipe.name, "lights-out-local");
    assert.equal(lightsOutResult.recipe.steps, 7);
    assert.equal(lightsOutResult.recipe.qualityGate.reviewRequired, true);
    assert.deepEqual(lightsOutResult.recipe.qualityGate.verifyCommands, [
      {
        id: "declared-project-verification",
        source: "task-spec",
        required: true,
        description: "Run project-declared verification commands when available."
      },
      {
        id: "focused-regression-checks",
        source: "changed-files",
        required: true,
        description: "Run focused syntax, unit, integration, browser, or API checks for touched files."
      }
    ]);
    assert.equal(lightsOutResult.tasks.length, 7);
    assert.deepEqual(lightsOutResult.tasks.map((task) => task.assignee), [
      "codex",
      "codex",
      "codex",
      "codex",
      "gemini",
      "codex",
      "marvis"
    ]);
    assert.match(lightsOutResult.tasks[6].title, /Confirm final verification/);

    const generatedTasks = parseJson(runCli(memoryDir, [
      "task",
      "list",
      "--project",
      "lights-out-project"
    ]));
    assert.equal(generatedTasks.length, 7);
    assert.ok(generatedTasks.some((task) => /forbiddenActions must include push, deletion, dependency install/.test(task.description)));
    assert.ok(generatedTasks.some((task) => task.handoff === "Depends on: repair-loop"));
    assert.ok(generatedTasks.every((task) => task.recipe?.name === "lights-out-local"));
    assert.ok(generatedTasks.every((task) => task.qualityGate?.reviewRequired === true));
    assert.deepEqual(
      generatedTasks.find((task) => task.recipeStep?.id === "repair-loop").qualityGate.stopWhen,
      [
        "repair attempt limit is reached",
        "blocker requires fresh human approval"
      ]
    );
  });
});

test("task-spec validates, lists, shows, and runs project commands", async () => {
  await withHub(async (memoryDir) => {
    const stdoutLog = path.relative(repoRoot, path.join(memoryDir, "task-spec.stdout.log"));
    const stderrLog = path.relative(repoRoot, path.join(memoryDir, "task-spec.stderr.log"));
    const specFile = await writeTaskSpec(memoryDir, "task-specs.json", {
      version: "1.0",
      tasks: {
        hello: {
          title: "Hello task spec",
          command: process.execPath,
          args: ["-e", "console.log('task spec ok')"],
          cwd: ".",
          timeoutMs: 30000,
          resources: ["src/index.js"],
          logs: {
            stdout: stdoutLog,
            stderr: stderrLog
          },
          verify: [
            {
              command: process.execPath,
              args: ["-e", "process.exit(0)"],
              timeoutMs: 30000
            }
          ]
        }
      }
    });

    const validation = parseJson(runCli(memoryDir, ["task-spec", "validate", "--file", specFile]));
    assert.equal(validation.valid, true);
    assert.equal(validation.tasks, 1);

    const list = parseJson(runCli(memoryDir, ["task-spec", "list", "--file", specFile]));
    assert.equal(list.tasks.length, 1);
    assert.equal(list.tasks[0].id, "hello");
    assert.equal(list.tasks[0].hasVerify, true);
    assert.deepEqual(list.tasks[0].resources, ["src/index.js"]);

    const shown = parseJson(runCli(memoryDir, ["task-spec", "show", "hello", "--file", specFile]));
    assert.equal(shown.id, "hello");
    assert.equal(shown.title, "Hello task spec");
    assert.equal(shown.command, process.execPath);

    const run = parseJson(runCli(memoryDir, ["task-spec", "run", "hello", "--file", specFile]));
    assert.equal(run.taskId, "hello");
    assert.equal(run.status, "passed");
    assert.equal(run.command.status, "passed");
    assert.equal(run.command.exitCode, 0);
    assert.equal(run.verification.status, "passed");
    assert.equal(run.verification.commands.length, 1);
    assert.match(run.command.stdout, /task spec ok/);
    assert.equal(run.command.logs.stdout.replace(/\//g, path.sep), stdoutLog);
    assert.equal(await fs.readFile(path.join(repoRoot, stdoutLog), "utf8"), "task spec ok\n");
    assert.equal(await fs.readFile(path.join(repoRoot, stderrLog), "utf8"), "");
  });
});

test("task-spec validate rejects missing commands", async () => {
  await withHub(async (memoryDir) => {
    const specFile = await writeTaskSpec(memoryDir, "bad-task-specs.json", {
      tasks: [{ id: "broken", args: ["test"] }]
    });

    const validation = runCli(memoryDir, ["task-spec", "validate", "--file", specFile]);
    assert.equal(validation.status, 1);
    const payload = JSON.parse(validation.stdout);
    assert.equal(payload.valid, false);
    assert.match(payload.error, /requires command/);
  });
});

test("memory search filters by thread-aware references", async () => {
  await withHub(async (memoryDir) => {
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-threaded-memory",
      ts: "2026-06-09T10:00:00.000Z",
      source: "codex",
      text: "Relay lifecycle workflow status is reviewed and ready.",
      metadata: {
        kind: "workflow",
        project: "ai-memory-hub",
        tags: ["relay", "review"],
        refs: {
          thread: "relay-lifecycle-2026-06-09",
          taskId: "task-relay",
          workflowId: "workflow-relay",
          radioId: "radio-relay"
        }
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-unrelated-memory",
      ts: "2026-06-09T10:01:00.000Z",
      source: "gemini",
      text: "Dashboard telemetry has a separate review thread.",
      metadata: {
        kind: "reference",
        project: "ai-memory-hub",
        refs: {
          thread: "dashboard-ui-2026-06-09",
          taskId: "task-dashboard"
        }
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-other-project-memory",
      ts: "2026-06-09T10:02:00.000Z",
      source: "claude",
      text: "Relay lifecycle belongs to another project.",
      metadata: {
        kind: "reference",
        project: "other-project",
        tags: ["relay", "review"]
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const index = JSON.parse(await fs.readFile(path.join(memoryDir, "memories", "index.json"), "utf8"));
    const threaded = index.records.find((record) => record.localEventId === "event-threaded-memory");
    assert.equal(threaded.refs.thread, "relay-lifecycle-2026-06-09");
    assert.equal(threaded.refs.taskId, "task-relay");
    assert.equal(index.threads.find((item) => item.key === "relay-lifecycle-2026-06-09")?.count, 1);

    const ordinary = runCli(memoryDir, ["search", "relay lifecycle"]);
    assert.equal(ordinary.status, 0, ordinary.stderr || ordinary.stdout);
    assert.match(ordinary.stdout, /Relay lifecycle workflow status/);

    const byProject = runCli(memoryDir, ["search", "relay", "--project", "ai-memory-hub"]);
    assert.equal(byProject.status, 0, byProject.stderr || byProject.stdout);
    assert.match(byProject.stdout, /project=ai-memory-hub/);
    assert.doesNotMatch(byProject.stdout, /another project/);

    const byTag = runCli(memoryDir, ["search", "--tag", "relay"]);
    assert.equal(byTag.status, 0, byTag.stderr || byTag.stdout);
    assert.match(byTag.stdout, /tags=relay,review/);

    const byTagsAndProject = runCli(memoryDir, ["memory", "search", "--tags", "relay,review", "--project", "ai-memory-hub"]);
    assert.equal(byTagsAndProject.status, 0, byTagsAndProject.stderr || byTagsAndProject.stdout);
    assert.match(byTagsAndProject.stdout, /Relay lifecycle workflow status/);
    assert.doesNotMatch(byTagsAndProject.stdout, /another project/);

    const snapshot = runCli(memoryDir, ["memory", "snapshot", "--project", "ai-memory-hub", "--tag", "relay", "--limit", "1"]);
    assert.equal(snapshot.status, 0, snapshot.stderr || snapshot.stdout);
    assert.match(snapshot.stdout, /Filtered view: project=ai-memory-hub tags=relay/);
    assert.match(snapshot.stdout, /Relay lifecycle workflow status/);
    assert.doesNotMatch(snapshot.stdout, /Dashboard telemetry/);
    assert.doesNotMatch(snapshot.stdout, /another project/);

    const byThread = runCli(memoryDir, ["search", "workflow", "--thread", "relay-lifecycle-2026-06-09"]);
    assert.equal(byThread.status, 0, byThread.stderr || byThread.stdout);
    assert.match(byThread.stdout, /thread=relay-lifecycle-2026-06-09/);
    assert.doesNotMatch(byThread.stdout, /Dashboard telemetry/);

    const byThreadOnly = runCli(memoryDir, ["search", "--thread", "relay-lifecycle-2026-06-09"]);
    assert.equal(byThreadOnly.status, 0, byThreadOnly.stderr || byThreadOnly.stdout);
    assert.match(byThreadOnly.stdout, /Relay lifecycle workflow status/);

    const byTask = runCli(memoryDir, ["search", "workflow", "--task", "task-relay"]);
    assert.equal(byTask.status, 0, byTask.stderr || byTask.stdout);
    assert.match(byTask.stdout, /taskId=task-relay/);

    const byWorkflow = runCli(memoryDir, ["search", "workflow", "--workflow", "workflow-relay"]);
    assert.equal(byWorkflow.status, 0, byWorkflow.stderr || byWorkflow.stdout);
    assert.match(byWorkflow.stdout, /workflowId=workflow-relay/);

    const byRadio = runCli(memoryDir, ["search", "workflow", "--radio", "radio-relay"]);
    assert.equal(byRadio.status, 0, byRadio.stderr || byRadio.stdout);
    assert.match(byRadio.stdout, /radioId=radio-relay/);

    const wrongThread = runCli(memoryDir, ["search", "workflow", "--thread", "missing-thread"]);
    assert.equal(wrongThread.status, 0, wrongThread.stderr || wrongThread.stdout);
    assert.equal(wrongThread.stdout.trim(), "");
  });
});

test("memory search tracks access heat in ledger and index ranking", async () => {
  await withHub(async (memoryDir) => {
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-hot-access-memory",
      ts: "2026-06-08T10:00:00.000Z",
      source: "codex",
      text: "Memory hub ranking note with rare-hot-access-term must stay easy to find.",
      metadata: {
        kind: "note",
        project: "ai-memory-hub"
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-cold-access-memory",
      ts: "2026-06-09T10:00:00.000Z",
      source: "codex",
      text: "Memory hub ranking note with rare-cold-access-term must stay easy to find.",
      metadata: {
        kind: "note",
        project: "ai-memory-hub"
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    for (let index = 0; index < 5; index += 1) {
      const search = runCli(memoryDir, ["search", "rare-hot-access-term", "--limit", "1"]);
      assert.equal(search.status, 0, search.stderr || search.stdout);
      assert.match(search.stdout, /rare-hot-access-term/);
      assert.doesNotMatch(search.stdout, /rare-cold-access-term/);
    }

    const ledger = (await fs.readFile(path.join(memoryDir, "memories", "ledger.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const hotLedger = ledger.find((record) => record.localEventId === "event-hot-access-memory");
    const coldLedger = ledger.find((record) => record.localEventId === "event-cold-access-memory");
    assert.equal(hotLedger.accessCount, 5);
    assert.match(hotLedger.lastAccessedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(hotLedger.metadata.lifecycle.access.accessCount, 5);
    assert.equal(coldLedger.accessCount, undefined);

    const memoryIndex = JSON.parse(await fs.readFile(path.join(memoryDir, "memories", "index.json"), "utf8"));
    const hotRecord = memoryIndex.records.find((record) => record.localEventId === "event-hot-access-memory");
    const coldRecord = memoryIndex.records.find((record) => record.localEventId === "event-cold-access-memory");
    assert.equal(hotRecord.accessCount, 5);
    assert.ok(hotRecord.accessHeat > 0);
    assert.ok(hotRecord.importance > coldRecord.importance);
  });
});

test("long-unaccessed memory search telemetry downgrades snapshot layer", async () => {
  await withHub(async (memoryDir) => {
    const oldAccess = new Date(Date.now() - 120 * 86400000).toISOString();
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-stale-access-memory",
      ts: "2026-06-10T10:00:00.000Z",
      source: "codex",
      text: "Memory ranking signal must remain useful for stale access cooling.",
      metadata: {
        kind: "note",
        project: "ai-memory-hub",
        lifecycle: {
          access: {
            accessCount: 1,
            lastAccessedAt: oldAccess
          }
        }
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-recent-access-memory",
      ts: "2026-06-10T10:01:00.000Z",
      source: "codex",
      text: "Memory ranking signal must remain useful for recent access cooling.",
      metadata: {
        kind: "note",
        project: "ai-memory-hub"
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const memoryIndex = JSON.parse(await fs.readFile(path.join(memoryDir, "memories", "index.json"), "utf8"));
    const staleRecord = memoryIndex.records.find((record) => record.localEventId === "event-stale-access-memory");
    const recentRecord = memoryIndex.records.find((record) => record.localEventId === "event-recent-access-memory");
    assert.equal(staleRecord.accessCount, 1);
    assert.ok(staleRecord.staleAccessPenalty > 0);
    assert.equal(staleRecord.layer, "archive");
    assert.equal(recentRecord.layer, "working");
    assert.ok(staleRecord.importance < 45);
    assert.ok(recentRecord.importance >= 45);
  });
});

test("memory supersedes downranks replaced records and hides them from snapshot", async () => {
  await withHub(async (memoryDir) => {
    const oldText = "Old workflow rule must not remain in the shared AI memory snapshot.";
    const newText = "Current workflow rule replaces the old shared AI memory snapshot guidance.";
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-old-rule",
      ts: "2026-06-08T10:00:00.000Z",
      source: "codex",
      text: oldText,
      metadata: {
        kind: "workflow",
        project: "ai-memory-hub"
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-new-rule",
      ts: "2026-06-09T10:00:00.000Z",
      source: "codex",
      text: newText,
      metadata: {
        kind: "workflow",
        project: "ai-memory-hub",
        supersedes: ["event-old-rule"]
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const index = JSON.parse(await fs.readFile(path.join(memoryDir, "memories", "index.json"), "utf8"));
    const oldRecord = index.records.find((record) => record.localEventId === "event-old-rule");
    const newRecord = index.records.find((record) => record.localEventId === "event-new-rule");
    assert.equal(oldRecord.superseded, true);
    assert.deepEqual(oldRecord.supersededBy, ["event-new-rule"]);
    assert.equal(oldRecord.metadata.lifecycle.superseded, true);
    assert.equal(oldRecord.layer, "archive");
    assert.ok(oldRecord.importance < newRecord.importance);
    assert.equal(newRecord.superseded, undefined);

    const snapshot = await fs.readFile(path.join(memoryDir, "MEMORY.md"), "utf8");
    assert.doesNotMatch(snapshot, new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(snapshot, new RegExp(newText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("resolve finds include paths from startup memory and pins them in bootstrap snapshots", async () => {
  await withHub(async (memoryDir) => {
    const knownDir = path.join(memoryDir, "known");
    await fs.mkdir(knownDir, { recursive: true });
    const knownPath = path.join(knownDir, "RTK.md");
    await fs.writeFile(knownPath, "# RTK\n", "utf8");
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-rtk-path",
      ts: "2026-06-11T10:00:00.000Z",
      source: "codex",
      text: `RTK.md actual path is ${knownPath}`,
      metadata: {
        kind: "correction",
        tags: ["startup"]
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const resolved = parseJson(runCli(memoryDir, ["resolve", "@RTK.md"]));
    assert.equal(resolved.ok, true);
    assert.equal(path.normalize(resolved.best.path), path.normalize(knownPath));
    assert.equal(resolved.best.exists, true);

    const snapshot = await fs.readFile(path.join(memoryDir, "MEMORY.md"), "utf8");
    assert.match(snapshot, /## Startup Essentials/);
    assert.match(snapshot, /RTK\.md actual path/);

    const bootstrap = await fs.readFile(path.join(memoryDir, "BOOTSTRAP.md"), "utf8");
    assert.match(bootstrap, /# AI Memory Hub Bootstrap/);
    assert.match(bootstrap, /RTK\.md actual path/);

    await fs.writeFile(path.join(memoryDir, "BOOTSTRAP.md"), "stale bootstrap\n", "utf8");
    const secondSync = runCli(memoryDir, ["sync"]);
    assert.equal(secondSync.status, 0, secondSync.stderr || secondSync.stdout);
    const refreshedBootstrap = await fs.readFile(path.join(memoryDir, "BOOTSTRAP.md"), "utf8");
    assert.match(refreshedBootstrap, /RTK\.md actual path/);
  });
});

test("install renders one shared skill layer contract for native adapters", async () => {
  await withHub(async (memoryDir) => {
    const qclaw = runCli(memoryDir, ["install", "--tool", "qclaw"]);
    const opencode = runCli(memoryDir, ["install", "--tool", "opencode"]);
    assert.equal(qclaw.status, 0, qclaw.stderr || qclaw.stdout);
    assert.equal(opencode.status, 0, opencode.stderr || opencode.stdout);

    for (const output of [qclaw.stdout, opencode.stdout]) {
      assert.match(output, /AI_MEMORY_HUB_SHARED_SKILL_LAYER v1/);
      assert.match(output, /## Shared Skill Layer/);
      assert.match(output, /ai-memory-hub resolve "@RTK\.md"/);
      assert.match(output, /ai-memory-hub task list --status active/);
      assert.match(output, /workflow create/);
      assert.match(output, /Broadcast risks, blockers, and handoffs through Agent Radio/);
      assert.match(output, /Project Skill Overlay/);
    }

    assert.match(qclaw.stdout, /"source":"qclaw"/);
    assert.match(opencode.stdout, /"source":"opencode"/);
  });
});

test("install upgrades legacy adapter files and doctor reports skill layer status", async () => {
  await withHub(async (memoryDir) => {
    const toolsDir = path.join(memoryDir, "tools");
    const adapterFile = path.join(toolsDir, "antigravity-shared-memory.md");
    await fs.mkdir(toolsDir, { recursive: true });
    await fs.writeFile(adapterFile, [
      "# Shared AI Memory",
      "",
      "Legacy adapter content.",
      "",
      "## Shared Task List",
      "",
      "## Shared Workflows",
      "",
      "## Shared Agent Radio",
      "",
      "## Contact Other AI Tools",
      ""
    ].join("\n"), "utf8");

    const apply = runCli(memoryDir, ["install", "--tool", "antigravity", "--apply"]);
    assert.equal(apply.status, 0, apply.stderr || apply.stdout);

    const upgraded = await fs.readFile(adapterFile, "utf8");
    assert.match(upgraded, /AI_MEMORY_HUB_SHARED_SKILL_LAYER v1/);
    assert.match(upgraded, /ai-memory-hub resolve "@RTK\.md"/);
    assert.match(upgraded, /# Shared AI Memory/);

    const detect = parseJson(runCli(memoryDir, ["detect"]));
    const antigravity = detect.find((tool) => tool.name === "antigravity");
    assert.equal(antigravity.configured, true);
    assert.equal(antigravity.skillLayer, true);
    assert.equal(antigravity.skillLayerVersion, "1");

    const doctor = parseJson(runCli(memoryDir, ["doctor", "--tool", "antigravity", "--skip-version"]));
    assert.equal(doctor.summary.skillLayer, 1);
    assert.equal(doctor.tools[0].install.configured, true);
    assert.equal(doctor.tools[0].install.skillLayer, true);
    assert.equal(doctor.tools[0].install.skillLayerVersion, "1");
  });
});

test("health reports missing instruction includes with resolved suggestions", async () => {
  await withHub(async (memoryDir) => {
    const knownDir = path.join(memoryDir, "known");
    await fs.mkdir(knownDir, { recursive: true });
    const knownPath = path.join(knownDir, "RTK.md");
    await fs.writeFile(knownPath, "# RTK\n", "utf8");
    await fs.mkdir(path.join(memoryDir, "tools"), { recursive: true });
    await fs.writeFile(
      path.join(memoryDir, "tools", "codex-app-shared-memory.md"),
      "# Shared AI Memory\n\n@RTK.md\n",
      "utf8"
    );
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-rtk-known-path",
      ts: "2026-06-11T10:00:00.000Z",
      source: "codex",
      text: `RTK.md actual path is ${knownPath}`,
      metadata: {
        kind: "correction",
        tags: ["startup"]
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const health = runCli(memoryDir, ["health", "--limit", "3"]);
    assert.equal(health.status, 0, health.stderr || health.stdout);
    assert.match(health.stdout, /Missing instruction includes/);
    assert.match(health.stdout, /## Instruction Include Diagnostics/);
    assert.match(health.stdout, /@RTK\.md/);
    assert.ok(health.stdout.includes(knownPath));
  });
});

test("sync skipped event logs include source file line and reason", async () => {
  await withHub(async (memoryDir) => {
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      source: "codex",
      metadata: {
        kind: "workflow"
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);
    assert.match(sync.stdout, /Skipped event \(no id\) at .*inbox[\\/]events\.jsonl:1: missing text\./);
  });
});

test("snapshotLimit derives compact snapshot section limits for legacy config", async () => {
  await withHub(async (memoryDir) => {
    await fs.writeFile(path.join(memoryDir, "config.json"), JSON.stringify({
      memoryDir,
      sync: {
        archiveIndexedInboxItems: true,
        snapshotLimit: 20,
        lockStaleMs: 120000
      },
      tools: {}
    }, null, 2), "utf8");

    for (let index = 0; index < 30; index += 1) {
      await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
        id: `event-core-${index}`,
        ts: `2026-06-${String(1 + (index % 9)).padStart(2, "0")}T10:00:00.000Z`,
        source: "codex",
        text: `Core workflow rule ${index} must stay concise for startup snapshots.`,
        metadata: {
          kind: "workflow",
          project: "ai-memory-hub"
        }
      });
      await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
        id: `event-recent-${index}`,
        ts: `2026-06-${String(1 + (index % 9)).padStart(2, "0")}T11:00:00.000Z`,
        source: "codex",
        text: `Recent context note ${index} for snapshot budget testing.`,
        metadata: {
          kind: "note",
          project: "ai-memory-hub"
        }
      });
    }

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const index = JSON.parse(await fs.readFile(path.join(memoryDir, "memories", "index.json"), "utf8"));
    assert.equal(index.stats.snapshotLimit, 20);
    assert.equal(index.stats.snapshotCoreLimit, 10);
    assert.equal(index.stats.snapshotRecentLimit, 5);

    const snapshot = await fs.readFile(path.join(memoryDir, "MEMORY.md"), "utf8");
    const memoryLines = snapshot.split(/\r?\n/).filter((line) => line.startsWith("- ["));
    assert.ok(memoryLines.length <= 15);
  });
});

test("stale operational radio memories age out of working snapshot", async () => {
  await withHub(async (memoryDir) => {
    const staleTs = new Date(Date.now() - 8 * 86400000).toISOString();
    const oldText = "Dispatch completed status update for ai-memory-hub review must age out after eight days.";
    const recentText = "Dispatch completed status update for ai-memory-hub review must remain current.";
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-old-radio-status",
      ts: staleTs,
      source: "radio:codex",
      text: oldText,
      metadata: {
        kind: "reference",
        project: "ai-memory-hub",
        refs: {
          radioId: "old-radio-status"
        }
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-recent-radio-status",
      ts: new Date().toISOString(),
      source: "radio:codex",
      text: recentText,
      metadata: {
        kind: "reference",
        project: "ai-memory-hub",
        refs: {
          radioId: "recent-radio-status"
        }
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const index = JSON.parse(await fs.readFile(path.join(memoryDir, "memories", "index.json"), "utf8"));
    const oldRecord = index.records.find((record) => record.localEventId === "event-old-radio-status");
    const recentRecord = index.records.find((record) => record.localEventId === "event-recent-radio-status");
    assert.equal(oldRecord.layer, "archive");
    assert.equal(recentRecord.layer, "working");
    assert.ok(oldRecord.importance < 45);
    assert.ok(recentRecord.importance >= 45);
    assert.ok(oldRecord.importance < recentRecord.importance);

    const snapshot = await fs.readFile(path.join(memoryDir, "MEMORY.md"), "utf8");
    assert.doesNotMatch(snapshot, new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(snapshot, new RegExp(recentText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("health command reports memory quality and storage diagnostics", async () => {
  await withHub(async (memoryDir) => {
    const repeatedText = "Repeated workflow rule: run tests before marking ai-memory-hub tasks done.";
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-duplicate-a",
      ts: "2026-06-08T10:00:00.000Z",
      source: "codex",
      text: repeatedText,
      metadata: {
        kind: "workflow",
        project: "ai-memory-hub",
        tags: ["health", "quality"]
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-duplicate-b",
      ts: "2026-06-09T10:00:00.000Z",
      source: "gemini",
      text: repeatedText,
      metadata: {
        kind: "workflow",
        project: "ai-memory-hub",
        tags: ["health", "quality"]
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-corrupted",
      ts: "2026-06-10T10:00:00.000Z",
      source: "raw",
      text: "Broken radio record \u0000 \ufffd",
      metadata: {
        kind: "raw",
        project: "ai-memory-hub",
        tags: ["radio"]
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const health = runCli(memoryDir, ["health", "--limit", "2"]);
    assert.equal(health.status, 0, health.stderr || health.stdout);
    assert.match(health.stdout, /# AI Memory Hub Health Report/);
    assert.match(health.stdout, /## Summary/);
    assert.match(health.stdout, /Duplicate records: 1 \(33\.3%\)/);
    assert.match(health.stdout, /Corrupted records: 1/);
    assert.match(health.stdout, /## Distribution/);
    assert.match(health.stdout, /Kinds: workflow\(2\), raw\(1\)/);
    assert.match(health.stdout, /Projects: ai-memory-hub\(3\)/);
    assert.match(health.stdout, /## Growth Trend/);
    assert.match(health.stdout, /2026-06-08: 1/);
    assert.match(health.stdout, /2026-06-09: 1/);
    assert.match(health.stdout, /2026-06-10: 1/);
    assert.match(health.stdout, /## Storage/);
    assert.match(health.stdout, /memories\/ledger\.jsonl:/);
    assert.match(health.stdout, /## Issues/);
    assert.match(health.stdout, /Corrupted records detected/);
    assert.match(health.stdout, /Duplicate memory content/);
    assert.match(health.stdout, /## Recommended Actions/);
    assert.match(health.stdout, /Repair corrupted records/);
    assert.match(health.stdout, /Supersede duplicate records/);
    assert.match(health.stdout, /## Duplicate Examples/);
    assert.match(health.stdout, /Repeated workflow rule/);
    assert.match(health.stdout, /## Corrupted Record Examples/);
    assert.match(health.stdout, /event-corrupted/);
  });
});

test("health repair archives corrupted records and supersedes duplicate records", async () => {
  await withHub(async (memoryDir) => {
    const repeatedText = "Repeated health repair workflow rule must keep only one active copy.";
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "repair-duplicate-old",
      ts: "2026-06-08T10:00:00.000Z",
      source: "codex",
      text: repeatedText,
      metadata: {
        kind: "workflow",
        project: "ai-memory-hub"
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "repair-duplicate-new",
      ts: "2026-06-09T10:00:00.000Z",
      source: "gemini",
      text: repeatedText,
      metadata: {
        kind: "workflow",
        project: "ai-memory-hub"
      }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "repair-corrupted",
      ts: "2026-06-10T10:00:00.000Z",
      source: "raw",
      text: "Broken health repair record \u0000 \ufffd",
      metadata: {
        kind: "raw",
        project: "ai-memory-hub"
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const dryRun = parseJson(runCli(memoryDir, ["health", "repair", "--limit", "5"]));
    assert.equal(dryRun.apply, false);
    assert.equal(dryRun.plan.corruptedRecords, 1);
    assert.equal(dryRun.plan.duplicateRecordsToSupersede, 1);

    const repair = parseJson(runCli(memoryDir, ["health", "repair", "--apply", "--limit", "5"]));
    assert.equal(repair.apply, true);
    assert.equal(repair.applied.corruptedArchived, 1);
    assert.equal(repair.applied.duplicateSuperseded, 1);
    assert.match(repair.backup.dir, /pre-health-repair/);
    assert.equal(repair.after.corruptedRecords, 0);
    assert.equal(repair.after.duplicateRecords, 0);

    const index = JSON.parse(await fs.readFile(path.join(memoryDir, "memories", "index.json"), "utf8"));
    const oldDuplicate = index.records.find((record) => record.localEventId === "repair-duplicate-old");
    const corrupted = index.records.find((record) => record.localEventId === "repair-corrupted");
    assert.equal(oldDuplicate.superseded, true);
    assert.equal(corrupted.healthExcluded, true);
    assert.equal(corrupted.metadata.lifecycle.healthRepair.status, "archived-corrupted");

    const health = runCli(memoryDir, ["health", "--limit", "5"]);
    assert.equal(health.status, 0, health.stderr || health.stdout);
    assert.match(health.stdout, /Duplicate records: 0 \(0\.0%\)/);
    assert.match(health.stdout, /Corrupted records: 0/);
  });
});

test("backup list and prune expose retention candidates without applying by default", async () => {
  await withHub(async (memoryDir) => {
    const backupsDir = path.join(memoryDir, "backups");
    const fixtures = [
      ["2026-06-10T10-00-00-000Z-pre-sync", "2026-06-10T10:00:00.000Z"],
      ["2026-06-09T10-00-00-000Z-pre-sync", "2026-06-09T10:00:00.000Z"],
      ["2026-06-08T10-00-00-000Z-pre-sync", "2026-06-08T10:00:00.000Z"]
    ];
    for (const [name, createdAt] of fixtures) {
      const dir = path.join(backupsDir, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({
        createdAt,
        reason: "pre-sync",
        dir,
        retention: {
          tier: "pre-sync",
          key: createdAt
        },
        files: ["memory-ledger.jsonl"]
      }, null, 2), "utf8");
      await fs.writeFile(path.join(dir, "memory-ledger.jsonl"), `${createdAt}\n`, "utf8");
    }

    const listed = parseJson(runCli(memoryDir, ["backup", "list", "--limit", "10"]));
    assert.equal(listed.count, 3);
    assert.equal(listed.policy.daily, 7);
    assert.equal(listed.backups[0].retention, "keep");

    const prune = parseJson(runCli(memoryDir, ["backup", "prune", "--daily", "1", "--weekly", "1", "--pre-sync", "1"]));
    assert.equal(prune.apply, false);
    assert.equal(prune.prune, 2);
    assert.equal((await fs.readdir(backupsDir)).length, 3);
  });
});

test("memory outputs sanitize corrupted control characters", async () => {
  await withHub(async (memoryDir) => {
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "event-corrupted-radio",
      ts: "2026-06-10T10:00:00.000Z",
      source: "raw",
      text: "Broken radio record \u0000 \ufffd",
      metadata: {
        kind: "raw",
        project: "ai-memory-hub",
        tags: ["radio"]
      }
    });

    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const memoryMd = await fs.readFile(path.join(memoryDir, "MEMORY.md"), "utf8");
    const indexMd = await fs.readFile(path.join(memoryDir, "INDEX.md"), "utf8");
    assert.doesNotMatch(memoryMd, /\u0000/);
    assert.doesNotMatch(indexMd, /\u0000/);
    assert.match(indexMd, /Broken radio record \\0 \?/);

    const health = runCli(memoryDir, ["health", "--limit", "1"]);
    assert.equal(health.status, 0, health.stderr || health.stdout);
    assert.doesNotMatch(health.stdout, /\u0000/);
    assert.match(health.stdout, /Broken radio record \\0 \?/);
  });
});

test("radio promote rejects corrupted messages", async () => {
  await withHub(async (memoryDir) => {
    await appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), {
      id: "radio-corrupted",
      ts: "2026-06-10T10:00:00.000Z",
      from: "codex",
      to: "all",
      type: "note",
      text: "Broken radio message \u0000"
    });

    const promote = runCli(memoryDir, ["radio", "promote", "--id", "radio-corrupted"]);
    assert.equal(promote.status, 1);
    assert.match(promote.stderr, /Refusing to promote corrupted radio message: radio-corrupted/);

    let inbox = "";
    try {
      inbox = await fs.readFile(path.join(memoryDir, "inbox", "events.jsonl"), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    assert.equal(inbox.trim(), "");
  });
});

test("radio list recovers nul-interleaved raw JSON messages", async () => {
  await withHub(async (memoryDir) => {
    const rawMessage = JSON.stringify({
      source: "marvis",
      from: "marvis",
      to: "codex",
      type: "status",
      text: "Recovered status for ai-memory-hub review.",
      thread: "review-thread",
      project: "ai-memory-hub"
    });
    await appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), {
      id: "radio-raw-nul",
      ts: "2026-06-10T10:00:00.000Z",
      from: "raw",
      to: "all",
      type: "raw",
      text: rawMessage.split("").join("\u0000"),
      deliveryState: "delivered",
      promoted: true
    });

    const messages = parseJson(runCli(memoryDir, ["radio", "list", "--limit", "1"]));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, "radio-raw-nul");
    assert.equal(messages[0].from, "marvis");
    assert.equal(messages[0].to, "codex");
    assert.equal(messages[0].type, "status");
    assert.equal(messages[0].text, "Recovered status for ai-memory-hub review.");
    assert.equal(messages[0].thread, "review-thread");
    assert.equal(messages[0].project, "ai-memory-hub");
    assert.equal(messages[0].deliveryState, "delivered");
    assert.equal(messages[0].promoted, true);
  });
});
