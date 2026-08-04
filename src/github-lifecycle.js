import {
  extractGithubIssueRefs,
  extractGithubTaskIds,
  githubText,
  normalizeGithubLinks,
  normalizeGithubReference
} from "./github-links.js";

export function normalizeGithubPullRequest(value = {}, repository = "") {
  const pull = value && typeof value === "object" ? value : {};
  const text = githubText(pull);
  const issueRefs = [
    ...extractGithubIssueRefs(text),
    ...normalizeIssueList(pull.closingIssues || pull.closing_issues || pull.issues)
  ].filter((ref, index, refs) => refs.findIndex((item) => item.toLowerCase() === ref.toLowerCase()) === index);
  return {
    ...pull,
    url: normalizeGithubReference(pull.html_url || pull.url || pull.pullRequest || ""),
    number: pull.number || null,
    title: String(pull.title || ""),
    body: String(pull.body || ""),
    merged: Boolean(pull.merged === true || pull.merged_at || pull.mergedAt || (pull.action === "closed" && pull.merged)),
    mergedAt: pull.merged_at || pull.mergedAt || "",
    mergeCommit: pull.merge_commit_sha || pull.mergeCommit || "",
    repository: String(pull.repository?.full_name || pull.repository || repository || ""),
    taskIds: extractGithubTaskIds(text),
    issueRefs
  };
}

export function syncGithubLifecycle(tasks = [], source = []) {
  const input = Array.isArray(source) ? { pullRequests: source, issues: [] } : (source || {});
  const pullRequests = (input.pullRequests || input.pulls || []).map((pull) => normalizeGithubPullRequest(pull, input.repository));
  const changes = [];
  const unchanged = [];
  const syncedAt = new Date().toISOString();

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const pull = pullRequests
      .filter((candidate) => matchesTask(task, candidate))
      .sort((left, right) => Number(right.merged) - Number(left.merged))[0];
    if (!pull) {
      unchanged.push(task);
      continue;
    }

    const githubLinks = buildGithubLinks(task, pull);
    const patch = {};
    if (JSON.stringify(githubLinks) !== JSON.stringify(normalizeGithubLinks(task.githubLinks || task))) {
      patch.githubLinks = githubLinks;
    }
    if (pull.merged && !["done", "cancelled"].includes(task.status)) {
      patch.status = "done";
      patch.completedAt = pull.mergedAt || syncedAt;
      patch.githubSync = {
        ...(task.githubSync || {}),
        merged: true,
        mergeCommit: pull.mergeCommit,
        syncedAt
      };
    }
    if (Object.keys(patch).length === 0) {
      unchanged.push(task);
    } else {
      changes.push({ id: task.id, patch, pullRequest: pull });
    }
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
    pullRequest: normalizeGithubPullRequest({ ...pull, action }, payload.repository?.full_name || "")
  };
}

function matchesTask(task, pull) {
  const links = normalizeGithubLinks(task.githubLinks || task);
  const linkedPull = normalizeGithubReference(links.pullRequest);
  if (linkedPull && linkedPull === pull.url) return true;

  const text = githubText(pull).toLowerCase();
  const taskIds = [task.id, task.githubLinks?.taskId, task.githubLinks?.taskRef]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  if (taskIds.some((id) => pull.taskIds.some((candidate) => candidate.toLowerCase() === id.toLowerCase()))) return true;
  if (taskIds.some((id) => hasTextReference(text, id))) return true;

  const issue = String(links.issue || "").toLowerCase();
  if (!issue) return false;
  if (text.includes(issue)) return true;
  const issueNumber = issue.match(/\/issues\/(\d+)$/)?.[1] || issue.match(/^#(\d+)$/)?.[1];
  return Boolean(issueNumber && pull.issueRefs.some((ref) => ref === `#${issueNumber}`));
}

function buildGithubLinks(task, pull) {
  const current = normalizeGithubLinks(task.githubLinks || task);
  const links = { ...current };
  if (pull.url) links.pullRequest = pull.url;
  if (!links.issue) {
    const issueUrl = pull.issueRefs.find((ref) => ref.startsWith("https://github.com/") && ref.includes("/issues/"));
    if (issueUrl) {
      links.issue = issueUrl;
    } else if (pull.repository) {
      const issueNumber = pull.issueRefs.find((ref) => ref.startsWith("#"))?.slice(1);
      if (issueNumber) links.issue = `https://github.com/${pull.repository}/issues/${issueNumber}`;
    }
  }
  return links;
}

function normalizeIssueList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    return item?.html_url || item?.url || (item?.number ? `#${item.number}` : "");
  }).filter(Boolean).map((item) => normalizeGithubReference(item));
}

function hasTextReference(text, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
}
