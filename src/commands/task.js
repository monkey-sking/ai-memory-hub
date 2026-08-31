import { writeFileAtomic } from "../atomic-write.js";
import { appendJsonl } from "../event-writer.js";
import { normalizeGithubLinks } from "../github-links.js";
import {
  createId,
  ensureDir,
  getOption,
  hasFlag,
  positionalArgs,
} from "../lib/cli.js";
import { getTaskEventStoreDefinition, normalizePriority } from "../lib/entity-models.js";
import { readTasks, writeTasks } from "../lib/entity-repo.js";
import { getEntityEventsFile, getEntityProjectionFile, materializeEntityProjection, readEntityEvents } from "../lib/entity-store.js";
import { readEvents } from "../lib/io.js";
import { mineSkillCandidates } from "../skill-mining.js";
import fs from "node:fs";
import path from "node:path";

// Task command cluster. Cross-cutting helpers are injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function taskSpecCommand(argv, deps) {
  const action = argv[0] || "list";
  switch (action) {
    case "list":
      return taskSpecListCommand(argv.slice(1), deps);
    case "show":
      return taskSpecShowCommand(argv.slice(1), deps);
    case "validate":
      return taskSpecValidateCommand(argv.slice(1), deps);
    case "run":
      return taskSpecRunCommand(argv.slice(1), deps);
    default:
      throw new Error(`Unknown task-spec action: ${action}\nTry: ai-memory-hub task-spec list|show|validate|run`);
  }
}


export function taskSpecListCommand(argv, deps) {
  const context = deps.loadTaskSpecContext(argv);
  const validation = deps.validateTaskSpecDocument(context.document);
  if (!validation.valid) {
    throw new Error(`Invalid task spec: ${validation.error}`);
  }
  console.log(JSON.stringify({
    file: context.displayFile,
    version: context.document.version || "",
    tasks: validation.tasks.map((task) => deps.summarizeTaskSpec(task))
  }, null, 2));
}


export function taskSpecShowCommand(argv, deps) {
  const taskId = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!taskId) {
    throw new Error("Usage: ai-memory-hub task-spec show <task-id> [--file <path>] [--root <path>]");
  }
  const { task, context } = deps.resolveTaskSpecFromArgs(argv, taskId);
  console.log(JSON.stringify({
    file: context.displayFile,
    ...task
  }, null, 2));
}


export function taskSpecValidateCommand(argv, deps) {
  const context = deps.loadTaskSpecContext(argv);
  const validation = deps.validateTaskSpecDocument(context.document);
  if (!validation.valid) {
    console.log(JSON.stringify({
      valid: false,
      file: context.displayFile,
      error: validation.error
    }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    valid: true,
    file: context.displayFile,
    tasks: validation.tasks.length
  }, null, 2));
}


export function taskSpecRunCommand(argv, deps) {
  const taskId = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!taskId) {
    throw new Error("Usage: ai-memory-hub task-spec run <task-id> [--file <path>] [--root <path>] [--no-verify] [--allow-outside-cwd]");
  }
  const { task, context } = deps.resolveTaskSpecFromArgs(argv, taskId);
  const result = deps.runTaskSpec(task, {
    projectRoot: context.projectRoot,
    runVerify: !hasFlag(argv, "--no-verify"),
    allowOutsideCwd: hasFlag(argv, "--allow-outside-cwd")
  });
  console.log(JSON.stringify({
    file: context.displayFile,
    ...result
  }, null, 2));
  if (result.status !== "passed") {
    process.exit(1);
  }
}


export function taskCommand(argv, deps) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "add":
      return taskAddCommand(actionArgs, deps);
    case "list":
      return taskListCommand(actionArgs, deps);
    case "claim":
      return taskClaimCommand(actionArgs, deps);
    case "status":
      return taskStatusCommand(actionArgs, deps);
    case "update":
      return taskUpdateCommand(actionArgs, deps);
    case "note":
      return taskNoteCommand(actionArgs, deps);
    case "done":
      return taskDoneCommand(actionArgs, deps);
    case "purge":
      return taskPurgeCommand(actionArgs, deps);
    case "archive":
      return taskArchiveCommand(actionArgs, deps);
    case "fail":
      return taskFailCommand(actionArgs, deps);
    case "budget":
      return taskBudgetCommand(actionArgs, deps);
    case "tokens":
      return taskTokensCommand(actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub task <add|list|claim|status|update|note|done|purge|archive|fail|budget|tokens> ...");
  }
}



