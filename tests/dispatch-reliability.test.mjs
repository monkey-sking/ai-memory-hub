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
    "console.log(JSON.stringify({ args, stdin: input, cwd: process.cwd() }));"
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

async function createFakeGitRunner(memoryDir) {
  const binDir = path.join(memoryDir, "fake-git-bin");
  await fs.mkdir(binDir, { recursive: true });
  const runnerScript = path.join(binDir, "fake-git.mjs");
  await fs.writeFile(runnerScript, [
    'import fs from "node:fs";',
    'import path from "node:path";',
    "let args = process.argv.slice(2);",
    "let cwd = process.cwd();",
    'if (args[0] === "-C") { cwd = args[1]; args = args.slice(2); }',
    'const repoRoot = process.env.FAKE_GIT_REPO_ROOT || cwd;',
    'const logFile = process.env.FAKE_GIT_LOG || "";',
    "function log(record) {",
    "  if (!logFile) return;",
    "  fs.mkdirSync(path.dirname(logFile), { recursive: true });",
    "  fs.appendFileSync(logFile, `${JSON.stringify(record)}\\n`, 'utf8');",
    "}",
    "if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {",
    "  if (process.env.FAKE_GIT_REJECT_PLAIN_WORKTREE === '1' && cwd.includes('plain-existing')) {",
    "    console.error('not a git worktree');",
    "    process.exit(1);",
    "  }",
    "  console.log(repoRoot);",
    "  process.exit(0);",
    "}",
    "if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref' && args[2] === 'HEAD') { console.log('main'); process.exit(0); }",
    "if (args[0] === 'rev-parse' && args[1] === 'HEAD') { console.log('0123456789abcdef0123456789abcdef01234567'); process.exit(0); }",
    "if (args[0] === 'rev-parse' && args[1] === '--verify') { process.exit(1); }",
    "if (args[0] === 'worktree' && args[1] === 'add') {",
    "  const rest = args.slice(2);",
    "  let branch = '';",
    "  const positional = [];",
    "  for (let i = 0; i < rest.length; i++) {",
    "    if (rest[i] === '-b') { branch = rest[++i] || ''; continue; }",
    "    positional.push(rest[i]);",
    "  }",
    "  const worktreePath = positional[0];",
    "  const base = positional[1] || '';",
    "  fs.mkdirSync(worktreePath, { recursive: true });",
    "  fs.writeFileSync(path.join(worktreePath, '.fake-worktree.json'), JSON.stringify({ branch, base }, null, 2), 'utf8');",
    "  log({ command: 'worktree add', cwd, branch, worktreePath, base });",
    "  console.log(`Preparing worktree ${worktreePath}`);",
    "  process.exit(0);",
    "}",
    "console.error(`unsupported fake git command: ${args.join(' ')}`);",
    "process.exit(2);"
  ].join("\n"), "utf8");

  if (process.platform === "win32") {
    await fs.writeFile(
      path.join(binDir, "git.cmd"),
      `@echo off\r\n"${process.execPath}" "${runnerScript}" %*\r\n`,
      "utf8"
    );
  } else {
    const runnerPath = path.join(binDir, "git");
    await fs.writeFile(
      runnerPath,
      `#!/bin/sh\nexec "${process.execPath}" "${runnerScript}" "$@"\n`,
      "utf8"
    );
    await fs.chmod(runnerPath, 0o755);
  }

  return binDir;
}

async function createFakeClaudeRunner(memoryDir) {
  const binDir = path.join(memoryDir, "fake-claude-bin");
  await fs.mkdir(binDir, { recursive: true });
  const runnerScript = path.join(binDir, "fake-claude.mjs");
  await fs.writeFile(runnerScript, [
    'import fs from "node:fs";',
    'const input = fs.readFileSync(0, "utf8");',
    "const args = process.argv.slice(2);",
    'if (args.includes("--version")) { console.log("fake-claude 1.0.0"); process.exit(0); }',
    'if (args.includes("--help")) { console.log("fake claude help"); process.exit(0); }',
    "const prompt = args.includes('-') ? input : (args.at(-1) || '');",
    "console.log(JSON.stringify({ session_id: 'fake-session', result: JSON.stringify({ args, stdin: input, prompt }) }));"
  ].join("\n"), "utf8");

  if (process.platform === "win32") {
    await fs.writeFile(
      path.join(binDir, "claude.cmd"),
      `@echo off\r\n"${process.execPath}" "${runnerScript}" %*\r\n`,
      "utf8"
    );
  } else {
    const runnerPath = path.join(binDir, "claude");
    await fs.writeFile(
      runnerPath,
      `#!/bin/sh\nexec "${process.execPath}" "${runnerScript}" "$@"\n`,
      "utf8"
    );
    await fs.chmod(runnerPath, 0o755);
  }

  return binDir;
}

