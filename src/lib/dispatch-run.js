// Dispatch 单任务执行链（P0-2 第22批下沉）。v3.0 重构目标：把「一次 dispatch
// job 从建仓 → 跑 runner → 归档 run 记录」的完整同步/异步执行链收拢到一个模块，
// 让 src/index.js 的 dispatch 调度层（重试编排 / 并发池）只依赖本模块的入口函数。
//
// 从 src/index.js 迁出 11 个函数：
//   prepareDispatchWorktree / resolveDispatchWorktreeRoot   — git worktree 隔离
//   prepareDispatchJobContext / finalizeDispatchJob          — 任务上下文构造与收尾
//   runDispatchJob / runDispatchJobAsync                     — 同步/异步执行入口
//   invokeRunnerCommand / invokeRunnerCommandAsync           — 底层 runner spawn
//   renderDispatchPrompt / renderCompactDispatchPrompt       — prompt 渲染
//   writeDispatchRunLog                                      — stdout/stderr 落盘
//
// 依赖说明：
// - lib/ 模块函数（shell / dispatch / backup / cli / io / format / util）
//   → 直连 import，保持无环。
// - index.js 内部常量（DEFAULT_DISPATCH_WORKTREE_DIR / DISPATCH_RUNS_DIR /
//   DEFAULT_DISPATCH_RUN_TIMEOUT_MS）→ 经 initDispatchRunDeps(deps) 注入，
//   由 src/index.js 在模块导入后立即调用（须置于常量定义之后，TDZ-safe）。
//   本模块绝不 import src/index.js（保持依赖图无环）。
//
// 消费方：src/index.js 直接 import 本模块入口（invokeRunnerCommand /
//   runDispatchJob / runDispatchJobAsync / resolveDispatchWorktreeRoot），
//   dispatch-pool.js 亦直连 import runDispatchJobAsync —— 不再经 init 注入
//   dispatch 执行链，彻底打破原「dispatch 引擎整簇无法下沉」的耦合。

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { writeFileAtomic } from "../atomic-write.js";
import { createSessionSupervisor } from "../session-supervisor-service.js";
import { assertSafeDispatchWorktreeRoot, ensureSafeChildPath } from "./backup.js";
import { ensureDir } from "./cli.js";
import {
  appendDispatchRunRecord,
  buildRunnerArgs,
  createDispatchRunId,
  parseRunnerOutput,
  resolveCredentialEnvironment
} from "./io.js";
import {
  buildDispatchWorktreeBranch,
  buildDispatchWorktreeSlug,
  getDispatchRunStatus,
  getDispatchRunVerificationResult,
  getDispatchThreadKey,
  normalizeRunnerStderr,
  renderDispatchQualityGate
} from "./dispatch.js";
import { summarizeText, trimOutput } from "./format.js";
import {
  buildRunnerInvocation,
  collectDispatchWorktreeReviewMetadata,
  resolveGitRepositoryRoot,
  runGitCommand
} from "./shell.js";
import { renderDispatchWorktree } from "./util.js";

// index.js 内部常量经 init 注入（由 src/index.js 在常量定义后立即调用）。
let DEFAULT_DISPATCH_WORKTREE_DIR = ".ai-worktrees";
let DISPATCH_RUNS_DIR = "dispatch-runs";
let DEFAULT_DISPATCH_RUN_TIMEOUT_MS = 10 * 60 * 1000;

export function initDispatchRunDeps(deps) {
  DEFAULT_DISPATCH_WORKTREE_DIR = deps.DEFAULT_DISPATCH_WORKTREE_DIR;
  DISPATCH_RUNS_DIR = deps.DISPATCH_RUNS_DIR;
  DEFAULT_DISPATCH_RUN_TIMEOUT_MS = deps.DEFAULT_DISPATCH_RUN_TIMEOUT_MS;
}

