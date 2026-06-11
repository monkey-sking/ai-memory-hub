import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");

async function withHub(fn) {
  const memoryDir = await fs.mkdtemp(path.join(repoRoot, ".tmp-amh-dashboard-test-"));
  try {
    const init = runCli(memoryDir, ["init"]);
    assert.equal(init.status, 0, init.stderr || init.stdout);
    await fn(memoryDir);
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
}

function runCli(memoryDir, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AI_MEMORY_DIR: memoryDir
    },
    encoding: "utf8",
    windowsHide: true
  });
}

async function appendJsonl(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(port, child) {
  const url = `http://127.0.0.1:${port}/api/status`;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`dashboard exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // retry until the server is listening
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("dashboard server did not start");
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill();
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 3000))
  ]);
}

function createSocketReader(socket) {
  let buffer = Buffer.alloc(0);
  const pending = [];
  let closed = false;
  let socketError = null;

  const flush = () => {
    for (let index = 0; index < pending.length;) {
      const entry = pending[index];
      if (socketError) {
        clearTimeout(entry.timer);
        pending.splice(index, 1);
        entry.reject(socketError);
        continue;
      }
      const value = entry.extract();
      if (value) {
        clearTimeout(entry.timer);
        pending.splice(index, 1);
        entry.resolve(value);
        continue;
      }
      if (closed) {
        clearTimeout(entry.timer);
        pending.splice(index, 1);
        entry.reject(new Error("socket closed before data arrived"));
        continue;
      }
      index += 1;
    }
  };

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });
  socket.on("error", (error) => {
    socketError = error;
    flush();
  });
  socket.on("close", () => {
    closed = true;
    flush();
  });

  const readWith = (extract, label, timeoutMs = 3000) => {
    const existing = extract();
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const entry = {
        extract,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = pending.indexOf(entry);
          if (index !== -1) pending.splice(index, 1);
          reject(new Error(`timed out waiting for ${label}`));
        }, timeoutMs)
      };
      pending.push(entry);
      flush();
    });
  };

  const readUntil = (delimiter, timeoutMs) => readWith(() => {
    const index = buffer.indexOf(delimiter);
    if (index === -1) return null;
    const output = buffer.subarray(0, index + delimiter.length);
    buffer = buffer.subarray(index + delimiter.length);
    return output;
  }, "delimiter", timeoutMs);

  const readFrame = (timeoutMs) => readWith(() => {
    if (buffer.length < 2) return null;
    const first = buffer[0];
    const second = buffer[1];
    let offset = 2;
    let length = second & 0x7f;
    if (length === 126) {
      if (buffer.length < offset + 2) return null;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) return null;
      const bigLength = buffer.readBigUInt64BE(offset);
      offset += 8;
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("websocket frame too large for test reader");
      }
      length = Number(bigLength);
    }
    if (buffer.length < offset + length) return null;
    const frame = {
      opcode: first & 0x0f,
      payload: Buffer.from(buffer.subarray(offset, offset + length))
    };
    buffer = buffer.subarray(offset + length);
    return frame;
  }, "websocket frame", timeoutMs);

  return {
    readUntil,
    async readJson(timeoutMs) {
      for (;;) {
        const frame = await readFrame(timeoutMs);
        if (frame.opcode === 0x1) {
          return JSON.parse(frame.payload.toString("utf8"));
        }
        if (frame.opcode === 0x8) {
          throw new Error("websocket closed");
        }
      }
    }
  };
}

async function openWebSocket(port) {
  const socket = net.connect({ host: "127.0.0.1", port });
  await once(socket, "connect");
  const reader = createSocketReader(socket);
  const key = crypto.randomBytes(16).toString("base64");
  socket.write([
    "GET /ws HTTP/1.1",
    `Host: 127.0.0.1:${port}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    ""
  ].join("\r\n"));

  const response = await reader.readUntil(Buffer.from("\r\n\r\n"), 3000);
  assert.match(response.toString("utf8"), /^HTTP\/1\.1 101 Switching Protocols/);
  return { socket, reader };
}

async function readUntilSnapshot(reader, predicate) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const message = await reader.readJson(5000);
    if ((message.type === "hello" || message.type === "snapshot") && predicate(message.snapshot, message)) {
      return message;
    }
  }
  throw new Error("matching websocket snapshot did not arrive");
}

