// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import { appendEntityRecord, bootstrapEntityEventsFromProjection, materializeEntityProjection } from "./entity-store.js";
import { createId, hasOwnField, isPlainObject } from "./cli.js";
import { findProjectIndex } from "./util.js";
import { findTaskIndex, findWorkflowIndex } from "./entity-index.js";
import { normalizeAdversarialVerifier, normalizeReviewDimensions } from "../review-config.js";
import { normalizeGithubLinks } from "../github-links.js";
import { readProjects, readTasks, readWorkflows } from "./entity-repo.js";

// src/lib/entity-models.js
// Entity model layer for AI Memory Hub.
//
// Pure normalization functions + event-store-definition factories for the four
// core entities: task, workflow, project, prompt. Also hosts the quality-gate
// normalization cluster and small shared helpers (uniqueStringList,
// parseProjectListOption, normalizePriority, normalizeDispatchWorktreeMetadata,
// normalizeWorkflowRole, isTaskStatus, isWorkflowStatus, recipe metadata
// normalizers).
//
// This module intentionally has NO dependency on index.js so the module graph
// stays acyclic: it only reaches into cli.js, github-links.js and review-config.js.

export const PROJECT_STATUSES = ["active", "paused", "archived", "planning"];
export const RECIPE_GATE_STRING_ARRAY_FIELDS = ["stopWhen", "allowedActions", "forbiddenActions", "reviewDimensions"];
export const RECIPE_GATE_FIELDS = ["verifyCommands", ...RECIPE_GATE_STRING_ARRAY_FIELDS, "reviewRequired", "maxRepairAttempts", "minimalImplementation", "dependencyBudget", "adversarialVerifier"];

// ---- quality gate normalization cluster ----

export function extractQualityGate(source) {
  const gate = {};
  if (!isPlainObject(source)) {
    return gate;
  }
  if (isPlainObject(source.qualityGate)) {
    Object.assign(gate, source.qualityGate);
  }
  if (isPlainObject(source.gates)) {
    Object.assign(gate, source.gates);
  }
  for (const field of RECIPE_GATE_FIELDS) {
    if (hasOwnField(source, field)) {
      gate[field] = source[field];
    }
  }
  return gate;
}

export function normalizeQualityGate(source) {
  const gate = {};
  const extracted = extractQualityGate(source);
  if (!isPlainObject(extracted)) {
    return gate;
  }
  if (Array.isArray(extracted.verifyCommands)) {
    const verifyCommands = extracted.verifyCommands.map(normalizeVerifyCommand).filter(Boolean);
    if (verifyCommands.length > 0) {
      gate.verifyCommands = verifyCommands;
    }
  }
  for (const field of RECIPE_GATE_STRING_ARRAY_FIELDS) {
    if (Array.isArray(extracted[field])) {
      const values = extracted[field].map((item) => String(item).trim()).filter(Boolean);
      if (values.length > 0) {
        gate[field] = values;
      }
    }
  }
  if (extracted.reviewDimensions !== undefined) {
    const reviewDimensions = normalizeReviewDimensions(extracted.reviewDimensions);
    if (reviewDimensions.length > 0) {
      gate.reviewDimensions = reviewDimensions;
    }
  }
  if (typeof extracted.reviewRequired === "boolean") {
    gate.reviewRequired = extracted.reviewRequired;
  }
  const maxRepairAttempts = normalizeNonNegativeInteger(extracted.maxRepairAttempts);
  if (maxRepairAttempts !== null) {
    gate.maxRepairAttempts = maxRepairAttempts;
  }
  if (isPlainObject(extracted.minimalImplementation)) {
    gate.minimalImplementation = normalizeMinimalImplementation(extracted.minimalImplementation);
  }
  if (isPlainObject(extracted.dependencyBudget)) {
    gate.dependencyBudget = normalizeDependencyBudget(extracted.dependencyBudget);
  }
  if (extracted.adversarialVerifier !== undefined) {
    const adversarialVerifier = normalizeAdversarialVerifier(extracted.adversarialVerifier);
    if (adversarialVerifier.enabled || adversarialVerifier.checks.length > 0) {
      gate.adversarialVerifier = adversarialVerifier;
    }
  }
  return gate;
}