function prependPathEnv(...dirs) {
  const current = process.env.Path || process.env.PATH || "";
  const value = `${dirs.flat().filter(Boolean).join(path.delimiter)}${path.delimiter}${current}`;
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

test("dispatch timeout preserves worktree metadata for review", async () => {
  await withHub(async (memoryDir) => {
    const staleTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const worktree = {
      enabled: true,
      repoRoot: repoRoot,
      root: path.join(repoRoot, ".ai-worktrees"),
      path: path.join(repoRoot, ".ai-worktrees", "codex-test-project-task-timeout-worktree"),
      branch: "amh/codex/test-project/task-timeout-worktree",
      base: "base123",
      head: "head123",
      reused: false,
      createdAt: staleTs,
      diffStatus: "M src/index.js",
      diffStat: "src/index.js | 2 +",
      hasChanges: true
    };
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-timeout-worktree",
      createdAt: staleTs,
      updatedAt: staleTs,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Timed out isolated dispatch",
      description: "",
      handoff: "",
      worktree,
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-timeout-worktree",
      ts: staleTs,
      threadKey: "codex:test-project:task-timeout-worktree",
      sourceKind: "task",
      sourceId: "task-timeout-worktree",
      dispatchId: "task:task-timeout-worktree",
      state: "dispatched",
      attempt: 1,
      maxRetries: 3,
      dispatchedAt: staleTs,
      ackTimeout: 1,
      project: "test-project",
      tool: "codex",
      thread: "task-timeout-worktree",
      worktree
    });

    const result = runCli(memoryDir, ["dispatch", "retry", "--run", "--to", "codex", "--project", "test-project"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results[0].timeout, true);
    assert.deepEqual(payload.results[0].worktree, worktree);

    const relay = await readJsonl(path.join(memoryDir, "state", "relay-status.jsonl"));
    assert.deepEqual(relay.at(-1).worktree, worktree);

    const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.deepEqual(tasks[0].worktree, worktree);

    const status = runCli(memoryDir, ["dispatch", "status", "--ref-id", "task-timeout-worktree", "--project", "test-project"]);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    assert.deepEqual(JSON.parse(status.stdout).summary.latestWorktree, worktree);
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
    assert.deepEqual(stdout.args, ["exec", "--sandbox", "danger-full-access", "--skip-git-repo-check"]);
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

test("dispatch can isolate runner work in a git worktree and expose review metadata", async () => {
  await withHub(async (memoryDir) => {
    const codexBinDir = await createFakeCodexRunner(memoryDir);
    const gitBinDir = await createFakeGitRunner(memoryDir);
    const fakeGitLog = path.join(memoryDir, "fake-git.log");
    const worktreeRoot = path.join(memoryDir, "isolated worktrees");
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-isolated",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Verify isolated dispatch worktree",
      description: "",
      handoff: "Run this task away from the main working tree.",
      notes: []
    });

    const result = runCli(
      memoryDir,
      [
        "dispatch",
        "--run",
        "--to",
        "codex",
        "--project",
        "test-project",
        "--limit",
        "1",
        "--isolate-worktree",
        "--worktree-root",
        worktreeRoot
      ],
      {
        ...prependPathEnv(codexBinDir, gitBinDir),
        FAKE_GIT_REPO_ROOT: repoRoot,
        FAKE_GIT_LOG: fakeGitLog
      }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results.length, 1);
    const dispatchResult = payload.results[0];
    assert.equal(dispatchResult.exitCode, 0, JSON.stringify(dispatchResult, null, 2));
    assert.equal(dispatchResult.worktree.enabled, true);
    assert.equal(path.resolve(dispatchResult.worktree.root), path.resolve(worktreeRoot));
    assert.match(dispatchResult.worktree.path, /[\\/]isolated worktrees[\\/]/);
    assert.match(dispatchResult.worktree.branch, /^amh\/codex\/test-project\/task-isolated/);
    assert.equal(dispatchResult.worktree.base, "0123456789abcdef0123456789abcdef01234567");
    assert.equal(dispatchResult.worktree.head, "0123456789abcdef0123456789abcdef01234567");
    assert.equal(dispatchResult.worktree.reused, false);

    const stdout = JSON.parse(dispatchResult.stdout);
    assert.equal(path.resolve(stdout.cwd), path.resolve(dispatchResult.worktree.path));
    assert.match(stdout.stdin, /Execution isolation:/);
    assert.match(stdout.stdin, /Worktree path:/);
    assert.match(stdout.stdin, /Branch:/);

    const gitLog = await readJsonl(fakeGitLog);
    assert.equal(gitLog.length, 1);
    assert.equal(path.resolve(gitLog[0].worktreePath), path.resolve(dispatchResult.worktree.path));
    assert.equal(gitLog[0].branch, dispatchResult.worktree.branch);

    const runs = await readJsonl(path.join(memoryDir, "state", "dispatch-runs.jsonl"));
    assert.equal(runs.length, 1);
    assert.equal(path.resolve(runs[0].cwd), path.resolve(dispatchResult.worktree.path));
    assert.deepEqual(runs[0].worktree, dispatchResult.worktree);

    const relay = await readJsonl(path.join(memoryDir, "state", "relay-status.jsonl"));
    assert.deepEqual(relay.at(-1).worktree, dispatchResult.worktree);

    const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.deepEqual(tasks[0].worktree, dispatchResult.worktree);

    const status = runCli(memoryDir, ["dispatch", "status", "--ref-id", "task-isolated", "--project", "test-project"]);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    const statusPayload = JSON.parse(status.stdout);
    assert.deepEqual(statusPayload.summary.latestWorktree, dispatchResult.worktree);
    assert.deepEqual(statusPayload.runHistory[0].worktree, dispatchResult.worktree);
  });
});

test("dispatch refuses to reuse an existing non-git worktree directory", async () => {
  await withHub(async (memoryDir) => {
    const codexBinDir = await createFakeCodexRunner(memoryDir);
    const gitBinDir = await createFakeGitRunner(memoryDir);
    const worktreeRoot = path.join(memoryDir, "plain-existing-root");
    const existingPath = path.join(worktreeRoot, "codex-test-project-task-task-existing-plain");
    await fs.mkdir(existingPath, { recursive: true });
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-existing-plain",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Reject plain worktree path",
      description: "",
      handoff: "",
      notes: []
    });

    const result = runCli(
      memoryDir,
      [
        "dispatch",
        "--run",
        "--to",
        "codex",
        "--project",
        "test-project",
        "--limit",
        "1",
        "--isolate-worktree",
        "--worktree-root",
        worktreeRoot
      ],
      {
        ...prependPathEnv(codexBinDir, gitBinDir),
        FAKE_GIT_REPO_ROOT: repoRoot,
        FAKE_GIT_REJECT_PLAIN_WORKTREE: "1"
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already exists but is not a git worktree/);
  });
});

test("dispatch rejects unsafe worktree roots", async () => {
  await withHub(async (memoryDir) => {
    const codexBinDir = await createFakeCodexRunner(memoryDir);
    const gitBinDir = await createFakeGitRunner(memoryDir);
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-unsafe-root",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Reject unsafe worktree root",
      description: "",
      handoff: "",
      notes: []
    });

    const baseEnv = {
      ...prependPathEnv(codexBinDir, gitBinDir),
      FAKE_GIT_REPO_ROOT: repoRoot
    };
    const filesystemRoot = path.parse(repoRoot).root;
    const rootResult = runCli(
      memoryDir,
      [
        "dispatch",
        "--run",
        "--to",
        "codex",
        "--project",
        "test-project",
        "--limit",
        "1",
        "--isolate-worktree",
        "--worktree-root",
        filesystemRoot
      ],
      baseEnv
    );
    assert.notEqual(rootResult.status, 0);
    assert.match(rootResult.stderr, /worktree root cannot be a filesystem root/);

    const gitDirResult = runCli(
      memoryDir,
      [
        "dispatch",
        "--run",
        "--to",
        "codex",
        "--project",
        "test-project",
        "--limit",
        "1",
        "--force",
        "--isolate-worktree",
        "--worktree-root",
        path.join(repoRoot, ".git", "amh-worktrees")
      ],
      baseEnv
    );
    assert.notEqual(gitDirResult.status, 0);
    assert.match(gitDirResult.stderr, /worktree root cannot be inside the repository \.git directory/);
  });
});

