// Dispatch orchestration layer (P0: job build → run → result → retry → timeout)
// — sunk from src/index.js in v3.0 refactor P0-2.
//
// Owns the whole dispatch orchestration pipeline above the single-job execution
// layer (src/lib/dispatch-run.js): building dispatch jobs from radio/task/workflow
// sources, preparing each job for a run, running them sequentially or through the
// bounded pool, applying outcomes (relay status + radio response/status echo +
// dispatch log + research reports), and the retry / timeout sweeps.
//
// Sunk as one piece because these 11 functions form a single connected cluster —
// they only reference each other plus already-sunk lib symbols, so splitting them
// would force index.js to re-import and re-wire the same call graph. After the
// relay-status write side (batch 29) and the policy layer (batch 28) landed, this
// cluster no longer depends on any index.js-internal symbol → direct import, no
// init injection.
//
// Two cluster-private constants moved along with it (only referenced inside):
// RESEARCH_REPORTS_DIR and DISPATCH_OSCILLATION_THRESHOLD.
import path from "node:path";
import { ASYNC_CALL_STATES, DEFAULT_DISPATCH_ACK_TIMEOUT_MS, isRelayTimedOut, isRelayRetryCandidate, areTaskRecipeDependenciesSatisfied } from "./constants.js";
import { ensureDir } from "./cli.js";
import { summarizeText } from "./format.js";
import { readDiscoveredModels } from "./tools-detect.js";
import { dispatchJobFromTask, dispatchJobFromWorkflow, dispatchJobFromRelayEntry, shouldDispatchJob, isClosedDispatchSourceState, isDirectDispatchRadioMessage, normalizeToolName, getDispatchThreadKey, getDispatchSourceKey, nextRelayAttempt, shouldPersistDispatchReport } from "./dispatch.js";
import { computeNextRetryAt, getDispatchJobMaxRetries, getRelayFailureState, isRelayRetryRunnable, shouldRetryJob } from "./dispatch-retry.js";
import { runDispatchJob } from "./dispatch-run.js";
import { runDispatchPool } from "./dispatch-pool.js";
import { resolvePermission } from "./policy.js";
import { appendRelayStatus, appendDispatchResponseMessage, appendDispatchStatusMessage, updateDispatchSourceState } from "./relay-status.js";
import { readRadioMessages } from "./radio-messages.js";
import { readTasks, readWorkflows, syncLinkedWorkflowDeliveryState, isRadioLinkedToClosedSource } from "./entity-repo.js";
import { updateTask, normalizeDispatchWorktreeMetadata } from "./entity-models.js";
import { relayFailureFingerprint } from "./entity-factory.js";
import { createTaskNote } from "./entity-index.js";
import { getToolRunner } from "./runner-core.js";
import { resolveAgentTarget } from "../agent-wake.js";
import { writeFileAtomic } from "../atomic-write.js";
import { appendApprovalGateEvent, appendDispatchLog, countRecentRelayOscillation, readApprovalGates, readDispatchLog, readLatestRelayStatusBySource, readToolDeclarationByTool } from "./io.js";

const RESEARCH_REPORTS_DIR = "research-reports";
// Oscillation: N consecutive failed attempts with an identical (exitCode, error)
// fingerprint mean the loop is stuck repeating the same call for the same result.
// Abandon early instead of burning the full retry budget on a deterministic failure.
const DISPATCH_OSCILLATION_THRESHOLD = 2;

