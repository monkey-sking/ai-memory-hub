// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendJsonl } from "../event-writer.js";
import { createId, ensureDir, readJson, readJsonSafe, writeJson } from "./cli.js";
import { getAgentRegistryFile, getModelsCacheFile, getPolicyRulesFile, getRadioCursorFile, getRoleRegistryFile, getTeamRegistryFile, getToolDeclarationsFile } from "./registry-paths.js";
import { getRelaySourceKey, getDispatchSourceKey, getDispatchThreadKey, stripExistingModelArgs } from "./dispatch.js";
import { sleep } from "./util.js";
import { writeFileAtomic } from "../atomic-write.js";

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

export function readAgentById(memoryDir, id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return null;
  return readAgents(memoryDir).find((a) => String(a.id || "").trim().toLowerCase() === key) || null;
}

export function readRoleById(memoryDir, id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return null;
  return readRoles(memoryDir).find((r) => String(r.id || "").trim().toLowerCase() === key) || null;
}

export function readTeamById(memoryDir, id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return null;
  return readTeams(memoryDir).find((t) => String(t.id || "").trim().toLowerCase() === key) || null;
}

export function resolveRelayThreadKeys(memoryDir, { threadKey = "", thread = "", refId = "", project = "", tool = "" }) {
  if (threadKey) {
    return new Set([threadKey]);
  }
  if (!thread && !refId) {
    return null;
  }
  const keys = new Set();
  for (const entry of readRelayStatus(memoryDir)) {
    if (thread && entry.thread === thread) {
      if ((!project || entry.project === project) && (!tool || entry.tool === tool)) {
        keys.add(entry.threadKey);
      }
    }
    if (refId && (entry.sourceId === refId || entry.dispatchId === refId)) {
      if ((!project || entry.project === project) && (!tool || entry.tool === tool)) {
        keys.add(entry.threadKey);
      }
    }
  }
  return keys;
}

export function findLatestRelayStatusEntry(memoryDir, { threadKey = "", thread = "", refId = "", project = "", tool = "" }) {
  const matches = readRelayStatus(memoryDir)
    .filter((entry) => threadKey ? entry.threadKey === threadKey : true)
    .filter((entry) => thread ? entry.thread === thread || entry.threadKey === thread : true)
    .filter((entry) => refId
      ? entry.sourceId === refId
        || entry.dispatchId === refId
        || entry.dispatchId === `task:${refId}`
        || entry.dispatchId === `radio:${refId}`
        || entry.dispatchId === `workflow:${refId}`
      : true)
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => tool ? entry.tool === tool : true)
    .sort((a, b) => String(a.ts || a.updatedAt || "").localeCompare(String(b.ts || b.updatedAt || "")));
  return matches.at(-1) || null;
}

export function readLatestDispatchRunByThread(memoryDir) {
  const latest = {};
  for (const entry of readDispatchRuns(memoryDir)) {
    const threadKey = entry.threadKey || "";
    if (!threadKey) {
      continue;
    }
    const current = latest[threadKey];
    const currentTs = String(current?.finishedAt || current?.startedAt || "");
    const nextTs = String(entry.finishedAt || entry.startedAt || "");
    if (!current || nextTs >= currentTs) {
      latest[threadKey] = entry;
    }
  }
  return latest;
}

export function readLatestRelayStatusByThread(memoryDir) {
  const latest = {};
  for (const entry of readRelayStatus(memoryDir)) {
    const threadKey = entry.threadKey || "";
    if (!threadKey) {
      continue;
    }
    const current = latest[threadKey];
    const currentTs = String(current?.ts || current?.updatedAt || "");
    const nextTs = String(entry.ts || entry.updatedAt || "");
    if (!current || nextTs >= currentTs) {
      latest[threadKey] = entry;
    }
  }
  return latest;
}

export function readLatestRelayStatusBySource(memoryDir) {
  const latest = {};
  for (const entry of readRelayStatus(memoryDir)) {
    const sourceKey = getRelaySourceKey(entry);
    if (!sourceKey) {
      continue;
    }
    const current = latest[sourceKey];
    const currentTs = String(current?.ts || current?.updatedAt || "");
    const nextTs = String(entry.ts || entry.updatedAt || "");
    if (!current || nextTs >= currentTs) {
      latest[sourceKey] = entry;
    }
  }
  return latest;
}

