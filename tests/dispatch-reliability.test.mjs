import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");

async function withHub(fn) {
  const memoryDir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-test-"));
  try {
    const init = runCli(memoryDir, ["init"]);
    assert.equal(init.status, 0, init.stderr || init.stdout);
    await fn(memoryDir);
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
}

function runCli(memoryDir, args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
      AI_MEMORY_DIR: memoryDir
    },
    encoding: "utf8",
    windowsHide: true
  });
}

async function createFakeCodexRunner(memoryDir) {
  const binDir = path.join(memoryDir, "fake-bin");
  await fs.mkdir(binDir, { recursive: true });
  const runnerScript = path.join(binDir, "fake-codex.mjs");
  await fs.writeFile(runnerScript, [
    'import fs from "node:fs";',
    'const input = fs.readFileSync(0, "utf8");',
    "const args = process.argv.slice(2);",
    'if (args.includes("--version")) { console.log("fake-codex 1.0.0"); process.exit(0); }',
    'if (args.includes("--help")) { console.log("fake codex help"); process.exit(0); }',
    "console.log(JSON.stringify({ args, stdin: input }));"
  ].join("\n"), "utf8");

  if (process.platform === "win32") {
    await fs.writeFile(
      path.join(binDir, "codex.cmd"),
      `@echo off\r\n"${process.execPath}" "${runnerScript}" %*\r\n`,
      "utf8"
    );
  } else {
    const runnerPath = path.join(binDir, "codex");
    await fs.writeFile(
      runnerPath,
      `#!/bin/sh\nexec "${process.execPath}" "${runnerScript}" "$@"\n`,
      "utf8"
    );
    await fs.chmod(runnerPath, 0o755);
  }

  return binDir;
}

function prependPathEnv(dir) {
  const current = process.env.Path || process.env.PATH || "";
  const value = `${dir}${path.delimiter}${current}`;
  return {
    PATH: value,
    Path: value
  };
}

async function appendJsonl(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("dispatch preview ignores broadcast radio messages for direct runners", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), {
      id: "broadcast-radio",
      ts: now,
      from: "claude",
      to: "all",
      type: "request",
      text: "Broadcast coordination only",
      project: "test-project"
    });
    await appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), {
      id: "direct-radio",
      ts: now,
      from: "claude",
      to: "codex",
      type: "request",
      text: "Direct Codex work",
      project: "test-project"
    });

    const result = runCli(memoryDir, ["dispatch", "--to", "codex", "--project", "test-project", "--limit", "5"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].refId, "direct-radio");
    assert.equal(payload.results[0].tool, "codex");
  });
});

test("dispatch retry ignores failed broadcast radio messages", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    const dueTs = new Date(Date.now() - 1000).toISOString();
    await appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), {
      id: "broadcast-retry",
      ts: now,
      from: "claude",
      to: "all",
      type: "request",
      text: "Old broadcast coordination",
      project: "test-project"
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-broadcast-failed",
      ts: dueTs,
      threadKey: "codex:test-project:broadcast-retry",
      sourceKind: "radio",
      sourceId: "broadcast-retry",
      dispatchId: "radio:broadcast-retry",
      state: "failed",
      attempt: 1,
      maxRetries: 3,
      dispatchedAt: "",
      ackTimeout: 100,
      sessionId: "",
      exitCode: 1,
      lastError: "previous failure",
      nextRetryAt: dueTs,
      project: "test-project",
      tool: "codex",
      thread: "broadcast-retry"
    });

    const result = runCli(memoryDir, ["dispatch", "retry", "--to", "codex", "--project", "test-project"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.jobs.length, 0);
    assert.match(payload.message, /No failed relay jobs/);
  });
});

