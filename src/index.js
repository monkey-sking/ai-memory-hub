#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP_NAME = "ai-memory-hub";
const MEMORY_DIR_ENV = "AI_MEMORY_DIR";
const DEFAULT_MEMORY_DIR = path.join(os.homedir(), ".ai-memory");
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_MEMORY_DIR, "config.json");

const rawArgs = process.argv.slice(2);
const parsedArgs = parseCliArgs(rawArgs);
const args = parsedArgs.args;
const command = parsedArgs.command;
const rest = parsedArgs.rest;

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

async function main() {
  switch (command) {
    case "init":
      return initCommand(rest);
    case "detect":
      return detectCommand();
    case "status":
      return statusCommand();
    case "record":
      return recordCommand(rest);
    case "radio":
      return radioCommand(rest);
    case "task":
    case "todo":
      return taskCommand(rest);
    case "workflow":
    case "flow":
      return workflowCommand(rest);
    case "connect":
    case "contact":
      return connectCommand(rest);
    case "dispatch":
      return dispatchCommand(rest);
    case "sync":
      return syncCommand(rest);
    case "index":
      return indexCommand(rest);
    case "search":
      return searchCommand(rest);
    case "pull":
      return pullCommand(rest);
    case "backup":
      return backupCommand(rest);
    case "watch":
      return watchCommand(rest);
    case "app":
      return appCommand(rest);
    case "install":
      return installCommand(rest);
    case "help":
    case "--help":
    case "-h":
      return helpCommand();
    default:
      throw new Error(`Unknown command: ${command}\nRun "${APP_NAME} help".`);
  }
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? [...argv] : [];
  const command = args[0] || "help";
  return {
    args,
    command,
    rest: args.slice(1)
  };
}

function resolveMemoryDir(argv = rawArgs) {
  const fromArgs = getOption(argv, "--memory-dir");
  const fromEnv = process.env[MEMORY_DIR_ENV];
  return path.resolve(fromArgs || fromEnv || DEFAULT_MEMORY_DIR);
}

function initCommand(argv) {
  const memoryDir = resolveMemoryDir();
  ensureHub(memoryDir);

  const configPath = path.join(memoryDir, "config.json");
  if (!fs.existsSync(configPath) || hasFlag(argv, "--force")) {
    writeJson(configPath, defaultConfig(memoryDir));
  }

  console.log(`Initialized shared memory directory: ${memoryDir}`);
  console.log(`Config: ${configPath}`);
}

function detectCommand() {
  const tools = detectTools();
  console.log(JSON.stringify(tools, null, 2));
}

function statusCommand() {
  console.log(JSON.stringify(getStatusObject(), null, 2));
}

function getStatusObject() {
  const config = loadConfig();
  const memoryDir = config.memoryDir;
  ensureHub(memoryDir);

  const pending = readEvents(path.join(memoryDir, "inbox", "events.jsonl")).length;
  const synced = countJsonlFiles(path.join(memoryDir, "synced"));
  const ledger = readLedger(memoryDir).length;
  const indexPath = path.join(memoryDir, "memories", "index.json");
  const indexStats = fs.existsSync(indexPath) ? readJson(indexPath).stats : {};
  const radio = readRadioMessages(memoryDir).length;
  const tasks = readTasks(memoryDir);
  const activeTasks = tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length;
  const workflows = readWorkflows(memoryDir);
  const activeWorkflows = workflows.filter((workflow) => !["done", "cancelled"].includes(workflow.status)).length;
  const relayLatest = Object.values(readLatestRelayStatusByThread(memoryDir));
  const backups = countBackupDirs(memoryDir);
  const lock = readLockStatus(memoryDir);
  const tools = detectTools(memoryDir);
  const toolSummary = summarizeToolConnections(tools);

  return {
    memoryDir,
    pendingEvents: pending,
    syncedEventFiles: synced,
    ledgerEvents: ledger,
    index: indexStats || {},
    radioMessages: radio,
    tasks: {
      total: tasks.length,
      active: activeTasks,
      open: tasks.filter((task) => task.status === "open").length,
      claimed: tasks.filter((task) => task.status === "claimed").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      blocked: tasks.filter((task) => task.status === "blocked").length,
      done: tasks.filter((task) => task.status === "done").length
    },
    workflows: {
      total: workflows.length,
      active: activeWorkflows,
      open: workflows.filter((workflow) => workflow.status === "open").length,
      inProgress: workflows.filter((workflow) => workflow.status === "in_progress").length,
      review: workflows.filter((workflow) => workflow.status === "review").length,
      blocked: workflows.filter((workflow) => workflow.status === "blocked").length,
      done: workflows.filter((workflow) => workflow.status === "done").length
    },
    relay: {
      totalThreads: relayLatest.length,
      pending: relayLatest.filter((entry) => entry.state === "pending").length,
      dispatched: relayLatest.filter((entry) => entry.state === "dispatched").length,
      retrying: relayLatest.filter((entry) => entry.state === "retrying").length,
      failed: relayLatest.filter((entry) => entry.state === "failed").length,
      completed: relayLatest.filter((entry) => entry.state === "completed").length,
      abandoned: relayLatest.filter((entry) => entry.state === "abandoned").length,
      dueRetries: relayLatest.filter((entry) => isRelayRetryDue(entry)).length
    },
    backups,
    lock,
    toolSummary,
    tools
  };
}

function connectCommand(argv) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "status";
  const actionArgs = action === "status" ? argv : argv.slice(1);
  switch (action) {
    case "status":
    case "list":
      return connectStatusCommand(actionArgs);
    case "request":
    case "ask":
      return connectSendCommand(actionArgs, "request");
    case "review":
      return connectSendCommand(actionArgs, "review");
    case "handoff":
      return connectSendCommand(actionArgs, "handoff");
    case "note":
      return connectSendCommand(actionArgs, "note");
    default:
      throw new Error("Usage: ai-memory-hub connect [status|request|review|handoff|note] ...");
  }
}

function connectStatusCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const apply = hasFlag(argv, "--apply");
  const tools = detectTools(config.memoryDir);
  const installedUnconfigured = tools.filter((tool) => tool.installed && !tool.configured);

  if (apply) {
    for (const tool of installedUnconfigured) {
      const target = getInstallTargetForTool(config.memoryDir, tool.name);
      if (!target) continue;
      const snippet = renderTemplate(target.template, {
        MEMORY_DIR: config.memoryDir,
        TOOL: target.tool
      });
      ensureDir(path.dirname(target.file));
      appendIfMissing(target.file, snippet, "Shared AI Memory");
    }
  }

  const refreshed = apply ? detectTools(config.memoryDir) : tools;
  const summary = summarizeToolConnections(refreshed);
  console.log(JSON.stringify({
    apply,
    summary,
    tools: refreshed.map((tool) => ({
      name: tool.name,
      installed: tool.installed,
      configured: tool.configured,
      connected: tool.connected,
      connectionStatus: tool.connectionStatus,
      action: tool.action,
      instructionFile: tool.instructionFile
    }))
  }, null, 2));
}

function connectSendCommand(argv, defaultType) {
  const text = getOption(argv, "--text") || positionalArgs(argv).join(" ").trim();
  if (!text) {
    throw new Error("Usage: ai-memory-hub connect request --from <tool> --to codex --project <project> --text <message> [--task] [--run]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const from = getOption(argv, "--from") || getOption(argv, "--by") || "manual";
  const to = getOption(argv, "--to") || "codex";
  const type = getOption(argv, "--type") || defaultType || "request";
  const project = getOption(argv, "--project") || path.basename(process.cwd());
  const priority = getOption(argv, "--priority") || (type === "review" ? "high" : "normal");
  const shouldCreateTask = hasFlag(argv, "--task") || hasFlag(argv, "--create-task");
  let task = null;

  if (shouldCreateTask) {
    withHubLock(config.memoryDir, "connect-task", () => {
      const tasks = readTasks(config.memoryDir);
      task = createTask({
        title: getOption(argv, "--title") || `[${type}] ${summarizeText(text, 80)}`,
        description: text,
        handoff: `Contact request from ${from} to ${to}.`,
        createdBy: from,
        project,
        priority
      });
      task.assignee = to;
      task.status = "claimed";
      tasks.push(task);
      writeTasks(config.memoryDir, tasks);
    }, config.sync.lockStaleMs);
  }

  const message = createRadioMessage({
    from,
    to,
    type,
    text,
    thread: getOption(argv, "--thread") || task?.id || "",
    replyTo: getOption(argv, "--reply-to") || "",
    project
  });
  appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), message);

  const dispatch = hasFlag(argv, "--run")
    ? executeDispatch(config.memoryDir, {
      run: true,
      force: hasFlag(argv, "--force"),
      to,
      project,
      limit: Number(getOption(argv, "--limit") || 5)
    })
    : null;

  console.log(JSON.stringify({
    ok: true,
    message,
    task,
    dispatch,
    hint: dispatch ? "" : `Run ai-memory-hub dispatch --to ${to} --project ${project} --run to trigger a verified runner.`
  }, null, 2));
}

function recordCommand(argv) {
  const text = positionalArgs(argv).join(" ").trim();
  if (!text) {
    throw new Error("Usage: ai-memory-hub record <text> [--source tool] [--kind preference]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const event = {
    id: createId(text),
    ts: new Date().toISOString(),
    source: getOption(argv, "--source") || "manual",
    text,
    metadata: {
      kind: getOption(argv, "--kind") || "note"
    }
  };

  appendJsonl(path.join(config.memoryDir, "inbox", "events.jsonl"), event);
  console.log(`Recorded memory event: ${event.id}`);
}

function radioCommand(argv) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "send":
      return radioSendCommand(actionArgs);
    case "list":
      return radioListCommand(actionArgs);
    case "promote":
      return radioPromoteCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub radio <send|list|promote> ...");
  }
}

function radioSendCommand(argv) {
  const text = positionalArgs(argv).join(" ").trim();
  if (!text) {
    throw new Error("Usage: ai-memory-hub radio send <text> [--from codex] [--to claude] [--type handoff]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const message = createRadioMessage({
    from: getOption(argv, "--from") || "manual",
    to: getOption(argv, "--to") || "all",
    type: getOption(argv, "--type") || "note",
    text,
    thread: getOption(argv, "--thread") || "",
    replyTo: getOption(argv, "--reply-to") || "",
    project: getOption(argv, "--project") || path.basename(process.cwd())
  });
  appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), message);
  console.log(JSON.stringify(message, null, 2));
}

function radioListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const limit = Number(getOption(argv, "--limit") || 20);
  const messages = readRadioMessages(config.memoryDir).slice(-limit);
  console.log(JSON.stringify(messages, null, 2));
}

function radioPromoteCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub radio promote --id <message-id>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const message = readRadioMessages(config.memoryDir).find((item) => item.id === id);
  if (!message) {
    throw new Error(`Radio message not found: ${id}`);
  }
  if (message.promoted) {
    console.log(`Radio message already promoted: ${message.id}`);
    return;
  }
  appendJsonl(path.join(config.memoryDir, "inbox", "events.jsonl"), {
    id: createId(`radio:${message.id}`),
    ts: new Date().toISOString(),
    source: `radio:${message.from}`,
    text: message.text,
    metadata: {
      kind: "radio",
      radio_id: message.id,
      radio_type: message.type,
      radio_to: message.to,
      thread: message.thread,
      project: message.project
    }
  });
  updateRadioMessage(config.memoryDir, message.id, {
    promoted: true,
    promotedAt: new Date().toISOString()
  });
  console.log(`Promoted radio message to memory inbox: ${message.id}`);
}

function taskCommand(argv) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "add":
      return taskAddCommand(actionArgs);
    case "list":
      return taskListCommand(actionArgs);
    case "claim":
      return taskClaimCommand(actionArgs);
    case "status":
      return taskStatusCommand(actionArgs);
    case "note":
      return taskNoteCommand(actionArgs);
    case "done":
      return taskDoneCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub task <add|list|claim|status|note|done> ...");
  }
}

function taskAddCommand(argv) {
  const title = positionalArgs(argv).join(" ").trim();
  if (!title) {
    throw new Error("Usage: ai-memory-hub task add <title> [--from codex] [--project name] [--priority normal]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "task-add", () => {
    const tasks = readTasks(config.memoryDir);
    const task = createTask({
      title,
      description: getOption(argv, "--description") || "",
      handoff: getOption(argv, "--handoff") || "",
      createdBy: getOption(argv, "--from") || getOption(argv, "--by") || "manual",
      project: getOption(argv, "--project") || path.basename(process.cwd()),
      priority: getOption(argv, "--priority") || "normal"
    });
    tasks.push(task);
    writeTasks(config.memoryDir, tasks);
    console.log(JSON.stringify(task, null, 2));
  }, config.sync.lockStaleMs);
}

function taskListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const status = getOption(argv, "--status") || "active";
  const project = getOption(argv, "--project") || "";
  const assignee = getOption(argv, "--assignee") || "";
  const limit = Number(getOption(argv, "--limit") || 20);
  const tasks = readTasks(config.memoryDir)
    .filter((task) => status === "all" ? true : status === "active" ? !["done", "cancelled"].includes(task.status) : task.status === status)
    .filter((task) => project ? task.project === project : true)
    .filter((task) => assignee ? task.assignee === assignee : true)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, limit);
  console.log(JSON.stringify(tasks, null, 2));
}

function taskClaimCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id) {
    throw new Error("Usage: ai-memory-hub task claim --id <task-id> [--by codex]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "task-claim", () => {
    const task = updateTask(config.memoryDir, id, (current) => ({
      ...current,
      status: current.status === "open" ? "claimed" : current.status,
      assignee: by,
      updatedAt: new Date().toISOString(),
      notes: [
        ...(current.notes || []),
        createTaskNote(by, `Claimed by ${by}.`)
      ]
    }));
    console.log(JSON.stringify(task, null, 2));
  }, config.sync.lockStaleMs);
}

function taskStatusCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const status = getOption(argv, "--status") || positionalArgs(argv)[1] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id || !status) {
    throw new Error("Usage: ai-memory-hub task status --id <task-id> --status <open|claimed|in_progress|blocked|done|cancelled> [--by codex]");
  }
  assertTaskStatus(status);
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "task-status", () => {
    const task = updateTask(config.memoryDir, id, (current) => ({
      ...current,
      status,
      assignee: current.assignee || by,
      updatedAt: new Date().toISOString(),
      completedAt: status === "done" ? new Date().toISOString() : current.completedAt || "",
      notes: [
        ...(current.notes || []),
        createTaskNote(by, `Status changed to ${status}.`)
      ]
    }));
    console.log(JSON.stringify(task, null, 2));
  }, config.sync.lockStaleMs);
}

function taskNoteCommand(argv) {
  const args = positionalArgs(argv);
  const id = getOption(argv, "--id") || args[0] || "";
  const text = getOption(argv, "--text") || (getOption(argv, "--id") ? args.join(" ") : args.slice(1).join(" ")).trim();
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id || !text) {
    throw new Error("Usage: ai-memory-hub task note --id <task-id> <note> [--by codex]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "task-note", () => {
    const task = updateTask(config.memoryDir, id, (current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      notes: [
        ...(current.notes || []),
        createTaskNote(by, text)
      ]
    }));
    console.log(JSON.stringify(task, null, 2));
  }, config.sync.lockStaleMs);
}

function taskDoneCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id) {
    throw new Error("Usage: ai-memory-hub task done --id <task-id> [--by codex]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "task-done", () => {
    const task = updateTask(config.memoryDir, id, (current) => ({
      ...current,
      status: "done",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      assignee: current.assignee || by,
      notes: [
        ...(current.notes || []),
        createTaskNote(by, `Completed by ${by}.`)
      ]
    }));
    console.log(JSON.stringify(task, null, 2));
  }, config.sync.lockStaleMs);
}

function dispatchCommand(argv) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  if (action === "retry") {
    return dispatchRetryCommand(argv.slice(1));
  }
  const run = hasFlag(argv, "--run");
  const force = hasFlag(argv, "--force");
  const to = getOption(argv, "--to") || "";
  const project = getOption(argv, "--project") || "";
  const limit = Number(getOption(argv, "--limit") || 10);
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const results = executeDispatch(config.memoryDir, { run, force, to, project, limit });
  if (results.length === 0) {
    console.log(JSON.stringify({ run, jobs: [], message: "No undispatched radio messages or active tasks matched." }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    run,
    results
  }, null, 2));
}

function dispatchRetryCommand(argv) {
  const run = hasFlag(argv, "--run");
  const to = getOption(argv, "--to") || "";
  const project = getOption(argv, "--project") || "";
  const limit = Number(getOption(argv, "--limit") || 10);
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const results = executeDispatchRetry(config.memoryDir, { run, to, project, limit });
  if (results.length === 0) {
    console.log(JSON.stringify({ run, jobs: [], message: "No failed relay jobs are eligible for retry." }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    run,
    results
  }, null, 2));
}

function executeDispatch(memoryDir, { run = false, force = false, to = "", project = "", limit = 10 }) {
  const jobs = buildDispatchJobs(memoryDir, { to, project, limit, force });
  const results = [];
  const relayState = readLatestRelayStatusByThread(memoryDir);
  for (const job of jobs) {
    const runner = getToolRunner(job.tool);
    if (!runner.available) {
      const result = {
        ...job,
        runnable: false,
        reason: runner.reason
      };
      if (run) {
        appendRelayStatus(memoryDir, job, {
          state: "failed",
          attempt: nextRelayAttempt(relayState, job),
          maxRetries: 3,
          exitCode: null,
          lastError: runner.reason,
          sessionId: "",
          ackTimeout: 5 * 60 * 1000,
          nextRetryAt: computeNextRetryAt(nextRelayAttempt(relayState, job), 3)
        });
        appendDispatchStatusMessage(memoryDir, job, result);
        appendDispatchLog(memoryDir, result);
      }
      results.push(result);
      continue;
    }
    if (!run) {
      const threadKey = getDispatchThreadKey(job);
      results.push({
        ...job,
        runnable: true,
        dryRun: true,
        command: runner.preview,
        relayState: relayState[threadKey]?.state || "pending",
        attempt: relayState[threadKey]?.attempt || 0
      });
      continue;
    }
    appendRelayStatus(memoryDir, job, {
      state: "dispatched",
      attempt: nextRelayAttempt(relayState, job),
      maxRetries: 3,
      exitCode: null,
      lastError: "",
      sessionId: "",
      ackTimeout: 5 * 60 * 1000
    });
    const result = runDispatchJob(memoryDir, job, runner);
    appendRelayStatus(memoryDir, job, {
      state: result.exitCode === 0 ? "completed" : "failed",
      attempt: nextRelayAttempt(relayState, job),
      maxRetries: 3,
      exitCode: result.exitCode,
      lastError: result.error || result.stderr || "",
      sessionId: result.sessionId || "",
      ackTimeout: 5 * 60 * 1000,
      nextRetryAt: result.exitCode === 0 ? "" : computeNextRetryAt(nextRelayAttempt(relayState, job), 3)
    });
    appendDispatchStatusMessage(memoryDir, job, result);
    appendDispatchLog(memoryDir, result);
    results.push(result);
  }
  return results;
}

function executeDispatchRetry(memoryDir, { run = false, to = "", project = "", limit = 10 }) {
  const relayState = readLatestRelayStatusByThread(memoryDir);
  const jobs = buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit });
  const results = [];
  for (const job of jobs) {
    const runner = getToolRunner(job.tool);
    if (!runner.available) {
      const result = {
        ...job,
        runnable: false,
        reason: runner.reason
      };
      if (run) {
        appendRelayStatus(memoryDir, job, {
          state: "failed",
          attempt: job.attempt,
          maxRetries: job.maxRetries || 3,
          exitCode: null,
          lastError: runner.reason,
          sessionId: "",
          ackTimeout: 5 * 60 * 1000,
          nextRetryAt: computeNextRetryAt(job.attempt, job.maxRetries || 3)
        });
        appendDispatchStatusMessage(memoryDir, job, result);
        appendDispatchLog(memoryDir, result);
      }
      results.push(result);
      continue;
    }
    if (!run) {
      results.push({
        ...job,
        runnable: true,
        dryRun: true,
        command: runner.preview,
        relayState: "retrying"
      });
      continue;
    }
    appendRelayStatus(memoryDir, job, {
      state: "retrying",
      attempt: job.attempt,
      maxRetries: job.maxRetries || 3,
      exitCode: null,
      lastError: "",
      sessionId: "",
      ackTimeout: 5 * 60 * 1000,
      nextRetryAt: ""
    });
    const result = runDispatchJob(memoryDir, job, runner);
    appendRelayStatus(memoryDir, job, {
      state: result.exitCode === 0 ? "completed" : "failed",
      attempt: job.attempt,
      maxRetries: job.maxRetries || 3,
      exitCode: result.exitCode,
      lastError: result.error || result.stderr || "",
      sessionId: result.sessionId || "",
      ackTimeout: 5 * 60 * 1000,
      nextRetryAt: result.exitCode === 0 ? "" : computeNextRetryAt(job.attempt, job.maxRetries || 3)
    });
    appendDispatchStatusMessage(memoryDir, job, result);
    appendDispatchLog(memoryDir, { ...result, retry: true });
    results.push({ ...result, retry: true });
  }
  return results;
}

function buildDispatchJobs(memoryDir, { to, project, limit, force }) {
  const dispatched = force ? new Set() : readDispatchLog(memoryDir)
    .filter((item) => item.runnable && item.exitCode === 0)
    .reduce((set, item) => set.add(item.id), new Set());
  const messages = readRadioMessages(memoryDir)
    .filter((message) => project ? message.project === project : true)
    .filter((message) => to ? message.to === to || message.to === "all" : message.to !== "all")
    .slice(-limit)
    .map((message) => ({
      id: `radio:${message.id}`,
      kind: "radio",
      tool: message.to === "all" ? to : message.to,
      project: message.project || "",
      text: message.text,
      refId: message.id,
      thread: message.thread || message.id
    }));
  const tasks = readTasks(memoryDir)
    .filter((task) => !["done", "cancelled"].includes(task.status))
    .filter((task) => project ? task.project === project : true)
    .filter((task) => to ? task.assignee === to : Boolean(task.assignee))
    .slice(0, limit)
    .map((task) => ({
      id: `task:${task.id}`,
      kind: "task",
      tool: task.assignee,
      project: task.project || "",
      text: `${task.title}${task.handoff ? `\nHandoff: ${task.handoff}` : ""}`,
      refId: task.id,
      thread: task.id
    }));
  return [...messages, ...tasks]
    .filter((job) => job.tool)
    .filter((job) => !dispatched.has(job.id))
    .slice(0, limit);
}

function buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit }) {
  const now = Date.now();
  const candidates = Object.values(relayState)
    .filter((entry) => entry.state === "failed")
    .filter((entry) => entry.nextRetryAt && Date.parse(entry.nextRetryAt) <= now)
    .filter((entry) => Number(entry.attempt || 0) < Number(entry.maxRetries || 3))
    .filter((entry) => to ? entry.tool === to : true)
    .filter((entry) => project ? entry.project === project : true)
    .slice(0, limit);

  return candidates
    .map((entry) => rebuildDispatchJobFromRelay(memoryDir, entry))
    .filter(Boolean)
    .map((job, index) => ({
      ...job,
      attempt: Number(candidates[index].attempt || 0) + 1,
      maxRetries: Number(candidates[index].maxRetries || 3)
    }));
}

function rebuildDispatchJobFromRelay(memoryDir, entry) {
  if (entry.sourceKind === "radio") {
    const message = readRadioMessages(memoryDir).find((item) => item.id === entry.sourceId);
    if (!message) return null;
    return {
      id: `radio:${message.id}`,
      kind: "radio",
      tool: message.to,
      project: message.project || "",
      text: message.text,
      refId: message.id,
      thread: message.thread || message.id
    };
  }
  if (entry.sourceKind === "task") {
    const task = readTasks(memoryDir).find((item) => item.id === entry.sourceId);
    if (!task) return null;
    return {
      id: `task:${task.id}`,
      kind: "task",
      tool: task.assignee,
      project: task.project || "",
      text: `${task.title}${task.handoff ? `\nHandoff: ${task.handoff}` : ""}`,
      refId: task.id,
      thread: task.id
    };
  }
  return null;
}

function getToolRunner(tool) {
  if (tool === "codex") {
    if (!commandExists("codex")) {
      return { available: false, reason: "codex CLI not found in PATH" };
    }
    return {
      available: true,
      preview: "codex exec --ask-for-approval never <prompt>",
      command: "codex",
      args: ["exec", "--ask-for-approval", "never"]
    };
  }
  if (tool === "claude") {
    if (!commandExists("claude")) {
      return { available: false, reason: "claude CLI not found or broken in PATH" };
    }
    return {
      available: true,
      preview: "claude -p --output-format json --permission-mode bypassPermissions --bare <prompt>",
      command: process.platform === "win32" ? "powershell" : "claude",
      args: process.platform === "win32"
        ? ["-NoProfile", "-Command"]
        : ["-p", "--output-format", "json", "--permission-mode", "bypassPermissions", "--bare", "--model", "sonnet", "--effort", "low"],
      mode: process.platform === "win32" ? "claude-windows-powershell" : "claude-json"
    };
  }
  if (tool === "marvis") {
    return {
      available: true,
      preview: "Marvis reads Agent Radio messages and shared tasks at session start or when instructed by the user. Send a radio message or task addressed to marvis, and it will pick it up on the next check.",
      command: "echo",
      args: []
    };
  }
  return {
    available: false,
    reason: `${tool} has shared instructions but no verified CLI runner on this machine`
  };
}

