import { getOption, hasOption, positionalArgs } from "../lib/cli.js";
import {
  readWorkflows,
  readWorkflowNodes,
  appendWorkflowNodeEvent
} from "../lib/entity-repo.js";

// Workflow node sub-commands. Cross-cutting config access is injected via deps
// ({ loadConfig, ensureHub }) so this module never imports src/index.js.

export function workflowNodeCommand(argv, deps) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "add":
    case "create":
      return workflowNodeAddCommand(actionArgs, deps);
    case "start":
      return workflowNodeTransitionCommand(actionArgs, "running", deps);
    case "wait":
      return workflowNodeTransitionCommand(actionArgs, "waiting", deps);
    case "done":
    case "complete":
      return workflowNodeTransitionCommand(actionArgs, "completed", deps);
    case "fail":
      return workflowNodeTransitionCommand(actionArgs, "failed", deps);
    case "error":
      return workflowNodeTransitionCommand(actionArgs, "error", deps);
    case "cancel":
      return workflowNodeTransitionCommand(actionArgs, "cancelled", deps);
    case "reject":
      return workflowNodeTransitionCommand(actionArgs, "rejected", deps);
    case "list":
      return workflowNodeListCommand(actionArgs, deps);
    case "show":
      return workflowNodeShowCommand(actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub workflow node <add|start|wait|done|fail|error|cancel|reject|list|show> ...");
  }
}

export function workflowNodeAddCommand(argv, deps) {
  const workflowId = getOption(argv, "--workflow") || getOption(argv, "--id");
  const slug = getOption(argv, "--slug");
  const label = getOption(argv, "--label") || slug;
  const role = getOption(argv, "--role") || "";
  const actor = getOption(argv, "--actor") || "";
  const isRequired = !hasOption(argv, "--optional");
  if (!workflowId || !slug) {
    throw new Error("Usage: ai-memory-hub workflow node add --workflow <id> --slug <slug> [--label <label>] [--role <role>] [--actor <actor>] [--optional]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodeId = `${workflow.id}:${slug}`;
  const now = new Date().toISOString();
  const event = {
    workflowId: workflow.id,
    nodeId,
    slug,
    label,
    role,
    actor,
    status: "queued",
    ts: now,
    createdAt: now,
    isRequired
  };
  const result = appendWorkflowNodeEvent(config.memoryDir, event);
  console.log(JSON.stringify(result, null, 2));
}

export function workflowNodeTransitionCommand(argv, targetStatus, deps) {
  const workflowId = getOption(argv, "--workflow") || getOption(argv, "--id");
  const nodeSlugOrId = getOption(argv, "--node") || positionalArgs(argv)[0];
  const note = getOption(argv, "--note") || "";
  const error = getOption(argv, "--error") || "";
  const outputRaw = getOption(argv, "--output");
  const output = outputRaw ? JSON.parse(outputRaw) : {};
  if (!workflowId || !nodeSlugOrId) {
    throw new Error(`Usage: ai-memory-hub workflow node ${targetStatus} --workflow <id> --node <nodeId|slug> [--note <text>] [--error <text>] [--output <json>]`);
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
  const node = nodes.find((n) => n.nodeId === nodeSlugOrId || n.slug === nodeSlugOrId || n.nodeId.endsWith(`:${nodeSlugOrId}`));
  if (!node) {
    throw new Error(`Node not found: ${nodeSlugOrId} in workflow ${workflow.id}`);
  }
  const now = new Date().toISOString();
  const event = {
    ...node,
    status: targetStatus,
    ts: now,
    note: note || node.note,
    error: error || node.error,
    output: Object.keys(output).length > 0 ? output : node.output
  };
  if (targetStatus === "running" && !node.startedAt) {
    event.startedAt = now;
  }
  if (["completed", "failed", "error", "cancelled", "rejected"].includes(targetStatus) && !node.completedAt) {
    event.completedAt = now;
  }
  const result = appendWorkflowNodeEvent(config.memoryDir, event);
  console.log(JSON.stringify(result, null, 2));
}

export function workflowNodeListCommand(argv, deps) {
  const workflowId = getOption(argv, "--workflow") || getOption(argv, "--id") || positionalArgs(argv)[0];
  if (!workflowId) {
    throw new Error("Usage: ai-memory-hub workflow node list --workflow <id>");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
  console.log(JSON.stringify(nodes, null, 2));
}

export function workflowNodeShowCommand(argv, deps) {
  const workflowId = getOption(argv, "--workflow") || getOption(argv, "--id");
  const nodeSlugOrId = getOption(argv, "--node") || positionalArgs(argv)[0];
  if (!workflowId || !nodeSlugOrId) {
    throw new Error("Usage: ai-memory-hub workflow node show --workflow <id> --node <nodeId|slug>");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
  const node = nodes.find((n) => n.nodeId === nodeSlugOrId || n.slug === nodeSlugOrId || n.nodeId.endsWith(`:${nodeSlugOrId}`));
  if (!node) {
    throw new Error(`Node not found: ${nodeSlugOrId}`);
  }
  console.log(JSON.stringify(node, null, 2));
}
