export function buildExecutionAdapters({ task = {}, workflow = {}, worktree = {}, remote = {} } = {}) {
  const links = task.githubLinks || workflow.githubLinks || {};
  return {
    github: {
      issue: links.issue || links.issueUrl || "",
      pullRequest: links.pullRequest || links.pr || links.pullRequestUrl || "",
      checks: links.checks || links.checksUrl || "",
      branch: links.branch || worktree.branch || "",
      mergeReady: Boolean(links.pullRequest || links.pr || links.pullRequestUrl) && !worktree.dirty
    },
    ssh: {
      host: String(remote.host || ""), user: String(remote.user || ""), path: String(remote.path || worktree.path || ""), reconnectState: String(remote.reconnectState || "unknown"), forwards: Array.isArray(remote.forwards) ? remote.forwards.map((item) => ({ local: Number(item.local || 0), remote: Number(item.remote || 0) })).filter((item) => item.local > 0 && item.remote > 0) : []
    },
    notifications: []
  };
}

