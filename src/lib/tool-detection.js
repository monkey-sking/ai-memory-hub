// 工具检测（tool detection）与共享技能层安装（shared skill layer install）
//
// 从 src/index.js 下沉（v3.0 重构第 33 批）。本簇是单一连通簇：10 个函数只互相引用，
// 外加 14 个来自已沉 lib 的符号（tools-detect / util / format / cli / config / dispatch /
// runner-core / atomic-write）与 node 内置 fs、os、path —— 无 index.js 内部符号，
// 因此全部直连 import，无需 init 注入。
//
// 依赖方向（单向，勿反向引用 index.js）：
//   index.js -> tool-detection.js -> {tools-detect, util, format, cli, config,
//                                     dispatch, runner-core, atomic-write}
//
// 随迁的 5 个模块级状态（经核对在 index.js 中仅被本簇消费，无簇外引用）：
//   常量 4 个：TOOL_DETECTION_CACHE_TTL_MS / SHARED_SKILL_LAYER_VERSION /
//             SHARED_SKILL_LAYER_MARKER / SHARED_SKILL_LAYER_MARKER_PREFIX
//   单例 1 个：toolDetectionCache
// ⚠️ SHARED_SKILL_LAYER_MARKER 是 dead const（index.js 中无任何使用），但它依赖
//    SHARED_SKILL_LAYER_VERSION —— 按「dead const 随其依赖的常量一起迁走保持常量组完整」
//    原则随组迁来，勿留在 index 破引用。
// ⚠️ toolDetectionCache 是模块级单例：所有读写它的函数（getCachedDetectedTools /
//    refreshDetectedTools / invalidateToolDetectionCache）必须同在本模块，才能共享同一
//    module 实例。若拆开会导致缓存失效或状态不一致。
//
// 导出策略：只 export 被 index.js 或其它命令消费的 8 个符号 ——
//   detectTools / getCachedDetectedTools / refreshDetectedTools / invalidateToolDetectionCache /
//   appendIfMissing / renderInstallSnippet / syncSharedSkillLayer / initAllTools
//   （分别供 connectCommandDeps / dashboardTools / dashboardActions / appCommandDeps /
//    initCommand / detectCommand / installCommand / getStatusObject 消费）
// 其余 2 个为模块内部函数：buildInstallTemplateValues / enrichToolConnection。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeFileAtomic } from "../atomic-write.js";
import { ensureDir } from "./cli.js";
import { resolveMemoryDir } from "./config.js";
import { normalizeToolName } from "./dispatch.js";
import { extractSection, extractSectionBeforeAny, renderTemplate } from "./format.js";
import { getToolRunner } from "./runner-core.js";
import { detectVSCodeEnhanced, getInstallTargetForTool, getInstallTargets, readTemplate } from "./tools-detect.js";
import { inspectSharedMemoryInstructions, sharedSkillLayerActionLabel, summarizeDir } from "./util.js";

// 检测缓存 TTL 与共享技能层标记常量：仅本模块使用。

const TOOL_DETECTION_CACHE_TTL_MS = 30 * 1000;
const SHARED_SKILL_LAYER_VERSION = "1";
const SHARED_SKILL_LAYER_MARKER = `AI_MEMORY_HUB_SHARED_SKILL_LAYER v${SHARED_SKILL_LAYER_VERSION}`;
const SHARED_SKILL_LAYER_MARKER_PREFIX = "AI_MEMORY_HUB_SHARED_SKILL_LAYER";

let toolDetectionCache = null;

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

export function renderInstallSnippet(target, memoryDir) {
  return renderTemplate(target.template, buildInstallTemplateValues(target.tool, memoryDir));
}

