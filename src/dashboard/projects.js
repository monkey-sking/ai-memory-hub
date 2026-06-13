export function createDashboardProjectsApi({
  filterProjects,
  isHiddenProjectId,
  projectStatuses,
  projectVisibleStatuses,
  readProjects,
  readRadioMessages,
  readTasks,
  readWorkflows,
  uniqueStringList
}) {
  function getDashboardProjects(memoryDir, { status = "all", includeHidden = false } = {}) {
    const projects = filterProjects(readProjects(memoryDir), { status, includeHidden });
    const visibleProjects = filterProjects(projects, { status: "visible" });
    const registryIds = new Set(projects.map((project) => project.id));
    const registryAliases = new Set(projects.flatMap((project) => [project.name, project.displayName, ...(project.aliases || [])].map((value) => String(value || "").toLowerCase())));
    const referenced = [
      ...readTasks(memoryDir).map((item) => item.project),
      ...readRadioMessages(memoryDir).map((item) => item.project),
      ...readWorkflows(memoryDir).map((item) => item.project)
    ].map((item) => String(item || "").trim()).filter(Boolean);
    const unregisteredProjects = uniqueStringList(referenced)
      .filter((project) => !registryIds.has(project) && !registryAliases.has(project.toLowerCase()) && !isHiddenProjectId(project))
      .sort((a, b) => a.localeCompare(b, "zh-Hans"));
    return {
      projects,
      visibleProjects,
      unregisteredProjects,
      statuses: projectStatuses,
      visibleStatuses: projectVisibleStatuses
    };
  }

  return {
    getDashboardProjects
  };
}