export function prepareDispatchWorktree(job, { root = "" } = {}) {
  const repoRoot = resolveGitRepositoryRoot(process.cwd());
  const base = runGitCommand(repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const branch = buildDispatchWorktreeBranch(job);
  const worktreeRoot = resolveDispatchWorktreeRoot(repoRoot, root);
  const worktreePath = path.join(worktreeRoot, buildDispatchWorktreeSlug(job));
  assertSafeDispatchWorktreeRoot(repoRoot, worktreeRoot);
  ensureSafeChildPath(worktreePath, worktreeRoot);
  ensureDir(worktreeRoot);

  const exists = fs.existsSync(worktreePath);
  if (!exists) {
    const branchRef = `refs/heads/${branch}`;
    const branchExists = runGitCommand(repoRoot, ["rev-parse", "--verify", branchRef], { allowFailure: true }).ok;
    const args = branchExists
      ? ["worktree", "add", worktreePath, branch]
      : ["worktree", "add", "-b", branch, worktreePath, base];
    runGitCommand(repoRoot, args);
  } else {
    const validation = runGitCommand(worktreePath, ["rev-parse", "--show-toplevel"], { allowFailure: true });
    if (!validation.ok) {
      throw new Error(`Dispatch worktree path already exists but is not a git worktree: ${worktreePath}`);
    }
  }

  const head = runGitCommand(worktreePath, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim() || base;
  return {
    enabled: true,
    repoRoot,
    root: worktreeRoot,
    path: worktreePath,
    branch,
    base,
    head,
    reused: exists,
    createdAt: new Date().toISOString()
  };
}

export function resolveDispatchWorktreeRoot(repoRoot, rootOption = "") {
  const raw = String(rootOption || DEFAULT_DISPATCH_WORKTREE_DIR).trim();
  return path.resolve(repoRoot, raw);
}

export function prepareDispatchJobContext(memoryDir, job, runner, options = {}) {
  const initialWorktree = options.isolateWorktree
    ? prepareDispatchWorktree(job, { root: options.worktreeRoot })
    : null;
  const jobWithWorktree = initialWorktree ? { ...job, worktree: initialWorktree } : job;
  const prompt = runner.compactPrompt
    ? renderCompactDispatchPrompt(memoryDir, jobWithWorktree)
    : renderDispatchPrompt(memoryDir, jobWithWorktree);
  const args = buildRunnerArgs(memoryDir, jobWithWorktree, runner, prompt);
  const input = runner.promptMode === "stdin" ? prompt : "";
  const runId = createDispatchRunId(job);
  const cwd = initialWorktree?.path || process.cwd();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const invocation = buildRunnerInvocation(runner, args);
  const supervisor = createSessionSupervisor({ memoryDir });
  const leaseSessionId = job.sessionId || `dispatch:${runId}`;
  supervisor.start({
    sessionId: leaseSessionId,
    tool: job.tool || runner.tool || "unknown",
    project: job.project || "",
    cwd,
    transport: "amh-dispatch"
  });
  return {
    initialWorktree,
    jobWithWorktree,
    args,
    input,
    runId,
    cwd,
    startedAtMs,
    startedAt,
    invocation,
    supervisor,
    leaseSessionId,
    credentialEnv: resolveCredentialEnvironment(memoryDir, job.credentialRefs || job.credentials || [])
  };
}

export function finalizeDispatchJob(memoryDir, job, runner, completed, ctx) {
  const { initialWorktree, jobWithWorktree, runId, cwd, startedAtMs, startedAt, invocation, supervisor, leaseSessionId } = ctx;
  const finishedAtMs = Date.now();
  const finishedAt = new Date(finishedAtMs).toISOString();
  const parsed = parseRunnerOutput(memoryDir, jobWithWorktree, runner, completed.stdout);
  const normalizedStderr = normalizeRunnerStderr(job.tool, completed.stderr);
  const stdoutLogPath = writeDispatchRunLog(memoryDir, runId, "stdout", completed.stdout);
  const stderrLogPath = writeDispatchRunLog(memoryDir, runId, "stderr", completed.stderr);
  const runStatus = getDispatchRunStatus(completed);
  const verificationResult = getDispatchRunVerificationResult(runStatus, completed.status);
  const worktree = initialWorktree
    ? collectDispatchWorktreeReviewMetadata(initialWorktree)
    : null;
  const errorSummary = summarizeText(completed.error?.message || normalizedStderr.stderr || "", 220);
  supervisor.finish(leaseSessionId, {
    status: runStatus === "completed" ? "completed" : "failed",
    exitCode: completed.status ?? null,
    error: errorSummary
  });
  const runRecord = {
    runId,
    dispatchId: job.id,
    threadKey: getDispatchThreadKey(job),
    sourceKind: job.kind || "",
    sourceId: job.refId || "",
    tool: job.tool || "",
    project: job.project || "",
    model: job.model || "",
    command: invocation.command,
    commandArgs: invocation.args,
    commandLine: invocation.commandLine,
    cwd,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    timeoutMs: DEFAULT_DISPATCH_RUN_TIMEOUT_MS,
    exitCode: completed.status ?? null,
    status: runStatus,
    errorSummary,
    stdoutLogPath,
    stderrLogPath,
    stdoutBytes: Buffer.byteLength(String(completed.stdout || ""), "utf8"),
    stderrBytes: Buffer.byteLength(String(completed.stderr || ""), "utf8"),
    verificationResult,
    ...(worktree ? { worktree } : {})
  };
  appendDispatchRunRecord(memoryDir, runRecord);
  return {
    ...job,
    runnable: true,
    exitCode: completed.status,
    stdout: trimOutput(parsed.stdout),
    stderr: trimOutput(normalizedStderr.stderr),
    stderrWarnings: normalizedStderr.warnings,
    error: completed.error ? completed.error.message : "",
    sessionId: parsed.sessionId || job.sessionId || "",
    runnerMode: runner.promptMode || "",
    runnerCommand: runner.commandName || runner.command || "",
    runnerShell: runner.usesShell ? runner.shell || "shell" : "",
    runId,
    runStatus,
    runStartedAt: startedAt,
    runFinishedAt: finishedAt,
    runDurationMs: Math.max(0, finishedAtMs - startedAtMs),
    stdoutLogPath,
    stderrLogPath,
    runRecordPath: path.join("state", "dispatch-runs.jsonl").replace(/\\/g, "/"),
    verificationResult,
    ...(worktree ? { worktree } : {})
  };
}

export function runDispatchJob(memoryDir, job, runner, options = {}) {
  const ctx = prepareDispatchJobContext(memoryDir, job, runner, options);
  let completed;
  try {
    completed = invokeRunnerCommand(runner, ctx.args, ctx.input, DEFAULT_DISPATCH_RUN_TIMEOUT_MS, ctx.cwd, ctx.credentialEnv);
  } catch (error) {
    ctx.supervisor.finish(ctx.leaseSessionId, { status: "failed", error: error.message });
    throw error;
  }
  return finalizeDispatchJob(memoryDir, job, runner, completed, ctx);
}

export async function runDispatchJobAsync(memoryDir, job, runner, options = {}) {
  const ctx = prepareDispatchJobContext(memoryDir, job, runner, options);
  let completed;
  try {
    completed = await invokeRunnerCommandAsync(runner, ctx.args, ctx.input, DEFAULT_DISPATCH_RUN_TIMEOUT_MS, ctx.cwd, ctx.credentialEnv);
  } catch (error) {
    ctx.supervisor.finish(ctx.leaseSessionId, { status: "failed", error: error.message });
    throw error;
  }
  return finalizeDispatchJob(memoryDir, job, runner, completed, ctx);
}

export function invokeRunnerCommand(runner, args = [], input = "", timeoutMs = DEFAULT_DISPATCH_RUN_TIMEOUT_MS, cwd = process.cwd(), credentialEnv = {}) {
  const invocation = buildRunnerInvocation(runner, args);
  const useCmdLauncher = invocation.usesShell;
  const command = useCmdLauncher ? invocation.commandLine : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    shell: useCmdLauncher,
    input,
    env: { ...process.env, ...credentialEnv }
  });
}

