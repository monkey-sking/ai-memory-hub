// Relay-status write-side state machine (P0: dispatch relay delivery status) —
// sunk from src/index.js in v3.0 refactor P0-2.
//
// Pure self-contained cluster: owns the write-side functions that persist async
// dispatch/relay progress and echo status/response messages back to the origin
// source (radio/task/workflow). Consumed by the dispatch orchestration cluster
// (executeDispatch / executeDispatchRetry / processDispatchJobResult /
// markTimedOutRelayStatuses / prepareDispatchJobForRun via applyDispatchOutcome)
// and by the `dispatch` command (via dispatchCommandDeps injection).
//
// Dependencies: node built-in (path) + already-sunk lib (constants ASYNC_CALL_STATES,
// cli createId, dispatch getDispatchThreadKey, dispatch-retry
// normalizeDispatchRetryLimit, entity-factory createRadioMessage, format trimOutput/
// summarizeText, radio-messages read/updateRadioMessage, entity-models updateTask/
// updateWorkflow, entity-repo readTasks/readWorkflows/syncLinkedWorkflowDeliveryState,
// event-writer appendJsonl). No index.js-internal symbols → direct import, no init
// injection.
import path from "node:path";
import { ASYNC_CALL_STATES } from "./constants.js";
import { createId } from "./cli.js";
import { getDispatchThreadKey } from "./dispatch.js";
import { normalizeDispatchRetryLimit } from "./dispatch-retry.js";
import { createRadioMessage } from "./entity-factory.js";
import { trimOutput, summarizeText } from "./format.js";
import { readRadioMessages, updateRadioMessage } from "./radio-messages.js";
import { updateTask, updateWorkflow } from "./entity-models.js";
import { readTasks, readWorkflows, syncLinkedWorkflowDeliveryState } from "./entity-repo.js";
import { appendJsonl } from "../event-writer.js";

// Write a relay-status.jsonl progress entry for a dispatched job.
export function appendRelayStatus(memoryDir, job, patch = {}) {
  const now = new Date().toISOString();
  const nextState = patch.state || ASYNC_CALL_STATES.PENDING;

  appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
    id: createId(`relay:${job.id}:${now}:${nextState}`),
    ts: now,
    threadKey: getDispatchThreadKey(job),
    sourceKind: job.kind,
    sourceId: job.refId,
    dispatchId: job.id,
    state: nextState,
    attempt: Number(patch.attempt || 1),
    maxRetries: normalizeDispatchRetryLimit(patch.maxRetries),
    dispatchedAt: patch.state === ASYNC_CALL_STATES.DISPATCHED ? now : "",
    ackTimeout: Number(patch.ackTimeout || 0),
    sessionId: patch.sessionId || "",
    exitCode: patch.exitCode ?? null,
    lastError: String(patch.lastError || "").trim(),
    progressPercent: patch.progressPercent ?? null,
    progressStatus: String(patch.progressStatus || "").trim(),
    progressAt: patch.progressAt || "",
    progressBy: patch.progressBy || "",
    nextRetryAt: patch.nextRetryAt || "",
    worktree: patch.worktree || null,
    fingerprint: patch.fingerprint || "",
    oscillating: patch.oscillating === true,
    project: job.project || "",
    tool: job.tool || "",
    thread: job.thread || "",
    gateId: patch.gateId || ""
  });
}

// Find the origin source record (radio message / task / workflow) a dispatched job
// belongs to, so status/response messages can be routed back to it.
export function findDispatchOrigin(memoryDir, job) {
  if (job.kind === "radio") {
    return readRadioMessages(memoryDir).find((message) => message.id === job.refId) || null;
  }
  if (job.kind === "task") {
    const task = readTasks(memoryDir).find((item) => item.id === job.refId);
    if (!task) {
      return null;
    }
    return {
      id: task.id,
      from: task.createdBy,
      thread: task.id,
      project: task.project
    };
  }
  if (job.kind === "workflow") {
    const workflow = readWorkflows(memoryDir).find((item) => item.id === job.refId);
    if (!workflow) {
      return null;
    }
    return {
      id: workflow.id,
      from: workflow.createdBy,
      thread: workflow.id,
      project: workflow.project
    };
  }
  return null;
}

// Echo a "response" radio message back to the origin source with the dispatched
// tool's stdout, if the origin is a live radio thread and there is output to send.
export function appendDispatchResponseMessage(memoryDir, job, result) {
  const origin = findDispatchOrigin(memoryDir, job);
  if (!origin?.from || !result.stdout) {
    return null;
  }
  const message = createRadioMessage({
    from: job.tool || "unknown",
    to: origin.from,
    type: "response",
    text: trimOutput(result.stdout),
    thread: origin.thread || job.thread || job.refId,
    replyTo: origin.id || job.refId,
    project: origin.project || job.project || ""
  });
  appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), message);
  return message;
}

// Echo a "status" radio message back to the origin source summarizing how the
// dispatch finished (completed / failed / state) for the origin tool owner.
export function appendDispatchStatusMessage(memoryDir, job, result) {
  const origin = findDispatchOrigin(memoryDir, job);
  if (!origin?.from) {
    return null;
  }
  const state = result.relayState || (result.exitCode === 0 ? "completed" : "failed");
  const parts = [
    `Dispatch ${state} for ${job.tool}`,
    `thread=${job.thread || job.refId}`
  ];
  if (result.sessionId) {
    parts.push(`session=${result.sessionId}`);
  }
  if (result.exitCode !== null && result.exitCode !== undefined) {
    parts.push(`exit=${result.exitCode}`);
  }
  if (result.error) {
    parts.push(`error=${summarizeText(result.error, 120)}`);
  }
  const message = createRadioMessage({
    from: "ai-memory-hub",
    to: origin.from,
    type: "status",
    text: parts.join(" | "),
    thread: origin.thread || job.thread || job.refId,
    replyTo: origin.id || job.refId,
    project: origin.project || job.project || ""
  });
  appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), message);
  return message;
}

// Push delivery-state progress back onto the origin source record (radio message /
// task / workflow), kept in sync with the relay-status.jsonl write side.
export function updateDispatchSourceState(memoryDir, job, patch) {
  if (!job || !job.refId) {
    return;
  }
  const statePatch = {
    deliveryState: patch.deliveryState || "",
    deliveryUpdatedAt: new Date().toISOString(),
    dispatchId: patch.dispatchId || "",
    threadKey: patch.threadKey || "",
    attempt: Number(patch.attempt || 0),
    maxRetries: Number(patch.maxRetries || 0),
    nextRetryAt: patch.nextRetryAt || "",
    sessionId: patch.sessionId || "",
    lastError: String(patch.lastError || "").trim(),
    progressPercent: patch.progressPercent ?? null,
    progressStatus: patch.progressStatus || "",
    progressAt: patch.progressAt || "",
    progressBy: patch.progressBy || "",
    worktree: patch.worktree || null,
    gateId: patch.gateId || ""
  };
  if (job.kind === "radio") {
    updateRadioMessage(memoryDir, job.refId, statePatch);
    return;
  }
  if (job.kind === "task") {
    const updatedTask = updateTask(memoryDir, job.refId, (task) => ({
      ...task,
      ...statePatch,
      updatedAt: new Date().toISOString()
    }));
    syncLinkedWorkflowDeliveryState(memoryDir, updatedTask, statePatch);
    return;
  }
  if (job.kind === "workflow") {
    updateWorkflow(memoryDir, job.refId, (workflow) => ({
      ...workflow,
      ...statePatch,
      updatedAt: new Date().toISOString()
    }));
  }
}
