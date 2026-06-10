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
        tags: ["relay"],
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