export function taskAddCommand(argv, deps) {
  const title = positionalArgs(argv).join(" ").trim();
  if (!title) {
    throw new Error("Usage: ai-memory-hub task add <title> [--description text] [--handoff text] [--from codex] [--project name] [--priority normal]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "task-add", () => {
    const tasks = readTasks(config.memoryDir);
    const task = deps.createTask({
      title,
      description: getOption(argv, "--description") || "",
      handoff: getOption(argv, "--handoff") || "",
      createdBy: getOption(argv, "--from") || getOption(argv, "--by") || "manual",
      project: getOption(argv, "--project") || path.basename(process.cwd()),
      priority: getOption(argv, "--priority") || "normal"
    });
    tasks.push(task);
    writeTasks(config.memoryDir, tasks);
    console.log(JSON.stringify(task, null, 2));
  }, config.sync.lockStaleMs);
}


export function taskListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const status = getOption(argv, "--status") || "active";
  const project = getOption(argv, "--project") || "";
  const assignee = getOption(argv, "--assignee") || "";
  const limit = Number(getOption(argv, "--limit") || 20);
  const includeCancelled = hasFlag(argv, "--all");
  const tasks = readTasks(config.memoryDir)
    .filter((task) => taskListStatusMatches(task, status, includeCancelled, deps))
    .filter((task) => project ? task.project === project : true)
    .filter((task) => assignee ? task.assignee === assignee : true)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, limit);
  console.log(JSON.stringify(tasks, null, 2));
}


export function taskListStatusMatches(task, status, includeCancelled, deps) {
  if (task.status === "cancelled" && !includeCancelled && status !== "cancelled") {
    return false;
  }
  if (status === "all") {
    return true;
  }
  if (status === "active") {
    return !["done", "cancelled"].includes(task.status);
  }
  return task.status === status;
}

// P0.1 (borrowed from Cumora's markThinking TTL): a claim carries a soft TTL so a
// runner that crashes after claiming cannot wedge the task in "claimed" forever.

export function taskClaimCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id) {
    throw new Error("Usage: ai-memory-hub task claim --id <task-id> [--by codex]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const ttlMs = deps.getClaimTtlMs(config);
  // P1 linkage: if the current claim is stale, the previous assignee should drop back to idle.
  const preTask = readTasks(config.memoryDir).find((t) => t.id === id);
  const staleAssignee = preTask && deps.isClaimStale(preTask, Date.parse(new Date().toISOString()), ttlMs) ? (preTask.assignee || "") : "";
  const task = deps.withHubLock(config.memoryDir, "task-claim", () => {
    return deps.updateTask(config.memoryDir, id, (current) => {
      const nowIso = new Date().toISOString();
      const nowMs = Date.parse(nowIso);
      let next = current;
      // Auto-release a stale claim before allowing a new one (Cumora-style self-heal).
      if (deps.isClaimStale(current, nowMs, ttlMs)) {
        next = deps.releaseStaleClaim(current, nowIso);
      }
      const alreadyClaimed = next.status === "claimed";
      return {
        ...next,
        status: "claimed",
        assignee: by,
        claimedAt: nowIso,
        claimExpiresAt: new Date(nowMs + ttlMs).toISOString(),
        updatedAt: nowIso,
        notes: [
          ...(next.notes || []),
          deps.createTaskNote(by, alreadyClaimed ? `Re-claimed by ${by} (previous claim expired/released).` : `Claimed by ${by}.`)
        ]
      };
    });
  }, config.sync.lockStaleMs);
  // P0.3: broadcast the claim so peer runners can see who is working on what (Cumora glance).
  try {
    appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), deps.createRadioMessage({
      from: by,
      to: "all",
      type: "task-claim",
      text: `Claimed task ${id}: ${task.title || ""}`,
      project: task.project || ""
    }));
  } catch (e) {
    // best-effort, non-blocking
  }
  // P1 linkage: claimer becomes busy; a stale previous assignee returns to idle (self-heal via P0 TTL).
  try {
    deps.touchAgentStatus(config.memoryDir, by, "busy", by);
    if (staleAssignee && staleAssignee !== by) deps.touchAgentStatus(config.memoryDir, staleAssignee, "idle", "system");
  } catch (e) {
    // best-effort, non-blocking
  }
  console.log(JSON.stringify(task, null, 2));
}


