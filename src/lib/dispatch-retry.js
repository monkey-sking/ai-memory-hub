// Dispatch retry-state decision core.
//
// Pure decision helpers shared by the relay/radio dispatch state machine
// (prepareDispatchJobForRun / processDispatchJobResult / executeDispatchRetry /
// markTimedOutRelayStatuses / buildRetryDispatchJobs in src/index.js) and by the
// dispatch command (via index deps injection of normalizeDispatchRetryLimit).
//
// All dependencies are already-sunk lib modules (constants / entity-models /
// runner-core) — no index-internal symbols remain, so this module is a
// self-contained sink: index.js imports these back as a plain caller.
import { ASYNC_CALL_STATES } from "./constants.js";
import { normalizeNonNegativeInteger } from "./entity-models.js";
import { getRunnerProfile } from "./runner-core.js";

// Default retry budget a failed dispatch is allowed before being abandoned.
export const DEFAULT_DISPATCH_MAX_RETRIES = 3;

export function shouldRetryJob(job) {
  if (!job?.tool) {
    return false;
  }
  return !isSharedStateOnlyTool(job.tool);
}

export function isSharedStateOnlyTool(tool) {
  const profile = getRunnerProfile(tool);
  return Boolean(profile?.sharedStateOnly);
}

export function getDispatchJobMaxRetries(job, fallback = DEFAULT_DISPATCH_MAX_RETRIES) {
  const gateLimit = normalizeNonNegativeInteger(job?.qualityGate?.maxRepairAttempts);
  if (gateLimit !== null) {
    return gateLimit;
  }
  return normalizeDispatchRetryLimit(fallback);
}

export function normalizeDispatchRetryLimit(value) {
  const limit = normalizeNonNegativeInteger(value);
  return limit !== null ? limit : DEFAULT_DISPATCH_MAX_RETRIES;
}

export function computeNextRetryAt(attempt, maxRetries = DEFAULT_DISPATCH_MAX_RETRIES) {
  const limit = normalizeDispatchRetryLimit(maxRetries);
  if (Number(attempt || 0) >= limit) {
    return "";
  }
  const delays = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];
  const delayMs = delays[Math.max(0, Number(attempt || 1) - 1)] || delays[delays.length - 1];
  return new Date(Date.now() + delayMs).toISOString();
}

export function getRelayFailureState(attempt, maxRetries = DEFAULT_DISPATCH_MAX_RETRIES) {
  return Number(attempt || 0) >= normalizeDispatchRetryLimit(maxRetries) ? "abandoned" : "failed";
}

export function isRelayRetryDue(entry) {
  if (!entry || entry.state !== ASYNC_CALL_STATES.FAILED || !entry.nextRetryAt) {
    return false;
  }
  const nextRetryMs = Date.parse(entry.nextRetryAt);
  if (Number.isNaN(nextRetryMs)) {
    return false;
  }
  return nextRetryMs <= Date.now() && Number(entry.attempt || 0) < normalizeDispatchRetryLimit(entry.maxRetries);
}

export function isRelayRetryRunnable(entry) {
  return !isSharedStateOnlyTool(entry?.tool || "");
}
