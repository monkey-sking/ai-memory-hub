import { appendJsonl } from "../event-writer.js";
import { ensureDir, getOption, hasFlag, positionalArgs } from "../lib/cli.js";
import { readTasks, writeTasks } from "../lib/entity-repo.js";
import path from "node:path";

// connect command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export async function connectCommand(argv, deps) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "status";
  const actionArgs = action === "status" ? argv : argv.slice(1);
  switch (action) {
    case "status":
    case "list":
      return connectStatusCommand(actionArgs, deps);
    case "request":
    case "ask":
      return connectSendCommand(actionArgs, "request", deps);
    case "review":
      return connectSendCommand(actionArgs, "review", deps);
    case "handoff":
      return connectSendCommand(actionArgs, "handoff", deps);
    case "note":
      return connectSendCommand(actionArgs, "note", deps);
    default:
      throw new Error("Usage: ai-memory-hub connect [status|request|review|handoff|note] ...");
  }
}

export function connectStatusCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const apply = hasFlag(argv, "--apply");
  const tools = deps.detectTools(config.memoryDir);
  const installedNeedingUpdate = tools.filter((tool) => tool.installed && (!tool.configured || !tool.skillLayer));

  if (apply) {
    for (const tool of installedNeedingUpdate) {
      const target = deps.getInstallTargetForTool(config.memoryDir, tool.name);
      if (!target) continue;
      const snippet = deps.renderInstallSnippet(target, config.memoryDir);
      ensureDir(path.dirname(target.file));
      deps.syncSharedSkillLayer(target.file, snippet, { apply: true });
    }
  }

  const refreshed = apply ? deps.detectTools(config.memoryDir) : tools;
  const summary = deps.dashboardTools.summarizeToolConnections(refreshed);
  console.log(JSON.stringify({
    apply,
    summary,
    tools: refreshed.map((tool) => ({
      name: tool.name,
      installed: tool.installed,
      configured: tool.configured,
      connected: tool.connected,
      connectionStatus: tool.connectionStatus,
      skillLayer: tool.skillLayer,
      skillLayerVersion: tool.skillLayerVersion,
      skillLayerStatus: tool.skillLayerStatus,
      runnable: tool.runnable,
      runnerProfile: tool.runnerProfile,
      runnerCommandKind: tool.runnerCommandKind,
      runnerUsesShell: tool.runnerUsesShell,
      sharedStateOnly: tool.sharedStateOnly,
      action: tool.action,
      instructionFile: tool.instructionFile
    }))
  }, null, 2));
}

export async function connectSendCommand(argv, defaultType, deps) {
  const text = getOption(argv, "--text") || positionalArgs(argv).join(" ").trim();
  if (!text) {
    throw new Error("Usage: ai-memory-hub connect request --from <tool> --to codex --project <project> --text <message> [--task] [--run]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const from = getOption(argv, "--from") || getOption(argv, "--by") || "manual";
  const to = getOption(argv, "--to") || "codex";
  const type = getOption(argv, "--type") || defaultType || "request";
  const project = getOption(argv, "--project") || path.basename(process.cwd());
  const priority = getOption(argv, "--priority") || (type === "review" ? "high" : "normal");
  const shouldCreateTask = hasFlag(argv, "--task") || hasFlag(argv, "--create-task");
  let task = null;

  if (shouldCreateTask) {
    deps.withHubLock(config.memoryDir, "connect-task", () => {
      const tasks = readTasks(config.memoryDir);
      task = deps.createTask({
        title: getOption(argv, "--title") || `[${type}] ${summarizeText(text, 80)}`,
        description: text,
        handoff: `Contact request from ${from} to ${to}.`,
        createdBy: from,
        project,
        priority
      });
      task.assignee = to;
      task.status = "claimed";
      tasks.push(task);
      writeTasks(config.memoryDir, tasks);
    }, config.sync.lockStaleMs);
  }

  const message = deps.createRadioMessage({
    from,
    to,
    type,
    text,
    thread: getOption(argv, "--thread") || task?.id || "",
    replyTo: getOption(argv, "--reply-to") || "",
    project
  });
  appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), message);

  const dispatch = hasFlag(argv, "--run")
    ? await deps.executeDispatch(config.memoryDir, {
      run: true,
      force: hasFlag(argv, "--force"),
      to,
      project,
      limit: Number(getOption(argv, "--limit") || 5),
      model: getOption(argv, "--model") || "",
      isolateWorktree: hasFlag(argv, "--isolate-worktree"),
      worktreeRoot: getOption(argv, "--worktree-root") || ""
    })
    : null;

  console.log(JSON.stringify({
    ok: true,
    message,
    task,
    dispatch,
    hint: dispatch ? "" : `Run ai-memory-hub dispatch --to ${to} --project ${project} --run to trigger a verified runner.`
  }, null, 2));
}
