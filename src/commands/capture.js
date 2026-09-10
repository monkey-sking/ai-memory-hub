// capture 命令簇：自动 turn 捕获 + 召回注入
//
// 解决 AMH 最大的一处短板：记忆只靠 agent 自觉执行 amh record，人一懒记忆就断。
// capture 反过来做——直接读各工具落在本地的 transcript，把「完整对话轮次」
// 抽出来写进 inbox，再走既有的 sync 管道入账本。
//
// 依赖注入：本模块不 import src/index.js，跨模块能力全部走 deps。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendJsonl } from "../event-writer.js";
import { getOption, hasFlag, parsePositiveIntegerOption, positionalArgs } from "../lib/cli.js";
import {
  getCaptureFileProgress,
  readCaptureState,
  recordCaptureFile,
  resetCaptureState,
  summarizeCaptureState,
  writeCaptureState
} from "../lib/capture-state.js";
import {
  CAPTURE_SOURCE_DEFS,
  assignTurnIds,
  findCaptureFiles,
  listCaptureTools,
  parseCaptureFile,
  renderTurnText
} from "../lib/capture-sources.js";

const DEFAULT_SCAN_LIMIT = 200;
const DEFAULT_RECALL_LIMIT = 8;
// 召回是给 agent 注入上下文用的，单条必须短——否则几条就把上下文窗口吃满。
const RECALL_TEXT_LIMIT = 320;

function resolveTools(argv) {
  const requested = getOption(argv, "--tool") || getOption(argv, "--source") || "";
  if (!requested) return listCaptureTools();
  const tools = requested
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const tool of tools) {
    if (!CAPTURE_SOURCE_DEFS[tool]) {
      throw new Error(`Unknown capture source "${tool}". Known: ${listCaptureTools().join(", ")}`);
    }
  }
  return tools;
}

export function captureCommand(argv, deps) {
  const action = argv[0] || "scan";
  const rest = argv.slice(1);
  if (action === "scan") return captureScanCommand(rest, deps);
  if (action === "sources") return captureSourcesCommand(rest, deps);
  if (action === "status") return captureStatusCommand(rest, deps);
  if (action === "reset") return captureResetCommand(rest, deps);
  if (action === "recall") return captureRecallCommand(rest, deps);
  throw new Error("Usage: ai-memory-hub capture <scan|sources|status|reset|recall> [options]");
}

/** 列出本机各源的 transcript 文件数量，便于判断能不能扫到东西。 */
export function captureSourcesCommand(argv, deps) {
  const tools = resolveTools(argv);
  const sources = tools.map((tool) => {
    const files = findCaptureFiles(tool);
    return {
      tool,
      label: CAPTURE_SOURCE_DEFS[tool].label,
      roots: CAPTURE_SOURCE_DEFS[tool].roots,
      files: files.length
    };
  });
  console.log(JSON.stringify({ ok: true, sources }, null, 2));
}

export function captureStatusCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const state = readCaptureState(config.memoryDir);
  const tools = resolveTools(argv);
  const summary = summarizeCaptureState(state).filter((item) => tools.includes(item.tool));
  console.log(JSON.stringify({
    ok: true,
    memoryDir: config.memoryDir,
    stateFile: path.join(config.memoryDir, "state", "capture-state.json"),
    sources: summary
  }, null, 2));
}

export function captureResetCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const tool = getOption(argv, "--tool") || "";
  if (tool && !CAPTURE_SOURCE_DEFS[tool]) {
    throw new Error(`Unknown capture source "${tool}". Known: ${listCaptureTools().join(", ")}`);
  }
  const state = readCaptureState(config.memoryDir);
  const next = resetCaptureState(state, tool);
  writeCaptureState(config.memoryDir, next);
  console.log(JSON.stringify({ ok: true, reset: tool || "all" }, null, 2));
}

/**
 * 扫描 transcript 并写入 inbox。
 *
 * 幂等的关键：turnId 由「工具 + 文件路径哈希 + 文件内序号」确定性生成，
 * 重复扫描算出同一个 id，sync 的 knownIds 去重会直接跳过，不会重复入库。
 */
export function captureScanCommand(argv, deps) {
  const result = runCaptureScan(argv, deps);
  console.log(JSON.stringify(result, null, 2));
}