test("dispatch retry ignores failed relays whose sources are already closed", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    const dueTs = new Date(Date.now() - 1000).toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "closed-task",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      createdBy: "test",
      assignee: "codex",
      status: "done",
      priority: "normal",
      project: "test-project",
      title: "Already closed task",
      description: "",
      handoff: "",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), {
      id: "closed-radio",
      ts: now,
      from: "claude",
      to: "codex",
      type: "request",
      text: "Already completed radio",
      project: "test-project",
      deliveryState: "completed"
    });
    await appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), {
      id: "linked-closed-radio",
      ts: now,
      from: "claude",
      to: "codex",
      type: "request",
      text: "Radio linked to a closed task thread",
      thread: "closed-task",
      project: "test-project"
    });
    for (const source of [
      { kind: "task", id: "closed-task" },
      { kind: "radio", id: "closed-radio" },
      { kind: "radio", id: "linked-closed-radio" }
    ]) {
      await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
        id: `relay-${source.id}-failed`,
        ts: dueTs,
        threadKey: `codex:test-project:${source.id}`,
        sourceKind: source.kind,
        sourceId: source.id,
        dispatchId: `${source.kind}:${source.id}`,
        state: "failed",
        attempt: 1,
        maxRetries: 3,
        dispatchedAt: "",
        ackTimeout: 100,
        sessionId: "",
        exitCode: 1,
        lastError: "previous failure",
        nextRetryAt: dueTs,
        project: "test-project",
        tool: "codex",
        thread: source.id
      });
    }

    const result = runCli(memoryDir, ["dispatch", "retry", "--to", "codex", "--project", "test-project"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.jobs.length, 0);
    assert.match(payload.message, /No failed relay jobs/);
  });
});

test("dispatch retry --run marks stale dispatched relay as failed", async () => {
  await withHub(async (memoryDir) => {
    const staleTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-timeout",
      createdAt: staleTs,
      updatedAt: staleTs,
      completedAt: "",
      createdBy: "test",
      assignee: "marvis",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Stale dispatch task",
      description: "",
      handoff: "",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-stale",
      ts: staleTs,
      threadKey: "marvis:test-project:task-timeout",
      sourceKind: "task",
      sourceId: "task-timeout",
      dispatchId: "task:task-timeout",
      state: "dispatched",
      attempt: 1,
      maxRetries: 3,
      dispatchedAt: staleTs,
      ackTimeout: 100,
      sessionId: "",
      exitCode: null,
      lastError: "",
      nextRetryAt: "",
      project: "test-project",
      tool: "marvis",
      thread: "task-timeout"
    });

    const result = runCli(memoryDir, ["dispatch", "retry", "--run", "--to", "marvis", "--project", "test-project"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].timeout, true);
    assert.equal(payload.results[0].relayState, "failed");

    const statuses = await readJsonl(path.join(memoryDir, "state", "relay-status.jsonl"));
    assert.equal(statuses.at(-1).state, "failed");
    assert.match(statuses.at(-1).lastError, /Timeout: no response within ackTimeout/);

    const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.equal(tasks[0].status, "claimed");
    assert.equal(tasks[0].deliveryState, "failed");
    assert.match(tasks[0].notes.at(-1).text, /Dispatch failed/);
  });
});

test("dispatch retry --run advances due failed relay attempts", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    const dueTs = new Date(Date.now() - 1000).toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-retry",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "missing-runner",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Retry failed dispatch",
      description: "",
      handoff: "",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-failed-due",
      ts: dueTs,
      threadKey: "missing-runner:test-project:task-retry",
      sourceKind: "task",
      sourceId: "task-retry",
      dispatchId: "task:task-retry",
      state: "failed",
      attempt: 1,
      maxRetries: 3,
      dispatchedAt: "",
      ackTimeout: 100,
      sessionId: "",
      exitCode: 1,
      lastError: "previous failure",
      nextRetryAt: dueTs,
      project: "test-project",
      tool: "missing-runner",
      thread: "task-retry"
    });

    const result = runCli(memoryDir, ["dispatch", "retry", "--run", "--to", "missing-runner", "--project", "test-project"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].refId, "task-retry");
    assert.equal(payload.results[0].attempt, 2);
    assert.equal(payload.results[0].runnable, false);
    assert.match(payload.results[0].reason, /no verified CLI runner/);

    const statuses = await readJsonl(path.join(memoryDir, "state", "relay-status.jsonl"));
    assert.equal(statuses.at(-1).state, "failed");
    assert.equal(statuses.at(-1).attempt, 2);
    assert.match(statuses.at(-1).lastError, /no verified CLI runner/);

    const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.equal(tasks[0].status, "claimed");
    assert.equal(tasks[0].deliveryState, "failed");
    assert.equal(tasks[0].attempt, 2);
    assert.match(tasks[0].notes.at(-1).text, /Dispatch failed/);
  });
});

