import { getOption, readJson } from "../lib/cli.js";
import fs from "node:fs";
import path from "node:path";

// context command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function contextCommand(argv, deps) {
  const action = argv[0] || "create";
  switch (action) {
    case "create":
      return contextCreateCommand(argv.slice(1), deps);
    case "show":
      return contextShowCommand(argv.slice(1), deps);
    case "list":
      return contextListCommand(argv.slice(1), deps);
    default:
      throw new Error(`Unknown context action: ${action}\nTry: ai-memory-hub context create|show|list`);
  }
}

export function contextCreateCommand(argv, deps) {
  const taskId = getOption(argv, "--task") || "";
  const workflowId = getOption(argv, "--workflow") || "";
  const project = getOption(argv, "--project") || "";
  const query = getOption(argv, "--query") || "";

  if (!taskId && !workflowId && !query) {
    throw new Error("Usage: ai-memory-hub context create [--task <task-id>] [--workflow <workflow-id>] [--project <project>] [--query <search-query>]");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const pack = deps.createContextPack({ taskId, workflowId, project, query });
  const file = deps.writeContextPack(config.memoryDir, pack);

  console.log(JSON.stringify({ ...pack, file }, null, 2));
}

export function contextShowCommand(argv, deps) {
  const packId = getOption(argv, "--id") || argv[0] || "";

  if (!packId) {
    throw new Error("Usage: ai-memory-hub context show <pack-id>");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const pack = deps.readContextPack(config.memoryDir, packId);

  if (!pack) {
    throw new Error(`Context pack not found: ${packId}`);
  }

  console.log(JSON.stringify(pack, null, 2));
}

export function contextListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const packsDir = path.join(config.memoryDir, "context", "packs");

  if (!fs.existsSync(packsDir)) {
    console.log(JSON.stringify([], null, 2));
    return;
  }

  const files = fs.readdirSync(packsDir).filter((f) => f.endsWith(".json"));
  const packs = files
    .map((file) => {
      try {
        return readJson(path.join(packsDir, file));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  console.log(JSON.stringify(packs, null, 2));
}
