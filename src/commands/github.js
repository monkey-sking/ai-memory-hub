import { buildGithubRequest } from "../external-integrations.js";
import { parseGithubWebhook, syncGithubLifecycle } from "../github-lifecycle.js";
import { formatGithubCommitMessage } from "../github-links.js";
import { getOption, hasFlag, positionalArgs, readJson } from "../lib/cli.js";
import { readTasks } from "../lib/entity-repo.js";
import path from "node:path";

// github command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function githubCommand(argv, deps) {
  const action = argv[0] || "sync";
  if (["commit-message", "format-commit", "format"].includes(action)) {
    const task = getOption(argv.slice(1), "--task") || getOption(argv.slice(1), "--task-id") || "";
    const message = getOption(argv.slice(1), "--message") || positionalArgs(argv.slice(1)).join(" ");
    if (!task || !message) throw new Error("Usage: ai-memory-hub gh commit-message --task <task-id> --message <message>");
    console.log(JSON.stringify({ message: formatGithubCommitMessage(message, task), task, apply: false }, null, 2));
    return;
  }
  if (action === "request") {
    const owner = getOption(argv.slice(1), "--owner") || "";
    const repo = getOption(argv.slice(1), "--repo") || "";
    const pull = getOption(argv.slice(1), "--pull") || "";
    if (!owner || !repo || !pull) throw new Error("Usage: ai-memory-hub gh request --owner <owner> --repo <repo> --pull <number> [--dry-run]");
    console.log(JSON.stringify({ request: buildGithubRequest({ owner, repo, pull, token: process.env.GITHUB_TOKEN || "" }), dryRun: true }, null, 2));
    return;
  }
  if (action === "webhook") {
    const dataFile = getOption(argv.slice(1), "--data") || "";
    if (!dataFile) throw new Error("Usage: ai-memory-hub gh webhook --data <payload.json> [--apply]");
    const parsed = parseGithubWebhook(readJson(path.resolve(dataFile)));
    if (hasFlag(argv, "--apply") && parsed.accepted) {
      const config = deps.loadConfig(); deps.ensureHub(config.memoryDir);
      const result = syncGithubLifecycle(readTasks(config.memoryDir), [parsed.pullRequest]);
      const applied = deps.withHubLock(config.memoryDir, "github-webhook", () => result.changes.map((change) => deps.updateTask(config.memoryDir, change.id, (current) => ({ ...current, ...change.patch, updatedAt: new Date().toISOString() }))), config.sync.lockStaleMs);
      console.log(JSON.stringify({ ...parsed, result, applied }, null, 2)); return;
    }
    console.log(JSON.stringify({ ...parsed, apply: false }, null, 2)); return;
  }
  if (action !== "sync") throw new Error("Usage: ai-memory-hub gh sync|request|webhook|commit-message ...");
  const dataFile = getOption(argv.slice(1), "--data") || "";
  if (!dataFile) throw new Error("Usage: ai-memory-hub gh sync --data <pull-requests.json> [--apply]");
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const input = readJson(path.resolve(dataFile));
  const pullRequests = Array.isArray(input) ? input : (input.pullRequests || input.pulls || []);
  const tasks = readTasks(config.memoryDir);
  const result = syncGithubLifecycle(tasks, Array.isArray(input) ? pullRequests : input);
  if (hasFlag(argv, "--apply")) {
    const updated = deps.withHubLock(config.memoryDir, "github-sync", () => result.changes.map((change) => deps.updateTask(config.memoryDir, change.id, (current) => ({ ...current, ...change.patch, updatedAt: new Date().toISOString(), notes: [...(current.notes || []), deps.createTaskNote("github-sync", `GitHub PR merged: ${change.pullRequest.url || change.pullRequest.html_url || ""}`)] }))), config.sync.lockStaleMs);
    console.log(JSON.stringify({ ...result, applied: updated }, null, 2));
    return;
  }
  console.log(JSON.stringify({ ...result, apply: false, hint: "Pass --apply to update linked tasks." }, null, 2));
}