test("dispatch progress records heartbeat without completing the task", async () => {
  await withHub(async (memoryDir) => {
    const staleTs = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-progress",
      createdAt: staleTs,
      updatedAt: staleTs,
      completedAt: "",
      createdBy: "test",
      assignee: "marvis",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Long running task",
      description: "",
      handoff: "",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-progress-start",
      ts: staleTs,
      threadKey: "marvis:test-project:task-progress",
      sourceKind: "task",
      sourceId: "task-progress",
      dispatchId: "task:task-progress",
      state: "dispatched",
      attempt: 1,
      maxRetries: 3,
      dispatchedAt: staleTs,
      ackTimeout: 10 * 60 * 1000,
      sessionId: "",
      exitCode: null,
      lastError: "",
      nextRetryAt: "",
      project: "test-project",
      tool: "marvis",
      thread: "task-progress"
    });

    const progress = runCli(memoryDir, [
      "dispatch",
      "progress",
      "--ref-id",
      "task-progress",
      "--to",
      "marvis",
      "--project",
      "test-project",
      "--percent",
      "40",
      "--status",
      "Half done",
      "--by",
      "codex"
    ]);
    assert.equal(progress.status, 0, progress.stderr || progress.stdout);
    const progressPayload = JSON.parse(progress.stdout);
    assert.equal(progressPayload.ok, true);
    assert.equal(progressPayload.state, "progress");
    assert.equal(progressPayload.progressPercent, 40);
    assert.equal(progressPayload.progressStatus, "Half done");

    const status = runCli(memoryDir, ["dispatch", "status", "--ref-id", "task-progress"]);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    const statusPayload = JSON.parse(status.stdout);
    assert.equal(statusPayload.summary.latestState, "progress");
    assert.equal(statusPayload.summary.progressPercent, 40);
    assert.equal(statusPayload.summary.progressStatus, "Half done");

    const retry = runCli(memoryDir, ["dispatch", "retry", "--run", "--to", "marvis", "--project", "test-project"]);
    assert.equal(retry.status, 0, retry.stderr || retry.stdout);
    const retryPayload = JSON.parse(retry.stdout);
    assert.equal(retryPayload.results?.length || 0, 0);

    const metrics = runCli(memoryDir, ["metrics"]);
    assert.equal(metrics.status, 0, metrics.stderr || metrics.stdout);
    const metricsPayload = JSON.parse(metrics.stdout);
    assert.equal(metricsPayload.relay.progress, 1);
    assert.equal(metricsPayload.relay.byStatus.progress, 1);

    const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    const latestTask = tasks.filter((task) => task.id === "task-progress").at(-1);
    assert.equal(latestTask.status, "claimed");
    assert.equal(latestTask.deliveryState, "progress");
    assert.equal(latestTask.progressPercent, 40);
    assert.equal(latestTask.completedAt, "");
  });
});

test("metrics counts relay status entries by state", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-old-dispatched",
      ts: new Date(Date.now() - 1000).toISOString(),
      threadKey: "codex:test-project:radio-1",
      sourceKind: "radio",
      sourceId: "radio-1",
      dispatchId: "radio:radio-1",
      state: "dispatched",
      project: "test-project",
      tool: "codex"
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-completed",
      ts: now,
      threadKey: "codex:test-project:radio-1",
      sourceKind: "radio",
      sourceId: "radio-1",
      dispatchId: "radio:radio-1",
      state: "completed",
      project: "test-project",
      tool: "codex"
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-failed",
      ts: now,
      threadKey: "gemini:test-project:radio-2",
      sourceKind: "radio",
      sourceId: "radio-2",
      dispatchId: "radio:radio-2",
      state: "failed",
      project: "test-project",
      tool: "gemini",
      lastError: "boom"
    });

    const result = runCli(memoryDir, ["metrics"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const metrics = JSON.parse(result.stdout);
    assert.equal(metrics.relay.byStatus.completed, 1);
    assert.equal(metrics.relay.byStatus.failed, 1);
    assert.equal(metrics.relay.byStatus.dispatched, undefined);
    assert.equal(metrics.relay.completed, 1);
    assert.equal(metrics.relay.failed, 1);
    assert.equal(metrics.relay.total, 2);
    assert.equal(metrics.relay.eventsTotal, 3);
  });
});

