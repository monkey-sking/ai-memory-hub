import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTaskNote } from "./entity-index.js";
import { resolvePossiblyHomePath } from "./resolve.js";
import { parsePageParam } from "./http.js";
import { appendWorkflowNodeEvent } from "./entity-repo.js";
import { resolveInside, selectPlatformCommand } from "./task-spec.js";
import { ensureDir } from "./cli.js";
import { writeFileAtomic } from "../atomic-write.js";

export function parseRunnerModelList(tool, runner, stdout) {
  const format = runner.modelListFormat || "";
  const text = String(stdout || "");
  const seen = new Set();
  const models = [];
  const add = (value) => {
    const clean = String(value || "").trim().replace(/\s*\(default\)\s*$/i, "");
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      models.push(clean);
    }
  };
  if (format === "grok") {
    for (const line of text.split("\n")) {
      const clean = line.trim();
      const defaultMatch = clean.match(/^Default model:\s*([A-Za-z0-9._/:@-]+)/i);
      if (defaultMatch) {
        add(defaultMatch[1]);
        continue;
      }
      const bulletMatch = clean.match(/^\*+\s*([A-Za-z0-9._/:@-]+)/);
      if (bulletMatch) {
        add(bulletMatch[1]);
        continue;
      }
    }
  } else if (format === "provider-model") {
    for (const line of text.split("\n")) {
      const clean = line.trim();
      if (clean && !clean.startsWith("(") && /^[A-Za-z0-9._-]+(\/|:)[A-Za-z0-9._:/@-]+$/.test(clean)) {
        add(clean);
      }
    }
  } else {
    for (const line of text.split("\n")) {
      const clean = line.trim();
      if (clean && /^[A-Za-z0-9._:/@-]+$/.test(clean) && !clean.includes(" ")) {
        add(clean);
      }
    }
  }
  return models;
}

export function semanticSearch(records, query, limit) {
  if (records.length === 0) return [];
  const STOPWORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "can", "of", "in", "to", "for", "with", "on", "at", "from", "by", "as", "and", "or", "not", "but", "if", "then", "else", "when", "up", "out", "about", "into", "over", "after"]);
  function tokenize(text) {
    const words = String(text || "").toLowerCase().match(/[a-z0-9\u4e00-\u9fff]+/g) || [];
    return words.filter(w => w.length > 1 && !STOPWORDS.has(w));
  }
  const df = new Map();
  const docTokens = records.map(r => {
    const tokens = tokenize(r.text + " " + (r.metadata?.tags || []).join(" ") + " " + (r.metadata?.project || ""));
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
    return tokens;
  });
  const N = records.length;
  function idf(term) { const freq = df.get(term) || 0; return Math.log((N + 1) / (freq + 1)) + 1; }
  const queryTokens = tokenize(query);
  const queryVector = new Map();
  for (const t of queryTokens) queryVector.set(t, (queryVector.get(t) || 0) + 1);
  for (const [t, tf] of queryVector) queryVector.set(t, tf * idf(t));
  const queryNorm = Math.sqrt([...queryVector.values()].reduce((s, v) => s + v * v, 0));
  if (queryNorm === 0) return [];
  const scored = records.map((r, i) => {
    const tokens = docTokens[i];
    const tfMap = new Map();
    for (const t of tokens) tfMap.set(t, (tfMap.get(t) || 0) + 1);
    let dotProduct = 0, docNorm = 0;
    for (const [t, tf] of tfMap) {
      const weight = tf * idf(t);
      docNorm += weight * weight;
      if (queryVector.has(t)) dotProduct += weight * queryVector.get(t);
    }
    docNorm = Math.sqrt(docNorm);
    const score = docNorm > 0 ? dotProduct / (queryNorm * docNorm) : 0;
    return { ...r, score };
  });
  return scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function checkProcessLiveness(pid) {
  if (!pid) {
    return {
      running: false,
      reason: "missing pid"
    };
  }
  try {
    process.kill(pid, 0);
    return {
      running: true,
      reason: pid === process.pid ? "current process" : "signal 0 succeeded"
    };
  } catch (error) {
    if (error.code === "EPERM") {
      return {
        running: true,
        reason: "permission denied, process exists"
      };
    }
    return {
      running: false,
      reason: error.code || error.message || "not running"
    };
  }
}

