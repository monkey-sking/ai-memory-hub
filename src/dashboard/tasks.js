export function createDashboardTasksApi({ readTasks }) {
  function matchesTaskStatus(task, status, includeCancelled) {
    if (task.status === "cancelled" && !includeCancelled && status !== "cancelled") {
      return false;
    }
    if (status === "all") {
      return true;
    }
    if (status === "active") {
      return !["done", "cancelled"].includes(task.status);
    }
    return task.status === status;
  }

  function getDashboardTasks(memoryDir, status = "all", options = {}) {
    const includeCancelled = Boolean(options.includeCancelled);
    return {
      tasks: readTasks(memoryDir)
        .filter((task) => matchesTaskStatus(task, status, includeCancelled))
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
        .slice(0, 200)
    };
  }

  return {
    getDashboardTasks
  };
}
