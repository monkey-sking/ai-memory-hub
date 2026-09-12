// sync / status / record / doctor 命令核（command cores）
//
// 从 src/index.js 下沉（v3.0 重构第 34 批）。本簇是「命令实现主体」而非调用图叶子：
//   syncIndexedEvents / getStatusObject / recordCommand / inspectRunnerTool 四个命令核，
//   外加三个只被本簇消费的辅助件（runRunnerProbe / readLockStatus / isProjectVisible）
//   与一个常量 PROJECT_VISIBLE_STATUSES。
//
// 依赖方向（单向，勿反向引用 index.js）：
//   index.js -> sync-status.js -> {cli, config, io, format, memory-normalize, memory-index,
//                                  entity-*, runner-core, shell, tools-detect, tool-detection,
//                                  daemon-state, dispatch*, backup, radio-messages, util,
//                                  event-writer, fts5-search, relations}
//
// init 注入（2 个 index.js 内部符号，无法直连 import）：
//   dashboardTools              —— index.js:346 的 createDashboardToolsApi 工厂对象，
//                                  另有 4 处簇外消费（dashboardActions / appCommandDeps /
//                                  capabilities 相关），故不能随簇迁。
//   runAutomaticBackupStrategy  —— 属 backup/update 簇（index.js:2146），另有
//                                  memoryCommandDeps 消费。⚠️ 这个注入**要长期保留**：
//                                  2026-09-11 复核 `find-clusters` 证实该簇与 `main` 等
//                                  共 12 个函数处在同一连通簇里，而 main 是 CLI 入口
//                                  （依赖面即整个 index.js），永不可能下沉 —— 整簇无解，
//                                  第 35 批已判定「不做」（见 docs/REFACTOR-V3-TODO.md）。
//                                  别再指望「该簇下沉后改直连 import」。
//   ⚠️ initSyncStatusDeps 必须在 dashboardTools 的 const 定义之后调用（TDZ：const 不提升）。
//
// 导出策略：export 被 index.js 消费的 6 个符号 ——
//   syncIndexedEvents（syncCommand）/ getStatusObject（statusCommand + 3 处 deps）/
//   recordCommand（recordCommandDeps + main）/ inspectRunnerTool（doctorCommand）/
//   isProjectVisible（index.js:1781 project 过滤）/ PROJECT_VISIBLE_STATUSES（index.js:286）
// 其余 2 个为模块内部函数：runRunnerProbe / readLockStatus（仅本簇消费）。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendJsonl } from "../event-writer.js";
import { createSearchDb, rebuildIndex, tokenizeChinese } from "../fts5-search.js";
import { recordMemoryRelations } from "../relations.js";
import { countBackupDirs } from "./backup.js";
import { countJsonlFiles, createId, getOption, positionalArgs, readJson, writeJson } from "./cli.js";
import { loadConfig, resolveMemoryDir } from "./config.js";
import { buildDaemonStatus } from "./daemon-state.js";
import { isRelayRetryDue, isRelayRetryRunnable } from "./dispatch-retry.js";
import { invokeRunnerCommand } from "./dispatch-run.js";
import { normalizeRunnerStderr, normalizeToolName } from "./dispatch.js";
import { isHiddenProjectId } from "./entity-index.js";
import { ensureHub, rebuildEventSourcedProjections } from "./entity-models.js";
import { readProjects, readTasks, readWorkflows } from "./entity-repo.js";
import { formatEventLocation, getMemoryEventSkipReason, trimOutput } from "./format.js";
import { archiveInbox, describeLock, readEvents, readEventsWithLocations, readLatestRelayStatusByThread, readLockEvents, writeInboxEvents } from "./io.js";
import { rebuildMemoryOutputs } from "./memory-index.js";
import { normalizeMemoryEvent, normalizeMemoryKind, normalizeMemoryMetadata, parseListOption, readLedger } from "./memory-normalize.js";
import { readRadioMessages } from "./radio-messages.js";
import { getRunnerProfile, getToolRunner } from "./runner-core.js";
import { getRunnerDoctorWarnings } from "./shell.js";
import { getCachedDetectedTools } from "./tool-detection.js";
import { getInstallTargetForTool } from "./tools-detect.js";
import { inspectSharedMemoryInstructions } from "./util.js";