export function normalizeVerifyCommand(value) {
  if (typeof value === "string") {
    const command = value.trim();
    return command ? { command, args: [] } : null;
  }
  if (!isPlainObject(value)) {
    return null;
  }
  const id = String(value.id || "").trim();
  const source = String(value.source || "").trim();
  const command = String(value.command || "").trim();
  if (!id && !source && !command) {
    return null;
  }
  const normalized = {};
  if (id) normalized.id = id;
  if (source) normalized.source = source;
  if (command) normalized.command = command;
  if (Array.isArray(value.args)) {
    normalized.args = value.args.map((arg) => String(arg));
  } else if (command) {
    normalized.args = [];
  }
  if (value.cwd) {
    normalized.cwd = String(value.cwd);
  }
  if (Number.isInteger(value.timeoutMs) && value.timeoutMs > 0) {
    normalized.timeoutMs = value.timeoutMs;
  }
  if (typeof value.required === "boolean") {
    normalized.required = value.required;
  }
  if (value.description) {
    normalized.description = String(value.description);
  }
  return normalized;
}

export function normalizeNonNegativeInteger(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function normalizeMinimalImplementation(source) {
  if (!isPlainObject(source)) {
    return {};
  }
  const normalized = {};
  if (typeof source.enabled === "boolean") {
    normalized.enabled = source.enabled;
  }
  if (Array.isArray(source.principles)) {
    const principles = source.principles.map((item) => String(item).trim()).filter(Boolean);
    if (principles.length > 0) {
      normalized.principles = principles;
    }
  }
  if (Array.isArray(source.forbiddenPatterns)) {
    const patterns = source.forbiddenPatterns.map((item) => String(item).trim()).filter(Boolean);
    if (patterns.length > 0) {
      normalized.forbiddenPatterns = patterns;
    }
  }
  const maxNewFiles = normalizeNonNegativeInteger(source.maxNewFiles);
  if (maxNewFiles !== null) {
    normalized.maxNewFiles = maxNewFiles;
  }
  const maxLinesPerFile = normalizeNonNegativeInteger(source.maxLinesPerFile);
  if (maxLinesPerFile !== null) {
    normalized.maxLinesPerFile = maxLinesPerFile;
  }
  return normalized;
}

export function normalizeDependencyBudget(source) {
  if (!isPlainObject(source)) {
    return {};
  }
  const normalized = {};
  if (typeof source.enabled === "boolean") {
    normalized.enabled = source.enabled;
  }
  const maxNewDependencies = normalizeNonNegativeInteger(source.maxNewDependencies);
  if (maxNewDependencies !== null) {
    normalized.maxNewDependencies = maxNewDependencies;
  }
  const maxTotalSizeMB = normalizeNonNegativeInteger(source.maxTotalSizeMB);
  if (maxTotalSizeMB !== null) {
    normalized.maxTotalSizeMB = maxTotalSizeMB;
  }
  if (Array.isArray(source.allowedScopes)) {
    const scopes = source.allowedScopes.map((item) => String(item).trim()).filter(Boolean);
    if (scopes.length > 0) {
      normalized.allowedScopes = scopes;
    }
  }
  if (Array.isArray(source.forbiddenPackages)) {
    const packages = source.forbiddenPackages.map((item) => String(item).trim()).filter(Boolean);
    if (packages.length > 0) {
      normalized.forbiddenPackages = packages;
    }
  }
  if (typeof source.requireJustification === "boolean") {
    normalized.requireJustification = source.requireJustification;
  }
  return normalized;
}

// ---- shared entity helpers ----

export function normalizePriority(priority) {
  const clean = String(priority || "normal").toLowerCase();
  return ["low", "normal", "high", "urgent"].includes(clean) ? clean : "normal";
}

export function normalizeDispatchWorktreeMetadata(worktree) {
  if (!isPlainObject(worktree)) {
    return null;
  }
  return {
    enabled: Boolean(worktree.enabled),
    repoRoot: worktree.repoRoot || "",
    root: worktree.root || "",
    path: worktree.path || "",
    branch: worktree.branch || "",
    base: worktree.base || "",
    head: worktree.head || "",
    reused: Boolean(worktree.reused),
    createdAt: worktree.createdAt || "",
    diffStatus: worktree.diffStatus || "",
    diffStat: worktree.diffStat || "",
    hasChanges: Boolean(worktree.hasChanges)
  };
}

export function normalizeWorkflowRole(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function parseProjectListOption(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function uniqueStringList(value) {
  const values = Array.isArray(value) ? value : parseProjectListOption(value);
  const seen = new Set();
  const output = [];
  for (const item of values) {
    const text = String(item || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(text);
  }
  return output;
}

export function isTaskStatus(status) {
  return new Set(["open", "claimed", "in_progress", "blocked", "needs_verification", "done", "cancelled"]).has(status);
}

export function isWorkflowStatus(status) {
  return new Set(["open", "planned", "in_progress", "review", "blocked", "done", "cancelled"]).has(status);
}

export function normalizeRecipeMetadata(recipe) {
  const normalized = {
    name: String(recipe.name || ""),
    title: String(recipe.title || ""),
    version: String(recipe.version || "")
  };
  if (isPlainObject(recipe.variables)) {
    normalized.variables = Object.fromEntries(
      Object.entries(recipe.variables)
        .map(([key, value]) => [String(key), String(value)])
        .filter(([key]) => key)
    );
  }
  if (Number.isInteger(recipe.steps)) {
    normalized.steps = recipe.steps;
  }
  return normalized;
}

export function normalizeRecipeStepMetadata(step) {
  return {
    id: String(step.id || ""),
    role: String(step.role || ""),
    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map((item) => String(item)).filter(Boolean) : [],
    workflowId: String(step.workflowId || "")
  };
}

// ---- project ----

export function normalizeProjectStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!PROJECT_STATUSES.includes(value)) {
    throw new Error(`Invalid project status: ${status}. Expected ${PROJECT_STATUSES.join("|")}.`);
  }
  return value;
}

export function normalizeProjectResources(resources) {
  if (!isPlainObject(resources)) {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(resources)) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) {
      continue;
    }
    if (Array.isArray(value)) {
      const values = value.map((item) => String(item || "").trim()).filter(Boolean);
      if (values.length > 0) {
        normalized[cleanKey] = values;
      }
      continue;
    }
    if (isPlainObject(value)) {
      normalized[cleanKey] = value;
      continue;
    }
    const text = String(value || "").trim();
    if (text) {
      normalized[cleanKey] = text;
    }
  }
  return normalized;
}