test("dashboard serves externalized virtual-scroll assets", async () => {
  await withHub(async (memoryDir) => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [cliPath, "app", "--port", String(port)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_MEMORY_DIR: memoryDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    try {
      await waitForServer(port, child);
      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /<link rel="stylesheet" href="\/css\/dashboard\.css">/);
      assert.match(html, /<script src="\/js\/dashboard\.js"><\/script>\s*<\/body>/);
      assert.match(html, /id="tab-backups"/);
      assert.match(html, /id="backupReason"/);
      assert.match(html, /id="settingAutoRefresh"/);
      assert.match(html, /id="settingNotifications"/);
      assert.match(html, /id="settingShortcutsEnabled"/);
      assert.match(html, /id="shortcutFocusSearch"/);
      assert.match(html, /id="refreshStatus"/);
      assert.match(html, /id="dashboardLoading"/);
      assert.match(html, /id="toastStack"/);
      assert.match(html, /id="shortcutHelp"/);
      assert.match(html, /id="shortcutHelpGrid"/);
      assert.match(html, /class="sidebar-nav"/);
      assert.match(html, /class="nav-icon"/);
      assert.match(html, /class="nav-label" data-i18n="overviewNav"/);
      assert.match(html, /id="sidebarToggle" class="btn small sidebar-toggle"/);
      assert.match(html, /onclick="toggleSidebar\(\)"/);
      assert.match(html, /id="tab-dashboard"[\s\S]*class="panel compatibility-panel"[\s\S]*id="tab-memory"/);
      assert.match(html, /data-i18n="integrationRulePreview"/);
      assert.match(html, /data-i18n="installWorkspaceRules"/);
      assert.match(html, /data-i18n="installGlobalRules"/);
      assert.doesNotMatch(html, /<script>\s*\/\/\s*Global tool icon/);

      const cssRes = await fetch(`http://127.0.0.1:${port}/css/dashboard.css`);
      assert.equal(cssRes.status, 200);
      assert.match(cssRes.headers.get("content-type") || "", /text\/css/);
      const dashboardCss = await cssRes.text();
      assert.match(dashboardCss, /--bg-main/);
      assert.match(dashboardCss, /body\[data-theme="light"\]/);
      assert.match(dashboardCss, /\.backup-row/);
      assert.match(dashboardCss, /\.toast-stack/);
      assert.match(dashboardCss, /\.shortcut-grid/);
      assert.match(dashboardCss, /\.loading-banner/);
      assert.match(dashboardCss, /\.refresh-status/);
      assert.match(dashboardCss, /\.endpoint-errors-title-row/);
      assert.match(dashboardCss, /--sidebar-collapsed-width/);
      assert.match(dashboardCss, /body\.sidebar-collapsed #sidebar/);
      assert.match(dashboardCss, /body\.sidebar-collapsed \.container/);
      assert.match(dashboardCss, /body\.sidebar-collapsed \.nav-label/);
      assert.doesNotMatch(dashboardCss, /(^|\n)\s*aside\s*\{/);
      assert.match(dashboardCss, /\.compatibility-grid/);
      assert.match(dashboardCss, /\.compatibility-pre/);
      assert.match(dashboardCss, /\.tool-card-copy/);
      assert.match(dashboardCss, /\.modal-tool-snippet/);
      assert.match(dashboardCss, /max-width:\s*640px/);

      const jsRes = await fetch(`http://127.0.0.1:${port}/js/dashboard.js`);
      assert.equal(jsRes.status, 200);
      assert.match(jsRes.headers.get("content-type") || "", /application\/javascript/);
      const dashboardScript = await jsRes.text();
      assert.match(dashboardScript, /function renderVirtualList/);
      assert.match(dashboardScript, /new Chart\(el/);
      assert.match(dashboardScript, /memoryGrowthChart/);
      assert.match(dashboardScript, /function renderHealthReport/);
      assert.match(dashboardScript, /function runHealthAction/);
      assert.match(dashboardScript, /function renderBackupsPanel/);
      assert.match(dashboardScript, /function showToast/);
      assert.match(dashboardScript, /function formatApiError/);
      assert.match(dashboardScript, /function renderLoadingState/);
      assert.match(dashboardScript, /function renderLoadingPlaceholders/);
      assert.match(dashboardScript, /function handleGlobalShortcuts/);
      assert.match(dashboardScript, /function normalizeShortcutBinding/);
      assert.match(dashboardScript, /function renderShortcutHelp/);
      assert.match(dashboardScript, /function applySettingsDraft/);
      assert.match(dashboardScript, /function applyTheme/);
      assert.match(dashboardScript, /hub_sidebar_collapsed/);
      assert.match(dashboardScript, /function applySidebarMode/);
      assert.match(dashboardScript, /function updateSidebarToggleButton/);
      assert.match(dashboardScript, /document\.body\.classList\.toggle\('sidebar-collapsed'/);
      assert.match(dashboardScript, /toolNotDetected/);
      assert.match(dashboardScript, /installWorkspaceRules/);
      assert.match(dashboardScript, /rulesWritten/);
      assert.match(dashboardScript, /t\('toolConnected'\)/);
      assert.match(dashboardScript, /api\('\/api\/backups'/);
      assert.match(dashboardScript, /new URLSearchParams/);
      assert.match(dashboardScript, /api\(`\/api\/search\?\$\{params\.toString\(\)\}`\)/);
      assert.match(dashboardScript, /api\(action\.endpoint/);
      assert.match(dashboardScript, /settingNotifications/);
      assert.doesNotMatch(dashboardScript, /echarts\.init/);

      const traversalRes = await fetch(`http://127.0.0.1:${port}/js/%2e%2e/%2e%2e/package.json`);
      assert.notEqual(traversalRes.status, 200);
      assert.doesNotMatch(await traversalRes.text(), /"name": "ai-memory-hub"/);
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });

  const dashboardJs = await fs.readFile(path.join(repoRoot, "public", "js", "dashboard.js"), "utf8");
  assert.match(dashboardJs, /function renderVirtualList/);
  assert.match(dashboardJs, /renderMarkdownVirtual\('memorySubTab-md'/);
  assert.match(dashboardJs, /renderVirtualList\('radioFeed'/);
  assert.match(dashboardJs, /renderVirtualList\('col-open'/);
  assert.match(dashboardJs, /renderVirtualList\('col-active'/);
  assert.match(dashboardJs, /renderVirtualList\('col-completed'/);
  assert.match(dashboardJs, /loading="lazy"/);
  assert.match(dashboardJs, /function loadChartJs/);
  assert.match(dashboardJs, /new Chart\(el/);
  assert.match(dashboardJs, /memoryGrowthChart/);
  assert.match(dashboardJs, /taskCompletionChart/);
  assert.match(dashboardJs, /radioActivityChart/);
  assert.match(dashboardJs, /function renderHealthReport/);
  assert.match(dashboardJs, /function runHealthAction/);
  assert.match(dashboardJs, /function renderBackupsPanel/);
  assert.match(dashboardJs, /function showToast/);
  assert.match(dashboardJs, /function formatApiError/);
  assert.match(dashboardJs, /function renderLoadingState/);
  assert.match(dashboardJs, /function renderLoadingPlaceholders/);
  assert.match(dashboardJs, /function handleGlobalShortcuts/);
  assert.match(dashboardJs, /function normalizeShortcutBinding/);
  assert.match(dashboardJs, /function renderShortcutHelp/);
  assert.match(dashboardJs, /function applySettingsDraft/);
  assert.match(dashboardJs, /function applyTheme/);
  assert.match(dashboardJs, /hub_sidebar_collapsed/);
  assert.match(dashboardJs, /function applySidebarMode/);
  assert.match(dashboardJs, /function updateSidebarToggleButton/);
  assert.match(dashboardJs, /document\.body\.classList\.toggle\('sidebar-collapsed'/);
  assert.match(dashboardJs, /api\('\/api\/backups'/);
  assert.match(dashboardJs, /new URLSearchParams/);
  assert.match(dashboardJs, /api\(`\/api\/search\?\$\{params\.toString\(\)\}`\)/);
  assert.match(dashboardJs, /api\(action\.endpoint/);
  assert.doesNotMatch(dashboardJs, /echarts\.init/);
});

test("dashboard settings API persists editable runtime preferences", async () => {
  await withHub(async (memoryDir) => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [cliPath, "app", "--port", String(port)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_MEMORY_DIR: memoryDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    try {
      await waitForServer(port, child);
      const beforeRes = await fetch(`http://127.0.0.1:${port}/api/settings`);
      assert.equal(beforeRes.status, 200);
      const before = await beforeRes.json();
      assert.equal(before.sync.snapshotLimit, 120);
      assert.equal(before.dashboard.autoRefresh, true);
      assert.equal(before.dashboard.notifications, true);
      assert.equal(before.dashboard.shortcuts.enabled, true);
      assert.equal(before.dashboard.shortcuts.bindings.focusSearch, "/");
      assert.equal(before.dashboard.shortcuts.bindings.openSearch, "mod+k");
      assert.equal(before.dashboard.shortcuts.tabBindings.dashboard, "1");

      const updateRes = await fetch(`http://127.0.0.1:${port}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sync: { snapshotLimit: 88 },
          dashboard: {
            autoRefresh: false,
            refreshIntervalMs: 12000,
            language: "en",
            theme: "light",
            notifications: false,
            shortcuts: {
              enabled: false,
              bindings: {
                focusSearch: "alt+f",
                openSearch: "ctrl+shift+k",
                showHelp: "ctrl+shift+/",
                closeLayer: "escape"
              },
              tabBindings: {
                dashboard: "alt+1",
                memory: "alt+2",
                radio: "alt+3",
                tasks: "alt+4",
                dispatch: "alt+5",
                workflows: "alt+6",
                analytics: "alt+7",
                backups: "alt+8",
                settings: "alt+9",
                health: "alt+0"
              }
            }
          }
        })
      });
      if (updateRes.status !== 200) {
        assert.fail(await updateRes.text());
      }
      const update = await updateRes.json();
      assert.equal(update.ok, true);
      assert.equal(update.settings.sync.snapshotLimit, 88);
      assert.equal(update.settings.dashboard.autoRefresh, false);
      assert.equal(update.settings.dashboard.refreshIntervalMs, 12000);
      assert.equal(update.settings.dashboard.language, "en");
      assert.equal(update.settings.dashboard.theme, "light");
      assert.equal(update.settings.dashboard.notifications, false);
      assert.equal(update.settings.dashboard.shortcuts.enabled, false);
      assert.equal(update.settings.dashboard.shortcuts.bindings.focusSearch, "alt+f");
      assert.equal(update.settings.dashboard.shortcuts.bindings.openSearch, "ctrl+shift+k");
      assert.equal(update.settings.dashboard.shortcuts.tabBindings.dashboard, "alt+1");
      assert.equal(update.settings.dashboard.shortcuts.tabBindings.health, "alt+0");

      const config = JSON.parse(await fs.readFile(path.join(memoryDir, "config.json"), "utf8"));
      assert.equal(config.sync.snapshotLimit, 88);
      assert.equal(config.dashboard.autoRefresh, false);
      assert.equal(config.dashboard.refreshIntervalMs, 12000);
      assert.equal(config.dashboard.language, "en");
      assert.equal(config.dashboard.theme, "light");
      assert.equal(config.dashboard.notifications, false);
      assert.equal(config.dashboard.shortcuts.enabled, false);
      assert.equal(config.dashboard.shortcuts.bindings.focusSearch, "alt+f");
      assert.equal(config.dashboard.shortcuts.tabBindings.dashboard, "alt+1");
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
});

test("dashboard search and backup APIs expose cross-hub data", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "search-memory",
      ts: now,
      source: "codex",
      text: "dashboard-signal memory record for dashboard search API coverage",
      metadata: { kind: "workflow", project: "ai-memory-hub" }
    });
    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "search-task",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "ai-memory-hub",
      title: "dashboard-signal task search target",
      description: "Task result should be included in dashboard search.",
      handoff: "",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), {
      id: "search-radio",
      ts: now,
      source: "test",
      from: "codex",
      to: "gemini",
      type: "note",
      project: "ai-memory-hub",
      text: "dashboard-signal radio search target"
    });
    await appendJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"), {
      id: "search-workflow",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      status: "in_progress",
      priority: "normal",
      project: "ai-memory-hub",
      title: "dashboard-signal workflow search target",
      planner: ["codex"],
      executor: ["codex"],
      reviewer: ["gemini"],
      observer: [],
      plan: "Verify dashboard search aggregates workflows.",
      acceptance: "",
      risks: [],
      results: [],
      reviews: [],
      linkedTasks: [],
      linkedRadio: [],
      notes: []
    });

    const port = await getFreePort();
    const child = spawn(process.execPath, [cliPath, "app", "--port", String(port)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_MEMORY_DIR: memoryDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    try {
      await waitForServer(port, child);
      const searchRes = await fetch(`http://127.0.0.1:${port}/api/search?q=dashboard-signal&type=all&limit=20`);
      assert.equal(searchRes.status, 200);
      const search = await searchRes.json();
      assert.equal(search.query, "dashboard-signal");
      const kinds = new Set(search.results.map((item) => item.kind));
      assert.ok(kinds.has("memory"));
      assert.ok(kinds.has("task"));
      assert.ok(kinds.has("radio"));
      assert.ok(kinds.has("workflow"));
      assert.ok(search.results.every((item) => item.preview.includes("dashboard-signal")));

      const taskSearchRes = await fetch(`http://127.0.0.1:${port}/api/search?q=dashboard-signal&type=task`);
      assert.equal(taskSearchRes.status, 200);
      const taskSearch = await taskSearchRes.json();
      assert.ok(taskSearch.results.length > 0);
      assert.ok(taskSearch.results.every((item) => item.kind === "task"));

      const backupsRes = await fetch(`http://127.0.0.1:${port}/api/backups`);
      assert.equal(backupsRes.status, 200);
      const beforeBackups = await backupsRes.json();
      assert.ok(Array.isArray(beforeBackups.backups));
      assert.ok(beforeBackups.policy.daily >= 1);

      const createBackupRes = await fetch(`http://127.0.0.1:${port}/api/backups/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "dashboard-api-test" })
      });
      if (createBackupRes.status !== 200) {
        assert.fail(await createBackupRes.text());
      }
      const createdBackup = await createBackupRes.json();
      assert.equal(createdBackup.ok, true);
      assert.equal(createdBackup.backup.reason, "dashboard-api-test");
      assert.ok(createdBackup.backups.count >= beforeBackups.count + 1);

      const pruneRes = await fetch(`http://127.0.0.1:${port}/api/backups/prune`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false, daily: 1, weekly: 1, preSync: 1 })
      });
      if (pruneRes.status !== 200) {
        assert.fail(await pruneRes.text());
      }
      const prune = await pruneRes.json();
      assert.equal(prune.ok, true);
      assert.equal(prune.apply, false);
      assert.ok(Array.isArray(prune.candidates));
      assert.equal(prune.backups.count, createdBackup.backups.count);
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
});

test("dashboard health API returns structured diagnostics and repair suggestions", async () => {
  await withHub(async (memoryDir) => {
    const repeatedText = "Repeated health rule: always verify ai-memory-hub dashboard changes.";
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "health-duplicate-a",
      ts: "2026-06-08T10:00:00.000Z",
      source: "codex",
      text: repeatedText,
      metadata: { kind: "workflow", project: "ai-memory-hub" }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "health-duplicate-b",
      ts: "2026-06-09T10:00:00.000Z",
      source: "gemini",
      text: repeatedText,
      metadata: { kind: "workflow", project: "ai-memory-hub" }
    });
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "health-corrupted",
      ts: "2026-06-10T10:00:00.000Z",
      source: "raw",
      text: "Broken health record \u0000 \ufffd",
      metadata: { kind: "raw", project: "ai-memory-hub" }
    });
    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "health-pending",
      ts: "2026-06-10T11:00:00.000Z",
      source: "codex",
      text: "Pending event to verify sync suggestion.",
      metadata: { kind: "note", project: "ai-memory-hub" }
    });

    const port = await getFreePort();
    const child = spawn(process.execPath, [cliPath, "app", "--port", String(port)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_MEMORY_DIR: memoryDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    try {
      await waitForServer(port, child);
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.match(payload.report, /## Recommended Actions/);
      assert.equal(payload.analysis.duplicateRecords, 1);
      assert.equal(payload.analysis.corruptedRecordsCount, 1);
      assert.ok(payload.analysis.issues.some((issue) => issue.title === "Pending inbox events"));
      assert.ok(payload.analysis.repairSuggestions.some((action) => action.endpoint === "/api/sync"));
      assert.ok(payload.analysis.repairSuggestions.some((action) => action.command === "ai-memory-hub sync"));
      assert.equal(payload.analysis.duplicateGroups[0].count, 2);
      assert.equal(payload.analysis.corruptedRecords[0].pointer.includes("health-corrupted"), true);

      const repairPreviewRes = await fetch(`http://127.0.0.1:${port}/api/health/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false, limit: 5 })
      });
      if (repairPreviewRes.status !== 200) {
        assert.fail(await repairPreviewRes.text());
      }
      const repairPreview = await repairPreviewRes.json();
      assert.equal(repairPreview.ok, true);
      assert.equal(repairPreview.apply, false);
      assert.equal(repairPreview.backup, null);
      assert.equal(repairPreview.plan.totalActions, 2);
      assert.equal(repairPreview.applied.ledgerRecordsUpdated, 0);
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
});

test("dashboard task review API records approval on task and linked workflow", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "review-task",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "claimed",
      priority: "normal",
      project: "test-project",
      title: "Reviewable task",
      description: "",
      handoff: "",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"), {
      id: "review-workflow",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      status: "in_progress",
      priority: "normal",
      project: "test-project",
      title: "Workflow under review",
      planner: [],
      executor: ["codex"],
      reviewer: ["user"],
      observer: [],
      plan: "",
      acceptance: "",
      risks: [],
      results: [],
      reviews: [],
      linkedTasks: ["review-task"],
      linkedRadio: [],
      notes: []
    });

    const port = await getFreePort();
    const child = spawn(process.execPath, [cliPath, "app", "--port", String(port)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_MEMORY_DIR: memoryDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    try {
      await waitForServer(port, child);
      const res = await fetch(`http://127.0.0.1:${port}/api/task/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "review-task",
          decision: "approved",
          by: "mobile-user",
          note: "Looks good"
        })
      });
      if (res.status !== 200) {
        assert.fail(await res.text());
      }
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.task.status, "done");
      assert.equal(payload.task.reviewStatus, "approved");
      assert.equal(payload.task.reviewedBy, "mobile-user");
      assert.equal(payload.task.reviewNote, "Looks good");
      assert.equal(payload.workflows.length, 1);
      assert.equal(payload.workflows[0].status, "review");
      assert.match(payload.workflows[0].reviews.at(-1).text, /review approved/);

      const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
      const task = tasks.find((item) => item.id === "review-task");
      assert.equal(task.status, "done");
      assert.equal(task.reviewStatus, "approved");
      assert.match(task.notes.at(-1).text, /Review approved/);

      const workflows = await readJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"));
      const workflow = workflows.find((item) => item.id === "review-workflow");
      assert.equal(workflow.status, "review");
      assert.match(workflow.reviews.at(-1).text, /review approved/);
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
});

test("dashboard websocket sends initial and pushed snapshots", async () => {
  await withHub(async (memoryDir) => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [cliPath, "app", "--port", String(port)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_MEMORY_DIR: memoryDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    let ws = null;
    try {
      await waitForServer(port, child);
      ws = await openWebSocket(port);
      const hello = await ws.reader.readJson(3000);
      assert.equal(hello.type, "hello");
      assert.equal(hello.snapshot.type, "snapshot");
      assert.ok(Array.isArray(hello.snapshot.tasks.tasks));

      const res = await fetch(`http://127.0.0.1:${port}/api/task/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Realtime pushed task",
          description: "Created through API to verify WebSocket broadcast.",
          from: "test",
          project: "test-project"
        })
      });
      if (res.status !== 200) {
        assert.fail(await res.text());
      }

      const pushed = await readUntilSnapshot(ws.reader, (snapshot) =>
        snapshot.tasks.tasks.some((task) => task.title === "Realtime pushed task")
      );
      assert.equal(pushed.type, "snapshot");
      assert.ok(["task:add", "file:tasks.jsonl"].includes(pushed.reason));
    } finally {
      ws?.socket.end();
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
});
