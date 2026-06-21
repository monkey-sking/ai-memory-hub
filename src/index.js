#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDashboardActionsApi } from "./dashboard/actions.js";
import { createDashboardBackupsApi } from "./dashboard/backups.js";
import { createDashboardDispatchApi } from "./dashboard/dispatch.js";
import { createDashboardHealthApi } from "./dashboard/health.js";
import { createDashboardMemoryApi } from "./dashboard/memory.js";
import { createDashboardMetricsApi } from "./dashboard/metrics.js";
import { createDashboardProjectsApi } from "./dashboard/projects.js";
import { createDashboardRadioApi } from "./dashboard/radio.js";
import { createDashboardRealtimeApi } from "./dashboard/realtime.js";
import { createDashboardSettingsApi, defaultDashboardShortcuts } from "./dashboard/settings.js";
import { createDashboardSearchApi } from "./dashboard/search.js";
import { createDashboardTasksApi } from "./dashboard/tasks.js";
import { createDashboardToolsApi } from "./dashboard/tools.js";
import { createDashboardWorkflowsApi } from "./dashboard/workflows.js";

// Permission policy layer (P0: capability permission matrix) — defined at the
// top so they are initialized before dashboard module initialization.
const POLICY_OPERATIONS = [
  "read-memory", "write-memory", "send-radio", "claim-task", "dispatch",
  "modify-files", "run-tests", "install-dependencies", "push", "delete",
  "purge", "archive"
];
const POLICY_DECISIONS = ["allow", "ask", "deny"];
const POLICY_SCOPES = ["all", "project", "own"];
const POLICY_SCOPE_BREADTH = { all: 3, project: 2, own: 1 };
const POLICY_DESTRUCTIVE_OPERATIONS = ["push", "delete", "purge", "install-dependencies"];

// Seeded defaults derived from the previously hardcoded guardrails.
const POLICY_DEFAULT_SEED = [
  { operation: "read-memory", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "write-memory", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "send-radio", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "claim-task", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "dispatch", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "run-tests", decision: "allow", reason: "Running tests is safe" },
  { operation: "modify-files", decision: "allow", reason: "Editing within the workspace is allowed" },
  { operation: "archive", decision: "allow", reason: "Archiving is reversible" },
  { operation: "install-dependencies", decision: "ask", reason: "Dependency installs need approval (supply-chain safety)" },
  { operation: "push", decision: "ask", reason: "Pushing to remote needs human approval" },
  { operation: "delete", decision: "ask", reason: "Destructive data operations need approval" },
  { operation: "purge", decision: "ask", reason: "Destructive data operations need approval" }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_NAME = "ai-memory-hub";
const MEMORY_DIR_ENV = "AI_MEMORY_DIR";
const DEFAULT_MEMORY_DIR = path.join(os.homedir(), ".ai-memory");
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_MEMORY_DIR, "config.json");
const DEFAULT_GITHUB_BACKUP_REMOTE = "";
const DEFAULT_GITHUB_BACKUP_REPO_DIR = path.join(os.homedir(), ".ai-memory-github-backup");
const DEFAULT_GITHUB_BACKUP_TASK_NAME = "AI Memory Hub GitHub Backup";
const DEFAULT_DISPATCH_ACK_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_DISPATCH_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_DISPATCH_MAX_RETRIES = 3;
const DEFAULT_TASK_SPEC_TIMEOUT_MS = 10 * 60 * 1000;
const STALE_OPERATIONAL_RADIO_AFTER_DAYS = 7;
const OPERATIONAL_RADIO_DECAY_RATE_PER_DAY = 8;
const MEMORY_ACCESS_RECENT_DAYS = 7;
const MEMORY_ACCESS_STALE_AFTER_DAYS = 45;
const MEMORY_ACCESS_STALE_DECAY_RATE_PER_DAY = 0.5;
const MEMORY_ACCESS_MAX_HEAT = 12;
const MEMORY_ACCESS_MAX_STALE_PENALTY = 24;
const CORRUPTION_MARKER_PATTERN = /[\u0000\ufffd]/;
const TOOL_DETECTION_CACHE_TTL_MS = 30 * 1000;
const STARTUP_MEMORY_LIMIT = 8;
const SHARED_SKILL_LAYER_VERSION = "1";
const SHARED_SKILL_LAYER_MARKER = `AI_MEMORY_HUB_SHARED_SKILL_LAYER v${SHARED_SKILL_LAYER_VERSION}`;
const SHARED_SKILL_LAYER_MARKER_PREFIX = "AI_MEMORY_HUB_SHARED_SKILL_LAYER";
const PROJECT_STATUSES = ["active", "paused", "archived", "planning"];
const PROJECT_VISIBLE_STATUSES = ["active", "paused", "planning"];
const DEFAULT_TASK_SPEC_FILES = [
  ".tasks.json",
  "task-specs.json",
  path.join(".ai-memory", "task-specs.json")
];
const RESEARCH_REPORTS_DIR = "research-reports";
const DISPATCH_RUNS_DIR = "dispatch-runs";
const DEFAULT_DISPATCH_WORKTREE_DIR = ".ai-worktrees";
const DAEMON_PID_FILE = "daemon.pid";
const DAEMON_STATUS_FILE = "daemon-status.json";
const DAEMON_DEFAULT_TOOLS = ["codex", "gemini", "claude"];
const TOOL_CAPABILITY_REGISTRY_VERSION = 1;
let toolDetectionCache = null;

const dashboardMemory = createDashboardMemoryApi({
  appendJsonl,
  buildMemoryIndex,
  createId,
  getMemoryIdentityKeys,
  getMemoryPrimaryKey,
  isPlainObject,
  loadConfig,
  normalizeMemoryMetadata,
  normalizeSupersedeToken,
  readEvents,
  readLedger,
  readTextIfExists
});

const dashboardRadio = createDashboardRadioApi({
  readRadioMessages
});

const dashboardTasks = createDashboardTasksApi({
  readTasks
});

const dashboardWorkflows = createDashboardWorkflowsApi({
  appendJsonl,
  assertWorkflowStatus,
  createRadioMessage,
  createTaskNote,
  createWorkflow,
  deleteEntityRecord,
  findWorkflowIndex,
  getDefaultProjectName: () => path.basename(process.cwd()),
  getRadioMessagesFile: (memoryDir) => path.join(memoryDir, "radio", "messages.jsonl"),
  getWorkflowEventStoreDefinition,
  normalizePriority,
  normalizeWorkflowRole,
  notifyWorkflowRoles,
  readWorkflows,
  readWorkflowNodes,
  spawnWorkflowTasks,
  updateWorkflow,
  writeWorkflows
});

const dashboardProjects = createDashboardProjectsApi({
  createProject,
  filterProjects,
  findProjectIndex,
  isPlainObject,
  isHiddenProjectId,
  normalizeProjectStatus,
  parseProjectListOption,
  projectStatuses: PROJECT_STATUSES,
  projectVisibleStatuses: PROJECT_VISIBLE_STATUSES,
  readProjects,
  readRadioMessages,
  readTasks,
  readWorkflows,
  updateProject,
  writeProjects,
  uniqueStringList
});

const dashboardMetrics = createDashboardMetricsApi({
  readDispatchQueue,
  readLatestRelayStatusByThread,
  readRelayStatus,
  readTasks,
  readWorkflows
});

const dashboardDispatch = createDashboardDispatchApi({
  readDispatchLog,
  readLatestRelayStatusByThread
});

const dashboardTools = createDashboardToolsApi({
  capabilityRegistryVersion: TOOL_CAPABILITY_REGISTRY_VERSION,
  getCachedDetectedTools,
  getRunnerProfile,
  normalizeToolName,
  readDispatchRuns,
  readLatestRelayStatusByThread,
  readRadioMessages,
  readTasks,
  refreshDetectedTools,
  resolvePermission,
  POLICY_OPERATIONS
});

const dashboardSettings = createDashboardSettingsApi({
  defaultConfig,
  getBackupRetentionConfig,
  loadConfig,
  readJsonSafe,
  writeJson
});

const dashboardBackups = createDashboardBackupsApi({
  backupHub,
  configureGitHubBackup,
  getBackupDetail,
  getBackupRetentionConfig,
  getBackupSummary,
  getGitHubBackupStatus,
  loadConfig,
  pruneBackups,
  restoreBackup,
  runGitHubBackup,
  withHubLock
});

const dashboardSearch = createDashboardSearchApi({
  buildMemoryIndex,
  countBy,
  extractSearchTerms,
  loadConfig,
  normalizeList,
  normalizeSearchText,
  readLedger,
  readRadioMessages,
  readTasks,
  readWorkflows,
  sanitizeInlineText,
  titleCase,
  truncateText
});

const dashboardHealth = createDashboardHealthApi({
  analyzeMemoryHealth,
  buildMemoryIndex,
  formatBytes,
  formatMemoryRecordPointer,
  formatPercent,
  readLedger,
  renderMemoryHealthReport,
  sanitizeInlineText,
  truncateText
});

const dashboardRealtime = createDashboardRealtimeApi({
  dashboardBackups,
  dashboardDispatch,
  dashboardMemory,
  dashboardMetrics,
  dashboardProjects,
  dashboardRadio,
  dashboardSettings,
  dashboardTasks,
  dashboardTools,
  dashboardWorkflows,
  getStatusObject
});

const dashboardActions = createDashboardActionsApi({
  appendIfMissing,
  appendJsonl,
  assertTaskStatus,
  createRadioMessage,
  createTask,
  createTaskNote,
  ensureDir,
  executeDispatch,
  findTaskIndex,
  getDefaultProjectName: () => path.basename(process.cwd()),
  getEntityEventsFile,
  getEntityProjectionFile,
  getInstallTargets,
  getLocalInstallTargets,
  getRadioMessagesFile: (memoryDir) => path.join(memoryDir, "radio", "messages.jsonl"),
  getStatusObject,
  getTaskEventStoreDefinition,
  invalidateToolDetectionCache,
  materializeEntityProjection,
  pullCommand,
  radioPromoteCommand,
  readEntityEvents,
  readTasks,
  readWorkflows,
  recordCommand,
  renderInstallSnippet,
  syncCommand,
  updateTask,
  withHubLock,
  writeTasks,
  writeWorkflows
});

const RUNNER_PROFILES = {
  codex: {
    tool: "codex",
    commandCandidates: ["codex.cmd", "codex"],
    args: ["exec", "--sandbox", "danger-full-access", "--skip-git-repo-check"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "codex exec --sandbox danger-full-access --skip-git-repo-check <stdin>",
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
  mimocode: {
    tool: "mimocode",
    commandCandidates: ["mimo.cmd", "mimo", "mimocode.cmd", "mimocode"],
    args: ["run"],
    promptMode: "argv",
    outputMode: "text",
    compactPrompt: true,
    preview: "mimo run <prompt>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    capabilities: ["direct-dispatch", "argv-prompt", "text-output", "opencode-compatible"]
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

const RECIPE_GATE_STRING_ARRAY_FIELDS = ["stopWhen", "allowedActions", "forbiddenActions"];
const RECIPE_GATE_FIELDS = ["verifyCommands", ...RECIPE_GATE_STRING_ARRAY_FIELDS, "reviewRequired", "maxRepairAttempts", "minimalImplementation", "dependencyBudget"];

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
    case "capability":
    case "capabilities":
      return capabilitiesCommand(rest);
    case "policy":
      return policyCommand(rest);
    case "status":
      return statusCommand();
    case "record":
      return recordCommand(rest);
    case "memory":
      return memoryCommand(rest);
    case "radio":
      return radioCommand(rest);
    case "project":
    case "projects":
      return projectCommand(rest);
    case "task":
    case "todo":
      return taskCommand(rest);
    case "workflow":
    case "flow":
      return workflowCommand(rest);
    case "gate":
      return gateCommand(rest);
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
    case "health":
      return healthCommand(rest);
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
    case "snapshot":
      return snapshotCommand(rest);
    case "resolve":
      return resolveCommand(rest);
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

function capabilitiesCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const tool = getOption(argv, "--tool") || getOption(argv, "--to") || positionalArgs(argv)[0] || "";
  const registry = dashboardTools.buildCapabilityRegistry(config.memoryDir, {
    refresh: hasFlag(argv, "--refresh")
  });
  if (tool) {
    const name = normalizeToolName(tool);
    console.log(JSON.stringify({
      ...registry,
      tools: registry.tools.filter((entry) => normalizeToolName(entry.name) === name),
      summary: dashboardTools.summarizeCapabilityRegistry(registry.tools.filter((entry) => normalizeToolName(entry.name) === name))
    }, null, 2));
    return;
  }
  console.log(JSON.stringify(registry, null, 2));
}

function policyCommand(argv) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "init":
      return policyInitCommand(actionArgs);
    case "add":
      return policyAddCommand(actionArgs);
    case "list":
      return policyListCommand(actionArgs);
    case "remove":
    case "rm":
      return policyRemoveCommand(actionArgs);
    case "show":
      return policyShowCommand(actionArgs);
    case "check":
      return policyCheckCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub policy <init|add|list|remove|show|check> ...");
  }
}

function policyInitCommand() {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "policy-init", () => {
    const added = seedDefaultPolicyRules(config.memoryDir);
    console.log(JSON.stringify({ ok: true, seeded: added, message: added > 0 ? `Seeded ${added} default policy rule(s).` : "Defaults already present." }, null, 2));
  }, config.sync.lockStaleMs);
}

function policyAddCommand(argv) {
  const actor = getOption(argv, "--actor") || "*";
  const project = getOption(argv, "--project") || "*";
  const operation = getOption(argv, "--operation") || "";
  const scope = getOption(argv, "--scope") || "all";
  const decision = getOption(argv, "--decision") || "";
  const reason = getOption(argv, "--reason") || "";
  const priority = getOption(argv, "--priority");
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "human";
  if (!operation || !decision) {
    throw new Error("Usage: ai-memory-hub policy add --operation <op> --decision <allow|ask|deny> [--actor <actor>] [--project <project>] [--scope all|project|own] [--reason <text>] [--priority N] [--by human]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "policy-add", () => {
    const rule = appendPolicyRule(config.memoryDir, {
      actor, project, operation, scope, decision, reason,
      priority: priority !== "" ? Number(priority) : 100,
      createdBy: by
    });
    console.log(JSON.stringify(rule, null, 2));
  }, config.sync.lockStaleMs);
}

function policyListCommand(argv) {
  const actorFilter = getOption(argv, "--actor") || "";
  const operationFilter = getOption(argv, "--operation") || "";
  const config = loadConfig();
  ensureHub(config.memoryDir);
  let rules = readPolicyRules(config.memoryDir);
  if (actorFilter) rules = rules.filter((rule) => rule.actor === actorFilter);
  if (operationFilter) rules = rules.filter((rule) => rule.operation === operationFilter);
  console.log(JSON.stringify({ count: rules.length, rules }, null, 2));
}

function policyRemoveCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "human";
  if (!id) {
    throw new Error("Usage: ai-memory-hub policy remove --id <rule-id> [--by human]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "policy-remove", () => {
    const removed = removePolicyRule(config.memoryDir, id, by);
    console.log(JSON.stringify({ ok: true, removed }, null, 2));
  }, config.sync.lockStaleMs);
}

function policyShowCommand(argv) {
  const actor = getOption(argv, "--actor") || "*";
  const actorRoles = (getOption(argv, "--roles") || "").split(",").map((r) => r.trim()).filter(Boolean);
  const project = getOption(argv, "--project") || "*";
  const scope = getOption(argv, "--scope") || "all";
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const byOperation = {};
  for (const operation of POLICY_OPERATIONS) {
    const result = resolvePermission(config.memoryDir, { actor, actorRoles, project, operation, scope });
    byOperation[operation] = { decision: result.decision, reason: result.reason };
  }
  console.log(JSON.stringify({ actor, project, scope, byOperation }, null, 2));
}

