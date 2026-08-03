const TERMINAL_STATES = new Set(["done", "failed"]);

export function buildAgentSessionProjection({
  sessions = [],
  tasks = [],
  workflows = [],
  relay = [],
  dispatchRuns = [],
  now = new Date().toISOString(),
  staleAfterMs = 30 * 60 * 1000
} = {}) {
  const taskById = new Map(tasks.filter(Boolean).map((task) => [task.id, task]));
  const workflowByTaskId = new Map();
  for (const workflow of workflows) {
    for (const taskId of workflow.linkedTasks || []) workflowByTaskId.set(taskId, workflow);
  }
  const relayByThread = new Map(relay.filter((entry) => entry?.threadKey).map((entry) => [entry.threadKey, entry]));
  const runByThread = new Map(dispatchRuns.filter((entry) => entry?.threadKey).map((entry) => [entry.threadKey, entry]));
  const rows = new Map();

  const ensure = (key, seed = {}) => {
    if (!rows.has(key)) rows.set(key, { id: key, ...seed });
    return rows.get(key);
  };

  for (const session of sessions) {
    if (!session?.id) continue;
    ensure(`session:${session.id}`, { sessionId: session.id, agent: session.createdBy || session.participants?.[0] || "unknown", project: session.project || "", title: session.title || "" });
  }
  for (const task of tasks) {
    if (!task?.sessionId) continue;
    ensure(`session:${task.sessionId}`, { sessionId: task.sessionId, agent: task.assignee || task.createdBy || "unknown", project: task.project || "" });
  }
  for (const entry of [...relay, ...dispatchRuns]) {
    const sessionId = entry?.sessionId;
    if (!sessionId) continue;
    ensure(`session:${sessionId}`, { sessionId, agent: entry.tool || "unknown", project: entry.project || "" });
  }

  for (const row of rows.values()) {
    const session = sessions.find((item) => item.id === row.sessionId) || {};
    const relatedTask = tasks.find((task) => task.sessionId === row.sessionId)
      || tasks.find((task) => task.threadKey && session.id && task.threadKey.includes(session.id));
    const relatedWorkflow = relatedTask ? workflowByTaskId.get(relatedTask.id) : workflows.find((workflow) => workflow.sessionId === row.sessionId);
    const threadKey = relatedTask?.threadKey || relatedWorkflow?.threadKey || findThreadForSession(row.sessionId, relay, dispatchRuns);
    const latestRelay = threadKey ? relayByThread.get(threadKey) : relay.find((entry) => entry.sessionId === row.sessionId);
    const latestRun = threadKey ? runByThread.get(threadKey) : dispatchRuns.find((entry) => entry.sessionId === row.sessionId);
    const lastActivity = latestRelay?.progressAt || latestRelay?.ts || latestRun?.finishedAt || latestRun?.startedAt || session.lastActive || session.updatedAt || session.createdAt || "";
    const rawState = latestRelay?.state || latestRun?.status || "";
    const state = normalizeAgentState({ rawState, task: relatedTask, workflow: relatedWorkflow, lastActivity, now, staleAfterMs });
    const worktree = latestRelay?.worktree || latestRun?.worktree || relatedTask?.worktree || relatedWorkflow?.worktree || null;
    row.agent = latestRelay?.tool || latestRun?.tool || row.agent || session.createdBy || "unknown";
    row.project = latestRelay?.project || latestRun?.project || relatedTask?.project || relatedWorkflow?.project || row.project || "";
    row.title = relatedTask?.title || relatedWorkflow?.title || session.title || row.title || "";
    row.threadKey = threadKey || "";
    row.state = state;
    row.lastActivity = lastActivity;
    row.attempt = Number(latestRelay?.attempt || latestRun?.attempt || relatedTask?.attempt || relatedWorkflow?.attempt || 0);
    row.error = latestRelay?.lastError || latestRun?.error || relatedTask?.lastError || relatedWorkflow?.lastError || "";
    row.progress = {
      percent: latestRelay?.progressPercent ?? relatedTask?.progressPercent ?? relatedWorkflow?.progressPercent ?? null,
      status: latestRelay?.progressStatus || relatedTask?.progressStatus || relatedWorkflow?.progressStatus || ""
    };
    row.recentOutput = String(latestRun?.stdout || latestRun?.output || latestRelay?.progressStatus || "").trim().slice(-1000);
    row.task = relatedTask ? pickTask(relatedTask) : null;
    row.workflow = relatedWorkflow ? pickWorkflow(relatedWorkflow) : null;
    row.worktree = worktree;
    row.updatedAt = session.updatedAt || lastActivity;
  }

  return [...rows.values()].sort((a, b) => String(b.lastActivity || "").localeCompare(String(a.lastActivity || "")));
}

