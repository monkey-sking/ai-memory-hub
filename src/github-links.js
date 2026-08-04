const TASK_TAG_PATTERN = /\[AMH-TASK-([^\]\r\n]+)\]/gi;
const NAMED_TASK_TAG_PATTERN = /\[(AMH-(?!TASK-)[A-Z0-9][A-Z0-9._:-]*)\]/gi;
const ISSUE_URL_PATTERN = /https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/issues\/\d+(?:\/)?/gi;
const ISSUE_REF_PATTERN = /(^|[^\w])#(\d+)\b/g;

export function normalizeGithubLinks(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const links = {};
  const issue = normalizeGithubReference(value.issue || value.githubIssue || value.issueUrl || "");
  const pullRequest = normalizeGithubReference(value.pullRequest || value.githubPr || value.githubPullRequest || value.pullRequestUrl || "");
  if (issue) links.issue = issue;
  if (pullRequest) links.pullRequest = pullRequest;
  return links;
}

export function normalizeGithubReference(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

export function formatGithubTaskTag(taskOrId) {
  const raw = typeof taskOrId === "object" ? taskOrId?.id : taskOrId;
  const id = String(raw || "").trim()
    .replace(/^\[AMH-TASK-/i, "")
    .replace(/\]$/, "")
    .replace(/^AMH-TASK-/i, "");
  return id ? `[AMH-TASK-${id}]` : "";
}

export function formatGithubCommitMessage(message, taskOrId) {
  const text = String(message || "").trim();
  const tag = formatGithubTaskTag(taskOrId);
  if (!tag || text.toLowerCase().includes(tag.toLowerCase())) return text;
  return text ? `${tag} ${text}` : tag;
}

export function extractGithubTaskIds(text = "") {
  const ids = [];
  const seen = new Set();
  const add = (value) => {
    const id = String(value || "").trim();
    const key = id.toLowerCase();
    if (id && !seen.has(key)) {
      seen.add(key);
      ids.push(id);
    }
  };
  for (const match of String(text || "").matchAll(TASK_TAG_PATTERN)) add(match[1]);
  for (const match of String(text || "").matchAll(NAMED_TASK_TAG_PATTERN)) add(match[1]);
  return ids;
}

export function extractGithubIssueRefs(text = "") {
  const refs = [];
  const seen = new Set();
  const add = (value) => {
    const ref = String(value || "").trim().replace(/\/$/, "");
    const key = ref.toLowerCase();
    if (ref && !seen.has(key)) {
      seen.add(key);
      refs.push(ref);
    }
  };
  for (const match of String(text || "").matchAll(ISSUE_URL_PATTERN)) add(match[0]);
  for (const match of String(text || "").matchAll(ISSUE_REF_PATTERN)) add(`#${match[2]}`);
  return refs;
}

export function githubText(value = {}) {
  const commits = Array.isArray(value.commits) ? value.commits : [];
  return [
    value.title,
    value.body,
    value.message,
    value.commitMessage,
    ...commits.map((commit) => typeof commit === "string" ? commit : commit?.message || commit?.subject)
  ].filter(Boolean).join("\n");
}
