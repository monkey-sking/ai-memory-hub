// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import path from "node:path";
import { readEvents } from "./io.js";
import {
  bootstrapEntityEventsFromProjection,
  readEntityEvents,
  replayEntityEvents,
  writeEntityRecords
} from "./entity-store.js";
import {
  normalizeTask,
  normalizeWorkflow,
  normalizeProject,
  getTaskEventStoreDefinition,
  getWorkflowEventStoreDefinition,
  getProjectEventStoreDefinition
} from "./entity-models.js";
import { isClosedDispatchSourceState } from "./dispatch.js";
import { isRadioTargetingClosedSession } from "./io.js";
import { ensureDir } from "./cli.js";
import { appendJsonl } from "../event-writer.js";

// Entity data-access layer: reads/writes task, workflow, project records and
// workflow node event history. Depends only on leaf modules (io / entity-store /
// entity-models / cli / event-writer) so the dependency graph stays acyclic.

export function readTasks(memoryDir) {
  bootstrapEntityEventsFromProjection(memoryDir, getTaskEventStoreDefinition());
  const events = readEntityEvents(memoryDir, getTaskEventStoreDefinition());
  if (events.length > 0) {
    return replayEntityEvents(events, getTaskEventStoreDefinition());
  }
  return readEvents(getTasksFile(memoryDir))
    .map(normalizeTask)
    .filter((task) => task.id && task.title);
}

export function writeTasks(memoryDir, tasks) {
  writeEntityRecords(memoryDir, getTaskEventStoreDefinition(), tasks);
}

export function readWorkflows(memoryDir) {
  bootstrapEntityEventsFromProjection(memoryDir, getWorkflowEventStoreDefinition());
  const events = readEntityEvents(memoryDir, getWorkflowEventStoreDefinition());
  let workflows = [];
  if (events.length > 0) {
    workflows = replayEntityEvents(events, getWorkflowEventStoreDefinition());
  } else {
    workflows = readEvents(getWorkflowsFile(memoryDir))
      .map(normalizeWorkflow)
      .filter((workflow) => workflow.id && workflow.title);
  }

  // Phase 5: Apply derived status for workflows that opted in.
  // Read the nodes file at most once and only when needed.
  const derivedWorkflows = workflows.filter((workflow) => workflow.usesDerivedStatus);
  if (derivedWorkflows.length === 0) {
    return workflows;
  }
  const nodesByWorkflow = readWorkflowNodesByWorkflow(memoryDir);
  return workflows.map((workflow) => {
    if (!workflow.usesDerivedStatus) {
      return workflow;
    }
    const nodeList = nodesByWorkflow.get(workflow.id) || [];
    const derivedStatus = deriveWorkflowStatusFromNodes(nodeList);
    if (derivedStatus) {
      return {
        ...workflow,
        status: derivedStatus,
        derivedStatus // store the derived value for debugging/inspection
      };
    }
    return workflow;
  });
}

export function writeWorkflows(memoryDir, workflows) {
  writeEntityRecords(memoryDir, getWorkflowEventStoreDefinition(), workflows);
}

export function readProjects(memoryDir) {
  bootstrapEntityEventsFromProjection(memoryDir, getProjectEventStoreDefinition());
  const events = readEntityEvents(memoryDir, getProjectEventStoreDefinition());
  if (events.length > 0) {
    return replayEntityEvents(events, getProjectEventStoreDefinition());
  }
  return readEvents(getProjectsFile(memoryDir))
    .map(normalizeProject)
    .filter((project) => project.id && project.name);
}

export function writeProjects(memoryDir, projects) {
  writeEntityRecords(memoryDir, getProjectEventStoreDefinition(), projects);
}

export function getTasksFile(memoryDir) {
  return path.join(memoryDir, "tasks", "tasks.jsonl");
}

export function getWorkflowsFile(memoryDir) {
  return path.join(memoryDir, "workflows", "workflows.jsonl");
}

export function getProjectsFile(memoryDir) {
  return path.join(memoryDir, "projects", "projects.jsonl");
}

