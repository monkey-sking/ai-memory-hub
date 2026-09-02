import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createId, ensureDir, readJson, readJsonSafe } from "./cli.js";
import { getAgentRegistryFile, getModelsCacheFile, getPolicyRulesFile, getRadioCursorFile, getRoleRegistryFile, getTeamRegistryFile, getToolDeclarationsFile } from "./registry-paths.js";
import { writeFileAtomic } from "../atomic-write.js";
import { appendJsonl } from "../event-writer.js";

// Low-level JSONL file IO.
//
// These are the generic, business-agnostic readers used across the hub (every
// command that ingests a .jsonl file funnels through readEvents). They were
// inlined near the bottom of the 18k-line index.js monolith; extracting them
// here (v2.6) gives the entity-store engine and any future command module a
// circular-dependency-free home for file IO — nothing here imports index.js.
//
// Depends only on node:fs and the createId helper from the shared helper layer.

export function parseJsonlLine(line, _file = "", _lineNumber = 0) {
  const raw = String(line || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    return {
      id: createId(raw),
      ts: new Date().toISOString(),
      source: "raw",
      text: raw,
      metadata: { kind: "raw" }
    };
  }
}

export function readEvents(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJsonlLine(line, file));
}

export function countJsonlLines(file) {
  if (!fs.existsSync(file)) {
    return 0;
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
}

export function readToolDeclarations(memoryDir) {
  const file = getToolDeclarationsFile(memoryDir);
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    return readEvents(file);
  } catch {
    return [];
  }
}

export function readModelsCache(memoryDir) {
  const cacheFile = getModelsCacheFile(memoryDir);
  if (!fs.existsSync(cacheFile)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {
    return {};
  }
}

export function writeModelsCache(memoryDir, cache) {
  writeFileAtomic(getModelsCacheFile(memoryDir), JSON.stringify(cache, null, 2));
}

export function readRadioCursor(memoryDir, consumer) {
  const file = getRadioCursorFile(memoryDir, consumer);
  if (!fs.existsSync(file)) {
    return { consumer: consumer || "all", lastMessageId: "", processedIds: [], updatedAt: "" };
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      consumer: data.consumer || consumer || "all",
      lastMessageId: data.lastMessageId || "",
      processedIds: Array.isArray(data.processedIds) ? data.processedIds : [],
      updatedAt: data.updatedAt || ""
    };
  } catch {
    return { consumer: consumer || "all", lastMessageId: "", processedIds: [], updatedAt: "" };
  }
}

export function writeRadioCursor(memoryDir, consumer, lastMessageId, processedIds) {
  const file = getRadioCursorFile(memoryDir, consumer);
  ensureDir(path.dirname(file));
  const cursor = {
    consumer: consumer || "all",
    lastMessageId,
    processedIds: processedIds.slice(-50),
    updatedAt: new Date().toISOString()
  };
  writeFileAtomic(file, JSON.stringify(cursor, null, 2), "utf8");
}

export function readAgents(memoryDir) {
  const file = getAgentRegistryFile(memoryDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function readRoles(memoryDir) {
  const file = getRoleRegistryFile(memoryDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function readTeams(memoryDir) {
  const file = getTeamRegistryFile(memoryDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function readClaudeSessionState(memoryDir) {
  const file = path.join(memoryDir, "state", "claude-sessions.json");
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return readJson(file);
  } catch {
    return {};
  }
}

export function readDispatchLog(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "dispatch-log.jsonl"));
}

export function readDispatchRuns(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "dispatch-runs.jsonl"));
}

export function appendDispatchRunRecord(memoryDir, record) {
  appendJsonl(path.join(memoryDir, "state", "dispatch-runs.jsonl"), record);
}

export function appendDispatchLog(memoryDir, result) {
  appendJsonl(path.join(memoryDir, "state", "dispatch-log.jsonl"), {
    ...result,
    dispatchedAt: new Date().toISOString()
  });
}

export function readRelayStatus(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "relay-status.jsonl"));
}

