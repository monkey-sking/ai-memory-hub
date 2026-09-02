// Permission policy decision layer (P0: capability permission matrix) — sunk
// from src/index.js in v3.0 refactor P0-2.
//
// Pure self-contained cluster: owns the POLICY_* constants + the policy rule
// normalization / seeding / scope matching / permission resolution functions.
// This is the shared hub that dispatch orchestration (prepareDispatchJobForRun /
// executeDispatchRetry via resolvePermission) and the `policy` command (via deps
// injection) both consume — sinking it lets those clusters stop treating these
// as index-internal symbols and import directly.
//
// Dependencies: node built-in (path) + already-sunk lib (cli createId/ensureDir,
// io readPolicyRules, event-writer appendJsonl, registry-paths getPolicyRulesFile,
// entity-index policyActorMatches/policyRuleSpecificity, constants
// POLICY_OPERATIONS). No index.js-internal symbols → direct import, no init injection.
import path from "node:path";
import { POLICY_OPERATIONS } from "./constants.js";
import { createId, ensureDir } from "./cli.js";
import { readPolicyRules } from "./io.js";
import { appendJsonl } from "../event-writer.js";
import { getPolicyRulesFile } from "./registry-paths.js";
import { policyActorMatches, policyRuleSpecificity } from "./entity-index.js";

export const POLICY_DECISIONS = ["allow", "ask", "deny"];
export const POLICY_SCOPES = ["all", "project", "own"];
export const POLICY_SCOPE_BREADTH = { all: 3, project: 2, own: 1 };
export const POLICY_DESTRUCTIVE_OPERATIONS = ["push", "delete", "purge", "install-dependencies"];

// Seeded defaults derived from the previously hardcoded guardrails.
export const POLICY_DEFAULT_SEED = [
  { operation: "read-memory", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "write-memory", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "send-radio", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "claim-task", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "dispatch", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "run-tests", decision: "allow", reason: "Running tests is safe" },
  { operation: "modify-files", decision: "allow", reason: "Editing within the workspace is allowed" },
  { operation: "archive", decision: "allow", reason: "Archiving is reversible" },
  { operation: "install-dependencies", decision: "ask", reason: "Dependency installs need approval (supply-chain safety)" },
  { operation: "push", decision: "ask", reason: "Pushing to remote needs human approval" },
  { operation: "delete", decision: "ask", reason: "Destructive data operations need approval" },
  { operation: "purge", decision: "ask", reason: "Destructive data operations need approval" }
];

export function normalizePolicyRule(rule) {
  const operation = String(rule.operation || "").trim();
  const decision = String(rule.decision || "").trim();
  const scope = POLICY_SCOPES.includes(rule.scope) ? rule.scope : "all";
  const now = new Date().toISOString();
  return {
    type: "policy.rule",
    id: rule.id || createId(`policy:${rule.actor}:${rule.project}:${operation}:${scope}`),
    actor: String(rule.actor || "*").trim() || "*",
    project: String(rule.project || "*").trim() || "*",
    operation,
    scope,
    decision,
    reason: String(rule.reason || "").trim(),
    priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
    createdAt: rule.createdAt || now,
    createdBy: rule.createdBy || "manual",
    ts: now
  };
}

export function appendPolicyRule(memoryDir, rule) {
  if (!POLICY_OPERATIONS.includes(rule.operation)) {
    throw new Error(`Invalid operation: ${rule.operation}. Valid: ${POLICY_OPERATIONS.join(", ")}`);
  }
  if (!POLICY_DECISIONS.includes(rule.decision)) {
    throw new Error(`Invalid decision: ${rule.decision}. Valid: ${POLICY_DECISIONS.join(", ")}`);
  }
  if (rule.scope && !POLICY_SCOPES.includes(rule.scope)) {
    throw new Error(`Invalid scope: ${rule.scope}. Valid: ${POLICY_SCOPES.join(", ")}`);
  }
  const file = getPolicyRulesFile(memoryDir);
  ensureDir(path.dirname(file));
  const normalized = normalizePolicyRule(rule);
  appendJsonl(file, normalized);
  return normalized;
}

export function seedDefaultPolicyRules(memoryDir) {
  const existing = readPolicyRules(memoryDir);
  const seededOps = new Set(
    existing
      .filter((rule) => rule.actor === "*" && rule.project === "*" && rule.scope === "all" && rule.priority === 0)
      .map((rule) => rule.operation)
  );
  let added = 0;
  for (const seed of POLICY_DEFAULT_SEED) {
    if (seededOps.has(seed.operation)) {
      continue;
    }
    appendPolicyRule(memoryDir, {
      actor: "*",
      project: "*",
      scope: "all",
      operation: seed.operation,
      decision: seed.decision,
      reason: seed.reason,
      priority: 0,
      createdBy: "system"
    });
    added += 1;
  }
  return added;
}

// Actor query carries the literal actor plus any roles it holds (e.g. ["role:executor"]).
export function policyScopeMatches(rule, scope) {
  // A rule applies if its scope is at least as broad as the queried scope.
  return POLICY_SCOPE_BREADTH[rule.scope] >= POLICY_SCOPE_BREADTH[scope];
}

export function resolvePermission(memoryDir, { actor = "*", actorRoles = [], project = "*", operation, scope = "all" }) {
  if (!POLICY_OPERATIONS.includes(operation)) {
    throw new Error(`Invalid operation: ${operation}. Valid: ${POLICY_OPERATIONS.join(", ")}`);
  }
  if (!POLICY_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Valid: ${POLICY_SCOPES.join(", ")}`);
  }
  let rules = readPolicyRules(memoryDir);
  if (rules.length === 0) {
    seedDefaultPolicyRules(memoryDir);
    rules = readPolicyRules(memoryDir);
  }
  const matches = rules.filter((rule) =>
    rule.operation === operation &&
    policyActorMatches(rule, actor, actorRoles) &&
    (rule.project === "*" || rule.project === project) &&
    policyScopeMatches(rule, scope)
  );
  if (matches.length > 0) {
    matches.sort((a, b) => {
      const specDelta = policyRuleSpecificity(b) - policyRuleSpecificity(a);
      if (specDelta !== 0) return specDelta;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return String(b.ts || "").localeCompare(String(a.ts || ""));
    });
    const top = matches[0];
    return { decision: top.decision, reason: top.reason, matchedRule: top };
  }
  // Fail-safe fallback when no rule matches.
  if (POLICY_DESTRUCTIVE_OPERATIONS.includes(operation)) {
    return { decision: "ask", reason: "No policy matched; destructive operation requires approval by default", matchedRule: null };
  }
  return { decision: "allow", reason: "No policy restricts this operation", matchedRule: null };
}
