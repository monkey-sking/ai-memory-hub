import path from "node:path";
import fs from "node:fs";

export function createDashboardActionsApi({
  appendIfMissing,
  appendJsonl,
  assertTaskStatus,
  createRadioMessage,
  createTask,
  createTaskNote,
  ensureDir,
  executeDispatch,
  findTaskIndex,
  getDefaultProjectName = () => "",
  getEntityEventsFile,
  getEntityProjectionFile,
  getInstallTargets,
  getLocalInstallTargets,
  getRadioMessagesFile,
  getStatusObject,
  getTaskEventStoreDefinition,
  invalidateToolDetectionCache,
  materializeEntityProjection,
  pullCommand,
  radioPromoteCommand,
  readEntityEvents,
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
        const nextStatus = current.status === "cancelled" ? current.status : body.status;
        const notes = [...(current.notes || [])];
        if (body.note) {
          notes.push(createTaskNote(by, body.note));
        } else if (current.status !== nextStatus) {
          notes.push(createTaskNote(by, `Status changed to ${nextStatus}.`));
        }
        const now = new Date().toISOString();
        return {
          ...current,
          status: nextStatus,
          assignee: current.assignee || by,
          updatedAt: now,
          completedAt: nextStatus === "done" ? now : current.completedAt || "",
          notes
        };
      });
    }, config.sync.lockStaleMs);
    return { ok: true, task, status: getStatusObject() };
  }

  function reviewDashboardTask(config, body = {}) {
    const decision = String(body.decision || "").toLowerCase();
    const reopen = Boolean(body.reopen);
    let task;
    let workflows = [];
    withHubLock(config.memoryDir, "task-review", () => {
      const by = body.by || "dashboard";
      const note = String(body.note || "").trim();
      const now = new Date().toISOString();
      task = updateTask(config.memoryDir, body.id, (current) => {
        // 状态转换逻辑
        let nextStatus = current.status;
        if (current.status === "cancelled") {
          nextStatus = current.status;
        } else if (decision === "approved") {
          nextStatus = "done";
        } else if (decision === "rejected" && reopen) {
          nextStatus = "open"; // 拒绝且选择 reopen
        } else if (decision === "rejected" && current.status === "needs_verification") {
          nextStatus = "needs_verification"; // 拒绝但不 reopen，保持在待验证状态
        } else if (decision === "rejected") {
          nextStatus = "blocked"; // 其他状态被拒绝，设为 blocked
        }

        const noteText = `Review ${decision}${note ? `: ${note}` : ""}${reopen ? " (task reopened)" : ""}`;

        return {
          ...current,
          status: nextStatus,
          assignee: current.assignee || by,
          updatedAt: now,
          completedAt: nextStatus === "done" ? now : current.completedAt || "",
          reviewStatus: decision,
          reviewedAt: now,
          reviewedBy: by,
          reviewNote: note,
          notes: [
            ...(current.notes || []),
            createTaskNote(by, noteText)
          ]
        };
      });

      const allWorkflows = readWorkflows(config.memoryDir);
      let changed = false;
      workflows = allWorkflows.map((workflow) => {
        const linkedTasks = Array.isArray(workflow.linkedTasks) ? workflow.linkedTasks : [];
        if (!linkedTasks.includes(task.id) || task.status === "cancelled") {
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

  function purgeDashboardTask(config, body = {}) {
    let result;
    withHubLock(config.memoryDir, "task-purge", () => {
      const tasks = readTasks(config.memoryDir);
      const taskIndex = findTaskIndex(tasks, body.id);

      if (taskIndex === -1) {
        throw new Error(`Task not found: ${body.id}`);
      }

      const task = tasks[taskIndex];

      // Safety check: only allow purging cancelled tasks
      if (task.status !== "cancelled") {
        throw new Error(`Cannot purge task with status '${task.status}'. Only 'cancelled' tasks can be purged.`);
      }

      // Require confirmation by typing task title
      if (body.confirm !== task.title) {
        throw new Error("Confirmation failed. You must type the exact task title to confirm deletion.");
      }

      const definition = getTaskEventStoreDefinition();
      const eventsFile = getEntityEventsFile(config.memoryDir, definition);
      const projectionFile = getEntityProjectionFile(config.memoryDir, definition);
      const purgeLogFile = path.join(config.memoryDir, "tasks", "purge.log");

      // Create timestamped backups
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const eventsBackup = `${eventsFile}.backup.${timestamp}`;
      const projectionBackup = `${projectionFile}.backup.${timestamp}`;

      try {
        // Backup files
        if (fs.existsSync(eventsFile)) {
          fs.copyFileSync(eventsFile, eventsBackup);
        }
        if (fs.existsSync(projectionFile)) {
          fs.copyFileSync(projectionFile, projectionBackup);
        }

        // Read and filter events
        const allEvents = readEntityEvents(config.memoryDir, definition);
        const filteredEvents = allEvents.filter(event => event.entityId !== body.id);

        // Write filtered events atomically
        const tempEventsFile = `${eventsFile}.tmp.${Date.now()}`;
        ensureDir(path.dirname(tempEventsFile));
        fs.writeFileSync(
          tempEventsFile,
          filteredEvents.map(e => JSON.stringify(e)).join("\n") + (filteredEvents.length ? "\n" : ""),
          "utf8"
        );
        fs.renameSync(tempEventsFile, eventsFile);

        // Rematerialize projection
        materializeEntityProjection(config.memoryDir, definition);

        // Log the purge operation
        const logEntry = {
          ts: new Date().toISOString(),
          action: "purge",
          taskId: body.id,
          taskTitle: task.title,
          taskStatus: task.status,
          eventsBackup: path.basename(eventsBackup),
          projectionBackup: path.basename(projectionBackup),
          eventCountBefore: allEvents.length,
          eventCountAfter: filteredEvents.length,
          removedEvents: allEvents.length - filteredEvents.length,
          by: body.by || "dashboard"
        };
        appendJsonl(purgeLogFile, logEntry);

        result = {
          ok: true,
          success: true,
          taskId: body.id,
          taskTitle: task.title,
          backups: {
            events: eventsBackup,
            projection: projectionBackup
          },
          purgeLog: purgeLogFile
        };
      } catch (error) {
        // Restore from backups on error
        if (fs.existsSync(eventsBackup)) {
          fs.copyFileSync(eventsBackup, eventsFile);
        }
        if (fs.existsSync(projectionBackup)) {
          fs.copyFileSync(projectionBackup, projectionFile);
        }
        throw new Error(`Purge failed and backups restored: ${error.message}`);
      }
    }, config.sync.lockStaleMs);
    return result;
  }

  return {
    addDashboardTask,
    applyDashboardInstall,
    claimDashboardTask,
    dispatchDashboardMarvis,
    getDashboardInstallPreview,
    promoteDashboardRadio,
    pullDashboardMemory,
    purgeDashboardTask,
    recordDashboardMemory,
    reviewDashboardTask,
    runDashboardDispatch,
    sendDashboardRadio,
    setDashboardTaskStatus,
    syncDashboardMemory
  };
}
