// 自动 turn 捕获：水印状态（capture state）
//
// 每个源每个文件记一份 (size, mtimeMs) 指纹。只有指纹变了才重新解析，
// 否则跳过——这样第二次扫描几乎是零成本，也不会重复入库。
//
// 注意：这里只按「文件」记水印，不按「turn」记。按 turn 记会让状态随记忆
// 增长无限膨胀；按文件记则只有 transcript 数量那么多条目（几百条量级）。
// 重复入库由 turnId 的确定性 + sync 的 knownIds 去重兜底，双保险。

import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "../atomic-write.js";
import { ensureDir } from "./cli.js";
import { listCaptureTools } from "./capture-sources.js";

const CAPTURE_STATE_VERSION = 1;

export function captureStatePath(memoryDir) {
  return path.join(memoryDir, "state", "capture-state.json");
}

export function readCaptureState(memoryDir) {
  const file = captureStatePath(memoryDir);
  if (!fs.existsSync(file)) {
    return { version: CAPTURE_STATE_VERSION, sources: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.sources) {
      return { version: CAPTURE_STATE_VERSION, sources: {} };
    }
    return { version: CAPTURE_STATE_VERSION, sources: parsed.sources };
  } catch {
    // 状态文件损坏时宁可全量重扫，也不要让扫描静默失败。
    return { version: CAPTURE_STATE_VERSION, sources: {} };
  }
}

export function writeCaptureState(memoryDir, state) {
  const file = captureStatePath(memoryDir);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, `${JSON.stringify({ ...state, version: CAPTURE_STATE_VERSION, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

function sourceEntry(state, tool) {
  if (!state.sources[tool]) {
    state.sources[tool] = { files: {}, lastScanAt: "", lastTurnCount: 0 };
  }
  if (!state.sources[tool].files) state.sources[tool].files = {};
  return state.sources[tool];
}

/**
 * 返回该文件已经消费掉的 turn 数。
 *
 * 只记「消费到第几条」而不是「文件已扫过」：周期扫描常带较小的 --limit，
 * 一个几十轮的大 transcript 要好几轮才吃得完。若只记「已扫过」，下一轮会因为
 * 文件指纹未变而整个跳过，进度永远停在第一次截断的地方。
 *
 * 文件体积变小视为被重写/压缩过，此时序号不再可信，从头开始。
 */
export function getCaptureFileProgress(state, tool, filePath, stat) {
  const entry = state.sources?.[tool]?.files?.[filePath];
  if (!entry) return { consumed: 0, unchanged: false, exhausted: false };
  const unchanged = entry.size === stat.size && entry.mtimeMs === stat.mtimeMs;
  // 指纹没变且上次已经吃完：不必再解析这个文件。
  const exhausted = unchanged && (Number(entry.consumed) || 0) >= (Number(entry.turns) || 0);
  if (stat.size < entry.size) return { consumed: 0, unchanged, exhausted: false };
  return { consumed: Number(entry.consumed) || 0, unchanged, exhausted };
}

export function recordCaptureFile(state, tool, filePath, stat, totalTurns, consumed) {
  const entry = sourceEntry(state, tool);
  entry.files[filePath] = {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    turns: totalTurns,
    consumed
  };
  entry.lastScanAt = new Date().toISOString();
  entry.lastTurnCount = totalTurns;
}

export function resetCaptureState(state, tool = "") {
  if (!tool) return { version: CAPTURE_STATE_VERSION, sources: {} };
  delete state.sources[tool];
  return state;
}

export function summarizeCaptureState(state) {
  const tools = listCaptureTools().filter((tool) => state.sources?.[tool]);
  return tools.map((tool) => {
    const entry = state.sources[tool];
    return {
      tool,
      files: Object.keys(entry.files || {}).length,
      turns: Object.values(entry.files || {}).reduce((sum, item) => sum + (item.turns || 0), 0),
      consumed: Object.values(entry.files || {}).reduce((sum, item) => sum + (item.consumed || 0), 0),
      lastScanAt: entry.lastScanAt || ""
    };
  });
}