// index.js 内部符号经 init 注入（由 src/index.js 在 dashboardTools 定义之后调用）。
let dashboardTools = null;
let runAutomaticBackupStrategy = null;

export function initSyncStatusDeps(deps) {
  dashboardTools = deps.dashboardTools;
  runAutomaticBackupStrategy = deps.runAutomaticBackupStrategy;
}

export const PROJECT_VISIBLE_STATUSES = ["active", "paused", "planning"];

/**
 * 让 FTS5 搜索索引跟上账本。
 *
 * 为什么需要：`recordCommand`（`amh record`）会把新事件**增量**写进 FTS5，
 * 但 `sync` 是直接 `appendJsonl` 进账本的，**完全不碰 FTS5** —— 于是所有经 inbox
 * 进来的记录（尤其是 capture 抓来的全部 turn）永远进不了搜索索引。
 *
 * 而 `amh search` 的默认路径只要发现 FTS5 非空就直接走 FTS5 并 return，
 * 根本到不了能搜全账本的 legacy 分支 —— 索引一旦落后就**静默**少搜。
 *
 * 真实 hub 实测（2026-09-12）：FTS5 只有 117 条、`lastRebuilt: "never"`，
 * 而账本 772 条 → 默认搜索有 85% 的记忆看不见。`amh search rebuild` 后
 * 是 892 条（memory 772 + radio 51 + task 65 + workflow 4），刚捕获的 turn 立刻排第一。
 *
 * 用「整体重建」而不是增量插入：重建 ~900 条实测仅 **0.09 秒**，
 * 幂等且能顺带治好已经落后的索引，比增量补齐更简单也更安全。
 */
function rebuildSearchIndex(config) {
  let db = null;
  try {
    db = createSearchDb(config.memoryDir);
    return rebuildIndex(db, config.memoryDir);
  } catch {
    // 搜索索引重建失败不该让 sync 本身失败 —— `amh search rebuild` 随时能修。
    return 0;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
  }
}

