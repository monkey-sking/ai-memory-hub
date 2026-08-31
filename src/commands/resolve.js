import { getOption, hasFlag, parsePositiveIntegerOption, positionalArgs } from "../lib/cli.js";

// resolve command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function resolveCommand(argv, deps) {
  const query = positionalArgs(argv).join(" ").trim();
  if (!query) {
    throw new Error("Usage: ai-memory-hub resolve <name|@include|path> [--from <instruction-file>] [--limit N] [--plain]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const limit = getOption(argv, "--limit")
    ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
    : 10;
  const fromFile = getOption(argv, "--from") || getOption(argv, "--file") || "";
  const result = deps.resolveReference(query, config, {
    fromFile,
    limit
  }, deps);
  if (hasFlag(argv, "--plain")) {
    if (result.best?.path) {
      console.log(result.best.path);
    }
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}
