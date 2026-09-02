// Runner 解析内核（P0-2 第23批下沉）。v3.0 重构目标：把「工具 runner 解析 + 缓存 +
// RUNNER_PROFILES 数据定义」这个多簇共用地基收拢到一个模块 —— dispatch 重试编排 /
// memory-health / startup 各簇都依赖 getRunnerProfile/getToolRunner/resolveToolRunnerUncached，
// 先沉它后续簇才有直连 import 的可能。
//
// 从 src/index.js 迁出：RUNNER_PROFILES 数据对象 + runnerResolutionCache 单例缓存 +
// getRunnerProfile / getKnownRunnerToolNames / getToolRunner / resolveToolRunnerUncached。
//
// 依赖说明（全自包含，无 index.js 内部符号 → 纯直连 import，无需 init 注入）：
// - node 内置 path / os（RUNNER_PROFILES 里拼命令行路径）
// - normalizeToolName → ./dispatch.js
// - resolveRunnerCommand / shouldUseShellForCommand → ./shell.js
// index.js 作调用方 import 回 RUNNER_PROFILES / getRunnerProfile / getKnownRunnerToolNames /
// getToolRunner / resolveToolRunnerUncached。本模块绝不 import src/index.js（无环）。

import os from "node:os";
import path from "node:path";

import { normalizeToolName } from "./dispatch.js";
import { resolveRunnerCommand, shouldUseShellForCommand } from "./shell.js";

export const RUNNER_PROFILES = {
  codex: {
    tool: "codex",
    commandCandidates: ["codex.cmd", "codex"],
    args: ["exec", "--sandbox", "danger-full-access", "--skip-git-repo-check"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "codex exec --sandbox danger-full-access --skip-git-repo-check <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
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
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "json-output", "session-resume"]
  },
  codebuddy: {
    tool: "codebuddy",
    commandCandidates: ["codebuddy.cmd", "codebuddy", "codebuddy-code"],
    args: ["-p", "--permission-mode", "bypassPermissions"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "codebuddy -p --permission-mode bypassPermissions <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
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
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output", "warning-filter"]
  },
  "qoder-cn": {
    tool: "qoder-cn",
    commandCandidates: ["qoder-cn.cmd", "qoder-cn"],
    args: ["run"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "qoder-cn run <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
  },
  opencode: {
    tool: "opencode",
    commandCandidates: ["opencode.cmd", "opencode", "qoder-cn.cmd", "qoder-cn"],
    args: ["run", "--auto"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "opencode run --auto <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    modelsCommand: ["models"],
    modelListFormat: "provider-model",
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
    modelArgs: (model) => ["--model", model],
    modelsCommand: ["models"],
    modelListFormat: "provider-model",
    capabilities: ["direct-dispatch", "argv-prompt", "text-output", "opencode-compatible"]
  },
  grok: {
    tool: "grok",
    commandCandidates: [
      path.join(os.homedir(), ".grok", "bin", "grok"),
      path.join(os.homedir(), ".grok", "bin", "grok.exe"),
      path.join(os.homedir(), ".local", "bin", "grok"),
      "grok.cmd",
      "grok"
    ],
    args: ["--always-approve", "-p"],
    promptMode: "argv",
    outputMode: "text",
    compactPrompt: true,
    preview: "grok --always-approve -p <prompt>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    modelsCommand: ["models"],
    modelListFormat: "grok",
    capabilities: ["direct-dispatch", "argv-prompt", "text-output"]
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
  coze: {
    tool: "coze",
    sharedStateOnly: true,
    reason: "coze (扣子) should currently be coordinated through shared tasks/radio or its own gateway; no verified direct prompt runner is configured"
  },
  openclaw: {
    tool: "openclaw",
    sharedStateOnly: true,
    reason: "openclaw should currently be coordinated through shared tasks/radio or gateway APIs; no verified direct prompt runner is configured"
  },
  antigravity: {
    tool: "antigravity",
    commandCandidates: [
      path.join(os.homedir(), "AppData", "Local", "agy", "bin", "agy.exe"),
      "agy.cmd",
      "agy"
    ],
    args: ["--print"],
    promptMode: "argv",
    outputMode: "text",
    compactPrompt: true,
    preview: "agy --print <prompt>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "argv-prompt", "text-output", "session-history"]
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

// runnerResolutionCache: module-level singleton sharing the same Map instance
// across getToolRunner / resolveToolRunnerUncached (moved together so they share state).
const runnerResolutionCache = new Map();

export function getRunnerProfile(tool) {
  return RUNNER_PROFILES[normalizeToolName(tool)] || null;
}

export function getKnownRunnerToolNames() {
  return Object.keys(RUNNER_PROFILES);
}

export function getToolRunner(tool) {
  const name = normalizeToolName(tool);
  if (runnerResolutionCache.has(name)) {
    return runnerResolutionCache.get(name);
  }
  const result = resolveToolRunnerUncached(name);
  runnerResolutionCache.set(name, result);
  return result;
}

export function resolveToolRunnerUncached(name) {
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
