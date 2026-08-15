import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireDaemonLock, releaseDaemonLock } from "../src/daemon-lock.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");

test("daemon lock rejects a second live owner", async () => {
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-daemon-lock-"));
  try {
    const first = acquireDaemonLock(memoryDir, { pid: 101, isProcessAlive: (pid) => pid === 101 });
    const second = acquireDaemonLock(memoryDir, { pid: 202, isProcessAlive: (pid) => pid === 101 });
    assert.equal(first.acquired, true);
    assert.equal(second.acquired, false);
    assert.equal(second.reason, "already-running");
    releaseDaemonLock(first, { pid: 101 });
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
});

test("daemon lock replaces a stale owner", async () => {
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-daemon-lock-"));
  try {
    await fs.mkdir(path.join(memoryDir, "state"), { recursive: true });
    await fs.writeFile(path.join(memoryDir, "state", "daemon.lock"), JSON.stringify({ pid: 101, token: "stale" }));
    const fresh = acquireDaemonLock(memoryDir, { pid: 202, isProcessAlive: () => false });
    assert.equal(fresh.acquired, true);
    assert.equal(fresh.pid, 202);
    releaseDaemonLock(fresh, { pid: 202 });
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
});

test("daemon lock refuses to treat a malformed lock as stale", async () => {
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-daemon-lock-"));
  try {
    await fs.mkdir(path.join(memoryDir, "state"), { recursive: true });
    await fs.writeFile(path.join(memoryDir, "state", "daemon.lock"), "{\"pid\":");
    const result = acquireDaemonLock(memoryDir, { pid: 202, isProcessAlive: () => false });
    assert.equal(result.acquired, false);
    assert.equal(result.reason, "invalid-lock");
  } finally { await fs.rm(memoryDir, { recursive: true, force: true }); }
});

test("old owner cannot release a replacement lock with the same pid", async () => {
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-daemon-lock-"));
  try {
    const first = acquireDaemonLock(memoryDir, { pid: 101, isProcessAlive: () => false });
    releaseDaemonLock(first, { pid: 101 });
    const second = acquireDaemonLock(memoryDir, { pid: 101, isProcessAlive: () => false });
    assert.equal(releaseDaemonLock(first, { pid: 101 }), false);
    await fs.stat(path.join(memoryDir, "state", "daemon.lock"));
    releaseDaemonLock(second, { pid: 101 });
  } finally { await fs.rm(memoryDir, { recursive: true, force: true }); }
});

test("daemon --force refuses to start beside a live daemon", async () => {
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-daemon-lock-"));
  try {
    await fs.mkdir(path.join(memoryDir, "state"), { recursive: true });
    await fs.writeFile(path.join(memoryDir, "state", "daemon.pid"), String(process.pid) + "\n");
    await fs.writeFile(path.join(memoryDir, "state", "daemon-status.json"), JSON.stringify({ state: "running", pid: process.pid }));
    const result = spawnSync(process.execPath, [cliPath, "daemon", "--force"], { cwd: repoRoot, env: { ...process.env, AI_MEMORY_DIR: memoryDir }, encoding: "utf8", timeout: 1000, windowsHide: true });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /already running|active daemon|lock/i);
  } finally { await fs.rm(memoryDir, { recursive: true, force: true }); }
});
