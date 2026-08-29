import { getOption, hasFlag, positionalArgs } from "../lib/cli.js";
import { parseProjectListOption, uniqueStringList } from "../lib/entity-models.js";
import { readProjects, writeProjects } from "../lib/entity-repo.js";
import { fileURLToPath } from "node:url";

// project command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function projectCommand(argv, deps) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "list":
      return projectListCommand(actionArgs, deps);
    case "add":
    case "create":
      return projectAddCommand(actionArgs, deps);
    case "update":
      return projectUpdateCommand(actionArgs, deps);
    case "show":
      return projectShowCommand(actionArgs, deps);
    case "alias":
      return projectAliasCommand(actionArgs, deps);
    case "relate":
      return projectRelateCommand(actionArgs, deps);
    case "delete":
    case "archive":
      return projectArchiveCommand(actionArgs, deps);
    case "migrate":
      return projectMigrateCommand(actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub project <list|add|update|show|alias|relate|archive|migrate> ...");
  }
}


export function projectListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const status = getOption(argv, "--status") || "all";
  const includeHidden = hasFlag(argv, "--include-hidden");
  const projects = deps.filterProjects(readProjects(config.memoryDir), { status, includeHidden });
  console.log(JSON.stringify(projects, null, 2));
}


export function projectAddCommand(argv, deps) {
  const id = positionalArgs(argv)[0] || getOption(argv, "--id") || "";
  const name = getOption(argv, "--name") || positionalArgs(argv).slice(1).join(" ").trim();
  if (!id || !name) {
    throw new Error("Usage: ai-memory-hub project add <id> --name <name> [--status active] [--type game] [--description text]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "project-add", () => {
    const projects = readProjects(config.memoryDir);
    if (deps.findProjectIndex(projects, id) !== -1) {
      throw new Error(`Project already exists: ${id}`);
    }
    const project = deps.createProject({
      id,
      name,
      displayName: getOption(argv, "--display-name") || name,
      status: getOption(argv, "--status") || "active",
      type: getOption(argv, "--type") || "",
      description: getOption(argv, "--description") || "",
      aliases: parseProjectListOption(getOption(argv, "--aliases") || getOption(argv, "--alias")),
      resources: deps.parseProjectResourceOptions(argv)
    });
    projects.push(project);
    writeProjects(config.memoryDir, projects);
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}


export function projectUpdateCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub project update <id> [--name text] [--display-name text] [--status active] [--type game] [--description text]");
  }
  const patch = {};
  for (const [flag, key] of [
    ["--name", "name"],
    ["--display-name", "displayName"],
    ["--status", "status"],
    ["--type", "type"],
    ["--description", "description"]
  ]) {
    const value = getOption(argv, flag);
    if (value !== "") {
      patch[key] = value;
    }
  }
  const resources = deps.parseProjectResourceOptions(argv);
  if (Object.keys(resources).length > 0) {
    patch.resources = resources;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("project update requires at least one editable field");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "project-update", () => {
    const project = deps.updateProject(config.memoryDir, id, (current) => ({
      ...current,
      ...patch,
      resources: patch.resources ? { ...(current.resources || {}), ...patch.resources } : current.resources
    }));
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}


export function projectShowCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub project show <id-or-alias>");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const project = deps.findProject(readProjects(config.memoryDir), id);
  if (!project) {
    throw new Error(`Project not found: ${id}`);
  }
  console.log(JSON.stringify(project, null, 2));
}


export function projectAliasCommand(argv, deps) {
  const [id, alias] = positionalArgs(argv);
  if (!id || !alias) {
    throw new Error("Usage: ai-memory-hub project alias <id-or-alias> <alias>");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "project-alias", () => {
    const project = deps.updateProject(config.memoryDir, id, (current) => ({
      ...current,
      aliases: uniqueStringList([...(current.aliases || []), alias])
    }));
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}


export function projectRelateCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const basedOn = getOption(argv, "--based-on") || getOption(argv, "--parent") || "";
  const relation = getOption(argv, "--relation") || "";
  if (!id || !basedOn || !relation) {
    throw new Error("Usage: ai-memory-hub project relate <id-or-alias> --based-on <parent-id> --relation <type>");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "project-relate", () => {
    const parent = deps.findProject(readProjects(config.memoryDir), basedOn);
    const project = deps.updateProject(config.memoryDir, id, (current) => ({
      ...current,
      metadata: {
        ...(current.metadata || {}),
        basedOn: parent?.id || basedOn,
        relation
      }
    }));
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}


export function projectArchiveCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub project archive <id-or-alias> [--by tool]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "project-archive", () => {
    const now = new Date().toISOString();
    const project = deps.updateProject(config.memoryDir, id, (current) => ({
      ...current,
      status: "archived",
      archivedAt: now,
      archivedBy: getOption(argv, "--by") || getOption(argv, "--from") || "manual"
    }));
    console.log(JSON.stringify(project, null, 2));
  }, config.sync.lockStaleMs);
}


export function projectMigrateCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const apply = hasFlag(argv, "--apply");
  const before = readProjects(config.memoryDir);
  const migrated = deps.mergeSeedProjects(before);
  if (!apply) {
    console.log(JSON.stringify({
      apply,
      existing: before.length,
      after: migrated.length,
      added: migrated.length - before.length,
      hint: "Pass --apply to write missing seed projects."
    }, null, 2));
    return;
  }
  return deps.withHubLock(config.memoryDir, "project-migrate", () => {
    const current = readProjects(config.memoryDir);
    const currentMigrated = deps.mergeSeedProjects(current);
    writeProjects(config.memoryDir, currentMigrated);
    console.log(JSON.stringify({
      apply,
      existing: current.length,
      after: currentMigrated.length,
      added: currentMigrated.length - current.length
    }, null, 2));
  }, config.sync.lockStaleMs);
}


export function projectRoot(deps) {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}