test("dispatch passes Claude prompts on stdin with explicit dash argument", async () => {
  await withHub(async (memoryDir) => {
    const binDir = await createFakeClaudeRunner(memoryDir);
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-claude-argv",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "claude",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Verify Claude stdin dash dispatch path",
      description: "",
      handoff: "Claude Code 2.x needs claude -p - to read stdin.",
      notes: []
    });

    const result = runCli(
      memoryDir,
      ["dispatch", "--run", "--to", "claude", "--project", "test-project", "--limit", "1"],
      prependPathEnv(binDir)
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].exitCode, 0, JSON.stringify(payload.results[0], null, 2));
    assert.equal(payload.results[0].runnerMode, "stdin");
    assert.match(payload.results[0].runnerCommand, /^claude(\.cmd)?$/);
    assert.equal(payload.results[0].sessionId, "fake-session");

    const stdout = JSON.parse(payload.results[0].stdout);
    assert.match(stdout.stdin, /__AI_MEMORY_THREAD__: claude:test-project:task-claude-argv/);
    assert.match(stdout.stdin, /Verify Claude stdin dash dispatch path/);
    assert.equal(stdout.args[0], "-p");
    assert.equal(stdout.args[1], "-");
    assert.equal(stdout.prompt, stdout.stdin);

    const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.equal(tasks[0].status, "done");
    assert.equal(tasks[0].responseRadioId, payload.results[0].responseRadioId);
  });
});

