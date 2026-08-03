export function syncGithubLifecycle(tasks = [], pullRequests = []) {
  const byUrl = new Map(pullRequests.map((item) => [String(item.url || item.html_url || item.pullRequest || "").replace(/\/$/, ""), item]));
  const changes = [];
  const unchanged = [];
  for (const task of tasks) {
    const url = String(task.githubLinks?.pullRequest || task.githubLinks?.pr || "").replace(/\/$/, "");
    const pull = byUrl.get(url);
    if (!pull || !pull.merged || task.status === "done" || task.status === "cancelled") { unchanged.push(task); continue; }
    changes.push({ id: task.id, patch: { status: "done", completedAt: pull.mergedAt || new Date().toISOString(), githubSync: { merged: true, mergeCommit: pull.mergeCommit || pull.merge_commit_sha || "", syncedAt: new Date().toISOString() } }, pullRequest: pull });
  }
  return { changes, unchanged };
}

export function parseGithubWebhook(payload = {}) {
  const action = String(payload.action || "");
  const pull = payload.pull_request || payload.pullRequest || {};
  if (!pull || (!pull.html_url && !pull.url && !pull.number)) {
    return { accepted: false, reason: "pull_request payload required", action };
  }
  return {
    accepted: true,
    action,
    pullRequest: {
      url: String(pull.html_url || pull.url || ""),
      number: pull.number || null,
      merged: Boolean(pull.merged || (action === "closed" && pull.merged_at)),
      mergedAt: pull.merged_at || pull.mergedAt || "",
      mergeCommit: pull.merge_commit_sha || pull.mergeCommit || "",
      repository: payload.repository?.full_name || ""
    }
  };
}