test("dispatch launches resolved runner shim with prompt on stdin", async () => {
  await withHub(async (memoryDir) => {
    const binDir = await createFakeCodexRunner(memoryDir);
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-stdin",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Verify stdin dispatch path",
      description: "",
      handoff: "Long prompt payload should not be embedded in a PowerShell command.",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"), {
      id: "workflow-stdin",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      status: "in_progress",
      priority: "normal",
      project: "test-project",
      title: "Workflow with stdin task",
      planner: [],
      executor: ["codex"],
      reviewer: [],
      observer: [],
      plan: "",
      acceptance: "",
      risks: [],
      results: [],
      reviews: [],
      linkedTasks: ["task-stdin"],
      linkedRadio: [],
      notes: []
    });

    const result = runCli(
      memoryDir,
      ["dispatch", "--run", "--to", "codex", "--project", "test-project", "--limit", "1"],
      prependPathEnv(binDir)
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].exitCode, 0, JSON.stringify(payload.results[0], null, 2));
    assert.equal(payload.results[0].runnerMode, "stdin");
    assert.match(payload.results[0].runnerCommand, /^codex(\.cmd)?$/);
    assert.equal(payload.results[0].relayState, "completed");
    assert.equal(payload.results[0].attempt, 1);
    assert.equal(payload.results[0].maxRetries, 3);
    assert.equal(payload.results[0].nextRetryAt, "");
    assert.ok(payload.results[0].runId);
    assert.equal(payload.results[0].runStatus, "completed");
    assert.equal(payload.results[0].verificationResult, "passed");
    assert.match(payload.results[0].stdoutLogPath, /^dispatch-runs\/.+\.stdout\.log$/);
    assert.match(payload.results[0].stderrLogPath, /^dispatch-runs\/.+\.stderr\.log$/);
    assert.equal(payload.results[0].runRecordPath, "state/dispatch-runs.jsonl");

    const stdout = JSON.parse(payload.results[0].stdout);
    assert.deepEqual(stdout.args, ["exec", "--sandbox", "danger-full-access"]);
    assert.match(stdout.stdin, /__AI_MEMORY_THREAD__: codex:test-project:task-stdin/);
    assert.match(stdout.stdin, /Autonomous safety rules:/);
    assert.match(stdout.stdin, /Do not run git push, delete files/);
    assert.match(stdout.stdin, /Verify stdin dispatch path/);
    assert.match(stdout.stdin, /Payload:\nVerify stdin dispatch path/);

    const runs = await readJsonl(path.join(memoryDir, "state", "dispatch-runs.jsonl"));
    assert.equal(runs.length, 1);
    assert.equal(runs[0].runId, payload.results[0].runId);
    assert.equal(runs[0].dispatchId, "task:task-stdin");
    assert.equal(runs[0].sourceKind, "task");
    assert.equal(runs[0].sourceId, "task-stdin");
    assert.equal(runs[0].threadKey, "codex:test-project:task-stdin");
    assert.equal(runs[0].status, "completed");
    assert.equal(runs[0].exitCode, 0);
    assert.equal(runs[0].verificationResult, "passed");
    assert.equal(runs[0].cwd, repoRoot);
    assert.match(runs[0].commandLine, /codex/);
    assert.match(runs[0].stdoutLogPath, /^dispatch-runs\/.+\.stdout\.log$/);
    assert.match(runs[0].stderrLogPath, /^dispatch-runs\/.+\.stderr\.log$/);

    const rawStdout = await fs.readFile(path.join(memoryDir, runs[0].stdoutLogPath), "utf8");
    const rawStderr = await fs.readFile(path.join(memoryDir, runs[0].stderrLogPath), "utf8");
    assert.match(rawStdout, /Verify stdin dispatch path/);
    assert.equal(rawStderr, "");

    const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.equal(tasks[0].status, "done");
    assert.equal(tasks[0].deliveryState, "completed");
    assert.ok(tasks[0].responseRadioId);
    assert.ok(tasks[0].statusRadioId);

    const workflows = await readJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"));
    assert.equal(workflows.length, 1);
    assert.equal(workflows[0].deliveryState, "completed");
    assert.equal(workflows[0].progressPercent, 100);
    assert.equal(workflows[0].progressStatus, "1/1 linked tasks completed");
    assert.equal(workflows[0].dispatchId, "task:task-stdin");
    assert.equal(workflows[0].threadKey, "codex:test-project:task-stdin");
    assert.equal(workflows[0].responseRadioId, tasks[0].responseRadioId);
    assert.equal(workflows[0].statusRadioId, tasks[0].statusRadioId);
    assert.match(workflows[0].notes.at(-1).text, /Linked task task-stdin: Dispatch completed/);

    const radios = await readJsonl(path.join(memoryDir, "radio", "messages.jsonl"));
    assert.equal(radios.find((message) => message.id === tasks[0].responseRadioId)?.type, "response");
    assert.equal(radios.find((message) => message.id === tasks[0].statusRadioId)?.type, "status");

    const status = runCli(memoryDir, ["dispatch", "status", "--ref-id", "task-stdin", "--project", "test-project"]);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    const statusPayload = JSON.parse(status.stdout);
    assert.equal(statusPayload.summary.latestRunId, runs[0].runId);
    assert.equal(statusPayload.summary.latestRunStatus, "completed");
    assert.equal(statusPayload.summary.latestRunExitCode, 0);
    assert.equal(statusPayload.runHistory.length, 1);
    assert.equal(statusPayload.runHistory[0].stdoutLogPath, runs[0].stdoutLogPath);
  });
});

