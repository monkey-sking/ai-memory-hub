import { getOption, hasFlag, positionalArgs } from "../lib/cli.js";
import { MODEL_CACHE_STALE_MS } from "../lib/constants.js";

// models command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function modelsCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const tool = getOption(argv, "--tool") || getOption(argv, "--to") || positionalArgs(argv)[0] || "";
  const refresh = hasFlag(argv, "--refresh") || hasFlag(argv, "--fetch");
  if (refresh) {
    deps.refreshModelsIfStale(config.memoryDir, { tool, force: true });
  }
  const cache = deps.readModelsCache(config.memoryDir);
  const targets = tool ? [deps.normalizeToolName(tool)] : Object.keys(deps.RUNNER_PROFILES);
  const results = [];
  for (const name of targets) {
    const runner = deps.getToolRunner(name);
    const supportsList = Array.isArray(runner.modelsCommand) && runner.modelsCommand.length > 0;
    const declaration = deps.readToolDeclarationByTool(config.memoryDir, name);
    const cached = cache[name] || null;
    const cachedAgeMs = cached?.fetchedAt ? Date.now() - new Date(cached.fetchedAt).getTime() : null;
    results.push({
      tool: name,
      supported: supportsList,
      declared: declaration?.models || [],
      discovered: Array.isArray(cached?.models) ? cached.models : [],
      discoveredAt: cached?.fetchedAt || "",
      stale: cachedAgeMs !== null && cachedAgeMs > MODEL_CACHE_STALE_MS,
      fetchError: "",
      strengths: declaration?.strengths || [],
      note: declaration?.note || ""
    });
  }
  console.log(JSON.stringify({
    ok: true,
    generatedAt: new Date().toISOString(),
    refreshed: refresh,
    tools: results
  }, null, 2));
}
