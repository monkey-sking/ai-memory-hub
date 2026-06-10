#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_NAME = "ai-memory-hub";
const MEMORY_DIR_ENV = "AI_MEMORY_DIR";
const DEFAULT_MEMORY_DIR = path.join(os.homedir(), ".ai-memory");
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_MEMORY_DIR, "config.json");
const DEFAULT_DISPATCH_ACK_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_DISPATCH_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TASK_SPEC_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TASK_SPEC_FILES = [
  ".tasks.json",
  "task-specs.json",
  path.join(".ai-memory", "task-specs.json")
];
const RESEARCH_REPORTS_DIR = "research-reports";
const DISPATCH_RUNS_DIR = "dispatch-runs";
const DAEMON_PID_FILE = "daemon.pid";
const DAEMON_STATUS_FILE = "daemon-status.json";

const RUNNER_PROFILES = {
  codex: {
    tool: "codex",
    commandCandidates: ["codex.cmd", "codex"],
    args: ["exec", "--sandbox", "danger-full-access"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "codex exec --sandbox danger-full-access <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
  },
  claude: {
    tool: "claude",
    commandCandidates: ["claude.cmd", "claude"],
    windowsExeFromCmd: path.join("node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
    args: ["-p", "-", "--output-format", "json", "--permission-mode", "bypassPermissions", "--bare", "--model", "sonnet", "--effort", "low"],
    promptMode: "stdin",
    outputMode: "claude-json",
    preview: "claude -p - --output-format json --permission-mode bypassPermissions --bare <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    resumeArgs: (sessionId) => ["--resume", sessionId],
    capabilities: ["direct-dispatch", "stdin-prompt", "json-output", "session-resume"]
  },
  gemini: {
    tool: "gemini",
    commandCandidates: ["gemini.cmd", "gemini"],
    args: [],
    promptMode: "stdin",
    outputMode: "text",
    preview: "gemini <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output", "warning-filter"]
  },
  "qoder-cn": {
    tool: "qoder-cn",
    commandCandidates: ["qoder-cn.cmd", "qoder-cn"],
    args: ["-"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "qoder-cn - <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
  },
  opencode: {
    tool: "opencode",
    commandCandidates: ["opencode.cmd", "opencode", "qoder-cn.cmd", "qoder-cn"],
    args: ["-"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "opencode - <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
  },
  marvis: {
    tool: "marvis",
    sharedStateOnly: true,
    reason: "marvis currently integrates through shared radio/task state only; no verified direct CLI runner is configured on this machine"
  },
  qclaw: {
    tool: "qclaw",
    sharedStateOnly: true,
    reason: "qclaw should currently be coordinated through shared tasks/radio or its own gateway; no verified direct prompt runner is configured"
  },
  openclaw: {
    tool: "openclaw",
    sharedStateOnly: true,
    reason: "openclaw should currently be coordinated through shared tasks/radio or gateway APIs; no verified direct prompt runner is configured"
  },
  antigravity: {
    tool: "antigravity",
    sharedStateOnly: true,
    reason: "antigravity currently integrates through shared memory instructions or desktop automation; no verified direct CLI runner is configured"
  },
  "codex-app": {
    tool: "codex-app",
    sharedStateOnly: true,
    reason: "codex-app is a desktop/app target; use shared state or app automation rather than direct CLI dispatch"
  },
  "claude-desktop": {
    tool: "claude-desktop",
    sharedStateOnly: true,
    reason: "claude-desktop is a desktop/app target; use shared state or app automation rather than direct CLI dispatch"
  }
};

// Unified async call state machine
const ASYNC_CALL_STATES = {
  PENDING: "pending",
  DISPATCHED: "dispatched",
  ACKED: "acked",
  PROGRESS: "progress",
  RETRYING: "retrying",
  FAILED: "failed",
  COMPLETED: "completed",
  ABANDONED: "abandoned"
};

const ASYNC_CALL_TRANSITIONS = {
  "pending": ["dispatched"],
  "dispatched": ["acked", "progress", "failed", "completed"],
  "acked": ["progress", "completed", "failed"],
  "progress": ["progress", "acked", "completed", "failed"],
  "retrying": ["dispatched", "progress", "failed", "abandoned"],
  "failed": ["retrying", "abandoned"],
  "completed": [],
  "abandoned": []
};

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
    case "session":
      return sessionCommand(rest);
    case "rpc":
      return rpcCommand(rest);
    case "notify":
      return notifyCommand(rest);
    case "context":
      return contextCommand(rest);
    case "queue":
      return queueCommand(rest);
    case "recipe":
      return recipeCommand(rest);
    case "task-spec":
    case "taskspec":
      return taskSpecCommand(rest);
    case "metrics":
      return metricsCommand(rest);
    case "update":
      return updateCommand(rest);
    case "connect":
    case "contact":
      return connectCommand(rest);
    case "doctor":
      return doctorCommand(rest);
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
    case "daemon":
      return daemonCommand(rest);
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

function doctorCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const tool = getOption(argv, "--tool") || getOption(argv, "--to") || "";
  const runProbes = hasFlag(argv, "--run-probes");
  const skipVersion = hasFlag(argv, "--skip-version");
  const timeoutMs = Number(getOption(argv, "--timeout-ms") || 5000);
  const tools = tool ? [tool] : getKnownRunnerToolNames();
  const results = tools.map((name) => inspectRunnerTool(name, {
    runProbes,
    skipVersion,
    timeoutMs
  }));
  const summary = {
    total: results.length,
    runnable: results.filter((item) => item.available).length,
    sharedStateOnly: results.filter((item) => item.sharedStateOnly).length,
    missing: results.filter((item) => !item.available && !item.sharedStateOnly).length,
    warnings: results.reduce((sum, item) => sum + item.warnings.length, 0)
  };
  console.log(JSON.stringify({
    platform: process.platform,
    memoryDir: config.memoryDir,
    runProbes,
    summary,
    tools: results
  }, null, 2));
}

function inspectRunnerTool(tool, { runProbes = false, skipVersion = false, timeoutMs = 5000 } = {}) {
  const name = normalizeToolName(tool);
  const profile = getRunnerProfile(name);
  const runner = getToolRunner(name);
  const warnings = getRunnerDoctorWarnings(runner);
  const versionProbe = runner.available && !skipVersion
    ? runRunnerProbe(name, runner, runner.versionArgs || ["--version"], "", timeoutMs)
    : {
      skipped: true,
      reason: runner.available ? "Version probe skipped." : "Runner is not directly runnable."
    };
  const invocationProbe = runner.available && runProbes
    ? runRunnerProbe(name, runner, runner.probeArgs || runner.versionArgs || ["--help"], "", timeoutMs)
    : {
      skipped: true,
      reason: runner.available ? "Pass --run-probes to execute optional non-model probe." : "Runner is not directly runnable."
    };

  return {
    tool: name,
    available: Boolean(runner.available),
    sharedStateOnly: Boolean(runner.sharedStateOnly),
    reason: runner.available ? "" : runner.reason || "",
    profile: profile ? {
      promptMode: profile.promptMode || "",
      outputMode: profile.outputMode || "",
      capabilities: profile.capabilities || []
    } : null,
    command: runner.commandPath ? {
      path: runner.commandPath,
      name: runner.commandName || "",
      kind: runner.commandKind || "",
      usesShell: Boolean(runner.usesShell),
      shell: runner.shell || "",
      resolved: runner.resolvedCommands || []
    } : null,
    warnings,
    versionProbe,
    invocationProbe
  };
}

function runRunnerProbe(tool, runner, args = [], input = "", timeoutMs = 5000) {
  const completed = invokeRunnerCommand(runner, args, input, timeoutMs);
  const normalizedStderr = normalizeRunnerStderr(tool, completed.stderr);
  return {
    ok: completed.status === 0,
    status: completed.status,
    signal: completed.signal || "",
    timedOut: Boolean(completed.error?.code === "ETIMEDOUT"),
    args,
    shell: runner.usesShell ? runner.shell || "shell" : "",
    stdout: trimOutput(completed.stdout, 1000),
    stderr: trimOutput(normalizedStderr.stderr, 1000),
    stderrWarnings: normalizedStderr.warnings,
    error: completed.error ? completed.error.message : ""
  };
}

function getRunnerDoctorWarnings(runner) {
  const warnings = [];
  if (!runner.available) {
    warnings.push(runner.sharedStateOnly
      ? "Shared-state-only: dispatch will not launch this tool directly."
      : runner.reason || "Runner is unavailable.");
    return warnings;
  }
  if (process.platform === "win32") {
    const resolved = runner.resolvedCommands || [];
    if (resolved.some((item) => classifyCommandPath(item) === "powershell-shim")) {
      warnings.push("PowerShell .ps1 shim is present in PATH; this runner resolved a safer .cmd/.exe/native command for automation.");
    }
    if (runner.commandKind === "powershell-shim") {
      warnings.push("Unsafe for automation: only a PowerShell .ps1 shim was found.");
    }
    if (runner.usesShell) {
      const promptHint = runner.promptMode === "stdin"
        ? "prompt payload remains on stdin"
        : `prompt mode remains ${runner.promptMode || "argv"}`;
      warnings.push(`Uses cmd.exe only to execute a .cmd/.bat shim; ${promptHint}.`);
    }
  }
  if (runner.promptMode && runner.promptMode !== "stdin") {
    warnings.push(`Prompt mode is ${runner.promptMode}; long prompts may need temp-file escaping.`);
  }
  return warnings;
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
  const daemon = buildDaemonStatus(memoryDir);

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
      acked: relayLatest.filter((entry) => entry.state === "acked").length,
      progress: relayLatest.filter((entry) => entry.state === "progress").length,
      retrying: relayLatest.filter((entry) => entry.state === "retrying").length,
      failed: relayLatest.filter((entry) => entry.state === "failed").length,
      completed: relayLatest.filter((entry) => entry.state === "completed").length,
      abandoned: relayLatest.filter((entry) => entry.state === "abandoned").length,
      dueRetries: relayLatest.filter((entry) => isRelayRetryDue(entry) && isRelayRetryRunnable(entry)).length
    },
    backups,
    lock,
    daemon,
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
      runnable: tool.runnable,
      runnerProfile: tool.runnerProfile,
      runnerCommandKind: tool.runnerCommandKind,
      runnerUsesShell: tool.runnerUsesShell,
      sharedStateOnly: tool.sharedStateOnly,
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
    throw new Error("Usage: ai-memory-hub record <text> [--source tool] [--kind preference] [--project name] [--tags a,b]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);
  const source = getOption(argv, "--source") || "manual";
  const kind = normalizeMemoryKind(getOption(argv, "--kind") || "note");
  const metadata = normalizeMemoryMetadata({
    kind,
    project: getOption(argv, "--project") || "",
    tags: parseListOption(getOption(argv, "--tags")),
    scope: getOption(argv, "--scope") || "",
    confidence: getOption(argv, "--confidence") || ""
  });

  const event = {
    id: createId(text),
    ts: new Date().toISOString(),
    source,
    text,
    metadata
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

function sessionCommand(argv) {
  const action = argv[0] || "list";
  switch (action) {
    case "list":
      return sessionListCommand(argv.slice(1));
    case "add":
    case "create":
      return sessionAddCommand(argv.slice(1));
    case "update":
      return sessionUpdateCommand(argv.slice(1));
    case "active":
      return sessionActiveCommand(argv.slice(1));
    default:
      throw new Error(`Unknown session action: ${action}\nTry: ai-memory-hub session list|add|update|active`);
  }
}

function sessionListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const sessions = readSessions(config.memoryDir);
  console.log(JSON.stringify(sessions, null, 2));
}

function sessionAddCommand(argv) {
  const title = getOption(argv, "--title") || argv[0] || "";
  const createdBy = getOption(argv, "--from") || getOption(argv, "--by") || "unknown";
  const project = getOption(argv, "--project") || "";
  const context = getOption(argv, "--context") || "";

  if (!title) {
    throw new Error("Usage: ai-memory-hub session add <title> --from <tool> [--project <project>] [--context <text>]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const session = createSession({
    title,
    createdBy,
    project,
    participants: [createdBy],
    context,
    artifacts: []
  });

  const sessions = readSessions(config.memoryDir);
  sessions.push(session);
  writeSessions(config.memoryDir, sessions);

  console.log(JSON.stringify(session, null, 2));
}

function sessionUpdateCommand(argv) {
  const sessionId = getOption(argv, "--id") || argv[0] || "";
  const context = getOption(argv, "--context");
  const addParticipant = getOption(argv, "--add-participant");

  if (!sessionId) {
    throw new Error("Usage: ai-memory-hub session update --id <session-id> [--context <text>] [--add-participant <tool>]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const updates = {};
  if (context !== null && context !== undefined) {
    updates.context = context;
  }

  if (addParticipant) {
    const sessions = readSessions(config.memoryDir);
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      updates.participants = [...new Set([...(session.participants || []), addParticipant])];
    }
  }

  const updated = updateSession(config.memoryDir, sessionId, updates);
  console.log(JSON.stringify(updated, null, 2));
}

function sessionActiveCommand(argv) {
  const maxAgeHours = Number(getOption(argv, "--max-age") || 1);
  const maxAgeMs = maxAgeHours * 3600000;

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const activeSessions = getActiveSessions(config.memoryDir, maxAgeMs);
  console.log(JSON.stringify(activeSessions, null, 2));
}

function rpcCommand(argv) {
  const action = argv[0] || "call";
  switch (action) {
    case "call":
      return rpcCallCommand(argv.slice(1));
    case "respond":
      return rpcRespondCommand(argv.slice(1));
    case "pending":
      return rpcPendingCommand(argv.slice(1));
    default:
      throw new Error(`Unknown rpc action: ${action}\nTry: ai-memory-hub rpc call|respond|pending`);
  }
}

function rpcCallCommand(argv) {
  const to = getOption(argv, "--to") || "";
  const method = getOption(argv, "--method") || "";
  const paramsJson = getOption(argv, "--params") || "{}";
  const timeout = Number(getOption(argv, "--timeout") || 30000);
  const from = getOption(argv, "--from") || "unknown";

  if (!to || !method) {
    throw new Error("Usage: ai-memory-hub rpc call --to <tool> --method <method> [--params '{\"key\":\"value\"}'] [--timeout 30000] [--from <tool>]");
  }

  let params;
  try {
    params = JSON.parse(paramsJson);
  } catch (error) {
    throw new Error(`Invalid JSON params: ${error.message}`);
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const request = createRpcRequest({ from, to, method, params, timeout });
  writeRpcRequest(config.memoryDir, request);

  console.log(JSON.stringify({ request, status: "waiting" }, null, 2));

  const result = waitForRpcResult(config.memoryDir, request.id, timeout);

  if (!result) {
    console.log(JSON.stringify({ request, status: "timeout", error: "No response within timeout" }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ request, result }, null, 2));
  process.exit(result.success ? 0 : 1);
}

function rpcRespondCommand(argv) {
  const requestId = getOption(argv, "--id") || "";
  const dataJson = getOption(argv, "--data") || "null";
  const error = getOption(argv, "--error") || "";
  const success = !error && !hasFlag(argv, "--error");

  if (!requestId) {
    throw new Error("Usage: ai-memory-hub rpc respond --id <request-id> [--data '{\"result\":\"value\"}'] [--error <message>]");
  }

  let data;
  try {
    data = JSON.parse(dataJson);
  } catch (err) {
    throw new Error(`Invalid JSON data: ${err.message}`);
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const request = readRpcRequest(config.memoryDir, requestId);
  if (!request) {
    throw new Error(`RPC request not found: ${requestId}`);
  }

  const result = writeRpcResult(config.memoryDir, requestId, { success, data, error });
  console.log(JSON.stringify(result, null, 2));
}

function rpcPendingCommand(argv) {
  const to = getOption(argv, "--to") || "";

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const requestsDir = path.join(config.memoryDir, "rpc", "requests");
  if (!fs.existsSync(requestsDir)) {
    console.log(JSON.stringify([], null, 2));
    return;
  }

  const files = fs.readdirSync(requestsDir).filter((f) => f.endsWith(".json"));
  const pending = files
    .map((file) => {
      try {
        return readJson(path.join(requestsDir, file));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((req) => to ? req.to === to : true)
    .filter((req) => !readRpcResult(config.memoryDir, req.id));

  console.log(JSON.stringify(pending, null, 2));
}

function notifyCommand(argv) {
  const action = argv[0] || "send";
  switch (action) {
    case "send":
      return notifySendCommand(argv.slice(1));
    case "list":
      return notifyListCommand(argv.slice(1));
    case "pending":
      return notifyPendingCommand(argv.slice(1));
    case "deliver":
      return notifyDeliverCommand(argv.slice(1));
    default:
      throw new Error(`Unknown notify action: ${action}\nTry: ai-memory-hub notify send|list|pending|deliver`);
  }
}

function notifySendCommand(argv) {
  const severity = getOption(argv, "--severity") || "info";
  const title = getOption(argv, "--title") || "";
  const message = argv.find((arg) => !arg.startsWith("--")) || getOption(argv, "--message") || "";
  const actionUrl = getOption(argv, "--url") || "";
  const channelsStr = getOption(argv, "--channels") || "";
  const from = getOption(argv, "--from") || "unknown";
  const project = getOption(argv, "--project") || "";

  if (!message && !title) {
    throw new Error("Usage: ai-memory-hub notify send <message> [--severity info|warning|error|critical|need_input] [--title <title>] [--url <url>] [--channels telegram,wechat,email] [--from <tool>] [--project <project>]");
  }

  const userChannels = channelsStr ? channelsStr.split(",").map((c) => c.trim()) : [];
  const channels = getNotificationChannels(severity, userChannels);

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const notification = createNotification({
    severity,
    title,
    message,
    actionUrl,
    channels,
    from,
    project
  });

  writeNotification(config.memoryDir, notification);
  console.log(JSON.stringify(notification, null, 2));
}

function notifyListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const notifications = readNotifications(config.memoryDir);
  console.log(JSON.stringify(notifications, null, 2));
}

function notifyPendingCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const pending = getPendingNotifications(config.memoryDir);
  console.log(JSON.stringify(pending, null, 2));
}

function notifyDeliverCommand(argv) {
  const notificationId = getOption(argv, "--id") || "";
  const channelsStr = getOption(argv, "--channels") || "";

  if (!notificationId || !channelsStr) {
    throw new Error("Usage: ai-memory-hub notify deliver --id <notification-id> --channels telegram,wechat");
  }

  const deliveredTo = channelsStr.split(",").map((c) => c.trim());

  const config = loadConfig();
  ensureHub(config.memoryDir);

  updateNotificationStatus(config.memoryDir, notificationId, "delivered", deliveredTo);
  console.log(JSON.stringify({ id: notificationId, deliveredTo, status: "delivered" }, null, 2));
}

function contextCommand(argv) {
  const action = argv[0] || "create";
  switch (action) {
    case "create":
      return contextCreateCommand(argv.slice(1));
    case "show":
      return contextShowCommand(argv.slice(1));
    case "list":
      return contextListCommand(argv.slice(1));
    default:
      throw new Error(`Unknown context action: ${action}\nTry: ai-memory-hub context create|show|list`);
  }
}

function contextCreateCommand(argv) {
  const taskId = getOption(argv, "--task") || "";
  const workflowId = getOption(argv, "--workflow") || "";
  const project = getOption(argv, "--project") || "";
  const query = getOption(argv, "--query") || "";

  if (!taskId && !workflowId && !query) {
    throw new Error("Usage: ai-memory-hub context create [--task <task-id>] [--workflow <workflow-id>] [--project <project>] [--query <search-query>]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const pack = createContextPack({ taskId, workflowId, project, query });
  const file = writeContextPack(config.memoryDir, pack);

  console.log(JSON.stringify({ ...pack, file }, null, 2));
}

function contextShowCommand(argv) {
  const packId = getOption(argv, "--id") || argv[0] || "";

  if (!packId) {
    throw new Error("Usage: ai-memory-hub context show <pack-id>");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const pack = readContextPack(config.memoryDir, packId);

  if (!pack) {
    throw new Error(`Context pack not found: ${packId}`);
  }

  console.log(JSON.stringify(pack, null, 2));
}

function contextListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const packsDir = path.join(config.memoryDir, "context", "packs");

  if (!fs.existsSync(packsDir)) {
    console.log(JSON.stringify([], null, 2));
    return;
  }

  const files = fs.readdirSync(packsDir).filter((f) => f.endsWith(".json"));
  const packs = files
    .map((file) => {
      try {
        return readJson(path.join(packsDir, file));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  console.log(JSON.stringify(packs, null, 2));
}

function queueCommand(argv) {
  const action = argv[0] || "list";
  switch (action) {
    case "add":
      return queueAddCommand(argv.slice(1));
    case "list":
      return queueListCommand(argv.slice(1));
    case "running":
      return queueRunningCommand(argv.slice(1));
    case "failed":
      return queueFailedCommand(argv.slice(1));
    case "start":
      return queueStartCommand(argv.slice(1));
    case "complete":
      return queueCompleteCommand(argv.slice(1));
    case "fail":
      return queueFailCommand(argv.slice(1));
    default:
      throw new Error(`Unknown queue action: ${action}\nTry: ai-memory-hub queue add|list|running|failed|start|complete|fail`);
  }
}

function queueAddCommand(argv) {
  const taskId = getOption(argv, "--task") || "";
  const workflowId = getOption(argv, "--workflow") || "";
  const radioId = getOption(argv, "--radio") || "";
  const tool = getOption(argv, "--tool") || "";
  const priority = getOption(argv, "--priority") || "normal";
  const timeout = getOption(argv, "--timeout") || "30000";
  const maxRetries = getOption(argv, "--max-retries") || "3";

  if (!tool || (!taskId && !workflowId && !radioId)) {
    throw new Error("Usage: ai-memory-hub queue add --tool <tool> [--task <id>] [--workflow <id>] [--radio <id>] [--priority normal] [--timeout 30000] [--max-retries 3]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const entry = createDispatchQueueEntry({
    taskId,
    workflowId,
    radioId,
    tool,
    priority,
    timeout,
    maxRetries
  });

  writeDispatchQueueEntry(config.memoryDir, entry);
  console.log(JSON.stringify(entry, null, 2));
}

function queueListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const queued = getQueuedEntries(config.memoryDir);
  console.log(JSON.stringify(queued, null, 2));
}

function queueRunningCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const running = getRunningEntries(config.memoryDir);
  console.log(JSON.stringify(running, null, 2));
}

function queueFailedCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const failed = getFailedEntries(config.memoryDir);
  console.log(JSON.stringify(failed, null, 2));
}

function queueStartCommand(argv) {
  const entryId = getOption(argv, "--id") || argv[0] || "";

  if (!entryId) {
    throw new Error("Usage: ai-memory-hub queue start <entry-id>");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  updateDispatchQueueEntry(config.memoryDir, entryId, {
    status: "running",
    startedAt: new Date().toISOString(),
    attempts: 1,
    lastAttemptAt: new Date().toISOString()
  });

  console.log(JSON.stringify({ id: entryId, status: "running" }, null, 2));
}

function queueCompleteCommand(argv) {
  const entryId = getOption(argv, "--id") || argv[0] || "";

  if (!entryId) {
    throw new Error("Usage: ai-memory-hub queue complete <entry-id>");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  updateDispatchQueueEntry(config.memoryDir, entryId, {
    status: "completed",
    completedAt: new Date().toISOString()
  });

  console.log(JSON.stringify({ id: entryId, status: "completed" }, null, 2));
}

function queueFailCommand(argv) {
  const entryId = getOption(argv, "--id") || argv[0] || "";
  const error = getOption(argv, "--error") || "Unknown error";

  if (!entryId) {
    throw new Error("Usage: ai-memory-hub queue fail <entry-id> [--error <message>]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const entries = readDispatchQueue(config.memoryDir);
  const entry = entries.find((e) => e.id === entryId);

  if (!entry) {
    throw new Error(`Queue entry not found: ${entryId}`);
  }

  const newAttempts = (entry.attempts || 0) + 1;
  const shouldRetry = newAttempts < (entry.maxRetries || 3);

  updateDispatchQueueEntry(config.memoryDir, entryId, {
    status: shouldRetry ? "queued" : "failed",
    attempts: newAttempts,
    lastAttemptAt: new Date().toISOString(),
    lastError: error,
    completedAt: shouldRetry ? "" : new Date().toISOString()
  });

  console.log(JSON.stringify({
    id: entryId,
    status: shouldRetry ? "queued (will retry)" : "failed",
    attempts: newAttempts,
    maxRetries: entry.maxRetries
  }, null, 2));
}

function recipeCommand(argv) {
  const action = argv[0] || "list";
  switch (action) {
    case "list":
      return recipeListCommand(argv.slice(1));
    case "show":
      return recipeShowCommand(argv.slice(1));
    case "create":
      return recipeCreateCommand(argv.slice(1));
    case "validate":
      return recipeValidateCommand(argv.slice(1));
    default:
      throw new Error(`Unknown recipe action: ${action}\nTry: ai-memory-hub recipe list|show|create|validate`);
  }
}

function recipeListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const recipes = listRecipes(config.memoryDir);
  console.log(JSON.stringify(recipes, null, 2));
}

function recipeShowCommand(argv) {
  const recipeName = argv[0] || "";

  if (!recipeName) {
    throw new Error("Usage: ai-memory-hub recipe show <recipe-name>");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const recipe = readRecipe(config.memoryDir, recipeName);

  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeName}`);
  }

  console.log(JSON.stringify(recipe, null, 2));
}

function recipeCreateCommand(argv) {
  const recipeName = getOption(argv, "--recipe") || "";
  const project = getOption(argv, "--project") || "";
  const toolsStr = getOption(argv, "--tools") || "";

  if (!recipeName || !toolsStr) {
    throw new Error("Usage: ai-memory-hub recipe create --recipe <name> --tools role1:tool1,role2:tool2 [--project <name>] [--var key=value]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  // Parse tool mapping: "analyzer:claude,writer:codex,reviewer:gemini"
  const toolMapping = {};
  toolsStr.split(",").forEach((pair) => {
    const [role, tool] = pair.split(":").map((s) => s.trim());
    if (role && tool) {
      toolMapping[role] = tool;
    }
  });

  // Parse variables: --var priority=high --var scope=docs
  const variables = { project };
  argv.forEach((arg, idx) => {
    if (arg === "--var" && argv[idx + 1]) {
      const [key, value] = argv[idx + 1].split("=").map((s) => s.trim());
      if (key && value) {
        variables[key] = value;
      }
    }
  });

  const result = createWorkflowFromRecipe(config.memoryDir, recipeName, toolMapping, variables);

  console.log(JSON.stringify({
    workflow: result.workflow,
    tasks: result.tasks.map((t) => ({ id: t.id, title: t.title, assignee: t.assignee })),
    recipe: { name: result.recipe.name, steps: result.recipe.steps.length }
  }, null, 2));
}

function recipeValidateCommand(argv) {
  const recipeName = argv[0] || "";

  if (!recipeName) {
    throw new Error("Usage: ai-memory-hub recipe validate <recipe-name>");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const recipe = readRecipe(config.memoryDir, recipeName);

  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeName}`);
  }

  const validation = validateRecipe(recipe);

  if (validation.valid) {
    console.log(JSON.stringify({ valid: true, message: "Recipe is valid" }, null, 2));
  } else {
    console.log(JSON.stringify({ valid: false, error: validation.error }, null, 2));
    process.exit(1);
  }
}

function taskSpecCommand(argv) {
  const action = argv[0] || "list";
  switch (action) {
    case "list":
      return taskSpecListCommand(argv.slice(1));
    case "show":
      return taskSpecShowCommand(argv.slice(1));
    case "validate":
      return taskSpecValidateCommand(argv.slice(1));
    case "run":
      return taskSpecRunCommand(argv.slice(1));
    default:
      throw new Error(`Unknown task-spec action: ${action}\nTry: ai-memory-hub task-spec list|show|validate|run`);
  }
}

function taskSpecListCommand(argv) {
  const context = loadTaskSpecContext(argv);
  const validation = validateTaskSpecDocument(context.document);
  if (!validation.valid) {
    throw new Error(`Invalid task spec: ${validation.error}`);
  }
  console.log(JSON.stringify({
    file: context.displayFile,
    version: context.document.version || "",
    tasks: validation.tasks.map((task) => summarizeTaskSpec(task))
  }, null, 2));
}

function taskSpecShowCommand(argv) {
  const taskId = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!taskId) {
    throw new Error("Usage: ai-memory-hub task-spec show <task-id> [--file <path>] [--root <path>]");
  }
  const { task, context } = resolveTaskSpecFromArgs(argv, taskId);
  console.log(JSON.stringify({
    file: context.displayFile,
    ...task
  }, null, 2));
}

function taskSpecValidateCommand(argv) {
  const context = loadTaskSpecContext(argv);
  const validation = validateTaskSpecDocument(context.document);
  if (!validation.valid) {
    console.log(JSON.stringify({
      valid: false,
      file: context.displayFile,
      error: validation.error
    }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    valid: true,
    file: context.displayFile,
    tasks: validation.tasks.length
  }, null, 2));
}

function taskSpecRunCommand(argv) {
  const taskId = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!taskId) {
    throw new Error("Usage: ai-memory-hub task-spec run <task-id> [--file <path>] [--root <path>] [--no-verify] [--allow-outside-cwd]");
  }
  const { task, context } = resolveTaskSpecFromArgs(argv, taskId);
  const result = runTaskSpec(task, {
    projectRoot: context.projectRoot,
    runVerify: !hasFlag(argv, "--no-verify"),
    allowOutsideCwd: hasFlag(argv, "--allow-outside-cwd")
  });
  console.log(JSON.stringify({
    file: context.displayFile,
    ...result
  }, null, 2));
  if (result.status !== "passed") {
    process.exit(1);
  }
}

function metricsCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const metrics = calculateMetrics(config.memoryDir);
  console.log(JSON.stringify(metrics, null, 2));
}

function updateCommand(argv) {
  const check = hasFlag(argv, "--check");
  const force = hasFlag(argv, "--force");

  if (check) {
    return checkForUpdates();
  }

  return performUpdate(force);
}

function checkForUpdates() {
  console.log("Checking for updates...");

  try {
    // Get current version from package.json
    const packagePath = path.join(__dirname, "..", "package.json");
    const pkg = readJson(packagePath);
    const currentVersion = pkg.version || "unknown";

    // Check git remote for updates

    // Fetch latest from remote
    execSync("git fetch origin main", { stdio: "pipe" });

    // Get local and remote commit hashes
    const localHash = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    const remoteHash = execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();

    if (localHash === remoteHash) {
      console.log(JSON.stringify({
        upToDate: true,
        currentVersion,
        message: "You are running the latest version"
      }, null, 2));
    } else {
      // Get commit count between local and remote
      const behindCount = execSync(`git rev-list --count HEAD..origin/main`, { encoding: "utf8" }).trim();

      console.log(JSON.stringify({
        upToDate: false,
        currentVersion,
        behindBy: parseInt(behindCount),
        message: `${behindCount} new commit(s) available. Run 'ai-memory-hub update' to update.`
      }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({
      error: true,
      message: `Failed to check for updates: ${error.message}`
    }, null, 2));
    process.exit(1);
  }
}

function performUpdate(force) {
  console.log("Updating ai-memory-hub...");

  try {
    // Check for uncommitted changes
    const status = execSync("git status --porcelain", { encoding: "utf8" });

    if (status && !force) {
      console.error(JSON.stringify({
        error: true,
        message: "You have uncommitted changes. Commit or stash them first, or use --force to discard.",
        uncommittedFiles: status.split("\n").filter(Boolean)
      }, null, 2));
      process.exit(1);
    }

    // Fetch latest changes
    console.log("Fetching latest changes...");
    execSync("git fetch origin main", { stdio: "inherit" });

    // Reset to origin/main (discard local changes if --force)
    if (force) {
      console.log("Discarding local changes and updating...");
      execSync("git reset --hard origin/main", { stdio: "inherit" });
    } else {
      console.log("Pulling latest changes...");
      execSync("git pull origin main", { stdio: "inherit" });
    }

    // Install/update dependencies
    console.log("Checking dependencies...");
    const packagePath = path.join(__dirname, "..", "package.json");
    if (fs.existsSync(packagePath)) {
      console.log("Updating dependencies...");
      execSync("npm install", { stdio: "inherit", cwd: path.join(__dirname, "..") });
    }

    // Get new version
    const pkg = readJson(packagePath);
    const newVersion = pkg.version || "unknown";

    console.log(JSON.stringify({
      success: true,
      version: newVersion,
      message: "Update complete! Restart any running processes to use the new version."
    }, null, 2));

  } catch (error) {
    console.error(JSON.stringify({
      error: true,
      message: `Update failed: ${error.message}`
    }, null, 2));
    process.exit(1);
  }
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
    case "update":
      return taskUpdateCommand(actionArgs);
    case "note":
      return taskNoteCommand(actionArgs);
    case "done":
      return taskDoneCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub task <add|list|claim|status|update|note|done> ...");
  }
}

function taskAddCommand(argv) {
  const title = positionalArgs(argv).join(" ").trim();
  if (!title) {
    throw new Error("Usage: ai-memory-hub task add <title> [--description text] [--handoff text] [--from codex] [--project name] [--priority normal]");
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
  if (action === "status") {
    return dispatchStatusCommand(argv.slice(1));
  }
  if (action === "progress" || action === "heartbeat") {
    return dispatchProgressCommand(argv.slice(1));
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

function dispatchStatusCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const threadKey = getOption(argv, "--thread-key") || "";
  const thread = getOption(argv, "--thread") || "";
  const refId = getOption(argv, "--ref-id") || "";
  const project = getOption(argv, "--project") || "";
  const tool = getOption(argv, "--to") || getOption(argv, "--tool") || "";
  const state = getOption(argv, "--state") || "";
  const recentValue = getOption(argv, "--recent");
  const limitValue = getOption(argv, "--limit");
  const recent = parsePositiveIntegerOption(recentValue, "--recent", { allowEmpty: true, defaultValue: 0 });
  const limit = parsePositiveIntegerOption(limitValue, "--limit", {
    allowEmpty: true,
    defaultValue: recent || 20
  });
  const hasExplicitThreadScope = Boolean(threadKey || thread);
  const wantsRecentView = recent > 0 || hasFlag(argv, "--recent");

  if (!threadKey && !thread && !refId && !wantsRecentView) {
    throw new Error("Usage: ai-memory-hub dispatch status [--thread-key <tool:project:ref> | --thread <thread-id> | --ref-id <id> | --recent [N]] [--project <project>] [--to <tool>] [--state <relay-state>] [--limit <N>]");
  }

  if (!threadKey && !thread && !refId && wantsRecentView) {
    const summary = buildRecentRelayStatusView(config.memoryDir, {
      project,
      tool,
      state,
      limit
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const resolvedThreadKeys = resolveRelayThreadKeys(config.memoryDir, {
    threadKey,
    thread,
    refId,
    project,
    tool
  });
  if ((threadKey || thread || refId) && resolvedThreadKeys && resolvedThreadKeys.size === 0) {
    console.log(JSON.stringify({
      found: false,
      query: {
        threadKey,
        thread,
        refId,
        project,
        tool,
        state
      },
      message: "No relay status entries matched."
    }, null, 2));
    return;
  }

  const all = readRelayStatus(config.memoryDir)
    .filter((entry) => threadKey ? entry.threadKey === threadKey : true)
    .filter((entry) => resolvedThreadKeys ? resolvedThreadKeys.has(entry.threadKey) : true)
    .filter((entry) => (!hasExplicitThreadScope && refId) ? entry.sourceId === refId || entry.dispatchId === refId : true)
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => tool ? entry.tool === tool : true)
    .filter((entry) => state ? entry.state === state : true)
    .sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));

  if (all.length === 0) {
    console.log(JSON.stringify({
      found: false,
      query: {
        threadKey,
        thread,
        refId,
        project,
        tool,
        state
      },
      message: "No relay status entries matched."
    }, null, 2));
    return;
  }

  const latest = all[all.length - 1];
  const source = resolveRelaySourceObject(config.memoryDir, latest);
  const related = resolveRelayRelatedObjects(config.memoryDir, latest, source);
  const dispatchLog = readDispatchLog(config.memoryDir)
    .filter((entry) => latest.threadKey ? getDispatchThreadKey(entry) === latest.threadKey : true)
    .filter((entry) => (!hasExplicitThreadScope && refId) ? entry.refId === refId || entry.id === refId : true)
    .sort((a, b) => String(a.dispatchedAt || "").localeCompare(String(b.dispatchedAt || "")));
  const runHistory = readDispatchRuns(config.memoryDir)
    .filter((entry) => latest.threadKey ? entry.threadKey === latest.threadKey : true)
    .filter((entry) => (!hasExplicitThreadScope && refId)
      ? entry.sourceId === refId || entry.dispatchId === refId || entry.dispatchId === `task:${refId}` || entry.dispatchId === `radio:${refId}` || entry.dispatchId === `workflow:${refId}`
      : true)
    .sort((a, b) => String(a.startedAt || "").localeCompare(String(b.startedAt || "")));
  const states = all.map((entry) => entry.state).filter(Boolean);
  const latestRun = runHistory.at(-1) || null;
  const summary = {
    threadKey: latest.threadKey || "",
    thread: latest.thread || "",
    sourceKind: latest.sourceKind || "",
    sourceId: latest.sourceId || "",
    tool: latest.tool || "",
    project: latest.project || "",
    latestState: latest.state || "",
    attempt: Number(latest.attempt || 0),
    maxRetries: Number(latest.maxRetries || 0),
    exitCode: latest.exitCode ?? null,
    sessionId: latest.sessionId || "",
    lastError: latest.lastError || "",
    progressPercent: latest.progressPercent ?? null,
    progressStatus: latest.progressStatus || "",
    progressAt: latest.progressAt || "",
    progressBy: latest.progressBy || "",
    nextRetryAt: latest.nextRetryAt || "",
    latestRunId: latestRun?.runId || "",
    latestRunStatus: latestRun?.status || "",
    latestRunExitCode: latestRun?.exitCode ?? null,
    latestRunFinishedAt: latestRun?.finishedAt || "",
    firstTs: all[0]?.ts || "",
    latestTs: latest.ts || "",
    timelineLength: all.length,
    states
  };

  console.log(JSON.stringify({
    found: true,
      query: {
        threadKey,
        thread,
        refId,
        project,
        tool,
        state
      },
    summary,
    source,
    related,
    matchedThreadKeys: [...new Set(all.map((entry) => entry.threadKey).filter(Boolean))],
    latest,
    timeline: all,
    runHistory,
    dispatchLog
  }, null, 2));
}

function dispatchProgressCommand(argv) {
  const threadKey = getOption(argv, "--thread-key") || "";
  const thread = getOption(argv, "--thread") || "";
  const refId = getOption(argv, "--ref-id") || positionalArgs(argv)[0] || "";
  const project = getOption(argv, "--project") || "";
  const tool = getOption(argv, "--to") || getOption(argv, "--tool") || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || tool || "manual";
  const progressPercent = parseProgressPercent(getOption(argv, "--percent") || getOption(argv, "--progress"));
  const progressStatus = getOption(argv, "--status") || getOption(argv, "--message") || getOption(argv, "--text") || "";

  if (!threadKey && !thread && !refId) {
    throw new Error("Usage: ai-memory-hub dispatch progress --ref-id <task-or-radio-id> [--thread-key <tool:project:ref> | --thread <thread-id>] [--to <tool>] [--project <project>] [--percent 0-100] [--status <text>] [--by <tool>]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  return withHubLock(config.memoryDir, "dispatch-progress", () => {
    const entry = findLatestRelayStatusEntry(config.memoryDir, {
      threadKey,
      thread,
      refId,
      project,
      tool
    });

    if (!entry) {
      console.log(JSON.stringify({
        ok: false,
        found: false,
        query: { threadKey, thread, refId, project, tool },
        message: "No relay status entry matched. Progress can only be attached to an existing dispatch thread."
      }, null, 2));
      return;
    }

    const job = rebuildDispatchJobFromRelay(config.memoryDir, entry) || dispatchJobFromRelayEntry(entry);
    const progressAt = new Date().toISOString();
    appendRelayStatus(config.memoryDir, job, {
      state: ASYNC_CALL_STATES.PROGRESS,
      attempt: Number(entry.attempt || 1),
      maxRetries: Number(entry.maxRetries || 3),
      exitCode: entry.exitCode ?? null,
      lastError: "",
      sessionId: entry.sessionId || "",
      ackTimeout: Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS),
      nextRetryAt: "",
      progressPercent,
      progressStatus,
      progressAt,
      progressBy: by
    });
    updateDispatchSourceState(config.memoryDir, job, {
      deliveryState: ASYNC_CALL_STATES.PROGRESS,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: Number(entry.attempt || 1),
      maxRetries: Number(entry.maxRetries || 3),
      nextRetryAt: "",
      sessionId: entry.sessionId || "",
      lastError: "",
      progressPercent,
      progressStatus,
      progressAt,
      progressBy: by
    });

    const latest = findLatestRelayStatusEntry(config.memoryDir, {
      threadKey: getDispatchThreadKey(job)
    });
    console.log(JSON.stringify({
      ok: true,
      state: ASYNC_CALL_STATES.PROGRESS,
      threadKey: getDispatchThreadKey(job),
      sourceKind: job.kind,
      sourceId: job.refId,
      tool: job.tool,
      project: job.project,
      progressPercent,
      progressStatus,
      progressAt,
      progressBy: by,
      latest
    }, null, 2));
  }, config.sync.lockStaleMs);
}

function buildRecentRelayStatusView(memoryDir, { project = "", tool = "", state = "", limit = 20 }) {
  const filteredEntries = Object.values(readLatestRelayStatusByThread(memoryDir))
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => tool ? entry.tool === tool : true)
    .filter((entry) => state ? entry.state === state : true)
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  const latestEntries = filteredEntries.slice(0, Math.max(1, Number(limit || 20)));
  const latestRuns = readLatestDispatchRunByThread(memoryDir);

  const countsByState = {};
  const countsByTool = {};
  for (const entry of filteredEntries) {
    const stateKey = entry.state || "unknown";
    const toolKey = entry.tool || "unknown";
    countsByState[stateKey] = (countsByState[stateKey] || 0) + 1;
    countsByTool[toolKey] = (countsByTool[toolKey] || 0) + 1;
  }

  return {
    found: latestEntries.length > 0,
    mode: "recent",
    query: {
      recent: limit,
      project,
      tool,
      state
    },
    summary: {
      totalMatched: filteredEntries.length,
      returned: latestEntries.length,
      countsByState,
      countsByTool
    },
    items: latestEntries.map((entry) => ({
      threadKey: entry.threadKey || "",
      thread: entry.thread || "",
      project: entry.project || "",
      tool: entry.tool || "",
      state: entry.state || "",
      sourceKind: entry.sourceKind || "",
      sourceId: entry.sourceId || "",
      attempt: Number(entry.attempt || 0),
      maxRetries: Number(entry.maxRetries || 0),
      progressPercent: entry.progressPercent ?? null,
      progressStatus: entry.progressStatus || "",
      progressAt: entry.progressAt || "",
      progressBy: entry.progressBy || "",
      nextRetryAt: entry.nextRetryAt || "",
      latestRunId: latestRuns[entry.threadKey || ""]?.runId || "",
      latestRunStatus: latestRuns[entry.threadKey || ""]?.status || "",
      latestRunFinishedAt: latestRuns[entry.threadKey || ""]?.finishedAt || "",
      lastError: summarizeText(entry.lastError || "", 120),
      ts: entry.ts || ""
    }))
  };
}

function resolveRelayThreadKeys(memoryDir, { threadKey = "", thread = "", refId = "", project = "", tool = "" }) {
  if (threadKey) {
    return new Set([threadKey]);
  }
  if (!thread && !refId) {
    return null;
  }
  const keys = new Set();
  for (const entry of readRelayStatus(memoryDir)) {
    if (thread && entry.thread === thread) {
      if ((!project || entry.project === project) && (!tool || entry.tool === tool)) {
        keys.add(entry.threadKey);
      }
    }
    if (refId && (entry.sourceId === refId || entry.dispatchId === refId)) {
      if ((!project || entry.project === project) && (!tool || entry.tool === tool)) {
        keys.add(entry.threadKey);
      }
    }
  }
  return keys;
}

function findLatestRelayStatusEntry(memoryDir, { threadKey = "", thread = "", refId = "", project = "", tool = "" }) {
  const matches = readRelayStatus(memoryDir)
    .filter((entry) => threadKey ? entry.threadKey === threadKey : true)
    .filter((entry) => thread ? entry.thread === thread || entry.threadKey === thread : true)
    .filter((entry) => refId
      ? entry.sourceId === refId
        || entry.dispatchId === refId
        || entry.dispatchId === `task:${refId}`
        || entry.dispatchId === `radio:${refId}`
        || entry.dispatchId === `workflow:${refId}`
      : true)
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => tool ? entry.tool === tool : true)
    .sort((a, b) => String(a.ts || a.updatedAt || "").localeCompare(String(b.ts || b.updatedAt || "")));
  return matches.at(-1) || null;
}

function parseProgressPercent(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("--percent must be a number from 0 to 100.");
  }
  return Math.round(percent);
}

function resolveRelaySourceObject(memoryDir, entry) {
  if (!entry?.sourceKind || !entry?.sourceId) {
    return null;
  }
  if (entry.sourceKind === "radio") {
    return readRadioMessages(memoryDir).find((message) => message.id === entry.sourceId) || null;
  }
  if (entry.sourceKind === "task") {
    return readTasks(memoryDir).find((task) => task.id === entry.sourceId) || null;
  }
  if (entry.sourceKind === "workflow") {
    return readWorkflows(memoryDir).find((workflow) => workflow.id === entry.sourceId) || null;
  }
  return null;
}

function resolveRelayRelatedObjects(memoryDir, entry, source = null) {
  const thread = entry?.thread || "";
  const project = entry?.project || "";
  const radios = readRadioMessages(memoryDir)
    .filter((message) => thread ? message.thread === thread : false)
    .filter((message) => project ? message.project === project : true);
  const workflows = readWorkflows(memoryDir)
    .filter((workflow) => thread ? workflow.id === thread : false)
    .filter((workflow) => project ? workflow.project === project : true);
  const linkedTaskIds = new Set(workflows.flatMap((workflow) => workflow.linkedTasks || []));
  const tasks = readTasks(memoryDir)
    .filter((task) => thread ? task.id === thread || linkedTaskIds.has(task.id) : false)
    .filter((task) => project ? task.project === project : true);

  return {
    radios,
    tasks,
    workflows,
    sourceTask: source?.id ? tasks.find((task) => task.id === source.id) || null : null,
    sourceWorkflow: source?.id ? workflows.find((workflow) => workflow.id === source.id) || null : null
  };
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
  const relayState = readLatestRelayStatusBySource(memoryDir);
  for (const job of jobs) {
    const runner = getToolRunner(job.tool);
    if (!runner.available) {
      const result = {
        ...job,
        runnable: false,
        reason: runner.reason
      };
      if (run && !runner.sharedStateOnly) {
        const attempt = nextRelayAttempt(relayState, job);
        const maxRetries = 3;
        const state = getRelayFailureState(attempt, maxRetries);
        appendRelayStatus(memoryDir, job, {
          state,
          attempt,
          maxRetries,
          exitCode: null,
          lastError: runner.reason,
          sessionId: "",
          ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
          nextRetryAt: computeNextRetryAt(attempt, maxRetries)
        });
        updateDispatchSourceState(memoryDir, job, {
          deliveryState: state,
          dispatchId: job.id,
          threadKey: getDispatchThreadKey(job),
          attempt,
          maxRetries,
          nextRetryAt: computeNextRetryAt(attempt, maxRetries),
          sessionId: "",
          lastError: runner.reason
        });
        const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: state });
        appendDispatchLog(memoryDir, result);
        applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, state, {
          statusMessage
        });
      }
      results.push(result);
      continue;
    }
    if (!run) {
      const sourceKey = getDispatchSourceKey(job);
      results.push({
        ...job,
        runnable: true,
        dryRun: true,
        command: runner.preview,
        relayState: relayState[sourceKey]?.state || "pending",
        attempt: relayState[sourceKey]?.attempt || 0
      });
      continue;
    }
    const attempt = nextRelayAttempt(relayState, job);
    const maxRetries = 3;
    appendRelayStatus(memoryDir, job, {
      state: "dispatched",
      attempt,
      maxRetries,
      exitCode: null,
      lastError: "",
      sessionId: "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "dispatched",
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt,
      maxRetries,
      nextRetryAt: "",
      sessionId: "",
      lastError: ""
    });
    const result = runDispatchJob(memoryDir, job, runner);
    if (result.exitCode === 0) {
      appendRelayStatus(memoryDir, job, {
        state: "acked",
        attempt,
        maxRetries,
        exitCode: 0,
        lastError: "",
        sessionId: result.sessionId || "",
        ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        nextRetryAt: ""
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: "acked",
        dispatchId: job.id,
        threadKey: getDispatchThreadKey(job),
        attempt,
        maxRetries,
        nextRetryAt: "",
        sessionId: result.sessionId || "",
        lastError: ""
      });
    }
    const finalState = result.exitCode === 0 ? "completed" : getRelayFailureState(attempt, maxRetries);
    const nextRetryAt = result.exitCode === 0 ? "" : computeNextRetryAt(attempt, maxRetries);
    const lastError = result.exitCode === 0 ? "" : (result.error || result.stderr || "");
    appendRelayStatus(memoryDir, job, {
      state: finalState,
      attempt,
      maxRetries,
      exitCode: result.exitCode,
      lastError,
      sessionId: result.sessionId || "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      nextRetryAt
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: finalState,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt,
      maxRetries,
      nextRetryAt,
      sessionId: result.sessionId || "",
      lastError
    });
    const responseMessage = appendDispatchResponseMessage(memoryDir, job, { ...result, relayState: finalState });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: finalState });
    const enrichedResult = {
      ...result,
      relayState: finalState,
      attempt,
      maxRetries,
      nextRetryAt,
      responseRadioId: responseMessage?.id || "",
      statusRadioId: statusMessage?.id || ""
    };
    appendDispatchLog(memoryDir, enrichedResult);
    applyDispatchOutcome(memoryDir, job, enrichedResult, finalState, {
      responseMessage,
      statusMessage
    });
    results.push(enrichedResult);
  }
  return results;
}

function executeDispatchRetry(memoryDir, { run = false, to = "", project = "", limit = 10 }) {
  const timeoutResults = run
    ? markTimedOutRelayStatuses(memoryDir, { to, project })
    : [];
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const jobs = buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit });
  const results = [...timeoutResults];
  for (const job of jobs) {
    const runner = getToolRunner(job.tool);
    if (!runner.available) {
      const result = {
        ...job,
        runnable: false,
        reason: runner.reason
      };
      if (run && !runner.sharedStateOnly) {
        const state = getRelayFailureState(job.attempt, job.maxRetries || 3);
        appendRelayStatus(memoryDir, job, {
          state,
          attempt: job.attempt,
          maxRetries: job.maxRetries || 3,
          exitCode: null,
          lastError: runner.reason,
          sessionId: "",
          ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
          nextRetryAt: computeNextRetryAt(job.attempt, job.maxRetries || 3)
        });
        updateDispatchSourceState(memoryDir, job, {
          deliveryState: state,
          dispatchId: job.id,
          threadKey: getDispatchThreadKey(job),
          attempt: job.attempt,
          maxRetries: job.maxRetries || 3,
          nextRetryAt: computeNextRetryAt(job.attempt, job.maxRetries || 3),
          sessionId: "",
          lastError: runner.reason
        });
        const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: state });
        appendDispatchLog(memoryDir, result);
        applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, state, {
          statusMessage
        });
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
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      nextRetryAt: ""
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "retrying",
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: job.attempt,
      maxRetries: job.maxRetries || 3,
      nextRetryAt: "",
      sessionId: "",
      lastError: ""
    });
    const result = runDispatchJob(memoryDir, job, runner);
    if (result.exitCode === 0) {
      appendRelayStatus(memoryDir, job, {
        state: "acked",
        attempt: job.attempt,
        maxRetries: job.maxRetries || 3,
        exitCode: 0,
        lastError: "",
        sessionId: result.sessionId || "",
        ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        nextRetryAt: ""
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: "acked",
        dispatchId: job.id,
        threadKey: getDispatchThreadKey(job),
        attempt: job.attempt,
        maxRetries: job.maxRetries || 3,
        nextRetryAt: "",
        sessionId: result.sessionId || "",
        lastError: ""
      });
    }
    const finalState = result.exitCode === 0
      ? "completed"
      : getRelayFailureState(job.attempt, job.maxRetries || 3);
    const nextRetryAt = result.exitCode === 0 ? "" : computeNextRetryAt(job.attempt, job.maxRetries || 3);
    const lastError = result.exitCode === 0 ? "" : (result.error || result.stderr || "");
    appendRelayStatus(memoryDir, job, {
      state: finalState,
      attempt: job.attempt,
      maxRetries: job.maxRetries || 3,
      exitCode: result.exitCode,
      lastError,
      sessionId: result.sessionId || "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      nextRetryAt
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: finalState,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: job.attempt,
      maxRetries: job.maxRetries || 3,
      nextRetryAt,
      sessionId: result.sessionId || "",
      lastError
    });
    const responseMessage = appendDispatchResponseMessage(memoryDir, job, { ...result, relayState: finalState });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: finalState });
    const enrichedResult = {
      ...result,
      retry: true,
      relayState: finalState,
      attempt: job.attempt,
      maxRetries: job.maxRetries || 3,
      nextRetryAt,
      responseRadioId: responseMessage?.id || "",
      statusRadioId: statusMessage?.id || ""
    };
    appendDispatchLog(memoryDir, enrichedResult);
    applyDispatchOutcome(memoryDir, job, enrichedResult, finalState, {
      responseMessage,
      statusMessage
    });
    results.push(enrichedResult);
  }
  return results;
}