export function updateSession(memoryDir, sessionId, updates) {
  const sessions = readSessions(memoryDir);
  const updated = sessions.map((session) => {
    if (session.id === sessionId) {
      return {
        ...session,
        ...updates,
        updatedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
    }
    return session;
  });
  writeSessions(memoryDir, updated);
  return updated.find((s) => s.id === sessionId);
}

export function getActiveSessions(memoryDir, maxAgeMs = 3600000) {
  const sessions = readSessions(memoryDir);
  const now = Date.now();
  return sessions.filter((session) => {
    const lastActiveMs = Date.parse(session.lastActive || session.updatedAt || "");
    return !Number.isNaN(lastActiveMs) && (now - lastActiveMs) < maxAgeMs;
  }).sort((a, b) => {
    const aTime = a.lastActive || a.updatedAt || "";
    const bTime = b.lastActive || b.updatedAt || "";
    return bTime.localeCompare(aTime);
  });
}

export function getPendingNotifications(memoryDir) {
  return readNotifications(memoryDir).filter((n) => n.status === "pending");
}

export function getQueuedEntries(memoryDir) {
  return readDispatchQueue(memoryDir)
    .filter((e) => e.status === "queued")
    .sort((a, b) => {
      // Sort by priority first (urgent > high > normal > low)
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const aPrio = priorityOrder[a.priority] || 2;
      const bPrio = priorityOrder[b.priority] || 2;
      if (aPrio !== bPrio) return aPrio - bPrio;
      // Then by creation time
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
}

export function getRunningEntries(memoryDir) {
  return readDispatchQueue(memoryDir)
    .filter((e) => e.status === "running")
    .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
}

export function getFailedEntries(memoryDir) {
  return readDispatchQueue(memoryDir)
    .filter((e) => e.status === "failed")
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
}

export function buildRunnerArgs(memoryDir, job, runner, prompt) {
  let args = [...(runner.args || [])];
  const model = job.model || "";
  if (model && typeof runner.modelArgs === "function") {
    args = stripExistingModelArgs(args);
    args.push(...runner.modelArgs(model));
  }
  const sessionId = runner.capabilities?.includes("session-resume")
    ? job.sessionId || readClaudeSessionState(memoryDir)[getDispatchThreadKey(job)] || ""
    : "";
  if (sessionId && typeof runner.resumeArgs === "function") {
    args.push(...runner.resumeArgs(sessionId));
  }
  if (runner.promptMode === "argv" && prompt) {
    args.push(prompt);
  }
  return args;
}

export function writeClaudeSessionState(memoryDir, job, sessionId) {
  const threadKey = getDispatchThreadKey(job);
  if (!threadKey) {
    return;
  }
  const state = readClaudeSessionState(memoryDir);
  state[threadKey] = sessionId;
  writeJson(path.join(memoryDir, "state", "claude-sessions.json"), state);
}

export function countRecentRelayOscillation(memoryDir, job, fingerprint) {
  if (!fingerprint) {
    return 0;
  }
  const sourceKey = getDispatchSourceKey(job);
  const entries = readRelayStatus(memoryDir).filter(
    (entry) => getRelaySourceKey(entry) === sourceKey
  );
  let run = 0;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    // Only failed/abandoned attempts carry a comparable fingerprint. Skip the
    // in-flight dispatched/acked rows so they don't break the consecutive run.
    if (entry.state !== "failed" && entry.state !== "abandoned") {
      continue;
    }
    if (entry.fingerprint && entry.fingerprint === fingerprint) {
      run += 1;
    } else {
      break;
    }
  }
  return run;
}

export function writeAgent(memoryDir, agent) {
  const file = getAgentRegistryFile(memoryDir);
  ensureDir(path.dirname(file));
  const agents = readAgents(memoryDir);
  const key = String(agent.id || "").trim().toLowerCase();
  if (!key) throw new Error("agent requires an id");
  const idx = agents.findIndex((a) => String(a.id || "").trim().toLowerCase() === key);
  const nowIso = new Date().toISOString();
  const next = { ...agent, id: agents[idx] ? agents[idx].id : agent.id, updatedAt: nowIso };
  if (idx === -1) { next.createdAt = agent.createdAt || nowIso; agents.push(next); }
  else agents[idx] = { ...agents[idx], ...next, id: agents[idx].id, createdAt: agents[idx].createdAt || nowIso };
  writeFileAtomic(file, agents.map((a) => JSON.stringify(a)).join("\n") + (agents.length ? "\n" : ""), "utf8");
  return next;
}

export function writeRole(memoryDir, role) {
  const file = getRoleRegistryFile(memoryDir);
  ensureDir(path.dirname(file));
  const roles = readRoles(memoryDir);
  const key = String(role.id || "").trim().toLowerCase();
  if (!key) throw new Error("role requires an id");
  const idx = roles.findIndex((r) => String(r.id || "").trim().toLowerCase() === key);
  const nowIso = new Date().toISOString();
  const next = { ...role, id: roles[idx] ? roles[idx].id : role.id, updatedAt: nowIso };
  if (idx === -1) { next.createdAt = role.createdAt || nowIso; roles.push(next); }
  else roles[idx] = { ...roles[idx], ...next, id: roles[idx].id, createdAt: roles[idx].createdAt || nowIso };
  writeFileAtomic(file, roles.map((r) => JSON.stringify(r)).join("\n") + (roles.length ? "\n" : ""), "utf8");
  return next;
}

export function writeTeam(memoryDir, team) {
  const file = getTeamRegistryFile(memoryDir);
  ensureDir(path.dirname(file));
  const teams = readTeams(memoryDir);
  const key = String(team.id || "").trim().toLowerCase();
  if (!key) throw new Error("team requires an id");
  const idx = teams.findIndex((t) => String(t.id || "").trim().toLowerCase() === key);
  const nowIso = new Date().toISOString();
  const next = { ...team, id: teams[idx] ? teams[idx].id : team.id, updatedAt: nowIso };
  if (idx === -1) { next.createdAt = team.createdAt || nowIso; teams.push(next); }
  else teams[idx] = { ...teams[idx], ...next, id: teams[idx].id, createdAt: teams[idx].createdAt || nowIso };
  writeFileAtomic(file, teams.map((t) => JSON.stringify(t)).join("\n") + (teams.length ? "\n" : ""), "utf8");
  return next;
}

export function createDispatchRunId(job) {
  return createId(`dispatch-run:${job.id}:${job.refId}:${new Date().toISOString()}:${crypto.randomUUID()}`);
}

export function removePolicyRule(memoryDir, id, by = "manual") {
  const rules = readPolicyRules(memoryDir);
  const target = rules.find((rule) => rule.id === id || rule.id.startsWith(id));
  if (!target) {
    throw new Error(`Policy rule not found: ${id}`);
  }
  const file = getPolicyRulesFile(memoryDir);
  ensureDir(path.dirname(file));
  appendJsonl(file, {
    type: "policy.rule",
    id: target.id,
    actor: target.actor,
    project: target.project,
    operation: target.operation,
    scope: target.scope,
    decision: "__removed__",
    reason: "",
    priority: target.priority,
    createdAt: target.createdAt,
    createdBy: by,
    ts: new Date().toISOString()
  });
  return target;
}

export function updateNotificationStatus(memoryDir, notificationId, status, deliveredTo = []) {
  const file = path.join(memoryDir, "notifications", "notifications.jsonl");
  const notifications = readNotifications(memoryDir).map((n) => {
    if (n.id === notificationId) {
      return {
        ...n,
        status,
        deliveredTo: [...new Set([...(n.deliveredTo || []), ...deliveredTo])],
        updatedAt: new Date().toISOString()
      };
    }
    return n;
  });
  ensureDir(path.dirname(file));
  writeFileAtomic(file, notifications.map((n) => JSON.stringify(n)).join("\n") + "\n", "utf8");
}

export function updateDispatchQueueEntry(memoryDir, entryId, updates) {
  const file = path.join(memoryDir, "dispatch", "queue.jsonl");
  const entries = readDispatchQueue(memoryDir).map((entry) => {
    if (entry.id === entryId) {
      return {
        ...entry,
        ...updates,
        updatedAt: new Date().toISOString()
      };
    }
    return entry;
  });
  ensureDir(path.dirname(file));
  writeFileAtomic(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}

export function releaseLock(lockPath, owner = "") {
  try {
    fs.unlinkSync(lockPath);
    appendLockEvent(lockPath, {
      type: "released",
      owner: owner || "unknown",
      pid: process.pid,
      host: os.hostname()
    });
  } catch {
    // Lock may already be removed if it was considered stale.
  }
}

export function describeLock(lockPath, staleMs) {
  const data = readLockFile(lockPath);
  const stat = fs.existsSync(lockPath) ? fs.statSync(lockPath) : null;
  const createdAt = data.createdAt || "";
  const createdMs = createdAt ? Date.parse(createdAt) : NaN;
  const ageMs = Number.isNaN(createdMs)
    ? (stat ? Math.max(0, Math.round(Date.now() - stat.mtimeMs)) : null)
    : Math.max(0, Date.now() - createdMs);
  return {
    path: lockPath,
    owner: data.owner || "",
    pid: data.pid || null,
    host: data.host || "",
    cwd: data.cwd || "",
    createdAt,
    ageMs,
    staleMs,
    stale: ageMs !== null ? ageMs > staleMs : false,
    parseError: data.parseError || ""
  };
}

export function waitForRpcResult(memoryDir, requestId, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = readRpcResult(memoryDir, requestId);
    if (result) {
      return result;
    }
    sleep(500);
  }
  return null;
}
