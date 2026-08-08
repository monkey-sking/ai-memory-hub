import fs from "node:fs";
import path from "node:path";
import {
  createSessionLease,
  evaluateSessionLease,
  finishSessionLease,
  updateSessionHeartbeat
} from "./session-supervisor.js";

export function createSessionSupervisor({
  memoryDir,
  now = () => new Date().toISOString(),
  staleMs = 30_000,
  appendJsonl = appendJsonLine,
  processAlive = defaultProcessAlive
} = {}) {
  if (!memoryDir) throw new Error("memoryDir is required");
  const file = path.join(memoryDir, "state", "session-leases.jsonl");

  function start(input = {}) {
    const lease = createSessionLease({ ...input, now: now() });
    append("start", lease);
    return lease;
  }

  function heartbeat(sessionId, timestamp = now()) {
    const lease = requireLease(sessionId);
    const updated = updateSessionHeartbeat(lease, timestamp);
    append("heartbeat", updated);
    return updated;
  }

  function finish(sessionId, options = {}) {
    const lease = requireLease(sessionId);
    const finished = finishSessionLease(lease, { ...options, now: options.now || now() });
    append("finish", finished);
    return finished;
  }

  function inspect(sessionId, options = {}) {
    const lease = requireLease(sessionId);
    return withEvaluation(lease, { ...options, staleMs, processAlive: options.processAlive ?? processAlive });
  }

  function list(options = {}) {
    return [...readLatestFromFile(file).values()]
      .map((lease) => withEvaluation(lease, { ...options, staleMs, processAlive: options.processAlive ?? processAlive }))
      .filter((item) => !options.status || item.lease.status === options.status);
  }

  function reconcile(options = {}) {
    const evaluations = list(options).filter((item) => ["dead", "stale"].includes(item.state));
    if (options.markDead) {
      for (const item of evaluations) {
        if (item.state === "dead" && !["failed", "abandoned"].includes(item.lease.status)) {
          const failed = finishSessionLease(item.lease, {
            status: "failed",
            error: "supervisor detected process exit",
            now: options.now || now()
          });
          append("reconcile", failed);
          item.lease = failed;
        }
      }
    }
    return evaluations;
  }

  function requireLease(sessionId) {
    const lease = readLatestFromFile(file).get(String(sessionId));
    if (!lease) throw new Error(`Unknown session lease: ${sessionId}`);
    return lease;
  }

  function append(event, lease) {
    appendJsonl(file, { event, ts: now(), lease });
  }

  return { start, heartbeat, finish, inspect, list, reconcile, files: { leaseFile: file } };
}

function withEvaluation(lease, options = {}) {
  const aliveOption = options.processAlive;
  const processAlive = typeof aliveOption === "function" ? aliveOption(lease.pid) : aliveOption ?? defaultProcessAlive(lease.pid);
  return { lease, ...evaluateSessionLease(lease, { ...options, processAlive }) };
}

function readLatestFromFile(file) {
  if (!fs.existsSync(file)) return new Map();
  const latest = new Map();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.lease?.sessionId) latest.set(entry.lease.sessionId, entry.lease);
  }
  return latest;
}

function appendJsonLine(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function defaultProcessAlive(pid) {
  if (!Number.isFinite(Number(pid)) || Number(pid) <= 0) return true;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}