export function normalizeProject(project) {
  const now = new Date().toISOString();
  const id = String(project.id || project.project || project.key || "").trim();
  const name = String(project.name || project.displayName || id || "").trim();
  const status = normalizeProjectStatus(project.status || "active");
  const normalized = {
    id,
    name,
    displayName: String(project.displayName || project.display_name || name || id).trim(),
    status,
    type: String(project.type || "").trim(),
    description: String(project.description || project.text || "").trim(),
    metadata: isPlainObject(project.metadata) ? { ...project.metadata } : {},
    aliases: uniqueStringList(project.aliases),
    resources: normalizeProjectResources(project.resources),
    createdAt: project.createdAt || project.ts || now,
    updatedAt: project.updatedAt || project.createdAt || project.ts || now
  };
  for (const key of ["archivedAt", "archivedBy"]) {
    if (project[key]) {
      normalized[key] = String(project[key]);
    }
  }
  return normalized;
}

// ---- workflow ----

export function normalizeWorkflow(workflow) {
  const now = new Date().toISOString();
  const status = isWorkflowStatus(workflow.status) ? workflow.status : "open";
  const normalized = {
    id: workflow.id || createId(`workflow:${workflow.title || JSON.stringify(workflow)}`),
    createdAt: workflow.createdAt || workflow.ts || now,
    updatedAt: workflow.updatedAt || workflow.createdAt || workflow.ts || now,
    completedAt: workflow.completedAt || "",
    createdBy: workflow.createdBy || workflow.created_by || workflow.source || "unknown",
    status,
    priority: normalizePriority(workflow.priority || "normal"),
    project: workflow.project || "",
    title: workflow.title || workflow.text || "",
    planner: normalizeWorkflowRole(workflow.planner),
    executor: normalizeWorkflowRole(workflow.executor),
    reviewer: normalizeWorkflowRole(workflow.reviewer),
    observer: normalizeWorkflowRole(workflow.observer),
    plan: workflow.plan || "",
    acceptance: workflow.acceptance || "",
    qualityGate: normalizeQualityGate(workflow),
    risks: Array.isArray(workflow.risks) ? workflow.risks : [],
    results: Array.isArray(workflow.results) ? workflow.results : [],
    reviews: Array.isArray(workflow.reviews) ? workflow.reviews : [],
    linkedTasks: Array.isArray(workflow.linkedTasks) ? workflow.linkedTasks : [],
    linkedRadio: Array.isArray(workflow.linkedRadio) ? workflow.linkedRadio : [],
    deliveryState: workflow.deliveryState || "",
    deliveryUpdatedAt: workflow.deliveryUpdatedAt || "",
    dispatchId: workflow.dispatchId || "",
    threadKey: workflow.threadKey || "",
    gateId: workflow.gateId || "",
    attempt: Number(workflow.attempt || 0),
    maxRetries: Number(workflow.maxRetries || 0),
    nextRetryAt: workflow.nextRetryAt || "",
    sessionId: workflow.sessionId || "",
    lastError: workflow.lastError || "",
    progressPercent: workflow.progressPercent ?? null,
    progressStatus: workflow.progressStatus || "",
    progressAt: workflow.progressAt || "",
    progressBy: workflow.progressBy || "",
    responseRadioId: workflow.responseRadioId || "",
    statusRadioId: workflow.statusRadioId || "",
    dispatchReportPath: workflow.dispatchReportPath || "",
    worktree: normalizeDispatchWorktreeMetadata(workflow.worktree),
    notes: Array.isArray(workflow.notes) ? workflow.notes : [],
    usesDerivedStatus: Boolean(workflow.usesDerivedStatus),
    derivedStatus: workflow.derivedStatus || ""
  };
  const githubLinks = normalizeGithubLinks(workflow.githubLinks || workflow);
  if (Object.keys(githubLinks).length > 0) normalized.githubLinks = githubLinks;
  if (isPlainObject(workflow.recipe)) {
    normalized.recipe = normalizeRecipeMetadata(workflow.recipe);
  }
  return normalized;
}

