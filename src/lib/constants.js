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
