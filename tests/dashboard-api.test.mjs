import assert from "node:assert/strict";
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
