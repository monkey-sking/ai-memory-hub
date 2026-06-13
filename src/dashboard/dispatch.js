export function createDashboardDispatchApi({
  readDispatchLog,
  readLatestRelayStatusByThread
}) {
  function getDashboardDispatch(memoryDir) {
    const relay = Object.values(readLatestRelayStatusByThread(memoryDir))
      .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
      .slice(0, 100);
    return {
      logs: readDispatchLog(memoryDir).slice(-100).reverse(),
      relay
    };
  }

  return {
    getDashboardDispatch
  };
}