function prepareDispatchJobForRun(memoryDir, job, relayState, { model, run, isolateWorktree, worktreeRoot }) {
  if (model) {
    job.model = model;
    const declared = readToolDeclarationByTool(memoryDir, job.tool)?.models || [];
    const discovered = readDiscoveredModels(memoryDir, job.tool);
    const knownModels = [...new Set([...declared, ...discovered])];
    if (knownModels.length > 0 && !knownModels.includes(model) && !knownModels.some((known) => known.endsWith(`/${model}`) || known.endsWith(`:${model}`))) {
      job.modelNote = `Requested model "${model}" is not in ${job.tool}'s declared/discovered list. Available: ${knownModels.length} model(s). Use "ai-memory-hub models --to ${job.tool} --refresh" to refresh from the provider.`;
    }
  }
  const runner = getToolRunner(job.tool);
  if (!runner.available) {
    const result = { ...job, runnable: false, reason: runner.reason };
    if (run && !runner.sharedStateOnly) {
      const attempt = nextRelayAttempt(relayState, job);
      const maxRetries = getDispatchJobMaxRetries(job);
      const state = getRelayFailureState(attempt, maxRetries);
      appendRelayStatus(memoryDir, job, {
        state, attempt, maxRetries, exitCode: null, lastError: runner.reason,
        sessionId: "", ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        nextRetryAt: computeNextRetryAt(attempt, maxRetries)
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: state, dispatchId: job.id, threadKey: getDispatchThreadKey(job),
        attempt, maxRetries, nextRetryAt: computeNextRetryAt(attempt, maxRetries),
        sessionId: "", lastError: runner.reason
      });
      const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: state });
      appendDispatchLog(memoryDir, result);
      applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, state, { statusMessage });
    }
    return { skip: result };
  }
  if (!run) {
    const sourceKey = getDispatchSourceKey(job);
    return { skip: {
      ...job, runnable: true, dryRun: true, command: runner.preview,
      relayState: relayState[sourceKey]?.state || "pending",
      attempt: relayState[sourceKey]?.attempt || 0
    }};
  }
  const attempt = nextRelayAttempt(relayState, job);
  const maxRetries = getDispatchJobMaxRetries(job);
  const permission = resolvePermission(memoryDir, {
    actor: job.tool, actorRoles: job.roles || [],
    project: job.project || "*", operation: "dispatch", scope: "all"
  });
  if (permission.decision === "deny") {
    const result = {
      ...job, runnable: false,
      reason: `Permission denied: ${permission.reason}`,
      exitCode: 403,
      error: `Policy layer blocked dispatch: ${permission.reason}`
    };
    appendRelayStatus(memoryDir, job, {
      state: "failed-permanent", attempt, maxRetries, exitCode: 403,
      lastError: result.error, sessionId: "", ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "failed-permanent", dispatchId: job.id, threadKey: getDispatchThreadKey(job),
      attempt, maxRetries, nextRetryAt: "", sessionId: "", lastError: result.error
    });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "failed-permanent" });
    appendDispatchLog(memoryDir, result);
    applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "failed-permanent", { statusMessage });
    return { skip: result };
  }
  if (permission.decision === "ask") {
    const gate = appendApprovalGateEvent(memoryDir, {
      status: "requested", actor: job.tool, scope: "dispatch", operation: "dispatch",
      refId: job.id, refType: "dispatch-job", reason: permission.reason,
      reviewer: "human", project: job.project || ""
    });
    const result = {
      ...job, runnable: false,
      reason: `Approval required: ${permission.reason}`,
      exitCode: 451,
      error: `Policy requires approval (gate ${gate.gateId}): ${permission.reason}`,
      gateId: gate.gateId
    };
    appendRelayStatus(memoryDir, job, {
      state: "approval-required", attempt, maxRetries, exitCode: 451,
      lastError: result.error, sessionId: "", ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      gateId: gate.gateId
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "approval-required", dispatchId: job.id, threadKey: getDispatchThreadKey(job),
      attempt, maxRetries, nextRetryAt: "", sessionId: "",
      lastError: result.error, gateId: gate.gateId
    });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "approval-required" });
    appendDispatchLog(memoryDir, result);
    applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "approval-required", { statusMessage });
    return { skip: result };
  }
  // permission.decision === "allow" → mark dispatched, prepare for run
  appendRelayStatus(memoryDir, job, {
    state: "dispatched", attempt, maxRetries, exitCode: null,
    lastError: "", sessionId: "", ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS
  });
  updateDispatchSourceState(memoryDir, job, {
    deliveryState: "dispatched", dispatchId: job.id, threadKey: getDispatchThreadKey(job),
    attempt, maxRetries, nextRetryAt: "", sessionId: "", lastError: ""
  });
  return { job, runner, attempt, maxRetries, options: { isolateWorktree, worktreeRoot } };
}

