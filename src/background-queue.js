import crypto from "node:crypto";
import { EventEmitter } from "node:events";

/**
 * 轻量后台任务队列：统一承载 detect / sync / prune / backup 等长任务。
 * 设计原则（见 backend-evolution-conclusion.md Phase 1.1）：
 * - 进程内单例，任务状态存内存（可接受重启丢失，长任务天然幂等）
 * - 带进度（0~1）、可取消、可查询
 * - 不引入新依赖；进度推送通过可选 onProgress 回调外发（realtime 由调用方注入）
 */
class BackgroundQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxListeners = 0; // 不限监听器
    this.tasks = new Map();
    this.concurrency = options.concurrency || 2;
    this.running = 0;
    this.onProgress = options.onProgress || null; // (task) => void
    this._seq = 0;
  }

  list({ limit = 50, includeDone = true } = {}) {
    const all = [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
    const filtered = includeDone ? all : all.filter((t) => t.status === "pending" || t.status === "running");
    return filtered.slice(0, limit);
  }

  get(id) {
    return this.tasks.get(id) || null;
  }

  /**
   * 提交一个任务。
   * @param {object} spec
   * @param {string} spec.type 任务类型（detect/sync/prune/backup...）
   * @param {string} spec.label 人类可读标签
   * @param {Function} spec.run async (ctx) => result；ctx = { report(frac,message), isCancelled() }
   * @returns {{id:string,type:string,label:string,status:string}}
   */
  enqueue(spec) {
    const id = crypto.randomUUID();
    const task = {
      id,
      type: spec.type || "generic",
      label: spec.label || spec.type || "task",
      status: "pending",
      progress: 0,
      message: "queued",
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
      cancelled: false,
      _spec: spec
    };
    this.tasks.set(id, task);
    this.emit("enqueued", task);
    // 释放事件循环，避免阻塞提交请求的响应
    setImmediate(() => this._pump());
    return { id, type: task.type, label: task.label, status: task.status };
  }

  cancel(id) {
    const task = this.tasks.get(id);
    if (!task) return { ok: false, reason: "not_found" };
    if (task.status === "done" || task.status === "error" || task.status === "cancelled") {
      return { ok: false, reason: "terminal" };
    }
    task.cancelled = true;
    if (task.status === "pending") {
      task.status = "cancelled";
      task.finishedAt = Date.now();
      task.message = "cancelled before start";
      this.emit("cancelled", task);
      this._emitProgress(task);
    } else {
      task.message = "cancellation requested";
      this._emitProgress(task);
    }
    return { ok: true };
  }

  _pump() {
    if (this.running >= this.concurrency) return;
    // 取最早 pending 的任务
    const next = [...this.tasks.values()].find((t) => t.status === "pending");
    if (!next) return;
    this.running += 1;
    next.status = "running";
    next.startedAt = Date.now();
    next.message = "running";
    this._emitProgress(next);
    (async () => {
      try {
        const ctx = {
          report: (frac, message) => {
            next.progress = Math.max(0, Math.min(1, Number(frac) || 0));
            if (message) next.message = String(message);
            this._emitProgress(next);
          },
          isCancelled: () => next.cancelled
        };
        const result = await next._spec.run(ctx);
        if (next.cancelled) {
          next.status = "cancelled";
          next.message = "cancelled during run";
        } else {
          next.status = "done";
          next.progress = 1;
          next.result = result ?? null;
          next.message = "completed";
        }
      } catch (error) {
        next.status = "error";
        next.error = error?.message || String(error);
        next.message = `error: ${next.error}`;
      } finally {
        next.finishedAt = Date.now();
        this._emitProgress(next);
        this.emit("finished", next);
        this.running -= 1;
        // 继续泵下一个
        setImmediate(() => this._pump());
      }
    })();
  }

  _emitProgress(task) {
    if (this.onProgress) {
      try {
        this.onProgress(task);
      } catch {
        // 推送失败不应影响任务本身
      }
    }
    this.emit("progress", task);
  }
}

let singleton = null;
export function getBackgroundQueue(options) {
  if (!singleton) singleton = new BackgroundQueue(options);
  return singleton;
}

export { BackgroundQueue };