export function taskStatusCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const status = getOption(argv, "--status") || positionalArgs(argv)[1] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id || !status) {
    throw new Error("Usage: ai-memory-hub task status --id <task-id> --status <open|claimed|in_progress|blocked|needs_verification|done|cancelled> [--by codex]");
  }
  deps.assertTaskStatus(status);
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "task-status", () => {
    const task = deps.updateTask(config.memoryDir, id, (current) => ({
      ...current,
      status,
      assignee: current.assignee || by,
      updatedAt: new Date().toISOString(),
      completedAt: status === "done" ? new Date().toISOString() : current.completedAt || "",
      notes: [
        ...(current.notes || []),
        deps.createTaskNote(by, `Status changed to ${status}.`)
      ]
    }));
    console.log(JSON.stringify(task, null, 2));
  }, config.sync.lockStaleMs);
}


export function taskNoteCommand(argv, deps) {
  const args = positionalArgs(argv);
  const id = getOption(argv, "--id") || args[0] || "";
  const text = getOption(argv, "--text") || (getOption(argv, "--id") ? args.join(" ") : args.slice(1).join(" ")).trim();
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  if (!id || !text) {
    throw new Error("Usage: ai-memory-hub task note --id <task-id> <note> [--by codex]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "task-note", () => {
    const task = deps.updateTask(config.memoryDir, id, (current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      notes: [
        ...(current.notes || []),
        deps.createTaskNote(by, text)
      ]
    }));
    console.log(JSON.stringify(task, null, 2));
  }, config.sync.lockStaleMs);
}


export function taskDoneCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  const force = hasFlag(argv, "--force");
  if (!id) {
    throw new Error("Usage: ai-memory-hub task done --id <task-id> [--by codex] [--force]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const result = deps.withHubLock(config.memoryDir, "task-done", () => {
    // OPC v1.1 P0: Check evaluation signals before allowing done
    if (!force) {
      const tasks = readTasks(config.memoryDir);
      const taskIdx = deps.findTaskIndex(tasks, id);
      if (taskIdx !== -1) {
        const currentTask = tasks[taskIdx];
        const signals = currentTask.evaluationSignals || [];
        if (signals.length > 0) {
          const failedSignals = signals.filter(s => s.signalStatus === "fail");
          if (failedSignals.length > 0) {
            throw new Error("Cannot mark task done: " + failedSignals.length + " evaluation signal(s) failed: " + failedSignals.map(s => s.signalType || "unknown").join(", ") + ". Use --force to override.");
          }
        }
      }
    }
    const task = deps.updateTask(config.memoryDir, id, (current) => ({
      ...current,
      status: "done",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      assignee: current.assignee || by,
      notes: [
        ...(current.notes || []),
        deps.createTaskNote(by, `Completed by ${by}.` + (force ? " (forced, signals bypassed)" : ""))
      ]
    }));
    const minedCandidates = deps.appendSkillCandidates(config.memoryDir, mineSkillCandidates(task));
    return { ...task, minedSkillCandidates: minedCandidates };
  }, config.sync.lockStaleMs);
  // P1 linkage: completing a task frees the assignee back to idle (Cumora-style self-heal via P0 TTL).
  try {
    const doneBy = result.assignee || by;
    if (doneBy) deps.touchAgentStatus(config.memoryDir, doneBy, "idle", by);
  } catch (_) {
    // best-effort, non-blocking
  }
  console.log(JSON.stringify(result, null, 2));
}


