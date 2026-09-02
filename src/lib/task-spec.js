// Task-spec subsystem（v3.0 重构 P0-2 下沉）。
// 从 src/index.js 迁出：任务规格文件的加载、校验、规范化与进程执行。
// 只依赖 node 内置模块与其它 lib 模块（cli/format/util/shell），
// 不依赖 index.js 内部符号，可安全复用。

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { getOption, readJson, ensureDir } from "./cli.js";
import { trimOutput } from "./format.js";
import { writeFileAtomic } from "../atomic-write.js";
import {
  resolveCommandPaths,
  choosePreferredCommandPath,
  shouldUseShellForCommand,
  buildWindowsCmdLine
} from "./shell.js";

export const DEFAULT_TASK_SPEC_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_TASK_SPEC_FILES = [
  ".tasks.json",
  "task-specs.json",
  path.join(".ai-memory", "task-specs.json")
];

export function normalizeTaskSpecEnv(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)]));
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

export function normalizeTaskSpecList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => item && typeof item === "object" ? item : String(item));
}

export function normalizeTaskSpecLogs(logs) {
  if (!logs || typeof logs !== "object" || Array.isArray(logs)) {
    return {};
  }
  return {
    stdout: logs.stdout ? String(logs.stdout) : "",
    stderr: logs.stderr ? String(logs.stderr) : ""
  };
}

export function selectPlatformCommand(commandSpec) {
  if (process.platform === "win32" && commandSpec.windowsCommand) {
    return commandSpec.windowsCommand;
  }
  return commandSpec.command || commandSpec.windowsCommand || "";
}

export function getTaskSpecProcessStatus(completed) {
  if (completed?.error?.code === "ETIMEDOUT") {
    return "timed_out";
  }
  return completed?.status === 0 ? "passed" : "failed";
}

export function resolveInside(root, target) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, target);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${target}`);
  }
  return resolved;
}

export function loadTaskSpecContext(argv) {
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

export function resolveTaskSpecFile(argv, projectRoot) {
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

export function resolveTaskSpecFromArgs(argv, taskId) {
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

export function validateTaskSpecDocument(document) {
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

export function normalizeTaskSpecs(document) {
  const rawTasks = document.tasks || document.commands || {};
  if (Array.isArray(rawTasks)) {
    return rawTasks.map((task) => normalizeTaskSpec(task));
  }
  if (rawTasks && typeof rawTasks === "object") {
    return Object.entries(rawTasks).map(([id, task]) => normalizeTaskSpec({ id, ...(task || {}) }));
  }
  return [];
}

export function normalizeTaskSpec(task) {
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

export function normalizeTaskSpecCommand(commandSpec) {
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

export function normalizeTaskSpecVerify(verify) {
  if (!verify) {
    return [];
  }
  const entries = Array.isArray(verify) ? verify : [verify];
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => normalizeTaskSpecCommand(entry));
}

export function runTaskSpec(task, { projectRoot, runVerify = true, allowOutsideCwd = false } = {}) {
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

export function runTaskSpecProcess(commandSpec, { projectRoot, phase, inherit = {}, allowOutsideCwd = false } = {}) {
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

// 任务规格 runner 辅助函数：从 util.js 迁入以收敛 task-spec 领域逻辑并
// 打破 util.js 与 task-spec.js 之间的循环依赖。

export function summarizeTaskSpec(task) {
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

export function writeTaskSpecProcessLogs(projectRoot, logs, completed) {
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
    writeFileAtomic(file, String(text || ""), "utf8");
    written[stream] = path.relative(projectRoot, file).replace(/\\/g, "/");
  }
  return written;
}

export function resolveTaskSpecCwd(projectRoot, cwd, allowOutsideCwd) {
  const resolved = path.resolve(projectRoot, cwd || ".");
  if (!allowOutsideCwd) {
    resolveInside(projectRoot, path.relative(projectRoot, resolved) || ".");
  }
  return resolved;
}
