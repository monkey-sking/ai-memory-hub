import { getOption, positionalArgs } from "../lib/cli.js";

// role command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function roleCommand(argv, deps) {
  const action = argv[0] || "list";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  if (action === "create" || action === "update") {
    const id = (getOption(argv, "--id") || positionalArgs(argv)[0] || "").trim();
    if (!id) throw new Error("Usage: ai-memory-hub role create --id <role> [--name '...'] [--description '...'] [--permissions 'a,b']");
    const existing = deps.readRoleById(config.memoryDir, id) || {};
    const perms = deps.parseDeclaredList(getOption(argv, "--permissions") || "");
    const mergedPerms = perms.concat(existing.permissions || []).filter((p, i, arr) => arr.indexOf(p) === i);
    const role = deps.writeRole(config.memoryDir, {
      ...existing,
      id: existing.id || id,
      name: getOption(argv, "--name") || existing.name || id,
      description: getOption(argv, "--description") || existing.description || "",
      permissions: mergedPerms,
      createdAt: existing.createdAt || new Date().toISOString()
    });
    console.log(JSON.stringify(role, null, 2));
    return;
  }
  if (action === "show") {
    const id = (getOption(argv, "--id") || positionalArgs(argv)[0] || "").trim();
    if (!id) throw new Error("Usage: ai-memory-hub role show --id <role>");
    const role = deps.readRoleById(config.memoryDir, id);
    if (!role) throw new Error(`Role not found: ${id}`);
    // P1 (M:N symmetry): show which agents play this role, derived from agent.roles[].
    const key = id.toLowerCase();
    const members = deps.readAgents(config.memoryDir)
      .filter((a) => (a.roles || []).some((rid) => String(rid).toLowerCase() === key))
      .map((a) => ({ id: a.id, name: a.name, status: a.status || "idle" }));
    console.log(JSON.stringify({ ...role, members }, null, 2));
    return;
  }
  if (action === "list") {
    console.log(JSON.stringify(deps.readRoles(config.memoryDir), null, 2));
    return;
  }
  throw new Error("Usage: ai-memory-hub role <create|show|list> ...");
}