function policyCheckCommand(argv) {
  const actor = getOption(argv, "--actor") || "*";
  const actorRoles = (getOption(argv, "--roles") || "").split(",").map((r) => r.trim()).filter(Boolean);
  const project = getOption(argv, "--project") || "*";
  const operation = getOption(argv, "--operation") || "";
  const scope = getOption(argv, "--scope") || "all";
  if (!operation) {
    throw new Error("Usage: ai-memory-hub policy check --operation <op> [--actor <actor>] [--roles role:executor,...] [--project <project>] [--scope all|project|own]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const result = resolvePermission(config.memoryDir, { actor, actorRoles, project, operation, scope });
  console.log(JSON.stringify(result, null, 2));
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
    timeoutMs,
    memoryDir: config.memoryDir
  }));
  const summary = {
    total: results.length,
    runnable: results.filter((item) => item.available).length,
    sharedStateOnly: results.filter((item) => item.sharedStateOnly).length,
    missing: results.filter((item) => !item.available && !item.sharedStateOnly).length,
    skillLayer: results.filter((item) => item.install?.skillLayer).length,
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

function inspectRunnerTool(tool, { runProbes = false, skipVersion = false, timeoutMs = 5000, memoryDir = resolveMemoryDir() } = {}) {
  const name = normalizeToolName(tool);
  const profile = getRunnerProfile(name);
  const runner = getToolRunner(name);
  const warnings = getRunnerDoctorWarnings(runner);
  const target = getInstallTargetForTool(memoryDir, name);
  const instructionFile = target?.file || path.join(memoryDir, "tools", `${name}-shared-memory.md`);
  const install = inspectSharedMemoryInstructions(instructionFile);
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
    install: {
      instructionFile,
      configured: install.configured,
      skillLayer: install.skillLayer,
      skillLayerVersion: install.skillLayerVersion,
      status: install.status
    },
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
  const projects = readProjects(memoryDir);
  const relayLatest = Object.values(readLatestRelayStatusByThread(memoryDir));
  const backups = countBackupDirs(memoryDir);
  const lock = readLockStatus(memoryDir);
  const tools = getCachedDetectedTools(memoryDir);
  const toolSummary = dashboardTools.summarizeToolConnections(tools);
  const capabilityRegistry = dashboardTools.buildCapabilityRegistry(memoryDir, { tools, includeMetrics: false });
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
    projects: {
      total: projects.length,
      visible: projects.filter(isProjectVisible).length,
      active: projects.filter((project) => project.status === "active").length,
      paused: projects.filter((project) => project.status === "paused").length,
      planning: projects.filter((project) => project.status === "planning").length,
      archived: projects.filter((project) => project.status === "archived").length
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
    capabilitySummary: capabilityRegistry.summary,
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
  const installedNeedingUpdate = tools.filter((tool) => tool.installed && (!tool.configured || !tool.skillLayer));

  if (apply) {
    for (const tool of installedNeedingUpdate) {
      const target = getInstallTargetForTool(config.memoryDir, tool.name);
      if (!target) continue;
      const snippet = renderInstallSnippet(target, config.memoryDir);
      ensureDir(path.dirname(target.file));
      appendIfMissing(target.file, snippet, "Shared AI Memory");
    }
  }

  const refreshed = apply ? detectTools(config.memoryDir) : tools;
  const summary = dashboardTools.summarizeToolConnections(refreshed);
  console.log(JSON.stringify({
    apply,
    summary,
    tools: refreshed.map((tool) => ({
      name: tool.name,
      installed: tool.installed,
      configured: tool.configured,
      connected: tool.connected,
      connectionStatus: tool.connectionStatus,
      skillLayer: tool.skillLayer,
      skillLayerVersion: tool.skillLayerVersion,
      skillLayerStatus: tool.skillLayerStatus,
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
      limit: Number(getOption(argv, "--limit") || 5),
      isolateWorktree: hasFlag(argv, "--isolate-worktree"),
      worktreeRoot: getOption(argv, "--worktree-root") || ""
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
  if (isCorruptedRadioMessage(message)) {
    throw new Error(`Refusing to promote corrupted radio message: ${message.id}`);
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

function projectCommand(argv) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "list":
      return projectListCommand(actionArgs);
    case "add":
    case "create":
      return projectAddCommand(actionArgs);
    case "update":
      return projectUpdateCommand(actionArgs);
    case "show":
      return projectShowCommand(actionArgs);
    case "alias":
      return projectAliasCommand(actionArgs);
    case "relate":
      return projectRelateCommand(actionArgs);
    case "delete":
    case "archive":
      return projectArchiveCommand(actionArgs);
    case "migrate":
      return projectMigrateCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub project <list|add|update|show|alias|relate|archive|migrate> ...");
  }
}

function projectListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const status = getOption(argv, "--status") || "all";
  const includeHidden = hasFlag(argv, "--include-hidden");
  const projects = filterProjects(readProjects(config.memoryDir), { status, includeHidden });
  console.log(JSON.stringify(projects, null, 2));
}

function projectAddCommand(argv) {
  const id = positionalArgs(argv)[0] || getOption(argv, "--id") || "";
  const name = getOption(argv, "--name") || positionalArgs(argv).slice(1).join(" ").trim();
  if (!id || !name) {
    throw new Error("Usage: ai-memory-hub project add <id> --name <name> [--status active] [--type game] [--description text]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "project-add", () => {
    const projects = readProjects(config.memoryDir);
    if (findProjectIndex(projects, id) !== -1) {
      throw new Error(`Project already exists: ${id}`);
    }
    const project = createProject({
      id,
      name,
      displayName: getOption(argv, "--display-name") || name,
      status: getOption(argv, "--status") || "active",
      type: getOption(argv, "--type") || "",
      description: getOption(argv, "--description") || "",
      aliases: parseProjectListOption(getOption(argv, "--aliases") || getOption(argv, "--alias")),
      resources: parseProjectResourceOptions(argv)
    });
    projects.push(project);
    writeProjects(config.memoryDir, projects);
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}

function projectUpdateCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub project update <id> [--name text] [--display-name text] [--status active] [--type game] [--description text]");
  }
  const patch = {};
  for (const [flag, key] of [
    ["--name", "name"],
    ["--display-name", "displayName"],
    ["--status", "status"],
    ["--type", "type"],
    ["--description", "description"]
  ]) {
    const value = getOption(argv, flag);
    if (value !== "") {
      patch[key] = value;
    }
  }
  const resources = parseProjectResourceOptions(argv);
  if (Object.keys(resources).length > 0) {
    patch.resources = resources;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("project update requires at least one editable field");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "project-update", () => {
    const project = updateProject(config.memoryDir, id, (current) => ({
      ...current,
      ...patch,
      resources: patch.resources ? { ...(current.resources || {}), ...patch.resources } : current.resources
    }));
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}

function projectShowCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub project show <id-or-alias>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const project = findProject(readProjects(config.memoryDir), id);
  if (!project) {
    throw new Error(`Project not found: ${id}`);
  }
  console.log(JSON.stringify(project, null, 2));
}

function projectAliasCommand(argv) {
  const [id, alias] = positionalArgs(argv);
  if (!id || !alias) {
    throw new Error("Usage: ai-memory-hub project alias <id-or-alias> <alias>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "project-alias", () => {
    const project = updateProject(config.memoryDir, id, (current) => ({
      ...current,
      aliases: uniqueStringList([...(current.aliases || []), alias])
    }));
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}

function projectRelateCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const basedOn = getOption(argv, "--based-on") || getOption(argv, "--parent") || "";
  const relation = getOption(argv, "--relation") || "";
  if (!id || !basedOn || !relation) {
    throw new Error("Usage: ai-memory-hub project relate <id-or-alias> --based-on <parent-id> --relation <type>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "project-relate", () => {
    const parent = findProject(readProjects(config.memoryDir), basedOn);
    const project = updateProject(config.memoryDir, id, (current) => ({
      ...current,
      metadata: {
        ...(current.metadata || {}),
        basedOn: parent?.id || basedOn,
        relation
      }
    }));
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}

function projectArchiveCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub project archive <id-or-alias> [--by tool]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "project-archive", () => {
    const now = new Date().toISOString();
    const project = updateProject(config.memoryDir, id, (current) => ({
      ...current,
      status: "archived",
      archivedAt: now,
      archivedBy: getOption(argv, "--by") || getOption(argv, "--from") || "manual"
    }));
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}

function projectMigrateCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const apply = hasFlag(argv, "--apply");
  const before = readProjects(config.memoryDir);
  const migrated = mergeSeedProjects(before);
  if (!apply) {
    console.log(JSON.stringify({
      apply,
      existing: before.length,
      after: migrated.length,
      added: migrated.length - before.length,
      hint: "Pass --apply to write missing seed projects."
    }, null, 2));
    return;
  }
  return withHubLock(config.memoryDir, "project-migrate", () => {
    const current = readProjects(config.memoryDir);
    const currentMigrated = mergeSeedProjects(current);
    writeProjects(config.memoryDir, currentMigrated);
    console.log(JSON.stringify({
      apply,
      existing: current.length,
      after: currentMigrated.length,
      added: currentMigrated.length - current.length
    }, null, 2));
  }, config.sync.lockStaleMs);
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
    tasks: result.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      assignee: t.assignee,
      recipeStep: t.recipeStep || null,
      qualityGate: t.qualityGate || null
    })),
    recipe: {
      name: result.recipe.name,
      steps: result.recipe.steps.length,
      qualityGate: normalizeQualityGate(extractQualityGate(result.recipe))
    }
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

  const metrics = dashboardMetrics.calculateMetrics(config.memoryDir);
  console.log(JSON.stringify(metrics, null, 2));
}

function healthCommand(argv) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "report";
  if (action === "repair" || action === "fix") {
    return healthRepairCommand(argv.slice(1));
  }
  if (action !== "report") {
    throw new Error("Usage: ai-memory-hub health [--limit N] | ai-memory-hub health repair [--apply] [--limit N]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const issueLimit = getOption(argv, "--limit")
    ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
    : 5;
  const report = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit });
  console.log(report.markdown);
}

function healthRepairCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const apply = hasFlag(argv, "--apply");
  const issueLimit = getOption(argv, "--limit")
    ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
    : 10;
  const result = apply
    ? withHubLock(config.memoryDir, "health-repair", () => runMemoryHealthRepair(config, { apply, issueLimit }), config.sync.lockStaleMs)
    : runMemoryHealthRepair(config, { apply, issueLimit });
  console.log(JSON.stringify(result, null, 2));
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
    case "purge":
      return taskPurgeCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub task <add|list|claim|status|update|note|done|purge> ...");
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
  const includeCancelled = hasFlag(argv, "--all");
  const tasks = readTasks(config.memoryDir)
    .filter((task) => taskListStatusMatches(task, status, includeCancelled))
    .filter((task) => project ? task.project === project : true)
    .filter((task) => assignee ? task.assignee === assignee : true)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, limit);
  console.log(JSON.stringify(tasks, null, 2));
}

function taskListStatusMatches(task, status, includeCancelled) {
  if (task.status === "cancelled" && !includeCancelled && status !== "cancelled") {
    return false;
  }
  if (status === "all") {
    return true;
  }
  if (status === "active") {
    return !["done", "cancelled"].includes(task.status);
  }
  return task.status === status;
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
    throw new Error("Usage: ai-memory-hub task status --id <task-id> --status <open|claimed|in_progress|blocked|needs_verification|done|cancelled> [--by codex]");
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

function taskPurgeCommand(argv) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const confirmTitle = getOption(argv, "--confirm") || "";
  const force = hasFlag(argv, "--force");

  if (!id) {
    throw new Error("Usage: ai-memory-hub task purge --id <task-id> --confirm <task-title>");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  return withHubLock(config.memoryDir, "task-purge", () => {
    const tasks = readTasks(config.memoryDir);
    const taskIndex = findTaskIndex(tasks, id);

    if (taskIndex === -1) {
      throw new Error(`Task not found: ${id}`);
    }

    const task = tasks[taskIndex];

    // Safety check: only allow purging cancelled tasks
    if (task.status !== "cancelled" && !force) {
      throw new Error(`Cannot purge task with status '${task.status}'. Only 'cancelled' tasks can be purged. Use --force to override (not recommended).`);
    }

    // Require confirmation by typing task title
    if (confirmTitle !== task.title) {
      console.error(JSON.stringify({
        error: true,
        message: "Confirmation failed. You must type the exact task title to confirm deletion.",
        taskId: task.id,
        taskTitle: task.title,
        hint: `Run: ai-memory-hub task purge --id ${id} --confirm "${task.title}"`
      }, null, 2));
      process.exit(1);
    }

    const definition = getTaskEventStoreDefinition();
    const eventsFile = getEntityEventsFile(config.memoryDir, definition);
    const projectionFile = getEntityProjectionFile(config.memoryDir, definition);
    const purgeLogFile = path.join(config.memoryDir, "tasks", "purge.log");

    // Create timestamped backups
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const eventsBackup = `${eventsFile}.backup.${timestamp}`;
    const projectionBackup = `${projectionFile}.backup.${timestamp}`;

    try {
      // Backup events file
      if (fs.existsSync(eventsFile)) {
        fs.copyFileSync(eventsFile, eventsBackup);
      }

      // Backup projection file
      if (fs.existsSync(projectionFile)) {
        fs.copyFileSync(projectionFile, projectionBackup);
      }

      // Read all events
      const allEvents = readEntityEvents(config.memoryDir, definition);

      // Filter out events related to this task (atomic write)
      const filteredEvents = allEvents.filter(event => event.entityId !== id);

      // Write filtered events atomically
      const tempEventsFile = `${eventsFile}.tmp.${Date.now()}`;
      ensureDir(path.dirname(tempEventsFile));
      fs.writeFileSync(
        tempEventsFile,
        filteredEvents.map(e => JSON.stringify(e)).join("\n") + (filteredEvents.length ? "\n" : ""),
        "utf8"
      );
      fs.renameSync(tempEventsFile, eventsFile);

      // Rematerialize projection
      materializeEntityProjection(config.memoryDir, definition);

      // Log the purge operation
      ensureDir(path.dirname(purgeLogFile));
      const logEntry = {
        ts: new Date().toISOString(),
        action: "purge",
        taskId: id,
        taskTitle: task.title,
        taskStatus: task.status,
        eventsBackup: path.basename(eventsBackup),
        projectionBackup: path.basename(projectionBackup),
        eventCountBefore: allEvents.length,
        eventCountAfter: filteredEvents.length,
        removedEvents: allEvents.length - filteredEvents.length
      };
      appendJsonl(purgeLogFile, logEntry);

      console.log(JSON.stringify({
        success: true,
        message: "Task purged successfully",
        taskId: id,
        taskTitle: task.title,
        backups: {
          events: eventsBackup,
          projection: projectionBackup
        },
        purgeLog: purgeLogFile
      }, null, 2));

    } catch (error) {
      // Restore from backups on error
      if (fs.existsSync(eventsBackup)) {
        fs.copyFileSync(eventsBackup, eventsFile);
      }
      if (fs.existsSync(projectionBackup)) {
        fs.copyFileSync(projectionBackup, projectionFile);
      }
      throw new Error(`Purge failed and backups restored: ${error.message}`);
    }

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
  const respectRecipeDependencies = hasFlag(argv, "--respect-recipe-dependencies");
  const isolateWorktree = hasFlag(argv, "--isolate-worktree");
  const worktreeRoot = getOption(argv, "--worktree-root") || "";
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const results = executeDispatch(config.memoryDir, { run, force, to, project, limit, respectRecipeDependencies, isolateWorktree, worktreeRoot });
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
  const latestWorktree = latestRun?.worktree || latest.worktree || source?.worktree || null;
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
    latestRunVerificationResult: latestRun?.verificationResult || "",
    latestRunFinishedAt: latestRun?.finishedAt || "",
    latestWorktree,
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
      maxRetries: normalizeDispatchRetryLimit(entry.maxRetries),
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
      maxRetries: normalizeDispatchRetryLimit(entry.maxRetries),
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
  const respectRecipeDependencies = hasFlag(argv, "--respect-recipe-dependencies");
  const isolateWorktree = hasFlag(argv, "--isolate-worktree");
  const worktreeRoot = getOption(argv, "--worktree-root") || "";
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const results = executeDispatchRetry(config.memoryDir, { run, to, project, limit, respectRecipeDependencies, isolateWorktree, worktreeRoot });
  if (results.length === 0) {
    console.log(JSON.stringify({ run, jobs: [], message: "No failed relay jobs are eligible for retry." }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    run,
    results
  }, null, 2));
}

function executeDispatch(memoryDir, {
  run = false,
  force = false,
  to = "",
  project = "",
  limit = 10,
  respectRecipeDependencies = false,
  isolateWorktree = false,
  worktreeRoot = ""
}) {
  const jobs = buildDispatchJobs(memoryDir, { to, project, limit, force, respectRecipeDependencies });
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
        const maxRetries = getDispatchJobMaxRetries(job);
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
    const maxRetries = getDispatchJobMaxRetries(job);

    // Phase 3: Permission policy preflight check
    const permission = resolvePermission(memoryDir, {
      actor: job.tool,
      actorRoles: job.roles || [],
      project: job.project || "*",
      operation: "dispatch",
      scope: "all"
    });
    if (permission.decision === "deny") {
      const result = {
        ...job,
        runnable: false,
        reason: `Permission denied: ${permission.reason}`,
        exitCode: 403,
        error: `Policy layer blocked dispatch: ${permission.reason}`
      };
      appendRelayStatus(memoryDir, job, {
        state: "failed-permanent",
        attempt,
        maxRetries,
        exitCode: 403,
        lastError: result.error,
        sessionId: "",
        ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: "failed-permanent",
        dispatchId: job.id,
        threadKey: getDispatchThreadKey(job),
        attempt,
        maxRetries,
        nextRetryAt: "",
        sessionId: "",
        lastError: result.error
      });
      const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "failed-permanent" });
      appendDispatchLog(memoryDir, result);
      applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "failed-permanent", {
        statusMessage
      });
      results.push(result);
      continue;
    }
    if (permission.decision === "ask") {
      // Phase 2: Create approval gate
      const gate = appendApprovalGateEvent(memoryDir, {
        status: "requested",
        actor: job.tool,
        scope: "dispatch",
        operation: "dispatch",
        refId: job.id,
        refType: "dispatch-job",
        reason: permission.reason,
        reviewer: "human",
        project: job.project || ""
      });
      const result = {
        ...job,
        runnable: false,
        reason: `Approval required: ${permission.reason}`,
        exitCode: 451,
        error: `Policy requires approval (gate ${gate.gateId}): ${permission.reason}`,
        gateId: gate.gateId
      };
      appendRelayStatus(memoryDir, job, {
        state: "approval-required",
        attempt,
        maxRetries,
        exitCode: 451,
        lastError: result.error,
        sessionId: "",
        ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        gateId: gate.gateId
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: "approval-required",
        dispatchId: job.id,
        threadKey: getDispatchThreadKey(job),
        attempt,
        maxRetries,
        nextRetryAt: "",
        sessionId: "",
        lastError: result.error,
        gateId: gate.gateId
      });
      const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "approval-required" });
      appendDispatchLog(memoryDir, result);
      applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "approval-required", {
        statusMessage
      });
      results.push(result);
      continue;
    }
    // permission.decision === "allow" → proceed

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
    const result = runDispatchJob(memoryDir, job, runner, { isolateWorktree, worktreeRoot });
    if (result.exitCode === 0) {
      appendRelayStatus(memoryDir, job, {
        state: "acked",
        attempt,
        maxRetries,
        exitCode: 0,
        lastError: "",
        sessionId: result.sessionId || "",
        ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        nextRetryAt: "",
        worktree: result.worktree || null
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: "acked",
        dispatchId: job.id,
        threadKey: getDispatchThreadKey(job),
        attempt,
        maxRetries,
        nextRetryAt: "",
        sessionId: result.sessionId || "",
        lastError: "",
        worktree: result.worktree || null
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
      nextRetryAt,
      worktree: result.worktree || null
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: finalState,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt,
      maxRetries,
      nextRetryAt,
      sessionId: result.sessionId || "",
      lastError,
      worktree: result.worktree || null
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

function executeDispatchRetry(memoryDir, {
  run = false,
  to = "",
  project = "",
  limit = 10,
  respectRecipeDependencies = false,
  isolateWorktree = false,
  worktreeRoot = ""
}) {
  const timeoutResults = run
    ? markTimedOutRelayStatuses(memoryDir, { to, project })
    : [];
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const jobs = buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit, respectRecipeDependencies });
  const results = [...timeoutResults];
  for (const job of jobs) {
    const runner = getToolRunner(job.tool);
    const maxRetries = getDispatchJobMaxRetries(job, job.maxRetries);
    if (!runner.available) {
      const result = {
        ...job,
        runnable: false,
        reason: runner.reason
      };
      if (run && !runner.sharedStateOnly) {
        const state = getRelayFailureState(job.attempt, maxRetries);
        appendRelayStatus(memoryDir, job, {
          state,
          attempt: job.attempt,
          maxRetries,
          exitCode: null,
          lastError: runner.reason,
          sessionId: "",
          ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
          nextRetryAt: computeNextRetryAt(job.attempt, maxRetries)
        });
        updateDispatchSourceState(memoryDir, job, {
          deliveryState: state,
          dispatchId: job.id,
          threadKey: getDispatchThreadKey(job),
          attempt: job.attempt,
          maxRetries,
          nextRetryAt: computeNextRetryAt(job.attempt, maxRetries),
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

    // Phase 2: Check approval gate before retry
    if (job.gateId) {
      const gates = readApprovalGates(memoryDir, { });
      const gate = gates.find((g) => g.gateId === job.gateId);
      if (gate) {
        if (gate.status === "rejected") {
          // Gate rejected → permanent failure
          const result = {
            ...job,
            runnable: false,
            reason: `Approval gate rejected: ${gate.decisionNote || gate.reason}`,
            exitCode: 403,
            error: `Gate ${gate.gateId} rejected by ${gate.reviewer}: ${gate.decisionNote || gate.reason}`
          };
          if (run) {
            appendRelayStatus(memoryDir, job, {
              state: "failed-permanent",
              attempt: job.attempt,
              maxRetries,
              exitCode: 403,
              lastError: result.error,
              sessionId: "",
              ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
              gateId: job.gateId
            });
            updateDispatchSourceState(memoryDir, job, {
              deliveryState: "failed-permanent",
              dispatchId: job.id,
              threadKey: getDispatchThreadKey(job),
              attempt: job.attempt,
              maxRetries,
              nextRetryAt: "",
              sessionId: "",
              lastError: result.error,
              gateId: job.gateId
            });
            const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "failed-permanent" });
            appendDispatchLog(memoryDir, result);
            applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "failed-permanent", {
              statusMessage
            });
          }
          results.push(result);
          continue;
        }
        if (gate.status === "requested" || gate.status === "needs_changes") {
          // Gate still pending → block retry
          const result = {
            ...job,
            runnable: false,
            reason: `Waiting for approval: gate ${gate.gateId} status=${gate.status}`,
            exitCode: 451,
            error: `Gate ${gate.gateId} still pending (${gate.status}). Use 'gate approve/reject --id ${gate.gateId}' to decide.`,
            gateId: job.gateId
          };
          results.push(result);
          continue;
        }
        // gate.status === "approved" or "waived" → proceed
      }
    }

    appendRelayStatus(memoryDir, job, {
      state: "retrying",
      attempt: job.attempt,
      maxRetries,
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
      maxRetries,
      nextRetryAt: "",
      sessionId: "",
      lastError: ""
    });
    const result = runDispatchJob(memoryDir, job, runner, { isolateWorktree, worktreeRoot });
    if (result.exitCode === 0) {
      appendRelayStatus(memoryDir, job, {
        state: "acked",
        attempt: job.attempt,
        maxRetries,
        exitCode: 0,
        lastError: "",
        sessionId: result.sessionId || "",
        ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        nextRetryAt: "",
        worktree: result.worktree || null
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: "acked",
        dispatchId: job.id,
        threadKey: getDispatchThreadKey(job),
        attempt: job.attempt,
        maxRetries,
        nextRetryAt: "",
        sessionId: result.sessionId || "",
        lastError: "",
        worktree: result.worktree || null
      });
    }
    const finalState = result.exitCode === 0
      ? "completed"
      : getRelayFailureState(job.attempt, maxRetries);
    const nextRetryAt = result.exitCode === 0 ? "" : computeNextRetryAt(job.attempt, maxRetries);
    const lastError = result.exitCode === 0 ? "" : (result.error || result.stderr || "");
    appendRelayStatus(memoryDir, job, {
      state: finalState,
      attempt: job.attempt,
      maxRetries,
      exitCode: result.exitCode,
      lastError,
      sessionId: result.sessionId || "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      nextRetryAt,
      worktree: result.worktree || null
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: finalState,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: job.attempt,
      maxRetries,
      nextRetryAt,
      sessionId: result.sessionId || "",
      lastError,
      worktree: result.worktree || null
    });
    const responseMessage = appendDispatchResponseMessage(memoryDir, job, { ...result, relayState: finalState });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: finalState });
    const enrichedResult = {
      ...result,
      retry: true,
      relayState: finalState,
      attempt: job.attempt,
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
    const maxRetries = getDispatchJobMaxRetries(job, entry.maxRetries);
    const state = getRelayFailureState(attempt, maxRetries);
    const timeoutMs = Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS);
    const lastError = `Timeout: no response within ackTimeout (${timeoutMs}ms) while relay was ${entry.state || "unknown"}`;
    const nextRetryAt = state === ASYNC_CALL_STATES.FAILED
      ? computeNextRetryAt(attempt, maxRetries)
      : "";
    const worktree = normalizeDispatchWorktreeMetadata(entry.worktree);
    const result = {
      ...job,
      runnable: true,
      timeout: true,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: lastError,
      sessionId: entry.sessionId || "",
      relayState: state,
      worktree
    };

    appendRelayStatus(memoryDir, job, {
      state,
      attempt,
      maxRetries,
      exitCode: null,
      lastError,
      sessionId: entry.sessionId || "",
      ackTimeout: timeoutMs,
      nextRetryAt,
      worktree
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: state,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt,
      maxRetries,
      nextRetryAt,
      sessionId: entry.sessionId || "",
      lastError,
      worktree
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
      worktree: result.worktree || task.worktree || null,
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
    worktree: result.worktree || updatedTask.worktree || null,
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
        worktree: patch.worktree || current.worktree || null,
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
    progressBy: patch.progressBy || "",
    worktree: patch.worktree || null,
    gateId: patch.gateId || ""
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
  return ["completed", "delivered", "done", "cancelled", "blocked"].includes(String(state || "").trim().toLowerCase());
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

function buildDispatchJobs(memoryDir, { to, project, limit, force, respectRecipeDependencies = false }) {
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const dispatched = force ? new Set() : readDispatchLog(memoryDir)
    .filter((item) => item.runnable && item.exitCode === 0)
    .reduce((set, item) => set.add(item.id), new Set());

  // 读取消息并按时间倒序排序（最新的在前）
  const allMessages = readRadioMessages(memoryDir)
    .filter((message) => project ? message.project === project : true)
    .filter((message) => isDirectDispatchRadioMessage(message, to))
    .filter((message) => !isRadioLinkedToClosedSource(memoryDir, message))
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

  // 只取最新的limit条
  const messages = allMessages
    .slice(0, limit)
    .flatMap((message) => {
      const target = normalizeToolName(message.to);
      if (target === "all") {
        const tools = ["codex", "gemini", "claude"];
        return tools
          .filter((tool) => to ? tool === to : true)
          .map((tool) => ({
            id: `radio:${message.id}:${tool}`,
            kind: "radio",
            tool: normalizeToolName(tool),
            project: message.project || "",
            text: message.text,
            refId: message.id,
            thread: message.thread || message.id,
            roles: []
          }));
      }
      return [{
        id: `radio:${message.id}`,
        kind: "radio",
        tool: target,
        project: message.project || "",
        text: message.text,
        refId: message.id,
        thread: message.thread || message.id,
        roles: []
      }];
    });
  const allTasks = readTasks(memoryDir);
  const tasks = allTasks
    .filter((task) => !["done", "cancelled", "blocked"].includes(task.status))
    .filter((task) => project ? task.project === project : true)
    .filter((task) => to ? task.assignee === to : Boolean(task.assignee))
    .filter((task) => respectRecipeDependencies ? areTaskRecipeDependenciesSatisfied(task, allTasks) : true)
    .slice(0, limit)
    .map((task) => dispatchJobFromTask(task));
  return [...messages, ...tasks]
    .filter((job) => job.tool)
    .filter((job) => !dispatched.has(job.id))
    .filter((job) => shouldDispatchJob(relayState, job, force))
    .slice(0, limit);
}

function dispatchJobFromTask(task) {
  const roles = [];
  if (task.recipeStep?.role) {
    roles.push(`role:${task.recipeStep.role}`);
  }
  return {
    id: `task:${task.id}`,
    kind: "task",
    tool: task.assignee,
    project: task.project || "",
    text: buildTaskDispatchText(task),
    refId: task.id,
    thread: task.id,
    qualityGate: task.qualityGate || {},
    recipe: task.recipe || null,
    recipeStep: task.recipeStep || null,
    roles
  };
}

function dispatchJobFromWorkflow(workflow, tool = "") {
  const roles = [];
  // Workflow level doesn't have a specific role, but we could add workflow roles in the future
  return {
    id: `workflow:${workflow.id}`,
    kind: "workflow",
    tool: normalizeToolName(tool),
    project: workflow.project || "",
    text: buildWorkflowDispatchText(workflow),
    refId: workflow.id,
    thread: workflow.id,
    qualityGate: workflow.qualityGate || {},
    recipe: workflow.recipe || null,
    roles
  };
}

function buildTaskDispatchText(task) {
  return [
    task.title || "",
    task.description ? `Description: ${task.description}` : "",
    task.handoff ? `Handoff: ${task.handoff}` : ""
  ].filter(Boolean).join("\n");
}

function buildWorkflowDispatchText(workflow) {
  return [
    workflow.title || "",
    workflow.plan ? `Plan: ${workflow.plan}` : "",
    workflow.acceptance ? `Acceptance: ${workflow.acceptance}` : ""
  ].filter(Boolean).join("\n");
}

function areTaskRecipeDependenciesSatisfied(task, allTasks = []) {
  const deps = Array.isArray(task?.recipeStep?.dependsOn) ? task.recipeStep.dependsOn : [];
  if (deps.length === 0) {
    return true;
  }
  return deps.every((depId) => {
    const dependency = findRecipeStepTask(allTasks, task, depId);
    return Boolean(dependency && isDispatchSourceComplete(dependency));
  });
}

function findRecipeStepTask(tasks, task, stepId) {
  const workflowId = task?.recipeStep?.workflowId || "";
  const recipeName = task?.recipe?.name || "";
  return tasks.find((candidate) => (
    candidate?.recipeStep?.id === stepId &&
    (!workflowId || candidate?.recipeStep?.workflowId === workflowId) &&
    (!recipeName || candidate?.recipe?.name === recipeName)
  )) || null;
}

function isDispatchSourceComplete(source) {
  const status = String(source?.status || "").toLowerCase();
  const deliveryState = String(source?.deliveryState || "").toLowerCase();
  return status === "done" || deliveryState === ASYNC_CALL_STATES.COMPLETED;
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

function buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit, respectRecipeDependencies = false }) {
  const now = Date.now();
  const candidates = Object.values(relayState)
    .filter((entry) => isRelayRetryCandidate(entry, now))
    .filter((entry) => isRelayRetryRunnable(entry))
    .filter((entry) => to ? entry.tool === to : true)
    .filter((entry) => project ? entry.project === project : true);

  return candidates
    .map((entry) => {
      const job = rebuildDispatchJobFromRelay(memoryDir, entry, { respectRecipeDependencies });
      const maxRetries = getDispatchJobMaxRetries(job, entry.maxRetries);
      if (!job || !shouldRetryJob(job) || Number(entry.attempt || 0) >= maxRetries) {
        return null;
      }
      return {
        ...job,
        attempt: Number(entry.attempt || 0) + 1,
        maxRetries
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

function rebuildDispatchJobFromRelay(memoryDir, entry, { respectRecipeDependencies = false } = {}) {
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
      thread: message.thread || message.id,
      gateId: entry.gateId || ""
    };
  }
  if (entry.sourceKind === "task") {
    const tasks = readTasks(memoryDir);
    const task = tasks.find((item) => item.id === entry.sourceId);
    if (!task) return null;
    if (isClosedDispatchSourceState(task.status || task.deliveryState)) return null;
    if (respectRecipeDependencies && !areTaskRecipeDependenciesSatisfied(task, tasks)) return null;
    return {
      ...dispatchJobFromTask(task),
      gateId: entry.gateId || ""
    };
  }
  if (entry.sourceKind === "workflow") {
    const workflow = readWorkflows(memoryDir).find((item) => item.id === entry.sourceId);
    if (!workflow) return null;
    if (isClosedDispatchSourceState(workflow.status || workflow.deliveryState)) return null;
    return {
      ...dispatchJobFromWorkflow(workflow, entry.tool || ""),
      gateId: entry.gateId || ""
    };
  }
  return null;
}

function shouldRetryJob(job) {
  if (!job?.tool) {
    return false;
  }
  return !isSharedStateOnlyTool(job.tool);
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

function isSharedStateOnlyTool(tool) {
  const profile = getRunnerProfile(tool);
  return Boolean(profile?.sharedStateOnly);
}

function prepareDispatchWorktree(job, { root = "" } = {}) {
  const repoRoot = resolveGitRepositoryRoot(process.cwd());
  const base = runGitCommand(repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const branch = buildDispatchWorktreeBranch(job);
  const worktreeRoot = resolveDispatchWorktreeRoot(repoRoot, root);
  const worktreePath = path.join(worktreeRoot, buildDispatchWorktreeSlug(job));
  assertSafeDispatchWorktreeRoot(repoRoot, worktreeRoot);
  ensureSafeChildPath(worktreePath, worktreeRoot);
  ensureDir(worktreeRoot);

  const exists = fs.existsSync(worktreePath);
  if (!exists) {
    const branchRef = `refs/heads/${branch}`;
    const branchExists = runGitCommand(repoRoot, ["rev-parse", "--verify", branchRef], { allowFailure: true }).ok;
    const args = branchExists
      ? ["worktree", "add", worktreePath, branch]
      : ["worktree", "add", "-b", branch, worktreePath, base];
    runGitCommand(repoRoot, args);
  } else {
    const validation = runGitCommand(worktreePath, ["rev-parse", "--show-toplevel"], { allowFailure: true });
    if (!validation.ok) {
      throw new Error(`Dispatch worktree path already exists but is not a git worktree: ${worktreePath}`);
    }
  }

  const head = runGitCommand(worktreePath, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim() || base;
  return {
    enabled: true,
    repoRoot,
    root: worktreeRoot,
    path: worktreePath,
    branch,
    base,
    head,
    reused: exists,
    createdAt: new Date().toISOString()
  };
}

function collectDispatchWorktreeReviewMetadata(worktree) {
  if (!worktree?.enabled || !worktree.path) {
    return worktree || null;
  }
  const head = runGitCommand(worktree.path, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim() || worktree.head || "";
  const status = runGitCommand(worktree.path, ["status", "--short"], { allowFailure: true }).stdout.trim();
  const diffStat = runGitCommand(worktree.path, ["diff", "--stat"], { allowFailure: true }).stdout.trim();
  return {
    ...worktree,
    head,
    diffStatus: status,
    diffStat,
    hasChanges: Boolean(status || diffStat)
  };
}

function normalizeDispatchWorktreeMetadata(worktree) {
  if (!isPlainObject(worktree)) {
    return null;
  }
  return {
    enabled: Boolean(worktree.enabled),
    repoRoot: worktree.repoRoot || "",
    root: worktree.root || "",
    path: worktree.path || "",
    branch: worktree.branch || "",
    base: worktree.base || "",
    head: worktree.head || "",
    reused: Boolean(worktree.reused),
    createdAt: worktree.createdAt || "",
    diffStatus: worktree.diffStatus || "",
    diffStat: worktree.diffStat || "",
    hasChanges: Boolean(worktree.hasChanges)
  };
}

function resolveGitRepositoryRoot(startDir) {
  const result = runGitCommand(startDir, ["rev-parse", "--show-toplevel"]);
  const root = result.stdout.trim();
  if (!root) {
    throw new Error("Unable to resolve git repository root for isolated dispatch worktree.");
  }
  return path.resolve(root);
}

function resolveDispatchWorktreeRoot(repoRoot, rootOption = "") {
  const raw = String(rootOption || DEFAULT_DISPATCH_WORKTREE_DIR).trim();
  return path.resolve(repoRoot, raw);
}

function assertSafeDispatchWorktreeRoot(repoRoot, worktreeRoot) {
  const resolvedRoot = path.resolve(worktreeRoot);
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new Error("Dispatch worktree root cannot be a filesystem root.");
  }
  const gitDir = path.join(path.resolve(repoRoot), ".git");
  if (resolvedRoot === gitDir || isPathInsideDirectory(resolvedRoot, gitDir)) {
    throw new Error("Dispatch worktree root cannot be inside the repository .git directory.");
  }
}

function buildDispatchWorktreeBranch(job) {
  return [
    "amh",
    safeGitPathSegment(job.tool, "tool"),
    safeGitPathSegment(job.project, "default"),
    safeGitPathSegment(job.refId || job.id, "dispatch")
  ].join("/");
}

function buildDispatchWorktreeSlug(job) {
  return [
    safeGitPathSegment(job.tool, "tool"),
    safeGitPathSegment(job.project, "default"),
    safeGitPathSegment(job.kind, "job"),
    safeGitPathSegment(job.refId || job.id, "dispatch")
  ].join("-");
}

function safeGitPathSegment(value, fallback) {
  const safe = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return safe || fallback;
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

function runDispatchJob(memoryDir, job, runner, options = {}) {
  const initialWorktree = options.isolateWorktree
    ? prepareDispatchWorktree(job, { root: options.worktreeRoot })
    : null;
  const jobWithWorktree = initialWorktree ? { ...job, worktree: initialWorktree } : job;
  const prompt = runner.compactPrompt
    ? renderCompactDispatchPrompt(memoryDir, jobWithWorktree)
    : renderDispatchPrompt(memoryDir, jobWithWorktree);
  const args = buildRunnerArgs(memoryDir, jobWithWorktree, runner, prompt);
  const input = runner.promptMode === "stdin" ? prompt : "";
  const runId = createDispatchRunId(job);
  const cwd = initialWorktree?.path || process.cwd();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const invocation = buildRunnerInvocation(runner, args);
  const completed = invokeRunnerCommand(runner, args, input, DEFAULT_DISPATCH_RUN_TIMEOUT_MS, cwd);
  const finishedAtMs = Date.now();
  const finishedAt = new Date(finishedAtMs).toISOString();
  const parsed = parseRunnerOutput(memoryDir, jobWithWorktree, runner, completed.stdout);
  const normalizedStderr = normalizeRunnerStderr(job.tool, completed.stderr);
  const stdoutLogPath = writeDispatchRunLog(memoryDir, runId, "stdout", completed.stdout);
  const stderrLogPath = writeDispatchRunLog(memoryDir, runId, "stderr", completed.stderr);
  const runStatus = getDispatchRunStatus(completed);
  const verificationResult = getDispatchRunVerificationResult(runStatus, completed.status);
  const worktree = initialWorktree
    ? collectDispatchWorktreeReviewMetadata(initialWorktree)
    : null;
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
    cwd,
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
    verificationResult,
    ...(worktree ? { worktree } : {})
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
    verificationResult,
    ...(worktree ? { worktree } : {})
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

function invokeRunnerCommand(runner, args = [], input = "", timeoutMs = DEFAULT_DISPATCH_RUN_TIMEOUT_MS, cwd = process.cwd()) {
  const invocation = buildRunnerInvocation(runner, args);
  const useCmdLauncher = invocation.usesShell;
  const command = useCmdLauncher ? invocation.commandLine : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  return spawnSync(command, commandArgs, {
    cwd,
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

function renderDispatchWorktree(worktree) {
  if (!worktree?.enabled) {
    return [];
  }
  const lines = [
    `- Worktree path: ${worktree.path || ""}`,
    `- Branch: ${worktree.branch || ""}`,
    `- Base commit: ${worktree.base || ""}`,
    `- Current head: ${worktree.head || ""}`,
    `- Reused existing worktree: ${worktree.reused ? "yes" : "no"}`
  ];
  if (worktree.diffStatus) {
    lines.push(`- Diff status: ${worktree.diffStatus}`);
  }
  if (worktree.diffStat) {
    lines.push(`- Diff stat: ${worktree.diffStat}`);
  }
  lines.push("- Keep this worktree and branch for review; do not delete, merge, or push it unless explicitly authorized.");
  return lines;
}

function renderDispatchQualityGate(job) {
  const gate = normalizeQualityGate(job?.qualityGate || {});
  const lines = [];
  if (job?.recipe?.name) {
    lines.push(`- Recipe: ${job.recipe.name}${job.recipe.version ? `@${job.recipe.version}` : ""}`);
  }
  if (job?.recipeStep?.id) {
    const deps = Array.isArray(job.recipeStep.dependsOn) && job.recipeStep.dependsOn.length > 0
      ? `; depends on ${job.recipeStep.dependsOn.join(", ")}`
      : "";
    lines.push(`- Recipe step: ${job.recipeStep.id}${job.recipeStep.role ? ` (${job.recipeStep.role})` : ""}${deps}`);
  }
  if (typeof gate.reviewRequired === "boolean") {
    lines.push(`- Review required: ${gate.reviewRequired ? "yes" : "no"}`);
  }
  if (Number.isInteger(gate.maxRepairAttempts)) {
    lines.push(`- Max repair attempts: ${gate.maxRepairAttempts}`);
  }
  if (Array.isArray(gate.stopWhen) && gate.stopWhen.length > 0) {
    lines.push(`- Stop when: ${gate.stopWhen.join("; ")}`);
  }
  if (Array.isArray(gate.allowedActions) && gate.allowedActions.length > 0) {
    lines.push(`- Allowed actions: ${gate.allowedActions.join("; ")}`);
  }
  if (Array.isArray(gate.forbiddenActions) && gate.forbiddenActions.length > 0) {
    lines.push(`- Forbidden actions: ${gate.forbiddenActions.join("; ")}`);
  }
  if (Array.isArray(gate.verifyCommands) && gate.verifyCommands.length > 0) {
    lines.push("- Verification commands:");
    for (const command of gate.verifyCommands) {
      lines.push(`  - ${formatDispatchVerifyCommand(command)}`);
    }
  }
  if (lines.length > 0) {
    lines.push("- If a stop condition or forbidden action is required, stop and write a task note instead of proceeding.");
  }
  return lines;
}

function formatDispatchVerifyCommand(command) {
  if (command.command) {
    return [command.command, ...(command.args || [])].join(" ");
  }
  if (command.id && command.source) {
    return `${command.id} (${command.source})`;
  }
  return command.id || command.source || command.description || "verify";
}

function escapeForWindowsCmd(value) {
  return String(value || "")
    .replace(/"/g, '""')
    .replace(/%/g, "%%");
}

function renderDispatchPrompt(memoryDir, job) {
  const qualityGateLines = renderDispatchQualityGate(job);
  const worktreeLines = renderDispatchWorktree(job.worktree);
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
    ...(qualityGateLines.length > 0 ? [
      "Quality gate:",
      ...qualityGateLines,
      ""
    ] : []),
    ...(worktreeLines.length > 0 ? [
      "Execution isolation:",
      ...worktreeLines,
      ""
    ] : []),
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

function renderCompactDispatchPrompt(memoryDir, job) {
  const qualityGateLines = renderDispatchQualityGate(job);
  const worktreeLines = renderDispatchWorktree(job.worktree);
  const parts = [
    `Payload: ${job.text}`,
    "Instruction: Do this AI Memory Hub dispatch payload directly; keep the response compact; do not ask what to work on.",
    qualityGateLines.length > 0 ? `Quality gate: ${qualityGateLines.join("; ")}` : "",
    worktreeLines.length > 0 ? `Execution isolation: ${worktreeLines.join("; ")}` : "",
    "Safety: Do not run git push, delete files, run destructive cleanup, install dependencies, or change system configuration unless explicitly authorized in the payload. If you cannot proceed, say exactly what configuration or input is missing.",
    `AMH metadata: thread=${getDispatchThreadKey(job)} project=${job.project || "(none)"} ref=${job.refId}`
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
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

function getDispatchJobMaxRetries(job, fallback = DEFAULT_DISPATCH_MAX_RETRIES) {
  const gateLimit = normalizeNonNegativeInteger(job?.qualityGate?.maxRepairAttempts);
  if (gateLimit !== null) {
    return gateLimit;
  }
  return normalizeDispatchRetryLimit(fallback);
}

function normalizeDispatchRetryLimit(value) {
  const limit = normalizeNonNegativeInteger(value);
  return limit !== null ? limit : DEFAULT_DISPATCH_MAX_RETRIES;
}

function computeNextRetryAt(attempt, maxRetries = DEFAULT_DISPATCH_MAX_RETRIES) {
  const limit = normalizeDispatchRetryLimit(maxRetries);
  if (Number(attempt || 0) >= limit) {
    return "";
  }
  const delays = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];
  const delayMs = delays[Math.max(0, Number(attempt || 1) - 1)] || delays[delays.length - 1];
  return new Date(Date.now() + delayMs).toISOString();
}

function getRelayFailureState(attempt, maxRetries = DEFAULT_DISPATCH_MAX_RETRIES) {
  return Number(attempt || 0) >= normalizeDispatchRetryLimit(maxRetries) ? "abandoned" : "failed";
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
  return nextRetryMs <= Date.now() && Number(entry.attempt || 0) < normalizeDispatchRetryLimit(entry.maxRetries);
}

function isRelayRetryRunnable(entry) {
  return !isSharedStateOnlyTool(entry?.tool || "");
}

function isRelayRetryCandidate(entry, now = Date.now()) {
  if (!entry) {
    return false;
  }
  // Phase 2: approval-required is retryable once gate is approved
  if (entry.state === "approval-required") {
    return true;
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
    maxRetries: normalizeDispatchRetryLimit(patch.maxRetries),
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
    worktree: patch.worktree || null,
    project: job.project || "",
    tool: job.tool || "",
    thread: job.thread || "",
    gateId: patch.gateId || ""
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
  const eventEntries = readEventsWithLocations(inboxPath);
  const events = eventEntries.map((entry) => entry.event);
  const backupRun = dryRun
    ? null
    : runAutomaticBackupStrategy(config, {
      trigger: "sync",
      includePreSync: events.length > 0
  });
  if (events.length === 0) {
    if (!dryRun) {
      rebuildMemoryOutputs(config, readLedger(config.memoryDir));
    }
    const projections = dryRun ? null : rebuildEventSourcedProjections(config.memoryDir);
    console.log("No pending memory events.");
    if (projections) {
      console.log(`Rebuilt event-sourced projections: tasks=${projections.tasks}, workflows=${projections.workflows}, projects=${projections.projects}.`);
    }
    if (backupRun?.created.length) {
      console.log(`Created ${backupRun.created.length} scheduled backup(s).`);
    }
    return;
  }

  const backup = backupRun?.preSync || null;
  let synced = 0;
  const remaining = [];
  const ledger = readLedger(config.memoryDir);
  const knownIds = new Set(ledger.map((item) => item.localEventId || item.id).filter(Boolean));
  const newRecords = [];

  for (const entry of eventEntries) {
    const event = entry.event;
    const normalizedEvent = normalizeMemoryEvent(event);
    const skipReason = getMemoryEventSkipReason(normalizedEvent);
    if (skipReason) {
      console.log(`Skipped event ${event.id || "(no id)"} at ${formatEventLocation(entry)}: ${skipReason}.`);
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
    const projections = rebuildEventSourcedProjections(config.memoryDir);
    writeJson(path.join(config.memoryDir, "state", "last-sync.json"), {
      syncedAt: new Date().toISOString(),
      indexed: newRecords.length,
      pending: remaining.length,
      projections,
      backupDir: backup?.dir || "",
      backups: backupRun
        ? {
          created: backupRun.created.map((item) => ({
            reason: item.reason,
            dir: item.dir,
            retention: item.retention
          })),
          pruned: backupRun.pruned?.pruned || []
        }
        : null
    });
    if (config.sync.archiveIndexedInboxItems !== false) {
      archiveInbox(config.memoryDir, events.filter((event) => !remaining.includes(event)));
    }
    writeInboxEvents(inboxPath, remaining);
  }

  console.log(`Indexed ${synced} memory event(s) into the local hub.`);
  if (!dryRun) {
    const lastSync = readJson(path.join(config.memoryDir, "state", "last-sync.json"));
    if (lastSync.projections) {
      console.log(`Rebuilt event-sourced projections: tasks=${lastSync.projections.tasks}, workflows=${lastSync.projections.workflows}, projects=${lastSync.projections.projects}.`);
    }
  }
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

function memoryCommand(argv) {
  const subcommand = argv[0] || "help";
  const rest = argv.slice(1);
  if (subcommand === "search") {
    return searchCommand(rest);
  }
  if (subcommand === "snapshot") {
    return snapshotCommand(rest);
  }
  throw new Error("Usage: ai-memory-hub memory <search|snapshot> [options]");
}

function searchCommand(argv) {
  const query = positionalArgs(argv).join(" ").trim();
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const limit = Number(getOption(argv, "--limit") || 10);
  const filters = parseMemoryFilters(argv);
  const hasFilter = hasMemoryFilters(filters);
  const trackAccess = !hasFlag(argv, "--no-track") && !hasFlag(argv, "--no-access-track");
  if (!query && !hasFilter) {
    throw new Error("Usage: ai-memory-hub search [query] [--limit 10] [--project <name>] [--tag <tag>|--tags <a,b>] [--thread <id>] [--task <id>] [--workflow <id>] [--radio <id>] [--no-track]");
  }

  const runSearch = () => {
    const ledger = readLedger(config.memoryDir);
    const index = buildMemoryIndex(ledger, config);
    const records = filterMemoryRecords(index.records, filters);
    const results = (query
      ? searchMemories(records, query)
      : [...records]
        .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
        .map((record) => ({ ...record, score: Number(record.importance || 0) / 100 }))
    ).slice(0, limit);

    if (trackAccess && results.length > 0) {
      const updated = recordMemoryAccess(ledger, results);
      if (updated.updated > 0) {
        writeLedger(config.memoryDir, updated.ledger);
        rebuildMemoryOutputs(config, updated.ledger);
      }
    }

    printMemorySearchResults(results);
  };

  if (trackAccess) {
    return withHubLock(config.memoryDir, "search-access", runSearch, config.sync.lockStaleMs);
  }
  return runSearch();
}

function printMemorySearchResults(results) {
  for (const item of results) {
    const kind = item.metadata?.kind || "note";
    const topics = (item.topics || []).slice(0, 4).join(",");
    const refs = formatMemoryRefs(item.refs);
    const project = item.project ? `project=${item.project} ` : "";
    const tags = item.tags?.length ? `tags=${item.tags.slice(0, 5).join(",")} ` : "";
    console.log(`[${item.score.toFixed(2)}] ${item.source}/${kind} ${project}${tags}${topics ? `(${topics}) ` : ""}${refs ? `[${refs}] ` : ""}${item.text}`);
  }
}

function snapshotCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const rawLimit = getOption(argv, "--limit");
  const limit = rawLimit ? parsePositiveIntegerOption(rawLimit, "--limit") : 0;
  const filters = parseMemoryFilters(argv);
  const baseIndex = buildMemoryIndex(readLedger(config.memoryDir), config);
  const records = filterMemoryRecords(baseIndex.records, filters);
  const index = hasMemoryFilters(filters) ? buildMemoryIndex(records, config) : baseIndex;
  console.log(renderMemorySnapshot(index, config, {
    limit,
    filterSummary: formatMemoryFilterSummary(filters)
  }));
}

function resolveCommand(argv) {
  const query = positionalArgs(argv).join(" ").trim();
  if (!query) {
    throw new Error("Usage: ai-memory-hub resolve <name|@include|path> [--from <instruction-file>] [--limit N] [--plain]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const limit = getOption(argv, "--limit")
    ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
    : 10;
  const fromFile = getOption(argv, "--from") || getOption(argv, "--file") || "";
  const result = resolveReference(query, config, {
    fromFile,
    limit
  });
  if (hasFlag(argv, "--plain")) {
    if (result.best?.path) {
      console.log(result.best.path);
    }
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
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
  const retention = getBackupRetentionConfig(config);
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "create";
  if (action === "status") {
    console.log(JSON.stringify(getGitHubBackupStatus(config), null, 2));
    return;
  }
  if (action === "run") {
    const result = withHubLock(config.memoryDir, "github-backup", () => runGitHubBackup(config, argv.slice(1)), config.sync.lockStaleMs);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "configure" || action === "config") {
    const result = configureGitHubBackup(config, argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "schedule") {
    const result = githubBackupScheduleCommand(config, argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "list") {
    const limit = getOption(argv, "--limit")
      ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
      : 50;
    console.log(JSON.stringify(getBackupSummary(config.memoryDir, { limit, ...retention }), null, 2));
    return;
  }
  if (action === "prune") {
    const apply = hasFlag(argv, "--apply");
    const daily = getOption(argv, "--daily")
      ? parsePositiveIntegerOption(getOption(argv, "--daily"), "--daily")
      : retention.daily;
    const weekly = getOption(argv, "--weekly")
      ? parsePositiveIntegerOption(getOption(argv, "--weekly"), "--weekly")
      : retention.weekly;
    const preSync = getOption(argv, "--pre-sync")
      ? parsePositiveIntegerOption(getOption(argv, "--pre-sync"), "--pre-sync")
      : retention.preSync;
    const result = apply
      ? withHubLock(config.memoryDir, "backup-prune", () => pruneBackups(config.memoryDir, { apply, daily, weekly, preSync }), config.sync.lockStaleMs)
      : pruneBackups(config.memoryDir, { apply, daily, weekly, preSync });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action !== "create") {
    throw new Error("Usage: ai-memory-hub backup [--reason manual] | ai-memory-hub backup status | ai-memory-hub backup run [--no-push] | ai-memory-hub backup configure [--enabled] [--remote-url <url>] [--repo-dir <dir>] [--allow-plaintext-sensitive] | ai-memory-hub backup schedule <status|install|uninstall> | ai-memory-hub backup list [--limit N] | ai-memory-hub backup prune [--daily 7] [--weekly 4] [--pre-sync 20] [--apply]");
  }
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
    throw new Error("Usage: ai-memory-hub daemon [status] [--interval-ms <ms>] [--project <name[,name]>] [--limit <n>] [--force] [--isolate-worktree] [--worktree-root <dir>]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);
  const intervalMs = Number(getOption(argv, "--interval-ms") || 5000); // 改为 5 秒轮询，支持更快的实时协作
  const limit = Number(getOption(argv, "--limit") || 10);
  const projects = getOption(argv, "--project");
  const projectList = projects ? projects.split(",") : [];
  const force = hasFlag(argv, "--force");
  const isolateWorktree = hasFlag(argv, "--isolate-worktree");
  const worktreeRoot = getOption(argv, "--worktree-root") || "";
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
    isolateWorktree,
    worktreeRoot,
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
      const tools = DAEMON_DEFAULT_TOOLS;

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
              limit,
              respectRecipeDependencies: true,
              isolateWorktree,
              worktreeRoot
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
              limit,
              respectRecipeDependencies: true,
              isolateWorktree,
              worktreeRoot
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
      isolateWorktree,
      worktreeRoot,
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
  const realtime = dashboardRealtime.createDashboardRealtime(config.memoryDir);
  const broadcastDashboardUpdate = (reason) => realtime.broadcastSnapshot(reason);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      const rawPathname = String(req.url || "/").split(/[?#]/, 1)[0] || "/";
      if (req.method === "GET" && rawPathname.startsWith("/assets/")) {
        return sendStaticAsset(res, rawPathname);
      }
      if (req.method === "GET" && (rawPathname.startsWith("/css/") || rawPathname.startsWith("/js/") || rawPathname.startsWith("/assets/") || rawPathname.endsWith(".svg"))) {
        return sendStaticFile(res, rawPathname);
      }
      if (req.method === "GET" && url.pathname === "/api/dashboard") {
        return sendJson(res, dashboardRealtime.getDashboardSnapshot(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/metrics") {
        return sendJson(res, dashboardMetrics.calculateMetrics(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return sendJson(res, getStatusObject());
      }
      if (req.method === "GET" && url.pathname === "/api/memory") {
        return sendJson(res, dashboardMemory.getDashboardMemory(config.memoryDir));
      }
      if (req.method === "POST" && url.pathname === "/api/memory/supersede") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        let event;
        withHubLock(config.memoryDir, "memory-supersede", () => {
          event = dashboardMemory.createMemorySupersedeEvent(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("memory:supersede");
        return sendJson(res, { ok: true, event, status: getStatusObject() });
      }
      if (req.method === "GET" && url.pathname === "/api/radio") {
        return sendJson(res, dashboardRadio.getDashboardRadio(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/tasks") {
        const status = url.searchParams.get("status") || "all";
        const includeCancelled = url.searchParams.get("includeCancelled") === "1";
        return sendJson(res, dashboardTasks.getDashboardTasks(config.memoryDir, status, { includeCancelled }));
      }
      if (req.method === "GET" && url.pathname === "/api/workflows") {
        return sendJson(res, dashboardWorkflows.getDashboardWorkflows(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/projects") {
        return sendJson(res, dashboardProjects.getDashboardProjects(config.memoryDir, {
          status: url.searchParams.get("status") || "all",
          includeHidden: url.searchParams.get("includeHidden") === "1"
        }));
      }
      if (req.method === "POST" && url.pathname === "/api/projects") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.name || typeof body.name !== "string") {
          return sendJson(res, { error: "name is required" }, 400);
        }
        let project;
        withHubLock(config.memoryDir, "project-create", () => {
          project = dashboardProjects.createDashboardProject(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("project:create");
        return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
      }
      const projectApiMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectApiMatch) {
        const projectId = decodeURIComponent(projectApiMatch[1]);
        if (req.method === "GET") {
          const project = findProject(readProjects(config.memoryDir), projectId);
          if (!project) {
            return sendJson(res, { error: "project not found" }, 404);
          }
          return sendJson(res, { project });
        }
        if (req.method === "PATCH") {
          const body = await readRequestJson(req);
          let project;
          withHubLock(config.memoryDir, "project-update", () => {
            project = dashboardProjects.updateDashboardProject(config.memoryDir, projectId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("project:update");
          return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
        }
        if (req.method === "DELETE") {
          const body = await readRequestJson(req);
          let project;
          withHubLock(config.memoryDir, "project-archive", () => {
            project = dashboardProjects.archiveDashboardProject(config.memoryDir, projectId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("project:archive");
          return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
        }
      }
      if (req.method === "POST" && url.pathname === "/api/workflows") {
        const body = await readRequestJson(req);
        if (!body.title || typeof body.title !== "string") {
          return sendJson(res, { error: "title is required" }, 400);
        }
        let workflow;
        withHubLock(config.memoryDir, "workflow-create", () => {
          workflow = dashboardWorkflows.createDashboardWorkflow(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("workflow:create");
        return sendJson(res, { ok: true, workflow, status: getStatusObject() });
      }
      const workflowApiMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)(?:\/([^/]+))?$/);
      if (workflowApiMatch) {
        const workflowId = decodeURIComponent(workflowApiMatch[1]);
        const workflowAction = workflowApiMatch[2] ? decodeURIComponent(workflowApiMatch[2]) : "";
        if (req.method === "GET" && workflowAction === "nodes") {
          return sendJson(res, dashboardWorkflows.getDashboardWorkflowNodes(config.memoryDir, workflowId));
        }
        if (req.method === "PATCH" && !workflowAction) {
          const body = await readRequestJson(req);
          let workflow;
          withHubLock(config.memoryDir, "workflow-update", () => {
            workflow = dashboardWorkflows.updateDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:update");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "DELETE" && !workflowAction) {
          const body = await readRequestJson(req);
          let workflow;
          withHubLock(config.memoryDir, "workflow-delete", () => {
            workflow = dashboardWorkflows.deleteDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:delete");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && workflowAction === "status") {
          const body = await readRequestJson(req);
          if (!body.status || typeof body.status !== "string") {
            return sendJson(res, { error: "status is required" }, 400);
          }
          let workflow;
          withHubLock(config.memoryDir, "workflow-status", () => {
            workflow = dashboardWorkflows.setDashboardWorkflowStatus(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:status");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && ["result", "review", "note"].includes(workflowAction)) {
          const body = await readRequestJson(req);
          if (!body.text || typeof body.text !== "string") {
            return sendJson(res, { error: "text is required" }, 400);
          }
          let workflow;
          withHubLock(config.memoryDir, `workflow-${workflowAction}`, () => {
            workflow = dashboardWorkflows.appendDashboardWorkflowEntry(config.memoryDir, workflowId, workflowAction, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate(`workflow:${workflowAction}`);
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && workflowAction === "signal") {
          const body = await readRequestJson(req);
          if (!body.to || typeof body.to !== "string") {
            return sendJson(res, { error: "to is required" }, 400);
          }
          if (!body.text || typeof body.text !== "string") {
            return sendJson(res, { error: "text is required" }, 400);
          }
          let result;
          withHubLock(config.memoryDir, "workflow-signal", () => {
            result = dashboardWorkflows.signalDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:signal");
          return sendJson(res, { ok: true, ...result, status: getStatusObject() });
        }
      }
      if (req.method === "GET" && url.pathname === "/api/dispatch") {
        return sendJson(res, dashboardDispatch.getDashboardDispatch(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/detect") {
        return sendJson(res, dashboardTools.getDashboardDetection(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/tools") {
        return sendJson(res, dashboardTools.getDashboardTools(config.memoryDir, {
          refresh: url.searchParams.get("refresh") === "1"
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/capabilities") {
        return sendJson(res, dashboardTools.buildCapabilityRegistry(config.memoryDir, {
          refresh: url.searchParams.get("refresh") === "1"
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/policy") {
        const rules = readPolicyRules(config.memoryDir);
        return sendJson(res, {
          ok: true,
          count: rules.length,
          rules,
          operations: POLICY_OPERATIONS,
          decisions: POLICY_DECISIONS,
          scopes: POLICY_SCOPES
        });
      }
      if (req.method === "GET" && url.pathname === "/api/backups") {
        return sendJson(res, dashboardBackups.getDashboardBackups(config));
      }
      if (req.method === "GET" && url.pathname === "/api/backups/github/status") {
        return sendJson(res, dashboardBackups.getDashboardGitHubBackupStatus());
      }
      if (req.method === "POST" && url.pathname === "/api/backups/github/configure") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.configureDashboardGitHubBackup(body);
        broadcastDashboardUpdate("backup:github-configure");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/github/run") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.runDashboardGitHubBackup(body);
        broadcastDashboardUpdate("backup:github-run");
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/backups/detail") {
        return sendJson(res, dashboardBackups.getDashboardBackupDetail(config, url.searchParams.get("name") || ""));
      }
      if (req.method === "POST" && url.pathname === "/api/backups/create") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.createDashboardBackup(config, body);
        broadcastDashboardUpdate("backup:create");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/prune") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.pruneDashboardBackups(config, body);
        if (Boolean(body.apply)) {
          broadcastDashboardUpdate("backup:prune");
        }
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/restore") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.restoreDashboardBackup(config, body);
        if (Boolean(body.apply)) {
          broadcastDashboardUpdate("backup:restore");
        }
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/search") {
        return sendJson(res, dashboardSearch.getDashboardSearch(config.memoryDir, {
          query: url.searchParams.get("q") || url.searchParams.get("query") || "",
          type: url.searchParams.get("type") || "all",
          tag: url.searchParams.get("tag") || "",
          range: url.searchParams.get("range") || "all",
          sort: url.searchParams.get("sort") || "relevance",
          limit: Number(url.searchParams.get("limit") || 50)
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/settings") {
        return sendJson(res, dashboardSettings.getDashboardSettings());
      }
      if (req.method === "POST" && url.pathname === "/api/settings") {
        const body = await readRequestJson(req);
        const settings = dashboardSettings.updateDashboardSettings(body);
        broadcastDashboardUpdate("settings:update");
        return sendJson(res, { ok: true, settings });
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        const diagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit: 10 });
        return sendJson(res, {
          ok: true,
          stdout: diagnostic.markdown,
          report: diagnostic.markdown,
          analysis: dashboardHealth.formatHealthAnalysisForDashboard(diagnostic.analysis),
          exitCode: 0
        });
      }
      if (req.method === "POST" && url.pathname === "/api/health/repair") {
        const body = await readRequestJson(req);
        const apply = body.apply !== false;
        const result = withHubLock(config.memoryDir, "health-repair", () => runMemoryHealthRepair(config, {
          apply,
          issueLimit: Number(body.limit || 10)
        }), config.sync.lockStaleMs);
        if (apply && result.applied.ledgerRecordsUpdated > 0) {
          broadcastDashboardUpdate("health:repair");
        }
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/record") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.recordDashboardMemory(body);
        broadcastDashboardUpdate("record");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/radio/send") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.sendDashboardRadio(config, body);
        broadcastDashboardUpdate("radio:send");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/add") {
        const body = await readRequestJson(req);
        if (!body.title || typeof body.title !== "string") {
          return sendJson(res, { error: "title is required" }, 400);
        }
        const result = dashboardActions.addDashboardTask(config, body);
        broadcastDashboardUpdate("task:add");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/claim") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const result = dashboardActions.claimDashboardTask(config, body);
        broadcastDashboardUpdate("task:claim");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/status") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.status || typeof body.status !== "string") {
          return sendJson(res, { error: "status is required" }, 400);
        }
        const result = dashboardActions.setDashboardTaskStatus(config, body);
        broadcastDashboardUpdate("task:status");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/review") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const decision = String(body.decision || "").toLowerCase();
        if (!["approved", "rejected"].includes(decision)) {
          return sendJson(res, { error: "decision must be approved or rejected" }, 400);
        }
        const result = dashboardActions.reviewDashboardTask(config, body);
        broadcastDashboardUpdate("task:review");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/purge") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.confirm || typeof body.confirm !== "string") {
          return sendJson(res, { error: "confirm is required" }, 400);
        }
        const result = dashboardActions.purgeDashboardTask(config, body);
        broadcastDashboardUpdate("task:purge");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch/run") {
        const body = await readRequestJson(req);
        const result = dashboardActions.runDashboardDispatch(config, body);
        broadcastDashboardUpdate("dispatch:run");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch/marvis") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.dispatchDashboardMarvis(config, body);
        broadcastDashboardUpdate("dispatch:marvis");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/radio/promote") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const result = dashboardActions.promoteDashboardRadio(body);
        broadcastDashboardUpdate("radio:promote");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/sync") {
        const result = dashboardActions.syncDashboardMemory();
        broadcastDashboardUpdate("sync");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/pull") {
        const result = dashboardActions.pullDashboardMemory();
        broadcastDashboardUpdate("pull");
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/install/preview") {
        const toolName = url.searchParams.get("tool");
        const isLocal = url.searchParams.get("scope") === "local";
        try {
          return sendJson(res, dashboardActions.getDashboardInstallPreview(config, { toolName, isLocal }));
        } catch (error) {
          return sendJson(res, { error: error.message || String(error) }, 404);
        }
      }
      if (req.method === "POST" && url.pathname === "/api/install/apply") {
        const body = await readRequestJson(req);
        const toolName = body.tool;
        if (!toolName) {
          return sendJson(res, { error: "tool is required" }, 400);
        }
        let result;
        try {
          result = dashboardActions.applyDashboardInstall(config, body);
        } catch (error) {
          return sendJson(res, { error: error.message || String(error) }, 404);
        }
        broadcastDashboardUpdate("install:apply");
        return sendJson(res, result);
      }
      // SPA fallback: serve Dashboard HTML for all other GET requests
      // This allows React Router to handle client-side routing for paths like /tasks, /workflows, etc.
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && path.extname(url.pathname)) {
        return sendPlain(res, "Not Found", 404);
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        return sendHtml(res, renderDashboard());
      }
      return sendJson(res, { error: "not found" }, 404);
    } catch (error) {
      return sendJson(res, { error: error.message || String(error) }, 500);
    }
  });

  server.on("upgrade", (req, socket) => {
    realtime.handleUpgrade(req, socket, host, port);
  });

  const stopDashboardWatcher = dashboardRealtime.watchDashboardState(config.memoryDir, broadcastDashboardUpdate);
  server.on("close", () => {
    stopDashboardWatcher();
    realtime.close();
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
    const snippet = renderInstallSnippet(target, config.memoryDir);
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
  capabilities
             Show the cross-tool capability registry and safety policy.
  status     Show hub and tool status.
  record     Append a local memory event.
  radio      Send, list, and promote cross-agent radio messages.
  sync       Index pending inbox events into the local memory ledger.
  index      Rebuild MEMORY.md, INDEX.md, and the structured local index.
  search     Search indexed local memories.
  snapshot   Print a filtered memory snapshot view without rewriting MEMORY.md.
  resolve    Resolve an @include or file name from local paths and memory.
  task       Share task/todo state across AI tools.
  workflow   Coordinate planner/executor/reviewer/observer work across AI tools.
  project    Manage project metadata, aliases, resources, and archive state.
  session    Manage session handoff for context transfer between tools.
  rpc        Synchronous request-response RPC calls between tools.
  notify     Send cross-platform notifications with severity-based routing.
  context    Generate task-specific memory bundles for focused context.
  queue      Manage dispatch queue with priority and retry controls.
  recipe     Manage workflow recipes for reusable collaboration templates.
  task-spec  List, validate, and run project-declared task commands.
  metrics    Show operational metrics for tasks, workflows, relay, and queue.
  health     Generate a Markdown health report for the local memory hub.
  update     Check for updates or update to the latest version.
  connect    Check tool connections or send a request/review/handoff to another tool.
  doctor     Diagnose AI tool runner paths, shims, probes, and prompt mode.
  dispatch   Dispatch pending radio/task work to verified CLI runners.
  pull       Rebuild MEMORY.md from the local memory ledger.
  backup     Back up hub files, inspect/prune retention, and manage GitHub data backups.
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
  ${APP_NAME} search "git commit rules" --limit 5 --tag workflow
  ${APP_NAME} snapshot --project ai-memory-hub --tags workflow,git --limit 20
  ${APP_NAME} resolve "@RTK.md" --from ~/.codex/AGENTS.md
  ${APP_NAME} task add "Review README task-list section" --description "Goal: check task docs. Scope: README only. Acceptance: examples are accurate." --handoff "Next: reviewer verifies wording." --from codex --project ai-memory-hub --priority high
  ${APP_NAME} task list --status active
  ${APP_NAME} task claim --id <task-id> --by claude
  ${APP_NAME} task update --id <task-id> --description "Goal: ... Scope: ... Acceptance: ..." --handoff "Current state and next step." --by codex
  ${APP_NAME} task note --id <task-id> "Reviewed Chinese docs." --by qclaw
  ${APP_NAME} task done --id <task-id> --by codex
  ${APP_NAME} connect
  ${APP_NAME} connect --apply
  ${APP_NAME} capabilities --tool claude
  ${APP_NAME} connect request --from gemini --to codex --project ai-memory-hub --text "Please inspect the current task list." --task
  ${APP_NAME} doctor --tool claude
  ${APP_NAME} workflow create "Review dashboard changes" --from codex --project ai-memory-hub --planner codex --executor opencode --reviewer qclaw --spawn-tasks --notify
  ${APP_NAME} workflow list --status active
  ${APP_NAME} project list --status visible
  ${APP_NAME} project add my-app --name "My App" --status active --type tool
  ${APP_NAME} dispatch --project ai-memory-hub
  ${APP_NAME} dispatch --to codex --run
  ${APP_NAME} dispatch --to codex --run --isolate-worktree
  ${APP_NAME} dispatch status --thread <thread-id> --project ai-memory-hub
  ${APP_NAME} dispatch status --recent 10 --project ai-memory-hub
  ${APP_NAME} dispatch status --recent --state failed --to claude
  ${APP_NAME} dispatch progress --thread-key codex:ai-memory-hub:<ref> --percent 40 --status "working" --by codex
  ${APP_NAME} dispatch retry --project ai-memory-hub --to qclaw --run --limit 1
  ${APP_NAME} task-spec list
  ${APP_NAME} task-spec validate
  ${APP_NAME} task-spec run test
  ${APP_NAME} health
  ${APP_NAME} pull
  ${APP_NAME} backup --reason manual
  ${APP_NAME} backup list --limit 20
  ${APP_NAME} backup prune --daily 7 --weekly 4 --pre-sync 20 --apply
  ${APP_NAME} backup status
  ${APP_NAME} backup run --no-push
  ${APP_NAME} watch --interval-ms 30000
  ${APP_NAME} daemon status
  ${APP_NAME} daemon --project ai-memory-hub --isolate-worktree
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
      snapshotLimit: 120,
      coreLimit: 30,
      recentLimit: 18,
      lockStaleMs: 120000,
      backupRetention: {
        daily: 7,
        weekly: 4,
        preSync: 20,
        pruneAfterSync: true
      }
    },
    dashboard: {
      autoRefresh: true,
      refreshIntervalMs: 5000,
      language: "zh",
      theme: "dark",
      notifications: true,
      shortcuts: defaultDashboardShortcuts()
    },
    backup: {
      github: {
        enabled: false,
        remoteUrl: DEFAULT_GITHUB_BACKUP_REMOTE,
        repoDir: DEFAULT_GITHUB_BACKUP_REPO_DIR,
        branch: "main",
        allowPlaintextSensitive: false,
        include: getDefaultGitHubBackupInclude(memoryDir),
        exclude: [],
        schedule: {
          enabled: false,
          time: "03:30",
          taskName: DEFAULT_GITHUB_BACKUP_TASK_NAME
        },
        lastRunAt: "",
        lastCommit: "",
        lastError: ""
      }
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
      mimocode: { enabled: true },
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
    path.join(memoryDir, "projects"),
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

  const bootstrapPath = path.join(memoryDir, "BOOTSTRAP.md");
  if (!fs.existsSync(bootstrapPath)) {
    fs.writeFileSync(bootstrapPath, renderEmptyBootstrapSnapshot(memoryDir), "utf8");
  }

  const projectsFile = getProjectsFile(memoryDir);
  if (!fs.existsSync(projectsFile)) {
    writeProjects(memoryDir, getSeedProjects());
  }

  const projectsReadmePath = path.join(memoryDir, "projects", "README.md");
  if (!fs.existsSync(projectsReadmePath)) {
    fs.writeFileSync(projectsReadmePath, renderProjectRegistryReadme(), "utf8");
  }
}

function renderProjectRegistryReadme() {
  return `# Project Registry

Project metadata is stored in \`projects.jsonl\` as one JSON object per line.

Use \`ai-memory-hub project list\`, \`project add\`, \`project update\`, \`project alias\`, and \`project relate\` to manage records. The dashboard project selectors show only \`active\`, \`paused\`, and \`planning\` projects and hide \`archived\` or \`test-*\` entries by default.

Writes use the shared hub lock, but this registry is currently read-modify-write. Avoid simultaneous manual edits; prefer the CLI or dashboard API.
`;
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
  const sync = { ...base.sync, ...(config.sync || {}) };
  const dashboard = { ...base.dashboard, ...(config.dashboard || {}) };
  const backup = {
    ...base.backup,
    ...(config.backup || {}),
    github: {
      ...base.backup.github,
      ...(config.backup?.github || {}),
      schedule: {
        ...base.backup.github.schedule,
        ...(config.backup?.github?.schedule || {})
      }
    }
  };
  sync.backupRetention = {
    ...base.sync.backupRetention,
    ...(config.backups || {}),
    ...(config.sync?.backupRetention || {})
  };
  Object.defineProperty(sync, "_explicitKeys", {
    value: new Set(Object.keys(config.sync || {})),
    enumerable: false
  });
  return {
    ...base,
    ...cleanConfig,
    memoryDir,
    sync,
    dashboard,
    backup,
    tools: { ...base.tools, ...(config.tools || {}) }
  };
}

function getCachedDetectedTools(memoryDir = resolveMemoryDir()) {
  const now = Date.now();
  if (
    toolDetectionCache &&
    toolDetectionCache.memoryDir === memoryDir &&
    now - toolDetectionCache.ts < TOOL_DETECTION_CACHE_TTL_MS
  ) {
    return toolDetectionCache.tools;
  }
  const tools = detectTools(memoryDir);
  toolDetectionCache = { memoryDir, ts: now, tools };
  return tools;
}

function refreshDetectedTools(memoryDir = resolveMemoryDir()) {
  const tools = detectTools(memoryDir);
  toolDetectionCache = { memoryDir, ts: Date.now(), tools };
  return tools;
}

function invalidateToolDetectionCache(memoryDir = resolveMemoryDir()) {
  if (!toolDetectionCache || toolDetectionCache.memoryDir === memoryDir) {
    toolDetectionCache = null;
  }
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
      name: "mimocode",
      kind: "skill-config",
      dir: path.join(home, ".config", "mimocode")
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
    case "node":
      return workflowNodeCommand(actionArgs);
    case "graph":
      return workflowGraphCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub workflow <create|list|start|status|result|review|signal|done|node|graph> ...");
  }
}

function gateCommand(argv) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "request":
      return gateRequestCommand(actionArgs);
    case "approve":
      return gateDecisionCommand(actionArgs, "approved");
    case "reject":
      return gateDecisionCommand(actionArgs, "rejected");
    case "needs-changes":
      return gateDecisionCommand(actionArgs, "needs_changes");
    case "waive":
      return gateDecisionCommand(actionArgs, "waived");
    case "list":
      return gateListCommand(actionArgs);
    case "show":
      return gateShowCommand(actionArgs);
    case "queue":
      return gateQueueCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub gate <request|approve|reject|needs-changes|waive|list|show|queue> ...");
  }
}

function gateRequestCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const actor = getOption(argv, "--actor");
  const scope = getOption(argv, "--scope") || "operation";
  const operation = getOption(argv, "--operation") || "";
  const refId = getOption(argv, "--ref");
  const refType = getOption(argv, "--ref-type") || "";
  const reason = getOption(argv, "--reason") || "Approval required";
  const reviewer = getOption(argv, "--reviewer") || "human";
  const project = getOption(argv, "--project") || "";
  if (!actor) {
    throw new Error("Usage: ai-memory-hub gate request --actor <name> --scope <dispatch|workflow|task|operation> [--operation <name>] [--ref <id>] [--ref-type <type>] [--reason <text>]");
  }
  const gate = appendApprovalGateEvent(config.memoryDir, {
    status: "requested",
    actor,
    scope,
    operation,
    refId,
    refType,
    reason,
    reviewer,
    project
  });
  console.log(JSON.stringify({
    ok: true,
    gateId: gate.gateId,
    status: gate.status,
    message: `Approval gate created: ${gate.gateId}`
  }, null, 2));
}

function gateDecisionCommand(argv, decision) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const gateId = getOption(argv, "--id");
  const by = getOption(argv, "--by") || "human";
  const note = getOption(argv, "--note") || "";
  if (!gateId) {
    throw new Error(`Usage: ai-memory-hub gate ${decision === "approved" ? "approve" : decision === "rejected" ? "reject" : decision === "needs_changes" ? "needs-changes" : "waive"} --id <gateId> --by <reviewer> [--note <text>]`);
  }
  const gates = readApprovalGates(config.memoryDir, { });
  const existing = gates.find((g) => g.gateId === gateId);
  if (!existing) {
    throw new Error(`Gate not found: ${gateId}`);
  }
  if (existing.isFinal) {
    throw new Error(`Gate already decided: ${existing.status}`);
  }
  const gate = appendApprovalGateEvent(config.memoryDir, {
    gateId,
    status: decision,
    actor: existing.actor,
    scope: existing.scope,
    operation: existing.operation,
    refId: existing.refId,
    refType: existing.refType,
    reason: existing.reason,
    reviewer: by,
    project: existing.project,
    requestedAt: existing.requestedAt,
    decidedAt: new Date().toISOString(),
    decisionNote: note
  });
  console.log(JSON.stringify({
    ok: true,
    gateId: gate.gateId,
    status: gate.status,
    decidedAt: gate.decidedAt,
    message: `Gate ${decision}: ${gate.gateId}`
  }, null, 2));
}

function gateListCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const filters = {
    status: getOption(argv, "--status"),
    actor: getOption(argv, "--actor"),
    reviewer: getOption(argv, "--reviewer"),
    scope: getOption(argv, "--scope"),
    project: getOption(argv, "--project")
  };
  const gates = readApprovalGates(config.memoryDir, filters);
  console.log(JSON.stringify({
    ok: true,
    count: gates.length,
    gates: gates.map((g) => ({
      gateId: g.gateId,
      status: g.status,
      scope: g.scope,
      actor: g.actor,
      reviewer: g.reviewer,
      project: g.project,
      operation: g.operation,
      refId: g.refId,
      reason: g.reason,
      requestedAt: g.requestedAt,
      decidedAt: g.decidedAt
    }))
  }, null, 2));
}

function gateShowCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const gateId = getOption(argv, "--id");
  if (!gateId) {
    throw new Error("Usage: ai-memory-hub gate show --id <gateId>");
  }
  const gates = readApprovalGates(config.memoryDir, { });
  const gate = gates.find((g) => g.gateId === gateId);
  if (!gate) {
    throw new Error(`Gate not found: ${gateId}`);
  }
  console.log(JSON.stringify(gate, null, 2));
}

function gateQueueCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const reviewer = getOption(argv, "--reviewer") || "human";
  const gates = readApprovalGates(config.memoryDir, { reviewer })
    .filter((g) => !g.isFinal);
  console.log(JSON.stringify({
    ok: true,
    reviewer,
    count: gates.length,
    pending: gates.map((g) => ({
      gateId: g.gateId,
      status: g.status,
      scope: g.scope,
      actor: g.actor,
      project: g.project,
      operation: g.operation,
      refId: g.refId,
      reason: g.reason,
      requestedAt: g.requestedAt
    }))
  }, null, 2));
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

    // Phase 4: Auto-create workflow nodes
    autoCreateWorkflowNodes(config.memoryDir, workflow);

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
  const auto = hasFlag(argv, "--auto");

  // Phase 5: --auto flag switches to derived status mode
  if (auto) {
    if (!id) {
      throw new Error("Usage: ai-memory-hub workflow status --id <workflow-id> --auto [--by codex]");
    }
    const config = loadConfig();
    ensureHub(config.memoryDir);
    return withHubLock(config.memoryDir, "workflow-status", () => {
      const workflow = updateWorkflow(config.memoryDir, id, (current) => ({
        ...current,
        usesDerivedStatus: true,
        updatedAt: new Date().toISOString(),
        notes: [
          ...(current.notes || []),
          createTaskNote(by, `Switched to derived status mode. Status will now be computed from node states.`)
        ]
      }));
      // Re-read to get derived status applied
      const updated = readWorkflows(config.memoryDir).find(w => w.id === workflow.id) || workflow;
      console.log(JSON.stringify(updated, null, 2));
    }, config.sync.lockStaleMs);
  }

  if (!id || !status) {
    throw new Error("Usage: ai-memory-hub workflow status --id <workflow-id> --status <open|planned|in_progress|review|blocked|done|cancelled> [--by codex]\n       ai-memory-hub workflow status --id <workflow-id> --auto [--by codex]");
  }
  assertWorkflowStatus(status);
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "workflow-status", () => {
    // Phase 5: Block manual status changes if using derived status
    const workflows = readWorkflows(config.memoryDir);
    const current = workflows.find((item) => item.id === id || item.id.startsWith(id));
    if (current?.usesDerivedStatus) {
      throw new Error(
        `Cannot manually set status: workflow is using derived status mode.\n` +
        `Status is automatically computed from node states.\n` +
        `Current derived status: ${current.status}`
      );
    }

    // Phase 3: When marking workflow as done, check all required nodes are completed
    if (status === "done") {
      if (current) {
        const nodes = readWorkflowNodes(config.memoryDir, current.id);
        const requiredNodes = nodes.filter(n => n.isRequired);
        const incompleteRequired = requiredNodes.filter(n => n.status !== "completed");

        if (incompleteRequired.length > 0) {
          const nodeList = incompleteRequired.map(n => `  - ${n.label} (${n.role}:${n.actor}) → ${n.status}`).join("\n");
          throw new Error(
            `Cannot mark workflow as done: ${incompleteRequired.length} required node(s) not completed:\n${nodeList}\n\n` +
            `Use 'workflow node done --workflow ${id} --node <slug>' to complete them first.`
          );
        }
      }
    }

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

    // Phase 3: Auto-update node status when role is specified
    if (role) {
      const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
      const matchingNode = nodes.find(n => n.role === role && n.actor === by);

      if (matchingNode) {
        if (field === "results") {
          // workflow result → mark executor node as completed
          appendWorkflowNodeEvent(config.memoryDir, {
            type: "workflow.node",
            workflowId: workflow.id,
            nodeId: matchingNode.nodeId,
            slug: matchingNode.slug,
            status: "completed",
            ts: new Date().toISOString(),
            note: `Auto-completed by workflow result command`,
            output: { text }
          });
        } else if (field === "reviews") {
          // workflow review → mark reviewer node as completed or rejected
          // Heuristic: if text contains rejection keywords, mark as rejected
          const isRejection = /reject|block|fail|不通过|拒绝|驳回/i.test(text);
          const status = isRejection ? "rejected" : "completed";
          appendWorkflowNodeEvent(config.memoryDir, {
            type: "workflow.node",
            workflowId: workflow.id,
            nodeId: matchingNode.nodeId,
            slug: matchingNode.slug,
            status,
            ts: new Date().toISOString(),
            note: `Auto-${status} by workflow review command`,
            output: { text }
          });
        }
      }
    }

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

function workflowNodeCommand(argv) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "add":
    case "create":
      return workflowNodeAddCommand(actionArgs);
    case "start":
      return workflowNodeTransitionCommand(actionArgs, "running");
    case "wait":
      return workflowNodeTransitionCommand(actionArgs, "waiting");
    case "done":
    case "complete":
      return workflowNodeTransitionCommand(actionArgs, "completed");
    case "fail":
      return workflowNodeTransitionCommand(actionArgs, "failed");
    case "error":
      return workflowNodeTransitionCommand(actionArgs, "error");
    case "cancel":
      return workflowNodeTransitionCommand(actionArgs, "cancelled");
    case "reject":
      return workflowNodeTransitionCommand(actionArgs, "rejected");
    case "list":
      return workflowNodeListCommand(actionArgs);
    case "show":
      return workflowNodeShowCommand(actionArgs);
    default:
      throw new Error("Usage: ai-memory-hub workflow node <add|start|wait|done|fail|error|cancel|reject|list|show> ...");
  }
}

function workflowNodeAddCommand(argv) {
  const workflowId = getOption(argv, "--workflow") || getOption(argv, "--id");
  const slug = getOption(argv, "--slug");
  const label = getOption(argv, "--label") || slug;
  const role = getOption(argv, "--role") || "";
  const actor = getOption(argv, "--actor") || "";
  const isRequired = !hasOption(argv, "--optional");
  if (!workflowId || !slug) {
    throw new Error("Usage: ai-memory-hub workflow node add --workflow <id> --slug <slug> [--label <label>] [--role <role>] [--actor <actor>] [--optional]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodeId = `${workflow.id}:${slug}`;
  const now = new Date().toISOString();
  const event = {
    workflowId: workflow.id,
    nodeId,
    slug,
    label,
    role,
    actor,
    status: "queued",
    ts: now,
    createdAt: now,
    isRequired
  };
  const result = appendWorkflowNodeEvent(config.memoryDir, event);
  console.log(JSON.stringify(result, null, 2));
}

function workflowNodeTransitionCommand(argv, targetStatus) {
  const workflowId = getOption(argv, "--workflow") || getOption(argv, "--id");
  const nodeSlugOrId = getOption(argv, "--node") || positionalArgs(argv)[0];
  const note = getOption(argv, "--note") || "";
  const error = getOption(argv, "--error") || "";
  const outputRaw = getOption(argv, "--output");
  const output = outputRaw ? JSON.parse(outputRaw) : {};
  if (!workflowId || !nodeSlugOrId) {
    throw new Error(`Usage: ai-memory-hub workflow node ${targetStatus} --workflow <id> --node <nodeId|slug> [--note <text>] [--error <text>] [--output <json>]`);
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
  const node = nodes.find((n) => n.nodeId === nodeSlugOrId || n.slug === nodeSlugOrId || n.nodeId.endsWith(`:${nodeSlugOrId}`));
  if (!node) {
    throw new Error(`Node not found: ${nodeSlugOrId} in workflow ${workflow.id}`);
  }
  const now = new Date().toISOString();
  const event = {
    ...node,
    status: targetStatus,
    ts: now,
    note: note || node.note,
    error: error || node.error,
    output: Object.keys(output).length > 0 ? output : node.output
  };
  if (targetStatus === "running" && !node.startedAt) {
    event.startedAt = now;
  }
  if (["completed", "failed", "error", "cancelled", "rejected"].includes(targetStatus) && !node.completedAt) {
    event.completedAt = now;
  }
  const result = appendWorkflowNodeEvent(config.memoryDir, event);
  console.log(JSON.stringify(result, null, 2));
}

function workflowNodeListCommand(argv) {
  const workflowId = getOption(argv, "--workflow") || getOption(argv, "--id") || positionalArgs(argv)[0];
  if (!workflowId) {
    throw new Error("Usage: ai-memory-hub workflow node list --workflow <id>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
  console.log(JSON.stringify(nodes, null, 2));
}

function workflowNodeShowCommand(argv) {
  const workflowId = getOption(argv, "--workflow") || getOption(argv, "--id");
  const nodeSlugOrId = getOption(argv, "--node") || positionalArgs(argv)[0];
  if (!workflowId || !nodeSlugOrId) {
    throw new Error("Usage: ai-memory-hub workflow node show --workflow <id> --node <nodeId|slug>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
  const node = nodes.find((n) => n.nodeId === nodeSlugOrId || n.slug === nodeSlugOrId || n.nodeId.endsWith(`:${nodeSlugOrId}`));
  if (!node) {
    throw new Error(`Node not found: ${nodeSlugOrId}`);
  }
  console.log(JSON.stringify(node, null, 2));
}

function workflowGraphCommand(argv) {
  const workflowId = getOption(argv, "--id") || getOption(argv, "--workflow") || positionalArgs(argv)[0];
  if (!workflowId) {
    throw new Error("Usage: ai-memory-hub workflow graph --id <workflow-id>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
  const derivedStatus = deriveWorkflowStatusFromNodes(nodes);
  console.log(`Workflow ${workflow.id}: ${derivedStatus || workflow.status}`);
  if (nodes.length === 0) {
    console.log("  (no execution history)");
  } else {
    for (const node of nodes) {
      const icon = {
        completed: "✓",
        failed: "✗",
        error: "✗",
        cancelled: "⊗",
        rejected: "⊘",
        running: "▶",
        waiting: "⏸",
        queued: "◦"
      }[node.status] || "?";
      const required = node.isRequired ? "" : " (optional)";
      console.log(`  [${icon}] ${node.label} (${node.role}:${node.actor}) — ${node.status}${required}`);
      if (node.note) {
        console.log(`      Note: ${node.note}`);
      }
      if (node.error) {
        console.log(`      Error: ${node.error}`);
      }
    }
  }
}

function enrichToolConnection(tool, memoryDir) {
  const target = getInstallTargetForTool(memoryDir, tool.name);
  const instructionFile = target?.file || path.join(memoryDir, "tools", `${tool.name}-shared-memory.md`);
  const instruction = inspectSharedMemoryInstructions(instructionFile);
  const configured = instruction.configured;
  const runner = getToolRunner(tool.name);
  const connected = Boolean(tool.installed && configured);
  let connectionStatus = "missing";
  let action = "Install the tool first, then run ai-memory-hub connect --apply.";

  if (tool.installed && configured && instruction.skillLayer) {
    connectionStatus = runner.available ? "connected-runnable" : "connected-shared-state";
    action = runner.available
      ? "Ready for shared memory and verified dispatch runner."
      : "Ready for shared memory; no verified automatic runner yet.";
  } else if (tool.installed && configured) {
    connectionStatus = "connected-legacy";
    action = `Run ai-memory-hub install --tool ${tool.name} --apply to add the Shared Skill Layer.`;
  } else if (tool.installed) {
    connectionStatus = "detected-unconfigured";
    action = `Run ai-memory-hub connect --apply or ai-memory-hub install --tool ${tool.name} --apply.`;
  } else if (configured) {
    connectionStatus = instruction.skillLayer ? "preconfigured-missing" : "preconfigured-legacy";
    action = instruction.skillLayer
      ? "Adapter note exists; install or launch the tool to use it."
      : `Adapter note exists but needs Shared Skill Layer v${SHARED_SKILL_LAYER_VERSION}.`;
  }

  return {
    ...tool,
    configured,
    connected,
    connectionStatus,
    skillLayer: instruction.skillLayer,
    skillLayerVersion: instruction.skillLayerVersion,
    skillLayerStatus: instruction.status,
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
  return inspectSharedMemoryInstructions(file).configured;
}

function inspectSharedMemoryInstructions(file) {
  if (!file || !fs.existsSync(file)) {
    return {
      configured: false,
      skillLayer: false,
      skillLayerVersion: "",
      status: "missing"
    };
  }
  const text = fs.readFileSync(file, "utf8");
  const configured = text.includes("Shared AI Memory") && (
    text.includes("ai-memory-hub") ||
    text.includes(".ai-memory") ||
    text.includes("AI Memory Hub")
  );
  const skillLayerVersion = extractSharedSkillLayerVersion(text);
  const skillLayer = Boolean(skillLayerVersion);
  return {
    configured,
    skillLayer,
    skillLayerVersion,
    status: skillLayer
      ? `shared-skill-layer-v${skillLayerVersion}`
      : configured
        ? "legacy-shared-memory"
        : "missing"
  };
}

function extractSharedSkillLayerVersion(text) {
  const match = String(text || "").match(/AI_MEMORY_HUB_SHARED_SKILL_LAYER v([0-9]+)/);
  return match ? match[1] : "";
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
      tool: "mimocode",
      file: path.join(cwd, ".mimocode", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("MIMOCODE_SKILL.md")
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
    {
      tool: "mimocode",
      file: path.join(home, ".config", "mimocode", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("MIMOCODE_SKILL.md")
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

function resolveReference(query, config, options = {}) {
  const normalizedQuery = normalizeResolveQuery(query);
  const fromFile = options.fromFile ? resolvePossiblyHomePath(options.fromFile) : "";
  const records = Array.isArray(options.records)
    ? options.records
    : buildMemoryIndex(readLedger(config.memoryDir), config).records;
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidatePath, source, evidence = "", confidence = 50) => {
    const resolvedPath = normalizeCandidatePath(candidatePath);
    if (!resolvedPath || !pathMatchesResolveQuery(resolvedPath, normalizedQuery)) {
      return;
    }
    const key = resolvedPath.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      path: resolvedPath,
      exists: fs.existsSync(resolvedPath),
      source,
      confidence,
      evidence: sanitizeInlineText(evidence).slice(0, 240)
    });
  };

  for (const candidate of getDirectResolveCandidates(normalizedQuery, config, fromFile)) {
    addCandidate(candidate.path, candidate.source, candidate.evidence, candidate.confidence);
  }

  for (const record of records) {
    const text = String(record.text || "");
    if (!text || !textMentionsResolveQuery(text, normalizedQuery)) {
      continue;
    }
    for (const candidatePath of extractFilesystemPathCandidates(text)) {
      addCandidate(
        candidatePath,
        `memory:${record.localEventId || record.id || record.source || "record"}`,
        text,
        70 + Math.min(25, Number(record.importance || 0) / 4)
      );
    }
  }

  candidates.sort((a, b) =>
    Number(b.exists) - Number(a.exists) ||
    Number(b.confidence || 0) - Number(a.confidence || 0) ||
    a.path.localeCompare(b.path)
  );
  const limited = candidates.slice(0, Number(options.limit || 10));
  return {
    ok: limited.length > 0,
    query,
    normalizedQuery,
    fromFile,
    best: limited[0] || null,
    candidates: limited
  };
}

function getDirectResolveCandidates(normalizedQuery, config, fromFile = "") {
  const home = os.homedir();
  const roots = [
    process.cwd(),
    home,
    path.join(home, ".codex"),
    path.join(home, ".claude"),
    path.join(home, ".gemini"),
    config.memoryDir,
    path.join(config.memoryDir, "tools"),
    projectRoot()
  ];
  const candidates = [];
  const add = (candidatePath, source, confidence = 50) => {
    candidates.push({ path: candidatePath, source, confidence, evidence: source });
  };
  if (fromFile) {
    add(path.resolve(path.dirname(fromFile), normalizedQuery), `relative:${fromFile}`, 90);
  }
  if (path.isAbsolute(normalizedQuery)) {
    add(normalizedQuery, "absolute-path", 95);
  }
  for (const root of roots) {
    add(path.resolve(root, normalizedQuery), `root:${root}`, root === home ? 80 : 65);
  }
  return candidates;
}

function normalizeResolveQuery(query) {
  const clean = String(query || "").trim().replace(/^@+/, "");
  return clean.replace(/^["']|["']$/g, "");
}

function textMentionsResolveQuery(text, normalizedQuery) {
  const basename = path.basename(normalizedQuery).toLowerCase();
  const normalizedText = normalizeSearchText(text);
  return normalizedText.includes(normalizeSearchText(normalizedQuery)) ||
    (basename && normalizedText.includes(basename));
}

function extractFilesystemPathCandidates(text) {
  const source = String(text || "");
  const matches = [
    ...(source.match(/[A-Za-z]:\\[^\s`'")\]}，。；;]+/g) || []),
    ...(source.match(/~[\\/][^\s`'")\]}，。；;]+/g) || [])
  ];
  return matches.map((item) => item.replace(/[.,，。；;:]+$/g, ""));
}

function normalizeCandidatePath(candidatePath) {
  const clean = resolvePossiblyHomePath(candidatePath);
  if (!clean) {
    return "";
  }
  return path.isAbsolute(clean) ? path.normalize(clean) : path.resolve(clean);
}

function resolvePossiblyHomePath(value) {
  const clean = String(value || "").trim().replace(/^["']|["']$/g, "");
  if (!clean) {
    return "";
  }
  if (clean === "~") {
    return os.homedir();
  }
  if (clean.startsWith("~/") || clean.startsWith("~\\")) {
    return path.join(os.homedir(), clean.slice(2));
  }
  return clean;
}

function pathMatchesResolveQuery(candidatePath, normalizedQuery) {
  if (!normalizedQuery) {
    return false;
  }
  const candidate = path.normalize(candidatePath).toLowerCase();
  const query = path.normalize(normalizedQuery).toLowerCase();
  if (candidate === query || candidate.endsWith(`${path.sep}${query}`)) {
    return true;
  }
  return path.basename(candidate).toLowerCase() === path.basename(query).toLowerCase();
}

function analyzeInstructionIncludes(config, options = {}) {
  const records = Array.isArray(options.records) ? options.records : buildMemoryIndex(readLedger(config.memoryDir), config).records;
  const files = getInstructionIncludeFiles(config.memoryDir);
  const diagnostics = {
    filesScanned: 0,
    includesChecked: 0,
    missing: []
  };
  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }
    diagnostics.filesScanned += 1;
    const text = fs.readFileSync(file, "utf8");
    for (const include of extractInstructionIncludes(text)) {
      diagnostics.includesChecked += 1;
      const expectedPath = path.resolve(path.dirname(file), normalizeResolveQuery(include));
      if (fs.existsSync(expectedPath)) {
        continue;
      }
      const resolved = resolveReference(include, config, {
        fromFile: file,
        records,
        limit: 5
      });
      diagnostics.missing.push({
        file,
        include,
        expectedPath,
        suggestions: resolved.candidates.filter((candidate) => candidate.exists).slice(0, 5)
      });
    }
  }
  diagnostics.ok = diagnostics.missing.length === 0;
  return diagnostics;
}

function getInstructionIncludeFiles(memoryDir) {
  const targets = [
    ...getInstallTargets(memoryDir),
    ...getLocalInstallTargets(process.cwd(), memoryDir)
  ];
  const files = new Set();
  for (const target of targets) {
    if (target.file) {
      files.add(path.resolve(target.file));
    }
  }
  return [...files].sort();
}

function extractInstructionIncludes(text) {
  const includes = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*@([A-Za-z0-9_.-][A-Za-z0-9_.\\/-]*)\s*$/);
    if (match) {
      includes.push(`@${match[1]}`);
    }
  }
  return [...new Set(includes)];
}

function renderDashboard() {
  const indexPath = path.join(getDashboardStaticRoot(), "index.html");
  if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
    return fs.readFileSync(indexPath, "utf8");
  }
  return readTemplate("dashboard-v2.html");
}

function sendStaticFile(res, pathname) {
  const publicDir = getDashboardStaticRoot();
  const relativePath = getSafeStaticRelativePath(pathname);
  if (!relativePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  const filePath = path.join(publicDir, relativePath);
  const normalizedFilePath = path.resolve(filePath);
  const normalizedPublicDir = path.resolve(publicDir);

  if (!normalizedFilePath.startsWith(normalizedPublicDir + path.sep) && normalizedFilePath !== normalizedPublicDir) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(normalizedFilePath) || !fs.statSync(normalizedFilePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(normalizedFilePath);
  const contentTypeMap = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".html": "text/html; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  };

  res.writeHead(200, {
    "Content-Type": contentTypeMap[ext] || "text/plain",
    "Cache-Control": "public, max-age=3600"
  });
  fs.createReadStream(normalizedFilePath).pipe(res);
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
  const publicDir = getDashboardStaticRoot();
  const relativePath = getSafeStaticRelativePath(pathname);
  if (!relativePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  const assetPath = path.join(publicDir, relativePath);
  const assetsRoot = path.join(publicDir, "assets");
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

function getDashboardStaticRoot() {
  const publicDir = path.join(projectRoot(), "public");
  if (fs.existsSync(publicDir) && fs.statSync(publicDir).isDirectory()) {
    return publicDir;
  }
  return path.join(projectRoot(), "dashboard-next", "dist");
}

function getSafeStaticRelativePath(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return "";
  }
  const relativePath = decodedPath.replace(/^\/+/, "").replace(/\\/g, "/");
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    return "";
  }
  return segments.join(path.sep);
}

function getContentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
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
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
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
      const baseMetadata = normalizeMemoryMetadata(item.metadata || {}, item);
      const access = getMemoryAccessStats({ ...item, metadata: baseMetadata });
      const metadata = mergeMemoryAccessMetadata(baseMetadata, access);
      const record = {
        ...item,
        id: item.id || createId(item.text || JSON.stringify(item)),
        localEventId: item.localEventId || item.local_event_id || "",
        schemaVersion: item.schemaVersion || 1,
        ts: item.ts || item.createdAt || "",
        indexedAt: item.indexedAt || "",
        source: item.source || metadata.source || "unknown",
        text: item.text || item.memory || "",
        metadata
      };
      return applyMemoryAccessFields(record, access);
    })
    .filter((item) => item.text);
}

function writeLedger(memoryDir, ledger) {
  const file = path.join(memoryDir, "memories", "ledger.jsonl");
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, ledger.map((item) => JSON.stringify(item)).join("\n") + (ledger.length ? "\n" : ""), "utf8");
}

function readTasks(memoryDir) {
  bootstrapEntityEventsFromProjection(memoryDir, getTaskEventStoreDefinition());
  const events = readEntityEvents(memoryDir, getTaskEventStoreDefinition());
  if (events.length > 0) {
    return replayEntityEvents(events, getTaskEventStoreDefinition());
  }
  return readEvents(getTasksFile(memoryDir))
    .map(normalizeTask)
    .filter((task) => task.id && task.title);
}

function writeTasks(memoryDir, tasks) {
  writeEntityRecords(memoryDir, getTaskEventStoreDefinition(), tasks);
}

function readWorkflows(memoryDir) {
  bootstrapEntityEventsFromProjection(memoryDir, getWorkflowEventStoreDefinition());
  const events = readEntityEvents(memoryDir, getWorkflowEventStoreDefinition());
  let workflows = [];
  if (events.length > 0) {
    workflows = replayEntityEvents(events, getWorkflowEventStoreDefinition());
  } else {
    workflows = readEvents(getWorkflowsFile(memoryDir))
      .map(normalizeWorkflow)
      .filter((workflow) => workflow.id && workflow.title);
  }

  // Phase 5: Apply derived status for workflows that opted in.
  // Read the nodes file at most once and only when needed.
  const derivedWorkflows = workflows.filter((workflow) => workflow.usesDerivedStatus);
  if (derivedWorkflows.length === 0) {
    return workflows;
  }
  const nodesByWorkflow = readWorkflowNodesByWorkflow(memoryDir);
  return workflows.map((workflow) => {
    if (!workflow.usesDerivedStatus) {
      return workflow;
    }
    const nodeList = nodesByWorkflow.get(workflow.id) || [];
    const derivedStatus = deriveWorkflowStatusFromNodes(nodeList);
    if (derivedStatus) {
      return {
        ...workflow,
        status: derivedStatus,
        derivedStatus // store the derived value for debugging/inspection
      };
    }
    return workflow;
  });
}

function writeWorkflows(memoryDir, workflows) {
  writeEntityRecords(memoryDir, getWorkflowEventStoreDefinition(), workflows);
}

function readProjects(memoryDir) {
  bootstrapEntityEventsFromProjection(memoryDir, getProjectEventStoreDefinition());
  const events = readEntityEvents(memoryDir, getProjectEventStoreDefinition());
  if (events.length > 0) {
    return replayEntityEvents(events, getProjectEventStoreDefinition());
  }
  return readEvents(getProjectsFile(memoryDir))
    .map(normalizeProject)
    .filter((project) => project.id && project.name);
}

function writeProjects(memoryDir, projects) {
  writeEntityRecords(memoryDir, getProjectEventStoreDefinition(), projects);
}

function getTasksFile(memoryDir) {
  return path.join(memoryDir, "tasks", "tasks.jsonl");
}

function getWorkflowsFile(memoryDir) {
  return path.join(memoryDir, "workflows", "workflows.jsonl");
}

function getProjectsFile(memoryDir) {
  return path.join(memoryDir, "projects", "projects.jsonl");
}

function getTaskEventStoreDefinition() {
  return {
    entity: "task",
    dirName: "tasks",
    projectionName: "tasks.jsonl",
    normalize: normalizeTask,
    isValid: (task) => task.id && task.title
  };
}

function getProjectEventStoreDefinition() {
  return {
    entity: "project",
    dirName: "projects",
    projectionName: "projects.jsonl",
    normalize: normalizeProject,
    isValid: (project) => project.id && project.name
  };
}

function getWorkflowEventStoreDefinition() {
  return {
    entity: "workflow",
    dirName: "workflows",
    projectionName: "workflows.jsonl",
    normalize: normalizeWorkflow,
    isValid: (workflow) => workflow.id && workflow.title
  };
}

// Workflow node history (P0: workflow execution history with node states)

function readWorkflowNodes(memoryDir, workflowId) {
  const nodesFile = path.join(memoryDir, "workflows", "nodes.jsonl");
  const events = readEvents(nodesFile).filter((event) => event.workflowId === workflowId);
  const nodeMap = new Map();
  for (const event of events) {
    const existing = nodeMap.get(event.nodeId);
    if (!existing || new Date(event.ts) > new Date(existing.ts)) {
      nodeMap.set(event.nodeId, event);
    }
  }
  return Array.from(nodeMap.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Read every workflow's current nodes in a single pass over nodes.jsonl.
// Returns a Map of workflowId -> sorted node array. Used by readWorkflows to
// avoid re-reading the file once per derived-status workflow.
function readWorkflowNodesByWorkflow(memoryDir) {
  const nodesFile = path.join(memoryDir, "workflows", "nodes.jsonl");
  const events = readEvents(nodesFile);
  const latestByNode = new Map();
  for (const event of events) {
    if (!event.workflowId || !event.nodeId) {
      continue;
    }
    const existing = latestByNode.get(event.nodeId);
    if (!existing || new Date(event.ts) > new Date(existing.ts)) {
      latestByNode.set(event.nodeId, event);
    }
  }
  const byWorkflow = new Map();
  for (const node of latestByNode.values()) {
    if (!byWorkflow.has(node.workflowId)) {
      byWorkflow.set(node.workflowId, []);
    }
    byWorkflow.get(node.workflowId).push(node);
  }
  for (const list of byWorkflow.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return byWorkflow;
}

function appendWorkflowNodeEvent(memoryDir, event) {
  const nodesFile = path.join(memoryDir, "workflows", "nodes.jsonl");
  ensureDir(path.dirname(nodesFile));
  const normalized = {
    type: "workflow.node",
    workflowId: event.workflowId,
    nodeId: event.nodeId,
    slug: event.slug,
    label: event.label || event.slug,
    role: event.role || "",
    actor: event.actor || "",
    status: event.status,
    ts: event.ts || new Date().toISOString(),
    createdAt: event.createdAt || event.ts || new Date().toISOString(),
    startedAt: event.startedAt || "",
    completedAt: event.completedAt || "",
    input: event.input || {},
    output: event.output || {},
    error: event.error || "",
    note: event.note || "",
    isRequired: event.isRequired !== false,
    isFinal: ["completed", "failed", "error", "cancelled", "rejected"].includes(event.status)
  };
  appendJsonl(nodesFile, normalized);
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Gates
// ─────────────────────────────────────────────────────────────────────────────

function readApprovalGates(memoryDir, filters = {}) {
  const gatesFile = path.join(memoryDir, "gates", "approvals.jsonl");
  if (!fs.existsSync(gatesFile)) return [];
  const events = readEvents(gatesFile);
  // Group by gateId, take most recent event per gate
  const byGate = events.reduce((acc, event) => {
    const id = event.gateId;
    if (!acc[id] || event.ts > acc[id].ts) {
      acc[id] = event;
    }
    return acc;
  }, {});
  let gates = Object.values(byGate);
  // Apply filters
  if (filters.status) gates = gates.filter((g) => g.status === filters.status);
  if (filters.actor) gates = gates.filter((g) => g.actor === filters.actor);
  if (filters.reviewer) gates = gates.filter((g) => g.reviewer === filters.reviewer);
  if (filters.scope) gates = gates.filter((g) => g.scope === filters.scope);
  if (filters.project) gates = gates.filter((g) => g.project === filters.project);
  if (filters.refId) gates = gates.filter((g) => g.refId === filters.refId);
  return gates.sort((a, b) => (b.requestedAt || b.ts).localeCompare(a.requestedAt || a.ts));
}

function appendApprovalGateEvent(memoryDir, event) {
  const gatesFile = path.join(memoryDir, "gates", "approvals.jsonl");
  ensureDir(path.dirname(gatesFile));
  const normalized = {
    type: "approval.gate",
    gateId: event.gateId || crypto.randomBytes(8).toString("hex"),
    status: event.status,
    scope: event.scope || "operation",
    actor: event.actor || "",
    reviewer: event.reviewer || "human",
    project: event.project || "",
    operation: event.operation || "",
    refId: event.refId || "",
    refType: event.refType || "",
    reason: event.reason || "",
    requestedAt: event.requestedAt || event.ts || new Date().toISOString(),
    decidedAt: event.decidedAt || "",
    decisionNote: event.decisionNote || "",
    evidence: event.evidence || [],
    expiresAt: event.expiresAt || "",
    ts: event.ts || new Date().toISOString(),
    isFinal: ["approved", "rejected", "waived"].includes(event.status)
  };
  appendJsonl(gatesFile, normalized);
  return normalized;
}

function deriveWorkflowStatusFromNodes(nodes) {
  if (!nodes || nodes.length === 0) return null;
  const required = nodes.filter((n) => n.isRequired);
  const hasRunning = nodes.some((n) => n.status === "running");
  const hasWaiting = nodes.some((n) => n.status === "waiting");
  const allRequiredCompleted = required.every((n) => n.status === "completed");
  const hasBlocker = required.some((n) => ["failed", "error", "rejected"].includes(n.status));
  const allCancelled = nodes.every((n) => n.status === "cancelled");
  if (allCancelled) return "cancelled";
  if (allRequiredCompleted) return "done";
  if (hasBlocker && !hasRunning && !hasWaiting) return "blocked";
  if (hasWaiting && !hasRunning) return "waiting";
  if (hasRunning) return "in_progress";
  const reviewNodes = nodes.filter((n) => n.role === "reviewer");
  const execNodes = required.filter((n) => n.role === "executor");
  if (execNodes.every((n) => n.status === "completed") && reviewNodes.some((n) => !["completed", "rejected"].includes(n.status))) {
    return "review";
  }
  return "open";
}

// Permission policy layer (P0: capability permission matrix)

function getPolicyRulesFile(memoryDir) {
  return path.join(memoryDir, "policy", "rules.jsonl");
}

function readPolicyRules(memoryDir) {
  const file = getPolicyRulesFile(memoryDir);
  const events = readEvents(file).filter((event) => String(event.type || "") === "policy.rule" && event.id);
  const byId = new Map();
  for (const event of events) {
    byId.set(event.id, event);
  }
  // Tombstones (decision === "__removed__") drop the rule.
  return Array.from(byId.values())
    .filter((rule) => rule.decision !== "__removed__")
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

function normalizePolicyRule(rule) {
  const operation = String(rule.operation || "").trim();
  const decision = String(rule.decision || "").trim();
  const scope = POLICY_SCOPES.includes(rule.scope) ? rule.scope : "all";
  const now = new Date().toISOString();
  return {
    type: "policy.rule",
    id: rule.id || createId(`policy:${rule.actor}:${rule.project}:${operation}:${scope}`),
    actor: String(rule.actor || "*").trim() || "*",
    project: String(rule.project || "*").trim() || "*",
    operation,
    scope,
    decision,
    reason: String(rule.reason || "").trim(),
    priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
    createdAt: rule.createdAt || now,
    createdBy: rule.createdBy || "manual",
    ts: now
  };
}

function appendPolicyRule(memoryDir, rule) {
  if (!POLICY_OPERATIONS.includes(rule.operation)) {
    throw new Error(`Invalid operation: ${rule.operation}. Valid: ${POLICY_OPERATIONS.join(", ")}`);
  }
  if (!POLICY_DECISIONS.includes(rule.decision)) {
    throw new Error(`Invalid decision: ${rule.decision}. Valid: ${POLICY_DECISIONS.join(", ")}`);
  }
  if (rule.scope && !POLICY_SCOPES.includes(rule.scope)) {
    throw new Error(`Invalid scope: ${rule.scope}. Valid: ${POLICY_SCOPES.join(", ")}`);
  }
  const file = getPolicyRulesFile(memoryDir);
  ensureDir(path.dirname(file));
  const normalized = normalizePolicyRule(rule);
  appendJsonl(file, normalized);
  return normalized;
}

function removePolicyRule(memoryDir, id, by = "manual") {
  const rules = readPolicyRules(memoryDir);
  const target = rules.find((rule) => rule.id === id || rule.id.startsWith(id));
  if (!target) {
    throw new Error(`Policy rule not found: ${id}`);
  }
  const file = getPolicyRulesFile(memoryDir);
  ensureDir(path.dirname(file));
  appendJsonl(file, {
    type: "policy.rule",
    id: target.id,
    actor: target.actor,
    project: target.project,
    operation: target.operation,
    scope: target.scope,
    decision: "__removed__",
    reason: "",
    priority: target.priority,
    createdAt: target.createdAt,
    createdBy: by,
    ts: new Date().toISOString()
  });
  return target;
}

function seedDefaultPolicyRules(memoryDir) {
  const existing = readPolicyRules(memoryDir);
  const seededOps = new Set(
    existing
      .filter((rule) => rule.actor === "*" && rule.project === "*" && rule.scope === "all" && rule.priority === 0)
      .map((rule) => rule.operation)
  );
  let added = 0;
  for (const seed of POLICY_DEFAULT_SEED) {
    if (seededOps.has(seed.operation)) {
      continue;
    }
    appendPolicyRule(memoryDir, {
      actor: "*",
      project: "*",
      scope: "all",
      operation: seed.operation,
      decision: seed.decision,
      reason: seed.reason,
      priority: 0,
      createdBy: "system"
    });
    added += 1;
  }
  return added;
}

// Actor query carries the literal actor plus any roles it holds (e.g. ["role:executor"]).
function policyActorMatches(rule, actor, actorRoles = []) {
  if (rule.actor === "*") return true;
  if (rule.actor === actor) return true;
  if (rule.actor.startsWith("role:") && actorRoles.includes(rule.actor)) return true;
  return false;
}

function policyScopeMatches(rule, scope) {
  // A rule applies if its scope is at least as broad as the queried scope.
  return POLICY_SCOPE_BREADTH[rule.scope] >= POLICY_SCOPE_BREADTH[scope];
}

function policyRuleSpecificity(rule) {
  let score = 0;
  if (rule.actor !== "*") score += 4;
  if (rule.project !== "*") score += 2;
  if (rule.scope !== "all") score += 1;
  return score;
}

function resolvePermission(memoryDir, { actor = "*", actorRoles = [], project = "*", operation, scope = "all" }) {
  if (!POLICY_OPERATIONS.includes(operation)) {
    throw new Error(`Invalid operation: ${operation}. Valid: ${POLICY_OPERATIONS.join(", ")}`);
  }
  if (!POLICY_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Valid: ${POLICY_SCOPES.join(", ")}`);
  }
  let rules = readPolicyRules(memoryDir);
  if (rules.length === 0) {
    seedDefaultPolicyRules(memoryDir);
    rules = readPolicyRules(memoryDir);
  }
  const matches = rules.filter((rule) =>
    rule.operation === operation &&
    policyActorMatches(rule, actor, actorRoles) &&
    (rule.project === "*" || rule.project === project) &&
    policyScopeMatches(rule, scope)
  );
  if (matches.length > 0) {
    matches.sort((a, b) => {
      const specDelta = policyRuleSpecificity(b) - policyRuleSpecificity(a);
      if (specDelta !== 0) return specDelta;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return String(b.ts || "").localeCompare(String(a.ts || ""));
    });
    const top = matches[0];
    return { decision: top.decision, reason: top.reason, matchedRule: top };
  }
  // Fail-safe fallback when no rule matches.
  if (POLICY_DESTRUCTIVE_OPERATIONS.includes(operation)) {
    return { decision: "ask", reason: "No policy matched; destructive operation requires approval by default", matchedRule: null };
  }
  return { decision: "allow", reason: "No policy restricts this operation", matchedRule: null };
}

function getEntityProjectionFile(memoryDir, definition) {
  return path.join(memoryDir, definition.dirName, definition.projectionName);
}

function getEntityEventsFile(memoryDir, definition) {
  return path.join(memoryDir, definition.dirName, "events.jsonl");
}

function readEntityEvents(memoryDir, definition) {
  return readEvents(getEntityEventsFile(memoryDir, definition))
    .filter((event) => event.entity === definition.entity || String(event.type || "").startsWith(`${definition.entity}.`));
}

function bootstrapEntityEventsFromProjection(memoryDir, definition) {
  const eventsFile = getEntityEventsFile(memoryDir, definition);
  if (countJsonlLines(eventsFile) > 0) {
    return;
  }
  const records = readEvents(getEntityProjectionFile(memoryDir, definition))
    .map(definition.normalize)
    .filter(definition.isValid);
  if (records.length === 0) {
    return;
  }
  appendEntityEvents(memoryDir, definition, records, {
    action: "upsert",
    source: "migration",
    reason: `${definition.projectionName}:import`
  });
  materializeEntityProjection(memoryDir, definition);
}

function writeEntityRecords(memoryDir, definition, records, options = {}) {
  const normalized = records
    .map(definition.normalize)
    .filter(definition.isValid);
  const current = new Map(replayEntityEvents(readEntityEvents(memoryDir, definition), definition).map((record) => [record.id, record]));
  const upserts = normalized.filter((record) => {
    const existing = current.get(record.id);
    if (!existing) {
      return true;
    }
    if (!isEntityRecordNewerOrSame(record, existing)) {
      return false;
    }
    return JSON.stringify(record) !== JSON.stringify(existing);
  });
  if (upserts.length > 0) {
    appendEntityEvents(memoryDir, definition, upserts, {
      action: "upsert",
      source: options.source || "ai-memory-hub",
      reason: options.reason || `${definition.entity}:write`
    });
  }
  materializeEntityProjection(memoryDir, definition);
}

function appendEntityRecord(memoryDir, definition, record, options = {}) {
  const normalized = definition.normalize(record);
  if (!definition.isValid(normalized)) {
    throw new Error(`Invalid ${definition.entity} record: ${normalized.id || "missing id"}`);
  }
  appendEntityEvents(memoryDir, definition, [normalized], {
    action: "upsert",
    source: options.source || "ai-memory-hub",
    reason: options.reason || `${definition.entity}:upsert`
  });
  materializeEntityProjection(memoryDir, definition);
  return normalized;
}

function deleteEntityRecord(memoryDir, definition, id, options = {}) {
  const entityId = String(id || "").trim();
  if (!entityId) {
    throw new Error(`Invalid ${definition.entity} id`);
  }
  appendEntityEvents(memoryDir, definition, [{ id: entityId }], {
    action: "delete",
    source: options.source || "ai-memory-hub",
    reason: options.reason || `${definition.entity}:delete`
  });
  materializeEntityProjection(memoryDir, definition);
}

function appendEntityEvents(memoryDir, definition, records, { action = "upsert", source = "ai-memory-hub", reason = "" } = {}) {
  const file = getEntityEventsFile(memoryDir, definition);
  for (const record of records) {
    appendJsonl(file, createEntityEvent(definition, action, record, { source, reason }));
  }
}

function createEntityEvent(definition, action, record, { source = "ai-memory-hub", reason = "" } = {}) {
  const ts = new Date().toISOString();
  const entityId = record.id || record.entityId || "";
  return {
    id: createId(`${definition.entity}:${action}:${entityId}:${JSON.stringify(record)}:${ts}`),
    schemaVersion: 1,
    ts,
    source,
    entity: definition.entity,
    action,
    type: `${definition.entity}.${action}`,
    entityId,
    reason,
    record: action === "delete" ? undefined : record
  };
}

function replayEntityEvents(events, definition) {
  const byId = new Map();
  for (const event of events) {
    const action = String(event.action || String(event.type || "").split(".").pop() || "").toLowerCase();
    const record = event.record || event[definition.entity] || event.payload;
    const entityId = String(event.entityId || record?.id || "").trim();
    if (!entityId) {
      continue;
    }
    if (["delete", "remove", "tombstone"].includes(action)) {
      byId.delete(entityId);
      continue;
    }
    if (!["upsert", "create", "update", "snapshot"].includes(action) || !isPlainObject(record)) {
      continue;
    }
    const normalized = definition.normalize(record);
    if (definition.isValid(normalized)) {
      byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()];
}

function materializeEntityProjection(memoryDir, definition) {
  const records = replayEntityEvents(readEntityEvents(memoryDir, definition), definition);
  const file = getEntityProjectionFile(memoryDir, definition);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
  return records;
}

function rebuildEventSourcedProjections(memoryDir) {
  bootstrapEntityEventsFromProjection(memoryDir, getTaskEventStoreDefinition());
  bootstrapEntityEventsFromProjection(memoryDir, getProjectEventStoreDefinition());
  bootstrapEntityEventsFromProjection(memoryDir, getWorkflowEventStoreDefinition());
  const tasks = materializeEntityProjection(memoryDir, getTaskEventStoreDefinition());
  const projects = materializeEntityProjection(memoryDir, getProjectEventStoreDefinition());
  const workflows = materializeEntityProjection(memoryDir, getWorkflowEventStoreDefinition());
  return {
    tasks: tasks.length,
    projects: projects.length,
    workflows: workflows.length
  };
}

function isEntityRecordNewerOrSame(record, existing) {
  const recordTime = Date.parse(record.updatedAt || record.createdAt || "");
  const existingTime = Date.parse(existing.updatedAt || existing.createdAt || "");
  if (Number.isNaN(recordTime) || Number.isNaN(existingTime)) {
    return true;
  }
  return recordTime >= existingTime;
}

function createProject({ id, name, displayName, status, type, description, metadata, aliases, resources }) {
  const now = new Date().toISOString();
  return normalizeProject({
    id,
    name,
    displayName: displayName || name,
    status: status || "active",
    type: type || "",
    description: description || "",
    metadata: isPlainObject(metadata) ? metadata : {},
    aliases: Array.isArray(aliases) ? aliases : [],
    resources: isPlainObject(resources) ? resources : {},
    createdAt: now,
    updatedAt: now
  });
}

function updateProject(memoryDir, id, updater) {
  const projects = readProjects(memoryDir);
  const index = findProjectIndex(projects, id);
  if (index === -1) {
    throw new Error(`Project not found: ${id}`);
  }
  const updated = normalizeProject({
    ...updater(projects[index]),
    updatedAt: new Date().toISOString()
  });
  return appendEntityRecord(memoryDir, getProjectEventStoreDefinition(), updated, {
    reason: "project:update"
  });
}

function normalizeProject(project) {
  const now = new Date().toISOString();
  const id = String(project.id || project.project || project.key || "").trim();
  const name = String(project.name || project.displayName || id || "").trim();
  const status = normalizeProjectStatus(project.status || "active");
  const normalized = {
    id,
    name,
    displayName: String(project.displayName || project.display_name || name || id).trim(),
    status,
    type: String(project.type || "").trim(),
    description: String(project.description || project.text || "").trim(),
    metadata: isPlainObject(project.metadata) ? { ...project.metadata } : {},
    aliases: uniqueStringList(project.aliases),
    resources: normalizeProjectResources(project.resources),
    createdAt: project.createdAt || project.ts || now,
    updatedAt: project.updatedAt || project.createdAt || project.ts || now
  };
  for (const key of ["archivedAt", "archivedBy"]) {
    if (project[key]) {
      normalized[key] = String(project[key]);
    }
  }
  return normalized;
}

function normalizeProjectStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!PROJECT_STATUSES.includes(value)) {
    throw new Error(`Invalid project status: ${status}. Expected ${PROJECT_STATUSES.join("|")}.`);
  }
  return value;
}

function normalizeProjectResources(resources) {
  if (!isPlainObject(resources)) {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(resources)) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) {
      continue;
    }
    if (Array.isArray(value)) {
      const values = value.map((item) => String(item || "").trim()).filter(Boolean);
      if (values.length > 0) {
        normalized[cleanKey] = values;
      }
      continue;
    }
    if (isPlainObject(value)) {
      normalized[cleanKey] = value;
      continue;
    }
    const text = String(value || "").trim();
    if (text) {
      normalized[cleanKey] = text;
    }
  }
  return normalized;
}

function filterProjects(projects, { status = "all", includeHidden = false } = {}) {
  const cleanStatus = String(status || "all").trim().toLowerCase();
  return projects
    .filter((project) => {
      if (cleanStatus === "all") return true;
      if (cleanStatus === "visible") return isProjectVisible(project);
      normalizeProjectStatus(cleanStatus);
      return project.status === cleanStatus;
    })
    .filter((project) => includeHidden || cleanStatus !== "visible" || !isHiddenProjectId(project.id))
    .sort((a, b) => String(a.displayName || a.name || a.id).localeCompare(String(b.displayName || b.name || b.id), "zh-Hans"));
}

function isProjectVisible(project) {
  return PROJECT_VISIBLE_STATUSES.includes(project.status) && !isHiddenProjectId(project.id);
}

function isHiddenProjectId(id) {
  return String(id || "").toLowerCase().startsWith("test-");
}

function findProject(projects, query) {
  const index = findProjectIndex(projects, query);
  return index === -1 ? null : projects[index];
}

function findProjectIndex(projects, query) {
  const clean = String(query || "").trim();
  if (!clean) {
    return -1;
  }
  const exact = projects.findIndex((project) => project.id === clean);
  if (exact !== -1) {
    return exact;
  }
  const normalized = clean.toLowerCase();
  const alias = projects.findIndex((project) => (
    [project.name, project.displayName, ...(project.aliases || [])]
      .some((value) => String(value || "").toLowerCase() === normalized)
  ));
  if (alias !== -1) {
    return alias;
  }
  const prefixMatches = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => String(project.id || "").toLowerCase().startsWith(normalized));
  return prefixMatches.length === 1 ? prefixMatches[0].index : -1;
}

function parseProjectListOption(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseProjectResourceOptions(argv) {
  const resources = {};
  for (const key of ["feishu", "repo", "docs"]) {
    const value = getOption(argv, `--${key}`);
    if (value !== "") {
      resources[key] = key === "docs" ? parseProjectListOption(value) : value;
    }
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--resource") {
      continue;
    }
    const raw = argv[index + 1] || "";
    const equals = raw.indexOf("=");
    if (equals > 0) {
      const key = raw.slice(0, equals).trim();
      const value = raw.slice(equals + 1).trim();
      if (key && value) {
        resources[key] = value;
      }
    }
  }
  return resources;
}

function uniqueStringList(value) {
  const values = Array.isArray(value) ? value : parseProjectListOption(value);
  const seen = new Set();
  const output = [];
  for (const item of values) {
    const text = String(item || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(text);
  }
  return output;
}

function mergeSeedProjects(projects) {
  const merged = [...projects];
  for (const seed of getSeedProjects()) {
    const identities = uniqueStringList([seed.id, seed.name, seed.displayName, ...(seed.aliases || [])]);
    const exists = identities.some((identity) => findProjectIndex(merged, identity) !== -1);
    if (!exists) {
      merged.push(seed);
    }
  }
  return merged;
}

function getSeedProjects() {
  return [
    {
      id: "base-project",
      name: "base-project",
      displayName: "base-project",
      status: "active",
      type: "game",
      description: "sample-project主题游戏",
      metadata: {},
      aliases: ["sample-project", "base-project(sample-project)"],
      resources: {},
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-06-11T12:00:00Z"
    },
    {
      id: "sample-backend",
      name: "sample-project",
      displayName: "sample-project",
      status: "active",
      type: "game",
      description: "面向55+银发用户的麻将堆叠二消游戏",
      metadata: {
        target: "55+ 银发用户",
        tech: ["Unity", "Luban", "YooAsset", "HybridCLR"]
      },
      aliases: ["sample-project"],
      resources: {
        feishu: "<feishu-folder-url>"
      },
      createdAt: "2026-05-18T00:00:00Z",
      updatedAt: "2026-06-11T12:00:00Z"
    },
    {
      id: "sample-media",
      name: "sample-project",
      displayName: "sample-project",
      status: "active",
      type: "game",
      description: "《sample-project》的西游主题换皮版本",
      metadata: {
        basedOn: "sample-backend",
        relation: "reskin"
      },
      aliases: ["sample-project"],
      resources: {
        feishu: "<feishu-folder-url>",
        repo: "<local-repo-path>"
      },
      createdAt: "2026-06-03T00:00:00Z",
      updatedAt: "2026-06-11T12:00:00Z"
    },
    {
      id: "sample-game",
      name: "sample-game：九九归一",
      displayName: "sample-game",
      status: "paused",
      type: "game",
      description: "81关线性卷轴地图，6种核心玩法综合游戏",
      metadata: {},
      aliases: ["sample-game", "xy_puzzle_collection"],
      resources: {},
      createdAt: "2026-04-01T00:00:00Z",
      updatedAt: "2026-06-11T12:00:00Z"
    },
    {
      id: "ai-memory-hub",
      name: "AI Memory Hub",
      displayName: "AI Memory Hub",
      status: "active",
      type: "tool",
      description: "本地优先的多AI工具共享记忆中心",
      metadata: {},
      aliases: [],
      resources: {
        repo: "https://github.com/<owner>/ai-memory-hub"
      },
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-11T12:00:00Z"
    }
  ].map(normalizeProject);
}

function createWorkflow({ title, createdBy, project, priority, planner, executor, reviewer, observer, plan, acceptance, qualityGate }) {
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
    qualityGate: normalizeQualityGate(qualityGate),
    risks: [],
    results: [],
    reviews: [],
    linkedTasks: [],
    linkedRadio: [],
    notes: []
  };
}

function autoCreateWorkflowNodes(memoryDir, workflow) {
  // Phase 4: Auto-create initial nodes for planner/executor/reviewer when workflow is created
  const nodes = [];

  // Roles are arrays, take first element if present
  const plannerActor = Array.isArray(workflow.planner) && workflow.planner.length > 0 ? workflow.planner[0] : workflow.planner;
  const executorActor = Array.isArray(workflow.executor) && workflow.executor.length > 0 ? workflow.executor[0] : workflow.executor;
  const reviewerActor = Array.isArray(workflow.reviewer) && workflow.reviewer.length > 0 ? workflow.reviewer[0] : workflow.reviewer;

  if (plannerActor) {
    nodes.push({
      slug: "plan",
      label: "Planning phase",
      role: "planner",
      actor: plannerActor,
      status: "running", // planner starts immediately
      isRequired: true
    });
  }

  if (executorActor) {
    nodes.push({
      slug: "exec",
      label: "Execution phase",
      role: "executor",
      actor: executorActor,
      status: "queued", // executor waits for plan
      isRequired: true
    });
  }

  if (reviewerActor) {
    nodes.push({
      slug: "review",
      label: "Review phase",
      role: "reviewer",
      actor: reviewerActor,
      status: "queued", // reviewer waits for execution
      isRequired: !workflow.qualityGate?.reviewOptional // required unless marked optional
    });
  }

  // Create node events
  for (const node of nodes) {
    appendWorkflowNodeEvent(memoryDir, {
      type: "workflow.node",
      workflowId: workflow.id,
      nodeId: `${workflow.id}:${node.slug}`,
      slug: node.slug,
      label: node.label,
      role: node.role,
      actor: node.actor,
      status: node.status,
      ts: new Date().toISOString(),
      note: "Auto-created by workflow creation",
      isRequired: node.isRequired,
      input: {},
      output: {},
      error: ""
    });
  }

  return nodes.length;
}

function updateWorkflow(memoryDir, id, updater) {
  const workflows = readWorkflows(memoryDir);
  const index = findWorkflowIndex(workflows, id);
  if (index === -1) {
    throw new Error(`Workflow not found: ${id}`);
  }
  const updated = normalizeWorkflow(updater(workflows[index]));
  return appendEntityRecord(memoryDir, getWorkflowEventStoreDefinition(), updated, {
    reason: "workflow:update"
  });
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
          priority: workflow.priority,
          qualityGate: workflow.qualityGate
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
  const normalized = {
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
    qualityGate: normalizeQualityGate(workflow),
    risks: Array.isArray(workflow.risks) ? workflow.risks : [],
    results: Array.isArray(workflow.results) ? workflow.results : [],
    reviews: Array.isArray(workflow.reviews) ? workflow.reviews : [],
    linkedTasks: Array.isArray(workflow.linkedTasks) ? workflow.linkedTasks : [],
    linkedRadio: Array.isArray(workflow.linkedRadio) ? workflow.linkedRadio : [],
    deliveryState: workflow.deliveryState || "",
    deliveryUpdatedAt: workflow.deliveryUpdatedAt || "",
    dispatchId: workflow.dispatchId || "",
    threadKey: workflow.threadKey || "",
    gateId: workflow.gateId || "",
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
    worktree: normalizeDispatchWorktreeMetadata(workflow.worktree),
    notes: Array.isArray(workflow.notes) ? workflow.notes : [],
    usesDerivedStatus: Boolean(workflow.usesDerivedStatus),
    derivedStatus: workflow.derivedStatus || ""
  };
  if (isPlainObject(workflow.recipe)) {
    normalized.recipe = normalizeRecipeMetadata(workflow.recipe);
  }
  return normalized;
}

function normalizeWorkflowRole(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function createTask({ title, description, handoff, createdBy, project, priority, qualityGate }) {
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
    qualityGate: normalizeQualityGate(qualityGate),
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
  return appendEntityRecord(memoryDir, getTaskEventStoreDefinition(), updated, {
    reason: "task:update"
  });
}

function normalizeTask(task) {
  const now = new Date().toISOString();
  const status = isTaskStatus(task.status) ? task.status : "open";
  const normalized = {
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
    qualityGate: normalizeQualityGate(task),
    deliveryState: task.deliveryState || "",
    deliveryUpdatedAt: task.deliveryUpdatedAt || "",
    dispatchId: task.dispatchId || "",
    threadKey: task.threadKey || "",
    gateId: task.gateId || "",
    attempt: Number(task.attempt || 0),
    maxRetries: Number(task.maxRetries || 0),
    nextRetryAt: task.nextRetryAt || "",
    sessionId: task.sessionId || "",
    lastError: task.lastError || "",
    progressPercent: task.progressPercent ?? null,
    progressStatus: task.progressStatus || "",
    progressAt: task.progressAt || "",
    progressBy: task.progressBy || "",
    reviewStatus: task.reviewStatus || "",
    reviewedAt: task.reviewedAt || "",
    reviewedBy: task.reviewedBy || "",
    reviewNote: task.reviewNote || "",
    responseRadioId: task.responseRadioId || "",
    statusRadioId: task.statusRadioId || "",
    dispatchReportPath: task.dispatchReportPath || "",
    worktree: normalizeDispatchWorktreeMetadata(task.worktree),
    notes: Array.isArray(task.notes) ? task.notes.map((note) => ({
      ts: note.ts || note.createdAt || now,
      by: note.by || note.source || "unknown",
      text: String(note.text || "")
    })).filter((note) => note.text) : []
  };
  if (isPlainObject(task.recipe)) {
    normalized.recipe = normalizeRecipeMetadata(task.recipe);
  }
  if (isPlainObject(task.recipeStep)) {
    normalized.recipeStep = normalizeRecipeStepMetadata(task.recipeStep);
  }
  return normalized;
}

function normalizeRecipeMetadata(recipe) {
  const normalized = {
    name: String(recipe.name || ""),
    title: String(recipe.title || ""),
    version: String(recipe.version || "")
  };
  if (isPlainObject(recipe.variables)) {
    normalized.variables = Object.fromEntries(
      Object.entries(recipe.variables)
        .map(([key, value]) => [String(key), String(value)])
        .filter(([key]) => key)
    );
  }
  if (Number.isInteger(recipe.steps)) {
    normalized.steps = recipe.steps;
  }
  return normalized;
}

function normalizeRecipeStepMetadata(step) {
  return {
    id: String(step.id || ""),
    role: String(step.role || ""),
    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map((item) => String(item)).filter(Boolean) : [],
    workflowId: String(step.workflowId || "")
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
  return new Set(["open", "claimed", "in_progress", "blocked", "needs_verification", "done", "cancelled"]).has(status);
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
  for (const location of recipeReadLocations(memoryDir)) {
    const file = path.join(location.dir, `${recipeName}.json`);
    if (fs.existsSync(file)) {
      return readJson(file);
    }
  }
  return null;
}

function listRecipes(memoryDir) {
  const recipes = new Map();
  for (const location of recipeListLocations(memoryDir)) {
    if (!fs.existsSync(location.dir)) {
      continue;
    }
    const files = fs.readdirSync(location.dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const recipe = readJson(path.join(location.dir, file));
        const name = recipe.name || path.basename(file, ".json");
        recipes.set(name, {
          name,
          title: recipe.title,
          description: recipe.description,
          version: recipe.version,
          source: location.source,
          roles: Object.keys(recipe.roles || {}),
          steps: (recipe.steps || []).length
        });
      } catch {
        // Skip malformed recipes; recipe validate reports details for explicit names.
      }
    }
  }
  return Array.from(recipes.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function recipeReadLocations(memoryDir) {
  return [
    { source: "user", dir: path.join(memoryDir, "recipes") },
    { source: "builtin", dir: path.join(projectRoot(), "recipes") }
  ];
}

function recipeListLocations(memoryDir) {
  return [
    { source: "builtin", dir: path.join(projectRoot(), "recipes") },
    { source: "user", dir: path.join(memoryDir, "recipes") }
  ];
}

function hasOwnField(source, field) {
  return Object.prototype.hasOwnProperty.call(source, field);
}

function extractQualityGate(source) {
  const gate = {};
  if (!isPlainObject(source)) {
    return gate;
  }
  if (isPlainObject(source.qualityGate)) {
    Object.assign(gate, source.qualityGate);
  }
  if (isPlainObject(source.gates)) {
    Object.assign(gate, source.gates);
  }
  for (const field of RECIPE_GATE_FIELDS) {
    if (hasOwnField(source, field)) {
      gate[field] = source[field];
    }
  }
  return gate;
}

function normalizeQualityGate(source) {
  const gate = {};
  const extracted = extractQualityGate(source);
  if (!isPlainObject(extracted)) {
    return gate;
  }
  if (Array.isArray(extracted.verifyCommands)) {
    const verifyCommands = extracted.verifyCommands.map(normalizeVerifyCommand).filter(Boolean);
    if (verifyCommands.length > 0) {
      gate.verifyCommands = verifyCommands;
    }
  }
  for (const field of RECIPE_GATE_STRING_ARRAY_FIELDS) {
    if (Array.isArray(extracted[field])) {
      const values = extracted[field].map((item) => String(item).trim()).filter(Boolean);
      if (values.length > 0) {
        gate[field] = values;
      }
    }
  }
  if (typeof extracted.reviewRequired === "boolean") {
    gate.reviewRequired = extracted.reviewRequired;
  }
  const maxRepairAttempts = normalizeNonNegativeInteger(extracted.maxRepairAttempts);
  if (maxRepairAttempts !== null) {
    gate.maxRepairAttempts = maxRepairAttempts;
  }
  if (isPlainObject(extracted.minimalImplementation)) {
    gate.minimalImplementation = normalizeMinimalImplementation(extracted.minimalImplementation);
  }
  if (isPlainObject(extracted.dependencyBudget)) {
    gate.dependencyBudget = normalizeDependencyBudget(extracted.dependencyBudget);
  }
  return gate;
}

function mergeQualityGates(...sources) {
  const merged = {};
  for (const source of sources) {
    Object.assign(merged, normalizeQualityGate(source));
  }
  return merged;
}

function validateQualityGateFields(source, label) {
  if (!isPlainObject(source)) {
    return { valid: false, error: `${label} must be an object` };
  }
  if (hasOwnField(source, "verifyCommands")) {
    if (!Array.isArray(source.verifyCommands)) {
      return { valid: false, error: `${label}.verifyCommands must be an array` };
    }
    for (const [index, command] of source.verifyCommands.entries()) {
      const validation = validateVerifyCommand(command, `${label}.verifyCommands[${index}]`);
      if (!validation.valid) {
        return validation;
      }
    }
  }
  for (const field of RECIPE_GATE_STRING_ARRAY_FIELDS) {
    if (hasOwnField(source, field)) {
      if (!Array.isArray(source[field]) || source[field].some((item) => typeof item !== "string" || item.trim() === "")) {
        return { valid: false, error: `${label}.${field} must be an array of non-empty strings` };
      }
    }
  }
  if (hasOwnField(source, "reviewRequired") && typeof source.reviewRequired !== "boolean") {
    return { valid: false, error: `${label}.reviewRequired must be a boolean` };
  }
  if (hasOwnField(source, "maxRepairAttempts") && (!Number.isInteger(source.maxRepairAttempts) || source.maxRepairAttempts < 0)) {
    return { valid: false, error: `${label}.maxRepairAttempts must be a non-negative integer` };
  }
  if (hasOwnField(source, "minimalImplementation")) {
    const validation = validateMinimalImplementation(source.minimalImplementation, `${label}.minimalImplementation`);
    if (!validation.valid) {
      return validation;
    }
  }
  if (hasOwnField(source, "dependencyBudget")) {
    const validation = validateDependencyBudget(source.dependencyBudget, `${label}.dependencyBudget`);
    if (!validation.valid) {
      return validation;
    }
  }
  return { valid: true };
}

function normalizeVerifyCommand(value) {
  if (typeof value === "string") {
    const command = value.trim();
    return command ? { command, args: [] } : null;
  }
  if (!isPlainObject(value)) {
    return null;
  }
  const id = String(value.id || "").trim();
  const source = String(value.source || "").trim();
  const command = String(value.command || "").trim();
  if (!id && !source && !command) {
    return null;
  }
  const normalized = {};
  if (id) normalized.id = id;
  if (source) normalized.source = source;
  if (command) normalized.command = command;
  if (Array.isArray(value.args)) {
    normalized.args = value.args.map((arg) => String(arg));
  } else if (command) {
    normalized.args = [];
  }
  if (value.cwd) {
    normalized.cwd = String(value.cwd);
  }
  if (Number.isInteger(value.timeoutMs) && value.timeoutMs > 0) {
    normalized.timeoutMs = value.timeoutMs;
  }
  if (typeof value.required === "boolean") {
    normalized.required = value.required;
  }
  if (value.description) {
    normalized.description = String(value.description);
  }
  return normalized;
}

function validateVerifyCommand(command, label) {
  if (typeof command === "string") {
    return command.trim()
      ? { valid: true }
      : { valid: false, error: `${label} must be a non-empty command string` };
  }
  if (!isPlainObject(command)) {
    return { valid: false, error: `${label} must be a command string or object` };
  }
  const hasCommandTarget = ["id", "source", "command"].some((field) => (
    typeof command[field] === "string" && command[field].trim()
  ));
  if (!hasCommandTarget) {
    return { valid: false, error: `${label} must define id, source, or command` };
  }
  if (hasOwnField(command, "args") && !Array.isArray(command.args)) {
    return { valid: false, error: `${label}.args must be an array` };
  }
  if (hasOwnField(command, "timeoutMs") && (!Number.isInteger(command.timeoutMs) || command.timeoutMs <= 0)) {
    return { valid: false, error: `${label}.timeoutMs must be a positive integer` };
  }
  if (hasOwnField(command, "required") && typeof command.required !== "boolean") {
    return { valid: false, error: `${label}.required must be a boolean` };
  }
  return { valid: true };
}

function normalizeNonNegativeInteger(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function normalizeMinimalImplementation(source) {
  if (!isPlainObject(source)) {
    return {};
  }
  const normalized = {};
  if (typeof source.enabled === "boolean") {
    normalized.enabled = source.enabled;
  }
  if (Array.isArray(source.principles)) {
    const principles = source.principles.map((item) => String(item).trim()).filter(Boolean);
    if (principles.length > 0) {
      normalized.principles = principles;
    }
  }
  if (Array.isArray(source.forbiddenPatterns)) {
    const patterns = source.forbiddenPatterns.map((item) => String(item).trim()).filter(Boolean);
    if (patterns.length > 0) {
      normalized.forbiddenPatterns = patterns;
    }
  }
  const maxNewFiles = normalizeNonNegativeInteger(source.maxNewFiles);
  if (maxNewFiles !== null) {
    normalized.maxNewFiles = maxNewFiles;
  }
  const maxLinesPerFile = normalizeNonNegativeInteger(source.maxLinesPerFile);
  if (maxLinesPerFile !== null) {
    normalized.maxLinesPerFile = maxLinesPerFile;
  }
  return normalized;
}

function normalizeDependencyBudget(source) {
  if (!isPlainObject(source)) {
    return {};
  }
  const normalized = {};
  if (typeof source.enabled === "boolean") {
    normalized.enabled = source.enabled;
  }
  const maxNewDependencies = normalizeNonNegativeInteger(source.maxNewDependencies);
  if (maxNewDependencies !== null) {
    normalized.maxNewDependencies = maxNewDependencies;
  }
  const maxTotalSizeMB = normalizeNonNegativeInteger(source.maxTotalSizeMB);
  if (maxTotalSizeMB !== null) {
    normalized.maxTotalSizeMB = maxTotalSizeMB;
  }
  if (Array.isArray(source.allowedScopes)) {
    const scopes = source.allowedScopes.map((item) => String(item).trim()).filter(Boolean);
    if (scopes.length > 0) {
      normalized.allowedScopes = scopes;
    }
  }
  if (Array.isArray(source.forbiddenPackages)) {
    const packages = source.forbiddenPackages.map((item) => String(item).trim()).filter(Boolean);
    if (packages.length > 0) {
      normalized.forbiddenPackages = packages;
    }
  }
  if (typeof source.requireJustification === "boolean") {
    normalized.requireJustification = source.requireJustification;
  }
  return normalized;
}

function validateMinimalImplementation(source, label) {
  if (!isPlainObject(source)) {
    return { valid: false, error: `${label} must be an object` };
  }
  if (hasOwnField(source, "enabled") && typeof source.enabled !== "boolean") {
    return { valid: false, error: `${label}.enabled must be a boolean` };
  }
  if (hasOwnField(source, "principles")) {
    if (!Array.isArray(source.principles) || source.principles.some((item) => typeof item !== "string" || item.trim() === "")) {
      return { valid: false, error: `${label}.principles must be an array of non-empty strings` };
    }
  }
  if (hasOwnField(source, "forbiddenPatterns")) {
    if (!Array.isArray(source.forbiddenPatterns) || source.forbiddenPatterns.some((item) => typeof item !== "string" || item.trim() === "")) {
      return { valid: false, error: `${label}.forbiddenPatterns must be an array of non-empty strings` };
    }
  }
  if (hasOwnField(source, "maxNewFiles") && (!Number.isInteger(source.maxNewFiles) || source.maxNewFiles < 0)) {
    return { valid: false, error: `${label}.maxNewFiles must be a non-negative integer` };
  }
  if (hasOwnField(source, "maxLinesPerFile") && (!Number.isInteger(source.maxLinesPerFile) || source.maxLinesPerFile < 0)) {
    return { valid: false, error: `${label}.maxLinesPerFile must be a non-negative integer` };
  }
  return { valid: true };
}

function validateDependencyBudget(source, label) {
  if (!isPlainObject(source)) {
    return { valid: false, error: `${label} must be an object` };
  }
  if (hasOwnField(source, "enabled") && typeof source.enabled !== "boolean") {
    return { valid: false, error: `${label}.enabled must be a boolean` };
  }
  if (hasOwnField(source, "maxNewDependencies") && (!Number.isInteger(source.maxNewDependencies) || source.maxNewDependencies < 0)) {
    return { valid: false, error: `${label}.maxNewDependencies must be a non-negative integer` };
  }
  if (hasOwnField(source, "maxTotalSizeMB") && (!Number.isInteger(source.maxTotalSizeMB) || source.maxTotalSizeMB < 0)) {
    return { valid: false, error: `${label}.maxTotalSizeMB must be a non-negative integer` };
  }
  if (hasOwnField(source, "allowedScopes")) {
    if (!Array.isArray(source.allowedScopes) || source.allowedScopes.some((item) => typeof item !== "string" || item.trim() === "")) {
      return { valid: false, error: `${label}.allowedScopes must be an array of non-empty strings` };
    }
  }
  if (hasOwnField(source, "forbiddenPackages")) {
    if (!Array.isArray(source.forbiddenPackages) || source.forbiddenPackages.some((item) => typeof item !== "string" || item.trim() === "")) {
      return { valid: false, error: `${label}.forbiddenPackages must be an array of non-empty strings` };
    }
  }
  if (hasOwnField(source, "requireJustification") && typeof source.requireJustification !== "boolean") {
    return { valid: false, error: `${label}.requireJustification must be a boolean` };
  }
  return { valid: true };
}


function validateQualityGate(source, label) {
  if (!isPlainObject(source)) {
    return { valid: true };
  }
  for (const containerField of ["qualityGate", "gates"]) {
    if (hasOwnField(source, containerField)) {
      const validation = validateQualityGateFields(source[containerField], `${label}.${containerField}`);
      if (!validation.valid) {
        return validation;
      }
    }
  }
  const directFields = {};
  for (const field of RECIPE_GATE_FIELDS) {
    if (hasOwnField(source, field)) {
      directFields[field] = source[field];
    }
  }
  if (Object.keys(directFields).length > 0) {
    const validation = validateQualityGateFields(directFields, label);
    if (!validation.valid) {
      return validation;
    }
  }
  return { valid: true };
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

  const recipeGateValidation = validateQualityGate(recipe, "Recipe");
  if (!recipeGateValidation.valid) {
    return recipeGateValidation;
  }

  // Check all step roles are defined
  for (const step of recipe.steps) {
    if (!step.id || !step.task) {
      return { valid: false, error: "Recipe steps must have id and task" };
    }
    if (!recipe.roles[step.role]) {
      return { valid: false, error: `Step ${step.id} references undefined role: ${step.role}` };
    }
    if (step.dependsOn && (!Array.isArray(step.dependsOn) || step.dependsOn.some((depId) => typeof depId !== "string" || depId.trim() === ""))) {
      return { valid: false, error: `Step ${step.id} dependsOn must be an array of non-empty strings` };
    }
    const stepGateValidation = validateQualityGate(step, `Step ${step.id}`);
    if (!stepGateValidation.valid) {
      return stepGateValidation;
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
  const roleNames = Object.keys(recipe.roles);
  const recipeGateInput = extractQualityGate(recipe);
  const maxRepairAttempts = normalizeNonNegativeInteger(vars.maxRepairAttempts);
  if (maxRepairAttempts !== null && Object.keys(recipeGateInput).length > 0) {
    recipeGateInput.maxRepairAttempts = maxRepairAttempts;
  }
  const recipeGate = normalizeQualityGate(recipeGateInput);
  const recipeMetadata = normalizeRecipeMetadata({
    name: recipe.name || recipeName,
    title: recipe.title,
    version: recipe.version,
    variables: vars,
    steps: recipe.steps.length
  });

  // Create workflow
  const workflow = createWorkflow({
    title: `${recipe.title} - ${vars.project || 'default'}`,
    createdBy: "recipe",
    project: vars.project || "",
    priority: vars.priority || "normal",
    planner: toolMapping.planner || toolMapping[roleNames[0]] || "",
    executor: toolMapping.executor || toolMapping[roleNames[1]] || "",
    reviewer: toolMapping.reviewer || toolMapping[roleNames[2]] || "",
    observer: toolMapping.observer || toolMapping[roleNames[3]] || "",
    plan: `Recipe: ${recipeName}\nSteps: ${recipe.steps.length}`,
    acceptance: recipe.description || ""
  });
  workflow.recipe = recipeMetadata;
  if (Object.keys(recipeGate).length > 0) {
    workflow.qualityGate = recipeGate;
  }

  const workflows = readWorkflows(memoryDir);
  workflows.push(workflow);
  writeWorkflows(memoryDir, workflows);

  // Phase 4: Auto-create workflow nodes
  autoCreateWorkflowNodes(memoryDir, workflow);

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
    task.recipe = recipeMetadata;
    task.recipeStep = normalizeRecipeStepMetadata({
      id: step.id,
      role: step.role,
      dependsOn: step.dependsOn,
      workflowId: workflow.id
    });
    const stepGate = mergeQualityGates(recipeGate, extractQualityGate(step));
    if (Object.keys(stepGate).length > 0) {
      task.qualityGate = stepGate;
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
    const values = normalizeRefValues(refs[key]).map(sanitizeInlineText).filter(Boolean).slice(0, 3);
    if (values.length > 0) {
      parts.push(`${key}=${values.join(",")}`);
    }
  }
  return parts.join(" ");
}

function parseMemoryFilters(argv) {
  return {
    project: getOption(argv, "--project") || "",
    tags: parseMemoryTagFilters(argv),
    thread: getOption(argv, "--thread") || "",
    taskId: getOption(argv, "--task") || getOption(argv, "--task-id") || "",
    workflowId: getOption(argv, "--workflow") || getOption(argv, "--workflow-id") || "",
    radioId: getOption(argv, "--radio") || getOption(argv, "--radio-id") || ""
  };
}

function parseMemoryTagFilters(argv) {
  return normalizeList([
    getOption(argv, "--tag"),
    getOption(argv, "--tags")
  ]);
}

function hasMemoryFilters(filters = {}) {
  return Boolean(
    filters.project ||
    (filters.tags && filters.tags.length > 0) ||
    filters.thread ||
    filters.taskId ||
    filters.workflowId ||
    filters.radioId
  );
}

function formatMemoryFilterSummary(filters = {}) {
  const parts = [];
  if (filters.project) {
    parts.push(`project=${normalizeMemoryProject(filters.project)}`);
  }
  if (filters.tags?.length) {
    parts.push(`tags=${filters.tags.join(",")}`);
  }
  if (filters.thread) {
    parts.push(`thread=${normalizeRefToken(filters.thread)}`);
  }
  if (filters.taskId) {
    parts.push(`taskId=${normalizeRefToken(filters.taskId)}`);
  }
  if (filters.workflowId) {
    parts.push(`workflowId=${normalizeRefToken(filters.workflowId)}`);
  }
  if (filters.radioId) {
    parts.push(`radioId=${normalizeRefToken(filters.radioId)}`);
  }
  return parts.join(" ");
}

function filterMemoryRecords(records, filters = {}) {
  return records
    .filter((record) => filters.project ? record.project === normalizeMemoryProject(filters.project) : true)
    .filter((record) => matchesMemoryTags(record, filters.tags))
    .filter((record) => matchesMemoryRef(record, "thread", filters.thread))
    .filter((record) => matchesMemoryRef(record, "taskId", filters.taskId))
    .filter((record) => matchesMemoryRef(record, "workflowId", filters.workflowId))
    .filter((record) => matchesMemoryRef(record, "radioId", filters.radioId));
}

function matchesMemoryTags(memory, queryTags = []) {
  const requested = normalizeList(queryTags);
  if (requested.length === 0) {
    return true;
  }
  const candidates = normalizeList(memory.tags?.length ? memory.tags : memory.metadata?.tags);
  return requested.every((tag) => candidates.includes(tag));
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

function recordMemoryAccess(ledger, results, accessedAt = new Date().toISOString()) {
  const resultKeys = new Set(results.flatMap((result) => getMemoryIdentityKeys(result)));
  if (resultKeys.size === 0) {
    return { ledger, updated: 0 };
  }

  let updated = 0;
  const updatedLedger = ledger.map((record) => {
    const matched = getMemoryIdentityKeys(record).some((key) => resultKeys.has(key));
    if (!matched) {
      return record;
    }
    updated++;
    return touchMemoryAccess(record, accessedAt);
  });

  return { ledger: updatedLedger, updated };
}

function touchMemoryAccess(record, accessedAt = new Date().toISOString()) {
  const current = getMemoryAccessStats(record);
  const access = {
    ...current,
    accessCount: current.accessCount + 1,
    firstAccessedAt: current.firstAccessedAt || accessedAt,
    lastAccessedAt: normalizeMemoryAccessTimestamp(accessedAt),
    hasAccessTelemetry: true
  };
  const metadata = mergeMemoryAccessMetadata(record.metadata || {}, access);
  return applyMemoryAccessFields({ ...record, metadata }, access);
}

function getMemoryAccessStats(memory = {}) {
  const lifecycle = isPlainObject(memory.metadata?.lifecycle) ? memory.metadata.lifecycle : {};
  const lifecycleAccess = isPlainObject(lifecycle.access) ? lifecycle.access : {};
  const accessCountValue = firstDefinedValue(
    memory.accessCount,
    memory.metadata?.accessCount,
    lifecycleAccess.accessCount,
    lifecycleAccess.count
  );
  const firstAccessedAt = normalizeMemoryAccessTimestamp(firstDefinedValue(
    memory.firstAccessedAt,
    memory.metadata?.firstAccessedAt,
    lifecycleAccess.firstAccessedAt
  ));
  const lastAccessedAt = normalizeMemoryAccessTimestamp(firstDefinedValue(
    memory.lastAccessedAt,
    memory.metadata?.lastAccessedAt,
    lifecycleAccess.lastAccessedAt
  ));
  const hasAccessTelemetry = [
    memory.accessCount,
    memory.lastAccessedAt,
    memory.firstAccessedAt,
    memory.metadata?.accessCount,
    memory.metadata?.lastAccessedAt,
    memory.metadata?.firstAccessedAt,
    lifecycleAccess.accessCount,
    lifecycleAccess.count,
    lifecycleAccess.lastAccessedAt,
    lifecycleAccess.firstAccessedAt
  ].some((value) => value !== undefined && value !== null && value !== "");

  return {
    accessCount: normalizeMemoryAccessCount(accessCountValue),
    firstAccessedAt,
    lastAccessedAt,
    hasAccessTelemetry
  };
}

function mergeMemoryAccessMetadata(metadata = {}, access = {}, derived = {}) {
  if (!access.hasAccessTelemetry) {
    return metadata;
  }
  const lifecycle = isPlainObject(metadata.lifecycle) ? metadata.lifecycle : {};
  const lifecycleAccess = isPlainObject(lifecycle.access) ? lifecycle.access : {};
  return {
    ...metadata,
    lifecycle: {
      ...lifecycle,
      access: {
        ...lifecycleAccess,
        accessCount: access.accessCount,
        count: access.accessCount,
        ...(access.firstAccessedAt ? { firstAccessedAt: access.firstAccessedAt } : {}),
        ...(access.lastAccessedAt ? { lastAccessedAt: access.lastAccessedAt } : {}),
        ...(derived.heat !== undefined ? { heat: Number(derived.heat || 0) } : {}),
        ...(derived.stalePenalty !== undefined ? { stalePenalty: Number(derived.stalePenalty || 0) } : {})
      }
    }
  };
}

function applyMemoryAccessFields(record, access = {}) {
  if (!access.hasAccessTelemetry) {
    return record;
  }
  return {
    ...record,
    accessCount: access.accessCount,
    ...(access.firstAccessedAt ? { firstAccessedAt: access.firstAccessedAt } : {}),
    lastAccessedAt: access.lastAccessedAt || ""
  };
}

function normalizeMemoryAccessCount(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }
  return Math.floor(count);
}

function normalizeMemoryAccessTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString();
}

function firstDefinedValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function scoreMemoryAccessHeat(access = {}) {
  const count = normalizeMemoryAccessCount(access.accessCount);
  if (count <= 0) {
    return 0;
  }
  const countBoost = Math.min(MEMORY_ACCESS_MAX_HEAT, Math.log2(count + 1) * 3);
  const daysSinceAccess = getDaysSinceTimestamp(access.lastAccessedAt);
  const recencyBoost = access.lastAccessedAt && daysSinceAccess <= MEMORY_ACCESS_RECENT_DAYS ? 2 : 0;
  return Math.min(MEMORY_ACCESS_MAX_HEAT, Math.round(countBoost + recencyBoost));
}

function scoreStaleMemoryAccessPenalty(access = {}) {
  if (!access.hasAccessTelemetry || !access.lastAccessedAt) {
    return 0;
  }
  const daysSinceAccess = getDaysSinceTimestamp(access.lastAccessedAt);
  if (daysSinceAccess <= MEMORY_ACCESS_STALE_AFTER_DAYS) {
    return 0;
  }
  return Math.min(
    MEMORY_ACCESS_MAX_STALE_PENALTY,
    Math.ceil((daysSinceAccess - MEMORY_ACCESS_STALE_AFTER_DAYS) * MEMORY_ACCESS_STALE_DECAY_RATE_PER_DAY)
  );
}

function getDaysSinceTimestamp(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) {
    return 0;
  }
  return Math.max(0, (Date.now() - time) / 86400000);
}

function rebuildMemoryOutputs(config, ledger) {
  const index = buildMemoryIndex(ledger, config);
  fs.writeFileSync(path.join(config.memoryDir, "MEMORY.md"), renderMemorySnapshot(index, config), "utf8");
  fs.writeFileSync(path.join(config.memoryDir, "BOOTSTRAP.md"), renderBootstrapSnapshot(index, config), "utf8");
  fs.writeFileSync(path.join(config.memoryDir, "INDEX.md"), renderIndexMarkdown(index), "utf8");
  writeJson(path.join(config.memoryDir, "memories", "index.json"), index);
}

function buildMemoryIndex(memories, config) {
  const sorted = [...memories].sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  const enrichedRecords = sorted.map((memory, index) => enrichMemory(memory, index, sorted.length));
  const supersededBy = buildMemorySupersededBy(enrichedRecords);
  const records = enrichedRecords.map((record) => applyMemorySupersedeState(record, supersededBy));
  const snapshotLimits = resolveSnapshotLimits(config);
  const stats = {
    records: records.length,
    core: records.filter((item) => item.layer === "core").length,
    working: records.filter((item) => item.layer === "working").length,
    archive: records.filter((item) => item.layer === "archive").length,
    snapshotLimit: snapshotLimits.snapshotLimit,
    snapshotCoreLimit: snapshotLimits.coreLimit,
    snapshotRecentLimit: snapshotLimits.recentLimit,
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
  const access = getMemoryAccessStats(canonicalMemory);
  const accessHeat = scoreMemoryAccessHeat(access);
  const staleAccessPenalty = scoreStaleMemoryAccessPenalty(access);
  const importance = scoreImportance(canonicalMemory, topics, ordinal, total, {
    accessHeat,
    staleAccessPenalty
  });
  const confidence = normalizeConfidence(metadata.confidence);
  const staleWorkingContext = isStaleOperationalRadioMemory(canonicalMemory, memory.text);
  const layer = staleWorkingContext ? "archive" : chooseMemoryLayer(kind, importance);
  const scope = normalizeMemoryScope(metadata.scope) || inferScope(kind, topics, project);
  const enrichedMetadata = mergeMemoryAccessMetadata({
    ...metadata,
    kind,
    project,
    tags,
    scope,
    confidence,
    staleWorkingContext,
    refs
  }, access, { heat: accessHeat, stalePenalty: staleAccessPenalty });
  return {
    ...memory,
    schemaVersion: 2,
    kind,
    project,
    tags,
    refs,
    confidence,
    metadata: enrichedMetadata,
    layer,
    importance,
    accessCount: access.accessCount,
    lastAccessedAt: access.lastAccessedAt,
    accessHeat,
    staleAccessPenalty,
    staleWorkingContext,
    scope,
    topics,
    keywords: extractKeywords(`${memory.text} ${project} ${tags.join(" ")} ${flattenMemoryRefs(refs).join(" ")} ${(topics || []).join(" ")}`)
  };
}

function buildMemorySupersededBy(records) {
  const lookup = new Map();
  for (const record of records) {
    for (const key of getMemoryIdentityKeys(record)) {
      if (!lookup.has(key)) {
        lookup.set(key, record);
      }
    }
  }

  const supersededBy = new Map();
  for (const superseder of records) {
    const refs = getMemorySupersedesRefs(superseder);
    for (const ref of refs) {
      const target = lookup.get(ref);
      if (!target || target === superseder) {
        continue;
      }
      const targetKey = getMemoryPrimaryKey(target);
      if (!targetKey) {
        continue;
      }
      const supersederRef = getMemoryPrimaryKey(superseder);
      const existing = supersededBy.get(targetKey) || [];
      if (supersederRef && !existing.includes(supersederRef)) {
        existing.push(supersederRef);
      }
      supersededBy.set(targetKey, existing);
    }
  }
  return supersededBy;
}

function applyMemorySupersedeState(record, supersededBy) {
  const supersededByRefs = supersededBy.get(getMemoryPrimaryKey(record)) || [];
  if (supersededByRefs.length === 0) {
    return record;
  }
  const importance = Math.max(1, Number(record.importance || 0) - 50);
  return {
    ...record,
    superseded: true,
    supersededBy: supersededByRefs,
    importance,
    layer: "archive",
    metadata: {
      ...record.metadata,
      superseded: true,
      supersededBy: supersededByRefs,
      lifecycle: {
        ...(record.metadata?.lifecycle || {}),
        superseded: true,
        supersededBy: supersededByRefs
      }
    }
  };
}

function getMemorySupersedesRefs(record) {
  return normalizeSupersedeRefs(record.metadata?.supersedes || record.supersedes || record.metadata?.lifecycle?.supersedes);
}

function getMemoryPrimaryKey(record) {
  return getMemoryIdentityKeys(record)[0] || "";
}

function getMemoryIdentityKeys(record) {
  return [
    record.localEventId,
    record.id,
    record.metadata?.localEventId,
    record.metadata?.id,
    record.metadata?.stableId,
    record.metadata?.key,
    ...flattenMemoryRefs(record.refs || record.metadata?.refs)
  ]
    .map(normalizeSupersedeToken)
    .filter(Boolean);
}

function normalizeSupersedeRefs(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(normalizeSupersedeRefs))];
  }
  if (isPlainObject(value)) {
    return normalizeSupersedeRefs(Object.values(value));
  }
  return String(value || "")
    .split(",")
    .map(normalizeSupersedeToken)
    .filter(Boolean);
}

function normalizeSupersedeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function renderMemorySnapshot(index, config, options = {}) {
  const snapshotLimits = resolveSnapshotLimits(config);
  const coreLimit = snapshotLimits.coreLimit;
  const recentLimit = snapshotLimits.recentLimit;
  const totalLimit = Number(options.limit || snapshotLimits.snapshotLimit || 0);
  const visibleRecords = index.records.filter((item) => !item.superseded);
  const startup = selectStartupMemoryRecords(visibleRecords, config);
  const startupKeys = new Set(startup.map(getMemoryRecordStableKey).filter(Boolean));
  const allCore = visibleRecords
    .filter((item) => item.layer === "core" && !startupKeys.has(getMemoryRecordStableKey(item)))
    .sort(sortByImportance);
  const allRecent = [...visibleRecords]
    .filter((item) => item.layer === "working" && !startupKeys.has(getMemoryRecordStableKey(item)))
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  let core = allCore.slice(0, coreLimit);
  let recent = allRecent.slice(0, recentLimit);
  if (totalLimit > 0) {
    core = allCore.slice(0, Math.min(coreLimit, totalLimit));
    const remaining = Math.max(0, totalLimit - core.length);
    recent = allRecent.slice(0, Math.min(recentLimit, remaining));
  }
  const lines = [
    "# Shared AI Memory",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "This snapshot is intentionally short. Full local history is in `memories/ledger.jsonl`; structured search data is in `memories/index.json`; readable grouped index is in `INDEX.md`.",
    "",
    "Use `ai-memory-hub search <query> --limit 10` when task-specific context is needed.",
    "",
    "Startup-critical records are repeated in `BOOTSTRAP.md` and pinned below.",
    ""
  ];
  if (options.filterSummary) {
    lines.push(`Filtered view: ${options.filterSummary}.`);
    lines.push("");
  }
  if (visibleRecords.length === 0) {
    lines.push("No memories found.");
    lines.push("");
    return lines.join("\n");
  }

  if (startup.length > 0) {
    lines.push("## Startup Essentials");
    lines.push("");
    for (const memory of startup) {
      lines.push(renderMemoryLine(memory));
    }
    lines.push("");
  }

  lines.push("## Core Memory");
  lines.push("");
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

function renderEmptyBootstrapSnapshot(memoryDir) {
  return [
    "# AI Memory Hub Bootstrap",
    "",
    "Memory directory: configured locally.",
    "",
    "No startup-critical memories have been indexed yet.",
    "",
    "If an instruction include such as `@RTK.md` is missing, run `ai-memory-hub resolve \"@RTK.md\"` and then use the resolved local path when reading the include.",
    ""
  ].join("\n");
}

function renderBootstrapSnapshot(index, config) {
  const startup = selectStartupMemoryRecords(index.records || [], config);
  const lines = [
    "# AI Memory Hub Bootstrap",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "This file repeats startup-critical records that should remain reachable even when `MEMORY.md` is compacted.",
    "",
    "If an instruction include such as `@RTK.md` is missing, run `ai-memory-hub resolve \"@RTK.md\"` and then use the resolved local path when reading the include.",
    "",
    "## Startup Essentials",
    ""
  ];
  if (startup.length === 0) {
    lines.push("- No startup-critical memories found.");
  } else {
    for (const memory of startup) {
      lines.push(renderMemoryLine(memory));
    }
  }
  lines.push("");
  return lines.join("\n");
}

function selectStartupMemoryRecords(records = [], _config = {}) {
  return [...records]
    .filter((record) => !record.superseded && isStartupMemoryRecord(record))
    .sort(sortByImportance)
    .slice(0, STARTUP_MEMORY_LIMIT);
}

function isStartupMemoryRecord(record) {
  const tags = normalizeList(record.tags?.length ? record.tags : record.metadata?.tags);
  const scope = normalizeMemoryScope(record.scope || record.metadata?.scope || "");
  const kind = normalizeMemoryKind(record.kind || record.metadata?.kind || "note");
  const text = String(record.text || "");
  if (tags.some((tag) => ["startup", "bootstrap", "boot", "agent-startup", "critical", "pinned"].includes(tag))) {
    return true;
  }
  if (["startup", "bootstrap", "agent-startup"].includes(scope)) {
    return true;
  }
  if (!["preference", "workflow", "correction", "project", "lesson", "reference"].includes(kind)) {
    return false;
  }
  return /RTK\.md|AGENTS\.md|CLAUDE\.md|GEMINI\.md|@include|@引用|Shared AI Memory|Shared Agent Radio|Shared Task List|Shared Workflows|ai-memory-hub search|inbox\/events\.jsonl|memories\/ledger\.jsonl|MEMORY\.md|共享记忆|共同记忆|启动|启动关键|指令/i.test(text);
}

function getMemoryRecordStableKey(record) {
  return getMemoryPrimaryKey(record) || record.id || record.localEventId || record.text || "";
}

function resolveSnapshotLimits(config = {}) {
  const snapshotLimit = readPositiveInteger(config.sync?.snapshotLimit, 120);
  const explicitCoreLimit = hasExplicitSyncKey(config, "coreLimit");
  const explicitRecentLimit = hasExplicitSyncKey(config, "recentLimit");
  return {
    snapshotLimit,
    coreLimit: explicitCoreLimit
      ? readPositiveInteger(config.sync.coreLimit, 30)
      : Math.max(10, Math.round(snapshotLimit * 0.25)),
    recentLimit: explicitRecentLimit
      ? readPositiveInteger(config.sync.recentLimit, 18)
      : Math.max(5, Math.round(snapshotLimit * 0.15))
  };
}

function hasExplicitSyncKey(config, key) {
  const explicitKeys = config.sync?._explicitKeys;
  if (explicitKeys instanceof Set) {
    return explicitKeys.has(key);
  }
  return Boolean(config.sync && Object.hasOwn(config.sync, key));
}

function readPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
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

function renderMemoryHealthReport(config, index, options = {}) {
  const analysis = options.analysis || analyzeMemoryHealth(config, index, options);
  const lines = [
    "# AI Memory Hub Health Report",
    "",
    `Generated at ${analysis.generatedAt}.`,
    "",
    "## Summary",
    "",
    `- Health score: ${analysis.score}/100 (${analysis.status})`,
    `- Memory records: ${analysis.totalRecords}`,
    `- Duplicate records: ${analysis.duplicateRecords} (${formatPercent(analysis.duplicateRate)})`,
    `- Corrupted records: ${analysis.corruptedRecords.length}`,
    `- Storage used: ${formatBytes(analysis.storage.totalBytes)}`,
    "",
    "## Distribution",
    "",
    `- Layers: core ${index.stats.core}, working ${index.stats.working}, archive ${index.stats.archive}`,
    `- Kinds: ${formatTopCounts(index.kinds, 8)}`,
    `- Projects: ${formatTopCounts(index.projects, 8)}`,
    `- Tags: ${formatTopCounts(index.tags, 8)}`,
    `- Topics: ${formatTopCounts(index.topics, 8)}`,
    "",
    "## Growth Trend",
    ""
  ];

  if (analysis.growthTrend.length === 0) {
    lines.push("- No dated records found.");
  } else {
    for (const item of analysis.growthTrend) {
      lines.push(`- ${item.date}: ${item.count}`);
    }
  }

  lines.push("");
  lines.push("## Storage");
  lines.push("");
  for (const item of analysis.storage.items) {
    lines.push(`- ${item.label}: ${formatBytes(item.bytes)}`);
  }

  lines.push("");
  lines.push("## Issues");
  lines.push("");
  if (analysis.issues.length === 0) {
    lines.push("- No optimization issues detected.");
  } else {
    for (const issue of analysis.issues) {
      lines.push(`- **${issue.level}** ${issue.title}: ${issue.detail}`);
    }
  }

  lines.push("");
  lines.push("## Recommended Actions");
  lines.push("");
  if (analysis.repairSuggestions.length === 0) {
    lines.push("- No repair actions suggested.");
  } else {
    for (const action of analysis.repairSuggestions) {
      const command = action.command ? ` Command: \`${action.command}\`.` : "";
      lines.push(`- ${action.label}: ${action.detail}${command}`);
    }
  }

  if (analysis.duplicateGroups.length > 0) {
    lines.push("");
    lines.push("## Duplicate Examples");
    lines.push("");
    for (const group of analysis.duplicateGroups.slice(0, analysis.issueLimit)) {
      lines.push(`- ${group.count}x ${group.example}`);
    }
  }

  if (analysis.corruptedRecords.length > 0) {
    lines.push("");
    lines.push("## Corrupted Record Examples");
    lines.push("");
    for (const record of analysis.corruptedRecords.slice(0, analysis.issueLimit)) {
      lines.push(`- ${formatMemoryRecordPointer(record)} ${truncateText(record.text, 120)}`);
    }
  }

  if (analysis.includeDiagnostics?.missing?.length > 0) {
    lines.push("");
    lines.push("## Instruction Include Diagnostics");
    lines.push("");
    for (const item of analysis.includeDiagnostics.missing.slice(0, analysis.issueLimit)) {
      const suggestions = item.suggestions.length
        ? ` Suggestions: ${item.suggestions.map((candidate) => `\`${candidate.path}\``).join(", ")}.`
        : " No existing local suggestions found.";
      lines.push(`- ${item.include} in \`${item.file}\` is missing at \`${item.expectedPath}\`.${suggestions}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function analyzeMemoryHealth(config, index, options = {}) {
  const records = index.records || [];
  const totalRecords = records.length;
  const qualityRecords = records.filter((record) => !isMemoryHealthExcluded(record));
  const issueLimit = Number(options.issueLimit || 5);
  const duplicateGroups = findDuplicateMemoryGroups(qualityRecords);
  const duplicateRecords = duplicateGroups.reduce((sum, group) => sum + group.count - 1, 0);
  const duplicateRate = qualityRecords.length > 0 ? duplicateRecords / qualityRecords.length : 0;
  const corruptedRecords = qualityRecords.filter(isCorruptedMemoryRecord);
  const storage = getMemoryStorageSummary(config.memoryDir);
  const growthTrend = getMemoryGrowthTrend(records, 14);
  const pendingInbox = countJsonlLines(path.join(config.memoryDir, "inbox", "events.jsonl"));
  const includeDiagnostics = analyzeInstructionIncludes(config, { records });
  const issues = [];
  const repairSuggestions = [];

  const addIssue = (issue) => {
    issues.push(issue);
    if (issue.action) {
      repairSuggestions.push(issue.action);
    }
  };

  if (corruptedRecords.length > 0) {
    addIssue({
      level: "high",
      title: "Corrupted records detected",
      detail: `${corruptedRecords.length} record(s) contain null bytes, replacement characters, or raw unparsed JSONL text.`,
      action: createHealthRepairAction({
        id: "repair-corrupted-records",
        label: "Repair corrupted records",
        command: "ai-memory-hub health repair --apply",
        detail: "Create a backup, recover parseable raw JSON records, archive unrecoverable corrupted records, and rebuild generated memory outputs.",
        endpoint: "/api/health/repair",
        method: "POST"
      })
    });
  }
  if (duplicateRecords > 0) {
    addIssue({
      level: duplicateRate >= 0.1 ? "high" : "medium",
      title: "Duplicate memory content",
      detail: `${duplicateRecords} duplicate record(s) across ${duplicateGroups.length} repeated text group(s).`,
      action: createHealthRepairAction({
        id: "repair-duplicate-groups",
        label: "Supersede duplicate records",
        command: "ai-memory-hub health repair --apply",
        detail: "Keep the highest-quality record in each duplicate group, mark older duplicate records as superseded, and rebuild generated memory outputs.",
        endpoint: "/api/health/repair",
        method: "POST"
      })
    });
  }
  if (pendingInbox > 0) {
    addIssue({
      level: pendingInbox >= 50 ? "medium" : "low",
      title: "Pending inbox events",
      detail: `${pendingInbox} event(s) remain in inbox/events.jsonl; run sync when ready.`,
      action: createHealthRepairAction({
        id: "sync-pending-inbox",
        label: "Sync pending inbox",
        command: "ai-memory-hub sync",
        detail: "Index pending inbox events into the ledger and rebuild the readable snapshot.",
        endpoint: "/api/sync",
        method: "POST"
      })
    });
  }
  if (includeDiagnostics.missing.length > 0) {
    const first = includeDiagnostics.missing[0];
    addIssue({
      level: "medium",
      title: "Missing instruction includes",
      detail: `${includeDiagnostics.missing.length} @include reference(s) are missing from tool instruction files. First missing include: ${first.include} in ${first.file}.`,
      action: createHealthRepairAction({
        id: "resolve-missing-instruction-include",
        label: "Resolve missing instruction include",
        command: `ai-memory-hub resolve "${first.include}" --from "${first.file}"`,
        detail: "Resolve the missing include from local candidate paths and shared memory before assuming the referenced instruction file is unavailable."
      })
    });
  }
  if (storage.backupsBytes > storage.ledgerBytes && storage.backupsBytes > 0) {
    addIssue({
      level: "low",
      title: "Backup storage exceeds ledger size",
      detail: `backups/ uses ${formatBytes(storage.backupsBytes)} versus ledger ${formatBytes(storage.ledgerBytes)}.`,
      action: createHealthRepairAction({
        id: "backup-storage-review",
        label: "Review backup storage",
        command: "ai-memory-hub backup list",
        detail: "Inspect backup age and retention status before running any explicit prune operation."
      })
    });
  }

  const score = Math.max(0, 100
    - Math.min(40, Math.round(duplicateRate * 200))
    - Math.min(35, corruptedRecords.length * 8)
    - Math.min(10, pendingInbox)
    - Math.min(10, includeDiagnostics.missing.length * 3));

  return {
    generatedAt: new Date().toISOString(),
    score,
    status: score >= 90 ? "good" : score >= 70 ? "needs attention" : "critical",
    totalRecords,
    qualityRecords: qualityRecords.length,
    duplicateGroups,
    duplicateRecords,
    duplicateRate,
    corruptedRecords,
    includeDiagnostics,
    storage,
    growthTrend,
    issues,
    repairSuggestions,
    issueLimit
  };
}

function createHealthRepairAction({
  id,
  label,
  command = "",
  detail = "",
  endpoint = "",
  method = "POST"
}) {
  return {
    id,
    label,
    command,
    detail,
    endpoint,
    method,
    destructive: false
  };
}

function isMemoryHealthExcluded(record) {
  const lifecycle = record.metadata?.lifecycle || {};
  const repair = lifecycle.healthRepair || record.metadata?.healthRepair || {};
  return Boolean(
    record.superseded ||
    record.metadata?.superseded ||
    record.healthExcluded ||
    record.metadata?.healthExcluded ||
    lifecycle.healthExcluded ||
    repair.healthExcluded ||
    repair.status === "archived-corrupted" ||
    repair.status === "superseded-duplicate"
  );
}

function runMemoryHealthRepair(config, { apply = false, issueLimit = 10 } = {}) {
  const beforeDiagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit });
  const plan = buildMemoryHealthRepairPlan(beforeDiagnostic.analysis);
  const result = {
    ok: true,
    apply,
    generatedAt: new Date().toISOString(),
    before: summarizeHealthAnalysisForRepair(beforeDiagnostic.analysis),
    plan: formatMemoryHealthRepairPlan(plan),
    backup: null,
    applied: {
      ledgerRecordsUpdated: 0,
      corruptedRecovered: 0,
      corruptedArchived: 0,
      duplicateSuperseded: 0
    },
    after: null
  };

  if (!apply || plan.totalActions === 0) {
    return result;
  }

  const backup = backupHub(config.memoryDir, "pre-health-repair");
  const ledger = readLedger(config.memoryDir);
  const applied = applyMemoryHealthRepairPlan(ledger, plan);
  writeLedger(config.memoryDir, applied.ledger);
  rebuildMemoryOutputs(config, applied.ledger);

  const afterDiagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit });
  return {
    ...result,
    backup,
    applied: applied.summary,
    after: summarizeHealthAnalysisForRepair(afterDiagnostic.analysis)
  };
}

function buildMemoryHealthRepairPlan(analysis) {
  const corrupted = analysis.corruptedRecords.map((record) => ({
    key: getMemoryPrimaryKey(record) || record.id || "",
    id: record.localEventId || record.id || "",
    pointer: formatMemoryRecordPointer(record),
    text: truncateText(record.text, 160),
    recoverable: Boolean(recoverMemoryEventFromRawText(record.text))
  })).filter((item) => item.key);

  const duplicateGroups = analysis.duplicateGroups.map((group) => {
    const keeper = chooseDuplicateKeeper(group.records);
    const keeperKey = getMemoryPrimaryKey(keeper) || keeper.id || "";
    const losers = group.records
      .filter((record) => record !== keeper)
      .map((record) => ({
        key: getMemoryPrimaryKey(record) || record.id || "",
        id: record.localEventId || record.id || "",
        pointer: formatMemoryRecordPointer(record),
        ts: record.ts || record.indexedAt || ""
      }))
      .filter((item) => item.key);
    return {
      keeperKey,
      keeperId: keeper.localEventId || keeper.id || "",
      example: group.example,
      count: group.count,
      losers
    };
  }).filter((group) => group.keeperKey && group.losers.length > 0);

  const duplicateLosers = duplicateGroups.reduce((sum, group) => sum + group.losers.length, 0);
  return {
    corrupted,
    duplicateGroups,
    totalActions: corrupted.length + duplicateLosers
  };
}

function formatMemoryHealthRepairPlan(plan) {
  return {
    totalActions: plan.totalActions,
    corruptedRecords: plan.corrupted.length,
    recoverableCorruptedRecords: plan.corrupted.filter((item) => item.recoverable).length,
    duplicateGroups: plan.duplicateGroups.length,
    duplicateRecordsToSupersede: plan.duplicateGroups.reduce((sum, group) => sum + group.losers.length, 0),
    corrupted: plan.corrupted.slice(0, 20),
    duplicates: plan.duplicateGroups.slice(0, 20).map((group) => ({
      keeperId: group.keeperId,
      keeperKey: group.keeperKey,
      example: group.example,
      losers: group.losers
    }))
  };
}

function summarizeHealthAnalysisForRepair(analysis) {
  return {
    score: analysis.score,
    status: analysis.status,
    totalRecords: analysis.totalRecords,
    qualityRecords: analysis.qualityRecords,
    duplicateRecords: analysis.duplicateRecords,
    corruptedRecords: analysis.corruptedRecords.length,
    storageDisplay: formatBytes(analysis.storage.totalBytes)
  };
}

function applyMemoryHealthRepairPlan(ledger, plan) {
  const now = new Date().toISOString();
  const corruptedByKey = new Map(plan.corrupted.map((item) => [item.key, item]));
  const duplicateByKey = new Map();
  for (const group of plan.duplicateGroups) {
    for (const loser of group.losers) {
      duplicateByKey.set(loser.key, group);
    }
  }
  const summary = {
    ledgerRecordsUpdated: 0,
    corruptedRecovered: 0,
    corruptedArchived: 0,
    duplicateSuperseded: 0
  };

  const repairedLedger = ledger.map((record) => {
    const key = getMemoryPrimaryKey(record) || record.id || "";
    let next = record;
    if (corruptedByKey.has(key)) {
      const repaired = repairCorruptedLedgerRecord(next, now);
      next = repaired.record;
      summary.ledgerRecordsUpdated += 1;
      if (repaired.action === "recovered") {
        summary.corruptedRecovered += 1;
      } else {
        summary.corruptedArchived += 1;
      }
    }
    const duplicateGroup = duplicateByKey.get(key);
    if (duplicateGroup && !isMemoryHealthExcluded(next)) {
      next = markDuplicateLedgerRecordSuperseded(next, duplicateGroup.keeperKey, now);
      summary.ledgerRecordsUpdated += 1;
      summary.duplicateSuperseded += 1;
    }
    return next;
  });

  return { ledger: repairedLedger, summary };
}

function chooseDuplicateKeeper(records) {
  return [...records].sort((a, b) => {
    const corruptDelta = Number(isCorruptedMemoryRecord(a)) - Number(isCorruptedMemoryRecord(b));
    if (corruptDelta !== 0) return corruptDelta;
    const importanceDelta = Number(b.importance || 0) - Number(a.importance || 0);
    if (importanceDelta !== 0) return importanceDelta;
    return String(b.ts || b.indexedAt || "").localeCompare(String(a.ts || a.indexedAt || ""));
  })[0];
}

function repairCorruptedLedgerRecord(record, repairedAt) {
  const recovered = recoverMemoryEventFromRawText(record.text);
  if (recovered && recovered.text && !containsCorruptionMarker(recovered.text)) {
    return {
      action: "recovered",
      record: {
        ...record,
        source: recovered.source || (record.source === "raw" ? "health-repair" : record.source),
        text: sanitizeLedgerText(recovered.text),
        metadata: normalizeMemoryMetadata({
          ...record.metadata,
          ...recovered.metadata,
          lifecycle: {
            ...(record.metadata?.lifecycle || {}),
            healthRepair: {
              status: "recovered-corrupted",
              repairedAt,
              originalSource: record.source || "",
              originalKind: record.metadata?.kind || record.kind || ""
            }
          }
        }, recovered)
      }
    };
  }

  return {
    action: "archived",
    record: {
      ...record,
      source: record.source === "raw" ? "health-repair" : record.source,
      text: sanitizeLedgerText(record.text),
      superseded: true,
      supersededBy: ["health-repair"],
      healthExcluded: true,
      metadata: normalizeMemoryMetadata({
        ...record.metadata,
        kind: "archived",
        scope: "archive",
        confidence: 0.1,
        tags: [...normalizeList(record.metadata?.tags), "health-repair", "corrupted"],
        superseded: true,
        supersededBy: ["health-repair"],
        healthExcluded: true,
        lifecycle: {
          ...(record.metadata?.lifecycle || {}),
          healthExcluded: true,
          healthRepair: {
            status: "archived-corrupted",
            healthExcluded: true,
            repairedAt,
            originalSource: record.source || "",
            originalKind: record.metadata?.kind || record.kind || ""
          }
        }
      }, record)
    }
  };
}

function markDuplicateLedgerRecordSuperseded(record, keeperKey, repairedAt) {
  return {
    ...record,
    superseded: true,
    supersededBy: [keeperKey],
    healthExcluded: true,
    metadata: normalizeMemoryMetadata({
      ...record.metadata,
      superseded: true,
      supersededBy: [keeperKey],
      healthExcluded: true,
      lifecycle: {
        ...(record.metadata?.lifecycle || {}),
        superseded: true,
        supersededBy: [keeperKey],
        healthExcluded: true,
        healthRepair: {
          status: "superseded-duplicate",
          healthExcluded: true,
          repairedAt,
          duplicateOf: keeperKey
        }
      }
    }, record)
  };
}

function recoverMemoryEventFromRawText(rawText) {
  const cleaned = sanitizeRawJsonCandidate(rawText);
  if (!cleaned) {
    return null;
  }
  const parsed = parseJsonObjectCandidate(cleaned) || parseLooseJsonMemoryEvent(cleaned);
  if (!parsed || !parsed.text) {
    return null;
  }
  const event = normalizeMemoryEvent(parsed);
  if (parsed.type && (!parsed.metadata || !parsed.metadata.kind)) {
    event.metadata.kind = normalizeMemoryKind(parsed.type);
  }
  event.text = sanitizeLedgerText(event.text);
  return event.text ? event : null;
}

function sanitizeRawJsonCandidate(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function parseJsonObjectCandidate(text) {
  if (!text.startsWith("{") || !text.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseLooseJsonMemoryEvent(text) {
  if (!text.startsWith("{")) {
    return null;
  }
  const source = extractLooseJsonStringField(text, "source") || "health-repair";
  const type = extractLooseJsonStringField(text, "type") || "";
  const memoryText = extractLooseJsonStringField(text, "text") || "";
  if (!memoryText) {
    return null;
  }
  const kind = extractLooseJsonStringField(text, "kind") || type || "reference";
  const project = extractLooseJsonStringField(text, "project") || "";
  return {
    source,
    text: memoryText,
    metadata: {
      kind,
      project
    }
  };
}

function extractLooseJsonStringField(text, field) {
  const marker = `"${field}"`;
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) {
    return "";
  }
  const colonIndex = text.indexOf(":", markerIndex + marker.length);
  if (colonIndex === -1) {
    return "";
  }
  const firstQuote = text.indexOf("\"", colonIndex + 1);
  if (firstQuote === -1) {
    return "";
  }
  const boundaryPattern = /"\s*(?:,\s*"|})/g;
  boundaryPattern.lastIndex = firstQuote + 1;
  let match;
  while ((match = boundaryPattern.exec(text))) {
    const raw = text.slice(firstQuote + 1, match.index);
    if (raw) {
      return sanitizeLedgerText(raw.replace(/\\"/g, "\"").replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t"));
    }
  }
  return "";
}

function sanitizeLedgerText(value) {
  return sanitizeDisplayText(value).trim();
}

function findDuplicateMemoryGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const key = normalizeDuplicateMemoryText(record.text);
    if (!key || key.length < 16) {
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  }
  return [...groups.values()]
    .filter((items) => items.length > 1)
    .map((items) => ({
      count: items.length,
      example: truncateText(items[0].text, 120),
      records: items
    }))
    .sort((a, b) => b.count - a.count || a.example.localeCompare(b.example));
}

function normalizeDuplicateMemoryText(text) {
  return normalizeSearchText(text)
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCorruptedMemoryRecord(record) {
  if (isMemoryHealthExcluded(record)) {
    return false;
  }
  const text = String(record.text || "");
  return record.source === "raw" ||
    record.kind === "raw" ||
    containsCorruptionMarker(text);
}

function getMemoryGrowthTrend(records, limit = 14) {
  const counts = new Map();
  for (const record of records) {
    const date = String(record.ts || record.indexedAt || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([date, count]) => ({ date, count }));
}

function getMemoryStorageSummary(memoryDir) {
  const items = [
    ["MEMORY.md", path.join(memoryDir, "MEMORY.md")],
    ["INDEX.md", path.join(memoryDir, "INDEX.md")],
    ["memories/ledger.jsonl", path.join(memoryDir, "memories", "ledger.jsonl")],
    ["memories/index.json", path.join(memoryDir, "memories", "index.json")],
    ["inbox/events.jsonl", path.join(memoryDir, "inbox", "events.jsonl")],
    ["radio/messages.jsonl", path.join(memoryDir, "radio", "messages.jsonl")],
    ["tasks/tasks.jsonl", path.join(memoryDir, "tasks", "tasks.jsonl")],
    ["workflows/workflows.jsonl", path.join(memoryDir, "workflows", "workflows.jsonl")],
    ["backups/", path.join(memoryDir, "backups")]
  ].map(([label, target]) => ({
    label,
    bytes: getPathSize(target)
  }));
  const ledgerBytes = items.find((item) => item.label === "memories/ledger.jsonl")?.bytes || 0;
  const backupsBytes = items.find((item) => item.label === "backups/")?.bytes || 0;
  return {
    totalBytes: getPathSize(memoryDir),
    ledgerBytes,
    backupsBytes,
    items
  };
}

function getPathSize(target) {
  if (!fs.existsSync(target)) {
    return 0;
  }
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    return 0;
  }
  if (stat.isFile()) {
    return stat.size;
  }
  if (!stat.isDirectory()) {
    return 0;
  }
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    total += getPathSize(path.join(target, entry.name));
  }
  return total;
}

function countJsonlLines(file) {
  if (!fs.existsSync(file)) {
    return 0;
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
}

function formatTopCounts(items = [], limit = 8) {
  const selected = items.slice(0, limit);
  return selected.length ? selected.map((item) => `${item.key}(${item.count})`).join(", ") : "none";
}

function formatMemoryRecordPointer(record) {
  const source = sanitizeInlineText(record.source || "unknown") || "unknown";
  const kind = sanitizeInlineText(record.kind || "note") || "note";
  const id = sanitizeInlineText(record.localEventId || record.id || "");
  return id ? `${source}/${kind} ${id}:` : `${source}/${kind}:`;
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} ${units[unit]}` : `${value.toFixed(1)} ${units[unit]}`;
}

function truncateText(text, limit) {
  const clean = sanitizeInlineText(text);
  if (clean.length <= limit) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, limit - 3))}...`;
}

function renderMemoryLine(memory) {
  const source = sanitizeInlineText(memory.source || "unknown");
  const memoryKind = sanitizeInlineText(memory.kind || memory.metadata?.kind || "");
  const kind = memoryKind ? `/${memoryKind}` : "";
  const topics = memory.topics?.length ? ` topics=${memory.topics.slice(0, 5).map(sanitizeInlineText).join(",")}` : "";
  const project = memory.project ? ` project=${sanitizeInlineText(memory.project)}` : "";
  const tags = memory.tags?.length ? ` tags=${memory.tags.slice(0, 5).map(sanitizeInlineText).join(",")}` : "";
  const refs = formatMemoryRefs(memory.refs);
  return `- [${source}${kind} score=${memory.importance}${project}${tags}${topics}${refs ? ` refs=${refs}` : ""}] ${sanitizeInlineText(memory.text)}`;
}

function containsCorruptionMarker(value) {
  return CORRUPTION_MARKER_PATTERN.test(String(value || ""));
}

function sanitizeDisplayText(value) {
  return String(value || "")
    .replace(/\u0000/g, "\\0")
    .replace(/\ufffd/g, "?")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
}

function sanitizeInlineText(value) {
  return sanitizeDisplayText(value).replace(/\s+/g, " ").trim();
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
      score += Number(memory.accessHeat || 0) / 50;
      score -= Number(memory.staleAccessPenalty || 0) / 50;
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

function scoreImportance(memory, topics, ordinal, total, access = {}) {
  const text = String(memory.text || "");
  const kind = memory.metadata?.kind || "note";
  let score = 20;
  if (["preference", "workflow", "correction"].includes(kind)) score += 45;
  if (["project", "lesson"].includes(kind)) score += 30;
  if (["reference", "raw", "note"].includes(kind)) score += 10;
  if (/must|always|never|必须|不要|偏好|规范|规则|纠错|红线|合规|错误|lesson/i.test(text)) score += 18;
  if (/github|git|lark|feishu|qclaw|claude|codex|opencode|mimocode|mimo code|memory|飞书|微信|小游戏/i.test(text)) score += 8;
  if (topics.length > 0) score += Math.min(10, topics.length * 2);
  const recency = total > 0 ? ordinal / total : 0;
  score += Math.round(recency * 8);
  score += Number(access.accessHeat || 0);
  score -= Number(access.staleAccessPenalty || 0);
  score -= getStaleWorkingContextPenalty(memory, text);
  return Math.max(1, Math.min(100, score));
}

function getStaleWorkingContextPenalty(memory, text) {
  if (!isStaleOperationalRadioMemory(memory, text)) {
    return 0;
  }
  const ageDays = getMemoryAgeDays(memory);
  return Math.min(90, Math.ceil(ageDays * OPERATIONAL_RADIO_DECAY_RATE_PER_DAY));
}

function isStaleOperationalRadioMemory(memory, text) {
  return isOperationalRadioMemory(memory, text) && getMemoryAgeDays(memory) > STALE_OPERATIONAL_RADIO_AFTER_DAYS;
}

function isOperationalRadioMemory(memory, text) {
  const source = String(memory.source || "").toLowerCase();
  const kind = String(memory.metadata?.kind || memory.kind || "").toLowerCase();
  const hasRadioRef = normalizeRefValues(memory.refs?.radioId || memory.metadata?.refs?.radioId).length > 0;
  const isRadio = source.startsWith("radio") || kind === "radio" || hasRadioRef;
  if (!isRadio) {
    return false;
  }
  return /status|progress|dispatch|completed|done|pass|failed|review|heartbeat|状态|进度|完成|已完成|通过|失败|审核/i.test(String(text || ""));
}

function getMemoryAgeDays(memory) {
  const time = Date.parse(memory.ts || memory.indexedAt || "");
  if (!Number.isFinite(time)) {
    return 0;
  }
  return Math.max(0, (Date.now() - time) / 86400000);
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
    ["ai-memory-hub", /ai-memory|shared memory|memory hub|agent radio|opencode|mimocode|mimo code|qclaw|claude|codex|gemini|共享记忆|本地记忆/],
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

function getBackupFileCatalog(memoryDir) {
  return [
    { name: "MEMORY.md", target: path.join(memoryDir, "MEMORY.md"), kind: "snapshot" },
    { name: "BOOTSTRAP.md", target: path.join(memoryDir, "BOOTSTRAP.md"), kind: "snapshot" },
    { name: "profile.md", target: path.join(memoryDir, "profile.md"), kind: "profile" },
    { name: "inbox-events.jsonl", target: path.join(memoryDir, "inbox", "events.jsonl"), kind: "inbox" },
    { name: "memory-ledger.jsonl", target: path.join(memoryDir, "memories", "ledger.jsonl"), kind: "memory" },
    { name: "radio-messages.jsonl", target: path.join(memoryDir, "radio", "messages.jsonl"), kind: "radio" },
    { name: "tasks.jsonl", target: path.join(memoryDir, "tasks", "tasks.jsonl"), kind: "tasks" },
    { name: "tasks-events.jsonl", target: path.join(memoryDir, "tasks", "events.jsonl"), kind: "tasks" },
    { name: "workflows.jsonl", target: path.join(memoryDir, "workflows", "workflows.jsonl"), kind: "workflows" },
    { name: "workflows-events.jsonl", target: path.join(memoryDir, "workflows", "events.jsonl"), kind: "workflows" },
    { name: "projects.jsonl", target: path.join(memoryDir, "projects", "projects.jsonl"), kind: "projects" },
    { name: "projects-events.jsonl", target: path.join(memoryDir, "projects", "events.jsonl"), kind: "projects" },
    { name: "config.json", target: path.join(memoryDir, "config.json"), kind: "config" }
  ];
}

function backupHub(memoryDir, reason, options = {}) {
  const createdAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  const safeReason = String(reason || "manual").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 48) || "manual";
  const backupDir = path.join(memoryDir, "backups", `${stamp}-${safeReason}`);
  ensureDir(backupDir);

  const files = getBackupFileCatalog(memoryDir);
  const copied = [];
  for (const file of files) {
    if (fs.existsSync(file.target)) {
      fs.copyFileSync(file.target, path.join(backupDir, file.name));
      copied.push(file.name);
    }
  }

  const manifest = {
    id: createId(`backup:${createdAt}:${reason}:${backupDir}`),
    createdAt,
    reason,
    dir: backupDir,
    trigger: options.trigger || "",
    retention: {
      tier: options.retentionTier || inferBackupRetentionTier(reason),
      key: options.retentionKey || "",
      policy: options.retentionPolicy || ""
    },
    files: copied
  };
  writeJson(path.join(backupDir, "manifest.json"), manifest);
  return manifest;
}

function getBackupDetail(memoryDir, name) {
  const backupDir = resolveBackupDirectory(memoryDir, name);
  const backup = listBackupDirectories(memoryDir).find((item) => item.name === path.basename(backupDir)) || null;
  const manifest = readBackupManifest(backupDir);
  const restore = buildBackupRestorePlan(memoryDir, name);
  return {
    ok: true,
    backup,
    manifest,
    files: listBackupFiles(memoryDir, name),
    restore
  };
}

function restoreBackup(memoryDir, name, { apply = false, confirm = "" } = {}) {
  const plan = buildBackupRestorePlan(memoryDir, name);
  if (!apply) {
    return {
      apply: false,
      plan
    };
  }
  if (confirm !== "RESTORE") {
    throw new Error("Restore requires confirm=RESTORE.");
  }

  const safetyBackup = backupHub(memoryDir, "pre-restore", {
    trigger: "restore",
    retentionTier: "protected",
    retentionKey: new Date().toISOString(),
    retentionPolicy: "protected pre-restore backup"
  });
  const backupDir = resolveBackupDirectory(memoryDir, name);
  const catalog = new Map(getBackupFileCatalog(memoryDir).map((file) => [file.name, file]));
  const memoryRoot = path.resolve(memoryDir);
  const restored = [];

  for (const file of plan.files) {
    if (!file.restorable) {
      continue;
    }
    const spec = catalog.get(file.name);
    const backupFile = path.join(backupDir, file.name);
    const target = path.resolve(spec.target);
    if (!isPathInsideDirectory(target, memoryRoot)) {
      throw new Error(`Refusing to restore outside memory dir: ${file.name}`);
    }
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlink target: ${file.currentPath}`);
    }
    ensureDir(path.dirname(target));
    fs.copyFileSync(backupFile, target);
    restored.push(file.name);
  }

  if (restored.includes("memory-ledger.jsonl")) {
    rebuildMemoryOutputs(loadConfig(), readLedger(memoryDir));
  }

  return {
    apply: true,
    backup: safetyBackup,
    restored,
    before: plan,
    after: buildBackupRestorePlan(memoryDir, name)
  };
}

function buildBackupRestorePlan(memoryDir, name) {
  const backupDir = resolveBackupDirectory(memoryDir, name);
  const files = listBackupFiles(memoryDir, name).filter((file) => file.restorable);
  const changed = files.filter((file) => file.status !== "unchanged");
  return {
    name: path.basename(backupDir),
    generatedAt: new Date().toISOString(),
    requiresConfirmation: "RESTORE",
    destructive: changed.some((file) => file.status === "different"),
    summary: {
      total: files.length,
      changed: changed.length,
      missingCurrent: files.filter((file) => file.status === "missing-current").length,
      different: files.filter((file) => file.status === "different").length,
      unchanged: files.filter((file) => file.status === "unchanged").length,
      bytes: changed.reduce((sum, file) => sum + file.bytes, 0),
      display: formatBytes(changed.reduce((sum, file) => sum + file.bytes, 0))
    },
    files: files.map((file) => ({
      name: file.name,
      kind: file.kind,
      bytes: file.bytes,
      display: file.display,
      currentPath: file.currentPath,
      currentExists: file.currentExists,
      currentDisplay: file.currentDisplay,
      status: file.status,
      restorable: file.restorable
    }))
  };
}

function listBackupFiles(memoryDir, name) {
  const backupDir = resolveBackupDirectory(memoryDir, name);
  const catalog = new Map(getBackupFileCatalog(memoryDir).map((file) => [file.name, file]));
  return fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => describeBackupFile(memoryDir, backupDir, entry.name, catalog.get(entry.name)))
    .sort((a, b) => Number(b.restorable) - Number(a.restorable) || a.name.localeCompare(b.name));
}

function describeBackupFile(memoryDir, backupDir, name, spec) {
  const backupFile = path.join(backupDir, name);
  const backupStat = fs.statSync(backupFile);
  const currentExists = Boolean(spec && fs.existsSync(spec.target));
  const currentBytes = currentExists ? fs.statSync(spec.target).size : 0;
  const backupHash = getFileHash(backupFile);
  const currentHash = currentExists ? getFileHash(spec.target) : "";
  const status = !spec
    ? "browse-only"
    : !currentExists
      ? "missing-current"
      : backupHash === currentHash
        ? "unchanged"
        : "different";
  return {
    name,
    kind: spec?.kind || "metadata",
    bytes: backupStat.size,
    display: formatBytes(backupStat.size),
    modifiedAt: backupStat.mtime.toISOString(),
    restorable: Boolean(spec),
    currentPath: spec ? path.relative(memoryDir, spec.target).replace(/\\/g, "/") : "",
    currentExists,
    currentBytes,
    currentDisplay: formatBytes(currentBytes),
    status,
    preview: getBackupFilePreview(backupFile)
  };
}

function resolveBackupDirectory(memoryDir, name) {
  const rawName = String(name || "").trim();
  if (!rawName || rawName.includes("/") || rawName.includes("\\") || rawName === "." || rawName === "..") {
    throw new Error("A valid backup name is required.");
  }
  const backupsRoot = path.resolve(memoryDir, "backups");
  const backupDir = path.resolve(backupsRoot, rawName);
  if (!isPathInsideDirectory(backupDir, backupsRoot)) {
    throw new Error("Backup path is outside backups directory.");
  }
  if (!fs.existsSync(backupDir) || !fs.statSync(backupDir).isDirectory()) {
    throw new Error(`Backup not found: ${rawName}`);
  }
  return backupDir;
}

function readBackupManifest(backupDir) {
  const manifestPath = path.join(backupDir, "manifest.json");
  return fs.existsSync(manifestPath) ? readJsonSafe(manifestPath, {}) : {};
}

function getFileHash(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return "";
  }
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function getBackupFilePreview(file) {
  const ext = path.extname(file).toLowerCase();
  const basename = path.basename(file).toLowerCase();
  if (![".json", ".jsonl", ".md", ".txt"].includes(ext) && basename !== "manifest.json") {
    return "";
  }
  const buffer = fs.readFileSync(file);
  const sample = buffer.subarray(0, Math.min(buffer.length, 2000)).toString("utf8");
  if (sample.includes("\u0000")) {
    return "";
  }
  return truncateText(sample, 1000);
}

function runAutomaticBackupStrategy(config, { trigger = "sync", includePreSync = true, now = new Date() } = {}) {
  const retention = getBackupRetentionConfig(config);
  const result = {
    trigger,
    policy: retention,
    created: [],
    skipped: [],
    preSync: null,
    daily: null,
    weekly: null,
    pruned: null
  };

  if (includePreSync) {
    result.preSync = backupHub(config.memoryDir, "pre-sync", {
      now,
      trigger,
      retentionTier: "pre-sync",
      retentionKey: createdAtRetentionKey(now),
      retentionPolicy: `keep latest ${retention.preSync} pre-sync backups`
    });
    result.created.push(result.preSync);
  }

  result.daily = createScheduledBackupIfDue(config.memoryDir, {
    now,
    trigger,
    tier: "daily",
    key: formatBackupDay(now),
    reason: "daily",
    policy: `keep latest ${retention.daily} daily backups`
  });
  if (result.daily) {
    result.created.push(result.daily);
  } else {
    result.skipped.push({ tier: "daily", reason: "already-current", key: formatBackupDay(now) });
  }

  result.weekly = createScheduledBackupIfDue(config.memoryDir, {
    now,
    trigger,
    tier: "weekly",
    key: getIsoWeekKey(now),
    reason: "weekly",
    policy: `keep latest ${retention.weekly} weekly backups`
  });
  if (result.weekly) {
    result.created.push(result.weekly);
  } else {
    result.skipped.push({ tier: "weekly", reason: "already-current", key: getIsoWeekKey(now) });
  }

  if (retention.pruneAfterSync !== false) {
    result.pruned = pruneBackups(config.memoryDir, {
      apply: true,
      daily: retention.daily,
      weekly: retention.weekly,
      preSync: retention.preSync
    });
  }

  return result;
}

function createScheduledBackupIfDue(memoryDir, { now, trigger, tier, key, reason, policy }) {
  if (!key || hasBackupForRetentionKey(memoryDir, tier, key)) {
    return null;
  }
  return backupHub(memoryDir, reason, {
    now,
    trigger,
    retentionTier: tier,
    retentionKey: key,
    retentionPolicy: policy
  });
}

function hasBackupForRetentionKey(memoryDir, tier, key) {
  return listBackupDirectories(memoryDir).some((backup) => backup.retentionTier === tier && backup.retentionKey === key);
}

function getBackupRetentionConfig(config = {}) {
  const defaults = defaultConfig(config.memoryDir || resolveMemoryDir()).sync.backupRetention;
  const raw = {
    ...defaults,
    ...(config.backups || {}),
    ...(config.sync?.backupRetention || {})
  };
  return {
    daily: readPositiveInteger(raw.daily, defaults.daily),
    weekly: readPositiveInteger(raw.weekly, defaults.weekly),
    preSync: readPositiveInteger(raw.preSync ?? raw.pre_sync, defaults.preSync),
    pruneAfterSync: raw.pruneAfterSync !== false
  };
}

function getGitHubBackupConfig(config = loadConfig()) {
  const defaults = defaultConfig(config.memoryDir || resolveMemoryDir()).backup.github;
  const raw = {
    ...defaults,
    ...(config.backup?.github || {}),
    schedule: {
      ...defaults.schedule,
      ...(config.backup?.github?.schedule || {})
    }
  };
  return {
    enabled: raw.enabled === true,
    remoteUrl: String(raw.remoteUrl || "").trim(),
    repoDir: resolveConfiguredPath(raw.repoDir || defaults.repoDir),
    branch: String(raw.branch || "main").trim() || "main",
    allowPlaintextSensitive: raw.allowPlaintextSensitive === true,
    include: normalizeBackupPatternList(raw.include, defaults.include),
    exclude: normalizeBackupPatternList(raw.exclude, []),
    schedule: {
      enabled: raw.schedule?.enabled === true,
      time: normalizeScheduleTime(raw.schedule?.time || defaults.schedule.time),
      taskName: String(raw.schedule?.taskName || defaults.schedule.taskName).trim() || defaults.schedule.taskName
    },
    lastRunAt: String(raw.lastRunAt || ""),
    lastCommit: String(raw.lastCommit || ""),
    lastError: String(raw.lastError || "")
  };
}

function configureGitHubBackup(config, argv = []) {
  const configPath = path.join(config.memoryDir, "config.json");
  const current = readJsonSafe(configPath, defaultConfig(config.memoryDir));
  const currentGithub = getGitHubBackupConfig(config);
  const nextGithub = {
    ...currentGithub,
    schedule: { ...currentGithub.schedule }
  };

  if (hasFlag(argv, "--enabled") || hasFlag(argv, "--enable")) {
    nextGithub.enabled = true;
  }
  if (hasFlag(argv, "--disabled") || hasFlag(argv, "--disable")) {
    nextGithub.enabled = false;
  }
  if (hasOption(argv, "--remote-url")) {
    nextGithub.remoteUrl = getOption(argv, "--remote-url");
  }
  if (hasOption(argv, "--repo-dir") && getOption(argv, "--repo-dir")) {
    nextGithub.repoDir = resolveConfiguredPath(getOption(argv, "--repo-dir"));
  }
  if (hasOption(argv, "--branch") && getOption(argv, "--branch")) {
    nextGithub.branch = getOption(argv, "--branch");
  }
  if (hasFlag(argv, "--allow-plaintext-sensitive")) {
    nextGithub.allowPlaintextSensitive = true;
  }
  if (hasFlag(argv, "--block-plaintext-sensitive")) {
    nextGithub.allowPlaintextSensitive = false;
  }
  if (getOption(argv, "--include")) {
    nextGithub.include = normalizeBackupPatternList(getOption(argv, "--include").split(","), nextGithub.include);
  }
  if (getOption(argv, "--exclude")) {
    nextGithub.exclude = normalizeBackupPatternList(getOption(argv, "--exclude").split(","), nextGithub.exclude);
  }
  if (hasFlag(argv, "--schedule-enabled") || hasFlag(argv, "--schedule-enable")) {
    nextGithub.schedule.enabled = true;
  }
  if (hasFlag(argv, "--schedule-disabled") || hasFlag(argv, "--schedule-disable")) {
    nextGithub.schedule.enabled = false;
  }
  if (getOption(argv, "--time")) {
    nextGithub.schedule.time = normalizeScheduleTime(getOption(argv, "--time"));
  }
  if (getOption(argv, "--task-name")) {
    nextGithub.schedule.taskName = getOption(argv, "--task-name");
  }

  const next = {
    ...current,
    backup: {
      ...(current.backup || {}),
      github: nextGithub
    }
  };
  writeJson(configPath, next);
  const warnings = [];
  if (nextGithub.allowPlaintextSensitive) {
    warnings.push("Data security reminder: plaintext GitHub backup uploads can include private user data. Use only with an approved private remote, restricted access, and an understood retention policy.");
  }
  return {
    ok: true,
    github: getGitHubBackupConfig(loadConfig()),
    warnings
  };
}

function getGitHubBackupStatus(config = loadConfig()) {
  const github = getGitHubBackupConfig(config);
  const repoDir = github.repoDir;
  const gitDir = path.join(repoDir, ".git");
  const repoExists = fs.existsSync(repoDir);
  const isGitRepo = fs.existsSync(gitDir);
  const status = {
    ok: true,
    enabled: github.enabled,
    remoteUrl: github.remoteUrl,
    repoDir,
    branch: github.branch,
    allowPlaintextSensitive: github.allowPlaintextSensitive,
    include: github.include,
    exclude: github.exclude,
    lastRunAt: github.lastRunAt,
    lastCommit: github.lastCommit,
    lastError: github.lastError,
    repo: {
      exists: repoExists,
      isGitRepo,
      currentBranch: "",
      head: "",
      remoteUrl: "",
      dirty: false,
      changes: []
    },
    schedule: getGitHubBackupScheduleStatus(github)
  };

  if (isGitRepo) {
    const branch = runGitCommand(repoDir, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true });
    const head = runGitCommand(repoDir, ["rev-parse", "HEAD"], { allowFailure: true });
    const remote = runGitCommand(repoDir, ["remote", "get-url", "origin"], { allowFailure: true });
    const changes = runGitCommand(repoDir, ["status", "--porcelain"], { allowFailure: true });
    status.repo.currentBranch = branch.ok ? branch.stdout.trim() : "";
    status.repo.head = head.ok ? head.stdout.trim() : "";
    status.repo.remoteUrl = remote.ok ? remote.stdout.trim() : "";
    status.repo.changes = changes.ok ? changes.stdout.split(/\r?\n/).filter(Boolean) : [];
    status.repo.dirty = status.repo.changes.length > 0;
  }

  return status;
}

function runGitHubBackup(config, argv = []) {
  const startedAt = new Date();
  const configuredGithub = getGitHubBackupConfig(config);
  const github = {
    ...configuredGithub,
    remoteUrl: getOption(argv, "--remote-url") || configuredGithub.remoteUrl,
    repoDir: getOption(argv, "--repo-dir") ? resolveConfiguredPath(getOption(argv, "--repo-dir")) : configuredGithub.repoDir,
    branch: getOption(argv, "--branch") || configuredGithub.branch
  };
  const dryRun = hasFlag(argv, "--dry-run");
  const noPush = hasFlag(argv, "--no-push");
  const wouldPush = Boolean(github.remoteUrl) && !noPush;
  const push = wouldPush && !dryRun;
  const reason = getOption(argv, "--reason") || "github-backup";

  try {
    assertSafeGitHubBackupRepoDir(config.memoryDir, github.repoDir);
    const files = getGitHubBackupExportFiles(config.memoryDir, github);
    const scan = scanBackupFilesForSecrets(files);
    const warnings = getGitHubBackupUploadWarnings(github, scan, { wouldPush, push, dryRun });
    const plaintextPushBlocked = scan.issues.length > 0 && push && !github.allowPlaintextSensitive;
    if (plaintextPushBlocked) {
      const message = `GitHub backup push blocked by sensitive content scan: ${scan.issues.map((issue) => `${issue.file}:${issue.line}:${issue.kind}`).join(", ")}. Use --no-push for a complete local backup, or configure --allow-plaintext-sensitive only when the remote is approved for plaintext private data. ${warnings.join(" ")}`.trim();
      if (!dryRun) {
        updateGitHubBackupState(config, { lastRunAt: startedAt.toISOString(), lastError: message });
      }
      throw new Error(message);
    }

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        push: false,
        wouldPush,
        wouldBlockPush: scan.issues.length > 0 && wouldPush && !github.allowPlaintextSensitive,
        allowPlaintextSensitive: github.allowPlaintextSensitive,
        warnings,
        repoDir: github.repoDir,
        remoteUrl: github.remoteUrl,
        branch: github.branch,
        files: files.map((file) => file.name),
        scan,
        status: getGitHubBackupStatus(config)
      };
    }

    ensureGitHubBackupRepo(github);
    const exportResult = exportGitHubBackupSnapshot(config.memoryDir, github.repoDir, files, {
      reason,
      startedAt,
      remoteUrl: github.remoteUrl,
      branch: github.branch
    });

    runGitCommand(github.repoDir, ["add", "README.md", "manifest.json", "snapshot"]);
    const status = runGitCommand(github.repoDir, ["status", "--porcelain"]);
    const changed = status.stdout.split(/\r?\n/).some(Boolean);
    let committed = false;
    let pushed = false;
    let commit = runGitCommand(github.repoDir, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim();

    if (changed) {
      const message = `Back up AI memory ${startedAt.toISOString()}`;
      runGitCommand(github.repoDir, ["commit", "-m", message]);
      committed = true;
      commit = runGitCommand(github.repoDir, ["rev-parse", "HEAD"]).stdout.trim();
      if (push && github.remoteUrl) {
        runGitCommand(github.repoDir, ["push", "-u", "origin", github.branch]);
        pushed = true;
      }
    }

    updateGitHubBackupState(config, {
      enabled: true,
      remoteUrl: github.remoteUrl,
      repoDir: github.repoDir,
      branch: github.branch,
      lastRunAt: startedAt.toISOString(),
      lastCommit: commit,
      lastError: ""
    });

    return {
      ok: true,
      dryRun: false,
      changed,
      committed,
      pushed,
      push,
      wouldPush,
      wouldBlockPush: false,
      allowPlaintextSensitive: github.allowPlaintextSensitive,
      warnings,
      commit,
      repoDir: github.repoDir,
      remoteUrl: github.remoteUrl,
      branch: github.branch,
      files: exportResult.files,
      manifest: exportResult.manifest,
      scan,
      status: getGitHubBackupStatus(loadConfig())
    };
  } catch (error) {
    if (!dryRun) {
      updateGitHubBackupState(config, {
        lastRunAt: startedAt.toISOString(),
        lastError: error.message || String(error)
      });
    }
    throw error;
  }
}

function getGitHubBackupUploadWarnings(github, scan, { wouldPush = false } = {}) {
  const warnings = [];
  if (wouldPush) {
    warnings.push("Data security reminder: this backup upload may send private user data to the configured remote. Verify the remote owner, access controls, retention policy, and recovery need before uploading.");
    if (scan.issues.length > 0) {
      warnings.push(github.allowPlaintextSensitive
        ? "Sensitive-looking content was detected and plaintext upload is explicitly allowed; proceed only if this remote is approved for private backup data."
        : "Sensitive-looking content was detected; plaintext upload is blocked by default.");
    }
  } else if (scan.issues.length > 0) {
    warnings.push("Local backup contains private user data; protect the backup directory and use remote upload only after confirming data security.");
  }
  return warnings;
}

function githubBackupScheduleCommand(config, argv = []) {
  const github = getGitHubBackupConfig(config);
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "status";
  if (action === "status") {
    return getGitHubBackupScheduleStatus(github);
  }
  if (action === "install") {
    return installGitHubBackupSchedule(config, argv.slice(1));
  }
  if (action === "uninstall" || action === "remove") {
    return uninstallGitHubBackupSchedule(config, argv.slice(1));
  }
  throw new Error("Usage: ai-memory-hub backup schedule [status|install|uninstall] [--time HH:mm] [--task-name <name>] [--dry-run]");
}

function installGitHubBackupSchedule(config, argv = []) {
  const github = getGitHubBackupConfig(config);
  const time = normalizeScheduleTime(getOption(argv, "--time") || github.schedule.time);
  const taskName = getOption(argv, "--task-name") || github.schedule.taskName;
  const command = buildGitHubBackupScheduledTaskCommand(config.memoryDir);
  const args = ["/Create", "/F", "/SC", "DAILY", "/ST", time, "/TN", taskName, "/TR", command];
  if (hasFlag(argv, "--dry-run") || process.platform !== "win32") {
    return {
      ok: process.platform === "win32",
      apply: false,
      supported: process.platform === "win32",
      taskName,
      time,
      command: `schtasks.exe ${args.map(quoteShellArg).join(" ")}`
    };
  }
  const result = runProcess("schtasks.exe", args);
  updateGitHubBackupScheduleState(config, { enabled: true, time, taskName });
  return {
    ok: true,
    apply: true,
    supported: true,
    taskName,
    time,
    stdout: result.stdout.trim(),
    status: getGitHubBackupScheduleStatus(getGitHubBackupConfig(loadConfig()))
  };
}

function uninstallGitHubBackupSchedule(config, argv = []) {
  const github = getGitHubBackupConfig(config);
  const taskName = getOption(argv, "--task-name") || github.schedule.taskName;
  const args = ["/Delete", "/F", "/TN", taskName];
  if (hasFlag(argv, "--dry-run") || process.platform !== "win32") {
    return {
      ok: process.platform === "win32",
      apply: false,
      supported: process.platform === "win32",
      taskName,
      command: `schtasks.exe ${args.map(quoteShellArg).join(" ")}`
    };
  }
  const result = runProcess("schtasks.exe", args, { allowFailure: true });
  if (result.exitCode !== 0 && !/cannot find|does not exist/i.test(result.stderr + result.stdout)) {
    throw new Error(`schtasks delete failed: ${result.stderr || result.stdout}`);
  }
  updateGitHubBackupScheduleState(config, { enabled: false, taskName });
  return {
    ok: true,
    apply: true,
    supported: true,
    taskName,
    stdout: result.stdout.trim(),
    status: getGitHubBackupScheduleStatus(getGitHubBackupConfig(loadConfig()))
  };
}

function getGitHubBackupScheduleStatus(github = getGitHubBackupConfig()) {
  const taskName = github.schedule?.taskName || DEFAULT_GITHUB_BACKUP_TASK_NAME;
  const result = {
    enabled: github.schedule?.enabled === true,
    configuredTime: github.schedule?.time || "03:30",
    taskName,
    supported: process.platform === "win32",
    installed: false,
    raw: "",
    lastTaskResult: "",
    nextRunTime: "",
    error: ""
  };
  if (process.platform !== "win32") {
    result.error = "Windows Scheduled Tasks are only supported on win32.";
    return result;
  }
  const query = runProcess("schtasks.exe", ["/Query", "/TN", taskName, "/FO", "LIST", "/V"], { allowFailure: true });
  if (query.exitCode !== 0) {
    result.error = (query.stderr || query.stdout || "Task not found.").trim();
    return result;
  }
  result.installed = true;
  result.raw = query.stdout;
  result.lastTaskResult = extractListValue(query.stdout, "Last Result") || extractListValue(query.stdout, "上次运行结果");
  result.nextRunTime = extractListValue(query.stdout, "Next Run Time") || extractListValue(query.stdout, "下次运行时间");
  return result;
}

function getGitHubBackupExportFiles(memoryDir, github) {
  const include = github.include.length ? github.include : getBackupFileCatalog(memoryDir).map((file) => file.name);
  const exclude = github.exclude || [];
  return getBackupFileCatalog(memoryDir)
    .filter((file) => fs.existsSync(file.target))
    .filter((file) => matchesAnyBackupPattern(file.name, include))
    .filter((file) => !matchesAnyBackupPattern(file.name, exclude));
}

function getDefaultGitHubBackupInclude(memoryDir) {
  return getBackupFileCatalog(memoryDir)
    .map((file) => file.name)
    .filter((name) => name !== "config.json");
}

function exportGitHubBackupSnapshot(memoryDir, repoDir, files, { reason, startedAt, remoteUrl, branch }) {
  const root = path.resolve(repoDir);
  const snapshotDir = path.join(root, "snapshot");
  ensureSafeChildPath(snapshotDir, root);
  ensureDir(snapshotDir);
  const manifestPath = path.join(root, "manifest.json");
  const readmePath = path.join(root, "README.md");
  const existingManifest = readJsonSafe(manifestPath, {});

  const copied = [];
  for (const file of files) {
    const target = path.join(snapshotDir, file.name);
    ensureSafeChildPath(target, snapshotDir);
    fs.copyFileSync(file.target, target);
    copied.push({
      name: file.name,
      kind: file.kind,
      bytes: fs.statSync(target).size,
      sha256: getFileHash(target)
    });
  }

  for (const file of getBackupFileCatalog(memoryDir)) {
    if (!copied.some((item) => item.name === file.name)) {
      const stale = path.join(snapshotDir, file.name);
      if (fs.existsSync(stale) && fs.statSync(stale).isFile()) {
        fs.unlinkSync(stale);
      }
    }
  }

  const previousFiles = Array.isArray(existingManifest.files) ? existingManifest.files : [];
  const snapshotChanged = JSON.stringify(previousFiles) !== JSON.stringify(copied);
  const manifest = {
    generatedAt: startedAt.toISOString(),
    reason,
    source: "ai-memory-hub",
    remoteConfigured: Boolean(remoteUrl),
    branch,
    files: copied
  };
  if (snapshotChanged || !fs.existsSync(manifestPath) || !fs.existsSync(readmePath)) {
    writeJson(manifestPath, manifest);
    fs.writeFileSync(readmePath, renderGitHubBackupReadme(manifest), "utf8");
  }
  return {
    manifest: snapshotChanged || !existingManifest.generatedAt ? manifest : existingManifest,
    files: copied.map((file) => file.name)
  };
}

function ensureGitHubBackupRepo(github) {
  ensureDir(github.repoDir);
  if (!fs.existsSync(path.join(github.repoDir, ".git"))) {
    runGitCommand(github.repoDir, ["init"]);
  }
  ensureGitIdentity(github.repoDir);
  runGitCommand(github.repoDir, ["checkout", "-B", github.branch]);
  if (github.remoteUrl) {
    const existingRemote = runGitCommand(github.repoDir, ["remote", "get-url", "origin"], { allowFailure: true });
    if (existingRemote.ok) {
      runGitCommand(github.repoDir, ["remote", "set-url", "origin", github.remoteUrl]);
    } else {
      runGitCommand(github.repoDir, ["remote", "add", "origin", github.remoteUrl]);
    }
  }
}

function ensureGitIdentity(repoDir) {
  const name = runGitCommand(repoDir, ["config", "user.name"], { allowFailure: true });
  if (!name.ok || !name.stdout.trim()) {
    runGitCommand(repoDir, ["config", "user.name", "AI Memory Hub"]);
  }
  const email = runGitCommand(repoDir, ["config", "user.email"], { allowFailure: true });
  if (!email.ok || !email.stdout.trim()) {
    runGitCommand(repoDir, ["config", "user.email", "ai-memory-hub@localhost"]);
  }
}

function scanBackupFilesForSecrets(files) {
  const issues = [];
  const patterns = [
    { kind: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,255}\b/ },
    { kind: "openai-api-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
    { kind: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
    { kind: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
    { kind: "local-absolute-path", pattern: /\b[A-Za-z]:[\\/](?:Users|Project|Work|Workspace)[\\/][^\s"'<>]+/i },
    { kind: "internal-feishu-url", pattern: new RegExp("\\bhttps://(?:my|applink)\\.feishu\\.cn\\b", "i") }
  ];
  for (const file of files) {
    const stat = fs.statSync(file.target);
    if (stat.size > 5 * 1024 * 1024) {
      continue;
    }
    const text = fs.readFileSync(file.target, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (pattern.pattern.test(line)) {
          issues.push({
            file: file.name,
            line: index + 1,
            kind: pattern.kind
          });
        }
      }
    });
  }
  return {
    ok: issues.length === 0,
    issues
  };
}

function updateGitHubBackupState(config, patch) {
  const configPath = path.join(config.memoryDir, "config.json");
  const current = readJsonSafe(configPath, defaultConfig(config.memoryDir));
  const github = {
    ...getGitHubBackupConfig(config),
    ...patch,
    schedule: {
      ...getGitHubBackupConfig(config).schedule,
      ...(patch.schedule || {})
    }
  };
  writeJson(configPath, {
    ...current,
    backup: {
      ...(current.backup || {}),
      github
    }
  });
}

function updateGitHubBackupScheduleState(config, patch) {
  const github = getGitHubBackupConfig(config);
  updateGitHubBackupState(config, {
    schedule: {
      ...github.schedule,
      ...patch
    }
  });
}

function normalizeBackupPatternList(value, fallback = []) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const normalized = list.map((item) => String(item || "").trim()).filter(Boolean);
  return normalized.length ? normalized : [...fallback];
}

function matchesAnyBackupPattern(name, patterns = []) {
  if (!patterns.length) {
    return false;
  }
  return patterns.some((pattern) => {
    if (pattern === "*" || pattern === name) {
      return true;
    }
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(name);
  });
}

function normalizeScheduleTime(value) {
  const raw = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) {
    throw new Error("Schedule time must use HH:mm format.");
  }
  const [hours, minutes] = raw.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    throw new Error("Schedule time must be a valid 24-hour time.");
  }
  return raw;
}

function resolveConfiguredPath(value) {
  const raw = String(value || "").trim();
  const expanded = raw
    .replace(/^~(?=$|[\\/])/, os.homedir())
    .replace(/%USERPROFILE%/gi, os.homedir())
    .replace(/\$HOME/g, os.homedir());
  return path.resolve(expanded);
}

function assertSafeGitHubBackupRepoDir(memoryDir, repoDir) {
  const memoryRoot = path.resolve(memoryDir);
  const repoRoot = path.resolve(repoDir);
  if (repoRoot === memoryRoot || isPathInsideDirectory(repoRoot, memoryRoot)) {
    throw new Error("GitHub backup repoDir must be outside the memoryDir to avoid recursive backup.");
  }
  if (repoRoot === path.parse(repoRoot).root) {
    throw new Error("GitHub backup repoDir cannot be a filesystem root.");
  }
}

function ensureSafeChildPath(target, root) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  if (resolvedTarget !== resolvedRoot && !isPathInsideDirectory(resolvedTarget, resolvedRoot)) {
    throw new Error(`Refusing to write outside expected directory: ${target}`);
  }
}

function runGitCommand(repoDir, args, options = {}) {
  const git = resolveGitProcessCommand();
  return runProcess(git.command, ["-C", repoDir, ...args], {
    ...options,
    shell: git.usesShell
  });
}

function runProcess(command, args, options = {}) {
  const useWindowsShellLauncher = process.platform === "win32" && options.shell;
  const spawnCommand = useWindowsShellLauncher ? buildWindowsCmdLine(command, args) : command;
  const spawnArgs = useWindowsShellLauncher ? [] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    encoding: "utf8",
    windowsHide: true,
    shell: Boolean(options.shell)
  });
  const output = {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    command: `${command} ${args.map(quoteShellArg).join(" ")}`
  };
  if (!output.ok && !options.allowFailure) {
    throw new Error(`${command} failed (${output.exitCode}): ${output.stderr || output.stdout || result.error?.message || ""}`.trim());
  }
  return output;
}

function resolveGitProcessCommand() {
  const override = String(process.env.AI_MEMORY_HUB_GIT_COMMAND || "").trim();
  const command = override || resolveCommandPaths("git")
    .find((file) => classifyCommandPath(file) !== "powershell-shim") || "git";
  return {
    command,
    usesShell: shouldUseShellForCommand(command)
  };
}

function buildGitHubBackupScheduledTaskCommand(memoryDir) {
  return [
    quoteWindowsCommandArg(process.execPath),
    quoteWindowsCommandArg(__filename),
    "backup",
    "run",
    "--memory-dir",
    quoteWindowsCommandArg(memoryDir)
  ].join(" ");
}

function quoteWindowsCommandArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function quoteShellArg(value) {
  const raw = String(value);
  return /\s/.test(raw) ? `"${raw.replace(/"/g, '\\"')}"` : raw;
}

function extractListValue(text, key) {
  const line = String(text || "").split(/\r?\n/).find((item) => item.toLowerCase().startsWith(key.toLowerCase()));
  if (!line) {
    return "";
  }
  return line.slice(line.indexOf(":") + 1).trim();
}

function renderGitHubBackupReadme(manifest) {
  return `# AI Memory Hub Data Backup

This repository is maintained by \`ai-memory-hub backup run\`.

- Generated at: ${manifest.generatedAt}
- Files: ${manifest.files.length}

Restore manually by copying files from \`snapshot/\` back into the matching
AI Memory Hub data files, or use the local AMH restore tools for local backup
sets in \`.ai-memory/backups\`.
`;
}

function getBackupSummary(memoryDir, { limit = 50, daily = 7, weekly = 4, preSync = 20, pruneAfterSync = true } = {}) {
  const backups = listBackupDirectories(memoryDir);
  const retention = planBackupRetention(backups, { daily, weekly, preSync });
  const retentionByName = new Map(retention.backups.map((item) => [item.name, item]));
  return {
    dir: path.join(memoryDir, "backups"),
    count: backups.length,
    totalBytes: backups.reduce((sum, backup) => sum + backup.bytes, 0),
    totalDisplay: formatBytes(backups.reduce((sum, backup) => sum + backup.bytes, 0)),
    policy: {
      daily,
      weekly,
      preSync,
      pruneAfterSync,
      note: "Manual backups are protected; daily, weekly, and pre-sync backups are pruned only inside backups/."
    },
    retention: {
      keep: retention.keep.length,
      prune: retention.prune.length,
      pruneBytes: retention.prune.reduce((sum, backup) => sum + backup.bytes, 0),
      pruneDisplay: formatBytes(retention.prune.reduce((sum, backup) => sum + backup.bytes, 0))
    },
    backups: backups.slice(0, limit).map((backup) => ({
      ...backup,
      retention: retentionByName.get(backup.name)?.retention || "prune",
      retentionReason: retentionByName.get(backup.name)?.retentionReason || "outside retention policy"
    }))
  };
}

function pruneBackups(memoryDir, { apply = false, daily = 7, weekly = 4, preSync = 20 } = {}) {
  const backups = listBackupDirectories(memoryDir);
  const retention = planBackupRetention(backups, { daily, weekly, preSync });
  const backupsRoot = path.resolve(memoryDir, "backups");
  const pruned = [];
  if (apply) {
    for (const backup of retention.prune) {
      const target = path.resolve(backup.dir);
      if (!isPathInsideDirectory(target, backupsRoot)) {
        throw new Error(`Refusing to prune backup outside backups dir: ${backup.dir}`);
      }
      fs.rmSync(target, { recursive: true, force: true });
      pruned.push(backup);
    }
  }
  return {
    apply,
    policy: { daily, weekly, preSync },
    total: backups.length,
    keep: retention.keep.length,
    prune: retention.prune.length,
    pruneBytes: retention.prune.reduce((sum, backup) => sum + backup.bytes, 0),
    pruneDisplay: formatBytes(retention.prune.reduce((sum, backup) => sum + backup.bytes, 0)),
    pruned: pruned.map((backup) => backup.name),
    candidates: retention.prune.map((backup) => ({
      name: backup.name,
      createdAt: backup.createdAt,
      reason: backup.reason,
      bytes: backup.bytes,
      display: backup.display,
      retentionReason: backup.retentionReason
    }))
  };
}

function listBackupDirectories(memoryDir) {
  const dir = path.join(memoryDir, "backups");
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const backupDir = path.join(dir, entry.name);
      const manifestPath = path.join(backupDir, "manifest.json");
      const manifest = fs.existsSync(manifestPath) ? readJsonSafe(manifestPath) : {};
      const stat = fs.statSync(backupDir);
      const createdAt = manifest.createdAt || parseBackupTimestampFromName(entry.name) || stat.mtime.toISOString();
      const reason = manifest.reason || inferBackupReasonFromName(entry.name);
      const retentionTier = manifest.retention?.tier || inferBackupRetentionTier(reason);
      const bytes = getPathSize(backupDir);
      return {
        name: entry.name,
        dir: backupDir,
        createdAt,
        reason,
        retentionTier,
        retentionKey: manifest.retention?.key || inferBackupRetentionKey(retentionTier, createdAt),
        retentionPolicy: manifest.retention?.policy || "",
        files: Array.isArray(manifest.files) ? manifest.files : [],
        bytes,
        display: formatBytes(bytes),
        manifest: Boolean(manifest.createdAt)
      };
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function planBackupRetention(backups, { daily = 7, weekly = 4, preSync = 20 } = {}) {
  const keep = new Map();
  const markKeep = (backup, reason) => {
    if (!backup || keep.has(backup.name)) return;
    keep.set(backup.name, { ...backup, retention: "keep", retentionReason: reason });
  };
  const sorted = [...backups].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  markKeep(sorted[0], "latest");

  markProtectedBackups(sorted, markKeep);
  markTieredBackups(sorted, {
    tier: "daily",
    limit: daily,
    keyForBackup: (backup) => backup.retentionKey || formatBackupDay(backup.createdAt),
    label: "daily"
  }, markKeep);
  markTieredBackups(sorted, {
    tier: "weekly",
    limit: weekly,
    keyForBackup: (backup) => backup.retentionKey || getIsoWeekKey(backup.createdAt),
    label: "weekly"
  }, markKeep);
  markTieredBackups(sorted, {
    tier: "pre-sync",
    limit: preSync,
    keyForBackup: (backup) => backup.name,
    label: "pre-sync"
  }, markKeep);

  const keepList = sorted.map((backup) => keep.get(backup.name)).filter(Boolean);
  const prune = sorted
    .filter((backup) => !keep.has(backup.name))
    .map((backup) => ({ ...backup, retention: "prune", retentionReason: "outside retention policy" }));
  return {
    backups: [...keepList, ...prune].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    keep: keepList,
    prune
  };
}

function markProtectedBackups(backups, markKeep) {
  for (const backup of backups) {
    if (backup.retentionTier === "manual" || backup.retentionTier === "pre-pull" || backup.retentionTier === "protected") {
      markKeep(backup, `${backup.retentionTier}-protected`);
    }
  }
}

function markTieredBackups(backups, { tier, limit, keyForBackup, label }, markKeep) {
  const seen = new Set();
  for (const backup of backups) {
    if (backup.retentionTier !== tier) {
      continue;
    }
    const key = keyForBackup(backup);
    if (!key || seen.has(key)) {
      continue;
    }
    if (seen.size >= limit) {
      continue;
    }
    seen.add(key);
    markKeep(backup, `${label}-${seen.size}`);
  }
}

function parseBackupTimestampFromName(name) {
  const match = String(name || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!match) {
    return "";
  }
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}

function inferBackupReasonFromName(name) {
  return String(name || "").replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-?/, "") || "manual";
}

function inferBackupRetentionTier(reason) {
  const value = String(reason || "").toLowerCase();
  if (value.startsWith("pre-sync")) return "pre-sync";
  if (value.startsWith("daily")) return "daily";
  if (value.startsWith("weekly")) return "weekly";
  if (value.startsWith("pre-pull")) return "pre-pull";
  return "manual";
}

function inferBackupRetentionKey(tier, createdAt) {
  if (tier === "daily") return formatBackupDay(createdAt);
  if (tier === "weekly") return getIsoWeekKey(createdAt);
  if (tier === "pre-sync") return createdAtRetentionKey(createdAt);
  return "";
}

function createdAtRetentionKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatBackupDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function getIsoWeekKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isPathInsideDirectory(target, root) {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
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

function getMemoryEventSkipReason(normalizedEvent) {
  if (!normalizedEvent.text) {
    return "missing text";
  }
  if (looksSensitive(normalizedEvent.text)) {
    return "looks sensitive";
  }
  return "";
}

function readEventsWithLocations(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter((entry) => entry.line.trim())
    .map((entry) => ({
      file,
      lineNumber: entry.lineNumber,
      event: parseJsonlLine(entry.line, file, entry.lineNumber)
    }));
}

function parseJsonlLine(line, _file = "", _lineNumber = 0) {
  const raw = String(line || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    return {
      id: createId(raw),
      ts: new Date().toISOString(),
      source: "raw",
      text: raw,
      metadata: { kind: "raw" }
    };
  }
}

function formatEventLocation(entry) {
  return `${entry.file}:${entry.lineNumber}`;
}

function readEvents(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJsonlLine(line, file));
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

function isCorruptedRadioMessage(message) {
  return String(message.from || "").toLowerCase() === "raw" ||
    String(message.type || "").toLowerCase() === "raw" ||
    containsCorruptionMarker(message.text) ||
    containsCorruptionMarker(message.thread) ||
    containsCorruptionMarker(message.replyTo);
}

function readRadioMessages(memoryDir) {
  const file = path.join(memoryDir, "radio", "messages.jsonl");
  return readEvents(file).map(normalizeRadioMessage);
}

function normalizeRadioMessage(message) {
  const recovered = recoverEmbeddedJsonMessage(message.text);
  const content = recovered || message;
  return {
    id: message.id || content.id || createId(JSON.stringify(message)),
    ts: message.ts || content.ts || "",
    from: content.from || content.source || message.from || message.source || "unknown",
    to: content.to || message.to || "all",
    type: content.type || message.type || message.metadata?.kind || "note",
    text: content.text || message.text || "",
    thread: content.thread || message.thread || "",
    replyTo: content.replyTo || content.reply_to || message.replyTo || message.reply_to || "",
    project: content.project || message.project || "",
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
    worktree: normalizeDispatchWorktreeMetadata(message.worktree),
    promoted: Boolean(message.promoted),
    promotedAt: message.promotedAt || ""
  };
}

function recoverEmbeddedJsonMessage(value) {
  const text = String(value || "");
  if (!text || !containsCorruptionMarker(text)) {
    return null;
  }
  const candidate = text
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u001f\u007f]/g, "")
    .trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
  const hasSkillLayer = existing.includes(SHARED_SKILL_LAYER_MARKER_PREFIX);
  if (
    existing.includes(marker) &&
    hasSkillLayer &&
    existing.includes("Shared Agent Radio") &&
    existing.includes("Shared Task List") &&
    existing.includes("Shared Workflows") &&
    existing.includes("Contact Other AI Tools")
  ) {
    return;
  }
  if (existing.includes(marker)) {
    const sections = [];
    if (!hasSkillLayer) {
      sections.push(extractSection(
        snippet,
        "<!-- AI_MEMORY_HUB_SHARED_SKILL_LAYER",
        "<!-- /AI_MEMORY_HUB_SHARED_SKILL_LAYER -->"
      ));
    }
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

function renderInstallSnippet(target, memoryDir) {
  return renderTemplate(target.template, buildInstallTemplateValues(target.tool, memoryDir));
}

function buildInstallTemplateValues(tool, memoryDir) {
  const baseValues = {
    MEMORY_DIR: memoryDir,
    TOOL: tool,
    SHARED_SKILL_LAYER_VERSION
  };
  return {
    ...baseValues,
    SHARED_SKILL_LAYER: renderTemplate(readTemplate("shared-skill-layer.md"), baseValues)
  };
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] || "");
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

function readJsonSafe(file, fallback = {}) {
  try {
    return readJson(file);
  } catch {
    return fallback;
  }
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

function hasOption(argv, name) {
  return argv.indexOf(name) !== -1;
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

// Export policy functions for dashboard integration (Phase 2).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    resolvePermission,
    POLICY_OPERATIONS
  };
}