/** 扫描并返回结果（不打印），供 watch 这类周期性调用方安静地跑。 */
export function runCaptureScan(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const dryRun = hasFlag(argv, "--dry-run");
  const force = hasFlag(argv, "--force");
  const shouldSync = hasFlag(argv, "--sync");
  const projectOverride = getOption(argv, "--project") || "";
  const rawLimit = getOption(argv, "--limit");
  const limit = rawLimit ? parsePositiveIntegerOption(rawLimit, "--limit") : DEFAULT_SCAN_LIMIT;
  const tools = resolveTools(argv);

  const state = readCaptureState(config.memoryDir);
  const inboxPath = path.join(config.memoryDir, "inbox", "events.jsonl");
  const perTool = [];
  const collected = [];
  let skippedTotal = 0;

  for (const tool of tools) {
    const files = findCaptureFiles(tool);
    let scanned = 0;
    let turns = 0;
    let skippedUnchanged = 0;
    for (const file of files) {
      if (collected.length >= limit) break;
      const progress = force
        ? { consumed: 0, unchanged: false, exhausted: false }
        : getCaptureFileProgress(state, tool, file.path, file);
      if (progress.exhausted) {
        skippedUnchanged += 1;
        skippedTotal += 1;
        continue;
      }
      const parsed = assignTurnIds(parseCaptureFile(tool, file.path), tool, file.path);
      const room = limit - collected.length;
      const take = parsed.slice(progress.consumed, progress.consumed + room);
      if (take.length === 0) {
        if (progress.unchanged) {
          skippedUnchanged += 1;
          skippedTotal += 1;
        }
        continue;
      }
      collected.push(...take);
      turns += take.length;
      scanned += 1;
      // 记「消费到第几条」而不是「已扫过」：大文件要分几轮才吃得完，
      // 只记扫过会让进度停在第一次截断处。
      if (!dryRun) {
        recordCaptureFile(state, tool, file.path, file, parsed.length, progress.consumed + take.length);
      }
    }
    perTool.push({ tool, files: files.length, scanned, skippedUnchanged, turns });
    if (collected.length >= limit) break;
  }

  const selected = collected.slice(0, limit);
  const events = selected.map((turn) => ({
    id: turn.turnId,
    ts: turn.tsEnd || turn.ts || new Date().toISOString(),
    device: os.hostname(),
    source: turn.tool,
    text: renderTurnText(turn),
    metadata: {
      kind: "turn",
      project: projectOverride || turn.project || "",
      tags: ["auto-capture", turn.tool],
      scope: "",
      confidence: 0.6,
      refs: {
        sessionId: turn.sessionId || "",
        turnId: turn.turnId,
        cwd: turn.cwd || ""
      }
    }
  }));

  if (!dryRun && events.length > 0) {
    fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
    for (const event of events) appendJsonl(inboxPath, event);
    writeCaptureState(config.memoryDir, state);
  }

  const result = {
    ok: true,
    dryRun,
    force,
    limit,
    scannedFiles: perTool.reduce((sum, item) => sum + item.scanned, 0),
    skippedUnchanged: skippedTotal,
    turnsFound: collected.length,
    eventsWritten: dryRun ? 0 : events.length,
    perTool,
    sample: events.slice(0, 3).map((event) => ({ id: event.id, source: event.source, text: event.text.slice(0, 160) }))
  };

  if (shouldSync && !dryRun && events.length > 0 && deps.syncCommand) {
    deps.syncCommand([]);
  }

  return result;
}

/**
 * 召回：输出一段可直接注入 agent 上下文的 markdown。
 *
 * 这是 Memmy turn.start 那一侧的对应物——光有捕获没有召回，记忆还是死的。
 * 输出刻意精简，避免把上下文窗口吃满。
 */
export function captureRecallCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const query = positionalArgs(argv).join(" ").trim();
  if (!query) {
    throw new Error("Usage: ai-memory-hub capture recall \"<query>\" [--project name] [--limit 8]");
  }
  const project = getOption(argv, "--project") || "";
  const rawLimit = getOption(argv, "--limit");
  const limit = rawLimit ? parsePositiveIntegerOption(rawLimit, "--limit") : DEFAULT_RECALL_LIMIT;
  const format = getOption(argv, "--format") || "markdown";

  const hits = deps.searchMemoriesForContext(config.memoryDir, query, project, limit);
  if (!hits || hits.length === 0) {
    if (format === "json") {
      console.log(JSON.stringify({ ok: true, query, project, count: 0, results: [] }, null, 2));
    } else {
      console.log("");
    }
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify({
      ok: true,
      query,
      project,
      count: hits.length,
      results: hits.map((hit) => {
        const text = String(hit.text || "").replace(/\s+/g, " ").trim();
        return {
          source: hit.source || "",
          kind: hit.kind || hit.metadata?.kind || "",
          project: hit.project || "",
          text: text.length > RECALL_TEXT_LIMIT ? `${text.slice(0, RECALL_TEXT_LIMIT)}…` : text
        };
      })
    }, null, 2));
    return;
  }

  const lines = ["<!-- amh-recall -->", "## Relevant memory (auto-recalled)", ""];
  for (const hit of hits) {
    const source = hit.source || "unknown";
    const kind = hit.kind || hit.metadata?.kind || "";
    const projectName = hit.project ? ` project=${hit.project}` : "";
    const text = String(hit.text || "").replace(/\s+/g, " ").trim();
    const clipped = text.length > RECALL_TEXT_LIMIT ? `${text.slice(0, RECALL_TEXT_LIMIT)}…` : text;
    lines.push(`- [${source}${kind ? `/${kind}` : ""}${projectName}] ${clipped}`);
  }
  lines.push("");
  lines.push("<!-- /amh-recall -->");
  console.log(lines.join("\n"));
}