export function taskPurgeCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const confirmTitle = getOption(argv, "--confirm") || "";
  const force = hasFlag(argv, "--force");

  if (!id) {
    throw new Error("Usage: ai-memory-hub task purge --id <task-id> --confirm <task-title>");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  return deps.withHubLock(config.memoryDir, "task-purge", () => {
    const tasks = readTasks(config.memoryDir);
    const taskIndex = deps.findTaskIndex(tasks, id);

    if (taskIndex === -1) {
      throw new Error(`Task not found: ${id}`);
    }

    const task = tasks[taskIndex];

    // Safety check: only allow purging cancelled tasks
    if (task.status !== "cancelled" && !force) {
      throw new Error(`Cannot purge task with status '${task.status}'. Only 'cancelled' tasks can be purged. Use --force to override (not recommended).`);
    }

    // Require confirmation by typing task title
    if (confirmTitle !== task.title) {
      console.error(JSON.stringify({
        error: true,
        message: "Confirmation failed. You must type the exact task title to confirm deletion.",
        taskId: task.id,
        taskTitle: task.title,
        hint: `Run: ai-memory-hub task purge --id ${id} --confirm "${task.title}"`
      }, null, 2));
      process.exit(1);
    }

    const definition = getTaskEventStoreDefinition();
    const eventsFile = getEntityEventsFile(config.memoryDir, definition);
    const projectionFile = getEntityProjectionFile(config.memoryDir, definition);
    const purgeLogFile = path.join(config.memoryDir, "tasks", "purge.log");

    // Create timestamped backups
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const eventsBackup = `${eventsFile}.backup.${timestamp}`;
    const projectionBackup = `${projectionFile}.backup.${timestamp}`;

    try {
      // Backup events file
      if (fs.existsSync(eventsFile)) {
        fs.copyFileSync(eventsFile, eventsBackup);
      }

      // Backup projection file
      if (fs.existsSync(projectionFile)) {
        fs.copyFileSync(projectionFile, projectionBackup);
      }

      // Read all events
      const allEvents = readEntityEvents(config.memoryDir, definition);

      // Filter out events related to this task (atomic write)
      const filteredEvents = allEvents.filter(event => event.entityId !== id);

      // Write filtered events atomically
      const tempEventsFile = `${eventsFile}.tmp.${Date.now()}`;
      ensureDir(path.dirname(tempEventsFile));
      writeFileAtomic(
        tempEventsFile,
        filteredEvents.map(e => JSON.stringify(e)).join("\n") + (filteredEvents.length ? "\n" : ""),
        "utf8"
      );
      fs.renameSync(tempEventsFile, eventsFile);

      // Rematerialize projection
      materializeEntityProjection(config.memoryDir, definition);

      // Log the purge operation
      ensureDir(path.dirname(purgeLogFile));
      const logEntry = {
        ts: new Date().toISOString(),
        action: "purge",
        taskId: id,
        taskTitle: task.title,
        taskStatus: task.status,
        eventsBackup: path.basename(eventsBackup),
        projectionBackup: path.basename(projectionBackup),
        eventCountBefore: allEvents.length,
        eventCountAfter: filteredEvents.length,
        removedEvents: allEvents.length - filteredEvents.length
      };
      appendJsonl(purgeLogFile, logEntry);

      console.log(JSON.stringify({
        success: true,
        message: "Task purged successfully",
        taskId: id,
        taskTitle: task.title,
        backups: {
          events: eventsBackup,
          projection: projectionBackup
        },
        purgeLog: purgeLogFile
      }, null, 2));

    } catch (error) {
      // Restore from backups on error
      if (fs.existsSync(eventsBackup)) {
        fs.copyFileSync(eventsBackup, eventsFile);
      }
      if (fs.existsSync(projectionBackup)) {
        fs.copyFileSync(projectionBackup, projectionFile);
      }
      throw new Error(`Purge failed and backups restored: ${error.message}`);
    }

  }, config.sync.lockStaleMs);
}


