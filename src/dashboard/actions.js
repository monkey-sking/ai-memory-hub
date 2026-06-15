import path from "node:path";

export function createDashboardActionsApi({
  appendIfMissing,
  appendJsonl,
  assertTaskStatus,
  createRadioMessage,
  createTask,
  createTaskNote,
  ensureDir,
  executeDispatch,
  getDefaultProjectName = () => "",
  getInstallTargets,
  getLocalInstallTargets,
  getRadioMessagesFile,
  getStatusObject,
  invalidateToolDetectionCache,
  pullCommand,
  radioPromoteCommand,
  readTasks,
  readWorkflows,
  recordCommand,
  renderInstallSnippet,
  syncCommand,
  updateTask,
  withHubLock,
  writeTasks,
  writeWorkflows
}) {
  function recordDashboardMemory(body = {}) {
    recordCommand([
      body.text,
      "--source",
      body.source || "dashboard",
      "--kind",
      body.kind || "note"
    ]);
    return { ok: true, status: getStatusObject() };
  }

  function sendDashboardRadio(config, body = {}) {
    const message = createRadioMessage({
      from: body.from || "dashboard",
      to: body.to || "all",
      type: body.type || "note",
      text: body.text,
      thread: body.thread || "",
      replyTo: body.replyTo || "",
      project: body.project || getDefaultProjectName()
    });
    appendJsonl(getRadioMessagesFile(config.memoryDir), message);
    return { ok: true, message, status: getStatusObject() };
  }

  function addDashboardTask(config, body = {}) {
    let task;
    withHubLock(config.memoryDir, "task-add", () => {
      const tasks = readTasks(config.memoryDir);
      task = createTask({
        title: body.title,
        description: body.description || "",
        handoff: body.handoff || "",
        createdBy: body.from || "dashboard",
        project: body.project || getDefaultProjectName(),
        priority: body.priority || "normal"
      });
      tasks.push(task);
      writeTasks(config.memoryDir, tasks);
    }, config.sync.lockStaleMs);
    return { ok: true, task, status: getStatusObject() };
  }

  function claimDashboardTask(config, body = {}) {
    let task;
    withHubLock(config.memoryDir, "task-claim", () => {
      const by = body.by || "dashboard";
      task = updateTask(config.memoryDir, body.id, (current) => ({
        ...current,
        status: current.status === "open" ? "claimed" : current.status,
        assignee: by,
        updatedAt: new Date().toISOString(),
        notes: [
          ...(current.notes || []),
          createTaskNote(by, `Claimed by ${by}.`)
        ]
      }));
    }, config.sync.lockStaleMs);
    return { ok: true, task, status: getStatusObject() };
  }

  function setDashboardTaskStatus(config, body = {}) {
    assertTaskStatus(body.status);
    let task;
    withHubLock(config.memoryDir, "task-status", () => {
      const by = body.by || "dashboard";
      task = updateTask(config.memoryDir, body.id, (current) => {
        const notes = [...(current.notes || [])];
        if (body.note) {
          notes.push(createTaskNote(by, body.note));
        } else if (current.status !== body.status) {
          notes.push(createTaskNote(by, `Status changed to ${body.status}.`));
        }
        const now = new Date().toISOString();
        return {
          ...current,
          status: body.status,
          assignee: current.assignee || by,
          updatedAt: now,
          completedAt: body.status === "done" ? now : current.completedAt || "",
          notes
        };
      });
    }, config.sync.lockStaleMs);
    return { ok: true, task, status: getStatusObject() };
  }

  function reviewDashboardTask(config, body = {}) {
    const decision = String(body.decision || "").toLowerCase();
    let task;
    let workflows = [];
    withHubLock(config.memoryDir, "task-review", () => {
      const by = body.by || "dashboard";
      const note = String(body.note || "").trim();
      const now = new Date().toISOString();
      task = updateTask(config.memoryDir, body.id, (current) => ({
        ...current,
        status: decision === "approved" ? "done" : "blocked",
        assignee: current.assignee || by,
        updatedAt: now,
        completedAt: decision === "approved" ? now : "",
        reviewStatus: decision,
        reviewedAt: now,
        reviewedBy: by,
        reviewNote: note,
        notes: [
          ...(current.notes || []),
          createTaskNote(by, `Review ${decision}: ${note || "No note provided."}`)
        ]
      }));

      const allWorkflows = readWorkflows(config.memoryDir);
      let changed = false;
      workflows = allWorkflows.map((workflow) => {
        const linkedTasks = Array.isArray(workflow.linkedTasks) ? workflow.linkedTasks : [];
        if (!linkedTasks.includes(task.id)) {
          return workflow;
        }
        changed = true;
        const text = `Task ${task.id} review ${decision}: ${note || task.title}`;
        return {
          ...workflow,
          status: workflow.status === "done" || workflow.status === "cancelled" ? workflow.status : "review",
          updatedAt: now,
          reviews: [
            ...(workflow.reviews || []),
            { ts: now, by, role: "reviewer", text }
          ],
          notes: [
            ...(workflow.notes || []),
            createTaskNote(by, text)
          ]
        };
      });
      if (changed) {
        writeWorkflows(config.memoryDir, workflows);
      }
      workflows = workflows.filter((workflow) => (workflow.linkedTasks || []).includes(task.id));
    }, config.sync.lockStaleMs);
    return { ok: true, task, workflows, status: getStatusObject() };
  }

  function runDashboardDispatch(config, body = {}) {
    const results = executeDispatch(config.memoryDir, {
      run: true,
      force: Boolean(body.force),
      to: body.to || "",
      project: body.project || "",
      limit: Number(body.limit || 10),
      isolateWorktree: Boolean(body.isolateWorktree),
      worktreeRoot: body.worktreeRoot || ""
    });
    return { ok: true, results, status: getStatusObject() };
  }

  function dispatchDashboardMarvis(config, body = {}) {
    const from = body.from || "unknown";
    const project = body.project || getDefaultProjectName();
    const dispatchType = body.type || "handoff";
    const message = createRadioMessage({
      from,
      to: "marvis",
      type: dispatchType,
      text: body.text,
      thread: body.thread || "",
      project
    });
    appendJsonl(getRadioMessagesFile(config.memoryDir), message);

    let task;
    withHubLock(config.memoryDir, "task-add", () => {
      const tasks = readTasks(config.memoryDir);
      task = createTask({
        title: body.text.slice(0, 120),
        description: body.text,
        handoff: `Dispatched by ${from}${body.thread ? ` (thread: ${body.thread})` : ""}`,
        createdBy: from,
        project,
        priority: body.priority || "normal"
      });
      tasks.push(task);
      writeTasks(config.memoryDir, tasks);
    }, config.sync.lockStaleMs);

    return {
      ok: true,
      message,
      task,
      hint: "Task sent to Marvis. It will be processed when the user asks Marvis to check AI Memory Hub."
    };
  }

  function promoteDashboardRadio(body = {}) {
    radioPromoteCommand(["--id", body.id]);
    return { ok: true, status: getStatusObject() };
  }

  function syncDashboardMemory() {
    syncCommand([]);
    return { ok: true, status: getStatusObject() };
  }

  function pullDashboardMemory() {
    pullCommand([]);
    return { ok: true, status: getStatusObject() };
  }

  function getDashboardInstallPreview(config, { toolName, isLocal = false } = {}) {
    const targets = (isLocal
      ? getLocalInstallTargets(process.cwd(), config.memoryDir)
      : getInstallTargets(config.memoryDir)
    ).filter((target) => target.tool === toolName);
    if (targets.length === 0) {
      throw new Error(`No preview target for tool ${toolName}`);
    }
    const target = targets[0];
    const snippet = renderInstallSnippet(target, config.memoryDir);
    return {
      tool: target.tool,
      file: target.file,
      snippet
    };
  }

  function applyDashboardInstall(config, body = {}) {
    const toolName = body.tool;
    const isLocal = body.scope === "local";
    const targets = (isLocal
      ? getLocalInstallTargets(process.cwd(), config.memoryDir)
      : getInstallTargets(config.memoryDir)
    ).filter((target) => target.tool === toolName);
    if (targets.length === 0) {
      throw new Error(`No install targets for tool: ${toolName}`);
    }

    const target = targets[0];
    const snippet = renderInstallSnippet(target, config.memoryDir);
    ensureDir(path.dirname(target.file));
    appendIfMissing(target.file, snippet, "Shared AI Memory");
    invalidateToolDetectionCache(config.memoryDir);
    return { success: true, file: target.file };
  }

  return {
    addDashboardTask,
    applyDashboardInstall,
    claimDashboardTask,
    dispatchDashboardMarvis,
    getDashboardInstallPreview,
    promoteDashboardRadio,
    pullDashboardMemory,
    recordDashboardMemory,
    reviewDashboardTask,
    runDashboardDispatch,
    sendDashboardRadio,
    setDashboardTaskStatus,
    syncDashboardMemory
  };
}
