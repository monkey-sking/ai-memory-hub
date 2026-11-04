import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { projectFromCwd } from "./capture-sources.js";

const SKILL_FILE_PATTERN = /([A-Za-z0-9][A-Za-z0-9._-]*)\/SKILL\.md/gi;

export function extractSkillUsageEvents(tool, lines, filePath) {
  const fileKey = crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 10);
  const context = {
    tool: String(tool || "unknown"),
    sessionId: path.basename(filePath, ".jsonl"),
    cwd: "",
    project: "",
    lastTs: ""
  };
  const events = [];

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    updateContext(context, record);
    const ts = normalizeTimestamp(record.timestamp) || context.lastTs;
    if (ts) context.lastTs = ts;

    const payload = record.payload || {};
    if (record.type === "response_item" && payload.type === "function_call") {
      events.push(...eventsFromCommand(commandFromFunctionCall(payload), context, ts, fileKey));
    }

    if (record.type === "event_msg") {
      const item = payload.item || {};
      if (item.type === "CommandExecution") {
        events.push(...eventsFromCommand(commandFromArray(item.command), context, ts, fileKey));
      }
      if (item.type === "McpToolCall") {
        events.push(...eventsFromMcpArguments(item.arguments, context, ts, fileKey));
      }
    }
  }

  return events;
}

export function extractSkillUsageEventsFromFile(tool, filePath) {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  return extractSkillUsageEvents(tool, raw.split("\n"), filePath);
}

function updateContext(context, record) {
  const payload = record.payload || {};
  if (record.sessionId) context.sessionId = String(record.sessionId);
  if (record.cwd) context.cwd = String(record.cwd);
  if (record.type === "session_meta") {
    if (payload.id) context.sessionId = String(payload.id);
    if (payload.cwd) context.cwd = String(payload.cwd);
  }
  if (record.type === "event_msg" && payload.thread_id) context.sessionId = String(payload.thread_id);
  context.project = projectFromCwd(context.cwd);
}

function commandFromFunctionCall(payload) {
  if (typeof payload.arguments !== "string") return "";
  try {
    const parsed = JSON.parse(payload.arguments);
    return String(parsed?.cmd || "");
  } catch {
    return payload.arguments;
  }
}

function commandFromArray(command) {
  if (typeof command === "string") return command;
  if (!Array.isArray(command)) return "";
  return command.map((item) => String(item || "")).join(" ");
}

function eventsFromCommand(command, context, ts, fileKey) {
  const value = String(command || "");
  if (!value) return [];
  const events = [];
  const base = eventBase(context, ts, fileKey);

  if (/(?:^|\s)skill\s+usage\s+record\b/i.test(value)) {
    const skill = optionValue(value, "--skill");
    if (skill) {
      events.push({
        ...base,
        skill,
        signal: normalizeSignal(optionValue(value, "--signal")) || "loaded"
      });
    }
  }

  if (/(?:^|\s)skill\s+(?:attach|show)\b/i.test(value)) {
    const skill = optionValue(value, "--skill");
    if (skill) events.push({ ...base, skill, signal: "adopted" });
  }

  for (const match of value.matchAll(SKILL_FILE_PATTERN)) {
    const skill = normalizeSkillId(match[1]);
    if (skill) events.push({ ...base, skill, signal: "loaded" });
  }
  return dedupeEvents(events);
}

function eventsFromMcpArguments(argumentsValue, context, ts, fileKey) {
  if (!argumentsValue || typeof argumentsValue !== "object") return [];
  const skills = [
    ...skillList(argumentsValue.skill),
    ...skillList(argumentsValue.skillId),
    ...skillList(argumentsValue.skills)
  ].map(normalizeSkillId).filter(Boolean);
  const base = eventBase(context, ts, fileKey);
  return dedupeEvents(skills.map((skill) => ({ ...base, skill, signal: "adopted" })));
}

function eventBase(context, ts, fileKey) {
  return {
    agent: context.tool,
    project: context.project,
    source: `capture:${context.tool}`,
    sessionId: context.sessionId,
    evidence: [`transcript:${fileKey}`],
    ts: ts || new Date().toISOString()
  };
}

function optionValue(text, name) {
  const pattern = new RegExp(`${escapeRegExp(name)}(?:\\s+|=)("([^"]+)"|'([^']+)'|([^\\s]+))`, "i");
  const match = String(text || "").match(pattern);
  if (!match) return "";
  return match[2] || match[3] || match[4] || "";
}

function skillList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeSkillId(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeSignal(value) {
  const signal = String(value || "").trim().toLowerCase();
  return ["search_hit", "loaded", "adopted", "pinned", "unpinned"].includes(signal) ? signal : "";
}

function normalizeTimestamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.skill.toLowerCase()}:${event.signal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