// processDispatchJobResult: does everything AFTER the runner subprocess finishes.
// Handles relay status updates, radio messages, dispatch log, and outcome application.

function processDispatchJobResult(memoryDir, job, result, { attempt, maxRetries }) {
  if (result.exitCode === 0) {
    appendRelayStatus(memoryDir, job, {
      state: "acked", attempt, maxRetries, exitCode: 0,
      lastError: "", sessionId: result.sessionId || "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS, nextRetryAt: "",
      worktree: result.worktree || null
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "acked", dispatchId: job.id, threadKey: getDispatchThreadKey(job),
      attempt, maxRetries, nextRetryAt: "", sessionId: result.sessionId || "",
      lastError: "", worktree: result.worktree || null
    });
  }
  const finalState = result.exitCode === 0 ? "completed" : getRelayFailureState(attempt, maxRetries);
  const nextRetryAt = result.exitCode === 0 ? "" : computeNextRetryAt(attempt, maxRetries);
  const lastError = result.exitCode === 0 ? "" : (result.error || result.stderr || "");
  const fingerprint = result.exitCode === 0 ? "" : relayFailureFingerprint(result.exitCode, lastError);
  let resolvedState = finalState;
  let oscillating = false;
  if (result.exitCode !== 0) {
    const osc = getRelayFailureStateWithOscillation(memoryDir, job, attempt, maxRetries, fingerprint);
    resolvedState = osc.state;
    oscillating = osc.oscillating;
  }
  const resolvedNextRetryAt = resolvedState === "abandoned" ? "" : nextRetryAt;
  appendRelayStatus(memoryDir, job, {
    state: resolvedState, attempt, maxRetries, exitCode: result.exitCode,
    lastError, sessionId: result.sessionId || "",
    ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS, nextRetryAt: resolvedNextRetryAt,
    worktree: result.worktree || null, fingerprint, oscillating
  });
  updateDispatchSourceState(memoryDir, job, {
    deliveryState: resolvedState, dispatchId: job.id, threadKey: getDispatchThreadKey(job),
    attempt, maxRetries, nextRetryAt: resolvedNextRetryAt,
    sessionId: result.sessionId || "", lastError, worktree: result.worktree || null
  });
  const responseMessage = appendDispatchResponseMessage(memoryDir, job, { ...result, relayState: resolvedState });
  const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: resolvedState, oscillating });
  const enrichedResult = {
    ...result, relayState: resolvedState, oscillating, attempt, maxRetries,
    nextRetryAt: resolvedNextRetryAt,
    responseRadioId: responseMessage?.id || "",
    statusRadioId: statusMessage?.id || ""
  };
  appendDispatchLog(memoryDir, enrichedResult);
  applyDispatchOutcome(memoryDir, job, enrichedResult, resolvedState, { responseMessage, statusMessage });
  return enrichedResult;
}

export async function executeDispatch(memoryDir, {
  run = false,
  force = false,
  to = "",
  project = "",
  limit = 10,
  model = "",
  respectRecipeDependencies = false,
  isolateWorktree = false,
  worktreeRoot = "",
  concurrency = 1
}) {
  const jobs = buildDispatchJobs(memoryDir, { to, project, limit, force, respectRecipeDependencies });
  const results = [];
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const preparedJobs = [];
  for (const job of jobs) {
    const prepared = prepareDispatchJobForRun(memoryDir, job, relayState, { model, run, isolateWorktree, worktreeRoot });
    if (prepared.skip) {
      results.push(prepared.skip);
    } else {
      preparedJobs.push(prepared);
    }
  }
  if (preparedJobs.length === 0) return results;
  if (concurrency <= 1) {
    // Sequential path — identical to pre-refactor behavior
    for (const { job, runner, attempt, maxRetries, options } of preparedJobs) {
      const result = runDispatchJob(memoryDir, job, runner, options);
      results.push(processDispatchJobResult(memoryDir, job, result, { attempt, maxRetries }));
    }
  } else {
    // Concurrent path — bounded pool with live status
    const poolResults = await runDispatchPool(memoryDir, preparedJobs.map((p) => ({ job: p.job, runner: p.runner, options: p.options })), { concurrency });
    for (let i = 0; i < preparedJobs.length; i++) {
      const { job, attempt, maxRetries } = preparedJobs[i];
      results.push(processDispatchJobResult(memoryDir, job, poolResults[i], { attempt, maxRetries }));
    }
  }
  return results;
}