test("dispatch --model injects model flag and replaces hardcoded defaults", async () => {
  await withHub(async (memoryDir) => {
    const binDir = await createFakeCodexRunner(memoryDir);
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-model",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Verify model flag injection",
      description: "",
      handoff: "",
      notes: []
    });

    const result = runCli(
      memoryDir,
      ["dispatch", "--run", "--to", "codex", "--project", "test-project", "--limit", "1", "--model", "gpt-5.2"],
      prependPathEnv(binDir)
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].exitCode, 0, JSON.stringify(payload.results[0], null, 2));
    assert.equal(payload.results[0].model, "gpt-5.2");
    const stdout = JSON.parse(payload.results[0].stdout);
    const modelIdx = stdout.args.indexOf("--model");
    assert.notEqual(modelIdx, -1, `expected --model in args: ${JSON.stringify(stdout.args)}`);
    assert.equal(stdout.args[modelIdx + 1], "gpt-5.2");
  });
});

test("dispatch --model replaces hardcoded claude default model", async () => {
  await withHub(async (memoryDir) => {
    const binDir = await createFakeClaudeRunner(memoryDir);
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-claude-model",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "claude",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Verify claude model replacement",
      description: "",
      handoff: "",
      notes: []
    });

    const result = runCli(
      memoryDir,
      ["dispatch", "--run", "--to", "claude", "--project", "test-project", "--limit", "1", "--model", "opus-4.6"],
      prependPathEnv(binDir)
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].exitCode, 0, JSON.stringify(payload.results[0], null, 2));
    const stdout = JSON.parse(payload.results[0].stdout);
    const args = stdout.args;
    const modelIdx = args.indexOf("--model");
    assert.notEqual(modelIdx, -1, `expected --model in args: ${JSON.stringify(args)}`);
    assert.equal(args[modelIdx + 1], "opus-4.6");
    assert.ok(!args.some((arg) => arg === "sonnet"), `hardcoded sonnet should be removed: ${JSON.stringify(args)}`);
  });
});

