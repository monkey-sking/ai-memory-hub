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
import { spawnSync } from "node:child_process";
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
  detectInjectedBlocks,
  findCaptureFiles,
  listCaptureTools,
  parseCaptureFile,
  renderTurnText,
  stripInjectedBlocks
} from "../lib/capture-sources.js";

const DEFAULT_SCAN_LIMIT = 200;
const DEFAULT_RECALL_LIMIT = 8;
// 召回是给 agent 注入上下文用的，单条必须短——否则几条就把上下文窗口吃满。
const RECALL_TEXT_LIMIT = 320;
// 修复计划里最多回显多少条样本（全量回显会把输出淹掉）。
const REPAIR_SAMPLE_LIMIT = 10;
// 定时捕获的默认节奏：15 分钟、每次最多 50 条。
const DEFAULT_SCHEDULE_INTERVAL_MINUTES = 15;
const DEFAULT_SCHEDULE_LIMIT = 50;
const CAPTURE_SCHEDULE_LABEL = "com.ai-memory-hub.capture";

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
  if (action === "repair") return captureRepairCommand(rest, deps);
  if (action === "schedule") return captureScheduleCommand(rest, deps);
  throw new Error("Usage: ai-memory-hub capture <scan|sources|status|reset|recall|repair|schedule> [options]");
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

// ─── 修复历史记录 ───

