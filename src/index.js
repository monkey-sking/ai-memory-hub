#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { spawnSync } from "node:child_process";
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
    case "sync":
      return syncCommand(rest);
    case "pull":
      return pullCommand(rest);
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
  const tools = detectTools();
  const mem0 = mem0Status();

  return {
    memoryDir,
    pendingEvents: pending,
    syncedEventFiles: synced,
    tools,
    mem0
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

function syncCommand(argv) {
  const dryRun = hasFlag(argv, "--dry-run");
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const inboxPath = path.join(config.memoryDir, "inbox", "events.jsonl");
  const events = readEvents(inboxPath);
  if (events.length === 0) {
    console.log("No pending memory events.");
    return;
  }

  const mem0Config = loadMem0Config(config);
  if (!mem0Config.apiKey || !mem0Config.userId) {
    throw new Error("Mem0 API key or user id is missing. Run `mem0 init --agent` or configure ai-memory-hub.");
  }

  let synced = 0;
  for (const event of events) {
    if (!event.text || looksSensitive(event.text)) {
      console.log(`Skipped event ${event.id || "(no id)"}: missing text or looks sensitive.`);
      continue;
    }

    const metadata = {
      ...(event.metadata || {}),
      source: event.source || "unknown",
      local_event_id: event.id || createId(event.text),
      synced_by: APP_NAME,
      synced_at: new Date().toISOString()
    };

    if (dryRun) {
      console.log(`[dry-run] Would sync: ${event.text}`);
      synced++;
      continue;
    }

    const result = runMem0([
      "add",
      event.text,
      "--user-id",
      mem0Config.userId,
      "--metadata",
      JSON.stringify(metadata),
      "--categories",
      JSON.stringify(config.sync.defaultCategories || ["ai-memory-hub"]),
      "-o",
      "json"
    ], mem0Config);

    if (result.status !== 0) {
      throw new Error(`mem0 add failed for ${event.id || event.text}: ${result.stderr || result.stdout}`);
    }
    synced++;
  }

  if (!dryRun && config.sync.archiveSyncedInboxItems !== false) {
    archiveInbox(config.memoryDir, inboxPath, events);
  }

  console.log(`Synced ${synced} memory event(s) to Mem0.`);
}

function pullCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const mem0Config = loadMem0Config(config);
  if (!mem0Config.apiKey || !mem0Config.userId) {
    throw new Error("Mem0 API key or user id is missing. Run `mem0 init --agent` or configure ai-memory-hub.");
  }

  const pageSize = getOption(argv, "--page-size") || String(config.sync.pullPageSize || 100);
  const result = runMem0([
    "list",
    "--user-id",
    mem0Config.userId,
    "--page-size",
    pageSize,
    "-o",
    "json"
  ], mem0Config);

  if (result.status !== 0) {
    throw new Error(`mem0 list failed: ${result.stderr || result.stdout}`);
  }

  const memories = parseMem0List(result.stdout);
  const snapshot = renderMemorySnapshot(memories);
  fs.writeFileSync(path.join(config.memoryDir, "MEMORY.md"), snapshot, "utf8");
  writeJson(path.join(config.memoryDir, "state", "last-pull.json"), {
    pulledAt: new Date().toISOString(),
    count: memories.length
  });

  console.log(`Pulled ${memories.length} Mem0 memories into ${path.join(config.memoryDir, "MEMORY.md")}`);
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
  status     Show hub, tool, and Mem0 status.
  record     Append a local memory event.
  sync       Push pending inbox events to Mem0.
  pull       Pull Mem0 memories into MEMORY.md.
  watch      Periodically sync pending inbox events.
  app        Start the local dashboard app.
  install    Show or apply per-tool instruction snippets.
  help       Show this help.

Examples:
  ${APP_NAME} init
  ${APP_NAME} record "User prefers concise answers." --source codex --kind preference
  ${APP_NAME} sync --dry-run
  ${APP_NAME} sync
  ${APP_NAME} pull
  ${APP_NAME} watch --interval-ms 30000
  ${APP_NAME} app --port 38787
  ${APP_NAME} install --tool codex
  ${APP_NAME} install --tool codex --apply
`);
}

function defaultConfig(memoryDir) {
  return {
    memoryDir,
    mem0: {
      enabled: true,
      configPath: path.join(os.homedir(), ".mem0", "config.json"),
      userId: "",
      baseUrl: ""
    },
    sync: {
      archiveSyncedInboxItems: true,
      pullPageSize: 100,
      defaultCategories: ["ai-memory-hub"]
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
    path.join(memoryDir, "tools"),
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
    fs.writeFileSync(memoryPath, "# Shared AI Memory\n\nNo pulled Mem0 memories yet.\n", "utf8");
  }
}

function loadConfig() {
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    ensureHub(DEFAULT_MEMORY_DIR);
    writeJson(DEFAULT_CONFIG_PATH, defaultConfig(DEFAULT_MEMORY_DIR));
  }
  const config = readJson(DEFAULT_CONFIG_PATH);
  return {
    ...defaultConfig(DEFAULT_MEMORY_DIR),
    ...config,
    mem0: { ...defaultConfig(DEFAULT_MEMORY_DIR).mem0, ...(config.mem0 || {}) },
    sync: { ...defaultConfig(DEFAULT_MEMORY_DIR).sync, ...(config.sync || {}) },
    tools: { ...defaultConfig(DEFAULT_MEMORY_DIR).tools, ...(config.tools || {}) }
  };
}

function loadMem0Config(config) {
  const mem0ConfigPath = expandPath(config.mem0.configPath || path.join(os.homedir(), ".mem0", "config.json"));
  let fileConfig = {};
  if (fs.existsSync(mem0ConfigPath)) {
    fileConfig = readJson(mem0ConfigPath);
  }

  const platform = fileConfig.platform || {};
  const defaults = fileConfig.defaults || {};
  return {
    apiKey: process.env.MEM0_API_KEY || platform.api_key || "",
    baseUrl: config.mem0.baseUrl || platform.base_url || "",
    userId: config.mem0.userId || defaults.user_id || platform.default_user_id || ""
  };
}

function mem0Status() {
  const result = spawnMem0(["--json", "status"]);
  if (result.status !== 0) {
    return {
      connected: false,
      error: (result.stderr || result.stdout || result.error || "mem0 status failed").trim()
    };
  }
  try {
    return JSON.parse(result.stdout).data || JSON.parse(result.stdout);
  } catch {
    return {
      connected: true,
      raw: result.stdout.trim()
    };
  }
}

function runMem0(args, mem0Config) {
  const fullArgs = [...args];
  if (mem0Config.apiKey) {
    fullArgs.push("--api-key", mem0Config.apiKey);
  }
  if (mem0Config.baseUrl) {
    fullArgs.push("--base-url", mem0Config.baseUrl);
  }
  const result = spawnMem0(fullArgs);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr || result.error
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
      grid-template-columns: repeat(3, 1fr);
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
      <button onclick="pull()">Pull Mem0</button>
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
          <div class="metric"><strong id="synced">0</strong><span class="muted">Synced files</span></div>
          <div class="metric"><strong id="toolCount">0</strong><span class="muted">Apps found</span></div>
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
      const [status, memory] = await Promise.all([api('/api/status'), api('/api/memory')]);
      const connected = status.mem0 && status.mem0.connected;
      const line = document.getElementById('statusLine');
      line.className = connected ? 'status ok' : 'status';
      line.querySelector('span:last-child').textContent = connected ? 'Mem0 connected' : 'Mem0 not connected';
      document.getElementById('memoryDir').textContent = status.memoryDir;
      document.getElementById('pending').textContent = status.pendingEvents;
      document.getElementById('synced').textContent = status.syncedEventFiles;
      document.getElementById('toolCount').textContent = status.tools.filter(t => t.installed).length;
      document.getElementById('memory').textContent = memory.memory || '';
      document.getElementById('pendingJson').textContent = JSON.stringify(memory.pending || [], null, 2);
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

function parseMem0List(stdout) {
  const parsed = JSON.parse(stdout);
  const candidates = [
    parsed,
    parsed.data,
    parsed.data?.memories,
    parsed.data?.results,
    parsed.results,
    parsed.memories
  ];
  const array = candidates.find(Array.isArray) || [];
  return array.map((item) => ({
    id: item.id || item.memory_id || "",
    memory: item.memory || item.text || item.content || String(item),
    metadata: item.metadata || {},
    createdAt: item.created_at || item.createdAt || ""
  })).filter((item) => item.memory);
}

function renderMemorySnapshot(memories) {
  const lines = [
    "# Shared AI Memory",
    "",
    `Pulled from Mem0 at ${new Date().toISOString()}.`,
    ""
  ];
  if (memories.length === 0) {
    lines.push("No memories found.");
    lines.push("");
    return lines.join("\n");
  }

  for (const memory of memories) {
    lines.push(`- ${memory.memory}`);
  }
  lines.push("");
  return lines.join("\n");
}

function archiveInbox(memoryDir, inboxPath, events) {
  const archiveName = `events-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const archivePath = path.join(memoryDir, "synced", archiveName);
  fs.writeFileSync(archivePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
  fs.writeFileSync(inboxPath, "", "utf8");
}

function looksSensitive(text) {
  return /\b(sk-[A-Za-z0-9_-]{12,}|m0-[A-Za-z0-9_-]{12,}|api[_-]?key|password|secret|token)\b/i.test(text);
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

function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function appendIfMissing(file, snippet, marker) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (existing.includes(marker)) {
    return;
  }
  const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : "";
  fs.writeFileSync(file, `${prefix}${snippet.trim()}\n`, "utf8");
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

function spawnMem0(argv) {
  const entrypoint = findMem0Entrypoint();
  if (entrypoint) {
    const result = spawnSync(process.execPath, [entrypoint, ...argv], {
      encoding: "utf8",
      windowsHide: true
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: result.error?.message || ""
    };
  }

  const result = spawnSync(process.platform === "win32" ? "mem0.cmd" : "mem0", argv, {
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32"
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || ""
  };
}

function findMem0Entrypoint() {
  const candidates = [
    path.join(path.dirname(process.execPath), "node_modules", "@mem0", "cli", "dist", "index.js"),
    path.join(process.env.APPDATA || "", "npm", "node_modules", "@mem0", "cli", "dist", "index.js"),
    path.join(projectRoot(), "node_modules", "@mem0", "cli", "dist", "index.js")
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function expandPath(value) {
  return value
    .replace(/^~(?=$|[\\/])/, os.homedir())
    .replace(/%USERPROFILE%/gi, os.homedir());
}

function countJsonlFiles(dir) {
  if (!fs.existsSync(dir)) {
    return 0;
  }
  return fs.readdirSync(dir).filter((file) => file.endsWith(".jsonl")).length;
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