export function taskArchiveCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  
  const daysOption = getOption(argv, "--days") || "30";
  const days = parseInt(daysOption, 10);
  if (isNaN(days) || days < 0) {
    throw new Error("Usage: ai-memory-hub task archive [--days <number>]");
  }
  
  const cutoffTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`Archiving tasks completed before ${cutoffTime.toISOString()} (older than ${days} days)...`);
  
  const tasks = readTasks(config.memoryDir);
  const tasksToArchive = tasks.filter(task => {
    if (task.status !== "done") return false;
    const dateStr = task.completedAt || task.updatedAt || task.createdAt || "";
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date < cutoffTime;
  });
  
  if (tasksToArchive.length === 0) {
    console.log("No completed tasks found matching the archiving criteria.");
    return;
  }
  
  console.log(`Found ${tasksToArchive.length} completed task(s) to archive.`);
  
  const archiveIds = new Set(tasksToArchive.map(t => t.id));
  const eventsFile = getEntityEventsFile(config.memoryDir, getTaskEventStoreDefinition());
  const archiveEventsFile = path.join(config.memoryDir, "tasks", "events-archive.jsonl");
  const archiveTasksFile = path.join(config.memoryDir, "tasks", "tasks-archive.jsonl");
  
  // Read all events
  const allEvents = readEvents(eventsFile);
  const keepEvents = [];
  const archiveEvents = [];
  
  for (const event of allEvents) {
    if (archiveIds.has(event.entityId)) {
      archiveEvents.push(event);
    } else {
      keepEvents.push(event);
    }
  }
  
  console.log(`Moving ${archiveEvents.length} event(s) to archive...`);
  
  // Write files
  ensureDir(path.dirname(archiveEventsFile));
  fs.appendFileSync(archiveEventsFile, archiveEvents.map(e => JSON.stringify(e)).join("\n") + "\n", "utf8");
  fs.appendFileSync(archiveTasksFile, tasksToArchive.map(t => JSON.stringify(t)).join("\n") + "\n", "utf8");
  writeFileAtomic(eventsFile, keepEvents.map(e => JSON.stringify(e)).join("\n") + "\n", "utf8");
  
  // Re-materialize task projection
  materializeEntityProjection(config.memoryDir, getTaskEventStoreDefinition());
  
  console.log(`Successfully archived ${tasksToArchive.length} task(s).`);
  console.log(`Active task events left: ${keepEvents.length}.`);
}


// ─── OPC v1.1 P2: Token counting - task tokens summary ───

export function taskTokensCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub task tokens --id <task-id> [--add <n>]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const addTokens = getOption(argv, "--add") || "";

  return deps.withHubLock(config.memoryDir, "task-tokens", () => {
    const task = deps.updateTask(config.memoryDir, id, (current) => {
      if (!addTokens) return current;
      const add = parseInt(addTokens, 10) || 0;
      const budget = current.budget || {};
      const currentTokens = budget.tokensConsumed || 0;
      return {
        ...current,
        budget: {
          ...budget,
          tokensConsumed: currentTokens + add
        },
        updatedAt: new Date().toISOString()
      };
    });

    const b = task.budget || {};
    const consumed = b.tokensConsumed || 0;
    const max = b.maxTokens || 0;
    const pct = max > 0 ? Math.round(consumed / max * 100) : 0;
    console.log(JSON.stringify({
      taskId: id,
      tokensConsumed: consumed,
      maxTokens: max,
      utilization: pct + "%",
      remaining: max > 0 ? Math.max(0, max - consumed) : "unlimited"
    }, null, 2));
  }, config.sync.lockStaleMs);
}

// ─── OPC v1.1 P2: Memory versioning via Git ───

