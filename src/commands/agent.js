import { getOption, positionalArgs } from "../lib/cli.js";
import { readRelations, recordRelation, revokeRelation } from "../relations.js";

// agent command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function agentCommand(argv, deps) {
  const action = argv[0] || "list";
  if (action === "register") return agentRegisterCommand(argv.slice(1), deps);
  if (action === "show") return agentShowCommand(argv.slice(1), deps);
  if (action === "role") return agentRoleCommand(argv.slice(1), deps);
  if (action === "status") {
    const sub = argv[1];
    if (sub === "set") return agentSetStatusCommand(argv.slice(2), deps);
    // default: existing session projection (kept for backward-compat)
    const config = deps.loadConfig();
    deps.ensureHub(config.memoryDir);
    const state = getOption(argv.slice(1), "--state") || "";
    const sessions = deps.dashboardAgentSessions.getDashboardAgentSessions(config.memoryDir).agentSessions;
    console.log(JSON.stringify(state ? sessions.filter((item) => item.state === state) : sessions, null, 2));
    return;
  }
  if (action === "list") return agentListCommand(argv.slice(1), deps);
  throw new Error("Usage: ai-memory-hub agent <list|register|show|status|role> ...");
}

export function agentRegisterCommand(argv, deps) {
  const id = (getOption(argv, "--id") || positionalArgs(argv)[0] || "").trim();
  if (!id) throw new Error("Usage: ai-memory-hub agent register --id <agent> [--name '...'] [--persona '...'] [--bio '...']");
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const existing = deps.readAgentById(config.memoryDir, id) || {};
  const agent = deps.writeAgent(config.memoryDir, {
    ...existing,
    id: existing.id || id,
    name: getOption(argv, "--name") || existing.name || id,
    persona: getOption(argv, "--persona") || existing.persona || "",
    bio: getOption(argv, "--bio") || existing.bio || "",
    roles: Array.isArray(existing.roles) ? existing.roles : [],
    status: existing.status || "idle",
    createdAt: existing.createdAt || new Date().toISOString()
  });
  console.log(JSON.stringify(agent, null, 2));
}

export function agentShowCommand(argv, deps) {
  const id = (getOption(argv, "--id") || positionalArgs(argv)[0] || "").trim();
  if (!id) throw new Error("Usage: ai-memory-hub agent show --id <agent>");
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const agent = deps.readAgentById(config.memoryDir, id);
  if (!agent) throw new Error(`Agent not registered: ${id}`);
  const roles = (agent.roles || []).map((rid) => deps.readRoleById(config.memoryDir, rid)).filter(Boolean);
  console.log(JSON.stringify({ ...agent, expandedRoles: roles }, null, 2));
}

export function agentSetStatusCommand(argv, deps) {
  const id = (getOption(argv, "--id") || "").trim();
  const state = (getOption(argv, "--state") || "").trim();
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id || !["idle", "busy", "done"].includes(state)) throw new Error("Usage: ai-memory-hub agent status set --id <agent> --state <idle|busy|done> [--by codex]");
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const agent = deps.touchAgentStatus(config.memoryDir, id, state, by);
  console.log(JSON.stringify(agent, null, 2));
}

export function agentListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const registry = deps.readAgents(config.memoryDir);
  const sessions = deps.dashboardAgentSessions.getDashboardAgentSessions(config.memoryDir).agentSessions;
  const byId = new Map();
  for (const a of registry) byId.set(String(a.id).toLowerCase(), { ...a, _source: "registry" });
  for (const s of sessions) {
    const sid = String(s.id || s.sessionId || "").toLowerCase();
    if (!sid) continue;
    const prev = byId.get(sid) || { id: s.id };
    byId.set(sid, { ...prev, id: prev.id || s.id, liveState: s.state, lastSeen: s.updatedAt || prev.lastSeen, _source: prev._source || "session" });
  }
  const state = getOption(argv, "--state") || "";
  let rows = [...byId.values()];
  if (state) rows = rows.filter((r) => (r.status || r.liveState) === state);
  console.log(JSON.stringify(rows, null, 2));
}

export function agentRoleCommand(argv, deps) {
  const action = argv[0] || "list";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  if (action === "add" || action === "remove") {
    const agentId = (getOption(argv, "--agent") || "").trim();
    const roleId = (getOption(argv, "--role") || "").trim();
    if (!agentId || !roleId) throw new Error("Usage: ai-memory-hub agent role add|remove --agent <agent> --role <role>");
    const agent = deps.readAgentById(config.memoryDir, agentId);
    if (!agent) throw new Error(`Agent not registered: ${agentId} (run 'agent register' first)`);
    if (!deps.readRoleById(config.memoryDir, roleId)) throw new Error(`Role not found: ${roleId} (run 'role create' first)`);
    const roles = new Set(agent.roles || []);
    if (action === "add") {
      roles.add(roleId);
      try {
        recordRelation(config.memoryDir, { from: { type: "agent", id: agentId }, to: { type: "role", id: roleId }, relation: "plays-role", source: "agent-cli", evidence: { kind: "explicit" } });
      } catch (_) { /* duplicate relation is fine */ }
    } else {
      roles.delete(roleId);
      const rel = readRelations(config.memoryDir).find((r) => r.status === "active" && r.relation === "plays-role" && r.from.type === "agent" && String(r.from.id).toLowerCase() === agentId.toLowerCase() && r.to.type === "role" && String(r.to.id).toLowerCase() === roleId.toLowerCase());
      if (rel) try { revokeRelation(config.memoryDir, rel.id, "agent role remove"); } catch (_) { /* ignore */ }
    }
    const updated = deps.writeAgent(config.memoryDir, { ...agent, roles: [...roles] });
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  if (action === "list") {
    const agentId = (getOption(argv, "--agent") || "").trim();
    const agents = agentId ? [deps.readAgentById(config.memoryDir, agentId)].filter(Boolean) : deps.readAgents(config.memoryDir);
    const rows = agents.map((a) => ({
      id: a.id,
      name: a.name,
      roles: (a.roles || []).map((rid) => { const r = deps.readRoleById(config.memoryDir, rid); return r ? { id: r.id, name: r.name } : { id: rid, name: "(missing)" }; })
    }));
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  throw new Error("Usage: ai-memory-hub agent role <add|remove|list> --agent <agent> --role <role>");
}