export function syncIndexedEvents(config, dryRun, allowSensitive = false) {
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
    let searchIndexed = 0;
    if (!dryRun) {
      rebuildMemoryOutputs(config, readLedger(config.memoryDir));
      // 这条「无事可做」的早退路径也必须重建搜索索引：它是常态路径
      // （capture 定时器多数轮次都扫到 0 条新 turn），漏在这里会让落后的
      // FTS5 一直落后下去 —— 正是这个 bug 当初能长期潜伏的原因。
      searchIndexed = rebuildSearchIndex(config);
    }
    const projections = dryRun ? null : rebuildEventSourcedProjections(config.memoryDir);
    console.log("No pending memory events.");
    if (projections) {
      console.log(`Rebuilt event-sourced projections: tasks=${projections.tasks}, workflows=${projections.workflows}, projects=${projections.projects}.`);
    }
    if (searchIndexed) {
      console.log(`Rebuilt FTS5 search index: ${searchIndexed} record(s).`);
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
    let skipReason = getMemoryEventSkipReason(normalizedEvent);
    if (skipReason === "looks sensitive" && allowSensitive) {
      skipReason = "";
    }
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
      device: normalizedEvent.device || normalizedEvent.metadata?.device || os.hostname(),
      metadata: normalizedEvent.metadata || {}
    };

    if (dryRun) {
      console.log(`[dry-run] Would index: ${record.text}`);
      synced++;
      continue;
    }

    appendJsonl(path.join(config.memoryDir, "memories", "ledger.jsonl"), record);
    recordMemoryRelations(config.memoryDir, record);
    newRecords.push(record);
    knownIds.add(localEventId);
    synced++;
  }

  if (!dryRun) {
    const updatedLedger = [...ledger, ...newRecords];
    rebuildMemoryOutputs(config, updatedLedger);
    const projections = rebuildEventSourcedProjections(config.memoryDir);
    const searchIndexed = rebuildSearchIndex(config);
    writeJson(path.join(config.memoryDir, "state", "last-sync.json"), {
      syncedAt: new Date().toISOString(),
      indexed: newRecords.length,
      pending: remaining.length,
      projections,
      searchIndexed,
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
    if (lastSync.searchIndexed) {
      console.log(`Rebuilt FTS5 search index: ${lastSync.searchIndexed} record(s).`);
    }
  }
}

export function getStatusObject() {
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

export function inspectRunnerTool(tool, { runProbes = false, skipVersion = false, timeoutMs = 5000, memoryDir = resolveMemoryDir() } = {}) {
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

export function recordCommand(argv) {
  const text = positionalArgs(argv).join(" ").trim();
  if (!text) {
    throw new Error("Usage: ai-memory-hub record <text> [--source tool] [--kind preference] [--project name] [--skills id1,id2] [--task task-id] [--workflow workflow-id] [--tags a,b] [--ttl days] [--priority high|normal|low]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);
  const source = getOption(argv, "--source") || "manual";
  const kind = normalizeMemoryKind(getOption(argv, "--kind") || "note");
  // OPC v1.1 P1: memory decay support
  const ttlDays = getOption(argv, "--ttl") || "";
  const priority = getOption(argv, "--priority") || "normal";
  // OPC v1.1 P2: token counting support
  const tokenCount = getOption(argv, "--tokens") || "";
  const ttlDate = ttlDays ? new Date(Date.now() + parseInt(ttlDays, 10) * 86400000).toISOString() : "";
  const taskIds = parseListOption(getOption(argv, "--task"));
  const workflowIds = parseListOption(getOption(argv, "--workflow"));
  const metadata = normalizeMemoryMetadata({
    kind,
    project: getOption(argv, "--project") || "",
    skills: parseListOption(getOption(argv, "--skills")),
    refs: {
      ...(taskIds.length ? { taskId: taskIds.length === 1 ? taskIds[0] : taskIds } : {}),
      ...(workflowIds.length ? { workflowId: workflowIds.length === 1 ? workflowIds[0] : workflowIds } : {})
    },
    tags: parseListOption(getOption(argv, "--tags")),
    scope: getOption(argv, "--scope") || "",
    confidence: getOption(argv, "--confidence") || ""
  });
  // Add decay fields
  metadata.priority = ["high", "normal", "low"].includes(priority) ? priority : "normal";
  if (ttlDate) metadata.expiresAt = ttlDate;

  const event = {
    id: createId(text),
    ts: new Date().toISOString(),
    device: os.hostname(),
    source,
    text,
    metadata,
    tokens: tokenCount ? parseInt(tokenCount, 10) : 0
  };

  appendJsonl(path.join(config.memoryDir, "inbox", "events.jsonl"), event);
  const relations = recordMemoryRelations(config.memoryDir, event);

  // Incrementally update FTS5 search index
  let db = null;
  try {
    db = createSearchDb(config.memoryDir);
    const content = tokenizeChinese(text);
    const tags = Array.isArray(metadata.tags) ? metadata.tags.join(" ") : "";
    const project = metadata.project || "";
    db.prepare(`INSERT INTO search_index (entity_type, entity_id, title, content, kind, project, tags, ts)
      VALUES ('memory', ?, '', ?, ?, ?, ?, ?)`).run(event.id, content, kind, project, tokenizeChinese(tags), event.ts);
  } catch { /* index not yet built or unavailable */ }
  finally { if (db) try { db.close(); } catch {} }

  console.log(`Recorded memory event: ${event.id}`);
  return { event, relations };
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

export function isProjectVisible(project) {
  return PROJECT_VISIBLE_STATUSES.includes(project.status) && !isHiddenProjectId(project.id);
}
