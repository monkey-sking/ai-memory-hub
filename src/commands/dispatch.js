import { getOption, hasFlag, parsePositiveIntegerOption, positionalArgs } from "../lib/cli.js";

// dispatch command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export async function dispatchCommand(argv, deps) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  if (action === "retry") {
    return dispatchRetryCommand(argv.slice(1), deps);
  }
  if (action === "status") {
    return dispatchStatusCommand(argv.slice(1), deps);
  }
  if (action === "progress" || action === "heartbeat") {
    return dispatchProgressCommand(argv.slice(1), deps);
  }
  const run = hasFlag(argv, "--run");
  const force = hasFlag(argv, "--force");
  const to = getOption(argv, "--to") || "";
  const project = getOption(argv, "--project") || "";
  const limit = Number(getOption(argv, "--limit") || 10);
  const model = getOption(argv, "--model") || "";
  const respectRecipeDependencies = hasFlag(argv, "--respect-recipe-dependencies");
  const isolateWorktree = hasFlag(argv, "--isolate-worktree");
  const worktreeRoot = getOption(argv, "--worktree-root") || "";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const results = await deps.executeDispatch(config.memoryDir, { run, force, to, project, limit, model, respectRecipeDependencies, isolateWorktree, worktreeRoot });
  if (results.length === 0) {
    console.log(JSON.stringify({ run, jobs: [], message: "No undispatched radio messages or active tasks matched." }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    run,
    results
  }, null, 2));
}


export function dispatchStatusCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const threadKey = getOption(argv, "--thread-key") || "";
  const thread = getOption(argv, "--thread") || "";
  const refId = getOption(argv, "--ref-id") || "";
  const project = getOption(argv, "--project") || "";
  const tool = getOption(argv, "--to") || getOption(argv, "--tool") || "";
  const state = getOption(argv, "--state") || "";
  const recentValue = getOption(argv, "--recent");
  const limitValue = getOption(argv, "--limit");
  const recent = parsePositiveIntegerOption(recentValue, "--recent", { allowEmpty: true, defaultValue: 0 });
  const limit = parsePositiveIntegerOption(limitValue, "--limit", {
    allowEmpty: true,
    defaultValue: recent || 20
  });
  const hasExplicitThreadScope = Boolean(threadKey || thread);
  const wantsRecentView = recent > 0 || hasFlag(argv, "--recent");

  if (!threadKey && !thread && !refId && !wantsRecentView) {
    throw new Error("Usage: ai-memory-hub dispatch status [--thread-key <tool:project:ref> | --thread <thread-id> | --ref-id <id> | --recent [N]] [--project <project>] [--to <tool>] [--state <relay-state>] [--limit <N>]");
  }

  if (!threadKey && !thread && !refId && wantsRecentView) {
    const summary = deps.buildRecentRelayStatusView(config.memoryDir, {
      project,
      tool,
      state,
      limit
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const resolvedThreadKeys = deps.resolveRelayThreadKeys(config.memoryDir, {
    threadKey,
    thread,
    refId,
    project,
    tool
  });
  if ((threadKey || thread || refId) && resolvedThreadKeys && resolvedThreadKeys.size === 0) {
    console.log(JSON.stringify({
      found: false,
      query: {
        threadKey,
        thread,
        refId,
        project,
        tool,
        state
      },
      message: "No relay status entries matched."
    }, null, 2));
    return;
  }

  const all = deps.readRelayStatus(config.memoryDir)
    .filter((entry) => threadKey ? entry.threadKey === threadKey : true)
    .filter((entry) => resolvedThreadKeys ? resolvedThreadKeys.has(entry.threadKey) : true)
    .filter((entry) => (!hasExplicitThreadScope && refId) ? entry.sourceId === refId || entry.dispatchId === refId : true)
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => tool ? entry.tool === tool : true)
    .filter((entry) => state ? entry.state === state : true)
    .sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));

  if (all.length === 0) {
    console.log(JSON.stringify({
      found: false,
      query: {
        threadKey,
        thread,
        refId,
        project,
        tool,
        state
      },
      message: "No relay status entries matched."
    }, null, 2));
    return;
  }

  const latest = all[all.length - 1];
  const source = deps.resolveRelaySourceObject(config.memoryDir, latest);
  const related = deps.resolveRelayRelatedObjects(config.memoryDir, latest, source);
  const dispatchLog = deps.readDispatchLog(config.memoryDir)
    .filter((entry) => latest.threadKey ? deps.getDispatchThreadKey(entry) === latest.threadKey : true)
    .filter((entry) => (!hasExplicitThreadScope && refId) ? entry.refId === refId || entry.id === refId : true)
    .sort((a, b) => String(a.dispatchedAt || "").localeCompare(String(b.dispatchedAt || "")));
  const runHistory = deps.readDispatchRuns(config.memoryDir)
    .filter((entry) => latest.threadKey ? entry.threadKey === latest.threadKey : true)
    .filter((entry) => (!hasExplicitThreadScope && refId)
      ? entry.sourceId === refId || entry.dispatchId === refId || entry.dispatchId === `task:${refId}` || entry.dispatchId === `radio:${refId}` || entry.dispatchId === `workflow:${refId}`
      : true)
    .sort((a, b) => String(a.startedAt || "").localeCompare(String(b.startedAt || "")));
  const states = all.map((entry) => entry.state).filter(Boolean);
  const latestRun = runHistory.at(-1) || null;
  const latestWorktree = latestRun?.worktree || latest.worktree || source?.worktree || null;
  const summary = {
    threadKey: latest.threadKey || "",
    thread: latest.thread || "",
    sourceKind: latest.sourceKind || "",
    sourceId: latest.sourceId || "",
    tool: latest.tool || "",
    project: latest.project || "",
    latestState: latest.state || "",
    attempt: Number(latest.attempt || 0),
    maxRetries: Number(latest.maxRetries || 0),
    exitCode: latest.exitCode ?? null,
    sessionId: latest.sessionId || "",
    lastError: latest.lastError || "",
    progressPercent: latest.progressPercent ?? null,
    progressStatus: latest.progressStatus || "",
    progressAt: latest.progressAt || "",
    progressBy: latest.progressBy || "",
    nextRetryAt: latest.nextRetryAt || "",
    latestRunId: latestRun?.runId || "",
    latestRunStatus: latestRun?.status || "",
    latestRunExitCode: latestRun?.exitCode ?? null,
    latestRunVerificationResult: latestRun?.verificationResult || "",
    latestRunFinishedAt: latestRun?.finishedAt || "",
    latestWorktree,
    firstTs: all[0]?.ts || "",
    latestTs: latest.ts || "",
    timelineLength: all.length,
    states
  };

  console.log(JSON.stringify({
    found: true,
      query: {
        threadKey,
        thread,
        refId,
        project,
        tool,
        state
      },
    summary,
    source,
    related,
    matchedThreadKeys: [...new Set(all.map((entry) => entry.threadKey).filter(Boolean))],
    latest,
    timeline: all,
    runHistory,
    dispatchLog
  }, null, 2));
}