// Async twin of invokeRunnerCommand for the concurrent dispatch pool (feature ④).
// Uses non-blocking spawn so multiple tool runners can execute in parallel. Retries
// only transient transport errors (spawn/connection), never logical exit failures.
export async function invokeRunnerCommandAsync(runner, args = [], input = "", timeoutMs = DEFAULT_DISPATCH_RUN_TIMEOUT_MS, cwd = process.cwd(), credentialEnv = {}, { transientRetries = 2, transientBackoffMs = 500 } = {}) {
  const invocation = buildRunnerInvocation(runner, args);
  const useCmdLauncher = invocation.usesShell;
  const command = useCmdLauncher ? invocation.commandLine : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  let lastError;
  for (let attempt = 0; attempt <= transientRetries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential retry, not parallel
      const completed = await new Promise((resolve, reject) => {
        let child;
        try {
          child = spawn(command, commandArgs, {
            cwd,
            env: { ...process.env, ...credentialEnv },
            windowsHide: true,
            shell: useCmdLauncher
          });
        } catch (spawnErr) {
          reject(spawnErr);
          return;
        }
        let stdout = "";
        let stderr = "";
        if (child.stdout) {
          child.stdout.setEncoding("utf8").on("data", (d) => { stdout += d; });
        }
        if (child.stderr) {
          child.stderr.setEncoding("utf8").on("data", (d) => { stderr += d; });
        }
        if (input && child.stdin) {
          try { child.stdin.end(input); } catch {}
        }
        const timer = setTimeout(() => {
          try { child.kill("SIGKILL"); } catch {}
          resolve({ status: null, signal: "SIGKILL", stdout, stderr, error: { message: `Runner exceeded ${timeoutMs}ms timeout` } });
        }, timeoutMs);
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on("close", (code, signal) => {
          clearTimeout(timer);
          resolve({ status: code, signal, stdout, stderr, error: null });
        });
      });
      return completed;
    } catch (error) {
      lastError = error;
      const text = String(error?.code || error?.message || "");
      const transient = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPERM|EPIPE|ENOENT/i.test(text);
      if (!transient || attempt === transientRetries) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, transientBackoffMs * (attempt + 1)));
    }
  }
  throw lastError;
}