function markTimedOutRelayStatuses(memoryDir, { to = "", project = "", now = Date.now() } = {}) {
  const timedOutEntries = Object.values(readLatestRelayStatusBySource(memoryDir))
    .filter((entry) => to ? entry.tool === to : true)
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => isRelayTimedOut(entry, now));
  const results = [];

  for (const entry of timedOutEntries) {
    const job = rebuildDispatchJobFromRelay(memoryDir, entry) || dispatchJobFromRelayEntry(entry);
    if (!job?.refId) {
      continue;
    }

    const attempt = Number(entry.attempt || 1);
    const maxRetries = Number(entry.maxRetries || 3);
    const state = getRelayFailureState(attempt, maxRetries);
    const timeoutMs = Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS);
    const lastError = `Timeout: no response within ackTimeout (${timeoutMs}ms) while relay was ${entry.state || "unknown"}`;
    const nextRetryAt = state === ASYNC_CALL_STATES.FAILED
      ? computeNextRetryAt(attempt, maxRetries)
      : "";
    const result = {
      ...job,
      runnable: true,
      timeout: true,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: lastError,
      sessionId: entry.sessionId || "",
      relayState: state
    };

    appendRelayStatus(memoryDir, job, {
      state,
      attempt,
      maxRetries,
      exitCode: null,
      lastError,
      sessionId: entry.sessionId || "",
      ackTimeout: timeoutMs,
      nextRetryAt
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: state,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt,
      maxRetries,
      nextRetryAt,
      sessionId: entry.sessionId || "",
      lastError
    });

    const statusMessage = appendDispatchStatusMessage(memoryDir, job, result);
    const enrichedResult = {
      ...result,
      statusRadioId: statusMessage?.id || ""
    };
    appendDispatchLog(memoryDir, enrichedResult);
    applyDispatchOutcome(memoryDir, job, enrichedResult, state, { statusMessage });
    results.push(enrichedResult);
  }

  return results;
}

