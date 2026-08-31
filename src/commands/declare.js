import { getOption, positionalArgs } from "../lib/cli.js";

// declare command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function declareCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const action = argv[0] || "set";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "set":
    case "upsert":
    case "add":
      return declareSetCommand(config, actionArgs, deps);
    case "list":
    case "ls":
      return declareListCommand(config, actionArgs, deps);
    case "show":
    case "get":
      return declareShowCommand(config, actionArgs, deps);
    case "remove":
    case "rm":
    case "delete":
      return declareRemoveCommand(config, actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub declare <set|list|show|remove> [--tool <tool>] [--models a,b] [--strengths 'x,y'] [--note '...'] [--by <tool>]");
  }
}

export function declareSetCommand(config, actionArgs, deps) {
  const tool = getOption(actionArgs, "--tool") || "";
  const by = getOption(actionArgs, "--by") || tool;
  if (!tool) {
    throw new Error("declare set requires --tool <tool>");
  }
  return deps.withHubLock(config.memoryDir, "tool-declaration", () => {
    const previous = deps.readToolDeclarationByTool(config.memoryDir, tool);
    const models = deps.parseDeclaredList(getOption(actionArgs, "--models"));
    const strengths = deps.parseDeclaredList(getOption(actionArgs, "--strengths"));
    const note = getOption(actionArgs, "--note");
    if (models.length === 0 && strengths.length === 0 && !note) {
      throw new Error("declare set needs at least one of --models, --strengths, or --note.");
    }
    const declaration = {
      tool: deps.normalizeToolName(tool),
      by: deps.normalizeToolName(by || tool) || "unknown",
      models,
      strengths,
      note: note || "",
      updatedAt: new Date().toISOString(),
      previous: previous ? previous.updatedAt : ""
    };
    const saved = deps.writeToolDeclaration(config.memoryDir, declaration);
    console.log(JSON.stringify({
      ok: true,
      declaration: saved,
      message: `Declared ${saved.models.length} model(s) and ${saved.strengths.length} strength area(s) for ${saved.tool}.`
    }, null, 2));
  }, config.sync.lockStaleMs);
}

export function declareListCommand(config, actionArgs, deps) {
  const entries = deps.readToolDeclarations(config.memoryDir)
    .sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")));
  console.log(JSON.stringify({ ok: true, declarations: entries }, null, 2));
}

export function declareShowCommand(config, actionArgs, deps) {
  const tool = getOption(actionArgs, "--tool") || positionalArgs(actionArgs)[0] || "";
  if (!tool) {
    throw new Error("declare show requires --tool <tool>");
  }
  const declaration = deps.readToolDeclarationByTool(config.memoryDir, tool);
  console.log(JSON.stringify({
    ok: true,
    tool: deps.normalizeToolName(tool),
    declaration
  }, null, 2));
}

export function declareRemoveCommand(config, actionArgs, deps) {
  const tool = getOption(actionArgs, "--tool") || positionalArgs(actionArgs)[0] || "";
  if (!tool) {
    throw new Error("declare remove requires --tool <tool>");
  }
  return deps.withHubLock(config.memoryDir, "tool-declaration", () => {
    const removed = deps.removeToolDeclaration(config.memoryDir, tool);
    console.log(JSON.stringify({ ok: true, removed, tool: deps.normalizeToolName(tool) }, null, 2));
  }, config.sync.lockStaleMs);
}
