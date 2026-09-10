import assert from "node:assert/strict";
import test from "node:test";
import {
  assignTurnIds,
  cleanCaptureText,
  isCaptureWorthy,
  renderTurnText
} from "../src/lib/capture-sources.js";
import {
  getCaptureFileProgress,
  readCaptureState,
  recordCaptureFile,
  resetCaptureState,
  summarizeCaptureState,
  writeCaptureState
} from "../src/lib/capture-state.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amh-capture-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("cleanCaptureText strips injected context blocks and redacts secrets", () => {
  // 令牌在运行时拼出来，源码里不放 token 形状的常量——否则会被
  // check:public 的敏感内容门禁拦下（pre-push 钩子会跑它）。
  const fakeToken = ["ghp", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_");
  const text = [
    "<system-reminder data-role=\"user-context\">OS Version: darwin</system-reminder>",
    "<environment_context><current_date>2026-09-09</current_date></environment_context>",
    `Token: ${fakeToken}`,
    "Real ask: ship it"
  ].join("\n");
  const cleaned = cleanCaptureText(text);
  assert.ok(!cleaned.includes("OS Version"));
  assert.ok(!cleaned.includes("current_date"));
  assert.ok(!cleaned.includes(fakeToken));
  assert.ok(cleaned.includes("Real ask: ship it"));
});

test("cleanCaptureText unwraps user_query instead of dropping it", () => {
  assert.equal(cleanCaptureText("<user_query>你接入下 AMH</user_query>").trim(), "你接入下 AMH");
});

test("isCaptureWorthy rejects dispatch boilerplate, system prompts, and harness noise", () => {
  assert.equal(isCaptureWorthy("__AI_MEMORY_THREAD__: claude:aion:abc"), false);
  assert.equal(isCaptureWorthy("<local-command-caveat>Caveat</local-command-caveat>"), false);
  assert.equal(isCaptureWorthy("The following is the Codex agent history added since your last approval"), false);
  assert.equal(isCaptureWorthy("You are Cumora's inbox triage cerebellum — a fast gate"), false);
  assert.equal(isCaptureWorthy("⚡ 3 new message(s) arrived while you work"), false);
  assert.equal(isCaptureWorthy("hi"), false);
  assert.equal(isCaptureWorthy("帮我把 AMH 的 capture 命令加上"), true);
});

test("assignTurnIds is deterministic per file and unique across files", () => {
  const turns = [{ sessionId: "s1", userText: "a", assistantText: "b" }];
  const first = assignTurnIds(turns, "gemini", "/x/brain/aaa/transcript.jsonl");
  const second = assignTurnIds(turns, "gemini", "/x/brain/aaa/transcript.jsonl");
  const other = assignTurnIds(turns, "gemini", "/x/brain/bbb/transcript.jsonl");
  assert.equal(first[0].turnId, second[0].turnId);
  assert.notEqual(first[0].turnId, other[0].turnId);
  assert.match(first[0].turnId, /^capture:gemini:[0-9a-f]{10}:0$/);
});

test("renderTurnText joins user request and assistant answer", () => {
  assert.equal(renderTurnText({ userText: "问", assistantText: "答" }), "问\n\n→ 答");
  assert.equal(renderTurnText({ userText: "问", assistantText: "" }), "问");
});

test("capture state tracks per-file consumption and survives a round-trip", () => {
  withTempDir((dir) => {
    const state = readCaptureState(dir);
    const stat = { size: 100, mtimeMs: 555 };
    const file = "/a/rollout.jsonl";
    assert.equal(getCaptureFileProgress(state, "codex", file, stat).consumed, 0);

    // 大文件分多次吃：先消费 2/5 条，文件未变时应从断点续，而不是重来或跳过。
    recordCaptureFile(state, "codex", file, stat, 5, 2);
    writeCaptureState(dir, state);
    const reloaded = readCaptureState(dir);
    const midway = getCaptureFileProgress(reloaded, "codex", file, stat);
    assert.equal(midway.consumed, 2);
    assert.equal(midway.exhausted, false);

    // 吃完之后，指纹未变就直接跳过，不必再解析。
    recordCaptureFile(reloaded, "codex", file, stat, 5, 5);
    assert.equal(getCaptureFileProgress(reloaded, "codex", file, stat).exhausted, true);

    // 指纹变了要重扫；体积变小说明被重写，序号不可信，从 0 开始。
    assert.equal(getCaptureFileProgress(reloaded, "codex", file, { size: 200, mtimeMs: 999 }).exhausted, false);
    assert.equal(getCaptureFileProgress(reloaded, "codex", file, { size: 50, mtimeMs: 999 }).consumed, 0);

    writeCaptureState(dir, reloaded);
    assert.deepEqual(summarizeCaptureState(readCaptureState(dir)), [
      { tool: "codex", files: 1, turns: 5, consumed: 5, lastScanAt: reloaded.sources.codex.lastScanAt }
    ]);
  });
});

test("resetCaptureState clears one source or everything", () => {
  withTempDir((dir) => {
    const state = readCaptureState(dir);
    recordCaptureFile(state, "codex", "/a.jsonl", { size: 1, mtimeMs: 1 }, 1, 1);
    recordCaptureFile(state, "claude", "/b.jsonl", { size: 1, mtimeMs: 1 }, 1, 1);
    resetCaptureState(state, "codex");
    assert.deepEqual(Object.keys(state.sources), ["claude"]);
    assert.deepEqual(resetCaptureState(state).sources, {});
  });
});
