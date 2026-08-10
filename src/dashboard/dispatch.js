// A relay thread is "active" only while its call is still in flight. `completed`,
// `failed`, `failed-permanent`, and `abandoned` are resting states, so anything not
// listed here is deliberately excluded rather than assumed to be running.
const RELAY_ACTIVE_STATES = new Set(["pending", "dispatched", "acked", "progress", "retrying"]);

export function createDashboardDispatchApi({
  readDispatchLog,
  readLatestRelayStatusByThread
}) {
  function getDashboardDispatch(memoryDir) {
    const relayThreads = Object.values(readLatestRelayStatusByThread(memoryDir))
      .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
    const logs = readDispatchLog(memoryDir);
    // `logs` and `relay` below are display windows, so their lengths say nothing about
    // the real dataset. Every count is taken over the full set before slicing.
    return {
      logs: logs.slice(-100).reverse(),
      logsTotal: logs.length,
      relay: relayThreads.slice(0, 100),
      relayActive: relayThreads.filter((entry) => RELAY_ACTIVE_STATES.has(entry.state || entry.deliveryState)).length
    };
  }

  return {
    getDashboardDispatch
  };
}