test("dispatch status resolves workflow relay sources and linked tasks", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "workflow-child-task",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Workflow child task",
      description: "",
      handoff: "",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"), {
      id: "workflow-status",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      status: "in_progress",
      priority: "normal",
      project: "test-project",
      title: "Workflow status source",
      planner: [],
      executor: ["codex"],
      reviewer: [],
      observer: [],
      plan: "",
      acceptance: "",
      risks: [],
      results: [],
      reviews: [],
      linkedTasks: ["workflow-child-task"],
      linkedRadio: [],
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-workflow",
      ts: now,
      threadKey: "codex:test-project:workflow-status",
      sourceKind: "workflow",
      sourceId: "workflow-status",
      dispatchId: "workflow:workflow-status",
      state: "progress",
      project: "test-project",
      tool: "codex",
      thread: "workflow-status",
      progressPercent: 50,
      progressStatus: "reviewing linked task"
    });

    const result = runCli(memoryDir, ["dispatch", "status", "--ref-id", "workflow-status", "--project", "test-project"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.summary.latestState, "progress");
    assert.equal(payload.source.id, "workflow-status");
    assert.equal(payload.source.title, "Workflow status source");
    assert.equal(payload.related.workflows.length, 1);
    assert.equal(payload.related.tasks.length, 1);
    assert.equal(payload.related.tasks[0].id, "workflow-child-task");
  });
});

test("doctor reports shared-state-only runner profiles", async () => {
  await withHub(async (memoryDir) => {
    const result = runCli(memoryDir, ["doctor", "--tool", "marvis", "--skip-version"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.summary.sharedStateOnly, 1);
    assert.equal(payload.tools[0].tool, "marvis");
    assert.equal(payload.tools[0].available, false);
    assert.equal(payload.tools[0].sharedStateOnly, true);
    assert.match(payload.tools[0].warnings.join("\n"), /Shared-state-only/);
  });
});

test("doctor reports unknown runner profiles clearly", async () => {
  await withHub(async (memoryDir) => {
    const result = runCli(memoryDir, ["doctor", "--tool", "missing-runner", "--skip-version"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.summary.missing, 1);
    assert.equal(payload.tools[0].tool, "missing-runner");
    assert.equal(payload.tools[0].available, false);
    assert.equal(payload.tools[0].sharedStateOnly, false);
    assert.match(payload.tools[0].reason, /no verified CLI runner/);
  });
});

test("daemon status reports not_running without starting the daemon loop", async () => {
  await withHub(async (memoryDir) => {
    const result = runCli(memoryDir, ["daemon", "status"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.state, "not_running");
    assert.equal(payload.running, false);
    assert.equal(payload.stalePid, false);
    assert.equal(payload.pid, null);
    assert.match(payload.pidFile, /daemon\.pid$/);
    assert.match(payload.statusFile, /daemon-status\.json$/);
  });
});
