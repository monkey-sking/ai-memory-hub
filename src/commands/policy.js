import { getOption, positionalArgs } from "../lib/cli.js";
import { POLICY_OPERATIONS } from "../lib/constants.js";

// policy command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function policyCommand(argv, deps) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "init":
      return policyInitCommand(actionArgs, deps);
    case "add":
      return policyAddCommand(actionArgs, deps);
    case "list":
      return policyListCommand(actionArgs, deps);
    case "remove":
    case "rm":
      return policyRemoveCommand(actionArgs, deps);
    case "show":
      return policyShowCommand(actionArgs, deps);
    case "check":
      return policyCheckCommand(actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub policy <init|add|list|remove|show|check> ...");
  }
}

export function policyInitCommand(deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "policy-init", () => {
    const added = deps.seedDefaultPolicyRules(config.memoryDir);
    console.log(JSON.stringify({ ok: true, seeded: added, message: added > 0 ? `Seeded ${added} default policy rule(s).` : "Defaults already present." }, null, 2));
  }, config.sync.lockStaleMs);
}

export function policyAddCommand(argv, deps) {
  const actor = getOption(argv, "--actor") || "*";
  const project = getOption(argv, "--project") || "*";
  const operation = getOption(argv, "--operation") || "";
  const scope = getOption(argv, "--scope") || "all";
  const decision = getOption(argv, "--decision") || "";
  const reason = getOption(argv, "--reason") || "";
  const priority = getOption(argv, "--priority");
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "human";
  if (!operation || !decision) {
    throw new Error("Usage: ai-memory-hub policy add --operation <op> --decision <allow|ask|deny> [--actor <actor>] [--project <project>] [--scope all|project|own] [--reason <text>] [--priority N] [--by human]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "policy-add", () => {
    const rule = deps.appendPolicyRule(config.memoryDir, {
      actor, project, operation, scope, decision, reason,
      priority: priority !== "" ? Number(priority) : 100,
      createdBy: by
    });
    console.log(JSON.stringify(rule, null, 2));
  }, config.sync.lockStaleMs);
}

export function policyListCommand(argv, deps) {
  const actorFilter = getOption(argv, "--actor") || "";
  const operationFilter = getOption(argv, "--operation") || "";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  let rules = deps.readPolicyRules(config.memoryDir);
  if (actorFilter) rules = rules.filter((rule) => rule.actor === actorFilter);
  if (operationFilter) rules = rules.filter((rule) => rule.operation === operationFilter);
  console.log(JSON.stringify({ count: rules.length, rules }, null, 2));
}

export function policyRemoveCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "human";
  if (!id) {
    throw new Error("Usage: ai-memory-hub policy remove --id <rule-id> [--by human]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "policy-remove", () => {
    const removed = deps.removePolicyRule(config.memoryDir, id, by);
    console.log(JSON.stringify({ ok: true, removed }, null, 2));
  }, config.sync.lockStaleMs);
}

export function policyShowCommand(argv, deps) {
  const actor = getOption(argv, "--actor") || "*";
  const actorRoles = (getOption(argv, "--roles") || "").split(",").map((r) => r.trim()).filter(Boolean);
  const project = getOption(argv, "--project") || "*";
  const scope = getOption(argv, "--scope") || "all";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const byOperation = {};
  for (const operation of POLICY_OPERATIONS) {
    const result = deps.resolvePermission(config.memoryDir, { actor, actorRoles, project, operation, scope });
    byOperation[operation] = { decision: result.decision, reason: result.reason };
  }
  console.log(JSON.stringify({ actor, project, scope, byOperation }, null, 2));
}

export function policyCheckCommand(argv, deps) {
  const actor = getOption(argv, "--actor") || "*";
  const actorRoles = (getOption(argv, "--roles") || "").split(",").map((r) => r.trim()).filter(Boolean);
  const project = getOption(argv, "--project") || "*";
  const operation = getOption(argv, "--operation") || "";
  const scope = getOption(argv, "--scope") || "all";
  if (!operation) {
    throw new Error("Usage: ai-memory-hub policy check --operation <op> [--actor <actor>] [--roles role:executor,...] [--project <project>] [--scope all|project|own]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const result = deps.resolvePermission(config.memoryDir, { actor, actorRoles, project, operation, scope });
  console.log(JSON.stringify(result, null, 2));
}
