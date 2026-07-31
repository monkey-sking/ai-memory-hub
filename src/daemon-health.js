export function evaluateDaemonHeartbeat({
  heartbeat,
  now = Date.now(),
  staleMs = 30_000,
  processAlive = true
}) {
  if (!heartbeat || !heartbeat.ts) {
    return {
      alive: false,
      stale: false,
      dead: false,
      reason: "No heartbeat file found"
    };
  }

  const timestamp = new Date(heartbeat.ts).getTime();
  if (!Number.isFinite(timestamp)) {
    return {
      alive: false,
      stale: false,
      dead: false,
      pid: heartbeat.pid,
      cycle: heartbeat.cycle,
      lastTs: heartbeat.ts,
      reason: "Invalid heartbeat timestamp"
    };
  }

  const nowMs = typeof now === "string" ? new Date(now).getTime() : Number(now);
  const ageMs = Math.max(0, nowMs - timestamp);
  const stale = ageMs > staleMs;
  const dead = !stale && processAlive === false;

  return {
    alive: !stale && !dead,
    stale,
    dead,
    ageMs,
    pid: heartbeat.pid,
    cycle: heartbeat.cycle,
    lastTs: heartbeat.ts,
    reason: stale
      ? `Heartbeat is ${Math.round(ageMs / 1000)}s old (threshold: ${staleMs / 1000}s)`
      : dead
        ? `Heartbeat process ${heartbeat.pid || "?"} is not running`
        : "OK"
  };
}
