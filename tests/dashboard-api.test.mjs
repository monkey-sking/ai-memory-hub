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

async function withTempDir(prefix, fn) {
  const dir = await fs.mkdtemp(path.join(repoRoot, prefix));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function withPathTemporarilyHidden(targetPath, fn) {
  const hiddenPath = `${targetPath}.test-hidden`;
  let renamed = false;
  try {
    await fs.rm(hiddenPath, { recursive: true, force: true });
    await fs.access(targetPath);
    await fs.rename(targetPath, hiddenPath);
    renamed = true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  try {
    await fn();
  } finally {
    if (renamed) {
      await fs.rm(targetPath, { recursive: true, force: true });
      await fs.rename(hiddenPath, targetPath);
    }
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
      const scriptMatch = html.match(/<script type="module" crossorigin src="([^"]+\.js)"><\/script>/);
      const cssMatch = html.match(/<link rel="stylesheet" crossorigin href="([^"]+\.css)">/);
      assert.ok(scriptMatch, "dashboard HTML should load the Vite JS bundle");
      assert.ok(cssMatch, "dashboard HTML should load the Vite CSS bundle");
      assert.match(html, /<div id="root"><\/div>/);
      assert.match(html, /href="\/favicon\.svg"/);

      const cssRes = await fetch(`http://127.0.0.1:${port}${cssMatch[1]}`);
      assert.equal(cssRes.status, 200);
      assert.match(cssRes.headers.get("content-type") || "", /text\/css/);
      const dashboardCss = await cssRes.text();
      assert.ok(dashboardCss.length > 1000);

      const jsRes = await fetch(`http://127.0.0.1:${port}${scriptMatch[1]}`);
      assert.equal(jsRes.status, 200);
      assert.match(jsRes.headers.get("content-type") || "", /application\/javascript/);
      const dashboardScript = await jsRes.text();
      assert.ok(dashboardScript.length > 1000);

      const faviconRes = await fetch(`http://127.0.0.1:${port}/favicon.svg`);
      assert.equal(faviconRes.status, 200);
      assert.match(faviconRes.headers.get("content-type") || "", /image\/svg\+xml/);

      const iconRes = await fetch(`http://127.0.0.1:${port}/assets/tool-icons/codex.png`);
      assert.equal(iconRes.status, 200);
      assert.match(iconRes.headers.get("content-type") || "", /image\/png/);

      const metricsRes = await fetch(`http://127.0.0.1:${port}/api/metrics`);
      assert.equal(metricsRes.status, 200);
      const metrics = await metricsRes.json();
      assert.equal(metrics.tasks.total, 0);
      assert.deepEqual(metrics.tasks.byStatus, {});
      assert.equal(metrics.queue.running, 0);
      assert.ok(Array.isArray(metrics.recentFailures));

      const dashboardRes = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
      assert.equal(dashboardRes.status, 200);
      const dashboard = await dashboardRes.json();
      assert.equal(dashboard.metrics.tasks.total, metrics.tasks.total);
      assert.equal(dashboard.metrics.relay.successRate, metrics.relay.successRate);

      const capabilitiesRes = await fetch(`http://127.0.0.1:${port}/api/capabilities`);
      assert.equal(capabilitiesRes.status, 200);
      const capabilities = await capabilitiesRes.json();
      assert.equal(capabilities.version, 1);
      assert.ok(capabilities.summary.gatewayRestCandidates >= 2);
      assert.ok(capabilities.tools.some((tool) => tool.name === "qclaw" && tool.capability.gatewayRest));

      const toolsRes = await fetch(`http://127.0.0.1:${port}/api/tools?refresh=1`);
      assert.equal(toolsRes.status, 200);
      const toolsPayload = await toolsRes.json();
      assert.equal(toolsPayload.capabilities.total, capabilities.summary.total);
      assert.ok(toolsPayload.tools.some((tool) => tool.name === "codex" && tool.capability.directCli));

      const traversalRes = await fetch(`http://127.0.0.1:${port}/assets/%2e%2e/%2e%2e/package.json`);
      assert.notEqual(traversalRes.status, 200);
      assert.doesNotMatch(await traversalRes.text(), /"name": "ai-memory-hub"/);
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });

  const dashboardSource = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "pages", "Dashboard.tsx"), "utf8");
  const dashboardCss = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "pages", "Dashboard.css"), "utf8");
  const projectsPanelSource = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "components", "ProjectsPanel.tsx"), "utf8");
  const tasksPanelSource = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "components", "TasksPanel.tsx"), "utf8");
  const workflowsPanelSource = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "components", "WorkflowsPanel.tsx"), "utf8");
  const toastStackSource = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "components", "ToastStack.tsx"), "utf8");
  assert.match(dashboardSource, /TasksPanel as NewTasksPanel/);
  assert.match(dashboardSource, /WorkflowsPanel as NewWorkflowsPanel/);
  assert.match(dashboardSource, /import \{ ProjectsPanel \}/);
  assert.match(tasksPanelSource, /export function TasksPanel/);
  assert.match(workflowsPanelSource, /export function WorkflowsPanel/);
  assert.match(projectsPanelSource, /export function ProjectsPanel/);
  assert.match(dashboardSource, /from '\.\.\/components\/ToastStack'/);
  assert.match(toastStackSource, /export function ToastStack/);
  assert.match(toastStackSource, /aria-live="polite"/);
  assert.match(dashboardSource, /function Modal/);
  assert.match(dashboardSource, /apiGet<DashboardSnapshot>\('\/api\/dashboard'\)/);
  assert.match(dashboardSource, /'\/api\/task\/status'/);
  assert.match(dashboardSource, /'\/api\/task\/review'/);
  assert.match(dashboardSource, /apiGet<AnyRecord>\('\/api\/health'\)/);
  assert.match(dashboardSource, /toolIconFiles/);
  assert.match(dashboardCss, /\.kanban-grid/);
  assert.match(dashboardCss, /\.kanban-grid-4/);
  assert.match(dashboardCss, /\.toast-stack/);
  assert.match(dashboardCss, /\.workflow-card/);
  assert.match(dashboardCss, /\.tool-card/);
});

