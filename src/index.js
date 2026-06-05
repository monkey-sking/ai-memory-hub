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
  const backups = countBackupDirs(memoryDir);
  const lock = readLockStatus(memoryDir);
  const tools = detectTools();

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
    backups,
    lock,
    tools
  };
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
  const run = hasFlag(argv, "--run");
  const force = hasFlag(argv, "--force");
  const to = getOption(argv, "--to") || "";
  const project = getOption(argv, "--project") || "";
  const limit = Number(getOption(argv, "--limit") || 10);
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const jobs = buildDispatchJobs(config.memoryDir, { to, project, limit, force });
  if (jobs.length === 0) {
    console.log(JSON.stringify({ run, jobs: [], message: "No undispatched radio messages or active tasks matched." }, null, 2));
    return;
  }

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
        appendDispatchLog(config.memoryDir, result);
      }
      results.push(result);
      continue;
    }
    if (!run) {
      results.push({
        ...job,
        runnable: true,
        dryRun: true,
        command: runner.preview
      });
      continue;
    }
    const result = runDispatchJob(config.memoryDir, job, runner);
    appendDispatchLog(config.memoryDir, result);
    results.push(result);
  }

  console.log(JSON.stringify({
    run,
    results
  }, null, 2));
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
      refId: message.id
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
      refId: task.id
    }));
  return [...messages, ...tasks]
    .filter((job) => job.tool)
    .filter((job) => !dispatched.has(job.id))
    .slice(0, limit);
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
    return { available: false, reason: "claude runner is not enabled yet; command shape needs verification on this machine" };
  }
  return {
    available: false,
    reason: `${tool} has shared instructions but no verified CLI runner on this machine`
  };
}

function runDispatchJob(memoryDir, job, runner) {
  const prompt = renderDispatchPrompt(memoryDir, job);
  const completed = spawnSync(runner.command, [...runner.args, prompt], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    windowsHide: true
  });
  return {
    ...job,
    runnable: true,
    exitCode: completed.status,
    stdout: trimOutput(completed.stdout),
    stderr: trimOutput(completed.stderr),
    error: completed.error ? completed.error.message : ""
  };
}

function renderDispatchPrompt(memoryDir, job) {
  return [
    `You are being dispatched by ai-memory-hub for ${job.kind} ${job.refId}.`,
    `Shared memory dir: ${memoryDir}`,
    `Project: ${job.project || "(none)"}`,
    "",
    "Instructions:",
    "- Read MEMORY.md if useful.",
    "- Check active tasks with `ai-memory-hub task list --status active`.",
    "- Use Agent Radio or task notes to report progress.",
    "- Do not store secrets or promote temporary game/chat details into durable memory.",
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
        return sendJson(res, {
          logs: readDispatchLog(config.memoryDir).slice(-100).reverse()
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
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const targets = getInstallTargets(config.memoryDir).filter((target) => tool === "all" || target.tool === tool);
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
  dispatch   Dispatch pending radio/task work to verified CLI runners.
  pull       Rebuild MEMORY.md from the local memory ledger.
  backup     Back up MEMORY.md, ledger, inbox, profile, radio, and task files.
  watch      Periodically index pending inbox events.
  app        Start the local dashboard app.
  install    Show or apply per-tool instruction snippets.
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
  ${APP_NAME} dispatch --project ai-memory-hub
  ${APP_NAME} dispatch --to codex --run
  ${APP_NAME} pull
  ${APP_NAME} backup --reason manual
  ${APP_NAME} watch --interval-ms 30000
  ${APP_NAME} app --port 38787
  ${APP_NAME} install --tool codex
  ${APP_NAME} install --tool codex --apply
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

function detectTools() {
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

  return checks.map((check) => ({
    name: check.name,
    kind: check.kind,
    installed: fs.existsSync(check.dir),
    dir: check.dir,
    files: fs.existsSync(check.dir) ? summarizeDir(check.dir) : []
  }));
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
      tool: "codex-app",
      file: path.join(memoryDir, "tools", "codex-app-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "marvis",
      file: path.join(memoryDir, "tools", "marvis-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
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

function isTaskStatus(status) {
  return new Set(["open", "claimed", "in_progress", "blocked", "done", "cancelled"]).has(status);
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
      for (const term of queryTerms) {
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
    releaseLock(lockPath);
  }
}

function acquireLock(lockPath, owner, staleMs) {
  const started = Date.now();
  while (Date.now() - started < staleMs) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, JSON.stringify({
        owner,
        pid: process.pid,
        createdAt: new Date().toISOString()
      }, null, 2));
      fs.closeSync(fd);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (isLockStale(lockPath, staleMs)) {
        try {
          fs.unlinkSync(lockPath);
          continue;
        } catch {
          // Another process may have removed it first; retry.
        }
      }
      sleep(100);
    }
  }
  throw new Error(`Memory hub is locked by another process: ${lockPath}`);
}

function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Lock may already be removed if it was considered stale.
  }
}

function isLockStale(lockPath, staleMs) {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function readLockStatus(memoryDir) {
  const lockPath = path.join(memoryDir, "locks", "hub.lock");
  if (!fs.existsSync(lockPath)) {
    return { locked: false };
  }
  try {
    return {
      locked: true,
      ...readJson(lockPath)
    };
  } catch {
    return { locked: true, path: lockPath };
  }
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

function createRadioMessage({ from, to, type, text, thread, project }) {
  const cleanText = String(text || "").trim();
  return {
    id: createId(`radio:${from}:${to}:${type}:${cleanText}`),
    ts: new Date().toISOString(),
    from: String(from || "unknown"),
    to: String(to || "all"),
    type: String(type || "note"),
    text: cleanText,
    thread: String(thread || ""),
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
  if (existing.includes(marker) && existing.includes("Shared Agent Radio") && existing.includes("Shared Task List")) {
    return;
  }
  if (existing.includes(marker)) {
    const sections = [];
    if (!existing.includes("Shared Task List")) {
      sections.push(extractSection(snippet, "## Shared Task List", "## Shared Agent Radio"));
    }
    if (!existing.includes("Shared Agent Radio")) {
      sections.push(extractSection(snippet, "## Shared Agent Radio"));
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
