import { writeFileAtomic } from "../atomic-write.js";
import { acquireDaemonLock, releaseDaemonLock } from "../daemon-lock.js";
import { ensureDir, getOption, hasFlag } from "../lib/cli.js";

// daemon command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function daemonCommand(argv, deps) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  if (action === "status") {
    return daemonStatusCommand(argv.slice(1), deps);
  }
  if (action) {
    throw new Error("Usage: ai-memory-hub daemon [status] [--interval-ms <ms>] [--project <name[,name]>] [--tools <tool1,tool2>] [--limit <n>] [--force] [--isolate-worktree] [--worktree-root <dir>]");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const intervalMs = Number(getOption(argv, "--interval-ms") || 5000);
  const limit = Number(getOption(argv, "--limit") || 10);
  const projects = getOption(argv, "--project");
  const projectList = projects ? projects.split(",") : [];
  const force = hasFlag(argv, "--force");
  const isolateWorktree = hasFlag(argv, "--isolate-worktree");
  const worktreeRoot = getOption(argv, "--worktree-root") || "";
  const toolsOption = getOption(argv, "--tools");
  const daemonTools = toolsOption
    ? toolsOption.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
    : [...DAEMON_DEFAULT_TOOLS];
  const startedAt = new Date().toISOString();
  const daemonLock = acquireDaemonLock(config.memoryDir, { pid: process.pid });
  if (!daemonLock.acquired) {
    throw new Error("Daemon already appears to be running as pid " + daemonLock.pid + ". Stop the active daemon before starting another instance.");
  }
  const currentStatus = deps.buildDaemonStatus(config.memoryDir);
  if (currentStatus.running) {
    releaseDaemonLock(daemonLock);
    throw new Error("Daemon already appears to be running as pid " + currentStatus.pid + ". Stop the active daemon before starting another instance.");
  }
  process.on("exit", () => releaseDaemonLock(daemonLock));
  deps.writeDaemonPid(config.memoryDir, process.pid);
  deps.writeDaemonStatus(config.memoryDir, {
    state: "starting",
    pid: process.pid,
    startedAt,
    stoppedAt: "",
    stopSignal: "",
    intervalMs,
    limit,
    projects: projectList,
    tools: Array.isArray(daemonTools) ? daemonTools : String(daemonTools).split(/[,\s]+/),
    isolateWorktree,
    worktreeRoot,
    cycle: 0,
    lastCycleStartedAt: "",
    lastCycleFinishedAt: "",
    lastError: "",
    memoryDir: config.memoryDir
  });

  console.log(`Starting AI Memory Hub Daemon`);
  console.log(`PID: ${process.pid}`);
  console.log(`Monitoring: radio messages and tasks`);
  console.log(`Interval: ${intervalMs}ms`);
  console.log(`Tools: ${daemonTools.join(", ")}`);
  console.log(`Limit per tool/project: ${limit}`);
  if (projectList.length > 0) {
    console.log(`Projects: ${projectList.join(", ")}`);
  }

  // Read loop checkpoint for resumable loops
  let loopCheckpoint = deps.readLoopCheckpoint(config.memoryDir);
  const checkpointStats = deps.getCheckpointStats(loopCheckpoint);
  if (checkpointStats.cycle > 0) {
    console.log(`Resuming from checkpoint: cycle ${checkpointStats.cycle}, ${checkpointStats.completed} completed, ${checkpointStats.failed} failed`);
  }
  console.log("Press Ctrl+C to stop.\n");

  let iteration = checkpointStats.cycle;
  let timer = null;
  let stopping = false;
  const runCycle = async () => {
    if (stopping) {
      return;
    }
    iteration++;
    const cycleStartedAt = new Date().toISOString();
    const cycleErrors = [];
    deps.writeDaemonStatus(config.memoryDir, {
      state: "running",
      pid: process.pid,
      startedAt,
      intervalMs,
      limit,
      projects: projectList,
      tools: Array.isArray(daemonTools) ? daemonTools : String(daemonTools).split(/[,\s]+/),
      cycle: iteration,
      lastCycleStartedAt: cycleStartedAt,
      lastError: ""
    });
    console.log(`[${cycleStartedAt}] Cycle #${iteration}`);

    // Write heartbeat at start of cycle so it's fresh even if dispatch takes long
    deps.writeDaemonHeartbeat(config.memoryDir, {
      pid: process.pid,
      cycle: iteration,
      toolResults: "running"
    });

    // Refresh provider model catalogs when they go stale (default: every 24h)
    try {
      const modelRefresh = deps.refreshModelsIfStale(config.memoryDir);
      if (modelRefresh.length > 0) {
        console.log(`  -> Refreshed model catalog for ${modelRefresh.map((item) => item.tool).join(", ")}`);
      }
    } catch (err) {
      console.error(`  Model catalog refresh error: ${err.message}`);
    }

    try {
      const tools = daemonTools;

      for (const tool of tools) {
        const runner = deps.getToolRunner(tool);
        if (!runner.available) {
          continue;
        }

        const checkProjects = projectList.length > 0 ? projectList : [null];

        for (const project of checkProjects) {
          try {
            const retryResults = deps.executeDispatchRetry(config.memoryDir, {
              run: true,
              to: tool,
              project,
              limit,
              respectRecipeDependencies: true,
              isolateWorktree,
              worktreeRoot
            });
            const timeoutResults = retryResults.filter((result) => result.timeout);
            const retriedResults = retryResults.filter((result) => !result.timeout);
            if (timeoutResults.length > 0) {
              console.log(`  -> Marked ${timeoutResults.length} timed-out relay(s) for ${tool}${project ? ` (project: ${project})` : ""}`);
            }
            if (retriedResults.length > 0) {
              console.log(`  -> Retried ${retriedResults.length} relay job(s) for ${tool}${project ? ` (project: ${project})` : ""}`);
            }

            const results = await deps.executeDispatch(config.memoryDir, {
              run: true,
              to: tool,
              project,
              limit,
              respectRecipeDependencies: true,
              isolateWorktree,
              worktreeRoot
            });

            if (results.length > 0) {
              console.log(`  -> Dispatched ${results.length} job(s) to ${tool}${project ? ` (project: ${project})` : ""}`);
              for (const result of results) {
                if (result.exitCode === 0) {
                  console.log(`    ok ${result.kind}:${String(result.refId || "").substring(0, 8)} completed`);
                } else {
                  console.log(`    fail ${result.kind}:${String(result.refId || "").substring(0, 8)} failed (exit ${result.exitCode})`);
                }
              }
            }
          } catch (err) {
            cycleErrors.push(`${tool}${project ? `/${project}` : ""}: ${err.message || String(err)}`);
            console.error(`  Cycle tool error for ${tool}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      cycleErrors.push(err.message || String(err));
      console.error(`Cycle error: ${err.message}`);
    }
    const cycleFinishedAt = new Date().toISOString();
    deps.writeDaemonStatus(config.memoryDir, {
      state: "running",
      pid: process.pid,
      startedAt,
      intervalMs,
      limit,
      projects: projectList,
      isolateWorktree,
      worktreeRoot,
      cycle: iteration,
      lastCycleStartedAt: cycleStartedAt,
      lastCycleFinishedAt: cycleFinishedAt,
      lastError: cycleErrors.join(" | ")
    });

    // Write loop checkpoint
    loopCheckpoint.cycle = iteration;
    loopCheckpoint.lastCompletedAt = cycleFinishedAt;
    deps.writeLoopCheckpoint(config.memoryDir, loopCheckpoint);

    // Write heartbeat
    deps.writeDaemonHeartbeat(config.memoryDir, {
      pid: process.pid,
      cycle: iteration,
      toolResults: cycleErrors.length === 0 ? "ok" : cycleErrors.join("; ")
    });

    console.log("");
  };

  const stop = (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    if (timer) {
      clearInterval(timer);
    }
    deps.writeDaemonStatus(config.memoryDir, {
      state: "stopped",
      pid: process.pid,
      startedAt,
      stoppedAt: new Date().toISOString(),
      stopSignal: signal || "stop",
      intervalMs,
      limit,
      projects: projectList,
      cycle: iteration
    });
    releaseDaemonLock(daemonLock);
    deps.clearDaemonPid(config.memoryDir, process.pid);
    // Clean up file watchers
    for (const w of watchers) {
      try { w.close(); } catch {}
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    console.log(`\n${signal || "stop"} received; daemon stopped.`);
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  runCycle();
  timer = setInterval(runCycle, intervalMs);

  // Event-driven push: watch files for changes and trigger immediate cycle
  const watchDebounceMs = 1000;
  let debounceTimer = null;
  const triggerCycle = () => {
    if (stopping) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!stopping) runCycle();
    }, watchDebounceMs);
  };

  const watchFiles = [
    path.join(config.memoryDir, "radio", "messages.jsonl"),
    path.join(config.memoryDir, "tasks", "events.jsonl"),
    path.join(config.memoryDir, "inbox", "events.jsonl")
  ];

  const watchers = [];
  for (const file of watchFiles) {
    try {
      ensureDir(path.dirname(file));
      if (!fs.existsSync(file)) {
        writeFileAtomic(file, "", "utf8");
      }
      const watcher = fs.watch(file, { persistent: false }, (eventType) => {
        if (eventType === "change" || eventType === "rename") {
          console.log(`[${new Date().toISOString()}] Change detected in ${path.basename(file)}, scheduling cycle...`);
          triggerCycle();
        }
      });
      watchers.push(watcher);
    } catch { /* file watch not available */ }
  }

  if (watchers.length > 0) {
    console.log(`Watching ${watchers.length} file(s) for changes (event-driven mode).`);
  }
}

// Skill candidate mining and skill delta system (self-improvement)


export function daemonStatusCommand(deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  console.log(JSON.stringify(deps.buildDaemonStatus(config.memoryDir), null, 2));
}

// Loop checkpoint system