export function executeDispatchRetry(memoryDir, {
  run = false,
  to = "",
  project = "",
  limit = 10,
  model = "",
  respectRecipeDependencies = false,
  isolateWorktree = false,
  worktreeRoot = ""
}) {
  const timeoutResults = run
    ? markTimedOutRelayStatuses(memoryDir, { to, project })
    : [];
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const jobs = buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit, respectRecipeDependencies });
  const results = [...timeoutResults];
  for (const job of jobs) {
    if (model) {
      job.model = model;
      const declared = readToolDeclarationByTool(memoryDir, job.tool)?.models || [];
      const discovered = readDiscoveredModels(memoryDir, job.tool);
      const knownModels = [...new Set([...declared, ...discovered])];
      if (knownModels.length > 0 && !knownModels.includes(model) && !knownModels.some((known) => known.endsWith(`/${model}`) || known.endsWith(`:${model}`))) {
        job.modelNote = `Requested model "${model}" is not in ${job.tool}'s declared/discovered list. Available: ${knownModels.length} model(s). Use "ai-memory-hub models --to ${job.tool} --refresh" to refresh from the provider.`;
      }
    }
    const runner = getToolRunner(job.tool);
    const maxRetries = getDispatchJobMaxRetries(job, job.maxRetries);
    if (!runner.available) {
      const result = {
        ...job,
        runnable: false,
        reason: runner.reason
      };
      if (run && !runner.sharedStateOnly) {
        const state = getRelayFailureState(job.attempt, maxRetries);
        appendRelayStatus(memoryDir, job, {
          state,
          attempt: job.attempt,
          maxRetries,
          exitCode: null,
          lastError: runner.reason,
          sessionId: "",
          ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
          nextRetryAt: computeNextRetryAt(job.attempt, maxRetries)
        });
        updateDispatchSourceState(memoryDir, job, {
          deliveryState: state,
          dispatchId: job.id,
          threadKey: getDispatchThreadKey(job),
          attempt: job.attempt,
          maxRetries,
          nextRetryAt: computeNextRetryAt(job.attempt, maxRetries),
          sessionId: "",
          lastError: runner.reason
        });
        const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: state });
        appendDispatchLog(memoryDir, result);
        applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, state, {
          statusMessage
        });
      }
      results.push(result);
      continue;
    }
    if (!run) {
      results.push({
        ...job,
        runnable: true,
        dryRun: true,
        command: runner.preview,
        relayState: "retrying"
      });
      continue;
    }

    // Phase 2: Check approval gate before retry
    if (job.gateId) {
      const gates = readApprovalGates(memoryDir, { });
      const gate = gates.find((g) => g.gateId === job.gateId);
      if (gate) {
        if (gate.status === "rejected") {
          // Gate rejected → permanent failure
          const result = {
            ...job,
            runnable: false,
            reason: `Approval gate rejected: ${gate.decisionNote || gate.reason}`,
            exitCode: 403,
            error: `Gate ${gate.gateId} rejected by ${gate.reviewer}: ${gate.decisionNote || gate.reason}`
          };
          if (run) {
            appendRelayStatus(memoryDir, job, {
              state: "failed-permanent",
              attempt: job.attempt,
              maxRetries,
              exitCode: 403,
              lastError: result.error,
              sessionId: "",
              ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
              gateId: job.gateId
            });
            updateDispatchSourceState(memoryDir, job, {
              deliveryState: "failed-permanent",
              dispatchId: job.id,
              threadKey: getDispatchThreadKey(job),
              attempt: job.attempt,
              maxRetries,
              nextRetryAt: "",
              sessionId: "",
              lastError: result.error,
              gateId: job.gateId
            });
            const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "failed-permanent" });
            appendDispatchLog(memoryDir, result);
            applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "failed-permanent", {
              statusMessage
            });
          }
          results.push(result);
          continue;
        }
        if (gate.status === "requested" || gate.status === "needs_changes") {
          // Gate still pending → block retry
          const result = {
            ...job,
            runnable: false,
            reason: `Waiting for approval: gate ${gate.gateId} status=${gate.status}`,
            exitCode: 451,
            error: `Gate ${gate.gateId} still pending (${gate.status}). Use 'gate approve/reject --id ${gate.gateId}' to decide.`,
            gateId: job.gateId
          };
          results.push(result);
          continue;
        }
        // gate.status === "approved" or "waived" → proceed
      }
    }

    appendRelayStatus(memoryDir, job, {
      state: "retrying",
      attempt: job.attempt,
      maxRetries,
      exitCode: null,
      lastError: "",
      sessionId: "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      nextRetryAt: ""
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "retrying",
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: job.attempt,
      maxRetries,
      nextRetryAt: "",
      sessionId: "",
      lastError: ""
    });
    const result = runDispatchJob(memoryDir, job, runner, { isolateWorktree, worktreeRoot });
    if (result.exitCode === 0) {
      appendRelayStatus(memoryDir, job, {
        state: "acked",
        attempt: job.attempt,
        maxRetries,
        exitCode: 0,
        lastError: "",
        sessionId: result.sessionId || "",
        ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        nextRetryAt: "",
        worktree: result.worktree || null
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: "acked",
        dispatchId: job.id,
        threadKey: getDispatchThreadKey(job),
        attempt: job.attempt,
        maxRetries,
        nextRetryAt: "",
        sessionId: result.sessionId || "",
        lastError: "",
        worktree: result.worktree || null
      });
    }
    const finalState = result.exitCode === 0
      ? "completed"
      : getRelayFailureState(job.attempt, maxRetries);
    const nextRetryAt = result.exitCode === 0 ? "" : computeNextRetryAt(job.attempt, maxRetries);
    const lastError = result.exitCode === 0 ? "" : (result.error || result.stderr || "");
    appendRelayStatus(memoryDir, job, {
      state: finalState,
      attempt: job.attempt,
      maxRetries,
      exitCode: result.exitCode,
      lastError,
      sessionId: result.sessionId || "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      nextRetryAt,
      worktree: result.worktree || null
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: finalState,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: job.attempt,
      maxRetries,
      nextRetryAt,
      sessionId: result.sessionId || "",
      lastError,
      worktree: result.worktree || null
    });
    const responseMessage = appendDispatchResponseMessage(memoryDir, job, { ...result, relayState: finalState });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: finalState });
    const enrichedResult = {
      ...result,
      retry: true,
      relayState: finalState,
      attempt: job.attempt,
      maxRetries,
      nextRetryAt,
      responseRadioId: responseMessage?.id || "",
      statusRadioId: statusMessage?.id || ""
    };
    appendDispatchLog(memoryDir, enrichedResult);
    applyDispatchOutcome(memoryDir, job, enrichedResult, finalState, {
      responseMessage,
      statusMessage
    });
    results.push(enrichedResult);
  }
  return results;
}