export function getContentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

export function readRequestJson(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function findProjectIndex(projects, query) {
  const clean = String(query || "").trim();
  if (!clean) {
    return -1;
  }
  const exact = projects.findIndex((project) => project.id === clean);
  if (exact !== -1) {
    return exact;
  }
  const normalized = clean.toLowerCase();
  const alias = projects.findIndex((project) => (
    [project.name, project.displayName, ...(project.aliases || [])]
      .some((value) => String(value || "").toLowerCase() === normalized)
  ));
  if (alias !== -1) {
    return alias;
  }
  const prefixMatches = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => String(project.id || "").toLowerCase().startsWith(normalized));
  return prefixMatches.length === 1 ? prefixMatches[0].index : -1;
}

export function expandSynonyms(terms) {
  const synonyms = [
    ["feishu", "飞书", "lark", "lark-feishu"],
    ["git", "github", "gitee"],
    ["wechat", "微信", "wx", "wechat-mini-game"],
    ["game", "游戏", "play"],
    ["task", "任务", "todo"],
    ["workflow", "工作流", "collaboration"],
    ["memory", "记忆", "hub"]
  ];
  const expanded = new Set(terms);
  for (const term of terms) {
    for (const group of synonyms) {
      if (group.includes(term)) {
        for (const word of group) {
          expanded.add(word);
        }
      }
    }
  }
  return [...expanded];
}

export function scanBackupFilesForSecrets(files) {
  const issues = [];
  const patterns = [
    { kind: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,255}\b/ },
    { kind: "openai-api-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
    { kind: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
    { kind: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
    { kind: "local-absolute-path", pattern: /\b[A-Za-z]:[\\/](?:Users|Project|Work|Workspace)[\\/][^\s"'<>]+/i },
    { kind: "internal-feishu-url", pattern: new RegExp("\\bhttps://(?:my|applink)\\.feishu\\.cn\\b", "i") }
  ];
  for (const file of files) {
    const stat = fs.statSync(file.target);
    if (stat.size > 5 * 1024 * 1024) {
      continue;
    }
    const text = fs.readFileSync(file.target, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (pattern.pattern.test(line)) {
          issues.push({
            file: file.name,
            line: index + 1,
            kind: pattern.kind
          });
        }
      }
    });
  }
  return {
    ok: issues.length === 0,
    issues
  };
}

export function getRelayTimeoutBaseMs(entry) {
  const candidates = [
    entry.progressAt,
    entry.dispatchedAt,
    entry.deliveryUpdatedAt,
    entry.ts,
    entry.updatedAt
  ];
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate || "");
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Number.NaN;
}

export function renderDispatchWorktree(worktree) {
  if (!worktree?.enabled) {
    return [];
  }
  const lines = [
    `- Worktree path: ${worktree.path || ""}`,
    `- Branch: ${worktree.branch || ""}`,
    `- Base commit: ${worktree.base || ""}`,
    `- Current head: ${worktree.head || ""}`,
    `- Reused existing worktree: ${worktree.reused ? "yes" : "no"}`
  ];
  if (worktree.diffStatus) {
    lines.push(`- Diff status: ${worktree.diffStatus}`);
  }
  if (worktree.diffStat) {
    lines.push(`- Diff stat: ${worktree.diffStat}`);
  }
  lines.push("- Keep this worktree and branch for review; do not delete, merge, or push it unless explicitly authorized.");
  return lines;
}

export function createHealthRepairAction({
  id,
  label,
  command = "",
  detail = "",
  endpoint = "",
  method = "POST"
}) {
  return {
    id,
    label,
    command,
    detail,
    endpoint,
    method,
    destructive: false
  };
}

export function getPathSize(target) {
  if (!fs.existsSync(target)) {
    return 0;
  }
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    return 0;
  }
  if (stat.isFile()) {
    return stat.size;
  }
  if (!stat.isDirectory()) {
    return 0;
  }
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    total += getPathSize(path.join(target, entry.name));
  }
  return total;
}

