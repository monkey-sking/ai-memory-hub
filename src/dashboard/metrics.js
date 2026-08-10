export function createDashboardMetricsApi({
  readDispatchQueue,
  readLatestRelayStatusByThread,
  readRadioMessages,
  readRelayStatus,
  readTasks,
  readWorkflows
}) {
  function calculateMetrics(memoryDir) {
    const tasks = readTasks(memoryDir);
    const workflows = readWorkflows(memoryDir);
    const radioMessages = readRadioMessages(memoryDir);
    const relayEvents = readRelayStatus(memoryDir);
    const relayStatus = Object.values(readLatestRelayStatusByThread(memoryDir));
    const dispatchQueue = readDispatchQueue(memoryDir);

    const tasksByStatus = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});

    const tasksByTool = tasks.reduce((acc, task) => {
      if (task.assignee) {
        acc[task.assignee] = (acc[task.assignee] || 0) + 1;
      }
      return acc;
    }, {});

    const completedTasks = tasks.filter((task) => task.status === "done" && task.completedAt && task.createdAt);
    const taskDurations = completedTasks.map((task) => {
      const start = new Date(task.createdAt).getTime();
      const end = new Date(task.completedAt).getTime();
      return end - start;
    });

    const avgTaskDuration = taskDurations.length > 0
      ? taskDurations.reduce((sum, duration) => sum + duration, 0) / taskDurations.length
      : 0;

    const workflowsByStatus = workflows.reduce((acc, workflow) => {
      acc[workflow.status] = (acc[workflow.status] || 0) + 1;
      return acc;
    }, {});

    const radioByType = radioMessages.reduce((acc, message) => {
      const type = message.type || "note";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    // Project activity counts every task, radio message, and workflow that names a
    // project. Entries with no project are skipped instead of being bucketed under an
    // empty key, so the ranking only contains projects that really exist.
    const projectActivity = [...tasks, ...radioMessages, ...workflows].reduce((acc, entry) => {
      const project = String(entry.project || "").trim();
      if (!project) return acc;
      acc[project] = (acc[project] || 0) + 1;
      return acc;
    }, {});

    const completedWorkflows = workflows.filter((workflow) => workflow.status === "done" && workflow.completedAt && workflow.createdAt);
    const workflowDurations = completedWorkflows.map((workflow) => {
      const start = new Date(workflow.createdAt).getTime();
      const end = new Date(workflow.completedAt).getTime();
      return end - start;
    });

    const avgWorkflowDuration = workflowDurations.length > 0
      ? workflowDurations.reduce((sum, duration) => sum + duration, 0) / workflowDurations.length
      : 0;

    const relayByStatus = relayStatus.reduce((acc, relay) => {
      const status = relay.state || relay.deliveryState || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const completedRelays = relayStatus.filter((relay) => (relay.state || relay.deliveryState) === "completed");
    const failedRelays = relayStatus.filter((relay) => ["failed", "abandoned"].includes(relay.state || relay.deliveryState));
    const progressRelays = relayStatus.filter((relay) => (relay.state || relay.deliveryState) === "progress");

    const relaySuccessRate = relayStatus.length > 0
      ? ((completedRelays.length / relayStatus.length) * 100).toFixed(2)
      : 0;

    const queueByStatus = dispatchQueue.reduce((acc, entry) => {
      acc[entry.status] = (acc[entry.status] || 0) + 1;
      return acc;
    }, {});

    const queuedEntries = dispatchQueue.filter((entry) => entry.status === "queued");
    const runningEntries = dispatchQueue.filter((entry) => entry.status === "running");
    const failedQueueEntries = dispatchQueue.filter((entry) => entry.status === "failed");

    const recentFailures = [
      ...failedRelays.slice(-5).map((relay) => ({
        type: "relay",
        id: relay.dispatchId || relay.sourceId || relay.id,
        error: relay.lastError,
        time: relay.ts || relay.deliveryUpdatedAt
      })),
      ...failedQueueEntries.slice(-5).map((entry) => ({
        type: "queue",
        id: entry.id,
        error: entry.lastError,
        time: entry.lastAttemptAt
      }))
    ].sort((a, b) => (b.time || "").localeCompare(a.time || "")).slice(0, 10);

    return {
      tasks: {
        total: tasks.length,
        byStatus: tasksByStatus,
        byTool: tasksByTool,
        avgDurationMs: Math.round(avgTaskDuration),
        avgDurationHuman: formatDuration(avgTaskDuration)
      },
      workflows: {
        total: workflows.length,
        byStatus: workflowsByStatus,
        avgDurationMs: Math.round(avgWorkflowDuration),
        avgDurationHuman: formatDuration(avgWorkflowDuration)
      },
      radio: {
        total: radioMessages.length,
        byType: radioByType
      },
      projects: {
        total: Object.keys(projectActivity).length,
        byActivity: projectActivity
      },
      relay: {
        total: relayStatus.length,
        eventsTotal: relayEvents.length,
        byStatus: relayByStatus,
        completed: completedRelays.length,
        failed: failedRelays.length,
        progress: progressRelays.length,
        successRate: `${relaySuccessRate}%`
      },
      queue: {
        total: dispatchQueue.length,
        byStatus: queueByStatus,
        queued: queuedEntries.length,
        running: runningEntries.length,
        failed: failedQueueEntries.length
      },
      recentFailures
    };
  }

  return {
    calculateMetrics
  };
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}