export function resolveGitConflictsInFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes("<<<<<<<")) {
    return false;
  }
  
  console.log(`Conflict detected in ${path.basename(filePath)}. Resolving...`);
  const lines = content.split(/\r?\n/);
  const records = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("<<<<<<<") || trimmed.startsWith("=======") || trimmed.startsWith(">>>>>>>")) {
      continue;
    }
    try {
      const data = JSON.parse(trimmed);
      const id = data.id || data.localEventId || createId(data.text || JSON.stringify(data));
      records[id] = data;
    } catch {
      // Ignore
    }
  }
  
  const sortedRecords = Object.values(records).sort((a, b) => {
    const tsA = a.ts || a.createdAt || a.indexedAt || "";
    const tsB = b.ts || b.createdAt || b.indexedAt || "";
    return String(tsA).localeCompare(String(tsB));
  });
  
  writeFileAtomic(filePath, sortedRecords.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`Resolved conflict: ${path.basename(filePath)} successfully rewritten with ${sortedRecords.length} unique records.`);
  return true;
}

export function writeLedger(memoryDir, ledger) {
  const file = path.join(memoryDir, "memories", "ledger.jsonl");
  ensureDir(path.dirname(file));
  writeFileAtomic(file, ledger.map((item) => JSON.stringify(item)).join("\n") + (ledger.length ? "\n" : ""), "utf8");
}

export function readApprovalGates(memoryDir, filters = {}) {
  const gatesFile = path.join(memoryDir, "gates", "approvals.jsonl");
  if (!fs.existsSync(gatesFile)) return [];
  const events = readEvents(gatesFile);
  // Group by gateId, take most recent event per gate
  const byGate = events.reduce((acc, event) => {
    const id = event.gateId;
    if (!acc[id] || event.ts > acc[id].ts) {
      acc[id] = event;
    }
    return acc;
  }, {});
  let gates = Object.values(byGate);
  // Apply filters
  if (filters.status) gates = gates.filter((g) => g.status === filters.status);
  if (filters.actor) gates = gates.filter((g) => g.actor === filters.actor);
  if (filters.reviewer) gates = gates.filter((g) => g.reviewer === filters.reviewer);
  if (filters.scope) gates = gates.filter((g) => g.scope === filters.scope);
  if (filters.project) gates = gates.filter((g) => g.project === filters.project);
  if (filters.refId) gates = gates.filter((g) => g.refId === filters.refId);
  return gates.sort((a, b) => (b.requestedAt || b.ts).localeCompare(a.requestedAt || a.ts));
}

export function appendApprovalGateEvent(memoryDir, event) {
  const gatesFile = path.join(memoryDir, "gates", "approvals.jsonl");
  ensureDir(path.dirname(gatesFile));
  const normalized = {
    type: "approval.gate",
    gateId: event.gateId || crypto.randomBytes(8).toString("hex"),
    status: event.status,
    scope: event.scope || "operation",
    actor: event.actor || "",
    reviewer: event.reviewer || "human",
    project: event.project || "",
    operation: event.operation || "",
    refId: event.refId || "",
    refType: event.refType || "",
    reason: event.reason || "",
    requestedAt: event.requestedAt || event.ts || new Date().toISOString(),
    decidedAt: event.decidedAt || "",
    decisionNote: event.decisionNote || "",
    evidence: event.evidence || [],
    expiresAt: event.expiresAt || "",
    ts: event.ts || new Date().toISOString(),
    isFinal: ["approved", "rejected", "waived"].includes(event.status)
  };
  appendJsonl(gatesFile, normalized);
  return normalized;
}

export function readPolicyRules(memoryDir) {
  const file = getPolicyRulesFile(memoryDir);
  const events = readEvents(file).filter((event) => String(event.type || "") === "policy.rule" && event.id);
  const byId = new Map();
  for (const event of events) {
    byId.set(event.id, event);
  }
  // Tombstones (decision === "__removed__") drop the rule.
  return Array.from(byId.values())
    .filter((rule) => rule.decision !== "__removed__")
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

export function readSessions(memoryDir) {
  const file = path.join(memoryDir, "context", "sessions.jsonl");
  return readEvents(file);
}

export function readUnreadReceipts(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "unread.jsonl"));
}

export function appendUnreadReceipt(memoryDir, receipt) {
  appendJsonl(path.join(memoryDir, "state", "unread.jsonl"), {
    id: createId(`unread:${receipt.itemId}:${receipt.actor}:${Date.now()}`),
    ts: new Date().toISOString(),
    ...receipt
  });
}