export function extractCjkNgrams(text) {
  const chunks = String(text || "").match(/[\u4e00-\u9fff]{2,}/g) || [];
  const grams = [];
  for (const chunk of chunks) {
    if (chunk.length <= 4) {
      grams.push(chunk);
      continue;
    }
    for (let size = 2; size <= 3; size++) {
      for (let index = 0; index <= chunk.length - size; index++) {
        grams.push(chunk.slice(index, index + size));
      }
    }
    grams.push(chunk);
  }
  return grams;
}

export function getBackupFileCatalog(memoryDir) {
  return [
    { name: "MEMORY.md", target: path.join(memoryDir, "MEMORY.md"), kind: "snapshot" },
    { name: "BOOTSTRAP.md", target: path.join(memoryDir, "BOOTSTRAP.md"), kind: "snapshot" },
    { name: "profile.md", target: path.join(memoryDir, "profile.md"), kind: "profile" },
    { name: "inbox-events.jsonl", target: path.join(memoryDir, "inbox", "events.jsonl"), kind: "inbox" },
    { name: "memory-ledger.jsonl", target: path.join(memoryDir, "memories", "ledger.jsonl"), kind: "memory" },
    { name: "radio-messages.jsonl", target: path.join(memoryDir, "radio", "messages.jsonl"), kind: "radio" },
    { name: "tasks.jsonl", target: path.join(memoryDir, "tasks", "tasks.jsonl"), kind: "tasks" },
    { name: "tasks-events.jsonl", target: path.join(memoryDir, "tasks", "events.jsonl"), kind: "tasks" },
    { name: "workflows.jsonl", target: path.join(memoryDir, "workflows", "workflows.jsonl"), kind: "workflows" },
    { name: "workflows-events.jsonl", target: path.join(memoryDir, "workflows", "events.jsonl"), kind: "workflows" },
    { name: "projects.jsonl", target: path.join(memoryDir, "projects", "projects.jsonl"), kind: "projects" },
    { name: "projects-events.jsonl", target: path.join(memoryDir, "projects", "events.jsonl"), kind: "projects" },
    { name: "config.json", target: path.join(memoryDir, "config.json"), kind: "config" }
  ];
}

export function markTieredBackups(backups, { tier, limit, keyForBackup, label }, markKeep) {
  const seen = new Set();
  for (const backup of backups) {
    if (backup.retentionTier !== tier) {
      continue;
    }
    const key = keyForBackup(backup);
    if (!key || seen.has(key)) {
      continue;
    }
    if (seen.size >= limit) {
      continue;
    }
    seen.add(key);
    markKeep(backup, `${label}-${seen.size}`);
  }
}

export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? [...argv] : [];
  const command = args[0] || "help";
  return {
    args,
    command,
    rest: args.slice(1)
  };
}

export function parseDeclaredList(raw) {
  return [...new Set(String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean))];
}

export function parseProgressPercent(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("--percent must be a number from 0 to 100.");
  }
  return Math.round(percent);
}

export function isJobCheckpointed(checkpoint, jobId) {
  const entry = checkpoint.jobs[jobId];
  return entry && (entry.status === "completed" || entry.status === "failed");
}

export function getCheckpointStats(checkpoint) {
  const jobs = Object.values(checkpoint.jobs);
  return {
    cycle: checkpoint.cycle,
    total: jobs.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    lastCompletedAt: checkpoint.lastCompletedAt
  };
}

export function renderProjectRegistryReadme() {
  return `# Project Registry

Project metadata is stored in \`projects.jsonl\` as one JSON object per line.

Use \`ai-memory-hub project list\`, \`project add\`, \`project update\`, \`project alias\`, and \`project relate\` to manage records. The dashboard project selectors show only \`active\`, \`paused\`, and \`planning\` projects and hide \`archived\` or \`test-*\` entries by default.

Writes use the shared hub lock, but this registry is currently read-modify-write. Avoid simultaneous manual edits; prefer the CLI or dashboard API.
`;
}