function enrichToolConnection(tool, memoryDir, installTargets) {
  const target = getInstallTargetForTool(memoryDir, tool.name, installTargets);
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

export function detectTools(memoryDir = resolveMemoryDir()) {
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
      name: "codebuddy",
      kind: "cli-config",
      dir: path.join(home, ".codebuddy")
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
      name: "coze",
      kind: "app-state",
      dir: path.join(home, ".coze")
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
      name: "grok",
      kind: "cli-config",
      dir: path.join(home, ".grok")
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

  const installTargets = getInstallTargets(memoryDir);
  const tools = checks.map((check) => {
    // Use enhanced detection for vscode
    if (check.name === 'vscode') {
      const enhanced = detectVSCodeEnhanced();
      return enrichToolConnection(enhanced, memoryDir, installTargets);
    }

    return enrichToolConnection({
      name: check.name,
      kind: check.kind,
      installed: fs.existsSync(check.dir),
      dir: check.dir,
      files: fs.existsSync(check.dir) ? summarizeDir(check.dir) : []
    }, memoryDir, installTargets);
  });

  return tools;
}

export function getCachedDetectedTools(memoryDir = resolveMemoryDir()) {
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

export function refreshDetectedTools(memoryDir = resolveMemoryDir()) {
  const tools = detectTools(memoryDir);
  toolDetectionCache = { memoryDir, ts: Date.now(), tools };
  return tools;
}

export function invalidateToolDetectionCache(memoryDir = resolveMemoryDir()) {
  if (!toolDetectionCache || toolDetectionCache.memoryDir === memoryDir) {
    toolDetectionCache = null;
  }
}

export function appendIfMissing(file, snippet, marker) {
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
      writeFileAtomic(file, `${prefix}${addition}\n`, "utf8");
    }
    return;
  }
  const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : "";
  writeFileAtomic(file, `${prefix}${snippet.trim()}\n`, "utf8");
}

export function syncSharedSkillLayer(file, snippet, { apply = false } = {}) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const renderedSnippet = String(snippet || "").trim();
  const renderedStart = renderedSnippet.match(/<!--\s*AI_MEMORY_HUB_SHARED_SKILL_LAYER v[0-9]+\s*-->/);
  const renderedEndMarker = "<!-- /AI_MEMORY_HUB_SHARED_SKILL_LAYER -->";
  const renderedEnd = renderedStart
    ? renderedSnippet.indexOf(renderedEndMarker, renderedStart.index + renderedStart[0].length)
    : -1;
  const rendered = renderedStart && renderedEnd !== -1
    ? renderedSnippet.slice(renderedStart.index, renderedEnd + renderedEndMarker.length).trim()
    : renderedSnippet;
  const startMatch = existing.match(/<!--\s*AI_MEMORY_HUB_SHARED_SKILL_LAYER v[0-9]+\s*-->/);
  const endMarker = "<!-- /AI_MEMORY_HUB_SHARED_SKILL_LAYER -->";

  if (startMatch) {
    const start = startMatch.index;
    const end = existing.indexOf(endMarker, start + startMatch[0].length);
    if (end === -1) {
      return { status: "malformed", changed: false };
    }
    const endExclusive = end + endMarker.length;
    const current = existing.slice(start, endExclusive).trim();
    const normalize = (value) => value.replace(/\r\n/g, "\n");
    if (normalize(current) === normalize(rendered)) {
      return { status: "current", changed: false };
    }
    if (!apply) {
      return { status: "stale", changed: true };
    }
    writeFileAtomic(file, `${existing.slice(0, start)}${rendered}${existing.slice(endExclusive)}`, "utf8");
    return { status: "updated", changed: true };
  }

  if (!apply) {
    return { status: existing ? "missing" : "new", changed: true };
  }
  appendIfMissing(file, snippet, "Shared AI Memory");
  return { status: existing ? "upgraded" : "installed", changed: true };
}

export function initAllTools(memoryDir, { apply = false } = {}) {
  const detected = detectTools(memoryDir).filter((tool) => tool.installed);
  const detectedNames = new Set(detected.map((tool) => normalizeToolName(tool.name)));
  const targets = getInstallTargets(memoryDir).filter((target) =>
    detectedNames.has(normalizeToolName(target.tool))
  );

  console.log(`\nDetected ${detected.length} installed tool(s); ${targets.length} have a shared-memory adapter.`);

  if (targets.length === 0) {
    console.log("No matching adapters to install. Run \"ai-memory-hub detect\" to see what was found.");
    return;
  }

  if (!apply) {
    console.log("\n[dry-run] Would install adapters for:");
    for (const target of targets) {
      console.log(`  ${target.tool}: ${target.file}`);
    }
    console.log("\nRe-run with --apply to write these files.");
    return;
  }

  let installed = 0;
  for (const target of targets) {
    const snippet = renderInstallSnippet(target, memoryDir);
    ensureDir(path.dirname(target.file));
    const result = syncSharedSkillLayer(target.file, snippet, { apply: true });
    console.log(`${sharedSkillLayerActionLabel(result.status)} shared memory instructions for ${target.tool}: ${target.file}`);
    installed += 1;
  }
  console.log(`\nOnboarded ${installed} tool(s) into the shared memory hub.`);
}
