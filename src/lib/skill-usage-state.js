import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "../atomic-write.js";
import { ensureDir } from "./cli.js";

const SKILL_USAGE_CAPTURE_STATE_VERSION = 1;

export function skillUsageCaptureStatePath(memoryDir) {
  return path.join(memoryDir, "state", "skill-usage-capture.json");
}

export function readSkillUsageCaptureState(memoryDir) {
  const file = skillUsageCaptureStatePath(memoryDir);
  if (!fs.existsSync(file)) {
    return { version: SKILL_USAGE_CAPTURE_STATE_VERSION, sources: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.sources) {
      return { version: SKILL_USAGE_CAPTURE_STATE_VERSION, sources: {} };
    }
    return { version: SKILL_USAGE_CAPTURE_STATE_VERSION, sources: parsed.sources };
  } catch {
    return { version: SKILL_USAGE_CAPTURE_STATE_VERSION, sources: {} };
  }
}

export function writeSkillUsageCaptureState(memoryDir, state) {
  const file = skillUsageCaptureStatePath(memoryDir);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, `${JSON.stringify({
    ...state,
    version: SKILL_USAGE_CAPTURE_STATE_VERSION,
    updatedAt: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
}

function sourceEntry(state, tool) {
  if (!state.sources[tool]) state.sources[tool] = { files: {}, lastScanAt: "", lastEventCount: 0 };
  if (!state.sources[tool].files) state.sources[tool].files = {};
  return state.sources[tool];
}

export function getSkillUsageFileProgress(state, tool, filePath, stat) {
  const entry = state.sources?.[tool]?.files?.[filePath];
  if (!entry) return { consumed: 0, unchanged: false, exhausted: false };
  const unchanged = entry.size === stat.size && entry.mtimeMs === stat.mtimeMs;
  const exhausted = unchanged && (Number(entry.consumed) || 0) >= (Number(entry.events) || 0);
  if (stat.size < entry.size) return { consumed: 0, unchanged, exhausted: false };
  return { consumed: Number(entry.consumed) || 0, unchanged, exhausted };
}

export function recordSkillUsageFile(state, tool, filePath, stat, totalEvents, consumed) {
  const entry = sourceEntry(state, tool);
  entry.files[filePath] = {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    events: totalEvents,
    consumed
  };
  entry.lastScanAt = new Date().toISOString();
  entry.lastEventCount = totalEvents;
}

export function resetSkillUsageCaptureState(state, tool = "") {
  if (!tool) return { version: SKILL_USAGE_CAPTURE_STATE_VERSION, sources: {} };
  delete state.sources[tool];
  return state;
}

export function summarizeSkillUsageCaptureState(state) {
  return Object.entries(state.sources || {}).map(([tool, entry]) => ({
    tool,
    files: Object.keys(entry.files || {}).length,
    events: Object.values(entry.files || {}).reduce((sum, item) => sum + (item.events || 0), 0),
    consumed: Object.values(entry.files || {}).reduce((sum, item) => sum + (item.consumed || 0), 0),
    lastScanAt: entry.lastScanAt || ""
  }));
}