export function extractSharedSkillLayerVersion(text) {
  const match = String(text || "").match(/AI_MEMORY_HUB_SHARED_SKILL_LAYER v([0-9]+)/);
  return match ? match[1] : "";
}

export function renderEmptyBootstrapSnapshot(memoryDir) {
  return [
    "# AI Memory Hub Bootstrap",
    "",
    "Memory directory: configured locally.",
    "",
    "No startup-critical memories have been indexed yet.",
    "",
    "If an instruction include such as `@RTK.md` is missing, run `ai-memory-hub resolve \"@RTK.md\"` and then use the resolved local path when reading the include.",
    ""
  ].join("\n");
}

export function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Short synchronous wait keeps the CLI dependency-free.
  }
}

export function sharedSkillLayerActionLabel(status) {
  return status === "updated"
    ? "Updated"
    : status === "current"
      ? "Already current"
      : status === "malformed"
        ? "Skipped (malformed)"
        : "Installed";
}

export function summarizeDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .slice(0, 12)
      .map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name);
  } catch {
    return [];
  }
}

export function releaseStaleClaim(task, nowIso) {
  return {
    ...task,
    status: "open",
    claimedAt: "",
    claimExpiresAt: "",
    lastAssignee: task.assignee || task.lastAssignee || "",
    updatedAt: nowIso,
    notes: [
      ...(task.notes || []),
      createTaskNote(task.assignee || "system", `Claim auto-released (TTL expired).`)
    ]
  };
}

export function inspectSharedMemoryInstructions(file) {
  if (!file || !fs.existsSync(file)) {
    return {
      configured: false,
      skillLayer: false,
      skillLayerVersion: "",
      status: "missing"
    };
  }
  const text = fs.readFileSync(file, "utf8");
  const configured = text.includes("Shared AI Memory") && (
    text.includes("ai-memory-hub") ||
    text.includes(".ai-memory") ||
    text.includes("AI Memory Hub")
  );
  const skillLayerVersion = extractSharedSkillLayerVersion(text);
  const skillLayer = Boolean(skillLayerVersion);
  return {
    configured,
    skillLayer,
    skillLayerVersion,
    status: skillLayer
      ? `shared-skill-layer-v${skillLayerVersion}`
      : configured
        ? "legacy-shared-memory"
        : "missing"
  };
}

export function getDirectResolveCandidates(normalizedQuery, config, fromFile = "") {
  const home = os.homedir();
  const roots = [
    process.cwd(),
    home,
    path.join(home, ".codex"),
    path.join(home, ".claude"),
    path.join(home, ".gemini"),
    path.join(home, ".grok"),
    config.memoryDir,
    path.join(config.memoryDir, "tools"),
    projectRoot()
  ];
  const candidates = [];
  const add = (candidatePath, source, confidence = 50) => {
    candidates.push({ path: candidatePath, source, confidence, evidence: source });
  };
  if (fromFile) {
    add(path.resolve(path.dirname(fromFile), normalizedQuery), `relative:${fromFile}`, 90);
  }
  if (path.isAbsolute(normalizedQuery)) {
    add(normalizedQuery, "absolute-path", 95);
  }
  for (const root of roots) {
    add(path.resolve(root, normalizedQuery), `root:${root}`, root === home ? 80 : 65);
  }
  return candidates;
}

export function normalizeCandidatePath(candidatePath) {
  const clean = resolvePossiblyHomePath(candidatePath);
  if (!clean) {
    return "";
  }
  return path.isAbsolute(clean) ? path.normalize(clean) : path.resolve(clean);
}

export function getPageOptions(url) {
  return {
    offset: parsePageParam(url.searchParams.get("offset"), 0),
    limit: parsePageParam(url.searchParams.get("limit"), undefined)
  };
}

export function findProject(projects, query) {
  const index = findProjectIndex(projects, query);
  return index === -1 ? null : projects[index];
}

