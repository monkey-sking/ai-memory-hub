const TERMINAL_STATES = new Set(["completed", "failed", "abandoned"]);

export function createSessionLease({ sessionId, tool, project = "", cwd = "", pid = null, transport = "runner", now = new Date().toISOString() } = {}) {
  if (!sessionId) throw new Error("sessionId is required");
  if (!tool) throw new Error("tool is required");
  return {
    sessionId: String(sessionId),
    tool: String(tool),
    project: String(project || ""),
    cwd: String(cwd || ""),
    pid: Number.isFinite(Number(pid)) ? Number(pid) : null,
    transport: String(transport || "runner"),
    status: "active",
    startedAt: now,
    lastHeartbeat: now,
    completedAt: "",
    exitCode: null,
    lastError: ""
  };
}

export function updateSessionHeartbeat(lease, now = new Date().toISOString()) {
  assertLease(lease);
  if (TERMINAL_STATES.has(lease.status)) throw new Error("Cannot heartbeat a terminal session lease");
  return { ...lease, status: "active", lastHeartbeat: now };
}

export function finishSessionLease(lease, { status = "completed", exitCode = null, error = "", now = new Date().toISOString() } = {}) {
  assertLease(lease);
  if (!TERMINAL_STATES.has(status)) throw new Error(`Invalid terminal session status: ${status}`);
  return { ...lease, status, completedAt: now, exitCode, lastError: String(error || "") };
}

export function evaluateSessionLease(lease, { now = new Date().toISOString(), staleMs = 30_000, processAlive = true } = {}) {
  assertLease(lease);
  if (TERMINAL_STATES.has(lease.status)) return { state: lease.status, reason: "terminal", ageMs: 0 };
  const heartbeatMs = Date.parse(lease.lastHeartbeat || lease.startedAt);
  const nowMs = Date.parse(now);
  const ageMs = Number.isFinite(heartbeatMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - heartbeatMs) : Infinity;
  if (!processAlive) return { state: "dead", reason: "process-exited", ageMs };
  if (ageMs > staleMs) return { state: "stale", reason: "heartbeat-expired", ageMs };
  return { state: "active", reason: "ok", ageMs };
}

function assertLease(lease) {
  if (!lease?.sessionId) throw new Error("session lease is required");
}