export function buildAgentExecutionTimeline({ tasks = [], workflows = [], relay = [], dispatchRuns = [] } = {}) {
  const items = [];
  for (const entry of relay) {
    items.push({
      id: entry.id || `relay:${entry.threadKey}:${entry.ts}`,
      ts: entry.progressAt || entry.ts || "",
      kind: "relay",
      state: entry.state || "",
      agent: entry.tool || "unknown",
      text: entry.progressStatus || entry.lastError || `Relay ${entry.state || "updated"}`,
      sessionId: entry.sessionId || "",
      taskId: entry.sourceKind === "task" ? entry.sourceId || "" : "",
      workflowId: entry.sourceKind === "workflow" ? entry.sourceId || "" : ""
    });
  }
  for (const run of dispatchRuns) {
    items.push({
      id: run.id || `run:${run.threadKey}:${run.startedAt}`,
      ts: run.finishedAt || run.startedAt || "",
      kind: "dispatch",
      state: run.status || "",
      agent: run.tool || "unknown",
      text: String(run.stdout || run.output || run.error || "").trim().slice(-500),
      sessionId: run.sessionId || "",
      taskId: run.sourceKind === "task" ? run.sourceId || "" : "",
      workflowId: run.sourceKind === "workflow" ? run.sourceId || "" : ""
    });
  }
  for (const task of tasks) {
    if (task.updatedAt) items.push({ id: `task:${task.id}:${task.updatedAt}`, ts: task.updatedAt, kind: "task", state: task.status || "", agent: task.assignee || task.createdBy || "unknown", text: task.title || "", sessionId: task.sessionId || "", taskId: task.id, workflowId: "" });
  }
  for (const workflow of workflows) {
    if (workflow.updatedAt) items.push({ id: `workflow:${workflow.id}:${workflow.updatedAt}`, ts: workflow.updatedAt, kind: "workflow", state: workflow.status || "", agent: workflow.executor?.[0] || workflow.createdBy || "unknown", text: workflow.title || "", sessionId: workflow.sessionId || "", taskId: "", workflowId: workflow.id });
  }
  return items.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || ""))).slice(0, 100);
}

function normalizeAgentState({ rawState, task, workflow, lastActivity, now, staleAfterMs }) {
  if (task?.status === "blocked" || workflow?.status === "blocked") return "blocked";
  if (task?.status === "needs_verification" || workflow?.status === "review") return "waiting_review";
  if (["failed", "abandoned", "timed_out"].includes(rawState) || task?.deliveryState === "failed" || workflow?.deliveryState === "failed") return "failed";
  if (rawState === "completed" || task?.status === "done" || workflow?.status === "done") return "done";
  const activityMs = Date.parse(lastActivity || "");
  if (Number.isFinite(activityMs) && Date.parse(now) - activityMs > staleAfterMs) return "stale";
  if (["pending", "dispatched", "acked", "progress", "retrying"].includes(rawState) || ["claimed", "in_progress"].includes(task?.status) || ["in_progress", "planned", "open"].includes(workflow?.status)) return "working";
  return "idle";
}

function findThreadForSession(sessionId, relay, runs) {
  return [...relay, ...runs].find((entry) => entry.sessionId === sessionId)?.threadKey || "";
}

function pickTask(task) {
  return { id: task.id, title: task.title || "", status: task.status || "", project: task.project || "" };
}

function pickWorkflow(workflow) {
  return { id: workflow.id, title: workflow.title || "", status: workflow.status || "", project: workflow.project || "" };
}
