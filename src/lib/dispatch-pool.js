// Dispatch pool 引擎（feature ④：并发池 + 实时状态）。v3.0 重构 P0-2 第21批下沉。
// 从 src/index.js 迁出：dispatchPoolState 单例 + 4 个状态修改器 + getDispatchPoolSnapshot
// + runDispatchPool，把「并发池状态」自洽子系统收拢到一个模块。
//
// 依赖说明：
// - lib/ 模块函数（createDispatchRunId / io / runDispatchJobAsync）→ 直连 import。
//   runDispatchJobAsync 已随 P0-2 第22批下沉到 ./dispatch-run.js，本模块直接复用，
//   不再经 init 注入 —— dispatch 执行链不再与 index.js 耦合。
// - index.js 内部符号（DISPATCH_MAX_CONCURRENCY — index 常量）→ 经 initDispatchPoolDeps(deps)
//   注入。本模块绝不 import src/index.js（保持依赖图无环）。

import { createDispatchRunId } from "./io.js";
import { runDispatchJobAsync } from "./dispatch-run.js";

// Module-level singleton tracking active pool execution for dashboard visibility.
// (原 index.js 2644 迁入)
const dispatchPoolState = {
  active: false,
  concurrency: 1,
  total: 0,
  completed: 0,
  failed: 0,
  running: [],
  finished: [],
  startedAt: null,
  finishedAt: null,
  lastError: null
};

// index.js 内部符号经 init 注入（由 src/index.js 在模块导入后立即调用）。
let DISPATCH_MAX_CONCURRENCY = 6;

export function initDispatchPoolDeps(deps) {
  DISPATCH_MAX_CONCURRENCY = deps.DISPATCH_MAX_CONCURRENCY;
}

export function resetDispatchPoolState(concurrency, total) {
  dispatchPoolState.active = true;
  dispatchPoolState.concurrency = concurrency;
  dispatchPoolState.total = total;
  dispatchPoolState.completed = 0;
  dispatchPoolState.failed = 0;
  dispatchPoolState.running = [];
  dispatchPoolState.finished = [];
  dispatchPoolState.startedAt = new Date().toISOString();
  dispatchPoolState.finishedAt = null;
  dispatchPoolState.lastError = null;
}

export function markDispatchPoolJobStart(jobInfo) {
  dispatchPoolState.running.push(jobInfo);
}

export function markDispatchPoolJobDone(runId, status, durationMs) {
  dispatchPoolState.running = dispatchPoolState.running.filter((j) => j.runId !== runId);
  dispatchPoolState.finished.push({ runId, status, durationMs, finishedAt: new Date().toISOString() });
  dispatchPoolState.completed++;
  if (status !== "completed") dispatchPoolState.failed++;
}

export function markDispatchPoolFinished(lastError = null) {
  dispatchPoolState.active = false;
  dispatchPoolState.running = [];
  dispatchPoolState.finishedAt = new Date().toISOString();
  dispatchPoolState.lastError = lastError;
}

export function getDispatchPoolSnapshot() {
  return {
    active: dispatchPoolState.active,
    concurrency: dispatchPoolState.concurrency,
    total: dispatchPoolState.total,
    completed: dispatchPoolState.completed,
    failed: dispatchPoolState.failed,
    pending: Math.max(0, dispatchPoolState.total - dispatchPoolState.completed),
    running: dispatchPoolState.running.slice(),
    finished: dispatchPoolState.finished.slice(-20),
    startedAt: dispatchPoolState.startedAt,
    finishedAt: dispatchPoolState.finishedAt,
    lastError: dispatchPoolState.lastError
  };
}

/**
 * Run an array of prepared dispatch jobs through a bounded-concurrency pool.
 * Each entry in `preparedJobs` is { job, runner, options }.
 * Returns results in the same order as input (order-preserving).
 */
export async function runDispatchPool(memoryDir, preparedJobs, { concurrency = DISPATCH_MAX_CONCURRENCY } = {}) {
  const limit = Math.max(1, Math.min(concurrency || 1, preparedJobs.length || 1));
  resetDispatchPoolState(limit, preparedJobs.length);
  const results = new Array(preparedJobs.length);
  let cursor = 0;
  let poolError = null;

  async function worker() {
    while (cursor < preparedJobs.length) {
      const idx = cursor++;
      const { job, runner, options } = preparedJobs[idx];
      const runId = createDispatchRunId(job);
      const jobInfo = {
        runId,
        dispatchId: job.id,
        tool: job.tool || "",
        project: job.project || "",
        startedAt: new Date().toISOString()
      };
      markDispatchPoolJobStart(jobInfo);
      try {
        // eslint-disable-next-line no-await-in-loop -- pool worker loop
        const result = await runDispatchJobAsync(memoryDir, job, runner, options);
        markDispatchPoolJobDone(runId, result.runStatus || (result.exitCode === 0 ? "completed" : "failed"), result.runDurationMs || 0);
        results[idx] = result;
      } catch (error) {
        markDispatchPoolJobDone(runId, "failed", 0);
        poolError = poolError || error;
        results[idx] = {
          ...job,
          runnable: true,
          exitCode: -1,
          runId,
          runStatus: "failed",
          error: error.message,
          runStartedAt: jobInfo.startedAt,
          runFinishedAt: new Date().toISOString()
        };
      }
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  markDispatchPoolFinished(poolError?.message || null);
  return results;
}