function markTimedOutRelayStatuses(memoryDir, { to = "", project = "", now = Date.now() } = {}) {
  const timedOutEntries = Object.values(readLatestRelayStatusBySource(memoryDir))
    .filter((entry) => to ? entry.tool === to : true)
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => isRelayTimedOut(entry, now));
  const results = [];

  for (const entry of timedOutEntries) {
    const job = rebuildDispatchJobFromRelay(memoryDir, entry) || dispatchJobFromRelayEntry(entry);
    if (!job?.refId) {
      continue;
    }

    const attempt = Number(entry.attempt || 1);
    const maxRetries = getDispatchJobMaxRetries(job, entry.maxRetries);
    const state = getRelayFailureState(attempt, maxRetries);
    const timeoutMs = Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS);
    const lastError = `Timeout: no response within ackTimeout (${timeoutMs}ms) while relay was ${entry.state || "unknown"}`;
    const nextRetryAt = state === ASYNC_CALL_STATES.FAILED
      ? computeNextRetryAt(attempt, maxRetries)
      : "";
    const worktree = normalizeDispatchWorktreeMetadata(entry.worktree);
    const result = {
      ...job,
      runnable: true,
      timeout: true,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: lastError,
      sessionId: entry.sessionId || "",
      relayState: state,
      worktree
    };

    appendRelayStatus(memoryDir, job, {
      state,
      attempt,
      maxRetries,
      exitCode: null,
      lastError,
      sessionId: entry.sessionId || "",
      ackTimeout: timeoutMs,
      nextRetryAt,
      worktree
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: state,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt,
      maxRetries,
      nextRetryAt,
      sessionId: entry.sessionId || "",
      lastError,
      worktree
    });

    const statusMessage = appendDispatchStatusMessage(memoryDir, job, result);
    const enrichedResult = {
      ...result,
      statusRadioId: statusMessage?.id || ""
    };
    appendDispatchLog(memoryDir, enrichedResult);
    applyDispatchOutcome(memoryDir, job, enrichedResult, state, { statusMessage });
    results.push(enrichedResult);
  }

  return results;
}