function runDispatchJob(memoryDir, job, runner) {
  const prompt = renderDispatchPrompt(memoryDir, job);
  const completed = spawnSync(runner.command, buildRunnerArgs(memoryDir, job, runner, prompt), {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    windowsHide: true
  });
  const parsed = parseRunnerOutput(memoryDir, job, runner, completed.stdout);
  return {
    ...job,
    runnable: true,
    exitCode: completed.status,
    stdout: trimOutput(parsed.stdout),
    stderr: trimOutput(completed.stderr),
    error: completed.error ? completed.error.message : "",
    sessionId: parsed.sessionId || ""
  };
}

function buildRunnerArgs(memoryDir, job, runner, prompt) {
  const sessionId = runner.mode && runner.mode.startsWith("claude")
    ? readClaudeSessionState(memoryDir)[getDispatchThreadKey(job)] || ""
    : "";
  if (runner.mode === "claude-windows-powershell") {
    const resumePart = sessionId ? ` --resume ${sessionId}` : "";
    return [
      ...runner.args,
      `$p = @'\n${prompt}\n'@; claude -p --output-format json --permission-mode bypassPermissions --bare --model sonnet --effort low${resumePart} $p`
    ];
  }
  if (runner.mode === "claude-json") {
    return sessionId
      ? [...runner.args, "--resume", sessionId, prompt]
      : [...runner.args, prompt];
  }
  if (runner.mode === "claude-windows-cmd") {
    return [
      ...runner.args,
      `claude -p --output-format text --permission-mode bypassPermissions "${escapeForWindowsCmd(prompt)}"`
    ];
  }
  return [...runner.args, prompt];
}

function parseRunnerOutput(memoryDir, job, runner, stdout) {
  if (!runner.mode || !runner.mode.startsWith("claude")) {
    return { stdout, sessionId: "" };
  }
  const text = String(stdout || "").trim();
  if (!text) {
    return { stdout: "", sessionId: "" };
  }
  try {
    const payload = JSON.parse(text);
    const sessionId = payload.session_id || "";
    if (sessionId && job.thread) {
      writeClaudeSessionState(memoryDir, job, sessionId);
    }
    return {
      stdout: payload.result || text,
      sessionId
    };
  } catch {
    return { stdout: text, sessionId: "" };
  }
}

function readClaudeSessionState(memoryDir) {
  const file = path.join(memoryDir, "state", "claude-sessions.json");
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return readJson(file);
  } catch {
    return {};
  }
}

function writeClaudeSessionState(memoryDir, job, sessionId) {
  const threadKey = getDispatchThreadKey(job);
  if (!threadKey) {
    return;
  }
  const state = readClaudeSessionState(memoryDir);
  state[threadKey] = sessionId;
  writeJson(path.join(memoryDir, "state", "claude-sessions.json"), state);
}

function getDispatchThreadKey(job) {
  return `${job.tool || "unknown"}:${job.project || "default"}:${job.thread || job.refId || job.id || ""}`;
}

function escapeForWindowsCmd(value) {
  return String(value || "")
    .replace(/"/g, '""')
    .replace(/%/g, "%%");
}

function renderDispatchPrompt(memoryDir, job) {
  return [
    `__AI_MEMORY_THREAD__: ${getDispatchThreadKey(job)}`,
    `Dispatch target: ${job.tool}`,
    `Project: ${job.project || "(none)"}`,
    `Kind: ${job.kind}`,
    `Ref: ${job.refId}`,
    "",
    "Instructions:",
    "- Continue the existing thread context if this dispatch resumes a prior session.",
    "- Do the dispatched task directly. Do not introduce yourself, list tools, or ask what to work on.",
    "- Keep the response compact: at most 6 short bullets or 1 short paragraph.",
    "- If the payload asks for a design or plan, return concrete steps and state transitions.",
    "- If you need to mention follow-up, end with a single 'Next:' line.",
    "",
    "Payload:",
    job.text
  ].join("\n");
}

function readDispatchLog(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "dispatch-log.jsonl"));
}

function appendDispatchLog(memoryDir, result) {
  appendJsonl(path.join(memoryDir, "state", "dispatch-log.jsonl"), {
    ...result,
    dispatchedAt: new Date().toISOString()
  });
}

function readRelayStatus(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "relay-status.jsonl"));
}

function readLatestRelayStatusByThread(memoryDir) {
  const latest = {};
  for (const entry of readRelayStatus(memoryDir)) {
    const threadKey = entry.threadKey || "";
    if (!threadKey) {
      continue;
    }
    const current = latest[threadKey];
    const currentTs = String(current?.ts || current?.updatedAt || "");
    const nextTs = String(entry.ts || entry.updatedAt || "");
    if (!current || nextTs >= currentTs) {
      latest[threadKey] = entry;
    }
  }
  return latest;
}

function nextRelayAttempt(relayState, job) {
  const threadKey = getDispatchThreadKey(job);
  return Number(relayState[threadKey]?.attempt || 0) + 1;
}

function computeNextRetryAt(attempt, maxRetries = 3) {
  if (Number(attempt || 0) >= Number(maxRetries || 3)) {
    return "";
  }
  const delays = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];
  const delayMs = delays[Math.max(0, Number(attempt || 1) - 1)] || delays[delays.length - 1];
  return new Date(Date.now() + delayMs).toISOString();
}

function isRelayRetryDue(entry) {
  if (!entry || entry.state !== "failed" || !entry.nextRetryAt) {
    return false;
  }
  const nextRetryMs = Date.parse(entry.nextRetryAt);
  if (Number.isNaN(nextRetryMs)) {
    return false;
  }
  return nextRetryMs <= Date.now() && Number(entry.attempt || 0) < Number(entry.maxRetries || 3);
}

function appendRelayStatus(memoryDir, job, patch = {}) {
  const now = new Date().toISOString();
  appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
    id: createId(`relay:${job.id}:${now}:${patch.state || "pending"}`),
    ts: now,
    threadKey: getDispatchThreadKey(job),
    sourceKind: job.kind,
    sourceId: job.refId,
    dispatchId: job.id,
    state: patch.state || "pending",
    attempt: Number(patch.attempt || 1),
    maxRetries: Number(patch.maxRetries || 3),
    dispatchedAt: patch.state === "dispatched" ? now : "",
    ackTimeout: Number(patch.ackTimeout || 0),
    sessionId: patch.sessionId || "",
    exitCode: patch.exitCode ?? null,
    lastError: String(patch.lastError || "").trim(),
      nextRetryAt: patch.nextRetryAt || "",
      project: job.project || "",
      tool: job.tool || "",
      thread: job.thread || ""
  });
}

function appendDispatchStatusMessage(memoryDir, job, result) {
  const origin = findDispatchOrigin(memoryDir, job);
  if (!origin?.from) {
    return null;
  }
  const state = result.exitCode === 0 ? "completed" : "failed";
  const parts = [
    `Dispatch ${state} for ${job.tool}`,
    `thread=${job.thread || job.refId}`
  ];
  if (result.sessionId) {
    parts.push(`session=${result.sessionId}`);
  }
  if (result.exitCode !== null && result.exitCode !== undefined) {
    parts.push(`exit=${result.exitCode}`);
  }
  if (result.error) {
    parts.push(`error=${summarizeText(result.error, 120)}`);
  }
  const message = createRadioMessage({
    from: "ai-memory-hub",
    to: origin.from,
    type: "status",
    text: parts.join(" | "),
    thread: origin.thread || job.thread || job.refId,
    replyTo: origin.id || job.refId,
    project: origin.project || job.project || ""
  });
  appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), message);
  return message;
}

function findDispatchOrigin(memoryDir, job) {
  if (job.kind === "radio") {
    return readRadioMessages(memoryDir).find((message) => message.id === job.refId) || null;
  }
  if (job.kind === "task") {
    const task = readTasks(memoryDir).find((item) => item.id === job.refId);
    if (!task) {
      return null;
    }
    return {
      id: task.id,
      from: task.createdBy,
      thread: task.id,
      project: task.project
    };
  }
  return null;
}

function syncCommand(argv) {
  const dryRun = hasFlag(argv, "--dry-run");
  const config = loadConfig();
  ensureHub(config.memoryDir);

  if (!dryRun) {
    return withHubLock(config.memoryDir, "sync", () => syncIndexedEvents(config, dryRun), config.sync.lockStaleMs);
  }
  return syncIndexedEvents(config, dryRun);
}

function syncIndexedEvents(config, dryRun) {
  const inboxPath = path.join(config.memoryDir, "inbox", "events.jsonl");
  const events = readEvents(inboxPath);
  if (events.length === 0) {
    console.log("No pending memory events.");
    return;
  }

  const backup = dryRun ? null : backupHub(config.memoryDir, "pre-sync");
  let synced = 0;
  const remaining = [];
  const ledger = readLedger(config.memoryDir);
  const knownIds = new Set(ledger.map((item) => item.localEventId || item.id).filter(Boolean));
  const newRecords = [];

  for (const event of events) {
    const normalizedEvent = normalizeMemoryEvent(event);
    if (!normalizedEvent.text || looksSensitive(normalizedEvent.text)) {
      console.log(`Skipped event ${event.id || "(no id)"}: missing text or looks sensitive.`);
      remaining.push(event);
      continue;
    }

    const localEventId = normalizedEvent.id || createId(normalizedEvent.text);
    if (knownIds.has(localEventId)) {
      synced++;
      continue;
    }

    const record = {
      id: createId(`memory:${localEventId}:${normalizedEvent.text}`),
      localEventId,
      ts: normalizedEvent.ts || new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      source: normalizedEvent.source || "unknown",
      text: String(normalizedEvent.text).trim(),
      metadata: normalizedEvent.metadata || {}
    };

    if (dryRun) {
      console.log(`[dry-run] Would index: ${record.text}`);
      synced++;
      continue;
    }

    appendJsonl(path.join(config.memoryDir, "memories", "ledger.jsonl"), record);
    newRecords.push(record);
    knownIds.add(localEventId);
    synced++;
  }

  if (!dryRun) {
    const updatedLedger = [...ledger, ...newRecords];
    rebuildMemoryOutputs(config, updatedLedger);
    writeJson(path.join(config.memoryDir, "state", "last-sync.json"), {
      syncedAt: new Date().toISOString(),
      indexed: newRecords.length,
      pending: remaining.length,
      backupDir: backup?.dir || ""
    });
    if (config.sync.archiveIndexedInboxItems !== false) {
      archiveInbox(config.memoryDir, events.filter((event) => !remaining.includes(event)));
    }
    writeInboxEvents(inboxPath, remaining);
  }

  console.log(`Indexed ${synced} memory event(s) into the local hub.`);
}

function indexCommand() {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "index", () => {
    const ledger = readLedger(config.memoryDir);
    rebuildMemoryOutputs(config, ledger);
    console.log(`Rebuilt memory index for ${ledger.length} record(s).`);
  }, config.sync.lockStaleMs);
}

function searchCommand(argv) {
  const query = positionalArgs(argv).join(" ").trim();
  if (!query) {
    throw new Error("Usage: ai-memory-hub search <query> [--limit 10]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const limit = Number(getOption(argv, "--limit") || 10);
  const index = buildMemoryIndex(readLedger(config.memoryDir), config);
  const results = searchMemories(index.records, query).slice(0, limit);
  for (const item of results) {
    const kind = item.metadata?.kind || "note";
    const topics = (item.topics || []).slice(0, 4).join(",");
    console.log(`[${item.score.toFixed(2)}] ${item.source}/${kind} ${topics ? `(${topics}) ` : ""}${item.text}`);
  }
}

function pullCommand() {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "pull", () => {
    const ledger = readLedger(config.memoryDir);
    const backup = backupHub(config.memoryDir, "pre-pull");
    rebuildMemoryOutputs(config, ledger);
    writeJson(path.join(config.memoryDir, "state", "last-pull.json"), {
      pulledAt: new Date().toISOString(),
      count: ledger.length,
      backupDir: backup.dir
    });

    console.log(`Rebuilt MEMORY.md, INDEX.md, and memories/index.json from ${ledger.length} local memory record(s).`);
  }, config.sync.lockStaleMs);
}

function backupCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const reason = getOption(argv, "--reason") || positionalArgs(argv).join(" ").trim() || "manual";
  const backup = withHubLock(config.memoryDir, "backup", () => backupHub(config.memoryDir, reason), config.sync.lockStaleMs);
  console.log(JSON.stringify(backup, null, 2));
}