export function dispatchProgressCommand(argv, deps) {
  const threadKey = getOption(argv, "--thread-key") || "";
  const thread = getOption(argv, "--thread") || "";
  const refId = getOption(argv, "--ref-id") || positionalArgs(argv)[0] || "";
  const project = getOption(argv, "--project") || "";
  const tool = getOption(argv, "--to") || getOption(argv, "--tool") || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || tool || "manual";
  const progressPercent = deps.parseProgressPercent(getOption(argv, "--percent") || getOption(argv, "--progress"));
  const progressStatus = getOption(argv, "--status") || getOption(argv, "--message") || getOption(argv, "--text") || "";

  if (!threadKey && !thread && !refId) {
    throw new Error("Usage: ai-memory-hub dispatch progress --ref-id <task-or-radio-id> [--thread-key <tool:project:ref> | --thread <thread-id>] [--to <tool>] [--project <project>] [--percent 0-100] [--status <text>] [--by <tool>]");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  return deps.withHubLock(config.memoryDir, "dispatch-progress", () => {
    const entry = deps.findLatestRelayStatusEntry(config.memoryDir, {
      threadKey,
      thread,
      refId,
      project,
      tool
    });

    if (!entry) {
      console.log(JSON.stringify({
        ok: false,
        found: false,
        query: { threadKey, thread, refId, project, tool },
        message: "No relay status entry matched. Progress can only be attached to an existing dispatch thread."
      }, null, 2));
      return;
    }

    const job = deps.rebuildDispatchJobFromRelay(config.memoryDir, entry) || dispatchJobFromRelayEntry(entry, deps);
    const progressAt = new Date().toISOString();
    deps.appendRelayStatus(config.memoryDir, job, {
      state: ASYNC_CALL_STATES.PROGRESS,
      attempt: Number(entry.attempt || 1),
      maxRetries: deps.normalizeDispatchRetryLimit(entry.maxRetries),
      exitCode: entry.exitCode ?? null,
      lastError: "",
      sessionId: entry.sessionId || "",
      ackTimeout: Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS),
      nextRetryAt: "",
      progressPercent,
      progressStatus,
      progressAt,
      progressBy: by
    });
    deps.updateDispatchSourceState(config.memoryDir, job, {
      deliveryState: ASYNC_CALL_STATES.PROGRESS,
      dispatchId: job.id,
      threadKey: deps.getDispatchThreadKey(job),
      attempt: Number(entry.attempt || 1),
      maxRetries: deps.normalizeDispatchRetryLimit(entry.maxRetries),
      nextRetryAt: "",
      sessionId: entry.sessionId || "",
      lastError: "",
      progressPercent,
      progressStatus,
      progressAt,
      progressBy: by
    });

    const latest = deps.findLatestRelayStatusEntry(config.memoryDir, {
      threadKey: deps.getDispatchThreadKey(job)
    });
    console.log(JSON.stringify({
      ok: true,
      state: ASYNC_CALL_STATES.PROGRESS,
      threadKey: deps.getDispatchThreadKey(job),
      sourceKind: job.kind,
      sourceId: job.refId,
      tool: job.tool,
      project: job.project,
      progressPercent,
      progressStatus,
      progressAt,
      progressBy: by,
      latest
    }, null, 2));
  }, config.sync.lockStaleMs);
}