function dispatchJobFromRelayEntry(entry) {
  return {
    id: entry.dispatchId || `${entry.sourceKind || "relay"}:${entry.sourceId || entry.id || ""}`,
    kind: entry.sourceKind || "relay",
    tool: entry.tool || "",
    project: entry.project || "",
    text: "",
    refId: entry.sourceId || "",
    thread: entry.thread || entry.sourceId || ""
  };
}

function isRelayTimedOut(entry, now = Date.now()) {
  if (!entry || ![
    ASYNC_CALL_STATES.DISPATCHED,
    ASYNC_CALL_STATES.ACKED,
    ASYNC_CALL_STATES.PROGRESS,
    ASYNC_CALL_STATES.RETRYING
  ].includes(entry.state || "")) {
    return false;
  }
  const timeoutMs = Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS);
  if (timeoutMs <= 0) {
    return false;
  }
  const baseMs = getRelayTimeoutBaseMs(entry);
  return Number.isFinite(baseMs) && baseMs + timeoutMs <= now;
}

function getRelayTimeoutBaseMs(entry) {
  const candidates = [
    entry.progressAt,
    entry.dispatchedAt,
    entry.deliveryUpdatedAt,
    entry.ts,
    entry.updatedAt
  ];
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate || "");
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Number.NaN;
}