export function taskFailCommand(argv, deps) {
  const FAILURE_TYPES = {
    temporal:    { label: "temporal",    strategy: "retry(max3)",       route: "in_progress",          block: false },
    param:       { label: "param",       strategy: "fix-params",        route: "in_progress",          block: false },
    permission:  { label: "permission",  strategy: "request-auth",      route: "blocked",              block: true  },
    evidence:    { label: "evidence",    strategy: "back-to-observe",   route: "needs_verification",   block: false },
    conflict:    { label: "conflict",    strategy: "report-conflict",   route: "blocked",              block: true  },
    risk:        { label: "risk",        strategy: "force-confirm",     route: "blocked",              block: true  },
  };
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const failType = getOption(argv, "--type") || positionalArgs(argv)[1] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  const detail = getOption(argv, "--detail") || "";
  if (!id || !failType) {
    throw new Error("Usage: ai-memory-hub task fail --id <task-id> --type <temporal|param|permission|evidence|conflict|risk> [--by codex] [--detail]");
  }
  const ft = FAILURE_TYPES[failType];
  if (!ft) {
    throw new Error("Invalid failure type: " + failType + ". Valid: " + Object.keys(FAILURE_TYPES).join("|"));
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  return deps.withHubLock(config.memoryDir, "task-fail", () => {
    const task = deps.updateTask(config.memoryDir, id, (current) => {
      const failCount = (current.failCount || 0) + 1;
      const noteText = "Failure type: " + failType + " (" + ft.label + "). Strategy: " + ft.strategy + ". Attempt #" + failCount + "." + (detail ? " Detail: " + detail : "");
      return {
        ...current,
        status: ft.route,
        failType,
        failCount,
        lastFailAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: [
          ...(current.notes || []),
          deps.createTaskNote(by, noteText)
        ]
      };
    });

    // Record correction memory event
    const correctionText = "Failure on task " + id + ": type=" + failType + " (" + ft.label + "), strategy=" + ft.strategy + ", attempt #" + task.failCount + (detail ? ", detail: " + detail : "");
    appendJsonl(path.join(config.memoryDir, "inbox", "events.jsonl"), {
      id: createId("correction:" + id + ":" + failType + ":" + Date.now()),
      ts: new Date().toISOString(),
      source: by,
      kind: "correction",
      project: task.project || "",
      text: correctionText,
      tags: ["opc", "failure-routing", failType]
    });

    // Radio notify for blocking failures
    if (ft.block) {
      const radioMsg = deps.createRadioMessage({
        from: by,
        to: "operator",
        type: "review",
        text: "Task " + id + " blocked: " + ft.label + ". " + ft.strategy + ". " + (detail || "").trim(),
        thread: id,
        project: task.project || ""
      });
      appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), radioMsg);
    }

    console.log(JSON.stringify({
      taskId: id,
      failType,
      label: ft.label,
      strategy: ft.strategy,
      route: ft.route,
      blocked: ft.block,
      attempt: task.failCount,
      radioSent: ft.block
    }, null, 2));
  }, config.sync.lockStaleMs);
}

// ─── OPC v1.1 P0: task budget ───

export function taskBudgetCommand(argv, deps) {
  const DEFAULT_BUDGET = {
    maxIterations: 6,
    maxToolCalls: 20,
    maxMinutes: 30,
    maxTokens: 100000
  };
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  const by = getOption(argv, "--by") || getOption(argv, "--from") || "manual";
  const checkOnly = hasFlag(argv, "--check");
  if (!id) {
    throw new Error("Usage: ai-memory-hub task budget --id <task-id> [--max-iterations 6] [--max-tool-calls 20] [--max-minutes 30] [--max-tokens 100000] [--check] [--by codex]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  return deps.withHubLock(config.memoryDir, "task-budget", () => {
    const task = deps.updateTask(config.memoryDir, id, (current) => {
      if (checkOnly) return current;
      const existing = current.budget || {};
      const budget = {
        maxIterations: parseInt(getOption(argv, "--max-iterations") || existing.maxIterations || DEFAULT_BUDGET.maxIterations, 10),
        maxToolCalls: parseInt(getOption(argv, "--max-tool-calls") || existing.maxToolCalls || DEFAULT_BUDGET.maxToolCalls, 10),
        maxMinutes: parseInt(getOption(argv, "--max-minutes") || existing.maxMinutes || DEFAULT_BUDGET.maxMinutes, 10),
        maxTokens: parseInt(getOption(argv, "--max-tokens") || existing.maxTokens || DEFAULT_BUDGET.maxTokens, 10),
        iterations: existing.iterations || 0,
        toolCalls: existing.toolCalls || 0,
        tokensConsumed: existing.tokensConsumed || 0,
        setAt: new Date().toISOString()
      };
      return {
        ...current,
        budget,
        updatedAt: new Date().toISOString(),
        notes: [
          ...(current.notes || []),
          deps.createTaskNote(by, "Budget set: iterations=" + budget.maxIterations + ", toolCalls=" + budget.maxToolCalls + ", minutes=" + budget.maxMinutes + ", tokens=" + budget.maxTokens)
        ]
      };
    });

    const b = task.budget || {};
    const elapsed = task.createdAt ? (Date.now() - new Date(task.createdAt).getTime()) / 60000 : 0;
    const violations = [];
    if (b.maxIterations && (b.iterations || 0) >= b.maxIterations) {
      violations.push("iterations " + (b.iterations || 0) + "/" + b.maxIterations);
    }
    if (b.maxToolCalls && (b.toolCalls || 0) >= b.maxToolCalls) {
      violations.push("toolCalls " + (b.toolCalls || 0) + "/" + b.maxToolCalls);
    }
    if (b.maxMinutes && elapsed >= b.maxMinutes) {
      violations.push("minutes " + elapsed.toFixed(1) + "/" + b.maxMinutes);
    }
    if (b.maxTokens && (b.tokensConsumed || 0) >= b.maxTokens) {
      violations.push("tokens " + (b.tokensConsumed || 0) + "/" + b.maxTokens);
    }

    // OPC v1.1 P2: Auto stop-condition check (success/fail/risk/budget)
    const stopReasons = [];
    // Budget stop
    if (violations.length > 0) stopReasons.push("budget");
    // Risk stop: check if task has risk tag
    if (task.tags && task.tags.includes("risk")) stopReasons.push("risk");
    // Fail stop: failCount >= 3
    if ((task.failCount || 0) >= 3) stopReasons.push("fail");

    if (stopReasons.length > 0 && task.status !== "done" && task.status !== "cancelled") {
      deps.updateTask(config.memoryDir, id, (current) => ({
        ...current,
        status: "blocked",
        updatedAt: new Date().toISOString(),
        notes: [
          ...(current.notes || []),
          deps.createTaskNote("amh", "Stop condition triggered: " + stopReasons.join(", ") + ". Violations: " + violations.join(", ") + ". Task auto-blocked.")
        ]
      }));
      const radioMsg = deps.createRadioMessage({
        from: "amh",
        to: "operator",
        type: "review",
        text: "Task " + id + " stop condition: " + stopReasons.join(", ") + ". Violations: " + violations.join(", ") + ". Auto-blocked.",
        thread: id,
        project: task.project || ""
      });
      appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), radioMsg);
      console.log(JSON.stringify({
        taskId: id,
        budget: b,
        elapsedMinutes: elapsed.toFixed(1),
        violations,
        status: "blocked",
        radioSent: true
      }, null, 2));
    } else {
      console.log(JSON.stringify({
        taskId: id,
        budget: b,
        elapsedMinutes: elapsed.toFixed(1),
        iterations: b.iterations || 0,
        toolCalls: b.toolCalls || 0,
        tokensConsumed: b.tokensConsumed || 0,
        status: violations.length === 0 ? "ok" : "exceeded",
        violations
      }, null, 2));
    }
  }, config.sync.lockStaleMs);
}


