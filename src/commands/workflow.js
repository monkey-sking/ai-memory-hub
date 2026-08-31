import { workflowNodeCommand } from "../commands/workflow-node.js";
import { appendJsonl } from "../event-writer.js";
import { normalizeGithubLinks } from "../github-links.js";
import { getOption, hasFlag, positionalArgs } from "../lib/cli.js";
import {
  appendWorkflowNodeEvent,
  deriveWorkflowStatusFromNodes,
  readWorkflowNodes,
  readWorkflows,
  writeWorkflows,
} from "../lib/entity-repo.js";
import { normalizeReviewDimensions } from "../review-config.js";
import path from "node:path";

// workflow command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function workflowCommand(argv, deps) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "add":
    case "create":
      return workflowCreateCommand(actionArgs, deps);
    case "list":
      return workflowListCommand(actionArgs, deps);
    case "start":
      return workflowStatusCommand(["--status", "in_progress", ...actionArgs], deps);
    case "status":
      return workflowStatusCommand(actionArgs, deps);
    case "result":
      return workflowAppendCommand(actionArgs, "results", deps);
    case "review":
      return workflowAppendCommand(actionArgs, "reviews", deps);
    case "signal":
      return workflowSignalCommand(actionArgs, deps);
    case "done":
      return workflowStatusCommand(["--status", "done", ...actionArgs], deps);
    case "node":
      return workflowNodeCommand(actionArgs, { loadConfig, ensureHub });
    case "graph":
      return workflowGraphCommand(actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub workflow <create|list|start|status|result|review|signal|done|node|graph> ...");
  }
}


export function workflowCreateCommand(argv, deps) {
  const title = positionalArgs(argv).join(" ").trim();
  if (!title) {
    throw new Error("Usage: ai-memory-hub workflow create <title> [--from codex] [--project name] [--planner codex] [--executor claude] [--reviewer qclaw]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "workflow-create", () => {
    const workflows = readWorkflows(config.memoryDir);
    const workflow = deps.createWorkflow({
      title,
      createdBy: getOption(argv, "--from") || getOption(argv, "--by") || "manual",
      project: getOption(argv, "--project") || path.basename(process.cwd()),
      priority: getOption(argv, "--priority") || "normal",
      planner: getOption(argv, "--planner") || "",
      executor: getOption(argv, "--executor") || "",
      reviewer: getOption(argv, "--reviewer") || "",
      observer: getOption(argv, "--observer") || "",
      plan: getOption(argv, "--plan") || "",
       acceptance: getOption(argv, "--acceptance") || "",
       githubLinks: normalizeGithubLinks({
         issue: getOption(argv, "--github-issue"),
         pullRequest: getOption(argv, "--github-pr")
       })
    });
    workflows.push(workflow);
    writeWorkflows(config.memoryDir, workflows);

    // Phase 4: Auto-create workflow nodes
    deps.autoCreateWorkflowNodes(config.memoryDir, workflow);

    if (hasFlag(argv, "--spawn-tasks")) {
      deps.spawnWorkflowTasks(config.memoryDir, workflow);
    }
    if (hasFlag(argv, "--notify")) {
      deps.notifyWorkflowRoles(config.memoryDir, workflow);
    }
    const created = readWorkflows(config.memoryDir).find((item) => item.id === workflow.id) || workflow;
    console.log(JSON.stringify(created, null, 2));
  }, config.sync.lockStaleMs);
}


export function workflowListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const status = getOption(argv, "--status") || "active";
  const project = getOption(argv, "--project") || "";
  const limit = Number(getOption(argv, "--limit") || 20);
  const workflows = readWorkflows(config.memoryDir)
    .filter((workflow) => status === "all" ? true : status === "active" ? !["done", "cancelled"].includes(workflow.status) : workflow.status === status)
    .filter((workflow) => project ? workflow.project === project : true)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, limit);
  console.log(JSON.stringify(workflows, null, 2));
}


