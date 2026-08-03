export function buildWorktreeProjection({ tasks = [], workflows = [], relay = [], dispatchRuns = [], inspect = (value) => value } = {}) {
  const entries = new Map();
  const add = (worktree, owner = {}) => {
    if (!worktree?.path && !worktree?.id) return;
    const key = worktree.path || worktree.id;
    const current = entries.get(key) || { ...normalize(worktree), owner: {} };
    current.owner = {
      sessionId: owner.sessionId || current.owner.sessionId || "",
      taskId: owner.taskId || current.owner.taskId || "",
      workflowId: owner.workflowId || current.owner.workflowId || "",
      project: owner.project || current.owner.project || ""
    };
    entries.set(key, current);
  };
  for (const task of tasks) add(task.worktree, { sessionId: task.sessionId, taskId: task.id, project: task.project });
  for (const workflow of workflows) add(workflow.worktree, { sessionId: workflow.sessionId, workflowId: workflow.id, project: workflow.project });
  for (const entry of [...relay, ...dispatchRuns]) add(entry.worktree, { sessionId: entry.sessionId, project: entry.project });

  return [...entries.values()].map((entry) => {
    const inspected = inspect(entry);
    const worktree = normalize({ ...entry, ...inspected });
    const reviewBlockers = [];
    if (worktree.enabled === false) reviewBlockers.push("worktree disabled");
    if (worktree.exists === false) reviewBlockers.push("path missing");
    if (!worktree.head) reviewBlockers.push("no head commit");
    if (!worktree.hasChanges && worktree.head === worktree.base) reviewBlockers.push("no changes");
    return {
      ...worktree,
      reviewReady: reviewBlockers.length === 0,
      reviewBlockers
    };
  });
}

function normalize(value) {
  return {
    id: value.id || value.path || "",
    enabled: value.enabled !== false,
    repoRoot: value.repoRoot || "",
    root: value.root || "",
    path: value.path || "",
    branch: value.branch || "",
    base: value.base || "",
    head: value.head || "",
    reused: Boolean(value.reused),
    exists: value.exists !== false,
    dirty: Boolean(value.dirty),
    hasChanges: Boolean(value.hasChanges || value.dirty || (value.head && value.base && value.head !== value.base)),
    diffStatus: value.diffStatus || "",
    diffStat: value.diffStat || "",
    owner: value.owner || {}
  };
}