// ---- task ----

export function normalizeTask(task) {
  const now = new Date().toISOString();
  const status = isTaskStatus(task.status) ? task.status : "open";
  const normalized = {
    id: task.id || createId(`task:${task.title || JSON.stringify(task)}`),
    createdAt: task.createdAt || task.ts || now,
    updatedAt: task.updatedAt || task.createdAt || task.ts || now,
    completedAt: task.completedAt || "",
    createdBy: task.createdBy || task.created_by || task.source || "unknown",
    assignee: task.assignee || "",
    claimedAt: task.claimedAt || "",
    claimExpiresAt: task.claimExpiresAt || "",
    lastAssignee: task.lastAssignee || "",
    status,
    priority: normalizePriority(task.priority || "normal"),
    project: task.project || "",
    title: task.title || task.text || "",
    description: task.description || "",
    handoff: task.handoff || "",
    qualityGate: normalizeQualityGate(task),
    deliveryState: task.deliveryState || "",
    deliveryUpdatedAt: task.deliveryUpdatedAt || "",
    dispatchId: task.dispatchId || "",
    threadKey: task.threadKey || "",
    gateId: task.gateId || "",
    attempt: Number(task.attempt || 0),
    maxRetries: Number(task.maxRetries || 0),
    nextRetryAt: task.nextRetryAt || "",
    sessionId: task.sessionId || "",
    lastError: task.lastError || "",
    progressPercent: task.progressPercent ?? null,
    progressStatus: task.progressStatus || "",
    progressAt: task.progressAt || "",
    progressBy: task.progressBy || "",
    reviewStatus: task.reviewStatus || "",
    reviewedAt: task.reviewedAt || "",
    reviewedBy: task.reviewedBy || "",
    reviewNote: task.reviewNote || "",
    responseRadioId: task.responseRadioId || "",
    statusRadioId: task.statusRadioId || "",
    dispatchReportPath: task.dispatchReportPath || "",
    worktree: normalizeDispatchWorktreeMetadata(task.worktree),
    notes: Array.isArray(task.notes) ? task.notes.map((note) => ({
      ts: note.ts || note.createdAt || now,
      by: note.by || note.source || "unknown",
      text: String(note.text || "")
    })).filter((note) => note.text) : []
  };
  const githubLinks = normalizeGithubLinks(task.githubLinks || task);
  if (Object.keys(githubLinks).length > 0) normalized.githubLinks = githubLinks;
  if (isPlainObject(task.recipe)) {
    normalized.recipe = normalizeRecipeMetadata(task.recipe);
  }
  if (isPlainObject(task.recipeStep)) {
    normalized.recipeStep = normalizeRecipeStepMetadata(task.recipeStep);
  }
  // OPC v1.1: preserve custom fields
  if (isPlainObject(task.budget)) {
    normalized.budget = task.budget;
  }
  if (task.failType) normalized.failType = task.failType;
  if (task.failCount) normalized.failCount = task.failCount;
  if (task.lastFailAt) normalized.lastFailAt = task.lastFailAt;
  if (Array.isArray(task.evaluationSignals)) {
    normalized.evaluationSignals = task.evaluationSignals;
  }
  return normalized;
}

// ---- prompt ----

export function normalizePrompt(prompt) {
  const now = new Date().toISOString();
  return {
    id: prompt.id || createId(`prompt:${prompt.name || JSON.stringify(prompt)}`),
    createdAt: prompt.createdAt || prompt.ts || now,
    updatedAt: prompt.updatedAt || prompt.createdAt || prompt.ts || now,
    createdBy: prompt.createdBy || "unknown",
    name: prompt.name || "",
    type: prompt.type || "general",
    description: prompt.description || "",
    content: prompt.content || "",
    variables: Array.isArray(prompt.variables) ? prompt.variables : [],
    version: Number(prompt.version || 1)
  };
}

