// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

export function createDispatchRecordMutex() {
  let chain = Promise.resolve();
  return (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };
}

export function isClaimStale(task, nowMs, ttlMs) {
  if (!task || task.status !== "claimed") return false;
  const expires = task.claimExpiresAt ? Date.parse(task.claimExpiresAt) : NaN;
  if (!Number.isFinite(expires)) return false; // legacy claim without TTL -> don't auto-release
  return nowMs > expires;
}

export function shouldPersistDispatchReport(job, stdout) {
  const text = `${job?.text || ""}\n${stdout || ""}`;
  return /调研|研究|报告|分析|review|audit|investigat|research|feasibility|评估/i.test(text);
}

export function isDispatchableRadioMessage(message) {
  const type = message.type || "note";
  if (type === "status" || type === "response") {
    return false;
  }
  return true;
}

export function isClosedDispatchSourceState(state) {
  return ["completed", "delivered", "done", "cancelled", "blocked"].includes(String(state || "").trim().toLowerCase());
}

export function buildTaskDispatchText(task) {
  return [
    task.title || "",
    task.description ? `Description: ${task.description}` : "",
    task.handoff ? `Handoff: ${task.handoff}` : ""
  ].filter(Boolean).join("\n");
}

export function buildWorkflowDispatchText(workflow) {
  return [
    workflow.title || "",
    workflow.plan ? `Plan: ${workflow.plan}` : "",
    workflow.acceptance ? `Acceptance: ${workflow.acceptance}` : ""
  ].filter(Boolean).join("\n");
}

export function findRecipeStepTask(tasks, task, stepId) {
  const workflowId = task?.recipeStep?.workflowId || "";
  const recipeName = task?.recipe?.name || "";
  return tasks.find((candidate) => (
    candidate?.recipeStep?.id === stepId &&
    (!workflowId || candidate?.recipeStep?.workflowId === workflowId) &&
    (!recipeName || candidate?.recipe?.name === recipeName)
  )) || null;
}

export function normalizeToolName(tool) {
  return String(tool || "").trim().toLowerCase();
}

export function safeGitPathSegment(value, fallback) {
  const safe = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return safe || fallback;
}

export function isKnownGeminiWarning(line) {
  return /skill conflict|conflicting skill|duplicate skill|true color|256-color|ripgrep is not available/i.test(String(line || ""));
}

export function stripExistingModelArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    if (arg === "--model" && i + 1 < args.length && !String(args[i + 1]).startsWith("-")) {
      i += 1;
      continue;
    }
    if (arg.startsWith("--model=")) {
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

export function getDispatchThreadKey(job) {
  return `${job.tool || "unknown"}:${job.project || "default"}:${job.thread || job.refId || job.id || ""}`;
}

export function formatDispatchVerifyCommand(command) {
  if (command.command) {
    return [command.command, ...(command.args || [])].join(" ");
  }
  if (command.id && command.source) {
    return `${command.id} (${command.source})`;
  }
  return command.id || command.source || command.description || "verify";
}

export function getDispatchRunStatus(completed) {
  if (completed?.error?.code === "ETIMEDOUT") {
    return "timed_out";
  }
  if (completed?.status === 0) {
    return "completed";
  }
  return "failed";
}

export function getDispatchRunVerificationResult(runStatus, exitCode) {
  if (runStatus === "completed" && exitCode === 0) {
    return "passed";
  }
  if (runStatus === "timed_out") {
    return "timed_out";
  }
  return "failed";
}

export function getAsyncCallStateMeta(state) {
  const meta = {
    "pending": { terminal: false, success: false, retriable: false, label: "Pending" },
    "dispatched": { terminal: false, success: false, retriable: false, label: "Dispatched" },
    "acked": { terminal: false, success: false, retriable: false, label: "Acknowledged" },
    "progress": { terminal: false, success: false, retriable: false, label: "In progress" },
    "retrying": { terminal: false, success: false, retriable: true, label: "Retrying" },
    "failed": { terminal: false, success: false, retriable: true, label: "Failed" },
    "completed": { terminal: true, success: true, retriable: false, label: "Completed" },
    "abandoned": { terminal: true, success: false, retriable: false, label: "Abandoned" }
  };
  return meta[state] || { terminal: false, success: false, retriable: false, label: "Unknown" };
}

export function getDispatchSourceKey(job) {
  return `${job.kind || "unknown"}:${job.refId || job.id || ""}`;
}

export function getRelaySourceKey(entry) {
  if (!entry?.sourceKind || !entry?.sourceId) {
    return "";
  }
  return `${entry.sourceKind}:${entry.sourceId}`;
}
