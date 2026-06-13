export function createDashboardWorkflowsApi({ readWorkflows }) {
  function getDashboardWorkflows(memoryDir) {
    return {
      workflows: readWorkflows(memoryDir)
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
        .slice(0, 100)
    };
  }

  return {
    getDashboardWorkflows
  };
}