function watchCommand(argv) {
  const intervalMs = Number(getOption(argv, "--interval-ms") || 30000);
  const config = loadConfig();
  ensureHub(config.memoryDir);

  console.log(`Watching ${path.join(config.memoryDir, "inbox")} every ${intervalMs}ms. Press Ctrl+C to stop.`);
  const tick = () => {
    try {
      const inboxPath = path.join(config.memoryDir, "inbox", "events.jsonl");
      const events = readEvents(inboxPath);
      if (events.length > 0) {
        syncCommand([]);
      }
    } catch (error) {
      console.error(`[watch] ${error.message || error}`);
    }
  };

  tick();
  setInterval(tick, intervalMs);
}

function appCommand(argv) {
  const host = getOption(argv, "--host") || "127.0.0.1";
  const port = Number(getOption(argv, "--port") || 38787);
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
        return sendStaticAsset(res, url.pathname);
      }
      if (req.method === "GET" && url.pathname === "/") {
        return sendHtml(res, renderDashboard());
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return sendJson(res, getStatusObject());
      }
      if (req.method === "GET" && url.pathname === "/api/memory") {
        const config = loadConfig();
        return sendJson(res, {
          memory: readTextIfExists(path.join(config.memoryDir, "MEMORY.md")),
          profile: readTextIfExists(path.join(config.memoryDir, "profile.md")),
          pending: readEvents(path.join(config.memoryDir, "inbox", "events.jsonl"))
        });
      }
      if (req.method === "GET" && url.pathname === "/api/radio") {
        const config = loadConfig();
        return sendJson(res, {
          messages: readRadioMessages(config.memoryDir).slice(-50)
        });
      }
      if (req.method === "GET" && url.pathname === "/api/tasks") {
        const config = loadConfig();
        const status = url.searchParams.get("status") || "all";
        return sendJson(res, {
          tasks: readTasks(config.memoryDir)
            .filter((task) => status === "all" ? true : status === "active" ? !["done", "cancelled"].includes(task.status) : task.status === status)
            .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
            .slice(0, 200)
        });
      }
      if (req.method === "GET" && url.pathname === "/api/dispatch") {
        const config = loadConfig();
        const relay = Object.values(readLatestRelayStatusByThread(config.memoryDir))
          .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
          .slice(0, 100);
        return sendJson(res, {
          logs: readDispatchLog(config.memoryDir).slice(-100).reverse(),
          relay
        });
      }
      if (req.method === "POST" && url.pathname === "/api/record") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        recordCommand([
          body.text,
          "--source",
          body.source || "dashboard",
          "--kind",
          body.kind || "note"
        ]);
        return sendJson(res, { ok: true, status: getStatusObject() });
      }
      if (req.method === "POST" && url.pathname === "/api/radio/send") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const config = loadConfig();
        const message = createRadioMessage({
          from: body.from || "dashboard",
          to: body.to || "all",
          type: body.type || "note",
          text: body.text,
          thread: body.thread || "",
          project: body.project || path.basename(process.cwd())
        });
        appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), message);
        return sendJson(res, { ok: true, message, status: getStatusObject() });
      }
      if (req.method === "POST" && url.pathname === "/api/task/add") {
        const body = await readRequestJson(req);
        if (!body.title || typeof body.title !== "string") {
          return sendJson(res, { error: "title is required" }, 400);
        }
        const config = loadConfig();
        let task;
        withHubLock(config.memoryDir, "task-add", () => {
          const tasks = readTasks(config.memoryDir);
          task = createTask({
            title: body.title,
            description: body.description || "",
            handoff: body.handoff || "",
            createdBy: body.from || "dashboard",
            project: body.project || path.basename(process.cwd()),
            priority: body.priority || "normal"
          });
          tasks.push(task);
          writeTasks(config.memoryDir, tasks);
        }, config.sync.lockStaleMs);
        return sendJson(res, { ok: true, task, status: getStatusObject() });
      }
      if (req.method === "POST" && url.pathname === "/api/task/claim") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const config = loadConfig();
        let task;
        withHubLock(config.memoryDir, "task-claim", () => {
          const by = body.by || "dashboard";
          task = updateTask(config.memoryDir, body.id, (current) => ({
            ...current,
            status: current.status === "open" ? "claimed" : current.status,
            assignee: by,
            updatedAt: new Date().toISOString(),
            notes: [
              ...(current.notes || []),
              createTaskNote(by, `Claimed by ${by}.`)
            ]
          }));
        }, config.sync.lockStaleMs);
        return sendJson(res, { ok: true, task, status: getStatusObject() });
      }
      if (req.method === "POST" && url.pathname === "/api/task/status") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.status || typeof body.status !== "string") {
          return sendJson(res, { error: "status is required" }, 400);
        }
        assertTaskStatus(body.status);
        const config = loadConfig();
        let task;
        withHubLock(config.memoryDir, "task-status", () => {
          const by = body.by || "dashboard";
          task = updateTask(config.memoryDir, body.id, (current) => {
            const notes = [...(current.notes || [])];
            if (body.note) {
              notes.push(createTaskNote(by, body.note));
            } else if (current.status !== body.status) {
              notes.push(createTaskNote(by, `Status changed to ${body.status}.`));
            }
            return {
              ...current,
              status: body.status,
              assignee: current.assignee || by,
              updatedAt: new Date().toISOString(),
              completedAt: body.status === "done" ? new Date().toISOString() : current.completedAt || "",
              notes
            };
          });
        }, config.sync.lockStaleMs);
        return sendJson(res, { ok: true, task, status: getStatusObject() });
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch/run") {
        const body = await readRequestJson(req);
        const config = loadConfig();
        const results = executeDispatch(config.memoryDir, {
          run: true,
          force: Boolean(body.force),
          to: body.to || "",
          project: body.project || "",
          limit: Number(body.limit || 10)
        });
        return sendJson(res, { ok: true, results, status: getStatusObject() });
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch/marvis") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const config = loadConfig();
        const from = body.from || "unknown";
        const project = body.project || path.basename(process.cwd());
        const dispatchType = body.type || "handoff";

        // Write to Agent Radio
        const message = createRadioMessage({
          from,
          to: "marvis",
          type: dispatchType,
          text: body.text,
          thread: body.thread || "",
          project
        });
        appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), message);

        // Also create a shared task
        let task;
        withHubLock(config.memoryDir, "task-add", () => {
          const tasks = readTasks(config.memoryDir);
          task = createTask({
            title: body.text.slice(0, 120),
            description: body.text,
            handoff: `Dispatched by ${from}${body.thread ? ` (thread: ${body.thread})` : ""}`,
            createdBy: from,
            project,
            priority: body.priority || "normal"
          });
          tasks.push(task);
          writeTasks(config.memoryDir, tasks);
        }, config.sync.lockStaleMs);

        return sendJson(res, {
          ok: true,
          message,
          task,
          hint: "Task sent to Marvis. It will be processed when the user asks Marvis to check AI Memory Hub."
        });
      }
      if (req.method === "POST" && url.pathname === "/api/radio/promote") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        radioPromoteCommand(["--id", body.id]);
        return sendJson(res, { ok: true, status: getStatusObject() });
      }
      if (req.method === "POST" && url.pathname === "/api/sync") {
        syncCommand([]);
        return sendJson(res, { ok: true, status: getStatusObject() });
      }
      if (req.method === "POST" && url.pathname === "/api/pull") {
        pullCommand([]);
        return sendJson(res, { ok: true, status: getStatusObject() });
      }
      if (req.method === "GET" && url.pathname === "/api/install/preview") {
        const toolName = url.searchParams.get("tool");
        const isLocal = url.searchParams.get("scope") === "local";
        const config = loadConfig();
        const targets = (isLocal 
          ? getLocalInstallTargets(process.cwd(), config.memoryDir) 
          : getInstallTargets(config.memoryDir)
        ).filter(t => t.tool === toolName);

        if (targets.length === 0) {
          return sendJson(res, { error: `No preview target for tool ${toolName}` }, 404);
        }
        const target = targets[0];
        const snippet = renderTemplate(target.template, {
          MEMORY_DIR: config.memoryDir,
          TOOL: target.tool
        });
        return sendJson(res, {
          tool: target.tool,
          file: target.file,
          snippet: snippet
        });
      }
      if (req.method === "POST" && url.pathname === "/api/install/apply") {
        const body = await readRequestJson(req);
        const toolName = body.tool;
        const isLocal = body.scope === "local";
        if (!toolName) {
          return sendJson(res, { error: "tool is required" }, 400);
        }
        const config = loadConfig();
        const targets = (isLocal 
          ? getLocalInstallTargets(process.cwd(), config.memoryDir) 
          : getInstallTargets(config.memoryDir)
        ).filter(t => t.tool === toolName);

        if (targets.length === 0) {
          return sendJson(res, { error: `No install targets for tool: ${toolName}` }, 404);
        }
        
        const target = targets[0];
        const snippet = renderTemplate(target.template, {
          MEMORY_DIR: config.memoryDir,
          TOOL: target.tool
        });
        
        ensureDir(path.dirname(target.file));
        appendIfMissing(target.file, snippet, "Shared AI Memory");
        return sendJson(res, { success: true, file: target.file });
      }
      return sendJson(res, { error: "not found" }, 404);
    } catch (error) {
      return sendJson(res, { error: error.message || String(error) }, 500);
    }
  });

  server.listen(port, host, () => {
    console.log(`AI Memory Hub app: http://${host}:${port}`);
  });
}

function installCommand(argv) {
  const tool = getOption(argv, "--tool") || "all";
  const apply = hasFlag(argv, "--apply");
  const isLocal = hasFlag(argv, "--local");
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const targets = (isLocal
    ? getLocalInstallTargets(process.cwd(), config.memoryDir)
    : getInstallTargets(config.memoryDir)
  ).filter((target) => tool === "all" || target.tool === tool);
  
  if (targets.length === 0) {
    throw new Error(`No install targets found for tool: ${tool}`);
  }

  for (const target of targets) {
    const snippet = renderTemplate(target.template, {
      MEMORY_DIR: config.memoryDir,
      TOOL: target.tool
    });
    if (!apply) {
      console.log(`\n[dry-run] ${target.tool}: ${target.file}`);
      console.log(snippet.trim());
      continue;
    }

    ensureDir(path.dirname(target.file));
    appendIfMissing(target.file, snippet, "Shared AI Memory");
    console.log(`Installed shared memory instructions for ${target.tool}: ${target.file}`);
  }
}

function helpCommand() {
  console.log(`Usage: ${APP_NAME} <command> [options]

Commands:
  init       Create ~/.ai-memory and config.
  detect     Detect installed AI tools.
  status     Show hub and tool status.
  record     Append a local memory event.
  radio      Send, list, and promote cross-agent radio messages.
  sync       Index pending inbox events into the local memory ledger.
  index      Rebuild MEMORY.md, INDEX.md, and the structured local index.
  search     Search indexed local memories.
  task       Share task/todo state across AI tools.
  workflow   Coordinate planner/executor/reviewer/observer work across AI tools.
  connect    Check tool connections or send a request/review/handoff to another tool.
  dispatch   Dispatch pending radio/task work to verified CLI runners.
  pull       Rebuild MEMORY.md from the local memory ledger.
  backup     Back up MEMORY.md, ledger, inbox, profile, radio, task, and workflow files.
  watch      Periodically index pending inbox events.
  app        Start the local dashboard app.
  install    Show or apply per-tool instruction snippets. Use --local to write rules in the current project directory.
  help       Show this help.

Examples:
  ${APP_NAME} init
  ${APP_NAME} record "User prefers concise answers." --source codex --kind preference
  ${APP_NAME} radio send "Please review the latest implementation." --from codex --to claude --type review
  ${APP_NAME} radio list --limit 10
  ${APP_NAME} radio promote --id <message-id>
  ${APP_NAME} sync --dry-run
  ${APP_NAME} sync
  ${APP_NAME} index
  ${APP_NAME} search "git commit rules" --limit 5
  ${APP_NAME} task add "Review README task-list section" --from codex --project ai-memory-hub --priority high
  ${APP_NAME} task list --status active
  ${APP_NAME} task claim --id <task-id> --by claude
  ${APP_NAME} task note --id <task-id> "Reviewed Chinese docs." --by qclaw
  ${APP_NAME} task done --id <task-id> --by codex
  ${APP_NAME} connect
  ${APP_NAME} connect --apply
  ${APP_NAME} connect request --from gemini --to codex --project ai-memory-hub --text "Please inspect the current task list." --task
  ${APP_NAME} workflow create "Review dashboard changes" --from codex --project ai-memory-hub --planner codex --executor opencode --reviewer qclaw --spawn-tasks --notify
  ${APP_NAME} workflow list --status active
  ${APP_NAME} dispatch --project ai-memory-hub
  ${APP_NAME} dispatch --to codex --run
  ${APP_NAME} pull
  ${APP_NAME} backup --reason manual
  ${APP_NAME} watch --interval-ms 30000
  ${APP_NAME} app --port 38787
  ${APP_NAME} install --tool codex
  ${APP_NAME} install --tool codex --apply
  ${APP_NAME} install --local --apply
`);
}