function applyDispatchOutcome(memoryDir, job, result, relayState, { responseMessage = null, statusMessage = null } = {}) {
  if (job?.kind !== "task" || !job.refId) {
    return null;
  }
  const now = new Date().toISOString();
  const completed = relayState === ASYNC_CALL_STATES.COMPLETED;
  const failed = [ASYNC_CALL_STATES.FAILED, ASYNC_CALL_STATES.ABANDONED].includes(relayState);
  const reportPath = completed ? writeDispatchReportIfUseful(memoryDir, job, result, relayState) : "";
  const responseSummary = summarizeText(result.stdout || "", 220);
  const errorSummary = summarizeText(result.error || result.stderr || "", 220);
  let outcomeNoteText = "";

  const updatedTask = updateTask(memoryDir, job.refId, (task) => {
    const notes = [...(task.notes || [])];
    if (completed) {
      const parts = [`Dispatch completed by ${job.tool || "unknown"}.`];
      if (responseSummary) {
        parts.push(`Response: ${responseSummary}`);
      }
      if (reportPath) {
        parts.push(`Report: ${reportPath}`);
      }
      outcomeNoteText = parts.join(" ");
      notes.push(createTaskNote("ai-memory-hub", outcomeNoteText));
    } else if (failed) {
      outcomeNoteText = `Dispatch ${relayState} for ${job.tool || "unknown"}: ${errorSummary || "no error output"}`;
      notes.push(createTaskNote("ai-memory-hub", outcomeNoteText));
    }

    return {
      ...task,
      status: completed ? "done" : task.status,
      assignee: task.assignee || job.tool || "",
      updatedAt: now,
      completedAt: completed ? now : task.completedAt || "",
      deliveryState: relayState,
      deliveryUpdatedAt: now,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: Number(result.attempt || task.attempt || 0),
      maxRetries: Number(result.maxRetries || task.maxRetries || 0),
      nextRetryAt: result.nextRetryAt || task.nextRetryAt || "",
      sessionId: result.sessionId || task.sessionId || "",
      lastError: failed ? (result.error || result.stderr || task.lastError || "") : "",
      responseRadioId: responseMessage?.id || task.responseRadioId || "",
      statusRadioId: statusMessage?.id || task.statusRadioId || "",
      dispatchReportPath: reportPath || task.dispatchReportPath || "",
      notes
    };
  });
  syncLinkedWorkflowDeliveryState(memoryDir, updatedTask, {
    deliveryState: relayState,
    dispatchId: job.id,
    threadKey: getDispatchThreadKey(job),
    attempt: Number(result.attempt || updatedTask.attempt || 0),
    maxRetries: Number(result.maxRetries || updatedTask.maxRetries || 0),
    nextRetryAt: result.nextRetryAt || updatedTask.nextRetryAt || "",
    sessionId: result.sessionId || updatedTask.sessionId || "",
    lastError: failed ? (result.error || result.stderr || updatedTask.lastError || "") : "",
    responseRadioId: responseMessage?.id || updatedTask.responseRadioId || "",
    statusRadioId: statusMessage?.id || updatedTask.statusRadioId || "",
    dispatchReportPath: reportPath || updatedTask.dispatchReportPath || "",
    noteText: outcomeNoteText ? `Linked task ${updatedTask.id}: ${outcomeNoteText}` : ""
  });
  return updatedTask;
}

function syncLinkedWorkflowDeliveryState(memoryDir, task, patch = {}) {
  if (!task?.id) {
    return [];
  }
  const workflows = readWorkflows(memoryDir).filter((workflow) => (workflow.linkedTasks || []).includes(task.id));
  if (workflows.length === 0) {
    return [];
  }
  const tasks = readTasks(memoryDir);
  const updated = [];
  for (const workflow of workflows) {
    const aggregate = summarizeWorkflowLinkedTaskDelivery(workflow, tasks, patch);
    const next = updateWorkflow(memoryDir, workflow.id, (current) => {
      const notes = [...(current.notes || [])];
      if (patch.noteText && !notes.some((note) => note.text === patch.noteText)) {
        notes.push(createTaskNote("ai-memory-hub", patch.noteText));
      }
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        deliveryState: aggregate.deliveryState,
        deliveryUpdatedAt: new Date().toISOString(),
        dispatchId: patch.dispatchId || current.dispatchId || "",
        threadKey: patch.threadKey || current.threadKey || "",
        attempt: Number(patch.attempt || current.attempt || 0),
        maxRetries: Number(patch.maxRetries || current.maxRetries || 0),
        nextRetryAt: aggregate.nextRetryAt || patch.nextRetryAt || current.nextRetryAt || "",
        sessionId: patch.sessionId || current.sessionId || "",
        lastError: aggregate.lastError || patch.lastError || "",
        progressPercent: aggregate.progressPercent,
        progressStatus: aggregate.progressStatus,
        progressAt: aggregate.progressAt || current.progressAt || "",
        progressBy: aggregate.progressBy || current.progressBy || "",
        responseRadioId: patch.responseRadioId || current.responseRadioId || "",
        statusRadioId: patch.statusRadioId || current.statusRadioId || "",
        dispatchReportPath: patch.dispatchReportPath || current.dispatchReportPath || "",
        notes
      };
    });
    updated.push(next);
  }
  return updated;
}

function summarizeWorkflowLinkedTaskDelivery(workflow, tasks, patch = {}) {
  const linkedTasks = (workflow.linkedTasks || [])
    .map((id) => tasks.find((task) => task.id === id))
    .filter(Boolean);
  if (linkedTasks.length === 0) {
    return {
      deliveryState: patch.deliveryState || workflow.deliveryState || "",
      progressPercent: workflow.progressPercent ?? null,
      progressStatus: workflow.progressStatus || "",
      progressAt: workflow.progressAt || "",
      progressBy: workflow.progressBy || "",
      lastError: patch.lastError || workflow.lastError || "",
      nextRetryAt: patch.nextRetryAt || workflow.nextRetryAt || ""
    };
  }

  const states = linkedTasks.map((task) => task.deliveryState || "").filter(Boolean);
  const completedCount = linkedTasks.filter((task) => task.status === "done" || task.deliveryState === ASYNC_CALL_STATES.COMPLETED).length;
  const failedTask = linkedTasks.find((task) => [ASYNC_CALL_STATES.ABANDONED, ASYNC_CALL_STATES.FAILED].includes(task.deliveryState));
  const statePriority = [
    ASYNC_CALL_STATES.ABANDONED,
    ASYNC_CALL_STATES.FAILED,
    ASYNC_CALL_STATES.RETRYING,
    ASYNC_CALL_STATES.PROGRESS,
    ASYNC_CALL_STATES.ACKED,
    ASYNC_CALL_STATES.DISPATCHED
  ];
  let deliveryState = statePriority.find((state) => states.includes(state)) || "";
  if (!deliveryState && completedCount === linkedTasks.length) {
    deliveryState = ASYNC_CALL_STATES.COMPLETED;
  } else if (!deliveryState && completedCount > 0) {
    deliveryState = ASYNC_CALL_STATES.PROGRESS;
  } else if (!deliveryState) {
    deliveryState = patch.deliveryState || workflow.deliveryState || "";
  }

  return {
    deliveryState,
    progressPercent: Math.round((completedCount / linkedTasks.length) * 100),
    progressStatus: `${completedCount}/${linkedTasks.length} linked tasks completed`,
    progressAt: patch.progressAt || new Date().toISOString(),
    progressBy: patch.progressBy || patch.tool || "",
    lastError: failedTask?.lastError || patch.lastError || "",
    nextRetryAt: linkedTasks
      .map((task) => task.nextRetryAt || "")
      .filter(Boolean)
      .sort()[0] || patch.nextRetryAt || ""
  };
}

function writeDispatchReportIfUseful(memoryDir, job, result, relayState) {
  const stdout = String(result.stdout || "").trim();
  if (!stdout || !shouldPersistDispatchReport(job, stdout)) {
    return "";
  }
  const idPart = String(job.refId || job.id || "dispatch").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 40);
  const tsPart = new Date().toISOString().replace(/[:.]/g, "-");
  const relativePath = path.join(RESEARCH_REPORTS_DIR, `${tsPart}-${idPart}.md`);
  const file = path.join(memoryDir, relativePath);
  ensureDir(path.dirname(file));
  const lines = [
    `# Dispatch Report: ${job.refId || job.id}`,
    "",
    `- Tool: ${job.tool || "unknown"}`,
    `- Project: ${job.project || ""}`,
    `- Kind: ${job.kind || ""}`,
    `- State: ${relayState || ""}`,
    `- Thread: ${job.thread || ""}`,
    `- Created: ${new Date().toISOString()}`,
    "",
    "## Task",
    "",
    job.text || "",
    "",
    "## Response",
    "",
    stdout,
    ""
  ];
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  return relativePath.replace(/\\/g, "/");
}

function shouldPersistDispatchReport(job, stdout) {
  const text = `${job?.text || ""}\n${stdout || ""}`;
  return /调研|研究|报告|分析|review|audit|investigat|research|feasibility|评估/i.test(text);
}

function updateDispatchSourceState(memoryDir, job, patch) {
  if (!job || !job.refId) {
    return;
  }
  const statePatch = {
    deliveryState: patch.deliveryState || "",
    deliveryUpdatedAt: new Date().toISOString(),
    dispatchId: patch.dispatchId || "",
    threadKey: patch.threadKey || "",
    attempt: Number(patch.attempt || 0),
    maxRetries: Number(patch.maxRetries || 0),
    nextRetryAt: patch.nextRetryAt || "",
    sessionId: patch.sessionId || "",
    lastError: String(patch.lastError || "").trim(),
    progressPercent: patch.progressPercent ?? null,
    progressStatus: patch.progressStatus || "",
    progressAt: patch.progressAt || "",
    progressBy: patch.progressBy || ""
  };
  if (job.kind === "radio") {
    updateRadioMessage(memoryDir, job.refId, statePatch);
    return;
  }
  if (job.kind === "task") {
    const updatedTask = updateTask(memoryDir, job.refId, (task) => ({
      ...task,
      ...statePatch,
      updatedAt: new Date().toISOString()
    }));
    syncLinkedWorkflowDeliveryState(memoryDir, updatedTask, statePatch);
    return;
  }
  if (job.kind === "workflow") {
    updateWorkflow(memoryDir, job.refId, (workflow) => ({
      ...workflow,
      ...statePatch,
      updatedAt: new Date().toISOString()
    }));
  }
}

function isDispatchableRadioMessage(message) {
  const type = message.type || "note";
  if (type === "status" || type === "response") {
    return false;
  }
  return true;
}

function isClosedDispatchSourceState(state) {
  return ["completed", "delivered", "done", "cancelled"].includes(String(state || "").trim().toLowerCase());
}

function isDirectDispatchRadioMessage(message, to = "") {
  if (!isDispatchableRadioMessage(message)) {
    return false;
  }
  if (isClosedDispatchSourceState(message?.deliveryState || message?.status)) {
    return false;
  }
  const target = normalizeToolName(message?.to || "");
  if (!target || target === "all") {
    return false;
  }
  const requested = normalizeToolName(to || "");
  return requested ? target === requested : true;
}

function isRadioLinkedToClosedSource(memoryDir, message) {
  const refs = [message?.thread, message?.replyTo]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (refs.length === 0) {
    return false;
  }
  const refSet = new Set(refs);
  const closedTask = readTasks(memoryDir)
    .some((task) => refSet.has(task.id) && isClosedDispatchSourceState(task.status || task.deliveryState));
  if (closedTask) {
    return true;
  }
  return readWorkflows(memoryDir)
    .some((workflow) => refSet.has(workflow.id) && isClosedDispatchSourceState(workflow.status || workflow.deliveryState));
}

