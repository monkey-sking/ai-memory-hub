#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";

const APP_NAME = "ai-memory-hub";
const DEFAULT_MEMORY_DIR = path.join(os.homedir(), ".ai-memory");
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_MEMORY_DIR, "config.json");

const args = process.argv.slice(2);
const command = args[0] || "help";
const rest = args.slice(1);

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
    case "sync":
      return syncCommand(rest);
    case "pull":
      return pullCommand(rest);
    case "backup":
      return backupCommand(rest);
    case "watch":
      return watchCommand(rest);
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

function initCommand(argv) {
  const memoryDir = getOption(argv, "--memory-dir") || DEFAULT_MEMORY_DIR;
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
  const radio = readRadioMessages(memoryDir).length;
  const backups = countBackupDirs(memoryDir);
  const lock = readLockStatus(memoryDir);
  const tools = detectTools();

  return {
    memoryDir,
    pendingEvents: pending,
    syncedEventFiles: synced,
    ledgerEvents: ledger,
    radioMessages: radio,
    backups,
    lock,
    tools
  };
}

function recordCommand(argv) {
  const text = positionalArgs(argv).join(" ").trim();
  if (!text) {
    throw new Error("Usage: ai-memory-hub record <text> [--source tool] [--kind preference]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);

  const event = {
    id: createId(text),
    ts: new Date().toISOString(),
    source: getOption(argv, "--source") || "manual",
    text,
    metadata: {
      kind: getOption(argv, "--kind") || "note"
    }
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
    if (!event.text || looksSensitive(event.text)) {
      console.log(`Skipped event ${event.id || "(no id)"}: missing text or looks sensitive.`);
      remaining.push(event);
      continue;
    }

    const localEventId = event.id || createId(event.text);
    if (knownIds.has(localEventId)) {
      synced++;
      continue;
    }

    const record = {
      id: createId(`memory:${localEventId}:${event.text}`),
      localEventId,
      ts: event.ts || new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      source: event.source || "unknown",
      text: String(event.text).trim(),
      metadata: event.metadata || {}
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
    fs.writeFileSync(path.join(config.memoryDir, "MEMORY.md"), renderMemorySnapshot(updatedLedger, config.sync.snapshotLimit), "utf8");
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

function pullCommand() {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "pull", () => {
    const ledger = readLedger(config.memoryDir);
    const backup = backupHub(config.memoryDir, "pre-pull");
    fs.writeFileSync(path.join(config.memoryDir, "MEMORY.md"), renderMemorySnapshot(ledger, config.sync.snapshotLimit), "utf8");
    writeJson(path.join(config.memoryDir, "state", "last-pull.json"), {
      pulledAt: new Date().toISOString(),
      count: ledger.length,
      backupDir: backup.dir
    });

    console.log(`Rebuilt ${path.join(config.memoryDir, "MEMORY.md")} from ${ledger.length} local memory record(s).`);
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

function appCommand(argv) {
  const host = getOption(argv, "--host") || "127.0.0.1";
  const port = Number(getOption(argv, "--port") || 38787);
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
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
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const targets = getInstallTargets(config.memoryDir).filter((target) => tool === "all" || target.tool === tool);
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
  pull       Rebuild MEMORY.md from the local memory ledger.
  backup     Back up MEMORY.md, ledger, inbox, profile, and radio files.
  watch      Periodically index pending inbox events.
  app        Start the local dashboard app.
  install    Show or apply per-tool instruction snippets.
  help       Show this help.

Examples:
  ${APP_NAME} init
  ${APP_NAME} record "User prefers concise answers." --source codex --kind preference
  ${APP_NAME} radio send "Please review the latest implementation." --from codex --to claude --type review
  ${APP_NAME} radio list --limit 10
  ${APP_NAME} radio promote --id <message-id>
  ${APP_NAME} sync --dry-run
  ${APP_NAME} sync
  ${APP_NAME} pull
  ${APP_NAME} backup --reason manual
  ${APP_NAME} watch --interval-ms 30000
  ${APP_NAME} app --port 38787
  ${APP_NAME} install --tool codex
  ${APP_NAME} install --tool codex --apply
`);
}

function defaultConfig(memoryDir) {
  return {
    memoryDir,
    sync: {
      archiveIndexedInboxItems: true,
      snapshotLimit: 200,
      lockStaleMs: 120000
    },
    tools: {
      codex: { enabled: true },
      codexApp: { enabled: true },
      claude: { enabled: true },
      gemini: { enabled: true },
      antigravity: { enabled: true },
      antigravityCockpit: { enabled: true },
      qclaw: { enabled: true },
      openclaw: { enabled: true }
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
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    ensureHub(DEFAULT_MEMORY_DIR);
    writeJson(DEFAULT_CONFIG_PATH, defaultConfig(DEFAULT_MEMORY_DIR));
  }
  const config = readJson(DEFAULT_CONFIG_PATH);
  const cleanConfig = { ...config };
  delete cleanConfig["m" + "e" + "m" + "0"];
  return {
    ...defaultConfig(DEFAULT_MEMORY_DIR),
    ...cleanConfig,
    sync: { ...defaultConfig(DEFAULT_MEMORY_DIR).sync, ...(config.sync || {}) },
    tools: { ...defaultConfig(DEFAULT_MEMORY_DIR).tools, ...(config.tools || {}) }
  };
}

function detectTools() {
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
    }
  ];

  return checks.map((check) => ({
    name: check.name,
    kind: check.kind,
    installed: fs.existsSync(check.dir),
    dir: check.dir,
    files: fs.existsSync(check.dir) ? summarizeDir(check.dir) : []
  }));
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
      tool: "codex-app",
      file: path.join(memoryDir, "tools", "codex-app-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "qclaw",
      file: path.join(memoryDir, "tools", "qclaw-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "openclaw",
      file: path.join(memoryDir, "tools", "openclaw-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    }
  ];
}

function renderDashboard() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Memory Hub</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #667085;
      --line: #d9dee7;
      --accent: #1570ef;
      --ok: #067647;
      --warn: #b54708;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    h1 { font-size: 18px; margin: 0; }
    main {
      padding: 20px 24px 32px;
      display: grid;
      grid-template-columns: minmax(280px, 380px) 1fr;
      gap: 16px;
      max-width: 1400px;
      margin: 0 auto;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      min-width: 0;
    }
    h2 {
      font-size: 14px;
      margin: 0 0 12px;
      color: #344054;
    }
    .stack { display: grid; gap: 16px; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: #fbfcfe;
    }
    .metric strong {
      display: block;
      font-size: 20px;
      margin-bottom: 2px;
    }
    .muted { color: var(--muted); }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--warn);
    }
    .ok .dot { background: var(--ok); }
    button {
      border: 1px solid #b2c7ee;
      background: #edf4ff;
      color: #1849a9;
      border-radius: 6px;
      padding: 8px 10px;
      font-weight: 600;
      cursor: pointer;
    }
    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: white;
    }
    button:disabled { opacity: .55; cursor: wait; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    textarea, input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      font: inherit;
      background: white;
    }
    textarea { min-height: 92px; resize: vertical; }
    pre {
      white-space: pre-wrap;
      overflow: auto;
      margin: 0;
      background: #f8fafc;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      max-height: 520px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      border-bottom: 1px solid var(--line);
      padding: 8px 4px;
      vertical-align: top;
    }
    th { color: var(--muted); font-size: 12px; }
    .path { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; word-break: break-all; }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; padding: 12px; }
      header { padding: 12px; align-items: flex-start; flex-direction: column; }
      .metrics { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>AI Memory Hub</h1>
      <div class="muted">Shared local memory for AI apps. Model tokens stay separate.</div>
    </div>
    <div class="actions">
      <button onclick="refresh()">Refresh</button>
      <button onclick="pull()">Rebuild Snapshot</button>
      <button class="primary" onclick="sync()">Sync Pending</button>
    </div>
  </header>
  <main>
    <div class="stack">
      <section>
        <h2>Status</h2>
        <div id="statusLine" class="status"><span class="dot"></span><span>Loading</span></div>
        <p class="path" id="memoryDir"></p>
        <div class="metrics">
          <div class="metric"><strong id="pending">0</strong><span class="muted">Pending</span></div>
          <div class="metric"><strong id="ledger">0</strong><span class="muted">Ledger</span></div>
          <div class="metric"><strong id="radioCount">0</strong><span class="muted">Radio</span></div>
          <div class="metric"><strong id="backupCount">0</strong><span class="muted">Backups</span></div>
          <div class="metric"><strong id="toolCount">0</strong><span class="muted">Apps found</span></div>
        </div>
      </section>
      <section>
        <h2>Agent Radio</h2>
        <div class="stack">
          <textarea id="radioText" placeholder="Short cross-agent message, handoff, review request, or risk note."></textarea>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <input id="radioFrom" value="dashboard" aria-label="from">
            <input id="radioTo" value="all" aria-label="to">
            <select id="radioType" aria-label="type">
              <option value="note">note</option>
              <option value="handoff">handoff</option>
              <option value="review">review</option>
              <option value="risk">risk</option>
              <option value="done">done</option>
            </select>
          </div>
          <button class="primary" onclick="sendRadio()">Send Radio Message</button>
        </div>
      </section>
      <section>
        <h2>Record Memory</h2>
        <div class="stack">
          <textarea id="recordText" placeholder="Durable preference, project fact, workflow rule, or correction."></textarea>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <input id="recordSource" value="dashboard" aria-label="source">
            <select id="recordKind" aria-label="kind">
              <option value="note">note</option>
              <option value="preference">preference</option>
              <option value="project">project</option>
              <option value="workflow">workflow</option>
              <option value="correction">correction</option>
            </select>
          </div>
          <button class="primary" onclick="recordMemory()">Record</button>
        </div>
      </section>
      <section>
        <h2>Detected AI Apps</h2>
        <table>
          <thead><tr><th>App</th><th>Status</th></tr></thead>
          <tbody id="tools"></tbody>
        </table>
      </section>
    </div>
    <div class="stack">
      <section>
        <h2>Shared Snapshot</h2>
        <pre id="memory"></pre>
      </section>
      <section>
        <h2>Pending Inbox</h2>
        <pre id="pendingJson"></pre>
      </section>
      <section>
        <h2>Agent Radio Messages</h2>
        <pre id="radioJson"></pre>
      </section>
    </div>
  </main>
  <script>
    async function api(path, options) {
      const res = await fetch(path, options);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      return json;
    }
    async function refresh() {
      const [status, memory, radio] = await Promise.all([api('/api/status'), api('/api/memory'), api('/api/radio')]);
      const line = document.getElementById('statusLine');
      line.className = 'status ok';
      line.querySelector('span:last-child').textContent = 'Local hub ready';
      document.getElementById('memoryDir').textContent = status.memoryDir;
      document.getElementById('pending').textContent = status.pendingEvents;
      document.getElementById('ledger').textContent = status.ledgerEvents;
      document.getElementById('radioCount').textContent = status.radioMessages;
      document.getElementById('backupCount').textContent = status.backups || 0;
      document.getElementById('toolCount').textContent = status.tools.filter(t => t.installed).length;
      document.getElementById('memory').textContent = memory.memory || '';
      document.getElementById('pendingJson').textContent = JSON.stringify(memory.pending || [], null, 2);
      document.getElementById('radioJson').textContent = JSON.stringify(radio.messages || [], null, 2);
      document.getElementById('tools').innerHTML = status.tools.map(t =>
        '<tr><td>' + escapeHtml(t.name) + '<div class="path">' + escapeHtml(t.dir) + '</div></td><td>' + (t.installed ? 'installed' : 'missing') + '</td></tr>'
      ).join('');
    }
    async function recordMemory() {
      const text = document.getElementById('recordText').value.trim();
      if (!text) return;
      await api('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source: document.getElementById('recordSource').value || 'dashboard',
          kind: document.getElementById('recordKind').value || 'note'
        })
      });
      document.getElementById('recordText').value = '';
      await refresh();
    }
    async function sendRadio() {
      const text = document.getElementById('radioText').value.trim();
      if (!text) return;
      await api('/api/radio/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          from: document.getElementById('radioFrom').value || 'dashboard',
          to: document.getElementById('radioTo').value || 'all',
          type: document.getElementById('radioType').value || 'note'
        })
      });
      document.getElementById('radioText').value = '';
      await refresh();
    }
    async function sync() { await api('/api/sync', { method: 'POST' }); await refresh(); }
    async function pull() { await api('/api/pull', { method: 'POST' }); await refresh(); }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    refresh().catch(err => alert(err.message));
  </script>
</body>
</html>`;
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
    .map((item) => ({
      id: item.id || createId(item.text || JSON.stringify(item)),
      localEventId: item.localEventId || item.local_event_id || "",
      ts: item.ts || item.createdAt || "",
      indexedAt: item.indexedAt || "",
      source: item.source || item.metadata?.source || "unknown",
      text: item.text || item.memory || "",
      metadata: item.metadata || {}
    }))
    .filter((item) => item.text);
}

function renderMemorySnapshot(memories, limit = 200) {
  const sorted = [...memories].sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  const limited = sorted.slice(-Number(limit || 200));
  const lines = [
    "# Shared AI Memory",
    "",
    `Rebuilt locally at ${new Date().toISOString()}.`,
    ""
  ];
  if (limited.length === 0) {
    lines.push("No memories found.");
    lines.push("");
    return lines.join("\n");
  }

  for (const memory of limited) {
    const kind = memory.metadata?.kind ? `/${memory.metadata.kind}` : "";
    lines.push(`- [${memory.source}${kind}] ${memory.text}`);
  }
  lines.push("");
  return lines.join("\n");
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
    releaseLock(lockPath);
  }
}

function acquireLock(lockPath, owner, staleMs) {
  const started = Date.now();
  while (Date.now() - started < staleMs) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, JSON.stringify({
        owner,
        pid: process.pid,
        createdAt: new Date().toISOString()
      }, null, 2));
      fs.closeSync(fd);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (isLockStale(lockPath, staleMs)) {
        try {
          fs.unlinkSync(lockPath);
          continue;
        } catch {
          // Another process may have removed it first; retry.
        }
      }
      sleep(100);
    }
  }
  throw new Error(`Memory hub is locked by another process: ${lockPath}`);
}

function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Lock may already be removed if it was considered stale.
  }
}

function isLockStale(lockPath, staleMs) {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function readLockStatus(memoryDir) {
  const lockPath = path.join(memoryDir, "locks", "hub.lock");
  if (!fs.existsSync(lockPath)) {
    return { locked: false };
  }
  try {
    return {
      locked: true,
      ...readJson(lockPath)
    };
  } catch {
    return { locked: true, path: lockPath };
  }
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

function createRadioMessage({ from, to, type, text, thread, project }) {
  const cleanText = String(text || "").trim();
  return {
    id: createId(`radio:${from}:${to}:${type}:${cleanText}`),
    ts: new Date().toISOString(),
    from: String(from || "unknown"),
    to: String(to || "all"),
    type: String(type || "note"),
    text: cleanText,
    thread: String(thread || ""),
    project: String(project || ""),
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
    project: message.project || "",
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
  if (existing.includes(marker) && existing.includes("Shared Agent Radio")) {
    return;
  }
  if (existing.includes(marker) && !existing.includes("Shared Agent Radio")) {
    const radioSection = extractSection(snippet, "## Shared Agent Radio");
    if (radioSection) {
      const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : "";
      fs.writeFileSync(file, `${prefix}${radioSection.trim()}\n`, "utf8");
    }
    return;
  }
  const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : "";
  fs.writeFileSync(file, `${prefix}${snippet.trim()}\n`, "utf8");
}

function extractSection(text, heading) {
  const index = text.indexOf(heading);
  return index === -1 ? "" : text.slice(index);
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
  return argv[index + 1] || "";
}

function hasFlag(argv, name) {
  return argv.includes(name);
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