test("dispatch includes quality gates in runner prompts and retry metadata", async () => {
  await withHub(async (memoryDir) => {
    const binDir = await createFakeCodexRunner(memoryDir);
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-gated",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Verify quality gate prompt",
      description: "Use gate metadata",
      handoff: "",
      qualityGate: {
        verifyCommands: ["node --check src/index.js"],
        reviewRequired: true,
        maxRepairAttempts: 1,
        stopWhen: ["human_approval_required"],
        allowedActions: ["local_file_edits"],
        forbiddenActions: ["git_push_without_approval"]
      },
      recipe: {
        name: "lights-out-local",
        version: "1.0.0"
      },
      recipeStep: {
        id: "verification",
        role: "executor",
        dependsOn: [],
        workflowId: "workflow-gated"
      },
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
    assert.equal(payload.results[0].maxRetries, 1);

    const stdout = JSON.parse(payload.results[0].stdout);
    assert.match(stdout.stdin, /Quality gate:/);
    assert.match(stdout.stdin, /Recipe: lights-out-local@1\.0\.0/);
    assert.match(stdout.stdin, /Recipe step: verification \(executor\)/);
    assert.match(stdout.stdin, /Review required: yes/);
    assert.match(stdout.stdin, /Max repair attempts: 1/);
    assert.match(stdout.stdin, /Stop when: human_approval_required/);
    assert.match(stdout.stdin, /Allowed actions: local_file_edits/);
    assert.match(stdout.stdin, /Forbidden actions: git_push_without_approval/);
    assert.match(stdout.stdin, /node --check src\/index\.js/);

    const relay = await readJsonl(path.join(memoryDir, "state", "relay-status.jsonl"));
    assert.equal(relay.at(-1).state, "completed");
    assert.equal(relay.at(-1).maxRetries, 1);
  });
});

test("dispatch approval-required relay waits for approval before retrying", async () => {
  await withHub(async (memoryDir) => {
    const binDir = await createFakeCodexRunner(memoryDir);
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-approval-gated",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Approval gated dispatch",
      description: "",
      handoff: "",
      notes: []
    });

    const policy = runCli(memoryDir, [
      "policy",
      "add",
      "--actor",
      "codex",
      "--project",
      "test-project",
      "--operation",
      "dispatch",
      "--decision",
      "ask",
      "--reason",
      "Manual approval required for test dispatch",
      "--priority",
      "1000",
      "--by",
      "test"
    ]);
    assert.equal(policy.status, 0, policy.stderr || policy.stdout);

    const gated = runCli(
      memoryDir,
      ["dispatch", "--run", "--to", "codex", "--project", "test-project", "--limit", "1"],
      prependPathEnv(binDir)
    );
    assert.equal(gated.status, 0, gated.stderr || gated.stdout);
    const gatedPayload = JSON.parse(gated.stdout);
    assert.equal(gatedPayload.results.length, 1);
    assert.equal(gatedPayload.results[0].runnable, false);
    assert.equal(gatedPayload.results[0].exitCode, 451);
    assert.match(gatedPayload.results[0].reason, /Approval required/);
    assert.ok(gatedPayload.results[0].gateId);

    const gates = await readJsonl(path.join(memoryDir, "gates", "approvals.jsonl"));
    assert.equal(gates.length, 1);
    assert.equal(gates[0].gateId, gatedPayload.results[0].gateId);
    assert.equal(gates[0].status, "requested");
    assert.equal(gates[0].refId, "task:task-approval-gated");

    const relay = await readJsonl(path.join(memoryDir, "state", "relay-status.jsonl"));
    assert.equal(relay.at(-1).state, "approval-required");
    assert.equal(relay.at(-1).gateId, gatedPayload.results[0].gateId);

    let tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.equal(tasks[0].status, "claimed");
    assert.equal(tasks[0].deliveryState, "approval-required");
    assert.equal(tasks[0].gateId, gatedPayload.results[0].gateId);

    const pendingRetry = runCli(
      memoryDir,
      ["dispatch", "retry", "--run", "--to", "codex", "--project", "test-project"],
      prependPathEnv(binDir)
    );
    assert.equal(pendingRetry.status, 0, pendingRetry.stderr || pendingRetry.stdout);
    const pendingPayload = JSON.parse(pendingRetry.stdout);
    assert.equal(pendingPayload.results.length, 1);
    assert.equal(pendingPayload.results[0].runnable, false);
    assert.equal(pendingPayload.results[0].exitCode, 451);
    assert.match(pendingPayload.results[0].reason, /Waiting for approval/);

    const approval = runCli(memoryDir, [
      "gate",
      "approve",
      "--id",
      gatedPayload.results[0].gateId,
      "--by",
      "human",
      "--note",
      "approved for retry"
    ]);
    assert.equal(approval.status, 0, approval.stderr || approval.stdout);

    const approvedRetry = runCli(
      memoryDir,
      ["dispatch", "retry", "--run", "--to", "codex", "--project", "test-project"],
      prependPathEnv(binDir)
    );
    assert.equal(approvedRetry.status, 0, approvedRetry.stderr || approvedRetry.stdout);
    const approvedPayload = JSON.parse(approvedRetry.stdout);
    assert.equal(approvedPayload.results.length, 1);
    assert.equal(approvedPayload.results[0].exitCode, 0, JSON.stringify(approvedPayload.results[0], null, 2));
    assert.equal(approvedPayload.results[0].retry, true);
    assert.equal(approvedPayload.results[0].attempt, 2);

    const stdout = JSON.parse(approvedPayload.results[0].stdout);
    assert.match(stdout.stdin, /Approval gated dispatch/);

    tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
    assert.equal(tasks[0].status, "done");
    assert.equal(tasks[0].deliveryState, "completed");
  });
});

