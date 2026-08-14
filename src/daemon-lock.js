import fs from "node:fs";
import path from "node:path";

export const DAEMON_LOCK_FILE = "daemon.lock";

export function getDaemonLockPath(memoryDir) {
  return path.join(memoryDir, "state", DAEMON_LOCK_FILE);
}

export function acquireDaemonLock(memoryDir, { pid = process.pid, isProcessAlive = defaultProcessAlive } = {}) {
  const lockPath = getDaemonLockPath(memoryDir);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, `${JSON.stringify({ pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
    return { acquired: true, fd, lockPath, pid };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = readDaemonLock(lockPath);
    const existingPid = Number(existing?.pid || 0);
    if (existingPid > 0 && isProcessAlive(existingPid)) {
      return { acquired: false, lockPath, pid: existingPid, reason: "already-running" };
    }
    try { fs.unlinkSync(lockPath); } catch (unlinkError) {
      if (unlinkError.code !== "ENOENT") return { acquired: false, lockPath, pid: existingPid, reason: "stale-lock-not-removable" };
    }
    return acquireDaemonLock(memoryDir, { pid, isProcessAlive });
  }
}

export function releaseDaemonLock(lock, { pid = process.pid } = {}) {
  if (!lock?.lockPath) return false;
  try {
    const current = readDaemonLock(lock.lockPath);
    if (Number(current?.pid || 0) !== Number(pid)) return false;
    if (lock.fd != null) fs.closeSync(lock.fd);
    fs.unlinkSync(lock.lockPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    return false;
  }
}

function readDaemonLock(lockPath) {
  try { return JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch { return null; }
}

function defaultProcessAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}
