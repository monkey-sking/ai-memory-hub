import { getOption } from "../lib/cli.js";

// queue command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function queueCommand(argv, deps) {
  const action = argv[0] || "list";
  switch (action) {
    case "add":
      return queueAddCommand(argv.slice(1), deps);
    case "list":
      return queueListCommand(argv.slice(1), deps);
    case "running":
      return queueRunningCommand(argv.slice(1), deps);
    case "failed":
      return queueFailedCommand(argv.slice(1), deps);
    case "start":
      return queueStartCommand(argv.slice(1), deps);
    case "complete":
      return queueCompleteCommand(argv.slice(1), deps);
    case "fail":
      return queueFailCommand(argv.slice(1), deps);
    default:
      throw new Error(`Unknown queue action: ${action}\nTry: ai-memory-hub queue add|list|running|failed|start|complete|fail`);
  }
}

export function queueAddCommand(argv, deps) {
  const taskId = getOption(argv, "--task") || "";
  const workflowId = getOption(argv, "--workflow") || "";
  const radioId = getOption(argv, "--radio") || "";
  const tool = getOption(argv, "--tool") || "";
  const priority = getOption(argv, "--priority") || "normal";
  const timeout = getOption(argv, "--timeout") || "30000";
  const maxRetries = getOption(argv, "--max-retries") || "3";

  if (!tool || (!taskId && !workflowId && !radioId)) {
    throw new Error("Usage: ai-memory-hub queue add --tool <tool> [--task <id>] [--workflow <id>] [--radio <id>] [--priority normal] [--timeout 30000] [--max-retries 3]");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const entry = deps.createDispatchQueueEntry({
    taskId,
    workflowId,
    radioId,
    tool,
    priority,
    timeout,
    maxRetries
  });

  deps.writeDispatchQueueEntry(config.memoryDir, entry);
  console.log(JSON.stringify(entry, null, 2));
}

export function queueListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const queued = deps.getQueuedEntries(config.memoryDir);
  console.log(JSON.stringify(queued, null, 2));
}

export function queueRunningCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const running = deps.getRunningEntries(config.memoryDir);
  console.log(JSON.stringify(running, null, 2));
}

export function queueFailedCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const failed = deps.getFailedEntries(config.memoryDir);
  console.log(JSON.stringify(failed, null, 2));
}

export function queueStartCommand(argv, deps) {
  const entryId = getOption(argv, "--id") || argv[0] || "";

  if (!entryId) {
    throw new Error("Usage: ai-memory-hub queue start <entry-id>");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  deps.updateDispatchQueueEntry(config.memoryDir, entryId, {
    status: "running",
    startedAt: new Date().toISOString(),
    attempts: 1,
    lastAttemptAt: new Date().toISOString()
  });

  console.log(JSON.stringify({ id: entryId, status: "running" }, null, 2));
}

export function queueCompleteCommand(argv, deps) {
  const entryId = getOption(argv, "--id") || argv[0] || "";

  if (!entryId) {
    throw new Error("Usage: ai-memory-hub queue complete <entry-id>");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  deps.updateDispatchQueueEntry(config.memoryDir, entryId, {
    status: "completed",
    completedAt: new Date().toISOString()
  });

  console.log(JSON.stringify({ id: entryId, status: "completed" }, null, 2));
}

export function queueFailCommand(argv, deps) {
  const entryId = getOption(argv, "--id") || argv[0] || "";
  const error = getOption(argv, "--error") || "Unknown error";

  if (!entryId) {
    throw new Error("Usage: ai-memory-hub queue fail <entry-id> [--error <message>]");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const entries = deps.readDispatchQueue(config.memoryDir);
  const entry = entries.find((e) => e.id === entryId);

  if (!entry) {
    throw new Error(`Queue entry not found: ${entryId}`);
  }

  const newAttempts = (entry.attempts || 0) + 1;
  const shouldRetry = newAttempts < (entry.maxRetries || 3);

  deps.updateDispatchQueueEntry(config.memoryDir, entryId, {
    status: shouldRetry ? "queued" : "failed",
    attempts: newAttempts,
    lastAttemptAt: new Date().toISOString(),
    lastError: error,
    completedAt: shouldRetry ? "" : new Date().toISOString()
  });

  console.log(JSON.stringify({
    id: entryId,
    status: shouldRetry ? "queued (will retry)" : "failed",
    attempts: newAttempts,
    maxRetries: entry.maxRetries
  }, null, 2));
}
