import crypto from "node:crypto";

const TRANSITIONS = {
  pending: new Set(["resolving", "accepted", "failed"]),
  resolving: new Set(["accepted", "failed"]),
  accepted: new Set(["processing", "failed"]),
  processing: new Set(["completed", "failed", "retrying"]),
  retrying: new Set(["resolving", "failed", "abandoned"]),
  failed: new Set(["retrying", "abandoned"]),
  completed: new Set(),
  abandoned: new Set()
};

export function resolveAgentTarget(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return { kind: "unknown", tool: "", sessionId: "", actor: "" };
  const sessionMatch = raw.match(/^session:([^:]+):(.+)$/);
  if (sessionMatch) {
    const tool = normalizePart(sessionMatch[1]);
    const sessionId = sessionMatch[2].trim();
    return { kind: "session", tool, sessionId, actor: `session:${tool}:${sessionId}` };
  }
  const toolMatch = raw.match(/^tool:(.+)$/);
  const tool = normalizePart(toolMatch ? toolMatch[1] : raw);
  return { kind: "tool", tool, sessionId: "", actor: `tool:${tool}` };
}

export function createWakeEnvelope({
  from = "system:ai-memory-hub",
  to,
  text,
  project = "",
  thread = "",
  messageId = "",
  now = new Date().toISOString()
} = {}) {
  const target = resolveAgentTarget(to);
  const cleanText = String(text || "").trim();
  const idempotencyKey = createIdempotencyKey({ from, target: target.actor, text: cleanText, project, thread, messageId });
  return {
    id: `wake:${idempotencyKey.slice(0, 16)}`,
    idempotencyKey,
    createdAt: now,
    from: String(from || "system:ai-memory-hub"),
    target,
    text: cleanText,
    project: String(project || ""),
    thread: String(thread || ""),
    messageId: String(messageId || ""),
    state: "pending",
    attempt: 0,
    lastError: ""
  };
}

export function selectWakeAction({ live = false, resume = false } = {}) {
  if (live) return "send";
  if (resume) return "wake";
  return "queue";
}

export function transitionWakeState(current, next) {
  const from = String(current || "pending");
  const to = String(next || "");
  if (!TRANSITIONS[from]?.has(to)) {
    throw new Error(`Invalid wake transition: ${from} -> ${to}`);
  }
  return to;
}

function createIdempotencyKey({ from, target, text, project, thread, messageId }) {
  return crypto.createHash("sha256")
    .update([from, target, text, project, thread, messageId].map((value) => String(value || "")).join("\u001f"))
    .digest("hex");
}

function normalizePart(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
}
