export function buildUnreadItems({ actor = "all", messages = [], sessions = [], readReceipts = [] } = {}) {
  const read = new Set(readReceipts
    .filter((receipt) => receipt.action === "read" && (!receipt.actor || receipt.actor === actor))
    .map((receipt) => receipt.itemId));
  const items = [];
  for (const message of messages) {
    if (!message?.id || read.has(`radio:${message.id}`)) continue;
    const addressed = actor === "all" || !message.to || message.to === "all" || message.to === actor;
    if (!addressed) continue;
    items.push({ id: `radio:${message.id}`, kind: "radio", ts: message.ts || message.createdAt || "", title: message.type || "message", text: message.text || "", targetId: message.id });
  }
  for (const session of sessions) {
    if (!session?.id || !["done", "failed", "blocked", "stale", "waiting_review"].includes(session.state)) continue;
    const id = `agent:${session.id}:${session.state}`;
    if (read.has(id)) continue;
    items.push({ id, kind: "agent", ts: session.lastActivity || "", title: session.state, text: session.title || session.error || "", targetId: session.id, state: session.state });
  }
  return items.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
}

export function createFollowUpPayload({ by = "dashboard", to = "all", text, taskId = "", workflowId = "", sessionId = "", project = "", worktree = null } = {}) {
  const thread = taskId || workflowId || sessionId || "";
  return {
    from: by,
    to,
    type: "follow_up",
    text: String(text || "").trim(),
    thread,
    project,
    metadata: { ...(taskId ? { taskId } : {}), ...(workflowId ? { workflowId } : {}), ...(sessionId ? { sessionId } : {}), ...(worktree ? { worktree } : {}) }
  };
}

export function buildReviewQueue({ tasks = [], workflows = [] } = {}) {
  const workflowsByTask = new Map();
  for (const workflow of workflows) for (const taskId of workflow.linkedTasks || []) workflowsByTask.set(taskId, workflow);
  const queue = [];
  for (const task of tasks) {
    if (task.reviewStatus !== "requested" && task.status !== "needs_verification") continue;
    const workflow = workflowsByTask.get(task.id);
    queue.push({
      id: `review:${task.id}`,
      taskId: task.id,
      workflowId: workflow?.id || "",
      sessionId: task.sessionId || workflow?.sessionId || "",
      worktree: task.worktree || workflow?.worktree || null,
      project: task.project || workflow?.project || "",
      title: task.title || workflow?.title || "",
      requestedAt: task.reviewedAt || task.updatedAt || "",
      status: task.reviewStatus || "requested"
    });
  }
  for (const workflow of workflows) {
    if (workflow.status !== "review" || (workflow.linkedTasks || []).some((id) => queue.some((item) => item.taskId === id))) continue;
    queue.push({ id: `review:${workflow.id}`, taskId: "", workflowId: workflow.id, sessionId: workflow.sessionId || "", worktree: workflow.worktree || null, project: workflow.project || "", title: workflow.title || "", requestedAt: workflow.updatedAt || "", status: "requested" });
  }
  return queue.sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));
}

export function createDashboardCollaborationApi({ appendJsonl, createRadioMessage, getRadioMessagesFile, readRadioMessages, readTasks, readWorkflows, readUnreadReceipts, appendUnreadReceipt, readAgentSessions, updateTask, updateWorkflow, createTaskNote, withHubLock }) {
  function getDashboardCollaboration(memoryDir, actor = "all") {
    const messages = readRadioMessages(memoryDir);
    const sessions = readAgentSessions(memoryDir);
    const tasks = readTasks(memoryDir);
    const workflows = readWorkflows(memoryDir);
    const unread = buildUnreadItems({ actor, messages, sessions, readReceipts: readUnreadReceipts(memoryDir) });
    return { unread, unreadCount: unread.length, reviews: buildReviewQueue({ tasks, workflows }) };
  }

  function sendFollowUp(memoryDir, body = {}) {
    if (!body.text) throw new Error("follow-up text is required");
    const session = body.sessionId ? readAgentSessions(memoryDir).find((item) => item.sessionId === body.sessionId || item.id === body.sessionId) : null;
    const target = body.to && body.to !== "all" ? body.to : session?.agent ? `session:${session.agent}:${body.sessionId}` : body.to;
    const payload = createFollowUpPayload({ ...body, to: target });
    const message = createRadioMessage(payload);
    appendJsonl(getRadioMessagesFile(memoryDir), { ...message, metadata: payload.metadata });
    if (body.taskId) updateTask(memoryDir, body.taskId, (current) => ({ ...current, updatedAt: new Date().toISOString(), notes: [...(current.notes || []), createTaskNote(body.by || body.from || "dashboard", `Follow-up sent to ${body.to || "all"}.`)] }));
    return { message, collaboration: getDashboardCollaboration(memoryDir, body.by || body.from || "all") };
  }

  function requestReview(memoryDir, body = {}) {
    const now = new Date().toISOString();
    const message = createRadioMessage({ from: body.by || body.from || "dashboard", to: body.to || body.reviewer || "all", type: "review_request", text: body.text || "Review requested.", thread: body.taskId || body.workflowId || body.sessionId || "", project: body.project || "", replyTo: body.taskId || body.workflowId || "" });
    appendJsonl(getRadioMessagesFile(memoryDir), { ...message, metadata: { taskId: body.taskId || "", workflowId: body.workflowId || "", sessionId: body.sessionId || "", worktree: body.worktree || null } });
    let task = null;
    let workflow = null;
    if (body.taskId) task = updateTask(memoryDir, body.taskId, (current) => ({ ...current, reviewStatus: "requested", reviewedAt: now, reviewedBy: body.by || body.from || "dashboard", reviewNote: body.text || "Review requested.", status: ["done", "cancelled"].includes(current.status) ? current.status : "needs_verification", updatedAt: now, notes: [...(current.notes || []), createTaskNote(body.by || body.from || "dashboard", "Review requested.")] }));
    if (body.workflowId) workflow = updateWorkflow(memoryDir, body.workflowId, (current) => ({ ...current, status: ["done", "cancelled"].includes(current.status) ? current.status : "review", updatedAt: now, notes: [...(current.notes || []), createTaskNote(body.by || body.from || "dashboard", "Review requested.")] }));
    return { message, task, workflow };
  }

  function markRead(memoryDir, body = {}) {
    if (!body.itemId) throw new Error("itemId is required");
    appendUnreadReceipt(memoryDir, { itemId: body.itemId, actor: body.actor || body.by || "dashboard", action: "read" });
    return getDashboardCollaboration(memoryDir, body.actor || body.by || "all");
  }

  return { getDashboardCollaboration, sendFollowUp, requestReview, markRead };
}

