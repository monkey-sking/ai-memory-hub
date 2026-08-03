import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentExecutionTimeline, buildAgentSessionProjection } from "../src/dashboard/agent-sessions.js";
import { buildWorktreeProjection } from "../src/dashboard/worktrees.js";
import { createDashboardAgentSessionsApi } from "../src/dashboard/agent-sessions-api.js";
import { createDashboardWorktreesApi } from "../src/dashboard/worktrees-api.js";

const baseWorktree = {
  enabled: true,
  repoRoot: "C:/repo",
  root: "C:/repo/.ai-worktrees",
  path: "C:/repo/.ai-worktrees/task-1",
  branch: "amh/codex/demo/task-1",
  base: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  head: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  reused: false,
  hasChanges: false,
  diffStatus: "",
  diffStat: ""
};

test("agent session projection links relay, task, workflow, and worktree state", () => {
  const now = "2026-08-03T10:00:00.000Z";
  const projection = buildAgentSessionProjection({
    now,
    staleAfterMs: 30 * 60 * 1000,
    sessions: [{ id: "session-1", createdBy: "codex", project: "amh", title: "Implement cockpit", lastActive: now }],
    tasks: [{ id: "task-1", title: "Implement cockpit", project: "amh", status: "in_progress", sessionId: "session-1", worktree: baseWorktree }],
    workflows: [{ id: "workflow-1", title: "P0", project: "amh", status: "in_progress", linkedTasks: ["task-1"] }],
    relay: [{ threadKey: "codex:amh:task-1", sourceKind: "task", sourceId: "task-1", state: "progress", progressPercent: 45, progressStatus: "Building projection", ts: now, sessionId: "session-1", tool: "codex", project: "amh", worktree: baseWorktree }],
    dispatchRuns: [{ threadKey: "codex:amh:task-1", sessionId: "session-1", startedAt: now, finishedAt: "", stdout: "latest output" }]
  });

  assert.equal(projection.length, 1);
  assert.equal(projection[0].state, "working");
  assert.equal(projection[0].agent, "codex");
  assert.equal(projection[0].task.id, "task-1");
  assert.equal(projection[0].workflow.id, "workflow-1");
  assert.equal(projection[0].progress.percent, 45);
  assert.equal(projection[0].recentOutput, "latest output");
  assert.equal(projection[0].worktree.path, baseWorktree.path);
});

test("inactive session projection distinguishes stale from idle", () => {
  const projection = buildAgentSessionProjection({
    now: "2026-08-03T10:00:00.000Z",
    staleAfterMs: 30 * 60 * 1000,
    sessions: [
      { id: "stale", createdBy: "gemini", lastActive: "2026-08-03T08:00:00.000Z" },
      { id: "idle", createdBy: "claude", lastActive: "2026-08-03T09:50:00.000Z" }
    ],
    tasks: [],
    workflows: [],
    relay: [],
    dispatchRuns: []
  });

  assert.deepEqual(projection.map((item) => item.state), ["idle", "stale"]);
});

test("worktree projection reports review blockers without mutating the worktree", () => {
  const result = buildWorktreeProjection({
    tasks: [{ id: "task-1", title: "Task", sessionId: "session-1", worktree: baseWorktree }],
    workflows: [],
    relay: [],
    dispatchRuns: [],
    inspect: (worktree) => ({ ...worktree, exists: true, dirty: false })
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].reviewReady, true);
  assert.deepEqual(result[0].reviewBlockers, []);
  assert.equal(result[0].owner.taskId, "task-1");
  assert.equal(result[0].path, baseWorktree.path);
});

test("execution timeline combines task, relay, and dispatch evidence", () => {
  const timeline = buildAgentExecutionTimeline({
    tasks: [{ id: "task-1", updatedAt: "2026-08-03T10:00:00.000Z", title: "Task", status: "in_progress", assignee: "codex" }],
    workflows: [],
    relay: [{ id: "relay-1", ts: "2026-08-03T10:01:00.000Z", state: "progress", tool: "codex", progressStatus: "Halfway" }],
    dispatchRuns: [{ id: "run-1", startedAt: "2026-08-03T09:59:00.000Z", status: "running", tool: "codex", stdout: "started" }]
  });

  assert.deepEqual(timeline.map((item) => item.kind), ["relay", "task", "dispatch"]);
});

test("dashboard projection APIs expose additive agent session and worktree payloads", () => {
  const readers = {
    readSessions: () => [{ id: "session-1", createdBy: "codex", lastActive: "2026-08-03T10:00:00.000Z" }],
    readTasks: () => [],
    readWorkflows: () => [],
    readLatestRelayStatusByThread: () => ({}),
    readDispatchRuns: () => []
  };
  const sessions = createDashboardAgentSessionsApi(readers).getDashboardAgentSessions("memory");
  const worktrees = createDashboardWorktreesApi({ ...readers, inspect: value => value }).getDashboardWorktrees("memory");
  assert.equal(sessions.agentSessions[0].sessionId, "session-1");
  assert.ok(Array.isArray(sessions.timeline));
  assert.deepEqual(worktrees.worktrees, []);
});
