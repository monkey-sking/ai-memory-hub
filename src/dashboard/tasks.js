export function createDashboardTasksApi({ readTasks }) {
  function getDashboardTasks(memoryDir, status = "all") {
    return {
      tasks: readTasks(memoryDir)
        .filter((task) => status === "all" ? true : status === "active" ? !["done", "cancelled"].includes(task.status) : task.status === status)
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
        .slice(0, 200)
    };
  }

  return {
    getDashboardTasks
  };
}
