// GitHub backup 领域簇。v3.0 重构 P0-2 第20批下沉。
// 从 src/index.js 5389-5801 迁出，保持函数体逐字节一致。
//
// 依赖说明（遵循既有下沉判据：含 index.js 内部符号 → deps 注入）：
// - lib/ 模块函数（readJsonSafe / writeJson / hasFlag / hasOption / getOption /
//   runGitCommand / quoteShellArg / runProcess / quoteWindowsCommandArg /
//   scanBackupFilesForSecrets / getGitHubBackupUploadWarnings /
//   normalizeBackupPatternList / normalizeScheduleTime / resolveConfiguredPath /
//   extractListValue / getGitHubBackupExportFiles / assertSafeGitHubBackupRepoDir /
//   ensureGitHubBackupRepo / exportGitHubBackupSnapshot）→ 直连 import。
// - index.js 内部符号（loadConfig / defaultConfig / resolveMemoryDir /
//   DEFAULT_GITHUB_BACKUP_TASK_NAME / 入口 __filename）→ 经 initGithubBackupDeps(deps) 注入。
//   本模块绝不 import src/index.js（保持依赖图无环）。
//
// 注：buildGitHubBackupScheduledTaskCommand 原用 __filename（=src/index.js）。
// 迁到 src/lib/ 后 __dirname/__filename 漂移，改用注入的 entryFile（=src/index.js 绝对路径）。

import fs from "node:fs";
import path from "node:path";

import { readJsonSafe, writeJson, getOption, hasOption, hasFlag } from "./cli.js";
import { getGitHubBackupUploadWarnings, normalizeBackupPatternList, normalizeScheduleTime, resolveConfiguredPath, extractListValue, getGitHubBackupExportFiles, assertSafeGitHubBackupRepoDir, ensureGitHubBackupRepo, exportGitHubBackupSnapshot } from "./backup.js";
import { runProcess, runGitCommand, quoteWindowsCommandArg, quoteShellArg } from "./shell.js";
import { scanBackupFilesForSecrets } from "./util.js";

// index.js 内部符号经 init 注入（由 src/index.js 在模块导入后立即调用）。
// 存于模块作用域，避免每个导出函数签名引入 deps 参数、保持调用点与函数体不变。
let loadConfig = () => { throw new Error("github-backup: loadConfig not injected"); };
let defaultConfig = () => { throw new Error("github-backup: defaultConfig not injected"); };
let resolveMemoryDir = () => { throw new Error("github-backup: resolveMemoryDir not injected"); };
let DEFAULT_GITHUB_BACKUP_TASK_NAME = "AI Memory Hub GitHub Backup";
let entryFile = "";

export function initGithubBackupDeps(deps) {
  loadConfig = deps.loadConfig;
  defaultConfig = deps.defaultConfig;
  resolveMemoryDir = deps.resolveMemoryDir;
  DEFAULT_GITHUB_BACKUP_TASK_NAME = deps.DEFAULT_GITHUB_BACKUP_TASK_NAME;
  entryFile = deps.entryFile;
}

export function getGitHubBackupConfig(config = loadConfig()) {
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

export function configureGitHubBackup(config, argv = []) {
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

export function getGitHubBackupStatus(config = loadConfig()) {
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

export function runGitHubBackup(config, argv = []) {
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


export function githubBackupScheduleCommand(config, argv = []) {
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

export function installGitHubBackupSchedule(config, argv = []) {
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

export function uninstallGitHubBackupSchedule(config, argv = []) {
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

export function getGitHubBackupScheduleStatus(github = getGitHubBackupConfig()) {
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

export function updateGitHubBackupState(config, patch) {
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

export function updateGitHubBackupScheduleState(config, patch) {
  const github = getGitHubBackupConfig(config);
  updateGitHubBackupState(config, {
    schedule: {
      ...github.schedule,
      ...patch
    }
  });
}

export function buildGitHubBackupScheduledTaskCommand(memoryDir) {
  return [
    quoteWindowsCommandArg(process.execPath),
    quoteWindowsCommandArg(entryFile),
    "backup",
    "run",
    "--memory-dir",
    quoteWindowsCommandArg(memoryDir)
  ].join(" ");
}