export function taskUpdateCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub task update --id <task-id> [--title text] [--description text] [--handoff text] [--priority normal] [--status open]");
  }
  const by = getOption(argv, "--by") || "manual";
  const patch = {};
  for (const [flag, key] of [
    ["--title", "title"],
    ["--description", "description"],
    ["--handoff", "handoff"],
    ["--priority", "priority"],
      ["--status", "status"],
      ["--project", "project"],
      ["--github-issue", "githubIssue"],
      ["--github-pr", "githubPr"]
  ]) {
    const value = getOption(argv, flag);
    if (value !== "") {
      patch[key] = value;
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("task update requires at least one field: --title, --description, --handoff, --priority, --status, or --project");
  }
  if (patch.priority) {
    patch.priority = normalizePriority(patch.priority);
  }
  if (patch.status) {
    deps.assertTaskStatus(patch.status);
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  return deps.withHubLock(config.memoryDir, "task-update", () => {
    const updated = deps.updateTask(config.memoryDir, id, (task) => {
      const now = new Date().toISOString();
      return {
        ...task,
        ...patch,
        ...(patch.githubIssue || patch.githubPr ? {
          githubLinks: normalizeGithubLinks({
            ...(task.githubLinks || {}),
            issue: patch.githubIssue || task.githubLinks?.issue,
            pullRequest: patch.githubPr || task.githubLinks?.pullRequest
          })
        } : {}),
        updatedAt: now,
        completedAt: patch.status === "done" ? now : patch.status && patch.status !== "done" ? "" : task.completedAt || "",
        assignee: patch.status && !["open", "cancelled"].includes(patch.status) ? task.assignee || by : task.assignee || "",
        notes: [
          ...(task.notes || []),
          deps.createTaskNote(by, `Updated task fields: ${Object.keys(patch).join(", ")}.`)
        ]
      };
    });
    console.log(JSON.stringify(updated, null, 2));
  }, config.sync.lockStaleMs);
}