// ---- event-store definitions ----

export function getTaskEventStoreDefinition() {
  return {
    entity: "task",
    dirName: "tasks",
    projectionName: "tasks.jsonl",
    normalize: normalizeTask,
    isValid: (task) => task.id && task.title
  };
}

export function getProjectEventStoreDefinition() {
  return {
    entity: "project",
    dirName: "projects",
    projectionName: "projects.jsonl",
    normalize: normalizeProject,
    isValid: (project) => project.id && project.name
  };
}

export function getWorkflowEventStoreDefinition() {
  return {
    entity: "workflow",
    dirName: "workflows",
    projectionName: "workflows.jsonl",
    normalize: normalizeWorkflow,
    isValid: (workflow) => workflow.id && workflow.title
  };
}

export function getPromptEventStoreDefinition() {
  return {
    entity: "prompt",
    dirName: "prompts",
    projectionName: "templates.jsonl",
    normalize: normalizePrompt,
    isValid: (prompt) => prompt.id && prompt.name
  };
}

export function rebuildEventSourcedProjections(memoryDir) {
  bootstrapEntityEventsFromProjection(memoryDir, getTaskEventStoreDefinition());
  bootstrapEntityEventsFromProjection(memoryDir, getProjectEventStoreDefinition());
  bootstrapEntityEventsFromProjection(memoryDir, getWorkflowEventStoreDefinition());
  const tasks = materializeEntityProjection(memoryDir, getTaskEventStoreDefinition());
  const projects = materializeEntityProjection(memoryDir, getProjectEventStoreDefinition());
  const workflows = materializeEntityProjection(memoryDir, getWorkflowEventStoreDefinition());
  return {
    tasks: tasks.length,
    projects: projects.length,
    workflows: workflows.length
  };
}

export function updateProject(memoryDir, id, updater) {
  const projects = readProjects(memoryDir);
  const index = findProjectIndex(projects, id);
  if (index === -1) {
    throw new Error(`Project not found: ${id}`);
  }
  const updated = normalizeProject({
    ...updater(projects[index]),
    updatedAt: new Date().toISOString()
  });
  return appendEntityRecord(memoryDir, getProjectEventStoreDefinition(), updated, {
    reason: "project:update"
  });
}

export function updateWorkflow(memoryDir, id, updater) {
  const workflows = readWorkflows(memoryDir);
  const index = findWorkflowIndex(workflows, id);
  if (index === -1) {
    throw new Error(`Workflow not found: ${id}`);
  }
  const updated = normalizeWorkflow(updater(workflows[index]));
  return appendEntityRecord(memoryDir, getWorkflowEventStoreDefinition(), updated, {
    reason: "workflow:update"
  });
}

export function updateTask(memoryDir, id, updater) {
  const tasks = readTasks(memoryDir);
  const index = findTaskIndex(tasks, id);
  if (index === -1) {
    throw new Error(`Task not found: ${id}`);
  }
  const updated = normalizeTask(updater(tasks[index]));
  return appendEntityRecord(memoryDir, getTaskEventStoreDefinition(), updated, {
    reason: "task:update"
  });
}

export function assertTaskStatus(status) {
  if (!isTaskStatus(status)) {
    throw new Error(`Invalid task status: ${status}`);
  }
}

export function assertWorkflowStatus(status) {
  if (!isWorkflowStatus(status)) {
    throw new Error(`Invalid workflow status: ${status}`);
  }
}

export function mergeQualityGates(...sources) {
  const merged = {};
  for (const source of sources) {
    Object.assign(merged, normalizeQualityGate(source));
  }
  return merged;
}

export function getSeedProjects() {
  return [
    {
      id: "ai-memory-hub",
      name: "AI Memory Hub",
      displayName: "AI Memory Hub",
      status: "active",
      type: "tool",
      description: "本地优先的多AI工具共享记忆中心",
      metadata: {},
      aliases: [],
      resources: {
        repo: "https://github.com/<owner>/ai-memory-hub"
      },
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-11T12:00:00Z"
    }
  ].map(normalizeProject);
}

export function mergeSeedProjects(projects) {
  const merged = [...projects];
  for (const seed of getSeedProjects()) {
    const identities = uniqueStringList([seed.id, seed.name, seed.displayName, ...(seed.aliases || [])]);
    const exists = identities.some((identity) => findProjectIndex(merged, identity) !== -1);
    if (!exists) {
      merged.push(seed);
    }
  }
  return merged;
}