test("dispatch retry respects task quality gate maxRepairAttempts", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    const dueTs = new Date(Date.now() - 1000).toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "task-retry-gated",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Retry gate",
      description: "",
      handoff: "",
      qualityGate: {
        maxRepairAttempts: 1
      },
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
      id: "relay-retry-gated",
      ts: dueTs,
      threadKey: "codex:test-project:task-retry-gated",
      sourceKind: "task",
      sourceId: "task-retry-gated",
      dispatchId: "task:task-retry-gated",
      state: "failed",
      attempt: 1,
      maxRetries: 3,
      dispatchedAt: "",
      ackTimeout: 100,
      exitCode: 1,
      lastError: "first attempt failed",
      nextRetryAt: dueTs,
      project: "test-project",
      tool: "codex",
      thread: "task-retry-gated"
    });

    const result = runCli(memoryDir, ["dispatch", "retry", "--run", "--to", "codex", "--project", "test-project"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.jobs, []);
  });
});

test("dispatch can hold recipe steps until dependencies complete", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    const recipe = {
      name: "lights-out-local",
      version: "1.0.0"
    };
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "step-implementation",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "",
      status: "open",
      priority: "normal",
      project: "test-project",
      title: "Implementation step",
      description: "",
      handoff: "",
      recipe,
      recipeStep: {
        id: "implementation",
        role: "executor",
        dependsOn: [],
        workflowId: "workflow-steps"
      },
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "step-verification",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Verification step",
      description: "",
      handoff: "",
      recipe,
      recipeStep: {
        id: "verification",
        role: "executor",
        dependsOn: ["implementation"],
        workflowId: "workflow-steps"
      },
      notes: []
    });

    const held = runCli(memoryDir, [
      "dispatch",
      "--to",
      "codex",
      "--project",
      "test-project",
      "--respect-recipe-dependencies"
    ]);
    assert.equal(held.status, 0, held.stderr || held.stdout);
    assert.deepEqual(JSON.parse(held.stdout).jobs, []);

    const done = runCli(memoryDir, ["task", "done", "--id", "step-implementation", "--by", "test"]);
    assert.equal(done.status, 0, done.stderr || done.stdout);

    const released = runCli(memoryDir, [
      "dispatch",
      "--to",
      "codex",
      "--project",
      "test-project",
      "--respect-recipe-dependencies"
    ]);
    assert.equal(released.status, 0, released.stderr || released.stdout);
    const payload = JSON.parse(released.stdout);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].refId, "step-verification");
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
