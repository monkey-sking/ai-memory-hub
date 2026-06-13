export function createDashboardProjectsApi({
  createProject,
  filterProjects,
  findProjectIndex,
  isPlainObject,
  isHiddenProjectId,
  normalizeProjectStatus,
  parseProjectListOption,
  projectStatuses,
  projectVisibleStatuses,
  readProjects,
  readRadioMessages,
  readTasks,
  readWorkflows,
  updateProject,
  writeProjects,
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

  function createDashboardProject(memoryDir, body) {
    const projects = readProjects(memoryDir);
    if (findProjectIndex(projects, body.id) !== -1) {
      throw new Error(`Project already exists: ${body.id}`);
    }
    const project = createProject({
      id: body.id,
      name: body.name,
      displayName: body.displayName || body.display_name || body.name,
      status: body.status || "active",
      type: body.type || "",
      description: body.description || "",
      metadata: isPlainObject(body.metadata) ? body.metadata : {},
      aliases: Array.isArray(body.aliases) ? body.aliases : parseProjectListOption(body.aliases),
      resources: isPlainObject(body.resources) ? body.resources : {}
    });
    projects.push(project);
    writeProjects(memoryDir, projects);
    return project;
  }

  function updateDashboardProject(memoryDir, id, body) {
    if (!isPlainObject(body)) {
      throw new Error("project update body must be an object");
    }
    const patch = {};
    for (const key of ["name", "displayName", "type", "description"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        patch[key] = String(body[key] || "").trim();
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      patch.status = normalizeProjectStatus(body.status);
    }
    if (Object.prototype.hasOwnProperty.call(body, "metadata")) {
      if (!isPlainObject(body.metadata)) {
        throw new Error("metadata must be an object");
      }
      patch.metadata = body.metadata;
    }
    if (Object.prototype.hasOwnProperty.call(body, "aliases")) {
      patch.aliases = Array.isArray(body.aliases) ? uniqueStringList(body.aliases) : parseProjectListOption(body.aliases);
    }
    if (Object.prototype.hasOwnProperty.call(body, "resources")) {
      if (!isPlainObject(body.resources)) {
        throw new Error("resources must be an object");
      }
      patch.resources = body.resources;
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("project update requires at least one editable field");
    }
    return updateProject(memoryDir, id, (current) => ({
      ...current,
      ...patch,
      metadata: patch.metadata ? { ...(current.metadata || {}), ...patch.metadata } : current.metadata,
      resources: patch.resources ? { ...(current.resources || {}), ...patch.resources } : current.resources
    }));
  }

  function archiveDashboardProject(memoryDir, id, body = {}) {
    const now = new Date().toISOString();
    return updateProject(memoryDir, id, (current) => ({
      ...current,
      status: "archived",
      archivedAt: now,
      archivedBy: body.by || body.from || "dashboard"
    }));
  }

  return {
    archiveDashboardProject,
    createDashboardProject,
    updateDashboardProject,
    getDashboardProjects
  };
}