export function dispatchRetryCommand(argv, deps) {
  const run = hasFlag(argv, "--run");
  const to = getOption(argv, "--to") || "";
  const project = getOption(argv, "--project") || "";
  const limit = Number(getOption(argv, "--limit") || 10);
  const model = getOption(argv, "--model") || "";
  const respectRecipeDependencies = hasFlag(argv, "--respect-recipe-dependencies");
  const isolateWorktree = hasFlag(argv, "--isolate-worktree");
  const worktreeRoot = getOption(argv, "--worktree-root") || "";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const results = deps.executeDispatchRetry(config.memoryDir, { run, to, project, limit, model, respectRecipeDependencies, isolateWorktree, worktreeRoot });
  if (results.length === 0) {
    console.log(JSON.stringify({ run, jobs: [], message: "No failed relay jobs are eligible for retry." }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    run,
    results
  }, null, 2));
}

// ── feature ④: prepare/process helpers extracted from executeDispatch ──
// prepareDispatchJobForRun: does everything BEFORE the runner subprocess runs.
// Returns { skip: result } for non-runnable/dry-run/permission-denied jobs,
// or { job, runner, attempt, maxRetries, options } for jobs that should run.

export function dispatchJobFromRelayEntry(entry, deps) {
  return {
    id: entry.dispatchId || `${entry.sourceKind || "relay"}:${entry.sourceId || entry.id || ""}`,
    kind: entry.sourceKind || "relay",
    tool: entry.tool || "",
    project: entry.project || "",
    text: "",
    refId: entry.sourceId || "",
    thread: entry.thread || entry.sourceId || "",
    sessionId: entry.sessionId || ""
  };
}


export function dispatchJobFromTask(task, deps) {
  const roles = [];
  if (task.recipeStep?.role) {
    roles.push(`role:${task.recipeStep.role}`);
  }
  return {
    id: `task:${task.id}`,
    kind: "task",
    tool: task.assignee,
    project: task.project || "",
    text: deps.buildTaskDispatchText(task),
    refId: task.id,
    thread: task.id,
    qualityGate: task.qualityGate || {},
    recipe: task.recipe || null,
    recipeStep: task.recipeStep || null,
    roles
  };
}


export function dispatchJobFromWorkflow(workflow, tool = "", deps) {
  const roles = [];
  // Workflow level doesn't have a specific role, but we could add workflow roles in the future
  return {
    id: `workflow:${workflow.id}`,
    kind: "workflow",
    tool: deps.normalizeToolName(tool),
    project: workflow.project || "",
    text: deps.buildWorkflowDispatchText(workflow),
    refId: workflow.id,
    thread: workflow.id,
    qualityGate: workflow.qualityGate || {},
    recipe: workflow.recipe || null,
    roles
  };
}