test("dashboard serves SPA assets from dashboard-next/dist when public is absent", async () => {
  await withPathTemporarilyHidden(path.join(repoRoot, "public"), async () => {
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
        assert.match(html, /<div id="root"><\/div>/);

        const scriptMatch = html.match(/<script type="module" crossorigin src="([^"]+\.js)"><\/script>/);
        assert.ok(scriptMatch, "dashboard HTML should still point at a Vite bundle");

        const jsRes = await fetch(`http://127.0.0.1:${port}${scriptMatch[1]}`);
        assert.equal(jsRes.status, 200);
        assert.match(jsRes.headers.get("content-type") || "", /application\/javascript/);

        const iconRes = await fetch(`http://127.0.0.1:${port}/assets/tool-icons/codex.png`);
        assert.equal(iconRes.status, 200);
      } finally {
        await stopServer(child);
      }
      assert.deepEqual(stderr, []);
    });
  });
});

test("dashboard task APIs hide cancelled tasks by default", async () => {
  await withHub(async (memoryDir) => {
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "dashboard-open-visible",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
      createdBy: "test",
      status: "open",
      title: "Visible dashboard task",
      project: "ai-memory-hub"
    });
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "dashboard-cancelled-hidden",
      createdAt: "2026-06-15T00:01:00.000Z",
      updatedAt: "2026-06-15T00:01:00.000Z",
      createdBy: "test",
      status: "cancelled",
      title: "Hidden dashboard task",
      project: "ai-memory-hub"
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

      const defaultRes = await fetch(`http://127.0.0.1:${port}/api/tasks`);
      assert.equal(defaultRes.status, 200);
      const defaultPayload = await defaultRes.json();
      assert.ok(defaultPayload.tasks.some((task) => task.id === "dashboard-open-visible"));
      assert.equal(defaultPayload.tasks.some((task) => task.id === "dashboard-cancelled-hidden"), false);

      const allRes = await fetch(`http://127.0.0.1:${port}/api/tasks?status=all`);
      assert.equal(allRes.status, 200);
      const allPayload = await allRes.json();
      assert.equal(allPayload.tasks.some((task) => task.id === "dashboard-cancelled-hidden"), false);

      const includeRes = await fetch(`http://127.0.0.1:${port}/api/tasks?status=all&includeCancelled=1`);
      assert.equal(includeRes.status, 200);
      const includePayload = await includeRes.json();
      assert.ok(includePayload.tasks.some((task) => task.id === "dashboard-cancelled-hidden"));

      const cancelledRes = await fetch(`http://127.0.0.1:${port}/api/tasks?status=cancelled`);
      assert.equal(cancelledRes.status, 200);
      const cancelledPayload = await cancelledRes.json();
      assert.deepEqual(cancelledPayload.tasks.map((task) => task.id), ["dashboard-cancelled-hidden"]);

      const dashboardRes = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
      assert.equal(dashboardRes.status, 200);
      const dashboard = await dashboardRes.json();
      assert.ok(dashboard.tasks.tasks.some((task) => task.id === "dashboard-open-visible"));
      assert.equal(dashboard.tasks.tasks.some((task) => task.id === "dashboard-cancelled-hidden"), false);
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
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

test("dashboard workflow API supports CRUD actions and UI hooks", async () => {
  const dashboardSource = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "pages", "Dashboard.tsx"), "utf8");
  assert.match(dashboardSource, /function WorkflowsPanel/);
  assert.match(dashboardSource, /function WorkflowCard/);
  assert.match(dashboardSource, /createWorkflowForm/);
  assert.match(dashboardSource, /apiPost<AnyRecord>\('\/api\/workflows'/);
  assert.match(dashboardSource, /apiPatch<AnyRecord>\(`\/api\/workflows\/\$\{encodeURIComponent\(form\.id\)\}`/);
  assert.match(dashboardSource, /apiDelete<AnyRecord>\(`\/api\/workflows\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(dashboardSource, /apiPost<AnyRecord>\(`\/api\/workflows\/\$\{encodeURIComponent\(id\)\}\/status`/);
  assert.match(dashboardSource, /apiPost<AnyRecord>\(`\/api\/workflows\/\$\{encodeURIComponent\(id\)\}\/signal`/);
  assert.match(dashboardSource, /apiPost<AnyRecord>\(`\/api\/workflows\/\$\{encodeURIComponent\(id\)\}\/\$\{actionState\.action\}`/);

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
      const createRes = await fetch(`http://127.0.0.1:${port}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Dashboard workflow CRUD",
          from: "dashboard-test",
          project: "ai-memory-hub",
          priority: "high",
          status: "planned",
          planner: "codex",
          executor: "codex,claude",
          reviewer: "claude",
          observer: "marvis",
          plan: "Create, edit, review, and signal from dashboard.",
          acceptance: "Workflow API actions persist.",
          risks: "Regression risk\nReview delay"
        })
      });
      if (createRes.status !== 200) {
        assert.fail(await createRes.text());
      }
      const created = await createRes.json();
      assert.equal(created.ok, true);
      assert.equal(created.workflow.title, "Dashboard workflow CRUD");
      assert.equal(created.workflow.status, "planned");
      assert.equal(created.workflow.priority, "high");
      assert.deepEqual(created.workflow.planner, ["codex"]);
      assert.deepEqual(created.workflow.executor, ["codex", "claude"]);
      assert.deepEqual(created.workflow.reviewer, ["claude"]);
      assert.deepEqual(created.workflow.risks, ["Regression risk", "Review delay"]);
      const workflowId = created.workflow.id;

      const updateRes = await fetch(`http://127.0.0.1:${port}/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Dashboard workflow CRUD updated",
          by: "dashboard-test",
          status: "in_progress",
          reviewer: "gemini",
          risks: "Scope creep, stale review"
        })
      });
      if (updateRes.status !== 200) {
        assert.fail(await updateRes.text());
      }
      const updated = await updateRes.json();
      assert.equal(updated.workflow.title, "Dashboard workflow CRUD updated");
      assert.equal(updated.workflow.status, "in_progress");
      assert.deepEqual(updated.workflow.reviewer, ["gemini"]);
      assert.deepEqual(updated.workflow.risks, ["Scope creep", "stale review"]);
      assert.match(updated.workflow.notes.at(-1).text, /Updated workflow fields/);

      const statusRes = await fetch(`http://127.0.0.1:${port}/api/workflows/${workflowId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "blocked", by: "dashboard-test", note: "Waiting for reviewer." })
      });
      if (statusRes.status !== 200) {
        assert.fail(await statusRes.text());
      }
      const statusPayload = await statusRes.json();
      assert.equal(statusPayload.workflow.status, "blocked");
      assert.match(statusPayload.workflow.notes.at(-1).text, /Waiting for reviewer/);

      const resultRes = await fetch(`http://127.0.0.1:${port}/api/workflows/${workflowId}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "codex", role: "executor", text: "Implementation finished." })
      });
      if (resultRes.status !== 200) {
        assert.fail(await resultRes.text());
      }
      const resultPayload = await resultRes.json();
      assert.equal(resultPayload.workflow.results.at(-1).text, "Implementation finished.");
      assert.equal(resultPayload.workflow.results.at(-1).role, "executor");

      const reviewRes = await fetch(`http://127.0.0.1:${port}/api/workflows/${workflowId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "claude", role: "reviewer", text: "Review passed." })
      });
      if (reviewRes.status !== 200) {
        assert.fail(await reviewRes.text());
      }
      const reviewPayload = await reviewRes.json();
      assert.equal(reviewPayload.workflow.status, "review");
      assert.equal(reviewPayload.workflow.reviews.at(-1).text, "Review passed.");

      const noteRes = await fetch(`http://127.0.0.1:${port}/api/workflows/${workflowId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "dashboard-test", text: "Dashboard note persisted." })
      });
      if (noteRes.status !== 200) {
        assert.fail(await noteRes.text());
      }
      const notePayload = await noteRes.json();
      assert.equal(notePayload.workflow.notes.at(-1).text, "Dashboard note persisted.");

      const signalRes = await fetch(`http://127.0.0.1:${port}/api/workflows/${workflowId}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "dashboard-test", to: "claude", type: "handoff", text: "Please review workflow CRUD." })
      });
      if (signalRes.status !== 200) {
        assert.fail(await signalRes.text());
      }
      const signalPayload = await signalRes.json();
      assert.equal(signalPayload.message.to, "claude");
      assert.match(signalPayload.message.text, new RegExp(`\\[workflow:${workflowId}\\] Please review workflow CRUD\\.`));
      assert.ok(signalPayload.workflow.linkedRadio.includes(signalPayload.message.id));

      const listedRes = await fetch(`http://127.0.0.1:${port}/api/workflows`);
      assert.equal(listedRes.status, 200);
      const listed = await listedRes.json();
      assert.ok(listed.workflows.some((workflow) => workflow.id === workflowId && workflow.linkedRadio.includes(signalPayload.message.id)));

      const radio = await readJsonl(path.join(memoryDir, "radio", "messages.jsonl"));
      assert.ok(radio.some((message) => message.id === signalPayload.message.id && message.thread === workflowId));

      const deleteRes = await fetch(`http://127.0.0.1:${port}/api/workflows/${workflowId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "dashboard-test" })
      });
      if (deleteRes.status !== 200) {
        assert.fail(await deleteRes.text());
      }
      const deleted = await deleteRes.json();
      assert.equal(deleted.workflow.id, workflowId);
      assert.equal(deleted.workflow.deletedBy, "dashboard-test");
      const workflows = await readJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"));
      assert.equal(workflows.some((workflow) => workflow.id === workflowId), false);

      const workflowEvents = await readJsonl(path.join(memoryDir, "workflows", "events.jsonl"));
      assert.ok(workflowEvents.some((event) => (
        event.type === "workflow.delete" &&
        event.entityId === workflowId &&
        event.reason === "workflow:delete"
      )));
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
});

test("dashboard projects API exposes registry data and UI hooks", async () => {
  const dashboardSource = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "pages", "Dashboard.tsx"), "utf8");
  const projectsPanelSource = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "components", "ProjectsPanel.tsx"), "utf8");
  const dashboardCopy = await fs.readFile(path.join(repoRoot, "dashboard-next", "src", "lib", "dashboardCopy.ts"), "utf8");
  assert.match(dashboardSource, /import \{ ProjectsPanel \}/);
  assert.match(projectsPanelSource, /export function ProjectsPanel/);
  assert.match(dashboardSource, /visibleProjects/);
  assert.match(projectsPanelSource, /unregisteredProjects/);
  assert.match(projectsPanelSource, /<Table/);
  assert.match(dashboardCopy, /visibleProjects: '可见项目'/);
  assert.match(dashboardCopy, /visibleProjects: 'Visible projects'/);

  const projectGuide = await fs.readFile(path.join(repoRoot, "docs", "project-registry.md"), "utf8");
  assert.match(projectGuide, /GET    \/api\/projects/);
  assert.match(projectGuide, /ai-memory-hub project show <project-or-alias>/);

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
      const initialRes = await fetch(`http://127.0.0.1:${port}/api/projects`);
      assert.equal(initialRes.status, 200);
      const initial = await initialRes.json();
      assert.ok(initial.projects.some((project) => project.id === "ai-memory-hub"));
      assert.ok(initial.visibleProjects.some((project) => project.id === "sample-media"));
      assert.ok(initial.visibleProjects.every((project) => project.status !== "archived"));
      assert.deepEqual(initial.statuses, ["active", "paused", "archived", "planning"]);

      const createRes = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "dashboard-project",
          name: "Dashboard Project",
          displayName: "Dashboard Project",
          status: "planning",
          type: "tool",
          description: "Created from dashboard API test.",
          aliases: ["dashboard alias"],
          resources: {
            repo: "<local-repo-path>",
            docs: ["https://example.test/project"]
          }
        })
      });
      if (createRes.status !== 200) {
        assert.fail(await createRes.text());
      }
      const created = await createRes.json();
      assert.equal(created.ok, true);
      assert.equal(created.project.id, "dashboard-project");
      assert.equal(created.project.status, "planning");
      assert.ok(created.projects.visibleProjects.some((project) => project.id === "dashboard-project"));

      const updateRes = await fetch(`http://127.0.0.1:${port}/api/projects/dashboard-project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "paused",
          aliases: ["dashboard alias", "dashboard paused"],
          resources: { feishu: "https://example.test/feishu" },
          metadata: { relation: "example" }
        })
      });
      if (updateRes.status !== 200) {
        assert.fail(await updateRes.text());
      }
      const updated = await updateRes.json();
      assert.equal(updated.project.status, "paused");
      assert.ok(updated.project.aliases.includes("dashboard paused"));
      assert.equal(updated.project.resources.feishu, "https://example.test/feishu");
      assert.equal(updated.project.metadata.relation, "example");

      const aliasRes = await fetch(`http://127.0.0.1:${port}/api/projects/${encodeURIComponent("dashboard paused")}`);
      assert.equal(aliasRes.status, 200);
      const aliasPayload = await aliasRes.json();
      assert.equal(aliasPayload.project.id, "dashboard-project");

      const archiveRes = await fetch(`http://127.0.0.1:${port}/api/projects/dashboard-project`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "dashboard-test" })
      });
      if (archiveRes.status !== 200) {
        assert.fail(await archiveRes.text());
      }
      const archived = await archiveRes.json();
      assert.equal(archived.project.status, "archived");
      assert.equal(archived.project.archivedBy, "dashboard-test");
      assert.equal(archived.projects.visibleProjects.some((project) => project.id === "dashboard-project"), false);

      const dashboardRes = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
      assert.equal(dashboardRes.status, 200);
      const dashboard = await dashboardRes.json();
      assert.ok(dashboard.projects.projects.some((project) => project.id === "dashboard-project" && project.status === "archived"));
      assert.equal(dashboard.projects.visibleProjects.some((project) => project.id === "dashboard-project"), false);
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

      await withTempDir(".tmp-amh-dashboard-github-", async (repoDir) => {
        const githubStatusRes = await fetch(`http://127.0.0.1:${port}/api/backups/github/status`);
        assert.equal(githubStatusRes.status, 200);
        const githubStatus = await githubStatusRes.json();
        assert.equal(githubStatus.ok, true);
        assert.equal(githubStatus.github.allowPlaintextSensitive, false);

        const remoteUrl = "https://github.com/<owner>/<repo>.git";
        const configureRes = await fetch(`http://127.0.0.1:${port}/api/backups/github/configure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: true,
            remoteUrl,
            repoDir,
            branch: "dashboard",
            allowPlaintextSensitive: false
          })
        });
        if (configureRes.status !== 200) {
          assert.fail(await configureRes.text());
        }
        const configured = await configureRes.json();
        assert.equal(configured.github.enabled, true);
        assert.equal(configured.status.remoteUrl, remoteUrl);
        assert.equal(configured.status.repoDir, path.resolve(repoDir));
        assert.equal(configured.status.branch, "dashboard");

        const fakeToken = "ghp_" + "C".repeat(32);
        await fs.writeFile(path.join(memoryDir, "MEMORY.md"), `dashboard backup token ${fakeToken}\n`, "utf8");
        const dryRunRes = await fetch(`http://127.0.0.1:${port}/api/backups/github/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dryRun: true,
            push: true,
            remoteUrl,
            repoDir,
            branch: "dashboard",
            reason: "dashboard-github-preview"
          })
        });
        if (dryRunRes.status !== 200) {
          assert.fail(await dryRunRes.text());
        }
        const dryRun = await dryRunRes.json();
        assert.equal(dryRun.ok, true);
        assert.equal(dryRun.dryRun, true);
        assert.equal(dryRun.wouldPush, true);
        assert.equal(dryRun.wouldBlockPush, true);
        assert.ok(dryRun.warnings.some((warning) => /Data security reminder/.test(warning)));
        assert.ok(dryRun.scan.issues.some((issue) => issue.kind === "github-token"));

        const clearRemoteRes = await fetch(`http://127.0.0.1:${port}/api/backups/github/configure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remoteUrl: "" })
        });
        if (clearRemoteRes.status !== 200) {
          assert.fail(await clearRemoteRes.text());
        }
        const cleared = await clearRemoteRes.json();
        assert.equal(cleared.status.remoteUrl, "");
      });
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

test("dashboard task review and reopen keep cancelled tasks terminal", async () => {
  await withHub(async (memoryDir) => {
    const now = new Date().toISOString();
    const linkedWorkflow = {
      id: "cancelled-review-workflow",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      status: "in_progress",
      priority: "normal",
      project: "test-project",
      title: "Workflow linked to cancelled task",
      planner: [],
      executor: ["codex"],
      reviewer: ["reviewer"],
      observer: [],
      plan: "",
      acceptance: "",
      risks: [],
      results: [],
      reviews: [{ ts: now, by: "test", role: "reviewer", text: "Existing workflow review" }],
      linkedTasks: ["cancelled-review-task"],
      linkedRadio: [],
      notes: [{ ts: now, by: "test", text: "Existing workflow note" }]
    };
    await appendJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"), {
      id: "cancelled-review-task",
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      createdBy: "test",
      assignee: "codex",
      status: "cancelled",
      priority: "normal",
      project: "test-project",
      title: "Cancelled task",
      description: "",
      handoff: "",
      notes: []
    });
    await appendJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"), linkedWorkflow);
    const assertLinkedWorkflowUnchanged = (workflows) => {
      const workflow = workflows.find((item) => item.id === linkedWorkflow.id);
      assert.equal(workflow.status, linkedWorkflow.status);
      assert.equal(workflow.updatedAt, linkedWorkflow.updatedAt);
      assert.deepEqual(workflow.reviews, linkedWorkflow.reviews);
      assert.deepEqual(workflow.notes, linkedWorkflow.notes);
    };

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
      const approvedRes = await fetch(`http://127.0.0.1:${port}/api/task/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "cancelled-review-task",
          decision: "approved",
          by: "reviewer"
        })
      });
      if (approvedRes.status !== 200) {
        assert.fail(await approvedRes.text());
      }
      const approvedPayload = await approvedRes.json();
      assert.equal(approvedPayload.task.status, "cancelled");
      assert.equal(approvedPayload.task.reviewStatus, "approved");
      assert.equal(approvedPayload.workflows.length, 1);
      assertLinkedWorkflowUnchanged(approvedPayload.workflows);

      const rejectedRes = await fetch(`http://127.0.0.1:${port}/api/task/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "cancelled-review-task",
          decision: "rejected",
          by: "reviewer"
        })
      });
      if (rejectedRes.status !== 200) {
        assert.fail(await rejectedRes.text());
      }
      const rejectedPayload = await rejectedRes.json();
      assert.equal(rejectedPayload.task.status, "cancelled");
      assert.equal(rejectedPayload.task.reviewStatus, "rejected");
      assert.equal(rejectedPayload.workflows.length, 1);
      assertLinkedWorkflowUnchanged(rejectedPayload.workflows);

      const reopenReviewRes = await fetch(`http://127.0.0.1:${port}/api/task/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "cancelled-review-task",
          decision: "rejected",
          reopen: true,
          by: "reviewer"
        })
      });
      if (reopenReviewRes.status !== 200) {
        assert.fail(await reopenReviewRes.text());
      }
      const reopenReviewPayload = await reopenReviewRes.json();
      assert.equal(reopenReviewPayload.task.status, "cancelled");
      assert.equal(reopenReviewPayload.task.reviewStatus, "rejected");
      assert.equal(reopenReviewPayload.workflows.length, 1);
      assertLinkedWorkflowUnchanged(reopenReviewPayload.workflows);

      const reopenRes = await fetch(`http://127.0.0.1:${port}/api/task/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "cancelled-review-task",
          status: "open",
          by: "reviewer"
        })
      });
      if (reopenRes.status !== 200) {
        assert.fail(await reopenRes.text());
      }
      const reopenPayload = await reopenRes.json();
      assert.equal(reopenPayload.task.status, "cancelled");

      const tasks = await readJsonl(path.join(memoryDir, "tasks", "tasks.jsonl"));
      const task = tasks.find((item) => item.id === "cancelled-review-task");
      assert.equal(task.status, "cancelled");
      assert.equal(task.notes.length, 3);
      assert.match(task.notes[0].text, /Review approved/);
      assert.match(task.notes[1].text, /Review rejected/);
      assert.match(task.notes[2].text, /Review rejected.*task reopened/);

      const workflows = await readJsonl(path.join(memoryDir, "workflows", "workflows.jsonl"));
      assertLinkedWorkflowUnchanged(workflows);
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
});

test("dashboard websocket avoids duplicate initial snapshot and sends pushed snapshots", async () => {
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
      assert.equal(Object.prototype.hasOwnProperty.call(hello, "snapshot"), false);

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

test("dashboard memory supersede appends an inbox event without mutating ledger", async () => {
  await withHub(async (memoryDir) => {
    await appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), {
      id: "memory-original",
      ts: "2026-01-01T00:00:00.000Z",
      source: "test",
      text: "Original dashboard memory that should be corrected.",
      metadata: { kind: "workflow", project: "sample-project" }
    });
    const sync = runCli(memoryDir, ["sync"]);
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const beforeLedger = await readJsonl(path.join(memoryDir, "memories", "ledger.jsonl"));
    assert.equal(beforeLedger.length, 1);
    assert.equal(beforeLedger[0].localEventId, "memory-original");

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
      const memoryRes = await fetch(`http://127.0.0.1:${port}/api/memory`);
      assert.equal(memoryRes.status, 200);
      const memoryPayload = await memoryRes.json();
      assert.ok(Array.isArray(memoryPayload.records));
      assert.ok(memoryPayload.records.some((record) => record.localEventId === "memory-original"));

      const res = await fetch(`http://127.0.0.1:${port}/api/memory/supersede`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "memory-original",
          text: "Corrected dashboard memory safe for future agents.",
          kind: "workflow",
          project: "sample-project",
          source: "dashboard-next"
        })
      });
      if (res.status !== 200) {
        assert.fail(await res.text());
      }
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.event.metadata.supersedes, "memory-original");
      assert.equal(payload.event.metadata.kind, "workflow");
      assert.equal(payload.event.metadata.project, "sample-project");

      const inbox = await readJsonl(path.join(memoryDir, "inbox", "events.jsonl"));
      assert.equal(inbox.length, 1);
      assert.equal(inbox[0].metadata.supersedes, "memory-original");
      assert.match(inbox[0].id, /^supersede-/);

      const afterLedger = await readJsonl(path.join(memoryDir, "memories", "ledger.jsonl"));
      assert.deepEqual(afterLedger, beforeLedger);
    } finally {
      await stopServer(child);
    }
    assert.deepEqual(stderr, []);
  });
});