function defaultConfig(memoryDir) {
  return {
    memoryDir,
    sync: {
      archiveIndexedInboxItems: true,
      snapshotLimit: 200,
      coreLimit: 40,
      recentLimit: 20,
      lockStaleMs: 120000
    },
    tools: {
      codex: { enabled: true },
      codexApp: { enabled: true },
      claude: { enabled: true },
      claudeDesktop: { enabled: true },
      gemini: { enabled: true },
      antigravity: { enabled: true },
      antigravityCockpit: { enabled: true },
      marvis: { enabled: true },
      qclaw: { enabled: true },
      openclaw: { enabled: true },
      opencode: { enabled: true },
      cursor: { enabled: true },
      windsurf: { enabled: true },
      vscode: { enabled: true },
      continue: { enabled: true },
      cline: { enabled: true },
      rooCode: { enabled: true },
      trae: { enabled: true },
      kiro: { enabled: true },
      zed: { enabled: true },
      chatgpt: { enabled: true },
      ollama: { enabled: true },
      lmstudio: { enabled: true },
      jan: { enabled: true },
      anythingllm: { enabled: true },
      cherryStudio: { enabled: true },
      dify: { enabled: true },
      openWebui: { enabled: true },
      aider: { enabled: true },
      tabby: { enabled: true },
      codeium: { enabled: true },
      augment: { enabled: true },
      supermaven: { enabled: true }
    }
  };
}

function ensureHub(memoryDir) {
  for (const dir of [
    memoryDir,
    path.join(memoryDir, "inbox"),
    path.join(memoryDir, "synced"),
    path.join(memoryDir, "memories"),
    path.join(memoryDir, "radio"),
    path.join(memoryDir, "tasks"),
    path.join(memoryDir, "workflows"),
    path.join(memoryDir, "tools"),
    path.join(memoryDir, "backups"),
    path.join(memoryDir, "locks"),
    path.join(memoryDir, "state")
  ]) {
    ensureDir(dir);
  }

  const profilePath = path.join(memoryDir, "profile.md");
  if (!fs.existsSync(profilePath)) {
    fs.writeFileSync(profilePath, "# Profile\n\nAdd stable user preferences here.\n", "utf8");
  }

  const memoryPath = path.join(memoryDir, "MEMORY.md");
  if (!fs.existsSync(memoryPath)) {
    fs.writeFileSync(memoryPath, "# Shared AI Memory\n\nNo local memories indexed yet.\n", "utf8");
  }
}

function loadConfig() {
  const memoryDir = resolveMemoryDir();
  const configPath = path.join(memoryDir, "config.json");
  if (!fs.existsSync(configPath)) {
    ensureHub(memoryDir);
    writeJson(configPath, defaultConfig(memoryDir));
  }
  const config = readJson(configPath);
  const cleanConfig = { ...config };
  delete cleanConfig["m" + "e" + "m" + "0"];
  const base = defaultConfig(memoryDir);
  return {
    ...base,
    ...cleanConfig,
    memoryDir,
    sync: { ...base.sync, ...(config.sync || {}) },
    tools: { ...base.tools, ...(config.tools || {}) }
  };
}

function detectTools(memoryDir = resolveMemoryDir()) {
  const home = os.homedir();
  const checks = [
    {
      name: "codex",
      kind: "cli-config",
      dir: path.join(home, ".codex")
    },
    {
      name: "codex-app",
      kind: "app-state",
      dir: path.join(home, ".codex")
    },
    {
      name: "claude",
      kind: "cli-config",
      dir: path.join(home, ".claude")
    },
    {
      name: "claude-desktop",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Claude")
    },
    {
      name: "gemini",
      kind: "cli-config",
      dir: path.join(home, ".gemini")
    },
    {
      name: "antigravity",
      kind: "app-state",
      dir: path.join(home, ".antigravity")
    },
    {
      name: "antigravity-cockpit",
      kind: "app-state",
      dir: path.join(home, ".antigravity_cockpit")
    },
    {
      name: "antigravity-gemini",
      kind: "app-state",
      dir: path.join(home, ".gemini", "antigravity")
    },
    {
      name: "marvis",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Tencent", "Marvis")
    },
    {
      name: "qclaw",
      kind: "app-state",
      dir: path.join(home, ".qclaw")
    },
    {
      name: "openclaw",
      kind: "app-state",
      dir: path.join(home, ".openclaw")
    },
    {
      name: "cc-switch",
      kind: "app-state",
      dir: path.join(home, ".cc-switch")
    },
    {
      name: "opencode",
      kind: "skill-config",
      dir: path.join(home, ".config", "opencode")
    },
    {
      name: "cursor",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Cursor")
    },
    {
      name: "windsurf",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Windsurf")
    },
    {
      name: "vscode",
      kind: "editor-state",
      dir: path.join(home, "AppData", "Roaming", "Code")
    },
    {
      name: "continue",
      kind: "extension-state",
      dir: path.join(home, ".continue")
    },
    {
      name: "cline",
      kind: "extension-state",
      dir: path.join(home, "AppData", "Roaming", "Code", "User", "globalStorage", "saoudrizwan.claude-dev")
    },
    {
      name: "roo-code",
      kind: "extension-state",
      dir: path.join(home, "AppData", "Roaming", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline")
    },
    {
      name: "trae",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Trae")
    },
    {
      name: "kiro",
      kind: "app-state",
      dir: path.join(home, ".kiro")
    },
    {
      name: "zed",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Zed")
    },
    {
      name: "chatgpt",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "ChatGPT")
    },
    {
      name: "ollama",
      kind: "local-model-runtime",
      dir: path.join(home, ".ollama")
    },
    {
      name: "lmstudio",
      kind: "local-model-runtime",
      dir: path.join(home, ".lmstudio")
    },
    {
      name: "jan",
      kind: "local-model-runtime",
      dir: path.join(home, "jan")
    },
    {
      name: "anythingllm",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "anythingllm-desktop")
    },
    {
      name: "cherry-studio",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "CherryStudio")
    },
    {
      name: "dify",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Dify")
    },
    {
      name: "open-webui",
      kind: "app-state",
      dir: path.join(home, ".open-webui")
    },
    {
      name: "aider",
      kind: "cli-config",
      dir: path.join(home, ".aider")
    },
    {
      name: "tabby",
      kind: "extension-state",
      dir: path.join(home, ".tabby")
    },
    {
      name: "codeium",
      kind: "extension-state",
      dir: path.join(home, ".codeium")
    },
    {
      name: "augment",
      kind: "extension-state",
      dir: path.join(home, ".augment")
    },
    {
      name: "supermaven",
      kind: "extension-state",
      dir: path.join(home, ".supermaven")
    }
  ];

  return checks.map((check) => enrichToolConnection({
    name: check.name,
    kind: check.kind,
    installed: fs.existsSync(check.dir),
    dir: check.dir,
    files: fs.existsSync(check.dir) ? summarizeDir(check.dir) : []
  }, memoryDir));
}

function workflowCommand(argv) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "add":
    case "create":
      return workflowCreateCommand(actionArgs);
    case "list":
      return workflowListCommand(actionArgs);
    case "start":
      return workflowStatusCommand(["--status", "in_progress", ...actionArgs]);
    case "status":
      return workflowStatusCommand(actionArgs);
    case "result":
      return workflowAppendCommand(actionArgs, "results");
    case "review":
      return workflowAppendCommand(actionArgs, "reviews");
    case "signal":
      return workflowSignalCommand(actionArgs);
    case "done":
      return workflowStatusCommand(["--status", "done", ...actionArgs]);
    default:
      throw new Error("Usage: ai-memory-hub workflow <create|list|start|status|result|review|signal|done> ...");
  }
}

function workflowCreateCommand(argv) {
  const title = positionalArgs(argv).join(" ").trim();
  if (!title) {
    throw new Error("Usage: ai-memory-hub workflow create <title> [--from codex] [--project name] [--planner codex] [--executor claude] [--reviewer qclaw]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "workflow-create", () => {
    const workflows = readWorkflows(config.memoryDir);
    const workflow = createWorkflow({
      title,
      createdBy: getOption(argv, "--from") || getOption(argv, "--by") || "manual",
      project: getOption(argv, "--project") || path.basename(process.cwd()),
      priority: getOption(argv, "--priority") || "normal",
      planner: getOption(argv, "--planner") || "",
      executor: getOption(argv, "--executor") || "",
      reviewer: getOption(argv, "--reviewer") || "",
      observer: getOption(argv, "--observer") || "",
      plan: getOption(argv, "--plan") || "",
      acceptance: getOption(argv, "--acceptance") || ""
    });
    workflows.push(workflow);
    writeWorkflows(config.memoryDir, workflows);
    if (hasFlag(argv, "--spawn-tasks")) {
      spawnWorkflowTasks(config.memoryDir, workflow);
    }
    if (hasFlag(argv, "--notify")) {
      notifyWorkflowRoles(config.memoryDir, workflow);
    }
    const created = readWorkflows(config.memoryDir).find((item) => item.id === workflow.id) || workflow;
    console.log(JSON.stringify(created, null, 2));
  }, config.sync.lockStaleMs);
}

function workflowListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const status = getOption(argv, "--status") || "active";
  const project = getOption(argv, "--project") || "";
  const limit = Number(getOption(argv, "--limit") || 20);
  const workflows = readWorkflows(config.memoryDir)
    .filter((workflow) => status === "all" ? true : status === "active" ? !["done", "cancelled"].includes(workflow.status) : workflow.status === status)
    .filter((workflow) => project ? workflow.project === project : true)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, limit);
  console.log(JSON.stringify(workflows, null, 2));
}

function workflowStatusCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const status = getOption(argv, "--status") || positionalArgs(argv)[1] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id || !status) {
    throw new Error("Usage: ai-memory-hub workflow status --id <workflow-id> --status <open|planned|in_progress|review|blocked|done|cancelled> [--by codex]");
  }
  assertWorkflowStatus(status);
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "workflow-status", () => {
    const workflow = updateWorkflow(config.memoryDir, id, (current) => ({
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      completedAt: status === "done" ? new Date().toISOString() : current.completedAt || "",
      notes: [
        ...(current.notes || []),
        createTaskNote(by, `Status changed to ${status}.`)
      ]
    }));
    console.log(JSON.stringify(workflow, null, 2));
  }, config.sync.lockStaleMs);
}

function workflowAppendCommand(argv, field) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const args = positionalArgs(argv);
  const text = getOption(argv, "--text") || (getOption(argv, "--id") ? args.join(" ") : args.slice(1).join(" ")).trim();
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  const role = getOption(argv, "--role") || "";
  if (!id || !text) {
    throw new Error(`Usage: ai-memory-hub workflow ${field === "results" ? "result" : "review"} --id <workflow-id> [--role executor] <text> [--by codex]`);
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, `workflow-${field}`, () => {
    const workflow = updateWorkflow(config.memoryDir, id, (current) => ({
      ...current,
      status: field === "reviews" ? "review" : current.status,
      updatedAt: new Date().toISOString(),
      [field]: [
        ...(current[field] || []),
        { ts: new Date().toISOString(), by, role, text }
      ]
    }));
    console.log(JSON.stringify(workflow, null, 2));
  }, config.sync.lockStaleMs);
}

function workflowSignalCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const to = getOption(argv, "--to") || "";
  const args = positionalArgs(argv);
  const text = getOption(argv, "--text") || (getOption(argv, "--id") ? args.join(" ") : args.slice(1).join(" ")).trim();
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id || !to || !text) {
    throw new Error("Usage: ai-memory-hub workflow signal --id <workflow-id> --to <tool-or-role> <text> [--by codex]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const workflow = readWorkflows(config.memoryDir).find((item) => item.id === id || item.id.startsWith(id));
  if (!workflow) {
    throw new Error(`Workflow not found: ${id}`);
  }
  const message = createRadioMessage({
    from: by,
    to,
    type: "handoff",
    text: `[workflow:${workflow.id}] ${text}`,
    thread: workflow.id,
    project: workflow.project
  });
  appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), message);
  console.log(JSON.stringify(message, null, 2));
}

function enrichToolConnection(tool, memoryDir) {
  const target = getInstallTargetForTool(memoryDir, tool.name);
  const instructionFile = target?.file || path.join(memoryDir, "tools", `${tool.name}-shared-memory.md`);
  const configured = hasSharedMemoryInstructions(instructionFile);
  const runner = getToolRunner(tool.name);
  const connected = Boolean(tool.installed && configured);
  let connectionStatus = "missing";
  let action = "Install the tool first, then run ai-memory-hub connect --apply.";

  if (tool.installed && configured) {
    connectionStatus = runner.available ? "connected-runnable" : "connected-shared-state";
    action = runner.available
      ? "Ready for shared memory and verified dispatch runner."
      : "Ready for shared memory; no verified automatic runner yet.";
  } else if (tool.installed) {
    connectionStatus = "detected-unconfigured";
    action = `Run ai-memory-hub connect --apply or ai-memory-hub install --tool ${tool.name} --apply.`;
  } else if (configured) {
    connectionStatus = "preconfigured-missing";
    action = "Adapter note exists; install or launch the tool to use it.";
  }

  return {
    ...tool,
    configured,
    connected,
    connectionStatus,
    runnable: Boolean(runner.available),
    runnerReason: runner.available ? "" : runner.reason || "",
    instructionFile,
    action
  };
}