function buildDispatchJobs(memoryDir, { to, project, limit, force }) {
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const dispatched = force ? new Set() : readDispatchLog(memoryDir)
    .filter((item) => item.runnable && item.exitCode === 0)
    .reduce((set, item) => set.add(item.id), new Set());
  const messages = readRadioMessages(memoryDir)
    .filter((message) => project ? message.project === project : true)
    .filter((message) => isDirectDispatchRadioMessage(message, to))
    .filter((message) => !isRadioLinkedToClosedSource(memoryDir, message))
    .slice(-limit)
    .map((message) => ({
      id: `radio:${message.id}`,
      kind: "radio",
      tool: normalizeToolName(message.to),
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
    .filter((job) => shouldDispatchJob(relayState, job, force))
    .slice(0, limit);
}

function shouldDispatchJob(relayState, job, force = false) {
  if (force) {
    return true;
  }
  const latest = relayState[getDispatchSourceKey(job)];
  if (!latest) {
    return true;
  }
  const state = latest.state || "";
  return state === "pending";
}

function buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit }) {
  const now = Date.now();
  const candidates = Object.values(relayState)
    .filter((entry) => isRelayRetryCandidate(entry, now))
    .filter((entry) => Number(entry.attempt || 0) < Number(entry.maxRetries || 3))
    .filter((entry) => isRelayRetryRunnable(entry))
    .filter((entry) => to ? entry.tool === to : true)
    .filter((entry) => project ? entry.project === project : true)
    .slice(0, limit);

  return candidates
    .map((entry) => {
      const job = rebuildDispatchJobFromRelay(memoryDir, entry);
      if (!job || !shouldRetryJob(job)) {
        return null;
      }
      return {
        ...job,
        attempt: Number(entry.attempt || 0) + 1,
        maxRetries: Number(entry.maxRetries || 3)
      };
    })
    .filter(Boolean);
}

function rebuildDispatchJobFromRelay(memoryDir, entry) {
  if (entry.sourceKind === "radio") {
    const message = readRadioMessages(memoryDir).find((item) => item.id === entry.sourceId);
    if (!message) return null;
    if (!isDirectDispatchRadioMessage(message, entry.tool || message.to)) return null;
    if (isRadioLinkedToClosedSource(memoryDir, message)) return null;
    return {
      id: `radio:${message.id}`,
      kind: "radio",
      tool: normalizeToolName(entry.tool || message.to),
      project: message.project || "",
      text: message.text,
      refId: message.id,
      thread: message.thread || message.id
    };
  }
  if (entry.sourceKind === "task") {
    const task = readTasks(memoryDir).find((item) => item.id === entry.sourceId);
    if (!task) return null;
    if (isClosedDispatchSourceState(task.status || task.deliveryState)) return null;
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
  if (entry.sourceKind === "workflow") {
    const workflow = readWorkflows(memoryDir).find((item) => item.id === entry.sourceId);
    if (!workflow) return null;
    if (isClosedDispatchSourceState(workflow.status || workflow.deliveryState)) return null;
    return {
      id: `workflow:${workflow.id}`,
      kind: "workflow",
      tool: entry.tool || "",
      project: workflow.project || "",
      text: `${workflow.title}${workflow.plan ? `\nPlan: ${workflow.plan}` : ""}`,
      refId: workflow.id,
      thread: workflow.id
    };
  }
  return null;
}

function shouldRetryJob(job) {
  if (!job?.tool) {
    return false;
  }
  const runner = getToolRunner(job.tool);
  return !runner.sharedStateOnly;
}

function getRunnerProfile(tool) {
  return RUNNER_PROFILES[normalizeToolName(tool)] || null;
}

function getKnownRunnerToolNames() {
  return Object.keys(RUNNER_PROFILES);
}

function normalizeToolName(tool) {
  return String(tool || "").trim().toLowerCase();
}

function getToolRunner(tool) {
  const name = normalizeToolName(tool);
  const profile = getRunnerProfile(name);
  if (!profile) {
    return {
      tool: name,
      available: false,
      reason: `${name || "unknown"} has shared instructions but no verified CLI runner on this machine`
    };
  }
  if (profile.sharedStateOnly) {
    return {
      ...profile,
      available: false,
      sharedStateOnly: true,
      reason: profile.reason || `${profile.tool} is shared-state-only`
    };
  }

  const resolution = resolveRunnerCommand(profile);
  if (!resolution.path) {
    return {
      ...profile,
      available: false,
      reason: `${profile.tool} CLI not found in PATH`,
      commandCandidates: profile.commandCandidates || [profile.command].filter(Boolean),
      resolvedCommands: resolution.allPaths || []
    };
  }
  if (resolution.kind === "powershell-shim") {
    return {
      ...profile,
      available: false,
      reason: `${profile.tool} only resolved to a PowerShell .ps1 shim; install a .cmd/.exe shim or use a direct Node entry point for safe dispatch`,
      commandName: resolution.name,
      commandKind: resolution.kind,
      commandPath: resolution.path,
      resolvedCommands: resolution.allPaths
    };
  }

  const shell = shouldUseShellForCommand(resolution.path);
  return {
    ...profile,
    available: true,
    command: resolution.path,
    commandName: resolution.name,
    commandKind: resolution.kind,
    commandPath: resolution.path,
    resolvedCommands: resolution.allPaths,
    usesShell: shell,
    shell: shell ? "cmd.exe" : "none",
    preview: profile.preview || `${profile.tool} <${profile.promptMode || "argv"}>`
  };
}

function resolveRunnerCommand(profile) {
  const candidates = profile.commandCandidates || [profile.command].filter(Boolean);
  const allPaths = [];
  for (const candidate of candidates) {
    for (const found of resolveCommandPaths(candidate)) {
      if (!allPaths.includes(found)) {
        allPaths.push(found);
      }
    }
  }
  if (process.platform === "win32" && profile.windowsExeFromCmd) {
    const found = allPaths.find((item) => classifyCommandPath(item) === "cmd-shim");
    if (found) {
      const exe = path.join(path.dirname(found), profile.windowsExeFromCmd);
      if (fs.existsSync(exe) && !allPaths.includes(exe)) {
        allPaths.push(exe);
      }
    }
  }
  const pathValue = choosePreferredCommandPath(allPaths);
  return {
    name: pathValue ? path.basename(pathValue) : "",
    path: pathValue,
    kind: pathValue ? classifyCommandPath(pathValue) : "",
    allPaths
  };
}

function runDispatchJob(memoryDir, job, runner) {
  const prompt = renderDispatchPrompt(memoryDir, job);
  const args = buildRunnerArgs(memoryDir, job, runner, prompt);
  const input = runner.promptMode === "stdin" ? prompt : "";
  const runId = createDispatchRunId(job);
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const invocation = buildRunnerInvocation(runner, args);
  const completed = invokeRunnerCommand(runner, args, input, DEFAULT_DISPATCH_RUN_TIMEOUT_MS);
  const finishedAtMs = Date.now();
  const finishedAt = new Date(finishedAtMs).toISOString();
  const parsed = parseRunnerOutput(memoryDir, job, runner, completed.stdout);
  const normalizedStderr = normalizeRunnerStderr(job.tool, completed.stderr);
  const stdoutLogPath = writeDispatchRunLog(memoryDir, runId, "stdout", completed.stdout);
  const stderrLogPath = writeDispatchRunLog(memoryDir, runId, "stderr", completed.stderr);
  const runStatus = getDispatchRunStatus(completed);
  const verificationResult = getDispatchRunVerificationResult(runStatus, completed.status);
  const errorSummary = summarizeText(completed.error?.message || normalizedStderr.stderr || "", 220);
  const runRecord = {
    runId,
    dispatchId: job.id,
    threadKey: getDispatchThreadKey(job),
    sourceKind: job.kind || "",
    sourceId: job.refId || "",
    tool: job.tool || "",
    project: job.project || "",
    command: invocation.command,
    commandArgs: invocation.args,
    commandLine: invocation.commandLine,
    cwd: process.cwd(),
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    timeoutMs: DEFAULT_DISPATCH_RUN_TIMEOUT_MS,
    exitCode: completed.status ?? null,
    status: runStatus,
    errorSummary,
    stdoutLogPath,
    stderrLogPath,
    stdoutBytes: Buffer.byteLength(String(completed.stdout || ""), "utf8"),
    stderrBytes: Buffer.byteLength(String(completed.stderr || ""), "utf8"),
    verificationResult
  };
  appendDispatchRunRecord(memoryDir, runRecord);
  return {
    ...job,
    runnable: true,
    exitCode: completed.status,
    stdout: trimOutput(parsed.stdout),
    stderr: trimOutput(normalizedStderr.stderr),
    stderrWarnings: normalizedStderr.warnings,
    error: completed.error ? completed.error.message : "",
    sessionId: parsed.sessionId || "",
    runnerMode: runner.promptMode || "",
    runnerCommand: runner.commandName || runner.command || "",
    runnerShell: runner.usesShell ? runner.shell || "shell" : "",
    runId,
    runStatus,
    runStartedAt: startedAt,
    runFinishedAt: finishedAt,
    runDurationMs: Math.max(0, finishedAtMs - startedAtMs),
    stdoutLogPath,
    stderrLogPath,
    runRecordPath: path.join("state", "dispatch-runs.jsonl").replace(/\\/g, "/"),
    verificationResult
  };
}

function buildRunnerInvocation(runner, args = []) {
  const useCmdLauncher = process.platform === "win32" && runner.usesShell;
  const command = useCmdLauncher ? buildWindowsCmdLine(runner.command, args) : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  return {
    command: runner.commandName || runner.command || "",
    args: args.map((arg) => String(arg)),
    commandLine: [command, ...commandArgs].filter(Boolean).join(" "),
    usesShell: useCmdLauncher
  };
}

function invokeRunnerCommand(runner, args = [], input = "", timeoutMs = DEFAULT_DISPATCH_RUN_TIMEOUT_MS) {
  const invocation = buildRunnerInvocation(runner, args);
  const useCmdLauncher = invocation.usesShell;
  const command = useCmdLauncher ? invocation.commandLine : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  return spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    shell: useCmdLauncher,
    input
  });
}

function buildWindowsCmdLine(command, args = []) {
  return [command, ...(args || [])].map(quoteWindowsCmdArg).join(" ");
}

function quoteWindowsCmdArg(value) {
  const text = String(value ?? "");
  if (!text) {
    return "\"\"";
  }
  return `"${text.replace(/"/g, "\"\"").replace(/[%^&|<>()]/g, "^$&")}"`;
}

function normalizeRunnerStderr(tool, stderr) {
  const text = String(stderr || "");
  if (!text.trim()) {
    return { stderr: "", warnings: [] };
  }
  const lines = text.split(/\r?\n/);
  const warnings = [];
  const kept = [];
  for (const line of lines) {
    if (tool === "gemini" && isKnownGeminiWarning(line)) {
      warnings.push(line.trim());
      continue;
    }
    kept.push(line);
  }
  return {
    stderr: kept.join("\n").trim(),
    warnings: warnings.filter(Boolean)
  };
}

function isKnownGeminiWarning(line) {
  return /skill conflict|conflicting skill|duplicate skill|true color|256-color|ripgrep is not available/i.test(String(line || ""));
}

function buildRunnerArgs(memoryDir, job, runner, prompt) {
  const args = [...(runner.args || [])];
  const sessionId = runner.capabilities?.includes("session-resume")
    ? readClaudeSessionState(memoryDir)[getDispatchThreadKey(job)] || ""
    : "";
  if (sessionId && typeof runner.resumeArgs === "function") {
    args.push(...runner.resumeArgs(sessionId));
  }
  if (runner.promptMode === "argv" && prompt) {
    args.push(prompt);
  }
  return args;
}

function parseRunnerOutput(memoryDir, job, runner, stdout) {
  if (runner.outputMode !== "claude-json") {
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
    "- For work expected to take longer than 30 seconds, report heartbeat/progress with: ai-memory-hub dispatch progress --thread-key " + getDispatchThreadKey(job) + " --percent <0-100> --status \"short status\" --by " + (job.tool || "tool"),
    "- If you need to mention follow-up, end with a single 'Next:' line.",
    "",
    "Autonomous safety rules:",
    "- Follow the user's current guardrails, project instructions, and repository policy.",
    "- Do not run git push, delete files, run destructive cleanup, install dependencies, or change system configuration unless this dispatch payload explicitly authorizes it.",
    "- Local git commits are allowed only when current user/project rules allow them and the work has passed verification.",
    "- For important code changes, run focused tests and request cross-AI review when available before closing the source task.",
    "",
    "Payload:",
    job.text
  ].join("\n");
}

function readDispatchLog(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "dispatch-log.jsonl"));
}

function readDispatchRuns(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "dispatch-runs.jsonl"));
}

function readLatestDispatchRunByThread(memoryDir) {
  const latest = {};
  for (const entry of readDispatchRuns(memoryDir)) {
    const threadKey = entry.threadKey || "";
    if (!threadKey) {
      continue;
    }
    const current = latest[threadKey];
    const currentTs = String(current?.finishedAt || current?.startedAt || "");
    const nextTs = String(entry.finishedAt || entry.startedAt || "");
    if (!current || nextTs >= currentTs) {
      latest[threadKey] = entry;
    }
  }
  return latest;
}

function createDispatchRunId(job) {
  return createId(`dispatch-run:${job.id}:${job.refId}:${new Date().toISOString()}:${crypto.randomUUID()}`);
}

function writeDispatchRunLog(memoryDir, runId, stream, text) {
  const safeRunId = String(runId || "run").replace(/[^a-zA-Z0-9_.-]+/g, "-");
  const safeStream = stream === "stderr" ? "stderr" : "stdout";
  const relativePath = path.join(DISPATCH_RUNS_DIR, `${safeRunId}.${safeStream}.log`);
  const file = path.join(memoryDir, relativePath);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, String(text || ""), "utf8");
  return relativePath.replace(/\\/g, "/");
}

function appendDispatchRunRecord(memoryDir, record) {
  appendJsonl(path.join(memoryDir, "state", "dispatch-runs.jsonl"), record);
}

function getDispatchRunStatus(completed) {
  if (completed?.error?.code === "ETIMEDOUT") {
    return "timed_out";
  }
  if (completed?.status === 0) {
    return "completed";
  }
  return "failed";
}

function getDispatchRunVerificationResult(runStatus, exitCode) {
  if (runStatus === "completed" && exitCode === 0) {
    return "passed";
  }
  if (runStatus === "timed_out") {
    return "timed_out";
  }
  return "failed";
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

function readLatestRelayStatusBySource(memoryDir) {
  const latest = {};
  for (const entry of readRelayStatus(memoryDir)) {
    const sourceKey = getRelaySourceKey(entry);
    if (!sourceKey) {
      continue;
    }
    const current = latest[sourceKey];
    const currentTs = String(current?.ts || current?.updatedAt || "");
    const nextTs = String(entry.ts || entry.updatedAt || "");
    if (!current || nextTs >= currentTs) {
      latest[sourceKey] = entry;
    }
  }
  return latest;
}

function nextRelayAttempt(relayState, job) {
  const sourceKey = getDispatchSourceKey(job);
  return Number(relayState[sourceKey]?.attempt || 0) + 1;
}

function computeNextRetryAt(attempt, maxRetries = 3) {
  if (Number(attempt || 0) >= Number(maxRetries || 3)) {
    return "";
  }
  const delays = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];
  const delayMs = delays[Math.max(0, Number(attempt || 1) - 1)] || delays[delays.length - 1];
  return new Date(Date.now() + delayMs).toISOString();
}

function getRelayFailureState(attempt, maxRetries = 3) {
  return Number(attempt || 0) >= Number(maxRetries || 3) ? "abandoned" : "failed";
}

function isValidAsyncCallState(state) {
  return Object.values(ASYNC_CALL_STATES).includes(state);
}

function isValidAsyncCallTransition(fromState, toState) {
  if (!isValidAsyncCallState(fromState) || !isValidAsyncCallState(toState)) {
    return false;
  }
  const allowedTransitions = ASYNC_CALL_TRANSITIONS[fromState] || [];
  return allowedTransitions.includes(toState);
}

function getAsyncCallStateMeta(state) {
  const meta = {
    "pending": { terminal: false, success: false, retriable: false, label: "Pending" },
    "dispatched": { terminal: false, success: false, retriable: false, label: "Dispatched" },
    "acked": { terminal: false, success: false, retriable: false, label: "Acknowledged" },
    "progress": { terminal: false, success: false, retriable: false, label: "In progress" },
    "retrying": { terminal: false, success: false, retriable: true, label: "Retrying" },
    "failed": { terminal: false, success: false, retriable: true, label: "Failed" },
    "completed": { terminal: true, success: true, retriable: false, label: "Completed" },
    "abandoned": { terminal: true, success: false, retriable: false, label: "Abandoned" }
  };
  return meta[state] || { terminal: false, success: false, retriable: false, label: "Unknown" };
}

function isRelayRetryDue(entry) {
  if (!entry || entry.state !== ASYNC_CALL_STATES.FAILED || !entry.nextRetryAt) {
    return false;
  }
  const nextRetryMs = Date.parse(entry.nextRetryAt);
  if (Number.isNaN(nextRetryMs)) {
    return false;
  }
  return nextRetryMs <= Date.now() && Number(entry.attempt || 0) < Number(entry.maxRetries || 3);
}

function isRelayRetryRunnable(entry) {
  const runner = getToolRunner(entry?.tool || "");
  return !runner.sharedStateOnly;
}

function isRelayRetryCandidate(entry, now = Date.now()) {
  if (!entry) {
    return false;
  }
  if (entry.state === ASYNC_CALL_STATES.FAILED) {
    if (!entry.nextRetryAt) {
      return false;
    }
    const nextRetryMs = Date.parse(entry.nextRetryAt);
    return !Number.isNaN(nextRetryMs) && nextRetryMs <= now;
  }
  return isRelayTimedOut(entry, now);
}

function appendRelayStatus(memoryDir, job, patch = {}) {
  const now = new Date().toISOString();
  const nextState = patch.state || ASYNC_CALL_STATES.PENDING;

  appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
    id: createId(`relay:${job.id}:${now}:${nextState}`),
    ts: now,
    threadKey: getDispatchThreadKey(job),
    sourceKind: job.kind,
    sourceId: job.refId,
    dispatchId: job.id,
    state: nextState,
    attempt: Number(patch.attempt || 1),
    maxRetries: Number(patch.maxRetries || 3),
    dispatchedAt: patch.state === ASYNC_CALL_STATES.DISPATCHED ? now : "",
    ackTimeout: Number(patch.ackTimeout || 0),
    sessionId: patch.sessionId || "",
    exitCode: patch.exitCode ?? null,
    lastError: String(patch.lastError || "").trim(),
    progressPercent: patch.progressPercent ?? null,
    progressStatus: String(patch.progressStatus || "").trim(),
    progressAt: patch.progressAt || "",
    progressBy: patch.progressBy || "",
    nextRetryAt: patch.nextRetryAt || "",
    project: job.project || "",
    tool: job.tool || "",
    thread: job.thread || ""
  });
}

function getDispatchSourceKey(job) {
  return `${job.kind || "unknown"}:${job.refId || job.id || ""}`;
}

function getRelaySourceKey(entry) {
  if (!entry?.sourceKind || !entry?.sourceId) {
    return "";
  }
  return `${entry.sourceKind}:${entry.sourceId}`;
}

function appendDispatchResponseMessage(memoryDir, job, result) {
  const origin = findDispatchOrigin(memoryDir, job);
  if (!origin?.from || !result.stdout) {
    return null;
  }
  const message = createRadioMessage({
    from: job.tool || "unknown",
    to: origin.from,
    type: "response",
    text: trimOutput(result.stdout),
    thread: origin.thread || job.thread || job.refId,
    replyTo: origin.id || job.refId,
    project: origin.project || job.project || ""
  });
  appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), message);
  return message;
}

