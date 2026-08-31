import { getOption, positionalArgs } from "../lib/cli.js";
import { readRelations, recordRelation, revokeRelation } from "../relations.js";

// team command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function teamCommand(argv, deps) {
  const action = argv[0] || "list";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  if (action === "create" || action === "update") {
    const id = (getOption(argv, "--id") || positionalArgs(argv)[0] || "").trim();
    if (!id) throw new Error("Usage: ai-memory-hub team create --id <team> [--name '...'] [--description '...']");
    const existing = deps.readTeamById(config.memoryDir, id) || {};
    const team = deps.writeTeam(config.memoryDir, {
      ...existing,
      id: existing.id || id,
      name: getOption(argv, "--name") || existing.name || id,
      description: getOption(argv, "--description") || existing.description || "",
      createdAt: existing.createdAt || new Date().toISOString()
    });
    console.log(JSON.stringify(team, null, 2));
    return;
  }
  if (action === "member") {
    const sub = argv[1] || "list";
    const teamId = getOption(argv, "--team") || "";
    const agentId = getOption(argv, "--agent") || "";
    if (!teamId || !agentId) throw new Error("Usage: ai-memory-hub team member <add|remove|list> --team <team> --agent <agent>");
    const team = deps.readTeamById(config.memoryDir, teamId);
    if (!team) throw new Error(`Team not found: ${teamId}`);
    if (sub === "add") {
      const rel = recordRelation(config.memoryDir, {
        from: { type: "agent", id: agentId },
        to: { type: "team", id: teamId },
        relation: "member-of",
        source: "cli",
        evidence: { note: `agent ${agentId} joined team ${teamId}` }
      });
      console.log(JSON.stringify(rel, null, 2));
      return;
    }
    if (sub === "remove") {
      const rel = readRelations(config.memoryDir).find((r) => r.status === "active" && r.relation === "member-of" && r.from.type === "agent" && String(r.from.id).toLowerCase() === agentId.toLowerCase() && r.to.type === "team" && String(r.to.id).toLowerCase() === teamId.toLowerCase());
      if (!rel) throw new Error(`No active member-of relation: ${agentId} -> ${teamId}`);
      const ev = revokeRelation(config.memoryDir, rel.id, "removed via cli");
      console.log(JSON.stringify(ev, null, 2));
      return;
    }
    if (sub === "list") {
      const members = readRelations(config.memoryDir)
        .filter((r) => r.status === "active" && r.relation === "member-of" && r.to.type === "team" && String(r.to.id).toLowerCase() === teamId.toLowerCase())
        .map((r) => r.from.id);
      console.log(JSON.stringify(members, null, 2));
      return;
    }
    throw new Error("Usage: ai-memory-hub team member <add|remove|list> --team <team> --agent <agent>");
  }
  if (action === "show") {
    const id = (getOption(argv, "--id") || positionalArgs(argv)[0] || "").trim();
    if (!id) throw new Error("Usage: ai-memory-hub team show --id <team>");
    const team = deps.readTeamById(config.memoryDir, id);
    if (!team) throw new Error(`Team not found: ${id}`);
    // P2 (M:N symmetry, like role.show): expand which agents belong to this team.
    const key = id.toLowerCase();
    const members = readRelations(config.memoryDir)
      .filter((r) => r.status === "active" && r.relation === "member-of" && r.to.type === "team" && String(r.to.id).toLowerCase() === key)
      .map((r) => {
        const a = deps.readAgentById(config.memoryDir, r.from.id);
        return { id: r.from.id, name: a ? a.name : r.from.id, status: a ? a.status || "idle" : "idle" };
      });
    console.log(JSON.stringify({ ...team, members }, null, 2));
    return;
  }
  if (action === "list") {
    console.log(JSON.stringify(deps.readTeams(config.memoryDir), null, 2));
    return;
  }
  throw new Error("Usage: ai-memory-hub team <create|show|list|member> ...");
}
