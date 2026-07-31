export function createDashboardWorkflowsApi({
  appendJsonl,
  assertWorkflowStatus,
  createRadioMessage,
  createTaskNote,
  createWorkflow,
  deleteEntityRecord,
  findWorkflowIndex,
  getDefaultProjectName = () => "",
  getRadioMessagesFile,
  getWorkflowEventStoreDefinition,
  normalizePriority,
  normalizeReviewDimensions = (value) => Array.isArray(value) ? value : [],
  normalizeWorkflowRole,
  notifyWorkflowRoles,
  readWorkflows,
  readWorkflowNodes,
  spawnWorkflowTasks,
  updateWorkflow,
  writeWorkflows
}) {
  function getDashboardWorkflows(memoryDir) {
    return {
      workflows: readWorkflows(memoryDir)
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
        .slice(0, 100)
    };
  }

  function createDashboardWorkflow(memoryDir, body) {
    const workflows = readWorkflows(memoryDir);
    let workflow = createWorkflow({
      title: body.title,
      createdBy: body.from || body.createdBy || body.by || "dashboard",
      project: body.project || getDefaultProjectName(),
      priority: body.priority || "normal",
      planner: body.planner || "",
      executor: body.executor || "",
      reviewer: body.reviewer || "",
      observer: body.observer || "",
      plan: body.plan || "",
      acceptance: body.acceptance || "",
      qualityGate: body.qualityGate
    });
    const status = String(body.status || "").trim();
    if (status) {
      assertWorkflowStatus(status);
      workflow = {
        ...workflow,
        status,
        completedAt: status === "done" ? new Date().toISOString() : ""
      };
    }
    workflow = {
      ...workflow,
      risks: normalizeDashboardList(body.risks)
    };
    workflows.push(workflow);
    writeWorkflows(memoryDir, workflows);
    if (body.spawnTasks) {
      spawnWorkflowTasks(memoryDir, workflow);
    }
    if (body.notify) {
      notifyWorkflowRoles(memoryDir, workflow);
    }
    return readWorkflows(memoryDir).find((item) => item.id === workflow.id) || workflow;
  }

  function updateDashboardWorkflow(memoryDir, id, body) {
    const by = body.by || body.from || "dashboard";
    const patch = {};
    const changedFields = [];
    for (const key of ["title", "project", "plan", "acceptance"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        patch[key] = String(body[key] || "").trim();
        changedFields.push(key);
      }
    }
    for (const key of ["planner", "executor", "reviewer", "observer"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        patch[key] = normalizeWorkflowRole(body[key]);
        changedFields.push(key);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "priority")) {
      patch.priority = normalizePriority(body.priority);
      changedFields.push("priority");
    }
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = String(body.status || "").trim();
      assertWorkflowStatus(status);
      patch.status = status;
      changedFields.push("status");
    }
    if (Object.prototype.hasOwnProperty.call(body, "risks")) {
      patch.risks = normalizeDashboardList(body.risks);
      changedFields.push("risks");
    }
    if (changedFields.length === 0) {
      throw new Error("workflow update requires at least one editable field");
    }
    return updateWorkflow(memoryDir, id, (current) => {
      const now = new Date().toISOString();
      const notes = [...(current.notes || [])];
      notes.push(createTaskNote(by, `Updated workflow fields: ${changedFields.join(", ")}.`));
      return {
        ...current,
        ...patch,
        updatedAt: now,
        completedAt: patch.status ? (patch.status === "done" ? now : "") : current.completedAt || "",
        notes
      };
    });
  }

  function deleteDashboardWorkflow(memoryDir, id, body = {}) {
    const workflows = readWorkflows(memoryDir);
    const index = findWorkflowIndex(workflows, id);
    if (index === -1) {
      throw new Error(`Workflow not found: ${id}`);
    }
    const deleted = workflows[index];
    const by = body.by || body.from || "dashboard";
    const deletedWorkflow = {
      ...deleted,
      deletedAt: new Date().toISOString(),
      deletedBy: by
    };
    deleteEntityRecord(memoryDir, getWorkflowEventStoreDefinition(), deleted.id, {
      reason: "workflow:delete",
      source: by
    });
    return deletedWorkflow;
  }

  function setDashboardWorkflowStatus(memoryDir, id, body) {
    const status = String(body.status || "").trim();
    assertWorkflowStatus(status);
    const by = body.by || body.from || "dashboard";
    const note = String(body.note || "").trim();
    return updateWorkflow(memoryDir, id, (current) => {
      const now = new Date().toISOString();
      const notes = [...(current.notes || [])];
      notes.push(createTaskNote(by, note || `Status changed to ${status}.`));
      return {
        ...current,
        status,
        updatedAt: now,
        completedAt: status === "done" ? now : "",
        notes
      };
    });
  }

  function appendDashboardWorkflowEntry(memoryDir, id, action, body) {
    const by = body.by || body.from || "dashboard";
    const role = String(body.role || "").trim();
    const text = String(body.text || "").trim();
    const now = new Date().toISOString();
    if (action === "note") {
      return updateWorkflow(memoryDir, id, (current) => ({
        ...current,
        updatedAt: now,
        notes: [
          ...(current.notes || []),
          createTaskNote(by, text)
        ]
      }));
    }
    const field = action === "review" ? "reviews" : "results";
    const dimensions = normalizeReviewDimensions(body.dimensions);
    return updateWorkflow(memoryDir, id, (current) => ({
      ...current,
      status: action === "review" && !["done", "cancelled"].includes(current.status) ? "review" : current.status,
      updatedAt: now,
      [field]: [
        ...(current[field] || []),
        {
          ts: now,
          by,
          role,
          text,
          ...(field === "reviews" && dimensions.length > 0 ? { dimensions } : {})
        }
      ]
    }));
  }

  function signalDashboardWorkflow(memoryDir, id, body) {
    const by = body.by || body.from || "dashboard";
    const workflow = readWorkflows(memoryDir).find((item) => item.id === id || item.id.startsWith(id));
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }
    const message = createRadioMessage({
      from: by,
      to: body.to,
      type: body.type || "handoff",
      text: `[workflow:${workflow.id}] ${body.text}`,
      thread: workflow.id,
      project: workflow.project
    });
    appendJsonl(getRadioMessagesFile(memoryDir), message);
    const updated = updateWorkflow(memoryDir, workflow.id, (current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      linkedRadio: [
        ...(current.linkedRadio || []),
        message.id
      ],
      notes: [
        ...(current.notes || []),
        createTaskNote(by, `Signal sent to ${body.to}.`)
      ]
    }));
    return { workflow: updated, message };
  }

  function normalizeDashboardList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    return String(value || "")
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getDashboardWorkflowNodes(memoryDir, workflowId) {
    const workflows = readWorkflows(memoryDir);
    const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    const nodes = readWorkflowNodes(memoryDir, workflow.id);
    return { nodes };
  }

  return {
    appendDashboardWorkflowEntry,
    createDashboardWorkflow,
    deleteDashboardWorkflow,
    getDashboardWorkflows,
    getDashboardWorkflowNodes,
    setDashboardWorkflowStatus,
    signalDashboardWorkflow,
    updateDashboardWorkflow
  };
}
