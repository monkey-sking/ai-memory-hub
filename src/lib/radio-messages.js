// 从 src/index.js 下沉的 radio message I/O + 归一化族（v3.0 重构 P0-2）。
// 处理广播（radio）消息的读取、归一化、损坏恢复、更新与未读筛选。
// 该族是所有 relay/radio dispatch 状态机簇（appendRelayStatus / updateDispatchSourceState /
// dispatch 重试编排等）的共享地基 —— 先沉它，后续大簇才能直连 import，不再把
// readRadioMessages / normalizeRadioMessage 当 index 内部符号。
//
// 纯自包含簇：仅依赖 node 内置（path）+ 已沉模块（io/cli/entity-models）+ 顶层模块
// （../atomic-write.js），以及本簇内部共享的损坏标记（CORRUPTION_MARKER_PATTERN /
// containsCorruptionMarker）。无任何 index.js 内部符号 → 直连 import，无需 init 注入。

import path from "node:path";
import { readEvents, readRadioCursor } from "./io.js";
import { createId, ensureDir, isPlainObject } from "./cli.js";
import { normalizeDispatchWorktreeMetadata } from "./entity-models.js";
import { writeFileAtomic } from "../atomic-write.js";

export const CORRUPTION_MARKER_PATTERN = /[\u0000\ufffd]/;

export function containsCorruptionMarker(value) {
  return CORRUPTION_MARKER_PATTERN.test(String(value || ""));
}

export function isCorruptedRadioMessage(message) {
  return String(message.from || "").toLowerCase() === "raw" ||
    String(message.type || "").toLowerCase() === "raw" ||
    containsCorruptionMarker(message.text) ||
    containsCorruptionMarker(message.thread) ||
    containsCorruptionMarker(message.replyTo);
}

export function readRadioMessages(memoryDir) {
  const file = path.join(memoryDir, "radio", "messages.jsonl");
  return readEvents(file).map(normalizeRadioMessage);
}

export function normalizeRadioMessage(message) {
  const recovered = recoverEmbeddedJsonMessage(message.text);
  const content = recovered || message;
  return {
    id: message.id || content.id || createId(JSON.stringify(message)),
    ts: message.ts || content.ts || "",
    from: content.from || content.source || message.from || message.source || "unknown",
    to: content.to || message.to || "all",
    type: content.type || message.type || message.metadata?.kind || "note",
    text: content.text || message.text || "",
    thread: content.thread || message.thread || "",
    replyTo: content.replyTo || content.reply_to || message.replyTo || message.reply_to || "",
    project: content.project || message.project || "",
    metadata: message.metadata || content.metadata || {},
    deliveryState: message.deliveryState || "pending",
    deliveryUpdatedAt: message.deliveryUpdatedAt || "",
    dispatchId: message.dispatchId || "",
    threadKey: message.threadKey || "",
    attempt: Number(message.attempt || 0),
    maxRetries: Number(message.maxRetries || 0),
    nextRetryAt: message.nextRetryAt || "",
    sessionId: message.sessionId || "",
    lastError: message.lastError || "",
    progressPercent: message.progressPercent ?? null,
    progressStatus: message.progressStatus || "",
    progressAt: message.progressAt || "",
    progressBy: message.progressBy || "",
    worktree: normalizeDispatchWorktreeMetadata(message.worktree),
    promoted: Boolean(message.promoted),
    promotedAt: message.promotedAt || ""
  };
}

export function recoverEmbeddedJsonMessage(value) {
  const text = String(value || "");
  if (!text || !containsCorruptionMarker(text)) {
    return null;
  }
  const candidate = text
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u001f\u007f]/g, "")
    .trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function updateRadioMessage(memoryDir, id, patch) {
  const file = path.join(memoryDir, "radio", "messages.jsonl");
  const messages = readRadioMessages(memoryDir).map((message) => (
    message.id === id ? { ...message, ...patch } : message
  ));
  ensureDir(path.dirname(file));
  writeFileAtomic(file, messages.map((message) => JSON.stringify(message)).join("\n") + (messages.length ? "\n" : ""), "utf8");
}

export function getUnreadRadioMessages(memoryDir, consumer) {
  const messages = readRadioMessages(memoryDir);
  const cursor = readRadioCursor(memoryDir, consumer);
  const startIdx = cursor.lastMessageId
    ? messages.findIndex((m) => m.id === cursor.lastMessageId)
    : -1;
  const after = startIdx === -1 ? messages : messages.slice(startIdx + 1);
  const processed = new Set(cursor.processedIds);
  return after.filter((m) => !processed.has(m.id));
}