export function workflowStatusCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const status = getOption(argv, "--status") || positionalArgs(argv)[1] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  const auto = hasFlag(argv, "--auto");

  // Phase 5: --auto flag switches to derived status mode
  if (auto) {
    if (!id) {
      throw new Error("Usage: ai-memory-hub workflow status --id <workflow-id> --auto [--by codex]");
    }
    const config = deps.loadConfig();
    deps.ensureHub(config.memoryDir);
    return deps.withHubLock(config.memoryDir, "workflow-status", () => {
      const workflow = deps.updateWorkflow(config.memoryDir, id, (current) => ({
        ...current,
        usesDerivedStatus: true,
        updatedAt: new Date().toISOString(),
        notes: [
          ...(current.notes || []),
          deps.createTaskNote(by, `Switched to derived status mode. Status will now be computed from node states.`)
        ]
      }));
      // Re-read to get derived status applied
      const updated = readWorkflows(config.memoryDir).find(w => w.id === workflow.id) || workflow;
      console.log(JSON.stringify(updated, null, 2));
    }, config.sync.lockStaleMs);
  }

  if (!id || !status) {
    throw new Error("Usage: ai-memory-hub workflow status --id <workflow-id> --status <open|planned|in_progress|review|blocked|done|cancelled> [--by codex]\n       ai-memory-hub workflow status --id <workflow-id> --auto [--by codex]");
  }
  deps.assertWorkflowStatus(status);
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "workflow-status", () => {
    // Phase 5: Block manual status changes if using derived status
    const workflows = readWorkflows(config.memoryDir);
    const current = workflows.find((item) => item.id === id || item.id.startsWith(id));
    if (current?.usesDerivedStatus) {
      throw new Error(
        `Cannot manually set status: workflow is using derived status mode.\n` +
        `Status is automatically computed from node states.\n` +
        `Current derived status: ${current.status}`
      );
    }

    // Phase 3: When marking workflow as done, check all required nodes are completed
    if (status === "done") {
      if (current) {
        const nodes = readWorkflowNodes(config.memoryDir, current.id);
        const requiredNodes = nodes.filter(n => n.isRequired);
        const incompleteRequired = requiredNodes.filter(n => n.status !== "completed");

        if (incompleteRequired.length > 0) {
          const nodeList = incompleteRequired.map(n => `  - ${n.label} (${n.role}:${n.actor}) → ${n.status}`).join("\n");
          throw new Error(
            `Cannot mark workflow as done: ${incompleteRequired.length} required node(s) not completed:\n${nodeList}\n\n` +
            `Use 'workflow node done --workflow ${id} --node <slug>' to complete them first.`
          );
        }
      }
    }

    const workflow = deps.updateWorkflow(config.memoryDir, id, (current) => ({
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      completedAt: status === "done" ? new Date().toISOString() : current.completedAt || "",
      notes: [
        ...(current.notes || []),
        deps.createTaskNote(by, `Status changed to ${status}.`)
      ]
    }));
    console.log(JSON.stringify(workflow, null, 2));
  }, config.sync.lockStaleMs);
}


export function workflowAppendCommand(argv, field, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const args = positionalArgs(argv);
  const text = getOption(argv, "--text") || (getOption(argv, "--id") ? args.join(" ") : args.slice(1).join(" ")).trim();
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  const role = getOption(argv, "--role") || "";
  const dimensions = normalizeReviewDimensions(getOption(argv, "--dimensions") || "");
  if (!id || !text) {
    throw new Error(`Usage: ai-memory-hub workflow ${field === "results" ? "result" : "review"} --id <workflow-id> [--role executor] <text> [--by codex]`);
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, `workflow-${field}`, () => {
    const workflow = deps.updateWorkflow(config.memoryDir, id, (current) => ({
      ...current,
      status: field === "reviews" ? "review" : current.status,
      updatedAt: new Date().toISOString(),
      [field]: [
        ...(current[field] || []),
        {
          ts: new Date().toISOString(),
          by,
          role,
          text,
          ...(field === "reviews" && (dimensions.length > 0 || current.qualityGate?.reviewDimensions?.length > 0)
            ? { dimensions: dimensions.length > 0 ? dimensions : current.qualityGate.reviewDimensions }
            : {})
        }
      ]
    }));

    // Phase 3: Auto-update node status when role is specified
    if (role) {
      const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
      const matchingNode = nodes.find(n => n.role === role && n.actor === by);

      if (matchingNode) {
        if (field === "results") {
          // workflow result → mark executor node as completed
          appendWorkflowNodeEvent(config.memoryDir, {
            type: "workflow.node",
            workflowId: workflow.id,
            nodeId: matchingNode.nodeId,
            slug: matchingNode.slug,
            status: "completed",
            ts: new Date().toISOString(),
            note: `Auto-completed by workflow result command`,
            output: { text }
          });
        } else if (field === "reviews") {
          // workflow review → mark reviewer node as completed or rejected
          // Heuristic: if text contains rejection keywords, mark as rejected
          const isRejection = /reject|block|fail|不通过|拒绝|驳回/i.test(text);
          const status = isRejection ? "rejected" : "completed";
          appendWorkflowNodeEvent(config.memoryDir, {
            type: "workflow.node",
            workflowId: workflow.id,
            nodeId: matchingNode.nodeId,
            slug: matchingNode.slug,
            status,
            ts: new Date().toISOString(),
            note: `Auto-${status} by workflow review command`,
            output: { text }
          });
        }
      }
    }

    console.log(JSON.stringify(workflow, null, 2));
  }, config.sync.lockStaleMs);
}


