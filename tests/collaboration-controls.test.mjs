import assert from "node:assert/strict";
import test from "node:test";
import { buildUnreadItems, createFollowUpPayload, buildReviewQueue } from "../src/dashboard/collaboration.js";
import { buildExecutionAdapters } from "../src/execution-adapters.js";

test("unread projection includes targeted radio and terminal agent events", () => {
  const items = buildUnreadItems({
    actor: "codex",
    messages: [{ id: "radio-1", ts: "2026-08-03T10:00:00.000Z", to: "codex", type: "review", text: "Please review" }],
    sessions: [{ id: "session-1", agent: "gemini", state: "blocked", lastActivity: "2026-08-03T10:01:00.000Z", title: "Blocked" }],
    readReceipts: []
  });
  assert.deepEqual(items.map((item) => item.id), ["agent:session-1:blocked", "radio:radio-1"]);
});

test("read receipts remove an item from unread without rewriting source events", () => {
  const items = buildUnreadItems({
    actor: "codex",
    messages: [{ id: "radio-1", ts: "2026-08-03T10:00:00.000Z", to: "codex", type: "note", text: "Hello" }],
    sessions: [],
    readReceipts: [{ itemId: "radio:radio-1", actor: "codex", action: "read" }]
  });
  assert.deepEqual(items, []);
});

test("follow-up preserves target linkage and thread", () => {
  const payload = createFollowUpPayload({ by: "codex", to: "claude", text: "Continue from the last checkpoint.", taskId: "task-1", sessionId: "session-1", project: "amh" });
  assert.equal(payload.type, "follow_up");
  assert.equal(payload.thread, "task-1");
  assert.deepEqual(payload.metadata, { taskId: "task-1", sessionId: "session-1" });
});

test("review queue links task, workflow, session, and worktree", () => {
  const queue = buildReviewQueue({
    tasks: [{ id: "task-1", title: "Task", reviewStatus: "requested", sessionId: "session-1", worktree: { path: "C:/wt" } }],
    workflows: [{ id: "workflow-1", title: "Workflow", status: "review", linkedTasks: ["task-1"] }]
  });
  assert.equal(queue[0].taskId, "task-1");
  assert.equal(queue[0].workflowId, "workflow-1");
  assert.equal(queue[0].worktree.path, "C:/wt");
});

test("execution adapters remain metadata-only and never run remote commands", () => {
  const adapters = buildExecutionAdapters({
    task: { githubLinks: { issue: "https://github.com/acme/amh/issues/1", pullRequest: "https://github.com/acme/amh/pull/2" } },
    worktree: { branch: "amh/codex/task-1", path: "C:/wt", head: "abc" },
    remote: { host: "dev.example", user: "runner", reconnectState: "disconnected", forwards: [{ local: 5173, remote: 5173 }] }
  });
  assert.equal(adapters.github.pullRequest, "https://github.com/acme/amh/pull/2");
  assert.equal(adapters.ssh.host, "dev.example");
  assert.equal(adapters.ssh.reconnectState, "disconnected");
  assert.equal(adapters.notifications.length, 0);
});

