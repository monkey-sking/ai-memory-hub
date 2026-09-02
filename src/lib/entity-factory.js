import { createId, hasOwnField, isPlainObject } from "./cli.js";
import { normalizePriority, normalizeProject, normalizeQualityGate, normalizeWorkflowRole } from "./entity-models.js";
import { normalizeGithubLinks } from "../github-links.js";
import { normalizeSeverity } from "./format.js";
// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

export function relayFailureFingerprint(exitCode, lastError) {
  const normalizedError = String(lastError || "")
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/g, "<ts>")
    .replace(/0x[0-9a-f]+/g, "<hex>")
    .replace(/\b[0-9a-f]{8,}\b/g, "<id>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return createId(`relay-fp:${exitCode ?? "null"}:${normalizedError}`);
}

export function createSkillDelta({ tool, section, original, proposed, reason, createdBy }) {
  const now = new Date().toISOString();
  return {
    id: createId(`delta:${tool}:${section}:${proposed}`),
    createdAt: now,
    tool: String(tool || ""),
    section: String(section || ""),
    original: String(original || ""),
    proposed: String(proposed || ""),
    reason: String(reason || ""),
    status: "pending", // pending | approved | rejected | merged
    createdBy: String(createdBy || "observer"),
    reviewedBy: "",
    reviewedAt: "",
    mergedAt: ""
  };
}

export function createProject({ id, name, displayName, status, type, description, metadata, aliases, resources }) {
  const now = new Date().toISOString();
  return normalizeProject({
    id,
    name,
    displayName: displayName || name,
    status: status || "active",
    type: type || "",
    description: description || "",
    metadata: isPlainObject(metadata) ? metadata : {},
    aliases: Array.isArray(aliases) ? aliases : [],
    resources: isPlainObject(resources) ? resources : {},
    createdAt: now,
    updatedAt: now
  });
}

export function createWorkflow({ title, createdBy, project, priority, planner, executor, reviewer, observer, plan, acceptance, qualityGate, githubLinks }) {
  const now = new Date().toISOString();
  const cleanTitle = String(title || "").trim();
  return {
    id: createId(`workflow:${cleanTitle}:${createdBy}:${project}`),
    createdAt: now,
    updatedAt: now,
    completedAt: "",
    createdBy: String(createdBy || "manual"),
    status: "open",
    priority: normalizePriority(priority),
    project: String(project || ""),
    title: cleanTitle,
    planner: normalizeWorkflowRole(planner),
    executor: normalizeWorkflowRole(executor),
    reviewer: normalizeWorkflowRole(reviewer),
    observer: normalizeWorkflowRole(observer),
    plan: String(plan || ""),
    acceptance: String(acceptance || ""),
    qualityGate: normalizeQualityGate(qualityGate),
    risks: [],
    results: [],
    reviews: [],
    linkedTasks: [],
    linkedRadio: [],
    githubLinks: normalizeGithubLinks(githubLinks),
    notes: []
  };
}

export function createTask({ title, description, handoff, createdBy, project, priority, qualityGate }) {
  const now = new Date().toISOString();
  const cleanTitle = String(title || "").trim();
  const cleanPriority = normalizePriority(priority);
  return {
    id: createId(`task:${cleanTitle}:${createdBy}:${project}`),
    createdAt: now,
    updatedAt: now,
    completedAt: "",
    createdBy: String(createdBy || "manual"),
    assignee: "",
    status: "open",
    priority: cleanPriority,
    project: String(project || ""),
    title: cleanTitle,
    description: String(description || ""),
    handoff: String(handoff || ""),
    qualityGate: normalizeQualityGate(qualityGate),
    notes: []
  };
}