/** 剥离后顺手把块留下的空白残渣收干净（已入库文本本身已归一化，这里只是收尾）。 */
function normalizeRepairedText(text) {
  return String(text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function buildCaptureRepairPlan(ledger) {
  const entries = [];
  const unresolved = [];
  const byBlock = {};
  for (const record of ledger) {
    const before = String(record?.text || "");
    if (!before) continue;
    const blocks = detectInjectedBlocks(before);
    if (blocks.length === 0) continue;
    const after = normalizeRepairedText(stripInjectedBlocks(before));
    for (const block of blocks) byBlock[block] = (byBlock[block] || 0) + 1;
    if (!after || after === before) {
      // 修不动就如实报出来，别静默跳过。两种来源：① 标签没闭合的脏记录；
      // ② 正文里只是**提到**了标签名（例如助手回复在解释 `<INSTRUCTIONS>`），
      // 那是误报，剥离函数本来就不该动它。都要人看一眼再决定。
      unresolved.push({ id: record.id, blocks });
      continue;
    }
    entries.push({ id: record.id, blocks, before, after });
  }
  return { entries, unresolved, byBlock };
}

function applyCaptureRepairPlan(ledger, plan) {
  const now = new Date().toISOString();
  const byId = new Map(plan.entries.map((entry) => [entry.id, entry]));
  let updated = 0;
  const next = ledger.map((record) => {
    const entry = byId.get(record?.id);
    if (!entry) return record;
    updated += 1;
    // 只改 text：sync 的去重键是 localEventId，动 id 会导致同一条重复入账。
    return { ...record, text: entry.after, repairedAt: now, repairedBlocks: entry.blocks };
  });
  return { ledger: next, updated };
}

function countPolluted(ledger) {
  return ledger.filter((record) => detectInjectedBlocks(record?.text || "").length > 0).length;
}

/**
 * 修复历史记录里被注入块污染的正文。
 *
 * 背景：早期的噪声过滤漏了 ambient 注入块，导致已入库记录的正文以工具注入的
 * 环境状态开头，真人请求被挤到后面。修复用与捕获同一份剥离逻辑（stripInjectedBlocks），
 * 两边共享 INJECTED_BLOCK_TAGS，不会出现「修完又被下一轮扫描污染」。
 *
 * 与 `health repair` 同款约定：默认只出计划，`--apply` 才落盘，落盘前自动备份。
 */
export function captureRepairCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const apply = hasFlag(argv, "--apply");

  const ledger = deps.readLedger(config.memoryDir);
  const plan = buildCaptureRepairPlan(ledger);

  const result = {
    ok: true,
    apply,
    memoryDir: config.memoryDir,
    scannedRecords: ledger.length,
    pollutedRecords: plan.entries.length + plan.unresolved.length,
    repairable: plan.entries.length,
    unresolved: plan.unresolved,
    byBlock: plan.byBlock,
    samples: plan.entries.slice(0, REPAIR_SAMPLE_LIMIT).map((entry) => ({
      id: entry.id,
      blocks: entry.blocks,
      before: entry.before.slice(0, 140),
      after: entry.after.slice(0, 140)
    })),
    backup: null,
    applied: { ledgerRecordsUpdated: 0 },
    after: null
  };

  if (!apply || plan.entries.length === 0) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const backup = deps.backupHub(config.memoryDir, "pre-capture-repair");
  const applied = applyCaptureRepairPlan(ledger, plan);
  deps.writeLedger(config.memoryDir, applied.ledger);
  deps.rebuildMemoryOutputs(config, applied.ledger);

  console.log(JSON.stringify({
    ...result,
    backup,
    applied: { ledgerRecordsUpdated: applied.updated },
    after: { pollutedRecords: countPolluted(deps.readLedger(config.memoryDir)) }
  }, null, 2));
}

// ─── 定时捕获（macOS launchd）───

function captureSchedulePaths() {
  const dir = path.join(os.homedir(), "Library", "LaunchAgents");
  return {
    label: CAPTURE_SCHEDULE_LABEL,
    dir,
    plist: path.join(dir, `${CAPTURE_SCHEDULE_LABEL}.plist`),
    log: "/tmp/ai-memory-hub-capture.log"
  };
}

/**
 * 定时任务怎么调起 CLI。
 *
 * 优先用全局启动器（brew 装的 `ai-memory-hub`，它与 dashboard 服务用的是同一个，
 * 已有先例）；没有就退回「当前 node 解释器 + 当前入口脚本」——不写死安装路径。
 */
function resolveCliInvocation() {
  const launcher = "/opt/homebrew/bin/ai-memory-hub";
  if (fs.existsSync(launcher)) return [launcher];
  const entry = process.argv[1];
  return entry ? [process.execPath, entry] : [process.execPath];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCaptureSchedulePlist({ intervalMinutes, limit, logPath }) {
  const command = [...resolveCliInvocation(), "capture", "scan", "--limit", String(limit), "--sync"];
  const programArguments = command
    .map((arg) => `\t\t<string>${escapeXml(arg)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${CAPTURE_SCHEDULE_LABEL}</string>
\t<key>ProgramArguments</key>
\t<array>
${programArguments}
\t</array>
\t<key>StartInterval</key>
\t<integer>${intervalMinutes * 60}</integer>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>StandardOutPath</key>
\t<string>${escapeXml(logPath)}</string>
\t<key>StandardErrorPath</key>
\t<string>${escapeXml(logPath)}</string>
\t<key>EnvironmentVariables</key>
\t<dict>
\t\t<key>PATH</key>
\t\t<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
\t</dict>
</dict>
</plist>
`;
}

function launchctl(args) {
  const result = spawnSync("launchctl", args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    status: result.status,
    stderr: (result.stderr || "").trim()
  };
}

function readScheduledCommand(plist) {
  try {
    const match = fs.readFileSync(plist, "utf8").match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

/**
 * 让 capture 真正自动化：装一个 launchd 任务，每 N 分钟扫一次并 sync。
 *
 * 为什么不用 `amh watch --capture`：那是个常驻进程，得靠 KeepAlive 维持，
 * 崩了要重启、日志要轮转；而捕获本身是幂等的短任务（实测 1.5 秒），
 * 用 launchd 的 StartInterval 定时拉起更简单也更稳。
 */
export function captureScheduleCommand(argv, deps) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "status";
  const paths = captureSchedulePaths();

  if (action === "status") {
    const installed = fs.existsSync(paths.plist);
    console.log(JSON.stringify({
      ok: true,
      installed,
      supported: process.platform === "darwin",
      label: paths.label,
      plistPath: paths.plist,
      logPath: paths.log,
      intervalMinutes: installed ? readScheduledCommand(paths.plist) / 60 : 0
    }, null, 2));
    return;
  }

  if (action === "install") {
    if (process.platform !== "darwin") {
      throw new Error("capture schedule install currently supports macOS (launchd) only.");
    }
    const intervalMinutes = getOption(argv, "--interval-minutes")
      ? parsePositiveIntegerOption(getOption(argv, "--interval-minutes"), "--interval-minutes")
      : DEFAULT_SCHEDULE_INTERVAL_MINUTES;
    const limit = getOption(argv, "--limit")
      ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
      : DEFAULT_SCHEDULE_LIMIT;
    const apply = hasFlag(argv, "--apply");
    const plist = buildCaptureSchedulePlist({ intervalMinutes, limit, logPath: paths.log });

    const result = {
      ok: true,
      apply,
      label: paths.label,
      plistPath: paths.plist,
      logPath: paths.log,
      intervalMinutes,
      limit
    };

    if (!apply) {
      console.log(JSON.stringify({ ...result, plist, hint: "Re-run with --apply to install." }, null, 2));
      return;
    }

    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.plist, plist, "utf8");
    // bootout 在未加载时会失败，属正常情况，不阻断流程。
    launchctl(["bootout", `gui/${process.getuid()}/${paths.label}`]);
    const bootstrap = launchctl(["bootstrap", `gui/${process.getuid()}`, paths.plist]);
    console.log(JSON.stringify({
      ...result,
      loaded: bootstrap.ok,
      launchctlError: bootstrap.ok ? "" : bootstrap.stderr
    }, null, 2));
    return;
  }

  if (action === "uninstall") {
    launchctl(["bootout", `gui/${process.getuid()}/${paths.label}`]);
    if (fs.existsSync(paths.plist)) {
      fs.rmSync(paths.plist, { force: true });
    }
    console.log(JSON.stringify({ ok: true, uninstalled: true, label: paths.label, plistPath: paths.plist }, null, 2));
    return;
  }

  throw new Error("Usage: ai-memory-hub capture schedule <status|install|uninstall> [--interval-minutes 15] [--limit 50] [--apply]");
}
