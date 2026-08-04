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
    const offset = normalizePageValue(options.offset, 0);
    const limit = normalizePageValue(options.limit, 200, 500);
    const filteredTasks = readTasks(memoryDir)
      .filter((task) => matchesTaskStatus(task, status, includeCancelled))
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    return {
      tasks: filteredTasks.slice(offset, offset + limit),
      total: filteredTasks.length,
      offset,
      limit,
      hasMore: offset + limit < filteredTasks.length,
      kanban: buildTaskKanban(filteredTasks)
    };
  }

  function normalizePageValue(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.min(maximum, Math.floor(parsed));
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
