export function buildWorktreeSnapshot(worktree = {}, options = {}) {
  const exists = options.exists !== false;
  const runGit = typeof options.runGit === "function" ? options.runGit : () => "";
  const status = exists ? String(runGit("status --short") || "").trim() : "";
  const diffStat = exists ? normalizeDiffStat(runGit("diff --stat")) : "";
  const log = exists ? String(runGit("log") || "") : "";
  const commits = parseCommits(log);
  const dirty = Boolean(status);
  const hasChanges = Boolean(worktree.hasChanges || dirty || (worktree.base && worktree.head && worktree.base !== worktree.head));
  const reviewBlockers = [];
  if (!exists) reviewBlockers.push("path missing");
  if (!worktree.head) reviewBlockers.push("no head commit");
  if (!hasChanges) reviewBlockers.push("no changes");
  return {
    ...worktree,
    exists,
    dirty,
    hasChanges,
    diffStatus: status,
    diffStat,
    commits,
    reviewReady: reviewBlockers.length === 0,
    reviewBlockers
  };
}

function parseCommits(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [hash = "", short = "", author = "", authoredAt = "", ...subjectParts] = line.split("\t");
    return { hash, short, author, authoredAt, subject: subjectParts.join("\t") };
  }).filter((commit) => commit.hash);
}

function normalizeDiffStat(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