export function workflowSignalCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const to = getOption(argv, "--to") || "";
  const args = positionalArgs(argv);
  const text = getOption(argv, "--text") || (getOption(argv, "--id") ? args.join(" ") : args.slice(1).join(" ")).trim();
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  // OPC v1.1 P0: standardized signal type and status
  const signalType = getOption(argv, "--type") || "";
  const signalStatus = getOption(argv, "--status") || "";
  const signalScore = getOption(argv, "--score") || "";
  const VALID_SIGNAL_TYPES = ["build", "lint", "test", "dry-run", "design-check", "doc-check", "custom"];
  const VALID_SIGNAL_STATUSES = ["pass", "fail", "warn", "skip"];
  if (signalType && !VALID_SIGNAL_TYPES.includes(signalType)) {
    throw new Error("Invalid signal --type: " + signalType + ". Valid: " + VALID_SIGNAL_TYPES.join("|"));
  }
  if (signalStatus && !VALID_SIGNAL_STATUSES.includes(signalStatus)) {
    throw new Error("Invalid signal --status: " + signalStatus + ". Valid: " + VALID_SIGNAL_STATUSES.join("|"));
  }
  if (!id || !to || (!text && !signalType)) {
    throw new Error("Usage: ai-memory-hub workflow signal --id <workflow-id> --to <tool-or-role> <text> [--by codex] [--type build|lint|test|dry-run] [--status pass|fail|warn|skip] [--score <number>]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const workflow = readWorkflows(config.memoryDir).find((item) => item.id === id || item.id.startsWith(id));
  if (!workflow) {
    throw new Error(`Workflow not found: ${id}`);
  }
  const message = deps.createRadioMessage({
    from: by,
    to,
    type: "handoff",
    text: `[workflow:${workflow.id}] ${text}`,
    thread: workflow.id,
    project: workflow.project
  });
  appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), message);
  console.log(JSON.stringify(message, null, 2));
}







export function workflowGraphCommand(argv, deps) {
  const workflowId = getOption(argv, "--id") || getOption(argv, "--workflow") || positionalArgs(argv)[0];
  if (!workflowId) {
    throw new Error("Usage: ai-memory-hub workflow graph --id <workflow-id>");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const workflows = readWorkflows(config.memoryDir);
  const workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const nodes = readWorkflowNodes(config.memoryDir, workflow.id);
  const derivedStatus = deriveWorkflowStatusFromNodes(nodes);
  console.log(`Workflow ${workflow.id}: ${derivedStatus || workflow.status}`);
  if (nodes.length === 0) {
    console.log("  (no execution history)");
  } else {
    for (const node of nodes) {
      const icon = {
        completed: "✓",
        failed: "✗",
        error: "✗",
        cancelled: "⊗",
        rejected: "⊘",
        running: "▶",
        waiting: "⏸",
        queued: "◦"
      }[node.status] || "?";
      const required = node.isRequired ? "" : " (optional)";
      console.log(`  [${icon}] ${node.label} (${node.role}:${node.actor}) — ${node.status}${required}`);
      if (node.note) {
        console.log(`      Note: ${node.note}`);
      }
      if (node.error) {
        console.log(`      Error: ${node.error}`);
      }
    }
  }
}

