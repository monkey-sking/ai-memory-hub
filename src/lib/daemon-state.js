// daemon 状态持久化与查询（v3.0 重构 P0-2 第18批下沉）。
// 从 src/index.js 迁出，汇聚 daemon 的 pid/status/heartbeat 三类 state 文件的
// 读写 + buildDaemonStatus 聚合查询。仅依赖 node 内置 + lib/独立模块，
// 不反向 import src/index.js（保持依赖图无环）。

import fs from "node:fs";
import path from "node:path";

import { checkProcessLiveness } from "./util.js";
import { evaluateDaemonHeartbeat } from "../daemon-health.js";
import { readTextIfExists } from "./http.js";
import { ensureDir, readJson, writeJson } from "./cli.js";
import { writeFileAtomic } from "../atomic-write.js";

const DAEMON_PID_FILE = "daemon.pid";
const DAEMON_STATUS_FILE = "daemon-status.json";
const DAEMON_HEARTBEAT_FILE = "daemon-heartbeat.json";
const DAEMON_HEARTBEAT_STALE_MS = 30000; // 30 seconds without heartbeat = stale

export function buildDaemonStatus(memoryDir) {
  const paths = getDaemonStatePaths(memoryDir);
  const status = readDaemonStatus(memoryDir);
  const pidFromFile = readDaemonPid(memoryDir);
  const pidFromStatus = Number(status.pid || 0);
  const pid = pidFromFile || (Number.isInteger(pidFromStatus) && pidFromStatus > 0 ? pidFromStatus : null);
  const liveness = checkProcessLiveness(pid);
  const declaredActive = ["starting", "running", "stopping"].includes(status.state || "") || (pidFromFile && !status.state);
  const running = Boolean(pid && declaredActive && liveness.running);
  const state = status.state === "invalid"
    ? "invalid"
    : running
      ? (status.state || "running")
      : status.state === "stopped"
        ? "stopped"
        : pid
          ? "stale"
          : "not_running";

  return {
    state,
    running,
    stalePid: Boolean(pid && !running),
    pid,
    pidFile: paths.pidFile,
    statusFile: paths.statusFile,
    liveness,
    status
  };
}

function getDaemonStatePaths(memoryDir) {
  return {
    pidFile: path.join(memoryDir, "state", DAEMON_PID_FILE),
    statusFile: path.join(memoryDir, "state", DAEMON_STATUS_FILE)
  };
}

export function readDaemonPid(memoryDir) {
  const text = readTextIfExists(getDaemonStatePaths(memoryDir).pidFile).trim();
  const pid = Number(text);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export function writeDaemonPid(memoryDir, pid) {
  const paths = getDaemonStatePaths(memoryDir);
  ensureDir(path.dirname(paths.pidFile));
  writeFileAtomic(paths.pidFile, `${pid}\n`, "utf8");
}

export function clearDaemonPid(memoryDir, pid) {
  const paths = getDaemonStatePaths(memoryDir);
  const currentPid = readDaemonPid(memoryDir);
  if (currentPid === pid && fs.existsSync(paths.pidFile)) {
    fs.unlinkSync(paths.pidFile);
  }
}

export function writeDaemonHeartbeat(memoryDir, data) {
  const filePath = path.join(memoryDir, "state", DAEMON_HEARTBEAT_FILE);
  ensureDir(path.dirname(filePath));
  writeFileAtomic(filePath, JSON.stringify({
    ...data,
    ts: new Date().toISOString()
  }, null, 2), "utf8");
}

export function readDaemonHeartbeat(memoryDir) {
  const filePath = path.join(memoryDir, "state", DAEMON_HEARTBEAT_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function checkDaemonHeartbeat(memoryDir) {
  const heartbeat = readDaemonHeartbeat(memoryDir);
  const processAlive = heartbeat?.pid ? checkProcessLiveness(heartbeat.pid).running : true;
  return evaluateDaemonHeartbeat({
    heartbeat,
    staleMs: DAEMON_HEARTBEAT_STALE_MS,
    processAlive
  });
}

export function readDaemonStatus(memoryDir) {
  const file = getDaemonStatePaths(memoryDir).statusFile;
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return readJson(file);
  } catch (error) {
    return {
      state: "invalid",
      error: error.message || String(error)
    };
  }
}

export function writeDaemonStatus(memoryDir, patch) {
  const paths = getDaemonStatePaths(memoryDir);
  const existing = readDaemonStatus(memoryDir);
  writeJson(paths.statusFile, {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}