export function writeSessions(memoryDir, sessions) {
  const file = path.join(memoryDir, "context", "sessions.jsonl");
  ensureDir(path.dirname(file));
  writeFileAtomic(file, sessions.map((s) => JSON.stringify(s)).join("\n") + (sessions.length ? "\n" : ""), "utf8");
}

export function writeRpcRequest(memoryDir, request) {
  const file = path.join(memoryDir, "rpc", "requests", `${request.id}.json`);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, JSON.stringify(request, null, 2) + "\n", "utf8");
}

export function readRpcRequest(memoryDir, requestId) {
  const file = path.join(memoryDir, "rpc", "requests", `${requestId}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return readJson(file);
}

export function writeRpcResult(memoryDir, requestId, result) {
  const resultData = {
    id: createId(`rpc-result:${requestId}:${Date.now()}`),
    requestId,
    createdAt: new Date().toISOString(),
    success: result.success !== false,
    data: result.data || null,
    error: result.error || null
  };
  const file = path.join(memoryDir, "rpc", "results", `${requestId}.json`);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, JSON.stringify(resultData, null, 2) + "\n", "utf8");
  return resultData;
}

export function readRpcResult(memoryDir, requestId) {
  const file = path.join(memoryDir, "rpc", "results", `${requestId}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return readJson(file);
}

export function writeNotification(memoryDir, notification) {
  const file = path.join(memoryDir, "notifications", "notifications.jsonl");
  ensureDir(path.dirname(file));
  appendJsonl(file, notification);
}

export function readNotifications(memoryDir) {
  const file = path.join(memoryDir, "notifications", "notifications.jsonl");
  return readEvents(file);
}

export function writeContextPack(memoryDir, pack) {
  const file = path.join(memoryDir, "context", "packs", `${pack.id}.json`);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, JSON.stringify(pack, null, 2) + "\n", "utf8");
  return file;
}

export function readContextPack(memoryDir, packId) {
  const file = path.join(memoryDir, "context", "packs", `${packId}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return readJson(file);
}

export function readDispatchQueue(memoryDir) {
  const file = path.join(memoryDir, "dispatch", "queue.jsonl");
  return readEvents(file);
}

export function writeDispatchQueueEntry(memoryDir, entry) {
  const file = path.join(memoryDir, "dispatch", "queue.jsonl");
  ensureDir(path.dirname(file));
  appendJsonl(file, entry);
}

export function readMemoryLifecycleOperations(memoryDir) {
  return readEvents(path.join(memoryDir, "memories", "operations.jsonl"));
}

export function archiveInbox(memoryDir, events) {
  if (events.length === 0) {
    return;
  }
  const archiveName = `events-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const archivePath = path.join(memoryDir, "synced", archiveName);
  writeFileAtomic(archivePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
}

export function writeInboxEvents(inboxPath, events) {
  ensureDir(path.dirname(inboxPath));
  writeFileAtomic(inboxPath, events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : ""), "utf8");
}

export function readBackupManifest(backupDir) {
  const manifestPath = path.join(backupDir, "manifest.json");
  return fs.existsSync(manifestPath) ? readJsonSafe(manifestPath, {}) : {};
}

export function readLockFile(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return {};
  }
  try {
    return readJson(lockPath);
  } catch (error) {
    return { parseError: error.message || String(error) };
  }
}

export function readLockEvents(memoryDir) {
  return readEvents(path.join(memoryDir, "state", "lock-events.jsonl"));
}

export function appendLockEvent(lockPath, payload) {
  const memoryDir = path.resolve(lockPath, "..", "..");
  appendJsonl(path.join(memoryDir, "state", "lock-events.jsonl"), {
    id: createId(`lock:${payload.type}:${payload.owner || ""}:${Date.now()}`),
    ts: new Date().toISOString(),
    path: lockPath,
    ...payload
  });
}

export function readEventsWithLocations(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter((entry) => entry.line.trim())
    .map((entry) => ({
      file,
      lineNumber: entry.lineNumber,
      event: parseJsonlLine(entry.line, file, entry.lineNumber)
    }));
}
