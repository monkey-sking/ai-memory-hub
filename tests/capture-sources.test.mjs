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

test("cleanCaptureText keeps the real request that follows an ambient UI block", () => {
  // 实测结构：交互客户端把环境块注在真人请求**之前**，再用 `## My request:` 标记起点。
  // 只剥环境块、并把后面的请求留下——整条丢弃会丢掉真人说的话。
  const text = [
    '<in-app-browser-context source="ambient-ui-state">',
    "This block is automatically supplied ambient UI state, not part of the user's request.",
    "# In app browser:",
    "- Current URL: file:///x/index.html",
    "</in-app-browser-context>",
    "",
    "## My request:",
    "进行下消融实验"
  ].join("\n");
  const cleaned = cleanCaptureText(text);
  assert.equal(cleaned, "进行下消融实验");
  assert.ok(!cleaned.includes("ambient-ui-state"));
  assert.ok(!cleaned.includes("## My request"));
});

test("an ambient block with no human request behind it is dropped entirely", () => {
  const text = [
    '<in-app-browser-context source="ambient-ui-state">',
    "The user has the in-app browser open with 1 tab.",
    "</in-app-browser-context>"
  ].join("\n");
  const cleaned = cleanCaptureText(text);
  assert.equal(cleaned, "");
  assert.equal(isCaptureWorthy(cleaned), false);
});

test("cleanCaptureText unwraps the codex delegation envelope but keeps its payload", () => {
  // 信封是 harness 生成的，但 <input> 里装的是真人写的任务，不能一起丢。
  const text = [
    "<codex_delegation>",
    "  <source_thread_id>01a0458b-ed3a-7062-b770-dc8c6070c7ef</source_thread_id>",
    "  <input>在 /repo 直接实现用户需求，保留当前所有未提交改动</input>",
    "</codex_delegation>"
  ].join("\n");
  const cleaned = cleanCaptureText(text);
  assert.equal(cleaned, "在 /repo 直接实现用户需求，保留当前所有未提交改动");
  assert.ok(!cleaned.includes("source_thread_id"));
  assert.ok(!cleaned.includes("codex_delegation"));
});

test("short but complete Chinese requests survive the length gate", () => {
  // 阈值按码元算，中文信息密度高：7 个字就是一句完整请求，不能按英文的直觉砍掉。
  assert.equal(isCaptureWorthy("进行下消融实验"), true);
  assert.equal(isCaptureWorthy("修复登录超时"), true);
  // 但仍然要挡住没有信息量的应答。
  assert.equal(isCaptureWorthy("好的"), false);
  assert.equal(isCaptureWorthy("继续"), false);
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
