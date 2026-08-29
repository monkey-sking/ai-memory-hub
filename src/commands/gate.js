import { getOption } from "../lib/cli.js";

// gate command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function gateCommand(argv, deps) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "request":
      return gateRequestCommand(actionArgs, deps);
    case "approve":
      return gateDecisionCommand(actionArgs, "approved", deps);
    case "reject":
      return gateDecisionCommand(actionArgs, "rejected", deps);
    case "needs-changes":
      return gateDecisionCommand(actionArgs, "needs_changes", deps);
    case "waive":
      return gateDecisionCommand(actionArgs, "waived", deps);
    case "list":
      return gateListCommand(actionArgs, deps);
    case "show":
      return gateShowCommand(actionArgs, deps);
    case "queue":
      return gateQueueCommand(actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub gate <request|approve|reject|needs-changes|waive|list|show|queue> ...");
  }
}


export function gateRequestCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const actor = getOption(argv, "--actor");
  const scope = getOption(argv, "--scope") || "operation";
  const operation = getOption(argv, "--operation") || "";
  const refId = getOption(argv, "--ref");
  const refType = getOption(argv, "--ref-type") || "";
  const reason = getOption(argv, "--reason") || "Approval required";
  const reviewer = getOption(argv, "--reviewer") || "human";
  const project = getOption(argv, "--project") || "";
  if (!actor) {
    throw new Error("Usage: ai-memory-hub gate request --actor <name> --scope <dispatch|workflow|task|operation> [--operation <name>] [--ref <id>] [--ref-type <type>] [--reason <text>]");
  }
  const gate = deps.appendApprovalGateEvent(config.memoryDir, {
    status: "requested",
    actor,
    scope,
    operation,
    refId,
    refType,
    reason,
    reviewer,
    project
  });
  console.log(JSON.stringify({
    ok: true,
    gateId: gate.gateId,
    status: gate.status,
    message: `Approval gate created: ${gate.gateId}`
  }, null, 2));
}


export function gateDecisionCommand(argv, decision, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const gateId = getOption(argv, "--id");
  const by = getOption(argv, "--by") || "human";
  const note = getOption(argv, "--note") || "";
  if (!gateId) {
    throw new Error(`Usage: ai-memory-hub gate ${decision === "approved" ? "approve" : decision === "rejected" ? "reject" : decision === "needs_changes" ? "needs-changes" : "waive"} --id <gateId> --by <reviewer> [--note <text>]`);
  }
  const gates = deps.readApprovalGates(config.memoryDir, { });
  const existing = gates.find((g) => g.gateId === gateId);
  if (!existing) {
    throw new Error(`Gate not found: ${gateId}`);
  }
  if (existing.isFinal) {
    throw new Error(`Gate already decided: ${existing.status}`);
  }
  const gate = deps.appendApprovalGateEvent(config.memoryDir, {
    gateId,
    status: decision,
    actor: existing.actor,
    scope: existing.scope,
    operation: existing.operation,
    refId: existing.refId,
    refType: existing.refType,
    reason: existing.reason,
    reviewer: by,
    project: existing.project,
    requestedAt: existing.requestedAt,
    decidedAt: new Date().toISOString(),
    decisionNote: note
  });
  console.log(JSON.stringify({
    ok: true,
    gateId: gate.gateId,
    status: gate.status,
    decidedAt: gate.decidedAt,
    message: `Gate ${decision}: ${gate.gateId}`
  }, null, 2));
}


export function gateListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const filters = {
    status: getOption(argv, "--status"),
    actor: getOption(argv, "--actor"),
    reviewer: getOption(argv, "--reviewer"),
    scope: getOption(argv, "--scope"),
    project: getOption(argv, "--project")
  };
  const gates = deps.readApprovalGates(config.memoryDir, filters);
  console.log(JSON.stringify({
    ok: true,
    count: gates.length,
    gates: gates.map((g) => ({
      gateId: g.gateId,
      status: g.status,
      scope: g.scope,
      actor: g.actor,
      reviewer: g.reviewer,
      project: g.project,
      operation: g.operation,
      refId: g.refId,
      reason: g.reason,
      requestedAt: g.requestedAt,
      decidedAt: g.decidedAt
    }))
  }, null, 2));
}


export function gateShowCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const gateId = getOption(argv, "--id");
  if (!gateId) {
    throw new Error("Usage: ai-memory-hub gate show --id <gateId>");
  }
  const gates = deps.readApprovalGates(config.memoryDir, { });
  const gate = gates.find((g) => g.gateId === gateId);
  if (!gate) {
    throw new Error(`Gate not found: ${gateId}`);
  }
  console.log(JSON.stringify(gate, null, 2));
}


export function gateQueueCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const reviewer = getOption(argv, "--reviewer") || "human";
  const gates = deps.readApprovalGates(config.memoryDir, { reviewer })
    .filter((g) => !g.isFinal);
  console.log(JSON.stringify({
    ok: true,
    reviewer,
    count: gates.length,
    pending: gates.map((g) => ({
      gateId: g.gateId,
      status: g.status,
      scope: g.scope,
      actor: g.actor,
      project: g.project,
      operation: g.operation,
      refId: g.refId,
      reason: g.reason,
      requestedAt: g.requestedAt
    }))
  }, null, 2));
}

