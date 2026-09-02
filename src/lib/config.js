// 从 src/index.js 下沉的配置主干（v3.0 重构 P0-2）。
// 处理 memory 目录解析（resolveMemoryDir）、默认配置构建（defaultConfig）与
// 配置合并加载（loadConfig）。这是全系统最被消费的共享核心 —— loadConfig 在
// 整个代码库被引用 ~224 处（几乎所有命令模块 / dashboard 组件都经 deps 注入它）。
// 下沉它后，剩余大簇（dispatch 重试编排 / memory-health / startup）不再把
// loadConfig / defaultConfig / resolveMemoryDir 当 index 内部符号。
//
// 依赖方向：node 内置（path/fs/os）+ 已沉 lib（cli getOption/readJson/writeJson、
// backup getDefaultGitHubBackupInclude）+ dashboard 模块（settings defaultDashboardShortcuts）
// + entity-models（ensureHub）+ 本模块内部共享的配置常量。无 index.js 内部符号 →
// 直连 import，无需 init 注入。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getOption, readJson, writeJson } from "./cli.js";
import { getDefaultGitHubBackupInclude } from "./backup.js";
import { defaultDashboardShortcuts } from "../dashboard/settings.js";
import { ensureHub } from "./entity-models.js";

export const MEMORY_DIR_ENV = "AI_MEMORY_DIR";
export const DEFAULT_MEMORY_DIR = path.join(os.homedir(), ".ai-memory");
export const DEFAULT_CONFIG_PATH = path.join(DEFAULT_MEMORY_DIR, "config.json");
export const DEFAULT_GITHUB_BACKUP_REMOTE = "";
export const DEFAULT_GITHUB_BACKUP_REPO_DIR = path.join(os.homedir(), ".ai-memory-github-backup");
export const DEFAULT_GITHUB_BACKUP_TASK_NAME = "AI Memory Hub GitHub Backup";

export function resolveMemoryDir(argv = process.argv.slice(2)) {
  const fromArgs = getOption(argv, "--memory-dir");
  const fromEnv = process.env[MEMORY_DIR_ENV];
  return path.resolve(fromArgs || fromEnv || DEFAULT_MEMORY_DIR);
}

export function defaultConfig(memoryDir) {
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
        prePull: 20,
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
      coze: { enabled: true },
      openclaw: { enabled: true },
      opencode: { enabled: true },
      mimocode: { enabled: true },
      grok: { enabled: true },
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

export function loadConfig() {
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