export function renderDispatchPrompt(memoryDir, job) {
  const qualityGateLines = renderDispatchQualityGate(job);
  const worktreeLines = renderDispatchWorktree(job.worktree);
  return [
    `__AI_MEMORY_THREAD__: ${getDispatchThreadKey(job)}`,
    `Dispatch target: ${job.tool}`,
    `Project: ${job.project || "(none)"}`,
    `Kind: ${job.kind}`,
    `Ref: ${job.refId}`,
    "",
    "Instructions:",
    "- Continue the existing thread context if this dispatch resumes a prior session.",
    "- Do the dispatched task directly. Do not introduce yourself, list tools, or ask what to work on.",
    "- Keep the response compact: at most 6 short bullets or 1 short paragraph.",
    "- If the payload asks for a design or plan, return concrete steps and state transitions.",
    "- For work expected to take longer than 30 seconds, report heartbeat/progress with: ai-memory-hub dispatch progress --thread-key " + getDispatchThreadKey(job) + " --percent <0-100> --status \"short status\" --by " + (job.tool || "tool"),
    "- If you need to mention follow-up, end with a single 'Next:' line.",
    "",
    ...(qualityGateLines.length > 0 ? [
      "Quality gate:",
      ...qualityGateLines,
      ""
    ] : []),
    ...(worktreeLines.length > 0 ? [
      "Execution isolation:",
      ...worktreeLines,
      ""
    ] : []),
    "Autonomous safety rules:",
    "- Follow the user's current guardrails, project instructions, and repository policy.",
    "- Do not run git push, delete files, run destructive cleanup, install dependencies, or change system configuration unless this dispatch payload explicitly authorizes it.",
    "- Local git commits are allowed only when current user/project rules allow them and the work has passed verification.",
    "- For important code changes, run focused tests and request cross-AI review when available before closing the source task.",
    "",
    "Payload:",
    job.text
  ].join("\n");
}

export function renderCompactDispatchPrompt(memoryDir, job) {
  const qualityGateLines = renderDispatchQualityGate(job);
  const worktreeLines = renderDispatchWorktree(job.worktree);
  const parts = [
    `Payload: ${job.text}`,
    "Instruction: Do this AI Memory Hub dispatch payload directly; keep the response compact; do not ask what to work on.",
    qualityGateLines.length > 0 ? `Quality gate: ${qualityGateLines.join("; ")}` : "",
    worktreeLines.length > 0 ? `Execution isolation: ${worktreeLines.join("; ")}` : "",
    "Safety: Do not run git push, delete files, run destructive cleanup, install dependencies, or change system configuration unless explicitly authorized in the payload. If you cannot proceed, say exactly what configuration or input is missing.",
    `AMH metadata: thread=${getDispatchThreadKey(job)} project=${job.project || "(none)"} ref=${job.refId}`
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function writeDispatchRunLog(memoryDir, runId, stream, text) {
  const safeRunId = String(runId || "run").replace(/[^a-zA-Z0-9_.-]+/g, "-");
  const safeStream = stream === "stderr" ? "stderr" : "stdout";
  const relativePath = path.join(DISPATCH_RUNS_DIR, `${safeRunId}.${safeStream}.log`);
  const file = path.join(memoryDir, relativePath);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, String(text || ""), "utf8");
  return relativePath.replace(/\\/g, "/");
}