function appendDispatchStatusMessage(memoryDir, job, result) {
  const origin = findDispatchOrigin(memoryDir, job);
  if (!origin?.from) {
    return null;
  }
  const state = result.relayState || (result.exitCode === 0 ? "completed" : "failed");
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
  if (job.kind === "workflow") {
    const workflow = readWorkflows(memoryDir).find((item) => item.id === job.refId);
    if (!workflow) {
      return null;
    }
    return {
      id: workflow.id,
      from: workflow.createdBy,
      thread: workflow.id,
      project: workflow.project
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
      schemaVersion: 2,
      ts: normalizedEvent.ts || new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      source: normalizedEvent.source || "unknown",
      text: String(normalizedEvent.text).trim(),
      kind: normalizedEvent.metadata?.kind || "note",
      project: normalizedEvent.metadata?.project || "",
      tags: normalizedEvent.metadata?.tags || [],
      scope: normalizedEvent.metadata?.scope || "",
      refs: normalizedEvent.metadata?.refs || {},
      confidence: normalizedEvent.metadata?.confidence ?? 1,
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
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const limit = Number(getOption(argv, "--limit") || 10);
  const filters = {
    project: getOption(argv, "--project") || "",
    thread: getOption(argv, "--thread") || "",
    taskId: getOption(argv, "--task") || getOption(argv, "--task-id") || "",
    workflowId: getOption(argv, "--workflow") || getOption(argv, "--workflow-id") || "",
    radioId: getOption(argv, "--radio") || getOption(argv, "--radio-id") || ""
  };
  const hasFilter = Object.values(filters).some(Boolean);
  if (!query && !hasFilter) {
    throw new Error("Usage: ai-memory-hub search [query] [--limit 10] [--project <name>] [--thread <id>] [--task <id>] [--workflow <id>] [--radio <id>]");
  }
  const index = buildMemoryIndex(readLedger(config.memoryDir), config);
  const records = filterMemoryRecords(index.records, filters);
  const results = (query
    ? searchMemories(records, query)
    : [...records]
      .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
      .map((record) => ({ ...record, score: Number(record.importance || 0) / 100 }))
  ).slice(0, limit);
  for (const item of results) {
    const kind = item.metadata?.kind || "note";
    const topics = (item.topics || []).slice(0, 4).join(",");
    const refs = formatMemoryRefs(item.refs);
    console.log(`[${item.score.toFixed(2)}] ${item.source}/${kind} ${topics ? `(${topics}) ` : ""}${refs ? `[${refs}] ` : ""}${item.text}`);
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

function daemonCommand(argv) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  if (action === "status") {
    return daemonStatusCommand(argv.slice(1));
  }
  if (action) {
    throw new Error("Usage: ai-memory-hub daemon [status] [--interval-ms <ms>] [--project <name[,name]>] [--limit <n>] [--force]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);
  const intervalMs = Number(getOption(argv, "--interval-ms") || 10000);
  const limit = Number(getOption(argv, "--limit") || 10);
  const projects = getOption(argv, "--project");
  const projectList = projects ? projects.split(",") : [];
  const force = hasFlag(argv, "--force");
  const startedAt = new Date().toISOString();
  const currentStatus = buildDaemonStatus(config.memoryDir);
  if (currentStatus.running && !force) {
    throw new Error(`Daemon already appears to be running as pid ${currentStatus.pid}. Use 'ai-memory-hub daemon status' to inspect or pass --force to replace stale local metadata.`);
  }
  writeDaemonPid(config.memoryDir, process.pid);
  writeDaemonStatus(config.memoryDir, {
    state: "starting",
    pid: process.pid,
    startedAt,
    stoppedAt: "",
    stopSignal: "",
    intervalMs,
    limit,
    projects: projectList,
    cycle: 0,
    lastCycleStartedAt: "",
    lastCycleFinishedAt: "",
    lastError: "",
    memoryDir: config.memoryDir
  });

  console.log(`Starting AI Memory Hub Daemon`);
  console.log(`PID: ${process.pid}`);
  console.log(`Monitoring: radio messages and tasks`);
  console.log(`Interval: ${intervalMs}ms`);
  console.log(`Limit per tool/project: ${limit}`);
  if (projectList.length > 0) {
    console.log(`Projects: ${projectList.join(", ")}`);
  }
  console.log("Press Ctrl+C to stop.\n");

  let iteration = 0;
  let timer = null;
  let stopping = false;
  const runCycle = () => {
    if (stopping) {
      return;
    }
    iteration++;
    const cycleStartedAt = new Date().toISOString();
    const cycleErrors = [];
    writeDaemonStatus(config.memoryDir, {
      state: "running",
      pid: process.pid,
      startedAt,
      intervalMs,
      limit,
      projects: projectList,
      cycle: iteration,
      lastCycleStartedAt: cycleStartedAt,
      lastError: ""
    });
    console.log(`[${cycleStartedAt}] Cycle #${iteration}`);

    try {
      const tools = ["codex", "gemini", "claude"];

      for (const tool of tools) {
        const runner = getToolRunner(tool);
        if (!runner.available) {
          continue;
        }

        const checkProjects = projectList.length > 0 ? projectList : [null];

        for (const project of checkProjects) {
          try {
            const retryResults = executeDispatchRetry(config.memoryDir, {
              run: true,
              to: tool,
              project,
              limit
            });
            const timeoutResults = retryResults.filter((result) => result.timeout);
            const retriedResults = retryResults.filter((result) => !result.timeout);
            if (timeoutResults.length > 0) {
              console.log(`  -> Marked ${timeoutResults.length} timed-out relay(s) for ${tool}${project ? ` (project: ${project})` : ""}`);
            }
            if (retriedResults.length > 0) {
              console.log(`  -> Retried ${retriedResults.length} relay job(s) for ${tool}${project ? ` (project: ${project})` : ""}`);
            }

            const results = executeDispatch(config.memoryDir, {
              run: true,
              to: tool,
              project,
              limit
            });

            if (results.length > 0) {
              console.log(`  -> Dispatched ${results.length} job(s) to ${tool}${project ? ` (project: ${project})` : ""}`);
              for (const result of results) {
                if (result.exitCode === 0) {
                  console.log(`    ok ${result.kind}:${String(result.refId || "").substring(0, 8)} completed`);
                } else {
                  console.log(`    fail ${result.kind}:${String(result.refId || "").substring(0, 8)} failed (exit ${result.exitCode})`);
                }
              }
            }
          } catch (err) {
            cycleErrors.push(`${tool}${project ? `/${project}` : ""}: ${err.message || String(err)}`);
            console.error(`  Cycle tool error for ${tool}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      cycleErrors.push(err.message || String(err));
      console.error(`Cycle error: ${err.message}`);
    }
    const cycleFinishedAt = new Date().toISOString();
    writeDaemonStatus(config.memoryDir, {
      state: "running",
      pid: process.pid,
      startedAt,
      intervalMs,
      limit,
      projects: projectList,
      cycle: iteration,
      lastCycleStartedAt: cycleStartedAt,
      lastCycleFinishedAt: cycleFinishedAt,
      lastError: cycleErrors.join(" | ")
    });

    console.log("");
  };

  const stop = (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    if (timer) {
      clearInterval(timer);
    }
    writeDaemonStatus(config.memoryDir, {
      state: "stopped",
      pid: process.pid,
      startedAt,
      stoppedAt: new Date().toISOString(),
      stopSignal: signal || "stop",
      intervalMs,
      limit,
      projects: projectList,
      cycle: iteration
    });
    clearDaemonPid(config.memoryDir, process.pid);
    console.log(`\n${signal || "stop"} received; daemon stopped.`);
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  runCycle();
  timer = setInterval(runCycle, intervalMs);
}

function daemonStatusCommand() {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  console.log(JSON.stringify(buildDaemonStatus(config.memoryDir), null, 2));
}

function buildDaemonStatus(memoryDir) {
  const paths = getDaemonStatePaths(memoryDir);
  const status = readDaemonStatus(memoryDir);
  const pidFromFile = readDaemonPid(memoryDir);
  const pidFromStatus = Number(status.pid || 0);
  const pid = pidFromFile || (Number.isInteger(pidFromStatus) && pidFromStatus > 0 ? pidFromStatus : null);
  const liveness = checkProcessLiveness(pid);
  const declaredActive = ["starting", "running", "stopping"].includes(status.state || "") || (pidFromFile && !status.state);
  const running = Boolean(pid && declaredActive && liveness.running);
  const state = status.state === "invalid"
    ? "invalid"
    : running
      ? (status.state || "running")
      : status.state === "stopped"
        ? "stopped"
        : pid
          ? "stale"
          : "not_running";

  return {
    state,
    running,
    stalePid: Boolean(pid && !running),
    pid,
    pidFile: paths.pidFile,
    statusFile: paths.statusFile,
    liveness,
    status
  };
}

function getDaemonStatePaths(memoryDir) {
  return {
    pidFile: path.join(memoryDir, "state", DAEMON_PID_FILE),
    statusFile: path.join(memoryDir, "state", DAEMON_STATUS_FILE)
  };
}

function readDaemonPid(memoryDir) {
  const text = readTextIfExists(getDaemonStatePaths(memoryDir).pidFile).trim();
  const pid = Number(text);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function writeDaemonPid(memoryDir, pid) {
  const paths = getDaemonStatePaths(memoryDir);
  ensureDir(path.dirname(paths.pidFile));
  fs.writeFileSync(paths.pidFile, `${pid}\n`, "utf8");
}

function clearDaemonPid(memoryDir, pid) {
  const paths = getDaemonStatePaths(memoryDir);
  const currentPid = readDaemonPid(memoryDir);
  if (currentPid === pid && fs.existsSync(paths.pidFile)) {
    fs.unlinkSync(paths.pidFile);
  }
}

function readDaemonStatus(memoryDir) {
  const file = getDaemonStatePaths(memoryDir).statusFile;
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return readJson(file);
  } catch (error) {
    return {
      state: "invalid",
      error: error.message || String(error)
    };
  }
}

function writeDaemonStatus(memoryDir, patch) {
  const paths = getDaemonStatePaths(memoryDir);
  const existing = readDaemonStatus(memoryDir);
  writeJson(paths.statusFile, {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

function checkProcessLiveness(pid) {
  if (!pid) {
    return {
      running: false,
      reason: "missing pid"
    };
  }
  try {
    process.kill(pid, 0);
    return {
      running: true,
      reason: pid === process.pid ? "current process" : "signal 0 succeeded"
    };
  } catch (error) {
    if (error.code === "EPERM") {
      return {
        running: true,
        reason: "permission denied, process exists"
      };
    }
    return {
      running: false,
      reason: error.code || error.message || "not running"
    };
  }
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
      if (req.method === "GET" && url.pathname === "/api/workflows") {
        const config = loadConfig();
        return sendJson(res, {
          workflows: readWorkflows(config.memoryDir)
            .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
            .slice(0, 100)
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
  session    Manage session handoff for context transfer between tools.
  rpc        Synchronous request-response RPC calls between tools.
  notify     Send cross-platform notifications with severity-based routing.
  context    Generate task-specific memory bundles for focused context.
  queue      Manage dispatch queue with priority and retry controls.
  recipe     Manage workflow recipes for reusable collaboration templates.
  task-spec  List, validate, and run project-declared task commands.
  metrics    Show operational metrics for tasks, workflows, relay, and queue.
  update     Check for updates or update to the latest version.
  connect    Check tool connections or send a request/review/handoff to another tool.
  doctor     Diagnose AI tool runner paths, shims, probes, and prompt mode.
  dispatch   Dispatch pending radio/task work to verified CLI runners.
  pull       Rebuild MEMORY.md from the local memory ledger.
  backup     Back up MEMORY.md, ledger, inbox, profile, radio, task, and workflow files.
  watch      Periodically index pending inbox events.
  daemon     Run or inspect the local dispatch daemon.
  app        Start the local dashboard app.
  install    Show or apply per-tool instruction snippets. Use --local to write rules in the current project directory.
  help       Show this help.

Examples:
  ${APP_NAME} init
  ${APP_NAME} record "User prefers concise answers." --source codex --kind preference
  ${APP_NAME} record "Project memory with tags." --source codex --kind project --project ai-memory-hub --tags schema,memos --confidence 0.8
  ${APP_NAME} radio send "Please review the latest implementation." --from codex --to claude --type review
  ${APP_NAME} radio list --limit 10
  ${APP_NAME} radio promote --id <message-id>
  ${APP_NAME} sync --dry-run
  ${APP_NAME} sync
  ${APP_NAME} index
  ${APP_NAME} search "git commit rules" --limit 5
  ${APP_NAME} task add "Review README task-list section" --description "Goal: check task docs. Scope: README only. Acceptance: examples are accurate." --handoff "Next: reviewer verifies wording." --from codex --project ai-memory-hub --priority high
  ${APP_NAME} task list --status active
  ${APP_NAME} task claim --id <task-id> --by claude
  ${APP_NAME} task update --id <task-id> --description "Goal: ... Scope: ... Acceptance: ..." --handoff "Current state and next step." --by codex
  ${APP_NAME} task note --id <task-id> "Reviewed Chinese docs." --by qclaw
  ${APP_NAME} task done --id <task-id> --by codex
  ${APP_NAME} connect
  ${APP_NAME} connect --apply
  ${APP_NAME} connect request --from gemini --to codex --project ai-memory-hub --text "Please inspect the current task list." --task
  ${APP_NAME} doctor --tool claude
  ${APP_NAME} workflow create "Review dashboard changes" --from codex --project ai-memory-hub --planner codex --executor opencode --reviewer qclaw --spawn-tasks --notify
  ${APP_NAME} workflow list --status active
  ${APP_NAME} dispatch --project ai-memory-hub
  ${APP_NAME} dispatch --to codex --run
  ${APP_NAME} dispatch status --thread <thread-id> --project ai-memory-hub
  ${APP_NAME} dispatch status --recent 10 --project ai-memory-hub
  ${APP_NAME} dispatch status --recent --state failed --to claude
  ${APP_NAME} dispatch progress --thread-key codex:ai-memory-hub:<ref> --percent 40 --status "working" --by codex
  ${APP_NAME} dispatch retry --project ai-memory-hub --to qclaw --run --limit 1
  ${APP_NAME} task-spec list
  ${APP_NAME} task-spec validate
  ${APP_NAME} task-spec run test
  ${APP_NAME} pull
  ${APP_NAME} backup --reason manual
  ${APP_NAME} watch --interval-ms 30000
  ${APP_NAME} daemon status
  ${APP_NAME} daemon --project ai-memory-hub --interval-ms 10000
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

function taskUpdateCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub task update --id <task-id> [--title text] [--description text] [--handoff text] [--priority normal] [--status open]");
  }
  const by = getOption(argv, "--by") || "manual";
  const patch = {};
  for (const [flag, key] of [
    ["--title", "title"],
    ["--description", "description"],
    ["--handoff", "handoff"],
    ["--priority", "priority"],
    ["--status", "status"],
    ["--project", "project"]
  ]) {
    const value = getOption(argv, flag);
    if (value !== "") {
      patch[key] = value;
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("task update requires at least one field: --title, --description, --handoff, --priority, --status, or --project");
  }
  if (patch.priority) {
    patch.priority = normalizePriority(patch.priority);
  }
  if (patch.status) {
    assertTaskStatus(patch.status);
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "task-update", () => {
    const updated = updateTask(config.memoryDir, id, (task) => {
      const now = new Date().toISOString();
      return {
        ...task,
        ...patch,
        updatedAt: now,
        completedAt: patch.status === "done" ? now : patch.status && patch.status !== "done" ? "" : task.completedAt || "",
        assignee: patch.status && !["open", "cancelled"].includes(patch.status) ? task.assignee || by : task.assignee || "",
        notes: [
          ...(task.notes || []),
          createTaskNote(by, `Updated task fields: ${Object.keys(patch).join(", ")}.`)
        ]
      };
    });
    console.log(JSON.stringify(updated, null, 2));
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
    runnerProfile: runner.promptMode || "",
    runnerCommand: runner.commandPath || "",
    runnerCommandKind: runner.commandKind || "",
    runnerUsesShell: Boolean(runner.usesShell),
    sharedStateOnly: Boolean(runner.sharedStateOnly),
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
    .map((item) => {
      const metadata = normalizeMemoryMetadata(item.metadata || {}, item);
      return {
        id: item.id || createId(item.text || JSON.stringify(item)),
        localEventId: item.localEventId || item.local_event_id || "",
        schemaVersion: item.schemaVersion || 1,
        ts: item.ts || item.createdAt || "",
        indexedAt: item.indexedAt || "",
        source: item.source || metadata.source || "unknown",
        text: item.text || item.memory || "",
        metadata
      };
    })
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
    deliveryState: workflow.deliveryState || "",
    deliveryUpdatedAt: workflow.deliveryUpdatedAt || "",
    dispatchId: workflow.dispatchId || "",
    threadKey: workflow.threadKey || "",
    attempt: Number(workflow.attempt || 0),
    maxRetries: Number(workflow.maxRetries || 0),
    nextRetryAt: workflow.nextRetryAt || "",
    sessionId: workflow.sessionId || "",
    lastError: workflow.lastError || "",
    progressPercent: workflow.progressPercent ?? null,
    progressStatus: workflow.progressStatus || "",
    progressAt: workflow.progressAt || "",
    progressBy: workflow.progressBy || "",
    responseRadioId: workflow.responseRadioId || "",
    statusRadioId: workflow.statusRadioId || "",
    dispatchReportPath: workflow.dispatchReportPath || "",
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
    deliveryState: task.deliveryState || "",
    deliveryUpdatedAt: task.deliveryUpdatedAt || "",
    dispatchId: task.dispatchId || "",
    threadKey: task.threadKey || "",
    attempt: Number(task.attempt || 0),
    maxRetries: Number(task.maxRetries || 0),
    nextRetryAt: task.nextRetryAt || "",
    sessionId: task.sessionId || "",
    lastError: task.lastError || "",
    progressPercent: task.progressPercent ?? null,
    progressStatus: task.progressStatus || "",
    progressAt: task.progressAt || "",
    progressBy: task.progressBy || "",
    responseRadioId: task.responseRadioId || "",
    statusRadioId: task.statusRadioId || "",
    dispatchReportPath: task.dispatchReportPath || "",
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

// Session Handoff Functions
function readSessions(memoryDir) {
  const file = path.join(memoryDir, "context", "sessions.jsonl");
  return readEvents(file);
}

function writeSessions(memoryDir, sessions) {
  const file = path.join(memoryDir, "context", "sessions.jsonl");
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, sessions.map((s) => JSON.stringify(s)).join("\n") + (sessions.length ? "\n" : ""), "utf8");
}

function createSession({ title, createdBy, project, participants, context, artifacts }) {
  return {
    id: createId(`session:${title}:${createdBy}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    createdBy: createdBy || "unknown",
    project: project || "",
    title: title || "Untitled Session",
    participants: participants || [],
    context: context || "",
    artifacts: artifacts || [],
    metadata: {}
  };
}

function updateSession(memoryDir, sessionId, updates) {
  const sessions = readSessions(memoryDir);
  const updated = sessions.map((session) => {
    if (session.id === sessionId) {
      return {
        ...session,
        ...updates,
        updatedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
    }
    return session;
  });
  writeSessions(memoryDir, updated);
  return updated.find((s) => s.id === sessionId);
}

function getActiveSessions(memoryDir, maxAgeMs = 3600000) {
  const sessions = readSessions(memoryDir);
  const now = Date.now();
  return sessions.filter((session) => {
    const lastActiveMs = Date.parse(session.lastActive || session.updatedAt || "");
    return !Number.isNaN(lastActiveMs) && (now - lastActiveMs) < maxAgeMs;
  }).sort((a, b) => {
    const aTime = a.lastActive || a.updatedAt || "";
    const bTime = b.lastActive || b.updatedAt || "";
    return bTime.localeCompare(aTime);
  });
}

// RPC Functions
function createRpcRequest({ from, to, method, params, timeout }) {
  return {
    id: createId(`rpc:${from}:${to}:${method}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    from: from || "unknown",
    to: to || "unknown",
    method: method || "",
    params: params || {},
    timeout: Number(timeout || 30000),
    status: "pending"
  };
}

function writeRpcRequest(memoryDir, request) {
  const file = path.join(memoryDir, "rpc", "requests", `${request.id}.json`);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(request, null, 2) + "\n", "utf8");
}

function readRpcRequest(memoryDir, requestId) {
  const file = path.join(memoryDir, "rpc", "requests", `${requestId}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return readJson(file);
}

function writeRpcResult(memoryDir, requestId, result) {
  const resultData = {
    id: createId(`rpc-result:${requestId}:${Date.now()}`),
    requestId,
    createdAt: new Date().toISOString(),
    success: result.success !== false,
    data: result.data || null,
    error: result.error || null
  };
  const file = path.join(memoryDir, "rpc", "results", `${requestId}.json`);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(resultData, null, 2) + "\n", "utf8");
  return resultData;
}

function readRpcResult(memoryDir, requestId) {
  const file = path.join(memoryDir, "rpc", "results", `${requestId}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return readJson(file);
}

function waitForRpcResult(memoryDir, requestId, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = readRpcResult(memoryDir, requestId);
    if (result) {
      return result;
    }
    sleep(500);
  }
  return null;
}

// Notification Bus Functions
function createNotification({ severity, title, message, actionUrl, channels, from, project }) {
  return {
    id: createId(`notification:${severity}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    severity: normalizeSeverity(severity),
    title: title || "",
    message: message || "",
    actionUrl: actionUrl || "",
    channels: channels || [],
    from: from || "unknown",
    project: project || "",
    status: "pending",
    deliveredTo: []
  };
}

function normalizeSeverity(severity) {
  const clean = String(severity || "info").toLowerCase();
  return ["info", "warning", "error", "critical", "need_input"].includes(clean) ? clean : "info";
}

function writeNotification(memoryDir, notification) {
  const file = path.join(memoryDir, "notifications", "notifications.jsonl");
  ensureDir(path.dirname(file));
  appendJsonl(file, notification);
}

function readNotifications(memoryDir) {
  const file = path.join(memoryDir, "notifications", "notifications.jsonl");
  return readEvents(file);
}

function getPendingNotifications(memoryDir) {
  return readNotifications(memoryDir).filter((n) => n.status === "pending");
}

function updateNotificationStatus(memoryDir, notificationId, status, deliveredTo = []) {
  const file = path.join(memoryDir, "notifications", "notifications.jsonl");
  const notifications = readNotifications(memoryDir).map((n) => {
    if (n.id === notificationId) {
      return {
        ...n,
        status,
        deliveredTo: [...new Set([...(n.deliveredTo || []), ...deliveredTo])],
        updatedAt: new Date().toISOString()
      };
    }
    return n;
  });
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, notifications.map((n) => JSON.stringify(n)).join("\n") + "\n", "utf8");
}

function getNotificationChannels(severity, userChannels = []) {
  // Default routing based on severity
  const defaultRouting = {
    info: ["console"],
    warning: ["console", "radio"],
    error: ["console", "radio", "telegram"],
    critical: ["console", "radio", "telegram", "wechat", "email"],
    need_input: ["console", "radio", "telegram", "wechat"]
  };

  const channels = userChannels.length > 0 ? userChannels : (defaultRouting[severity] || ["console"]);
  return [...new Set(channels)];
}

// Context Pack Functions
function createContextPack({ taskId, workflowId, project, query }) {
  const memoryDir = loadConfig().memoryDir;

  const pack = {
    id: createId(`context:${taskId || workflowId}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    taskId: taskId || "",
    workflowId: workflowId || "",
    project: project || "",
    task: null,
    workflow: null,
    relevantMemories: [],
    recentRadio: [],
    projectPath: process.cwd(),
    constraints: [],
    acceptanceCriteria: []
  };

  // Load task or workflow details
  if (taskId) {
    const tasks = readTasks(memoryDir);
    pack.task = tasks.find((t) => t.id === taskId || t.id.startsWith(taskId));
  }

  if (workflowId) {
    const workflows = readWorkflows(memoryDir);
    pack.workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  }

  // Search relevant memories
  if (query || pack.task || pack.workflow) {
    const searchQuery = query || pack.task?.title || pack.workflow?.title || "";
    pack.relevantMemories = searchMemoriesForContext(memoryDir, searchQuery, project, 10);
  }

  // Get recent radio messages for this project
  if (project) {
    pack.recentRadio = readRadioMessages(memoryDir)
      .filter((m) => m.project === project)
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
      .slice(0, 10);
  }

  return pack;
}

function searchMemoriesForContext(memoryDir, query, project, limit = 10) {
  try {
    const indexFile = path.join(memoryDir, "INDEX.md");
    if (!fs.existsSync(indexFile)) {
      return [];
    }

    const records = parseIndexFile(indexFile);
    const projectRecords = project ? records.filter((r) => r.project === project) : records;

    if (!query) {
      return projectRecords.slice(0, limit).map((r) => ({
        text: r.text,
        kind: r.kind,
        source: r.source,
        project: r.project
      }));
    }

    const scored = searchMemories(projectRecords, query);
    return scored.slice(0, limit).map((r) => ({
      text: r.text,
      kind: r.kind,
      source: r.source,
      project: r.project,
      score: r.score
    }));
  } catch (error) {
    return [];
  }
}

function writeContextPack(memoryDir, pack) {
  const file = path.join(memoryDir, "context", "packs", `${pack.id}.json`);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(pack, null, 2) + "\n", "utf8");
  return file;
}

function readContextPack(memoryDir, packId) {
  const file = path.join(memoryDir, "context", "packs", `${packId}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return readJson(file);
}

// Scheduler Queue Functions
function createDispatchQueueEntry({ taskId, workflowId, radioId, tool, priority, timeout, maxRetries }) {
  return {
    id: createId(`queue:${tool}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    taskId: taskId || "",
    workflowId: workflowId || "",
    radioId: radioId || "",
    tool: tool || "",
    priority: normalizePriority(priority || "normal"),
    timeout: Number(timeout || 30000),
    maxRetries: Number(maxRetries || 3),
    status: "queued",
    startedAt: "",
    completedAt: "",
    attempts: 0,
    lastAttemptAt: "",
    lastError: ""
  };
}

function readDispatchQueue(memoryDir) {
  const file = path.join(memoryDir, "dispatch", "queue.jsonl");
  return readEvents(file);
}

function writeDispatchQueueEntry(memoryDir, entry) {
  const file = path.join(memoryDir, "dispatch", "queue.jsonl");
  ensureDir(path.dirname(file));
  appendJsonl(file, entry);
}

function updateDispatchQueueEntry(memoryDir, entryId, updates) {
  const file = path.join(memoryDir, "dispatch", "queue.jsonl");
  const entries = readDispatchQueue(memoryDir).map((entry) => {
    if (entry.id === entryId) {
      return {
        ...entry,
        ...updates,
        updatedAt: new Date().toISOString()
      };
    }
    return entry;
  });
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}

function getQueuedEntries(memoryDir) {
  return readDispatchQueue(memoryDir)
    .filter((e) => e.status === "queued")
    .sort((a, b) => {
      // Sort by priority first (urgent > high > normal > low)
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const aPrio = priorityOrder[a.priority] || 2;
      const bPrio = priorityOrder[b.priority] || 2;
      if (aPrio !== bPrio) return aPrio - bPrio;
      // Then by creation time
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
}

function getRunningEntries(memoryDir) {
  return readDispatchQueue(memoryDir)
    .filter((e) => e.status === "running")
    .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
}

function getFailedEntries(memoryDir) {
  return readDispatchQueue(memoryDir)
    .filter((e) => e.status === "failed")
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
}

// Workflow Recipe Functions
function readRecipe(memoryDir, recipeName) {
  const file = path.join(memoryDir, "recipes", `${recipeName}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return readJson(file);
}

function listRecipes(memoryDir) {
  const recipesDir = path.join(memoryDir, "recipes");
  if (!fs.existsSync(recipesDir)) {
    return [];
  }

  const files = fs.readdirSync(recipesDir).filter((f) => f.endsWith(".json"));
  return files.map((file) => {
    try {
      const recipe = readJson(path.join(recipesDir, file));
      return {
        name: recipe.name,
        title: recipe.title,
        description: recipe.description,
        version: recipe.version,
        roles: Object.keys(recipe.roles || {}),
        steps: (recipe.steps || []).length
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function validateRecipe(recipe) {
  if (!recipe.name || !recipe.title) {
    return { valid: false, error: "Recipe must have name and title" };
  }

  if (!recipe.roles || Object.keys(recipe.roles).length === 0) {
    return { valid: false, error: "Recipe must define at least one role" };
  }

  if (!recipe.steps || recipe.steps.length === 0) {
    return { valid: false, error: "Recipe must have at least one step" };
  }

  // Check all step roles are defined
  for (const step of recipe.steps) {
    if (!recipe.roles[step.role]) {
      return { valid: false, error: `Step ${step.id} references undefined role: ${step.role}` };
    }
  }

  // Check dependsOn references exist
  for (const step of recipe.steps) {
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        const depExists = recipe.steps.some((s) => s.id === depId);
        if (!depExists) {
          return { valid: false, error: `Step ${step.id} depends on non-existent step: ${depId}` };
        }
      }
    }
  }

  return { valid: true };
}

function createWorkflowFromRecipe(memoryDir, recipeName, toolMapping, variables) {
  const recipe = readRecipe(memoryDir, recipeName);

  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeName}`);
  }

  const validation = validateRecipe(recipe);
  if (!validation.valid) {
    throw new Error(`Invalid recipe: ${validation.error}`);
  }

  // Merge variables
  const vars = { ...recipe.variables, ...variables };

  // Create workflow
  const workflow = createWorkflow({
    title: `${recipe.title} - ${vars.project || 'default'}`,
    createdBy: "recipe",
    project: vars.project || "",
    priority: vars.priority || "normal",
    planner: toolMapping[Object.keys(recipe.roles)[0]] || "",
    executor: toolMapping[Object.keys(recipe.roles)[1]] || "",
    reviewer: toolMapping[Object.keys(recipe.roles)[2]] || "",
    observer: "",
    plan: `Recipe: ${recipeName}\nSteps: ${recipe.steps.length}`,
    acceptance: recipe.description || ""
  });

  const workflows = readWorkflows(memoryDir);
  workflows.push(workflow);
  writeWorkflows(memoryDir, workflows);

  // Create tasks for each step
  const tasks = [];
  for (const step of recipe.steps) {
    const tool = toolMapping[step.role] || "";
    const task = createTask({
      title: `[${recipeName}] ${step.task}`,
      description: step.task,
      createdBy: "recipe",
      project: vars.project || "",
      priority: vars.priority || "normal"
    });

    if (tool) {
      task.assignee = tool;
    }

    if (step.dependsOn && step.dependsOn.length > 0) {
      task.handoff = `Depends on: ${step.dependsOn.join(", ")}`;
    }

    tasks.push(task);
  }

  // Write tasks
  const allTasks = readTasks(memoryDir);
  allTasks.push(...tasks);
  writeTasks(memoryDir, allTasks);

  return { workflow, tasks, recipe };
}

// Project Task Spec Functions
function loadTaskSpecContext(argv) {
  const projectRoot = path.resolve(getOption(argv, "--root") || process.cwd());
  const file = resolveTaskSpecFile(argv, projectRoot);
  const document = readJson(file);
  return {
    projectRoot,
    file,
    displayFile: path.relative(projectRoot, file).replace(/\\/g, "/") || path.basename(file),
    document
  };
}

function resolveTaskSpecFile(argv, projectRoot) {
  const fileArg = getOption(argv, "--file");
  if (fileArg) {
    const resolved = path.resolve(projectRoot, fileArg);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Task spec file not found: ${resolved}`);
    }
    return resolved;
  }

  for (const candidate of DEFAULT_TASK_SPEC_FILES) {
    const file = path.join(projectRoot, candidate);
    if (fs.existsSync(file)) {
      return file;
    }
  }

  throw new Error(`Task spec file not found. Tried: ${DEFAULT_TASK_SPEC_FILES.join(", ")}`);
}

function resolveTaskSpecFromArgs(argv, taskId) {
  const context = loadTaskSpecContext(argv);
  const validation = validateTaskSpecDocument(context.document);
  if (!validation.valid) {
    throw new Error(`Invalid task spec: ${validation.error}`);
  }
  const task = validation.tasks.find((item) => item.id === taskId || item.name === taskId);
  if (!task) {
    throw new Error(`Task spec not found: ${taskId}`);
  }
  return { task, context };
}

function validateTaskSpecDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { valid: false, error: "Task spec file must be a JSON object" };
  }
  const tasks = normalizeTaskSpecs(document);
  if (tasks.length === 0) {
    return { valid: false, error: "Task spec must define at least one task" };
  }

  const seen = new Set();
  for (const task of tasks) {
    if (!task.id) {
      return { valid: false, error: "Each task spec needs an id or object key" };
    }
    if (!/^[A-Za-z0-9_.:-]+$/.test(task.id)) {
      return { valid: false, error: `Task spec id contains unsupported characters: ${task.id}` };
    }
    if (seen.has(task.id)) {
      return { valid: false, error: `Duplicate task spec id: ${task.id}` };
    }
    seen.add(task.id);
    const command = selectPlatformCommand(task);
    if (!command) {
      return { valid: false, error: `Task spec ${task.id} requires command` };
    }
    if (!Array.isArray(task.args)) {
      return { valid: false, error: `Task spec ${task.id} args must be an array` };
    }
    if (!Number.isInteger(task.timeoutMs) || task.timeoutMs <= 0) {
      return { valid: false, error: `Task spec ${task.id} timeoutMs must be a positive integer` };
    }
    for (const verify of task.verify) {
      if (!selectPlatformCommand(verify)) {
        return { valid: false, error: `Task spec ${task.id} verify command requires command` };
      }
      if (!Array.isArray(verify.args)) {
        return { valid: false, error: `Task spec ${task.id} verify args must be an array` };
      }
    }
  }

  return { valid: true, tasks };
}

function normalizeTaskSpecs(document) {
  const rawTasks = document.tasks || document.commands || {};
  if (Array.isArray(rawTasks)) {
    return rawTasks.map((task) => normalizeTaskSpec(task));
  }
  if (rawTasks && typeof rawTasks === "object") {
    return Object.entries(rawTasks).map(([id, task]) => normalizeTaskSpec({ id, ...(task || {}) }));
  }
  return [];
}

function normalizeTaskSpec(task) {
  const normalized = normalizeTaskSpecCommand(task || {});
  return {
    ...normalized,
    id: String(task.id || task.name || "").trim(),
    name: String(task.name || task.id || "").trim(),
    title: String(task.title || task.name || task.id || "").trim(),
    description: String(task.description || ""),
    ports: normalizeTaskSpecList(task.ports),
    resources: normalizeTaskSpecList(task.resources),
    logs: normalizeTaskSpecLogs(task.logs),
    verify: normalizeTaskSpecVerify(task.verify)
  };
}

function normalizeTaskSpecCommand(commandSpec) {
  return {
    command: String(commandSpec.command || "").trim(),
    windowsCommand: String(commandSpec.windowsCommand || "").trim(),
    args: normalizeStringArray(commandSpec.args),
    cwd: String(commandSpec.cwd || "."),
    env: normalizeTaskSpecEnv(commandSpec.env),
    timeoutMs: Number(commandSpec.timeoutMs || DEFAULT_TASK_SPEC_TIMEOUT_MS),
    shell: Boolean(commandSpec.shell),
    logs: normalizeTaskSpecLogs(commandSpec.logs)
  };
}

function normalizeTaskSpecVerify(verify) {
  if (!verify) {
    return [];
  }
  const entries = Array.isArray(verify) ? verify : [verify];
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => normalizeTaskSpecCommand(entry));
}

function normalizeTaskSpecEnv(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)]));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

function normalizeTaskSpecList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => item && typeof item === "object" ? item : String(item));
}

function normalizeTaskSpecLogs(logs) {
  if (!logs || typeof logs !== "object" || Array.isArray(logs)) {
    return {};
  }
  return {
    stdout: logs.stdout ? String(logs.stdout) : "",
    stderr: logs.stderr ? String(logs.stderr) : ""
  };
}

function summarizeTaskSpec(task) {
  return {
    id: task.id,
    title: task.title,
    command: selectPlatformCommand(task),
    args: task.args,
    cwd: task.cwd,
    hasVerify: task.verify.length > 0,
    ports: task.ports,
    resources: task.resources,
    logs: task.logs
  };
}

function selectPlatformCommand(commandSpec) {
  if (process.platform === "win32" && commandSpec.windowsCommand) {
    return commandSpec.windowsCommand;
  }
  return commandSpec.command || commandSpec.windowsCommand || "";
}

function runTaskSpec(task, { projectRoot, runVerify = true, allowOutsideCwd = false } = {}) {
  const startedAt = new Date().toISOString();
  const main = runTaskSpecProcess(task, {
    projectRoot,
    phase: "command",
    inherit: task,
    allowOutsideCwd
  });

  const verification = {
    status: "skipped",
    commands: []
  };

  if (main.status === "passed" && runVerify && task.verify.length > 0) {
    verification.status = "passed";
    for (const verify of task.verify) {
      const result = runTaskSpecProcess(verify, {
        projectRoot,
        phase: "verify",
        inherit: task,
        allowOutsideCwd
      });
      verification.commands.push(result);
      if (result.status !== "passed") {
        verification.status = result.status;
        break;
      }
    }
  }

  const status = main.status === "passed" && ["passed", "skipped"].includes(verification.status)
    ? "passed"
    : main.status === "timed_out" || verification.status === "timed_out"
      ? "timed_out"
      : "failed";

  return {
    taskId: task.id,
    title: task.title,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    command: main,
    verification
  };
}

function runTaskSpecProcess(commandSpec, { projectRoot, phase, inherit = {}, allowOutsideCwd = false } = {}) {
  const cwd = resolveTaskSpecCwd(projectRoot, commandSpec.cwd || inherit.cwd || ".", allowOutsideCwd);
  const commandName = selectPlatformCommand(commandSpec);
  const commandPaths = resolveCommandPaths(commandName);
  const resolvedCommand = choosePreferredCommandPath(commandPaths) || commandName;
  const args = commandSpec.args || [];
  const timeoutMs = commandSpec.timeoutMs || inherit.timeoutMs || DEFAULT_TASK_SPEC_TIMEOUT_MS;
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const useCmdLauncher = process.platform === "win32" && shouldUseShellForCommand(resolvedCommand);
  const usesShell = Boolean(commandSpec.shell) || useCmdLauncher;
  const spawnCommand = useCmdLauncher ? buildWindowsCmdLine(resolvedCommand, args) : resolvedCommand;
  const spawnArgs = useCmdLauncher ? [] : args;
  const completed = spawnSync(spawnCommand, spawnArgs, {
    cwd,
    env: {
      ...process.env,
      ...(inherit.env || {}),
      ...(commandSpec.env || {})
    },
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    shell: usesShell
  });
  const finishedAtMs = Date.now();
  const status = getTaskSpecProcessStatus(completed);
  const logs = writeTaskSpecProcessLogs(projectRoot, commandSpec.logs || {}, completed);
  return {
    phase,
    command: commandName,
    resolvedCommand,
    args,
    commandLine: [commandName, ...args].map((part) => String(part)).join(" "),
    cwd: path.relative(projectRoot, cwd).replace(/\\/g, "/") || ".",
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    timeoutMs,
    exitCode: completed.status ?? null,
    status,
    error: completed.error?.message || "",
    stdout: trimOutput(completed.stdout, 2000),
    stderr: trimOutput(completed.stderr, 2000),
    logs
  };
}

function getTaskSpecProcessStatus(completed) {
  if (completed?.error?.code === "ETIMEDOUT") {
    return "timed_out";
  }
  return completed?.status === 0 ? "passed" : "failed";
}

function writeTaskSpecProcessLogs(projectRoot, logs, completed) {
  const written = {};
  for (const [stream, text] of [
    ["stdout", completed.stdout],
    ["stderr", completed.stderr]
  ]) {
    const relativeLogPath = logs?.[stream] || "";
    if (!relativeLogPath) {
      continue;
    }
    const file = resolveInside(projectRoot, relativeLogPath);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, String(text || ""), "utf8");
    written[stream] = path.relative(projectRoot, file).replace(/\\/g, "/");
  }
  return written;
}

function resolveTaskSpecCwd(projectRoot, cwd, allowOutsideCwd) {
  const resolved = path.resolve(projectRoot, cwd || ".");
  if (!allowOutsideCwd) {
    resolveInside(projectRoot, path.relative(projectRoot, resolved) || ".");
  }
  return resolved;
}

function resolveInside(root, target) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, target);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${target}`);
  }
  return resolved;
}

// Metrics Functions
function calculateMetrics(memoryDir) {
  const tasks = readTasks(memoryDir);
  const workflows = readWorkflows(memoryDir);
  const relayEvents = readRelayStatus(memoryDir);
  const relayStatus = Object.values(readLatestRelayStatusByThread(memoryDir));
  const dispatchQueue = readDispatchQueue(memoryDir);

  // Task metrics
  const tasksByStatus = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});

  const tasksByTool = tasks.reduce((acc, task) => {
    if (task.assignee) {
      acc[task.assignee] = (acc[task.assignee] || 0) + 1;
    }
    return acc;
  }, {});

  const completedTasks = tasks.filter((t) => t.status === "done" && t.completedAt && t.createdAt);
  const taskDurations = completedTasks.map((t) => {
    const start = new Date(t.createdAt).getTime();
    const end = new Date(t.completedAt).getTime();
    return end - start;
  });

  const avgTaskDuration = taskDurations.length > 0
    ? taskDurations.reduce((sum, d) => sum + d, 0) / taskDurations.length
    : 0;

  // Workflow metrics
  const workflowsByStatus = workflows.reduce((acc, wf) => {
    acc[wf.status] = (acc[wf.status] || 0) + 1;
    return acc;
  }, {});

  const completedWorkflows = workflows.filter((w) => w.status === "done" && w.completedAt && w.createdAt);
  const workflowDurations = completedWorkflows.map((w) => {
    const start = new Date(w.createdAt).getTime();
    const end = new Date(w.completedAt).getTime();
    return end - start;
  });

  const avgWorkflowDuration = workflowDurations.length > 0
    ? workflowDurations.reduce((sum, d) => sum + d, 0) / workflowDurations.length
    : 0;

  // Relay metrics
  const relayByStatus = relayStatus.reduce((acc, relay) => {
    const status = relay.state || relay.deliveryState || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const completedRelays = relayStatus.filter((r) => (r.state || r.deliveryState) === "completed");
  const failedRelays = relayStatus.filter((r) => ["failed", "abandoned"].includes(r.state || r.deliveryState));
  const progressRelays = relayStatus.filter((r) => (r.state || r.deliveryState) === "progress");

  const relaySuccessRate = relayStatus.length > 0
    ? ((completedRelays.length / relayStatus.length) * 100).toFixed(2)
    : 0;

  // Queue metrics
  const queueByStatus = dispatchQueue.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});

  const queuedEntries = dispatchQueue.filter((e) => e.status === "queued");
  const runningEntries = dispatchQueue.filter((e) => e.status === "running");
  const failedQueueEntries = dispatchQueue.filter((e) => e.status === "failed");

  // Recent failures
  const recentFailures = [
    ...failedRelays.slice(-5).map((r) => ({
      type: "relay",
      id: r.dispatchId || r.sourceId || r.id,
      error: r.lastError,
      time: r.ts || r.deliveryUpdatedAt
    })),
    ...failedQueueEntries.slice(-5).map((q) => ({
      type: "queue",
      id: q.id,
      error: q.lastError,
      time: q.lastAttemptAt
    }))
  ].sort((a, b) => (b.time || "").localeCompare(a.time || "")).slice(0, 10);

  return {
    tasks: {
      total: tasks.length,
      byStatus: tasksByStatus,
      byTool: tasksByTool,
      avgDurationMs: Math.round(avgTaskDuration),
      avgDurationHuman: formatDuration(avgTaskDuration)
    },
    workflows: {
      total: workflows.length,
      byStatus: workflowsByStatus,
      avgDurationMs: Math.round(avgWorkflowDuration),
      avgDurationHuman: formatDuration(avgWorkflowDuration)
    },
    relay: {
      total: relayStatus.length,
      eventsTotal: relayEvents.length,
      byStatus: relayByStatus,
      completed: completedRelays.length,
      failed: failedRelays.length,
      progress: progressRelays.length,
      successRate: `${relaySuccessRate}%`
    },
    queue: {
      total: dispatchQueue.length,
      byStatus: queueByStatus,
      queued: queuedEntries.length,
      running: runningEntries.length,
      failed: failedQueueEntries.length
    },
    recentFailures
  };
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

function normalizePriority(priority) {
  const clean = String(priority || "normal").toLowerCase();
  return ["low", "normal", "high", "urgent"].includes(clean) ? clean : "normal";
}

function normalizeMemoryMetadata(metadata = {}, fallback = {}) {
  const normalized = { ...metadata };
  normalized.kind = normalizeMemoryKind(normalized.kind || normalized.type || fallback.kind || fallback.type || "note");
  normalized.project = normalizeMemoryProject(normalized.project || fallback.project || "");
  normalized.tags = normalizeList(normalized.tags?.length ? normalized.tags : fallback.tags);
  normalized.scope = normalizeMemoryScope(normalized.scope || fallback.scope || "");
  normalized.refs = normalizeMemoryRefs(normalized.refs || normalized.references || {}, { ...fallback, ...normalized });
  normalized.confidence = normalizeConfidence(normalized.confidence ?? fallback.confidence);
  return normalized;
}

function normalizeMemoryKind(kind) {
  const clean = String(kind || "note").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
  return clean || "note";
}

function normalizeMemoryProject(project) {
  return String(project || "").trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeMemoryScope(scope) {
  const clean = String(scope || "").trim().toLowerCase().replace(/\s+/g, "-");
  return clean;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => normalizeList(item)))];
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [...new Set(String(value)
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean))];
}

function parseListOption(value) {
  return normalizeList(value);
}

function normalizeMemoryRefs(refs = {}, fallback = {}) {
  const source = isPlainObject(refs) ? refs : {};
  const aliases = {
    thread: ["thread", "threadId", "thread_id", "conversationId", "conversation_id"],
    threadKey: ["threadKey", "thread_key"],
    taskId: ["taskId", "task_id", "task"],
    workflowId: ["workflowId", "workflow_id", "workflow"],
    radioId: ["radioId", "radio_id", "radio", "messageId", "message_id", "replyTo", "reply_to"],
    dispatchId: ["dispatchId", "dispatch_id"],
    sourceId: ["sourceId", "source_id", "localEventId", "local_event_id"]
  };
  const normalized = {};
  for (const [targetKey, keys] of Object.entries(aliases)) {
    const values = normalizeRefValues(firstDefinedRef(source, fallback, keys));
    if (values.length === 1) {
      normalized[targetKey] = values[0];
    } else if (values.length > 1) {
      normalized[targetKey] = values;
    }
  }
  return normalized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstDefinedRef(source, fallback, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
    if (fallback[key] !== undefined && fallback[key] !== null && fallback[key] !== "") {
      return fallback[key];
    }
  }
  return "";
}

function normalizeRefValues(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => normalizeRefValues(item)))];
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (isPlainObject(value)) {
    return Object.values(value).flatMap((item) => normalizeRefValues(item));
  }
  return [String(value).trim()].filter(Boolean);
}

function flattenMemoryRefs(refs = {}) {
  if (!isPlainObject(refs)) {
    return [];
  }
  return [...new Set(Object.values(refs).flatMap((value) => normalizeRefValues(value)))];
}

function formatMemoryRefs(refs = {}) {
  if (!isPlainObject(refs)) {
    return "";
  }
  const parts = [];
  for (const key of ["thread", "threadKey", "taskId", "workflowId", "radioId"]) {
    const values = normalizeRefValues(refs[key]).slice(0, 3);
    if (values.length > 0) {
      parts.push(`${key}=${values.join(",")}`);
    }
  }
  return parts.join(" ");
}

function filterMemoryRecords(records, filters = {}) {
  return records
    .filter((record) => filters.project ? record.project === normalizeMemoryProject(filters.project) : true)
    .filter((record) => matchesMemoryRef(record, "thread", filters.thread))
    .filter((record) => matchesMemoryRef(record, "taskId", filters.taskId))
    .filter((record) => matchesMemoryRef(record, "workflowId", filters.workflowId))
    .filter((record) => matchesMemoryRef(record, "radioId", filters.radioId));
}

function matchesMemoryRef(memory, key, query) {
  if (!query) {
    return true;
  }
  const target = normalizeRefToken(query);
  const candidates = [
    ...(normalizeRefValues(memory.refs?.[key])),
    ...(normalizeRefValues(memory.metadata?.refs?.[key]))
  ];
  return candidates.some((candidate) => {
    const value = normalizeRefToken(candidate);
    return value === target || value.startsWith(target) || target.startsWith(value);
  });
}

function normalizeRefToken(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeConfidence(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  if (numeric > 1) {
    return Math.max(0, Math.min(1, numeric / 100));
  }
  return Math.max(0, Math.min(1, numeric));
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
    version: 2,
    schemaVersion: 2,
    memoryDir: config.memoryDir,
    stats,
    topics: countBy(records.flatMap((item) => item.topics)),
    kinds: countBy(records.map((item) => item.kind || item.metadata?.kind || "note")),
    projects: countBy(records.map((item) => item.project || item.metadata?.project || "").filter(Boolean)),
    scopes: countBy(records.map((item) => item.scope || "").filter(Boolean)),
    tags: countBy(records.flatMap((item) => item.tags || [])),
    threads: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.thread))),
    tasks: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.taskId))),
    workflows: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.workflowId))),
    radios: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.radioId))),
    sources: countBy(records.map((item) => item.source || "unknown")),
    records
  };
}

function enrichMemory(memory, ordinal, total) {
  const metadata = normalizeMemoryMetadata(memory.metadata || {}, memory);
  const kind = normalizeMemoryKind(metadata.kind || "note");
  const tags = normalizeList(metadata.tags);
  const project = normalizeMemoryProject(metadata.project || memory.project || "");
  const refs = normalizeMemoryRefs(metadata.refs || memory.refs || {}, { ...memory, ...metadata });
  const canonicalMemory = {
    ...memory,
    project,
    tags,
    refs,
    metadata: {
      ...metadata,
      project,
      tags,
      kind,
      refs
    }
  };
  const topics = inferTopics(canonicalMemory);
  const importance = scoreImportance(canonicalMemory, topics, ordinal, total);
  const confidence = normalizeConfidence(metadata.confidence);
  const layer = chooseMemoryLayer(kind, importance);
  const scope = normalizeMemoryScope(metadata.scope) || inferScope(kind, topics, project);
  return {
    ...memory,
    schemaVersion: 2,
    kind,
    project,
    tags,
    refs,
    confidence,
    metadata: {
      ...metadata,
      kind,
      project,
      tags,
      scope,
      confidence,
      refs
    },
    layer,
    importance,
    scope,
    topics,
    keywords: extractKeywords(`${memory.text} ${project} ${tags.join(" ")} ${flattenMemoryRefs(refs).join(" ")} ${(topics || []).join(" ")}`)
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
  lines.push(`- Top projects: ${index.projects.slice(0, 8).map((item) => `${item.key}(${item.count})`).join(", ") || "none"}.`);
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
    `- Schema version: ${index.schemaVersion || index.version || 1}`,
    "",
    "## Top Topics",
    ""
  ];
  for (const item of index.topics.slice(0, 40)) {
    lines.push(`- ${item.key}: ${item.count}`);
  }
  lines.push("");
  lines.push("## Top Projects");
  lines.push("");
  for (const item of index.projects.slice(0, 40)) {
    lines.push(`- ${item.key}: ${item.count}`);
  }
  lines.push("");
  lines.push("## Top Tags");
  lines.push("");
  for (const item of index.tags.slice(0, 40)) {
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
  const kind = memory.kind || memory.metadata?.kind ? `/${memory.kind || memory.metadata.kind}` : "";
  const topics = memory.topics?.length ? ` topics=${memory.topics.slice(0, 5).join(",")}` : "";
  const project = memory.project ? ` project=${memory.project}` : "";
  const tags = memory.tags?.length ? ` tags=${memory.tags.slice(0, 5).join(",")}` : "";
  const refs = formatMemoryRefs(memory.refs);
  return `- [${memory.source}${kind} score=${memory.importance}${project}${tags}${topics}${refs ? ` refs=${refs}` : ""}] ${memory.text}`;
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
        memory.kind || memory.metadata?.kind || "",
        memory.project || memory.metadata?.project || "",
        memory.scope || "",
        ...(memory.tags || memory.metadata?.tags || []),
        ...flattenMemoryRefs(memory.refs || memory.metadata?.refs)
      ]);
      const searchTerms = new Set([
        ...extractSearchTerms(text),
        ...extractSearchTerms((memory.topics || []).join(" ")),
        ...extractSearchTerms(memory.source || ""),
        ...extractSearchTerms(memory.kind || memory.metadata?.kind || ""),
        ...extractSearchTerms(memory.project || memory.metadata?.project || ""),
        ...extractSearchTerms(memory.scope || ""),
        ...extractSearchTerms((memory.tags || memory.metadata?.tags || []).join(" ")),
        ...extractSearchTerms(flattenMemoryRefs(memory.refs || memory.metadata?.refs).join(" "))
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

function inferScope(kind, topics, project = "") {
  if (kind === "preference") return "user";
  if (kind === "workflow" || kind === "correction" || kind === "lesson") return "workflow";
  if (project) return "project";
  if (topics.includes("ai-memory-hub")) return "memory-hub";
  if (topics.includes("game") || topics.includes("wechat-mini-game")) return "project";
  return "general";
}

function inferTopics(memory) {
  const tags = normalizeList(memory.tags?.length ? memory.tags : memory.metadata?.tags);
  const text = `${memory.text || ""} ${memory.project || memory.metadata?.project || ""} ${tags.join(" ")}`.toLowerCase();
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
  const metadata = normalizeMemoryMetadata(event.metadata || {}, event);
  if (!metadata.kind && event.type) {
    metadata.kind = normalizeMemoryKind(event.type);
  }
  if (event.tags && !metadata.tags) {
    metadata.tags = normalizeList(event.tags);
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
    deliveryState: "pending",
    deliveryUpdatedAt: "",
    dispatchId: "",
    threadKey: "",
    attempt: 0,
    maxRetries: 0,
    nextRetryAt: "",
    sessionId: "",
    lastError: "",
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
    deliveryState: message.deliveryState || "pending",
    deliveryUpdatedAt: message.deliveryUpdatedAt || "",
    dispatchId: message.dispatchId || "",
    threadKey: message.threadKey || "",
    attempt: Number(message.attempt || 0),
    maxRetries: Number(message.maxRetries || 0),
    nextRetryAt: message.nextRetryAt || "",
    sessionId: message.sessionId || "",
    lastError: message.lastError || "",
    progressPercent: message.progressPercent ?? null,
    progressStatus: message.progressStatus || "",
    progressAt: message.progressAt || "",
    progressBy: message.progressBy || "",
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
  const value = argv[index + 1] || "";
  return value.startsWith("--") ? "" : value;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function parsePositiveIntegerOption(rawValue, name, { allowEmpty = false, defaultValue = 0 } = {}) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (allowEmpty) {
      return defaultValue;
    }
    throw new Error(`${name} requires a positive integer.`);
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
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
  return resolveCommandPaths(commandName).length > 0;
}

function resolveCommandPaths(commandName) {
  const name = String(commandName || "").trim();
  if (!name) {
    return [];
  }
  if (path.isAbsolute(name) || /[\\/]/.test(name)) {
    return fs.existsSync(name) ? [path.resolve(name)] : [];
  }
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", [name], {
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0) {
      return [];
    }
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(name)}`], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return [];
  }
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function choosePreferredCommandPath(paths) {
  return [...new Set((paths || []).filter(Boolean))]
    .sort((a, b) => commandPathPriority(a) - commandPathPriority(b))[0] || "";
}

function commandPathPriority(file) {
  const kind = classifyCommandPath(file);
  if (kind === "executable") return 0;
  if (kind === "native") return process.platform === "win32" ? 30 : 5;
  if (kind === "cmd-shim") return 10;
  if (kind === "cmd-script") return 12;
  if (kind === "powershell-shim") return 90;
  return 50;
}

function classifyCommandPath(file) {
  const ext = path.extname(String(file || "")).toLowerCase();
  if (ext === ".exe" || ext === ".com") return "executable";
  if (ext === ".cmd") return "cmd-shim";
  if (ext === ".bat") return "cmd-script";
  if (ext === ".ps1") return "powershell-shim";
  return ext ? "file" : "native";
}

function shouldUseShellForCommand(file) {
  if (process.platform !== "win32") {
    return false;
  }
  const kind = classifyCommandPath(file);
  return kind === "cmd-shim" || kind === "cmd-script";
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
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