function applyDispatchOutcome(memoryDir, job, result, relayState, { responseMessage = null, statusMessage = null } = {}) {
  if (job?.kind !== "task" || !job.refId) {
    return null;
  }
  const now = new Date().toISOString();
  const completed = relayState === ASYNC_CALL_STATES.COMPLETED;
  const failed = [ASYNC_CALL_STATES.FAILED, ASYNC_CALL_STATES.ABANDONED].includes(relayState);
  const reportPath = completed ? writeDispatchReportIfUseful(memoryDir, job, result, relayState) : "";
  const responseSummary = summarizeText(result.stdout || "", 220);
  const errorSummary = summarizeText(result.error || result.stderr || "", 220);
  let outcomeNoteText = "";

  const updatedTask = updateTask(memoryDir, job.refId, (task) => {
    const notes = [...(task.notes || [])];
    if (completed) {
      const parts = [`Dispatch completed by ${job.tool || "unknown"}.`];
      if (responseSummary) {
        parts.push(`Response: ${responseSummary}`);
      }
      if (reportPath) {
        parts.push(`Report: ${reportPath}`);
      }
      outcomeNoteText = parts.join(" ");
      notes.push(createTaskNote("ai-memory-hub", outcomeNoteText));
    } else if (failed) {
      outcomeNoteText = `Dispatch ${relayState} for ${job.tool || "unknown"}: ${errorSummary || "no error output"}`;
      notes.push(createTaskNote("ai-memory-hub", outcomeNoteText));
    }

    return {
      ...task,
      status: completed ? "done" : task.status,
      assignee: task.assignee || job.tool || "",
      updatedAt: now,
      completedAt: completed ? now : task.completedAt || "",
      deliveryState: relayState,
      deliveryUpdatedAt: now,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: Number(result.attempt || task.attempt || 0),
      maxRetries: Number(result.maxRetries || task.maxRetries || 0),
      nextRetryAt: result.nextRetryAt || task.nextRetryAt || "",
      sessionId: result.sessionId || task.sessionId || "",
      lastError: failed ? (result.error || result.stderr || task.lastError || "") : "",
      responseRadioId: responseMessage?.id || task.responseRadioId || "",
      statusRadioId: statusMessage?.id || task.statusRadioId || "",
      dispatchReportPath: reportPath || task.dispatchReportPath || "",
      worktree: result.worktree || task.worktree || null,
      notes
    };
  });
  syncLinkedWorkflowDeliveryState(memoryDir, updatedTask, {
    deliveryState: relayState,
    dispatchId: job.id,
    threadKey: getDispatchThreadKey(job),
    attempt: Number(result.attempt || updatedTask.attempt || 0),
    maxRetries: Number(result.maxRetries || updatedTask.maxRetries || 0),
    nextRetryAt: result.nextRetryAt || updatedTask.nextRetryAt || "",
    sessionId: result.sessionId || updatedTask.sessionId || "",
    lastError: failed ? (result.error || result.stderr || updatedTask.lastError || "") : "",
    responseRadioId: responseMessage?.id || updatedTask.responseRadioId || "",
    statusRadioId: statusMessage?.id || updatedTask.statusRadioId || "",
    dispatchReportPath: reportPath || updatedTask.dispatchReportPath || "",
    worktree: result.worktree || updatedTask.worktree || null,
    noteText: outcomeNoteText ? `Linked task ${updatedTask.id}: ${outcomeNoteText}` : ""
  });
  return updatedTask;
}

