// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import { getRelayTimeoutBaseMs } from "./util.js";
import { findRecipeStepTask } from "./dispatch.js";

export const POLICY_OPERATIONS = [
  "read-memory", "write-memory", "send-radio", "claim-task", "dispatch",
  "modify-files", "run-tests", "install-dependencies", "push", "delete",
  "purge", "archive"
];

export const APP_NAME = "ai-memory-hub";

export const DEFAULT_DISPATCH_ACK_TIMEOUT_MS = 5 * 60 * 1000;

export const ASYNC_CALL_STATES = {
  PENDING: "pending",
  DISPATCHED: "dispatched",
  ACKED: "acked",
  PROGRESS: "progress",
  RETRYING: "retrying",
  FAILED: "failed",
  COMPLETED: "completed",
  ABANDONED: "abandoned"
};
export const MODEL_CACHE_STALE_MS = 24 * 60 * 60 * 1000;

export function summarizeWorkflowLinkedTaskDelivery(workflow, tasks, patch = {}) {
  const linkedTasks = (workflow.linkedTasks || [])
    .map((id) => tasks.find((task) => task.id === id))
    .filter(Boolean);
  if (linkedTasks.length === 0) {
    return {
      deliveryState: patch.deliveryState || workflow.deliveryState || "",
      progressPercent: workflow.progressPercent ?? null,
      progressStatus: workflow.progressStatus || "",
      progressAt: workflow.progressAt || "",
      progressBy: workflow.progressBy || "",
      lastError: patch.lastError || workflow.lastError || "",
      nextRetryAt: patch.nextRetryAt || workflow.nextRetryAt || ""
    };
  }

  const states = linkedTasks.map((task) => task.deliveryState || "").filter(Boolean);
  const completedCount = linkedTasks.filter((task) => task.status === "done" || task.deliveryState === ASYNC_CALL_STATES.COMPLETED).length;
  const failedTask = linkedTasks.find((task) => [ASYNC_CALL_STATES.ABANDONED, ASYNC_CALL_STATES.FAILED].includes(task.deliveryState));
  const statePriority = [
    ASYNC_CALL_STATES.ABANDONED,
    ASYNC_CALL_STATES.FAILED,
    ASYNC_CALL_STATES.RETRYING,
    ASYNC_CALL_STATES.PROGRESS,
    ASYNC_CALL_STATES.ACKED,
    ASYNC_CALL_STATES.DISPATCHED
  ];
  let deliveryState = statePriority.find((state) => states.includes(state)) || "";
  if (!deliveryState && completedCount === linkedTasks.length) {
    deliveryState = ASYNC_CALL_STATES.COMPLETED;
  } else if (!deliveryState && completedCount > 0) {
    deliveryState = ASYNC_CALL_STATES.PROGRESS;
  } else if (!deliveryState) {
    deliveryState = patch.deliveryState || workflow.deliveryState || "";
  }

  return {
    deliveryState,
    progressPercent: Math.round((completedCount / linkedTasks.length) * 100),
    progressStatus: `${completedCount}/${linkedTasks.length} linked tasks completed`,
    progressAt: patch.progressAt || new Date().toISOString(),
    progressBy: patch.progressBy || patch.tool || "",
    lastError: failedTask?.lastError || patch.lastError || "",
    nextRetryAt: linkedTasks
      .map((task) => task.nextRetryAt || "")
      .filter(Boolean)
      .sort()[0] || patch.nextRetryAt || ""
  };
}

export function isDispatchSourceComplete(source) {
  const status = String(source?.status || "").toLowerCase();
  const deliveryState = String(source?.deliveryState || "").toLowerCase();
  return status === "done" || deliveryState === ASYNC_CALL_STATES.COMPLETED;
}

export function isValidAsyncCallState(state) {
  return Object.values(ASYNC_CALL_STATES).includes(state);
}

export function isRelayTimedOut(entry, now = Date.now()) {
  if (!entry || ![
    ASYNC_CALL_STATES.DISPATCHED,
    ASYNC_CALL_STATES.ACKED,
    ASYNC_CALL_STATES.PROGRESS,
    ASYNC_CALL_STATES.RETRYING
  ].includes(entry.state || "")) {
    return false;
  }
  const timeoutMs = Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS);
  if (timeoutMs <= 0) {
    return false;
  }
  const baseMs = getRelayTimeoutBaseMs(entry);
  return Number.isFinite(baseMs) && baseMs + timeoutMs <= now;
}

export function isRelayRetryCandidate(entry, now = Date.now()) {
  if (!entry) {
    return false;
  }
  // Phase 2: approval-required is retryable once gate is approved
  if (entry.state === "approval-required") {
    return true;
  }
  if (entry.state === ASYNC_CALL_STATES.FAILED) {
    if (!entry.nextRetryAt) {
      return false;
    }
    const nextRetryMs = Date.parse(entry.nextRetryAt);
    return !Number.isNaN(nextRetryMs) && nextRetryMs <= now;
  }
  return isRelayTimedOut(entry, now);
}

export function areTaskRecipeDependenciesSatisfied(task, allTasks = []) {
  const deps = Array.isArray(task?.recipeStep?.dependsOn) ? task.recipeStep.dependsOn : [];
  if (deps.length === 0) {
    return true;
  }
  return deps.every((depId) => {
    const dependency = findRecipeStepTask(allTasks, task, depId);
    return Boolean(dependency && isDispatchSourceComplete(dependency));
  });
}

// Unified async call state machine — allowed state transitions.
// Keys are the source (from) states; values are the target states reachable from it.
export const ASYNC_CALL_TRANSITIONS = {
  "pending": ["dispatched"],
  "dispatched": ["acked", "progress", "failed", "completed"],
  "acked": ["progress", "completed", "failed"],
  "progress": ["progress", "acked", "completed", "failed"],
  "retrying": ["dispatched", "progress", "failed", "abandoned"],
  "failed": ["retrying", "abandoned"],
  "completed": [],
  "abandoned": []
};

export function isValidAsyncCallTransition(fromState, toState) {
  if (!isValidAsyncCallState(fromState) || !isValidAsyncCallState(toState)) {
    return false;
  }
  const allowedTransitions = ASYNC_CALL_TRANSITIONS[fromState] || [];
  return allowedTransitions.includes(toState);
}
