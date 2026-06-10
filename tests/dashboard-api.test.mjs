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
      assert.doesNotMatch(html, /<script>\s*\/\/\s*Global tool icon/);

      const cssRes = await fetch(`http://127.0.0.1:${port}/css/dashboard.css`);
      assert.equal(cssRes.status, 200);
      assert.match(cssRes.headers.get("content-type") || "", /text\/css/);
      assert.match(await cssRes.text(), /--bg-main/);

      const jsRes = await fetch(`http://127.0.0.1:${port}/js/dashboard.js`);
      assert.equal(jsRes.status, 200);
      assert.match(jsRes.headers.get("content-type") || "", /application\/javascript/);
      assert.match(await jsRes.text(), /function renderVirtualList/);

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