function writeDispatchReportIfUseful(memoryDir, job, result, relayState) {
  const stdout = String(result.stdout || "").trim();
  if (!stdout || !shouldPersistDispatchReport(job, stdout)) {
    return "";
  }
  const idPart = String(job.refId || job.id || "dispatch").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 40);
  const tsPart = new Date().toISOString().replace(/[:.]/g, "-");
  const relativePath = path.join(RESEARCH_REPORTS_DIR, `${tsPart}-${idPart}.md`);
  const file = path.join(memoryDir, relativePath);
  ensureDir(path.dirname(file));
  const lines = [
    `# Dispatch Report: ${job.refId || job.id}`,
    "",
    `- Tool: ${job.tool || "unknown"}`,
    `- Project: ${job.project || ""}`,
    `- Kind: ${job.kind || ""}`,
    `- State: ${relayState || ""}`,
    `- Thread: ${job.thread || ""}`,
    `- Created: ${new Date().toISOString()}`,
    "",
    "## Task",
    "",
    job.text || "",
    "",
    "## Response",
    "",
    stdout,
    ""
  ];
  writeFileAtomic(file, lines.join("\n"), "utf8");
  return relativePath.replace(/\\/g, "/");
}

function buildDispatchJobs(memoryDir, { to, project, limit, force, respectRecipeDependencies = false }) {
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const dispatched = force ? new Set() : readDispatchLog(memoryDir)
    .filter((item) => item.runnable && item.exitCode === 0)
    .reduce((set, item) => set.add(item.id), new Set());

  // 读取消息并按时间倒序排序（最新的在前）
  const allMessages = readRadioMessages(memoryDir)
    .filter((message) => project ? message.project === project : true)
    .filter((message) => isDirectDispatchRadioMessage(message, to))
    .filter((message) => !isRadioLinkedToClosedSource(memoryDir, message))
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

  // 只取最新的limit条
  const messages = allMessages
    .slice(0, limit)
    .flatMap((message) => {
      const target = resolveAgentTarget(message.to);
      if (target.kind === "tool" && target.tool === "all") {
        const tools = ["codex", "gemini", "claude"];
        return tools
          .filter((tool) => to ? tool === to : true)
          .map((tool) => ({
            id: `radio:${message.id}:${tool}`,
            kind: "radio",
            tool: normalizeToolName(tool),
            project: message.project || "",
            text: message.text,
            refId: message.id,
            thread: message.thread || message.id,
            roles: []
          }));
      }
      return [{
        id: `radio:${message.id}`,
        kind: "radio",
        tool: target.tool,
        sessionId: target.sessionId,
        project: message.project || "",
        text: message.text,
        refId: message.id,
        thread: message.thread || message.id,
        roles: []
      }];
    });
  const allTasks = readTasks(memoryDir);
  const tasks = allTasks
    .filter((task) => !["done", "cancelled", "blocked"].includes(task.status))
    .filter((task) => project ? task.project === project : true)
    .filter((task) => to ? task.assignee === to : Boolean(task.assignee))
    .filter((task) => respectRecipeDependencies ? areTaskRecipeDependenciesSatisfied(task, allTasks) : true)
    .slice(0, limit)
    .map((task) => dispatchJobFromTask(task));
  return [...messages, ...tasks]
    .filter((job) => job.tool)
    .filter((job) => !dispatched.has(job.id))
    .filter((job) => shouldDispatchJob(relayState, job, force))
    .slice(0, limit);
}

function buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit, respectRecipeDependencies = false }) {
  const now = Date.now();
  const candidates = Object.values(relayState)
    .filter((entry) => isRelayRetryCandidate(entry, now))
    .filter((entry) => isRelayRetryRunnable(entry))
    .filter((entry) => to ? entry.tool === to : true)
    .filter((entry) => project ? entry.project === project : true);

  return candidates
    .map((entry) => {
      const job = rebuildDispatchJobFromRelay(memoryDir, entry, { respectRecipeDependencies });
      const maxRetries = getDispatchJobMaxRetries(job, entry.maxRetries);
      if (!job || !shouldRetryJob(job) || Number(entry.attempt || 0) >= maxRetries) {
        return null;
      }
      return {
        ...job,
        attempt: Number(entry.attempt || 0) + 1,
        maxRetries
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

export function rebuildDispatchJobFromRelay(memoryDir, entry, { respectRecipeDependencies = false } = {}) {
  if (entry.sourceKind === "radio") {
    const message = readRadioMessages(memoryDir).find((item) => item.id === entry.sourceId);
    if (!message) return null;
    if (!isDirectDispatchRadioMessage(message, entry.tool || message.to)) return null;
    if (isRadioLinkedToClosedSource(memoryDir, message)) return null;
    return {
      id: `radio:${message.id}`,
      kind: "radio",
      tool: normalizeToolName(entry.tool || message.to),
      project: message.project || "",
      text: message.text,
      refId: message.id,
      thread: message.thread || message.id,
      gateId: entry.gateId || ""
    };
  }
  if (entry.sourceKind === "task") {
    const tasks = readTasks(memoryDir);
    const task = tasks.find((item) => item.id === entry.sourceId);
    if (!task) return null;
    if (isClosedDispatchSourceState(task.status || task.deliveryState)) return null;
    if (respectRecipeDependencies && !areTaskRecipeDependenciesSatisfied(task, tasks)) return null;
    return {
      ...dispatchJobFromTask(task),
      gateId: entry.gateId || ""
    };
  }
  if (entry.sourceKind === "workflow") {
    const workflow = readWorkflows(memoryDir).find((item) => item.id === entry.sourceId);
    if (!workflow) return null;
    if (isClosedDispatchSourceState(workflow.status || workflow.deliveryState)) return null;
    return {
      ...dispatchJobFromWorkflow(workflow, entry.tool || ""),
      gateId: entry.gateId || ""
    };
  }
  return null;
}

// Decide the terminal/retry state for a failed dispatch, abandoning early when
// the same failure has now repeated past the oscillation threshold.

function getRelayFailureStateWithOscillation(memoryDir, job, attempt, maxRetries, fingerprint) {
  const baseState = getRelayFailureState(attempt, maxRetries);
  if (baseState === "abandoned") {
    return { state: baseState, oscillating: false };
  }
  // +1 for the current attempt about to be recorded.
  const repeated = countRecentRelayOscillation(memoryDir, job, fingerprint) + 1;
  if (repeated >= DISPATCH_OSCILLATION_THRESHOLD) {
    return { state: "abandoned", oscillating: true, repeated };
  }
  return { state: baseState, oscillating: false };
}
