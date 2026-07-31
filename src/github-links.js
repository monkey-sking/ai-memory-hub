export function normalizeGithubLinks(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const links = {};
  const issue = String(value.issue || value.githubIssue || "").trim();
  const pullRequest = String(value.pullRequest || value.githubPr || value.githubPullRequest || "").trim();
  if (issue) links.issue = issue;
  if (pullRequest) links.pullRequest = pullRequest;
  return links;
}