export function createSession({ title, createdBy, project, participants, context, artifacts }) {
  return {
    id: createId(`session:${title}:${createdBy}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    createdBy: createdBy || "unknown",
    project: project || "",
    title: title || "Untitled Session",
    participants: participants || [],
    context: context || "",
    artifacts: artifacts || [],
    metadata: {}
  };
}

export function createRpcRequest({ from, to, method, params, timeout }) {
  return {
    id: createId(`rpc:${from}:${to}:${method}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    from: from || "unknown",
    to: to || "unknown",
    method: method || "",
    params: params || {},
    timeout: Number(timeout || 30000),
    status: "pending"
  };
}

export function createNotification({ severity, title, message, actionUrl, channels, from, project }) {
  return {
    id: createId(`notification:${severity}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    severity: normalizeSeverity(severity),
    title: title || "",
    message: message || "",
    actionUrl: actionUrl || "",
    channels: channels || [],
    from: from || "unknown",
    project: project || "",
    status: "pending",
    deliveredTo: []
  };
}

export function createDispatchQueueEntry({ taskId, workflowId, radioId, tool, priority, timeout, maxRetries }) {
  return {
    id: createId(`queue:${tool}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    taskId: taskId || "",
    workflowId: workflowId || "",
    radioId: radioId || "",
    tool: tool || "",
    priority: normalizePriority(priority || "normal"),
    timeout: Number(timeout || 30000),
    maxRetries: Number(maxRetries || 3),
    status: "queued",
    startedAt: "",
    completedAt: "",
    attempts: 0,
    lastAttemptAt: "",
    lastError: ""
  };
}

export function validateVerifyCommand(command, label) {
  if (typeof command === "string") {
    return command.trim()
      ? { valid: true }
      : { valid: false, error: `${label} must be a non-empty command string` };
  }
  if (!isPlainObject(command)) {
    return { valid: false, error: `${label} must be a command string or object` };
  }
  const hasCommandTarget = ["id", "source", "command"].some((field) => (
    typeof command[field] === "string" && command[field].trim()
  ));
  if (!hasCommandTarget) {
    return { valid: false, error: `${label} must define id, source, or command` };
  }
  if (hasOwnField(command, "args") && !Array.isArray(command.args)) {
    return { valid: false, error: `${label}.args must be an array` };
  }
  if (hasOwnField(command, "timeoutMs") && (!Number.isInteger(command.timeoutMs) || command.timeoutMs <= 0)) {
    return { valid: false, error: `${label}.timeoutMs must be a positive integer` };
  }
  if (hasOwnField(command, "required") && typeof command.required !== "boolean") {
    return { valid: false, error: `${label}.required must be a boolean` };
  }
  return { valid: true };
}

export function validateMinimalImplementation(source, label) {
  if (!isPlainObject(source)) {
    return { valid: false, error: `${label} must be an object` };
  }
  if (hasOwnField(source, "enabled") && typeof source.enabled !== "boolean") {
    return { valid: false, error: `${label}.enabled must be a boolean` };
  }
  if (hasOwnField(source, "principles")) {
    if (!Array.isArray(source.principles) || source.principles.some((item) => typeof item !== "string" || item.trim() === "")) {
      return { valid: false, error: `${label}.principles must be an array of non-empty strings` };
    }
  }
  if (hasOwnField(source, "forbiddenPatterns")) {
    if (!Array.isArray(source.forbiddenPatterns) || source.forbiddenPatterns.some((item) => typeof item !== "string" || item.trim() === "")) {
      return { valid: false, error: `${label}.forbiddenPatterns must be an array of non-empty strings` };
    }
  }
  if (hasOwnField(source, "maxNewFiles") && (!Number.isInteger(source.maxNewFiles) || source.maxNewFiles < 0)) {
    return { valid: false, error: `${label}.maxNewFiles must be a non-negative integer` };
  }
  if (hasOwnField(source, "maxLinesPerFile") && (!Number.isInteger(source.maxLinesPerFile) || source.maxLinesPerFile < 0)) {
    return { valid: false, error: `${label}.maxLinesPerFile must be a non-negative integer` };
  }
  return { valid: true };
}

export function validateDependencyBudget(source, label) {
  if (!isPlainObject(source)) {
    return { valid: false, error: `${label} must be an object` };
  }
  if (hasOwnField(source, "enabled") && typeof source.enabled !== "boolean") {
    return { valid: false, error: `${label}.enabled must be a boolean` };
  }
  if (hasOwnField(source, "maxNewDependencies") && (!Number.isInteger(source.maxNewDependencies) || source.maxNewDependencies < 0)) {
    return { valid: false, error: `${label}.maxNewDependencies must be a non-negative integer` };
  }
  if (hasOwnField(source, "maxTotalSizeMB") && (!Number.isInteger(source.maxTotalSizeMB) || source.maxTotalSizeMB < 0)) {
    return { valid: false, error: `${label}.maxTotalSizeMB must be a non-negative integer` };
  }
  if (hasOwnField(source, "allowedScopes")) {
    if (!Array.isArray(source.allowedScopes) || source.allowedScopes.some((item) => typeof item !== "string" || item.trim() === "")) {
      return { valid: false, error: `${label}.allowedScopes must be an array of non-empty strings` };
    }
  }
  if (hasOwnField(source, "forbiddenPackages")) {
    if (!Array.isArray(source.forbiddenPackages) || source.forbiddenPackages.some((item) => typeof item !== "string" || item.trim() === "")) {
      return { valid: false, error: `${label}.forbiddenPackages must be an array of non-empty strings` };
    }
  }
  if (hasOwnField(source, "requireJustification") && typeof source.requireJustification !== "boolean") {
    return { valid: false, error: `${label}.requireJustification must be a boolean` };
  }
  return { valid: true };
}

export function normalizeRefValues(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => normalizeRefValues(item)))];
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (isPlainObject(value)) {
    return Object.values(value).flatMap((item) => normalizeRefValues(item));
  }
  return [String(value).trim()].filter(Boolean);
}

export function mergeMemoryAccessMetadata(metadata = {}, access = {}, derived = {}) {
  if (!access.hasAccessTelemetry) {
    return metadata;
  }
  const lifecycle = isPlainObject(metadata.lifecycle) ? metadata.lifecycle : {};
  const lifecycleAccess = isPlainObject(lifecycle.access) ? lifecycle.access : {};
  return {
    ...metadata,
    lifecycle: {
      ...lifecycle,
      access: {
        ...lifecycleAccess,
        accessCount: access.accessCount,
        count: access.accessCount,
        ...(access.firstAccessedAt ? { firstAccessedAt: access.firstAccessedAt } : {}),
        ...(access.lastAccessedAt ? { lastAccessedAt: access.lastAccessedAt } : {}),
        ...(derived.heat !== undefined ? { heat: Number(derived.heat || 0) } : {}),
        ...(derived.stalePenalty !== undefined ? { stalePenalty: Number(derived.stalePenalty || 0) } : {})
      }
    }
  };
}

export function parseJsonObjectCandidate(text) {
  if (!text.startsWith("{") || !text.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createRadioMessage({ from, to, type, text, thread, replyTo, project }) {
  const cleanText = String(text || "").trim();
  return {
    id: createId(`radio:${from}:${to}:${type}:${cleanText}`),
    ts: new Date().toISOString(),
    from: String(from || "unknown"),
    to: String(to || "all"),
    type: String(type || "note"),
    text: cleanText,
    thread: String(thread || ""),
    replyTo: String(replyTo || ""),
    project: String(project || ""),
    deliveryState: "pending",
    deliveryUpdatedAt: "",
    dispatchId: "",
    threadKey: "",
    attempt: 0,
    maxRetries: 0,
    nextRetryAt: "",
    sessionId: "",
    lastError: "",
    promoted: false
  };
}
