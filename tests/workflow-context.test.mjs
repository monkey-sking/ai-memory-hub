import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowSharedState } from "../src/workflow-context.js";

test("workflow shared state exposes active nodes, linked tasks, and recent collaboration", () => {
  const state = buildWorkflowSharedState({
    workflow: {
      id: "workflow-1",
      project: "demo",
      status: "in_progress",
      linkedTasks: ["task-1"],
      results: [{ ts: "2026-07-31T10:00:00.000Z", text: "implemented" }],
      reviews: [{ ts: "2026-07-31T10:01:00.000Z", text: "pending review" }]
    },
    nodes: [
      { nodeId: "workflow-1:plan", slug: "plan", status: "completed", role: "planner" },
      { nodeId: "workflow-1:exec", slug: "exec", status: "running", role: "executor" }
    ],
    tasks: [
      { id: "task-1", title: "Build", status: "claimed", assignee: "codex" },
      { id: "task-other", title: "Other", status: "open" }
    ],
    radio: [
      { id: "radio-1", thread: "workflow-1", project: "demo", text: "handoff" },
      { id: "radio-2", thread: "other", project: "demo", text: "ignore" }
    ],
    updatedAt: "2026-07-31T10:02:00.000Z"
  });

  assert.deepEqual(state, {
    version: 1,
    workflowId: "workflow-1",
    project: "demo",
    workflowStatus: "in_progress",
    updatedAt: "2026-07-31T10:02:00.000Z",
    activeNodes: [
      { nodeId: "workflow-1:exec", slug: "exec", status: "running", role: "executor" }
    ],
    linkedTasks: [
      { id: "task-1", title: "Build", status: "claimed", assignee: "codex" }
    ],
    recentRadio: [
      { id: "radio-1", thread: "workflow-1", project: "demo", text: "handoff" }
    ],
    latestResult: { ts: "2026-07-31T10:00:00.000Z", text: "implemented" },
    latestReview: { ts: "2026-07-31T10:01:00.000Z", text: "pending review" }
  });
});

test("workflow shared state handles missing optional records", () => {
  assert.deepEqual(
    buildWorkflowSharedState({ workflow: { id: "workflow-2" } }),
    {
      version: 1,
      workflowId: "workflow-2",
      project: "",
      workflowStatus: "",
      updatedAt: "",
      activeNodes: [],
      linkedTasks: [],
      recentRadio: [],
      latestResult: null,
      latestReview: null
    }
  );
});