export function readWorkflowNodes(memoryDir, workflowId) {
  const nodesFile = path.join(memoryDir, "workflows", "nodes.jsonl");
  const events = readEvents(nodesFile).filter((event) => event.workflowId === workflowId);
  const nodeMap = new Map();
  for (const event of events) {
    const existing = nodeMap.get(event.nodeId);
    if (!existing || new Date(event.ts) > new Date(existing.ts)) {
      nodeMap.set(event.nodeId, event);
    }
  }
  return Array.from(nodeMap.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function readWorkflowNodesByWorkflow(memoryDir) {
  const nodesFile = path.join(memoryDir, "workflows", "nodes.jsonl");
  const events = readEvents(nodesFile);
  const latestByNode = new Map();
  for (const event of events) {
    if (!event.workflowId || !event.nodeId) {
      continue;
    }
    const existing = latestByNode.get(event.nodeId);
    if (!existing || new Date(event.ts) > new Date(existing.ts)) {
      latestByNode.set(event.nodeId, event);
    }
  }
  const byWorkflow = new Map();
  for (const node of latestByNode.values()) {
    if (!byWorkflow.has(node.workflowId)) {
      byWorkflow.set(node.workflowId, []);
    }
    byWorkflow.get(node.workflowId).push(node);
  }
  for (const list of byWorkflow.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return byWorkflow;
}

export function appendWorkflowNodeEvent(memoryDir, event) {
  const nodesFile = path.join(memoryDir, "workflows", "nodes.jsonl");
  ensureDir(path.dirname(nodesFile));
  const normalized = {
    type: "workflow.node",
    workflowId: event.workflowId,
    nodeId: event.nodeId,
    slug: event.slug,
    label: event.label || event.slug,
    role: event.role || "",
    actor: event.actor || "",
    status: event.status,
    ts: event.ts || new Date().toISOString(),
    createdAt: event.createdAt || event.ts || new Date().toISOString(),
    startedAt: event.startedAt || "",
    completedAt: event.completedAt || "",
    input: event.input || {},
    output: event.output || {},
    error: event.error || "",
    note: event.note || "",
    isRequired: event.isRequired !== false,
    isFinal: ["completed", "failed", "error", "cancelled", "rejected"].includes(event.status)
  };
  appendJsonl(nodesFile, normalized);
  return normalized;
}

export function deriveWorkflowStatusFromNodes(nodes) {
  if (!nodes || nodes.length === 0) return null;
  const required = nodes.filter((n) => n.isRequired);
  const hasRunning = nodes.some((n) => n.status === "running");
  const hasWaiting = nodes.some((n) => n.status === "waiting");
  const allRequiredCompleted = required.every((n) => n.status === "completed");
  const hasBlocker = required.some((n) => ["failed", "error", "rejected"].includes(n.status));
  const allCancelled = nodes.every((n) => n.status === "cancelled");
  if (allCancelled) return "cancelled";
  if (allRequiredCompleted) return "done";
  if (hasBlocker && !hasRunning && !hasWaiting) return "blocked";
  if (hasWaiting && !hasRunning) return "waiting";
  if (hasRunning) return "in_progress";
  const reviewNodes = nodes.filter((n) => n.role === "reviewer");
  const execNodes = required.filter((n) => n.role === "executor");
  if (execNodes.every((n) => n.status === "completed") && reviewNodes.some((n) => !["completed", "rejected"].includes(n.status))) {
    return "review";
  }
  return "open";
}

export function isRadioLinkedToClosedSource(memoryDir, message) {
  if (isRadioTargetingClosedSession(memoryDir, message)) return true;
  const refs = [message?.thread, message?.replyTo]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (refs.length === 0) {
    return false;
  }
  const refSet = new Set(refs);
  const closedTask = readTasks(memoryDir)
    .some((task) => refSet.has(task.id) && isClosedDispatchSourceState(task.status || task.deliveryState));
  if (closedTask) {
    return true;
  }
  return readWorkflows(memoryDir)
    .some((workflow) => refSet.has(workflow.id) && isClosedDispatchSourceState(workflow.status || workflow.deliveryState));
}
