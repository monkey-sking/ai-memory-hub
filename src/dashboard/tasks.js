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
        .slice(0, 200),
      kanban: buildTaskKanban(readTasks(memoryDir))
    };
  }

  return {
    getDashboardTasks
  };
}

export function buildTaskKanban(tasks = []) {
  const columns = {
    open: [],
    claimed: [],
    in_progress: [],
    needs_verification: [],
    blocked: [],
    done: [],
    cancelled: []
  };
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (Object.prototype.hasOwnProperty.call(columns, task.status)) {
      columns[task.status].push(task);
    }
  }
  return columns;
}