function hasSharedMemoryInstructions(file) {
  if (!file || !fs.existsSync(file)) {
    return false;
  }
  const text = fs.readFileSync(file, "utf8");
  return text.includes("Shared AI Memory") && (
    text.includes("ai-memory-hub") ||
    text.includes(".ai-memory") ||
    text.includes("AI Memory Hub")
  );
}

function summarizeToolConnections(tools) {
  return {
    total: tools.length,
    detected: tools.filter((tool) => tool.installed).length,
    configured: tools.filter((tool) => tool.configured).length,
    connected: tools.filter((tool) => tool.connected).length,
    runnable: tools.filter((tool) => tool.runnable).length,
    missing: tools.filter((tool) => !tool.installed).length,
    unconfiguredDetected: tools.filter((tool) => tool.installed && !tool.configured).length
  };
}

function getInstallTargetForTool(memoryDir, toolName) {
  return getInstallTargets(memoryDir).find((target) => target.tool === toolName) || null;
}

function getLocalInstallTargets(cwd, memoryDir) {
  return [
    {
      tool: "codex",
      file: path.join(cwd, "AGENTS.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "codex-app",
      file: path.join(cwd, "AGENTS.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "claude",
      file: path.join(cwd, "CLAUDE.md"),
      template: readTemplate("CLAUDE.md")
    },
    {
      tool: "claude-desktop",
      file: path.join(cwd, "CLAUDE.md"),
      template: readTemplate("CLAUDE.md")
    },
    {
      tool: "gemini",
      file: path.join(cwd, "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "antigravity",
      file: path.join(cwd, "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "antigravity-cockpit",
      file: path.join(cwd, "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "antigravity-gemini",
      file: path.join(cwd, "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "cursor",
      file: path.join(cwd, ".cursorrules"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "windsurf",
      file: path.join(cwd, ".windsurfrules"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "cline",
      file: path.join(cwd, ".clinerules"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "roo-code",
      file: path.join(cwd, ".clinerules"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "aider",
      file: path.join(cwd, ".aider.instructions.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "vscode",
      file: path.join(cwd, ".github", "copilot-instructions.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "chatgpt",
      file: path.join(cwd, "CHATGPT.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "ollama",
      file: path.join(cwd, "OLLAMA.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "cherry-studio",
      file: path.join(cwd, "CHERRY_STUDIO.md"),
      template: readTemplate("shared-instructions.md")
    }
  ];
}

function getInstallTargets(memoryDir) {
  const home = os.homedir();
  return [
    {
      tool: "codex",
      file: path.join(home, ".codex", "AGENTS.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "claude",
      file: path.join(home, ".claude", "CLAUDE.md"),
      template: readTemplate("CLAUDE.md")
    },
    {
      tool: "gemini",
      file: path.join(home, ".gemini", "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "antigravity",
      file: path.join(memoryDir, "tools", "antigravity-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "antigravity-cockpit",
      file: path.join(memoryDir, "tools", "antigravity-cockpit-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "antigravity-gemini",
      file: path.join(memoryDir, "tools", "antigravity-gemini-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "cc-switch",
      file: path.join(memoryDir, "tools", "cc-switch-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "codex-app",
      file: path.join(memoryDir, "tools", "codex-app-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "marvis",
      file: path.join(home, "AppData", "Roaming", "Tencent", "Marvis", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("MARVIS_SKILL.md")
    },
    {
      tool: "qclaw",
      file: path.join(home, ".qclaw", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("QCLAW_SKILL.md")
    },
    {
      tool: "openclaw",
      file: path.join(home, ".openclaw", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("OPENCLAW_SKILL.md")
    },
    {
      tool: "opencode",
      file: path.join(home, ".config", "opencode", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("OPENCODE_SKILL.md")
    },
    ...[
      "claude-desktop",
      "cursor",
      "windsurf",
      "vscode",
      "continue",
      "cline",
      "roo-code",
      "trae",
      "kiro",
      "zed",
      "chatgpt",
      "ollama",
      "lmstudio",
      "jan",
      "anythingllm",
      "cherry-studio",
      "dify",
      "open-webui",
      "aider",
      "tabby",
      "codeium",
      "augment",
      "supermaven"
    ].map((tool) => ({
      tool,
      file: path.join(memoryDir, "tools", `${tool}-shared-memory.md`),
      template: readTemplate("shared-instructions.md")
    }))
  ];
}

function renderDashboard() {
  return readTemplate("dashboard.html");
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(value, null, 2));
}

function sendStaticAsset(res, pathname) {
  const relativePath = pathname.replace(/^\/+/, "");
  const assetPath = path.join(projectRoot(), relativePath);
  const assetsRoot = path.join(projectRoot(), "assets");
  const normalizedAssetPath = path.resolve(assetPath);
  const normalizedAssetsRoot = path.resolve(assetsRoot);
  if (!normalizedAssetPath.startsWith(normalizedAssetsRoot + path.sep) && normalizedAssetPath !== normalizedAssetsRoot) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(normalizedAssetPath) || !fs.statSync(normalizedAssetPath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": getContentType(normalizedAssetPath),
    "Cache-Control": "public, max-age=31536000, immutable"
  });
  fs.createReadStream(normalizedAssetPath).pipe(res);
}

function getContentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function readTextIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function readLedger(memoryDir) {
  return readEvents(path.join(memoryDir, "memories", "ledger.jsonl"))
    .map((item) => ({
      id: item.id || createId(item.text || JSON.stringify(item)),
      localEventId: item.localEventId || item.local_event_id || "",
      ts: item.ts || item.createdAt || "",
      indexedAt: item.indexedAt || "",
      source: item.source || item.metadata?.source || "unknown",
      text: item.text || item.memory || "",
      metadata: item.metadata || {}
    }))
    .filter((item) => item.text);
}

function readTasks(memoryDir) {
  return readEvents(path.join(memoryDir, "tasks", "tasks.jsonl"))
    .map(normalizeTask)
    .filter((task) => task.id && task.title);
}

function writeTasks(memoryDir, tasks) {
  const file = path.join(memoryDir, "tasks", "tasks.jsonl");
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, tasks.map((task) => JSON.stringify(normalizeTask(task))).join("\n") + (tasks.length ? "\n" : ""), "utf8");
}

function readWorkflows(memoryDir) {
  return readEvents(path.join(memoryDir, "workflows", "workflows.jsonl"))
    .map(normalizeWorkflow)
    .filter((workflow) => workflow.id && workflow.title);
}

function writeWorkflows(memoryDir, workflows) {
  const file = path.join(memoryDir, "workflows", "workflows.jsonl");
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, workflows.map((workflow) => JSON.stringify(normalizeWorkflow(workflow))).join("\n") + (workflows.length ? "\n" : ""), "utf8");
}

function createWorkflow({ title, createdBy, project, priority, planner, executor, reviewer, observer, plan, acceptance }) {
  const now = new Date().toISOString();
  const cleanTitle = String(title || "").trim();
  return {
    id: createId(`workflow:${cleanTitle}:${createdBy}:${project}`),
    createdAt: now,
    updatedAt: now,
    completedAt: "",
    createdBy: String(createdBy || "manual"),
    status: "open",
    priority: normalizePriority(priority),
    project: String(project || ""),
    title: cleanTitle,
    planner: normalizeWorkflowRole(planner),
    executor: normalizeWorkflowRole(executor),
    reviewer: normalizeWorkflowRole(reviewer),
    observer: normalizeWorkflowRole(observer),
    plan: String(plan || ""),
    acceptance: String(acceptance || ""),
    risks: [],
    results: [],
    reviews: [],
    linkedTasks: [],
    linkedRadio: [],
    notes: []
  };
}

function updateWorkflow(memoryDir, id, updater) {
  const workflows = readWorkflows(memoryDir);
  const index = findWorkflowIndex(workflows, id);
  if (index === -1) {
    throw new Error(`Workflow not found: ${id}`);
  }
  const updated = normalizeWorkflow(updater(workflows[index]));
  workflows[index] = updated;
  writeWorkflows(memoryDir, workflows);
  return updated;
}

function findWorkflowIndex(workflows, id) {
  const exact = workflows.findIndex((workflow) => workflow.id === id);
  if (exact !== -1) {
    return exact;
  }
  const matches = workflows
    .map((workflow, index) => ({ workflow, index }))
    .filter((item) => item.workflow.id.startsWith(id));
  return matches.length === 1 ? matches[0].index : -1;
}

function spawnWorkflowTasks(memoryDir, workflow) {
  const tasks = readTasks(memoryDir);
  const linkedTasks = [];
  for (const [role, assignees] of Object.entries({
    planner: workflow.planner,
    executor: workflow.executor,
    reviewer: workflow.reviewer,
    observer: workflow.observer
  })) {
    for (const assignee of assignees || []) {
      const task = {
        ...createTask({
          title: `[workflow:${workflow.id}] ${role}: ${workflow.title}`,
          description: workflow.plan || workflow.acceptance || "",
          handoff: `Workflow ${workflow.id}; role=${role}`,
          createdBy: workflow.createdBy,
          project: workflow.project,
          priority: workflow.priority
        }),
        assignee,
        status: "claimed"
      };
      tasks.push(task);
      linkedTasks.push(task.id);
    }
  }
  writeTasks(memoryDir, tasks);
  updateWorkflow(memoryDir, workflow.id, (current) => ({ ...current, linkedTasks }));
}

function notifyWorkflowRoles(memoryDir, workflow) {
  const recipients = new Set([
    ...(workflow.planner || []),
    ...(workflow.executor || []),
    ...(workflow.reviewer || []),
    ...(workflow.observer || [])
  ].filter(Boolean));
  const linkedRadio = [];
  for (const to of recipients) {
    const message = createRadioMessage({
      from: workflow.createdBy,
      to,
      type: "handoff",
      text: `[workflow:${workflow.id}] ${workflow.title}`,
      thread: workflow.id,
      project: workflow.project
    });
    appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), message);
    linkedRadio.push(message.id);
  }
  updateWorkflow(memoryDir, workflow.id, (current) => ({ ...current, linkedRadio }));
}

function normalizeWorkflow(workflow) {
  const now = new Date().toISOString();
  const status = isWorkflowStatus(workflow.status) ? workflow.status : "open";
  return {
    id: workflow.id || createId(`workflow:${workflow.title || JSON.stringify(workflow)}`),
    createdAt: workflow.createdAt || workflow.ts || now,
    updatedAt: workflow.updatedAt || workflow.createdAt || workflow.ts || now,
    completedAt: workflow.completedAt || "",
    createdBy: workflow.createdBy || workflow.created_by || workflow.source || "unknown",
    status,
    priority: normalizePriority(workflow.priority || "normal"),
    project: workflow.project || "",
    title: workflow.title || workflow.text || "",
    planner: normalizeWorkflowRole(workflow.planner),
    executor: normalizeWorkflowRole(workflow.executor),
    reviewer: normalizeWorkflowRole(workflow.reviewer),
    observer: normalizeWorkflowRole(workflow.observer),
    plan: workflow.plan || "",
    acceptance: workflow.acceptance || "",
    risks: Array.isArray(workflow.risks) ? workflow.risks : [],
    results: Array.isArray(workflow.results) ? workflow.results : [],
    reviews: Array.isArray(workflow.reviews) ? workflow.reviews : [],
    linkedTasks: Array.isArray(workflow.linkedTasks) ? workflow.linkedTasks : [],
    linkedRadio: Array.isArray(workflow.linkedRadio) ? workflow.linkedRadio : [],
    notes: Array.isArray(workflow.notes) ? workflow.notes : []
  };
}

function normalizeWorkflowRole(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function createTask({ title, description, handoff, createdBy, project, priority }) {
  const now = new Date().toISOString();
  const cleanTitle = String(title || "").trim();
  const cleanPriority = normalizePriority(priority);
  return {
    id: createId(`task:${cleanTitle}:${createdBy}:${project}`),
    createdAt: now,
    updatedAt: now,
    completedAt: "",
    createdBy: String(createdBy || "manual"),
    assignee: "",
    status: "open",
    priority: cleanPriority,
    project: String(project || ""),
    title: cleanTitle,
    description: String(description || ""),
    handoff: String(handoff || ""),
    notes: []
  };
}

function updateTask(memoryDir, id, updater) {
  const tasks = readTasks(memoryDir);
  const index = findTaskIndex(tasks, id);
  if (index === -1) {
    throw new Error(`Task not found: ${id}`);
  }
  const updated = normalizeTask(updater(tasks[index]));
  tasks[index] = updated;
  writeTasks(memoryDir, tasks);
  return updated;
}

function normalizeTask(task) {
  const now = new Date().toISOString();
  const status = isTaskStatus(task.status) ? task.status : "open";
  return {
    id: task.id || createId(`task:${task.title || JSON.stringify(task)}`),
    createdAt: task.createdAt || task.ts || now,
    updatedAt: task.updatedAt || task.createdAt || task.ts || now,
    completedAt: task.completedAt || "",
    createdBy: task.createdBy || task.created_by || task.source || "unknown",
    assignee: task.assignee || "",
    status,
    priority: normalizePriority(task.priority || "normal"),
    project: task.project || "",
    title: task.title || task.text || "",
    description: task.description || "",
    handoff: task.handoff || "",
    notes: Array.isArray(task.notes) ? task.notes.map((note) => ({
      ts: note.ts || note.createdAt || now,
      by: note.by || note.source || "unknown",
      text: String(note.text || "")
    })).filter((note) => note.text) : []
  };
}

function findTaskIndex(tasks, id) {
  const exact = tasks.findIndex((task) => task.id === id);
  if (exact !== -1) {
    return exact;
  }
  const matches = tasks
    .map((task, index) => ({ task, index }))
    .filter((item) => item.task.id.startsWith(id));
  return matches.length === 1 ? matches[0].index : -1;
}

function createTaskNote(by, text) {
  return {
    ts: new Date().toISOString(),
    by: String(by || "unknown"),
    text: String(text || "").trim()
  };
}

function assertTaskStatus(status) {
  if (!isTaskStatus(status)) {
    throw new Error(`Invalid task status: ${status}`);
  }
}

function assertWorkflowStatus(status) {
  if (!isWorkflowStatus(status)) {
    throw new Error(`Invalid workflow status: ${status}`);
  }
}

function isTaskStatus(status) {
  return new Set(["open", "claimed", "in_progress", "blocked", "done", "cancelled"]).has(status);
}

function isWorkflowStatus(status) {
  return new Set(["open", "planned", "in_progress", "review", "blocked", "done", "cancelled"]).has(status);
}

function normalizePriority(priority) {
  const clean = String(priority || "normal").toLowerCase();
  return ["low", "normal", "high", "urgent"].includes(clean) ? clean : "normal";
}

function rebuildMemoryOutputs(config, ledger) {
  const index = buildMemoryIndex(ledger, config);
  fs.writeFileSync(path.join(config.memoryDir, "MEMORY.md"), renderMemorySnapshot(index, config), "utf8");
  fs.writeFileSync(path.join(config.memoryDir, "INDEX.md"), renderIndexMarkdown(index), "utf8");
  writeJson(path.join(config.memoryDir, "memories", "index.json"), index);
}

function buildMemoryIndex(memories, config) {
  const sorted = [...memories].sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  const records = sorted.map((memory, index) => enrichMemory(memory, index, sorted.length));
  const stats = {
    records: records.length,
    core: records.filter((item) => item.layer === "core").length,
    working: records.filter((item) => item.layer === "working").length,
    archive: records.filter((item) => item.layer === "archive").length,
    snapshotCoreLimit: Number(config.sync?.coreLimit || 40),
    snapshotRecentLimit: Number(config.sync?.recentLimit || 20),
    rebuiltAt: new Date().toISOString()
  };
  return {
    version: 1,
    memoryDir: config.memoryDir,
    stats,
    topics: countBy(records.flatMap((item) => item.topics)),
    kinds: countBy(records.map((item) => item.metadata?.kind || "note")),
    sources: countBy(records.map((item) => item.source || "unknown")),
    records
  };
}

function enrichMemory(memory, ordinal, total) {
  const metadata = memory.metadata || {};
  const kind = metadata.kind || "note";
  const topics = inferTopics(memory);
  const importance = scoreImportance(memory, topics, ordinal, total);
  const layer = chooseMemoryLayer(kind, importance);
  return {
    ...memory,
    metadata: {
      ...metadata,
      kind
    },
    layer,
    importance,
    scope: inferScope(kind, topics),
    topics,
    keywords: extractKeywords(`${memory.text} ${(topics || []).join(" ")}`)
  };
}

function renderMemorySnapshot(index, config) {
  const coreLimit = Number(config.sync?.coreLimit || 40);
  const recentLimit = Number(config.sync?.recentLimit || 20);
  const core = index.records
    .filter((item) => item.layer === "core")
    .sort(sortByImportance)
    .slice(0, coreLimit);
  const recent = [...index.records]
    .filter((item) => item.layer !== "core")
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
    .slice(0, recentLimit);
  const lines = [
    "# Shared AI Memory",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "This snapshot is intentionally short. Full local history is in `memories/ledger.jsonl`; structured search data is in `memories/index.json`; readable grouped index is in `INDEX.md`.",
    "",
    "Use `ai-memory-hub search <query> --limit 10` when task-specific context is needed.",
    "",
    "## Core Memory",
    ""
  ];
  if (index.records.length === 0) {
    lines.push("No memories found.");
    lines.push("");
    return lines.join("\n");
  }

  for (const memory of core) {
    lines.push(renderMemoryLine(memory));
  }
  lines.push("");
  lines.push("## Recent Working Context");
  lines.push("");
  for (const memory of recent) {
    lines.push(renderMemoryLine(memory));
  }
  lines.push("");
  lines.push("## Index Summary");
  lines.push("");
  lines.push(`- Records: ${index.stats.records}; core: ${index.stats.core}; working: ${index.stats.working}; archive: ${index.stats.archive}.`);
  lines.push(`- Top topics: ${index.topics.slice(0, 12).map((item) => `${item.key}(${item.count})`).join(", ") || "none"}.`);
  lines.push("");
  return lines.join("\n");
}

function renderIndexMarkdown(index) {
  const lines = [
    "# Shared AI Memory Index",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "## Stats",
    "",
    `- Records: ${index.stats.records}`,
    `- Core: ${index.stats.core}`,
    `- Working: ${index.stats.working}`,
    `- Archive: ${index.stats.archive}`,
    "",
    "## Top Topics",
    ""
  ];
  for (const item of index.topics.slice(0, 40)) {
    lines.push(`- ${item.key}: ${item.count}`);
  }
  lines.push("");
  for (const layer of ["core", "working", "archive"]) {
    lines.push(`## ${titleCase(layer)} Records`);
    lines.push("");
    const records = index.records
      .filter((item) => item.layer === layer)
      .sort(layer === "core" ? sortByImportance : (a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
    for (const memory of records) {
      lines.push(renderMemoryLine(memory));
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderMemoryLine(memory) {
  const kind = memory.metadata?.kind ? `/${memory.metadata.kind}` : "";
  const topics = memory.topics?.length ? ` topics=${memory.topics.slice(0, 5).join(",")}` : "";
  return `- [${memory.source}${kind} score=${memory.importance}${topics}] ${memory.text}`;
}

function expandSynonyms(terms) {
  const synonyms = [
    ["feishu", "飞书", "lark", "lark-feishu"],
    ["git", "github", "gitee"],
    ["wechat", "微信", "wx", "wechat-mini-game"],
    ["game", "游戏", "play"],
    ["task", "任务", "todo"],
    ["workflow", "工作流", "collaboration"],
    ["memory", "记忆", "hub"]
  ];
  const expanded = new Set(terms);
  for (const term of terms) {
    for (const group of synonyms) {
      if (group.includes(term)) {
        for (const word of group) {
          expanded.add(word);
        }
      }
    }
  }
  return [...expanded];
}

function searchMemories(records, query) {
  const queryTerms = extractKeywords(query);
  const queryNgrams = extractSearchTerms(query);
  const queryNormalized = normalizeSearchText(query);
  return records
    .map((memory) => {
      const text = String(memory.text || "");
      const haystack = new Set([
        ...extractKeywords(text),
        ...(memory.keywords || []),
        ...(memory.topics || []),
        memory.source || "",
        memory.metadata?.kind || ""
      ]);
      const searchTerms = new Set([
        ...extractSearchTerms(text),
        ...extractSearchTerms((memory.topics || []).join(" ")),
        ...extractSearchTerms(memory.source || ""),
        ...extractSearchTerms(memory.metadata?.kind || "")
      ]);
      const normalizedText = normalizeSearchText(text);
      const normalizedJoinedKeywords = normalizeSearchText([
        ...haystack,
        ...searchTerms
      ].join(" "));
      let score = 0;
      const expandedTerms = expandSynonyms(queryTerms);
      for (const term of expandedTerms) {
        if (haystack.has(term)) {
          score += 4;
        } else if (searchTerms.has(term)) {
          score += 3;
        } else if (normalizedText.includes(normalizeSearchText(term))) {
          score += 2;
        }
      }
      for (const term of queryNgrams) {
        if (!term) continue;
        if (searchTerms.has(term)) {
          score += term.length >= 4 ? 2.5 : 1.5;
        } else if (normalizedText.includes(term) || normalizedJoinedKeywords.includes(term)) {
          score += term.length >= 4 ? 2 : 1;
        }
      }
      if (queryNormalized && normalizedText.includes(queryNormalized)) {
        score += queryNormalized.length >= 6 ? 8 : 5;
      } else if (queryNormalized && normalizedJoinedKeywords.includes(queryNormalized)) {
        score += 3;
      }
      for (const topic of memory.topics || []) {
        for (const term of expandedTerms) {
          if (topic.includes(term) || term.includes(topic)) {
            score += 5;
          }
        }
      }
      score += Number(memory.importance || 0) / 100;
      return { ...memory, score };
    })
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score);
}

function chooseMemoryLayer(kind, importance) {
  if (["preference", "workflow", "correction"].includes(kind) || importance >= 70) {
    return "core";
  }
  if (["project", "lesson", "reference"].includes(kind) || importance >= 45) {
    return "working";
  }
  return "archive";
}

function scoreImportance(memory, topics, ordinal, total) {
  const text = String(memory.text || "");
  const kind = memory.metadata?.kind || "note";
  let score = 20;
  if (["preference", "workflow", "correction"].includes(kind)) score += 45;
  if (["project", "lesson"].includes(kind)) score += 30;
  if (["reference", "raw", "note"].includes(kind)) score += 10;
  if (/must|always|never|必须|不要|偏好|规范|规则|纠错|红线|合规|错误|lesson/i.test(text)) score += 18;
  if (/github|git|lark|feishu|qclaw|claude|codex|opencode|memory|飞书|微信|小游戏/i.test(text)) score += 8;
  if (topics.length > 0) score += Math.min(10, topics.length * 2);
  const recency = total > 0 ? ordinal / total : 0;
  score += Math.round(recency * 8);
  return Math.max(1, Math.min(100, score));
}

function inferScope(kind, topics) {
  if (kind === "preference") return "user";
  if (kind === "workflow" || kind === "correction" || kind === "lesson") return "workflow";
  if (topics.includes("ai-memory-hub")) return "memory-hub";
  if (topics.includes("game") || topics.includes("wechat-mini-game")) return "project";
  return "general";
}

function inferTopics(memory) {
  const text = `${memory.text || ""} ${(memory.metadata?.tags || []).join(" ")}`.toLowerCase();
  const topics = [];
  const rules = [
    ["ai-memory-hub", /ai-memory|shared memory|memory hub|agent radio|opencode|qclaw|claude|codex|gemini|共享记忆|本地记忆/],
    ["game", /game|unity|mahjong|match|西游|麻将|小游戏|策划|关卡|体力|广告|分享/],
    ["wechat-mini-game", /wechat|微信|小游戏|wx\.|sendgift|红包|开放能力/],
    ["lark-feishu", /lark|feishu|飞书|多维表格|任务|文档|lark-cli/],
    ["git", /git|github|gitee|commit|提交/],
    ["team", /team|member|role|团队|成员|pm|planner|dev|art/],
    ["automation", /automation|daemon|watcher|script|自动|脚本|后台|签到/],
    ["docs", /readme|doc|文档|prd|gdd|策划文档/],
    ["security", /secret|password|token|key|合规|隐私|上传|ignore|gitignore/]
  ];
  for (const [topic, pattern] of rules) {
    if (pattern.test(text)) topics.push(topic);
  }
  return [...new Set(topics)];
}

function extractKeywords(text) {
  const normalized = normalizeSearchText(text);
  const latin = normalized.match(/[a-z0-9][a-z0-9_.-]{1,}/g) || [];
  const cjk = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const ngrams = extractCjkNgrams(normalized);
  const stop = new Set(["the", "and", "for", "with", "when", "this", "that", "into", "from", "should", "memory", "local"]);
  return [...new Set([...latin, ...cjk, ...ngrams].filter((term) => term && !stop.has(term)).slice(0, 120))];
}

function extractSearchTerms(text) {
  const normalized = normalizeSearchText(text);
  return [...new Set([
    ...extractKeywords(normalized),
    ...extractCompactVariants(normalized)
  ])];
}

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u3000\s]+/g, " ")
    .trim();
}

function extractCompactVariants(text) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  const compact = normalized.replace(/[\s`~!@#$%^&*()\-_=+\[\]{}\\|;:'",<.>/?。，、；：！？（）【】《》“”‘’]+/g, "");
  return compact && compact !== normalized ? [compact] : [];
}

function extractCjkNgrams(text) {
  const chunks = String(text || "").match(/[\u4e00-\u9fff]{2,}/g) || [];
  const grams = [];
  for (const chunk of chunks) {
    if (chunk.length <= 4) {
      grams.push(chunk);
      continue;
    }
    for (let size = 2; size <= 3; size++) {
      for (let index = 0; index <= chunk.length - size; index++) {
        grams.push(chunk.slice(index, index + size));
      }
    }
    grams.push(chunk);
  }
  return grams;
}

function countBy(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function sortByImportance(a, b) {
  return Number(b.importance || 0) - Number(a.importance || 0) || String(b.ts || "").localeCompare(String(a.ts || ""));
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (char) => char.toUpperCase());
}

function archiveInbox(memoryDir, events) {
  if (events.length === 0) {
    return;
  }
  const archiveName = `events-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const archivePath = path.join(memoryDir, "synced", archiveName);
  fs.writeFileSync(archivePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
}

function writeInboxEvents(inboxPath, events) {
  ensureDir(path.dirname(inboxPath));
  fs.writeFileSync(inboxPath, events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : ""), "utf8");
}

function backupHub(memoryDir, reason) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeReason = String(reason || "manual").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 48) || "manual";
  const backupDir = path.join(memoryDir, "backups", `${stamp}-${safeReason}`);
  ensureDir(backupDir);

  const files = [
    ["MEMORY.md", path.join(memoryDir, "MEMORY.md")],
    ["profile.md", path.join(memoryDir, "profile.md")],
    ["inbox-events.jsonl", path.join(memoryDir, "inbox", "events.jsonl")],
    ["memory-ledger.jsonl", path.join(memoryDir, "memories", "ledger.jsonl")],
    ["radio-messages.jsonl", path.join(memoryDir, "radio", "messages.jsonl")],
    ["tasks.jsonl", path.join(memoryDir, "tasks", "tasks.jsonl")],
    ["workflows.jsonl", path.join(memoryDir, "workflows", "workflows.jsonl")],
    ["config.json", path.join(memoryDir, "config.json")]
  ];

  const copied = [];
  for (const [name, source] of files) {
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(backupDir, name));
      copied.push(name);
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    reason,
    dir: backupDir,
    files: copied
  };
  writeJson(path.join(backupDir, "manifest.json"), manifest);
  return manifest;
}

function withHubLock(memoryDir, owner, fn, staleMs = 120000) {
  const lockPath = path.join(memoryDir, "locks", "hub.lock");
  ensureDir(path.dirname(lockPath));
  acquireLock(lockPath, owner, staleMs);
  try {
    return fn();
  } finally {
    releaseLock(lockPath, owner);
  }
}

function acquireLock(lockPath, owner, staleMs) {
  const started = Date.now();
  while (Date.now() - started < staleMs) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      const payload = {
        owner,
        pid: process.pid,
        createdAt: new Date().toISOString(),
        host: os.hostname(),
        cwd: process.cwd(),
        staleMs
      };
      fs.writeFileSync(fd, JSON.stringify(payload, null, 2));
      fs.closeSync(fd);
      appendLockEvent(lockPath, {
        type: "acquired",
        owner,
        pid: process.pid,
        host: os.hostname()
      });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (isLockStale(lockPath, staleMs)) {
        try {
          const staleInfo = readLockFile(lockPath);
          fs.unlinkSync(lockPath);
          appendLockEvent(lockPath, {
            type: "stale-reaped",
            owner,
            pid: process.pid,
            staleLock: staleInfo
          });
          continue;
        } catch {
          // Another process may have removed it first; retry.
        }
      }
      sleep(100);
    }
  }
  const status = describeLock(lockPath, staleMs);
  throw new Error(`Memory hub lock timeout at ${lockPath} (owner=${status.owner || "unknown"}, pid=${status.pid || "unknown"}, ageMs=${status.ageMs ?? "unknown"}, stale=${status.stale ? "yes" : "no"})`);
}

function releaseLock(lockPath, owner = "") {
  try {
    fs.unlinkSync(lockPath);
    appendLockEvent(lockPath, {
      type: "released",
      owner: owner || "unknown",
      pid: process.pid,
      host: os.hostname()
    });
  } catch {
    // Lock may already be removed if it was considered stale.
  }
}

function isLockStale(lockPath, staleMs) {
  try {
    const status = describeLock(lockPath, staleMs);
    return Boolean(status.stale);
  } catch {
    return false;
  }
}

function readLockStatus(memoryDir) {
  const lockPath = path.join(memoryDir, "locks", "hub.lock");
  if (!fs.existsSync(lockPath)) {
    return {
      locked: false,
      path: lockPath,
      events: readLockEvents(memoryDir).slice(-10)
    };
  }
  return {
    locked: true,
    ...describeLock(lockPath, loadConfig().sync.lockStaleMs),
    events: readLockEvents(memoryDir).slice(-10)
  };
}

function describeLock(lockPath, staleMs) {
  const data = readLockFile(lockPath);
  const stat = fs.existsSync(lockPath) ? fs.statSync(lockPath) : null;
  const createdAt = data.createdAt || "";
  const createdMs = createdAt ? Date.parse(createdAt) : NaN;
  const ageMs = Number.isNaN(createdMs)
    ? (stat ? Math.max(0, Math.round(Date.now() - stat.mtimeMs)) : null)
    : Math.max(0, Date.now() - createdMs);
  return {
    path: lockPath,
    owner: data.owner || "",
    pid: data.pid || null,
    host: data.host || "",
    cwd: data.cwd || "",
    createdAt,
    ageMs,
    staleMs,
    stale: ageMs !== null ? ageMs > staleMs : false,
    parseError: data.parseError || ""
  };
}

function readLockFile(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return {};
  }
  try {
    return readJson(lockPath);
  } catch (error) {
    return { parseError: error.message || String(error) };
  }
}

function readLockEvents(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "lock-events.jsonl"));
}

function appendLockEvent(lockPath, payload) {
  const memoryDir = path.resolve(lockPath, "..", "..");
  appendJsonl(path.join(memoryDir, "state", "lock-events.jsonl"), {
    id: createId(`lock:${payload.type}:${payload.owner || ""}:${Date.now()}`),
    ts: new Date().toISOString(),
    path: lockPath,
    ...payload
  });
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Short synchronous wait keeps the CLI dependency-free.
  }
}

function looksSensitive(text) {
  return /\b(sk-[A-Za-z0-9_-]{12,}|api[_-]?key|password|secret|token)\b/i.test(text);
}

function normalizeMemoryEvent(event) {
  const text = event.text ?? event.content ?? event.memory ?? "";
  const metadata = {
    ...(event.metadata || {})
  };
  if (!metadata.kind && event.type) {
    metadata.kind = event.type;
  }
  if (event.tags && !metadata.tags) {
    metadata.tags = event.tags;
  }
  return {
    id: event.id || "",
    ts: event.ts || event.timestamp || event.createdAt || "",
    source: event.source || metadata.source || "unknown",
    text: String(text || "").trim(),
    metadata
  };
}

function readEvents(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return {
          id: createId(line),
          ts: new Date().toISOString(),
          source: "raw",
          text: line,
          metadata: { kind: "raw" }
        };
      }
    });
}

function createRadioMessage({ from, to, type, text, thread, replyTo, project }) {
  const cleanText = String(text || "").trim();
  return {
    id: createId(`radio:${from}:${to}:${type}:${cleanText}`),
    ts: new Date().toISOString(),
    from: String(from || "unknown"),
    to: String(to || "all"),
    type: String(type || "note"),
    text: cleanText,
    thread: String(thread || ""),
    replyTo: String(replyTo || ""),
    project: String(project || ""),
    promoted: false
  };
}

function readRadioMessages(memoryDir) {
  const file = path.join(memoryDir, "radio", "messages.jsonl");
  return readEvents(file).map((message) => ({
    id: message.id || createId(JSON.stringify(message)),
    ts: message.ts || "",
    from: message.from || message.source || "unknown",
    to: message.to || "all",
    type: message.type || message.metadata?.kind || "note",
    text: message.text || "",
    thread: message.thread || "",
    replyTo: message.replyTo || message.reply_to || "",
    project: message.project || "",
    promoted: Boolean(message.promoted),
    promotedAt: message.promotedAt || ""
  }));
}

function updateRadioMessage(memoryDir, id, patch) {
  const file = path.join(memoryDir, "radio", "messages.jsonl");
  const messages = readRadioMessages(memoryDir).map((message) => (
    message.id === id ? { ...message, ...patch } : message
  ));
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, messages.map((message) => JSON.stringify(message)).join("\n") + (messages.length ? "\n" : ""), "utf8");
}

function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function appendIfMissing(file, snippet, marker) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (
    existing.includes(marker) &&
    existing.includes("Shared Agent Radio") &&
    existing.includes("Shared Task List") &&
    existing.includes("Shared Workflows") &&
    existing.includes("Contact Other AI Tools")
  ) {
    return;
  }
  if (existing.includes(marker)) {
    const sections = [];
    if (!existing.includes("Shared Task List")) {
      sections.push(extractSection(snippet, "## Shared Task List", "## Shared Workflows"));
    }
    if (!existing.includes("Shared Workflows")) {
      sections.push(extractSection(snippet, "## Shared Workflows", "## Shared Agent Radio"));
    }
    if (!existing.includes("Shared Agent Radio")) {
      sections.push(extractSectionBeforeAny(snippet, "## Shared Agent Radio", [
        "## Contact Other AI Tools",
        "## Commands",
        "## Calling Marvis",
        "## Other AI Tools Calling Marvis"
      ]));
    }
    if (!existing.includes("Contact Other AI Tools")) {
      sections.push(extractSectionBeforeAny(snippet, "## Contact Other AI Tools", [
        "## Commands",
        "## Calling Marvis",
        "## Other AI Tools Calling Marvis"
      ]));
    }
    const addition = sections.filter(Boolean).map((section) => section.trim()).join("\n\n");
    if (addition) {
      const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : "";
      fs.writeFileSync(file, `${prefix}${addition}\n`, "utf8");
    }
    return;
  }
  const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : "";
  fs.writeFileSync(file, `${prefix}${snippet.trim()}\n`, "utf8");
}

function extractSection(text, heading, nextHeading = "") {
  const index = text.indexOf(heading);
  if (index === -1) {
    return "";
  }
  if (!nextHeading) {
    return text.slice(index);
  }
  const nextIndex = text.indexOf(nextHeading, index + heading.length);
  return nextIndex === -1 ? text.slice(index) : text.slice(index, nextIndex);
}

function extractSectionBeforeAny(text, heading, nextHeadings = []) {
  const index = text.indexOf(heading);
  if (index === -1) {
    return "";
  }
  let nextIndex = text.length;
  for (const nextHeading of nextHeadings) {
    const found = text.indexOf(nextHeading, index + heading.length);
    if (found !== -1 && found < nextIndex) {
      nextIndex = found;
    }
  }
  return text.slice(index, nextIndex);
}

function readTemplate(name) {
  return fs.readFileSync(path.join(projectRoot(), "templates", name), "utf8");
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key] || "");
}

function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function createId(input) {
  return crypto.createHash("sha256")
    .update(`${Date.now()}:${input}`)
    .digest("hex")
    .slice(0, 16);
}

function getOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return "";
  }
  return argv[index + 1] || "";
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function positionalArgs(argv) {
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      index++;
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

function countJsonlFiles(dir) {
  if (!fs.existsSync(dir)) {
    return 0;
  }
  return fs.readdirSync(dir).filter((file) => file.endsWith(".jsonl")).length;
}

function countBackupDirs(memoryDir) {
  const dir = path.join(memoryDir, "backups");
  if (!fs.existsSync(dir)) {
    return 0;
  }
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

function summarizeDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .slice(0, 12)
      .map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name);
  } catch {
    return [];
  }
}

function commandExists(commandName) {
  const checker = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [commandName] : ["-v", commandName];
  const result = spawnSync(checker, args, {
    encoding: "utf8",
    windowsHide: true
  });
  return result.status === 0;
}

function trimOutput(value, limit = 4000) {
  const text = String(value || "").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n...[truncated]`;
}

function summarizeText(value, limit = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }
  const safeLimit = Math.max(0, Number(limit) || 0);
  return `${text.slice(0, Math.max(0, safeLimit - 3)).trimEnd()}...`;
}