export function autoCreateWorkflowNodes(memoryDir, workflow) {
  // Phase 4: Auto-create initial nodes for planner/executor/reviewer when workflow is created
  const nodes = [];

  // Roles are arrays, take first element if present
  const plannerActor = Array.isArray(workflow.planner) && workflow.planner.length > 0 ? workflow.planner[0] : workflow.planner;
  const executorActor = Array.isArray(workflow.executor) && workflow.executor.length > 0 ? workflow.executor[0] : workflow.executor;
  const reviewerActor = Array.isArray(workflow.reviewer) && workflow.reviewer.length > 0 ? workflow.reviewer[0] : workflow.reviewer;

  if (plannerActor) {
    nodes.push({
      slug: "plan",
      label: "Planning phase",
      role: "planner",
      actor: plannerActor,
      status: "running", // planner starts immediately
      isRequired: true
    });
  }

  if (executorActor) {
    nodes.push({
      slug: "exec",
      label: "Execution phase",
      role: "executor",
      actor: executorActor,
      status: "queued", // executor waits for plan
      isRequired: true
    });
  }

  if (reviewerActor) {
    nodes.push({
      slug: "review",
      label: "Review phase",
      role: "reviewer",
      actor: reviewerActor,
      status: "queued", // reviewer waits for execution
      isRequired: !workflow.qualityGate?.reviewOptional // required unless marked optional
    });
  }

  // Create node events
  for (const node of nodes) {
    appendWorkflowNodeEvent(memoryDir, {
      type: "workflow.node",
      workflowId: workflow.id,
      nodeId: `${workflow.id}:${node.slug}`,
      slug: node.slug,
      label: node.label,
      role: node.role,
      actor: node.actor,
      status: node.status,
      ts: new Date().toISOString(),
      note: "Auto-created by workflow creation",
      isRequired: node.isRequired,
      input: {},
      output: {},
      error: ""
    });
  }

  return nodes.length;
}

export function summarizeTaskSpec(task) {
  return {
    id: task.id,
    title: task.title,
    command: selectPlatformCommand(task),
    args: task.args,
    cwd: task.cwd,
    hasVerify: task.verify.length > 0,
    ports: task.ports,
    resources: task.resources,
    logs: task.logs
  };
}

export function writeTaskSpecProcessLogs(projectRoot, logs, completed) {
  const written = {};
  for (const [stream, text] of [
    ["stdout", completed.stdout],
    ["stderr", completed.stderr]
  ]) {
    const relativeLogPath = logs?.[stream] || "";
    if (!relativeLogPath) {
      continue;
    }
    const file = resolveInside(projectRoot, relativeLogPath);
    ensureDir(path.dirname(file));
    writeFileAtomic(file, String(text || ""), "utf8");
    written[stream] = path.relative(projectRoot, file).replace(/\\/g, "/");
  }
  return written;
}

export function resolveTaskSpecCwd(projectRoot, cwd, allowOutsideCwd) {
  const resolved = path.resolve(projectRoot, cwd || ".");
  if (!allowOutsideCwd) {
    resolveInside(projectRoot, path.relative(projectRoot, resolved) || ".");
  }
  return resolved;
}

export function getMemoryStorageSummary(memoryDir) {
  const items = [
    ["MEMORY.md", path.join(memoryDir, "MEMORY.md")],
    ["INDEX.md", path.join(memoryDir, "INDEX.md")],
    ["memories/ledger.jsonl", path.join(memoryDir, "memories", "ledger.jsonl")],
    ["memories/index.json", path.join(memoryDir, "memories", "index.json")],
    ["inbox/events.jsonl", path.join(memoryDir, "inbox", "events.jsonl")],
    ["radio/messages.jsonl", path.join(memoryDir, "radio", "messages.jsonl")],
    ["tasks/tasks.jsonl", path.join(memoryDir, "tasks", "tasks.jsonl")],
    ["workflows/workflows.jsonl", path.join(memoryDir, "workflows", "workflows.jsonl")],
    ["backups/", path.join(memoryDir, "backups")]
  ].map(([label, target]) => ({
    label,
    bytes: getPathSize(target)
  }));
  const ledgerBytes = items.find((item) => item.label === "memories/ledger.jsonl")?.bytes || 0;
  const backupsBytes = items.find((item) => item.label === "backups/")?.bytes || 0;
  return {
    totalBytes: getPathSize(memoryDir),
    ledgerBytes,
    backupsBytes,
    items
  };
}
