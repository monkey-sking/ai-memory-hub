export function createDashboardToolsApi({
  capabilityRegistryVersion,
  getCachedDetectedTools,
  getRunnerProfile,
  normalizeToolName,
  readDispatchRuns,
  readLatestRelayStatusByThread,
  readRadioMessages,
  readTasks,
  refreshDetectedTools,
  resolvePermission,
  POLICY_OPERATIONS
}) {
  function getDashboardDetection(memoryDir) {
    const tools = refreshDetectedTools(memoryDir);
    return {
      tools,
      summary: summarizeToolConnections(tools)
    };
  }

  function getDashboardTools(memoryDir, { refresh = false } = {}) {
    const tools = refresh ? refreshDetectedTools(memoryDir) : getCachedDetectedTools(memoryDir);
    const runs = readDispatchRuns(memoryDir);
    const relay = Object.values(readLatestRelayStatusByThread(memoryDir));
    const tasks = readTasks(memoryDir);
    const radio = readRadioMessages(memoryDir);
    const metricsByTool = buildToolMetricsByName({ runs, relay, tasks, radio });
    const capabilityRegistry = buildCapabilityRegistry(memoryDir, { tools, metricsByTool });
    const capabilitiesByTool = Object.fromEntries(
      capabilityRegistry.tools.map((entry) => [normalizeToolName(entry.name), entry])
    );
    const enrichedTools = tools.map((tool) => {
      const metrics = metricsByTool[normalizeToolName(tool.name)] || createEmptyToolMetrics();
      const registryEntry = capabilitiesByTool[normalizeToolName(tool.name)] || null;
      return {
        ...tool,
        metrics,
        performance: {
          successRate: metrics.totalRuns ? metrics.completedRuns / metrics.totalRuns : null,
          avgDurationMs: metrics.durationSamples ? Math.round(metrics.durationMs / metrics.durationSamples) : null,
          lastRunAt: metrics.lastRunAt,
          lastStatus: metrics.lastStatus,
          lastError: metrics.lastError
        },
        usage: {
          activeTasks: metrics.activeTasks,
          assignedTasks: metrics.assignedTasks,
          radioMessages: metrics.radioMessages,
          activeRelays: metrics.activeRelays,
          totalRuns: metrics.totalRuns,
          score: metrics.usageScore
        },
        config: {
          instructionFile: tool.instructionFile || "",
          configured: Boolean(tool.configured),
          runnerCommand: tool.runnerCommand || "",
          runnerCommandKind: tool.runnerCommandKind || "",
          sharedStateOnly: Boolean(tool.sharedStateOnly),
          action: tool.action || ""
        },
        capability: registryEntry?.capability || {},
        permissions: registryEntry?.permissions || {},
        health: registryEntry?.health || {}
      };
    });
    const runSummary = summarizeToolRunMetrics(enrichedTools);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        ...summarizeToolConnections(tools),
        activeDispatches: relay.filter((entry) => ["dispatched", "acked", "progress", "retrying"].includes(entry.state)).length,
        runs: runSummary,
        kindBreakdown: countToolsByKind(tools),
        capabilities: capabilityRegistry.summary
      },
      capabilities: capabilityRegistry.summary,
      tools: enrichedTools
    };
  }

  function buildCapabilityRegistry(memoryDir, {
    refresh = false,
    tools = null,
    metricsByTool = null,
    includeMetrics = true
  } = {}) {
    const detectedTools = tools || (refresh ? refreshDetectedTools(memoryDir) : getCachedDetectedTools(memoryDir));
    const effectiveMetricsByTool = metricsByTool || (includeMetrics
      ? buildToolMetricsByName({
        runs: readDispatchRuns(memoryDir),
        relay: Object.values(readLatestRelayStatusByThread(memoryDir)),
        tasks: readTasks(memoryDir),
        radio: readRadioMessages(memoryDir)
      })
      : {});
    const entries = detectedTools.map((tool) => buildToolCapabilityEntry(
      tool,
      effectiveMetricsByTool[normalizeToolName(tool.name)] || createEmptyToolMetrics(),
      { includeMetrics, memoryDir }
    ));
    return {
      ok: true,
      version: capabilityRegistryVersion,
      generatedAt: new Date().toISOString(),
      memoryDir,
      summary: summarizeCapabilityRegistry(entries),
      tools: entries
    };
  }

  function buildToolCapabilityEntry(tool, metrics = createEmptyToolMetrics(), { includeMetrics = true, memoryDir = "" } = {}) {
    const name = normalizeToolName(tool.name);
    const profile = getRunnerProfile(name) || {};
    const profileCapabilities = normalizeCapabilityList(profile.capabilities);
    const directCli = profileCapabilities.includes("direct-dispatch");
    const autoDispatch = Boolean(tool.runnable && directCli);
    const gatewayRest = ["qclaw", "openclaw"].includes(name);
    const cdpCandidate = ["claude-desktop", "codex-app", "antigravity", "antigravity-cockpit"].includes(name);
    const desktopAutomation = tool.kind === "app-state";
    const sharedState = Boolean(tool.connected || tool.configured || profile.sharedStateOnly);
    const diagnosticOnly = !directCli && !gatewayRest && !cdpCandidate && !sharedState;
    const capability = {
      integrationMode: deriveCapabilityIntegrationMode({
        autoDispatch,
        directCli,
        gatewayRest,
        cdpCandidate,
        desktopAutomation,
        sharedState,
        diagnosticOnly
      }),
      directCli,
      autoDispatch,
      sharedState,
      gatewayRest,
      cdpCandidate,
      desktopAutomation,
      diagnosticOnly,
      sessionResume: profileCapabilities.includes("session-resume"),
      promptModes: profile.promptMode ? [profile.promptMode] : [],
      outputModes: profile.outputMode ? [profile.outputMode] : [],
      capabilities: profileCapabilities
    };
    const permissions = buildToolPermissionPolicy(capability, memoryDir, name);
    const health = buildToolCapabilityHealth(tool, capability);
    const entry = {
      name: tool.name,
      kind: tool.kind || "",
      installed: Boolean(tool.installed),
      configured: Boolean(tool.configured),
      connected: Boolean(tool.connected),
      connectionStatus: tool.connectionStatus || "",
      capability,
      runner: {
        profile: tool.runnerProfile || profile.promptMode || "",
        commandKind: tool.runnerCommandKind || "",
        usesShell: Boolean(tool.runnerUsesShell),
        command: tool.runnerCommand || "",
        reason: tool.runnerReason || "",
        sharedStateOnly: Boolean(tool.sharedStateOnly || profile.sharedStateOnly)
      },
      install: {
        instructionFile: tool.instructionFile || "",
        skillLayer: Boolean(tool.skillLayer),
        skillLayerVersion: tool.skillLayerVersion || "",
        skillLayerStatus: tool.skillLayerStatus || ""
      },
      permissions,
      health
    };
    if (includeMetrics) {
      entry.metrics = metrics;
    }
    return entry;
  }

  function deriveCapabilityIntegrationMode({
    autoDispatch,
    directCli,
    gatewayRest,
    cdpCandidate,
    desktopAutomation,
    sharedState,
    diagnosticOnly
  }) {
    if (autoDispatch) return "direct-cli";
    if (gatewayRest) return "gateway-rest-candidate";
    if (cdpCandidate) return "cdp-candidate";
    if (sharedState) return "shared-state";
    if (directCli) return "direct-cli-missing";
    if (desktopAutomation) return "desktop-automation-candidate";
    return diagnosticOnly ? "diagnostic-only" : "unknown";
  }

  function buildToolPermissionPolicy(capability, memoryDir, actor) {
    // Phase 2: call the policy resolver for each operation instead of hardcoded static values.
    const byOperation = {};
    if (resolvePermission && POLICY_OPERATIONS) {
      for (const operation of POLICY_OPERATIONS) {
        try {
          const result = resolvePermission(memoryDir, { actor, project: "*", operation, scope: "all" });
          byOperation[operation] = { decision: result.decision, reason: result.reason };
        } catch (err) {
          byOperation[operation] = { decision: "ask", reason: `Policy resolver error: ${err.message}` };
        }
      }
    }
    // Legacy fields kept for compatibility during transition.
    return {
      canAutoDispatch: Boolean(capability.autoDispatch),
      canUseSharedState: Boolean(capability.sharedState),
      canUseGatewayRest: Boolean(capability.gatewayRest),
      canUseDesktopAutomation: Boolean(capability.cdpCandidate || capability.desktopAutomation),
      defaultGuardrails: ["no-push", "no-delete-files", "no-install-dependencies"],
      requiresApprovalFor: ["push", "delete-files", "install-dependencies", "system-config", "destructive-commands"],
      byOperation,
      source: resolvePermission ? "policy-layer" : "legacy-static"
    };
  }

  function buildToolCapabilityHealth(tool, capability) {
    const reasons = [];
    if (capability.autoDispatch && tool.connected) {
      return {
        status: "ready-automated",
        reasons: ["Shared Skill Layer is installed and a verified direct runner is available."]
      };
    }
    if (!tool.installed && tool.configured) {
      return {
        status: "preconfigured-missing-tool",
        reasons: ["Adapter instructions exist, but the local tool state was not detected."]
      };
    }
    if (tool.connected || (tool.configured && capability.sharedState)) {
      reasons.push("Shared Skill Layer or legacy shared memory instructions are configured.");
      if (!capability.autoDispatch) {
        reasons.push("No verified direct runner is available; coordinate through shared state or a future adapter.");
      }
      return { status: "ready-shared-state", reasons };
    }
    if (tool.installed && !tool.configured) {
      return {
        status: "needs-adapter",
        reasons: ["Tool state was detected but shared memory instructions are not installed."]
      };
    }
    if (capability.gatewayRest || capability.cdpCandidate || capability.desktopAutomation) {
      return {
        status: "adapter-candidate",
        reasons: ["No active connection is configured yet, but this tool has a known non-CLI integration path."]
      };
    }
    return {
      status: "missing",
      reasons: ["Tool state and shared memory instructions were not detected."]
    };
  }

  function summarizeCapabilityRegistry(entries) {
    return {
      total: entries.length,
      directCliProfiles: entries.filter((entry) => entry.capability.directCli).length,
      autoDispatch: entries.filter((entry) => entry.capability.autoDispatch).length,
      sharedState: entries.filter((entry) => entry.capability.sharedState).length,
      gatewayRestCandidates: entries.filter((entry) => entry.capability.gatewayRest).length,
      cdpCandidates: entries.filter((entry) => entry.capability.cdpCandidate).length,
      desktopAutomationCandidates: entries.filter((entry) => entry.capability.desktopAutomation).length,
      diagnosticOnly: entries.filter((entry) => entry.capability.diagnosticOnly).length,
      readyAutomated: entries.filter((entry) => entry.health.status === "ready-automated").length,
      readySharedState: entries.filter((entry) => entry.health.status === "ready-shared-state").length,
      needsAdapter: entries.filter((entry) => entry.health.status === "needs-adapter").length,
      preconfiguredMissingTools: entries.filter((entry) => entry.health.status === "preconfigured-missing-tool").length,
      adapterCandidates: entries.filter((entry) => entry.health.status === "adapter-candidate").length,
      missing: entries.filter((entry) => entry.health.status === "missing").length
    };
  }

  function summarizeToolConnections(tools) {
    return {
      total: tools.length,
      detected: tools.filter((tool) => tool.installed).length,
      configured: tools.filter((tool) => tool.configured).length,
      skillLayer: tools.filter((tool) => tool.skillLayer).length,
      connected: tools.filter((tool) => tool.connected).length,
      runnable: tools.filter((tool) => tool.runnable).length,
      missing: tools.filter((tool) => !tool.installed).length,
      unconfiguredDetected: tools.filter((tool) => tool.installed && !tool.configured).length
    };
  }

  function normalizeCapabilityList(value) {
    const values = Array.isArray(value) ? value : [];
    return [...new Set(values
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean))];
  }

  function createEmptyToolMetrics() {
    return {
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      timedOutRuns: 0,
      durationMs: 0,
      durationSamples: 0,
      stdoutBytes: 0,
      stderrBytes: 0,
      lastRunAt: "",
      lastStatus: "",
      lastError: "",
      activeRelays: 0,
      relayStates: {},
      assignedTasks: 0,
      activeTasks: 0,
      createdTasks: 0,
      radioMessages: 0,
      usageScore: 0
    };
  }

  function buildToolMetricsByName({ runs = [], relay = [], tasks = [], radio = [] } = {}) {
    const metricsByTool = {};
    const entryFor = (name) => {
      const key = normalizeToolName(name);
      if (!key) {
        return null;
      }
      metricsByTool[key] ||= createEmptyToolMetrics();
      return metricsByTool[key];
    };

    for (const run of runs) {
      const metrics = entryFor(run.tool);
      if (!metrics) continue;
      metrics.totalRuns += 1;
      const status = String(run.status || "").toLowerCase();
      if (status === "completed" || run.exitCode === 0) {
        metrics.completedRuns += 1;
      } else if (status === "timed_out") {
        metrics.timedOutRuns += 1;
        metrics.failedRuns += 1;
      } else {
        metrics.failedRuns += 1;
      }
      const durationMs = Number(run.durationMs || 0);
      if (Number.isFinite(durationMs) && durationMs > 0) {
        metrics.durationMs += durationMs;
        metrics.durationSamples += 1;
      }
      metrics.stdoutBytes += Number(run.stdoutBytes || 0) || 0;
      metrics.stderrBytes += Number(run.stderrBytes || 0) || 0;
      const runAt = String(run.finishedAt || run.startedAt || "");
      if (runAt && runAt >= String(metrics.lastRunAt || "")) {
        metrics.lastRunAt = runAt;
        metrics.lastStatus = run.status || "";
        metrics.lastError = run.errorSummary || "";
      }
    }

    for (const entry of relay) {
      const metrics = entryFor(entry.tool);
      if (!metrics) continue;
      const state = String(entry.state || "pending");
      metrics.relayStates[state] = (metrics.relayStates[state] || 0) + 1;
      if (["dispatched", "acked", "progress", "retrying"].includes(state)) {
        metrics.activeRelays += 1;
      }
    }

    for (const task of tasks) {
      const assigned = entryFor(task.assignee);
      if (assigned) {
        assigned.assignedTasks += 1;
        if (!["done", "cancelled"].includes(task.status)) {
          assigned.activeTasks += 1;
        }
      }
      const created = entryFor(task.createdBy);
      if (created) {
        created.createdTasks += 1;
      }
    }

    for (const message of radio) {
      const fromMetrics = entryFor(message.from);
      if (fromMetrics) fromMetrics.radioMessages += 1;
      const toMetrics = entryFor(message.to);
      if (toMetrics && normalizeToolName(message.to) !== normalizeToolName(message.from)) {
        toMetrics.radioMessages += 1;
      }
    }

    for (const metrics of Object.values(metricsByTool)) {
      metrics.usageScore = metrics.totalRuns + metrics.activeRelays + metrics.activeTasks + metrics.assignedTasks + metrics.createdTasks + metrics.radioMessages;
    }

    return metricsByTool;
  }

  function summarizeToolRunMetrics(tools) {
    const totals = tools.reduce((acc, tool) => {
      const metrics = tool.metrics || {};
      acc.total += Number(metrics.totalRuns || 0);
      acc.completed += Number(metrics.completedRuns || 0);
      acc.failed += Number(metrics.failedRuns || 0);
      acc.timedOut += Number(metrics.timedOutRuns || 0);
      acc.durationMs += Number(metrics.durationMs || 0);
      acc.durationSamples += Number(metrics.durationSamples || 0);
      return acc;
    }, {
      total: 0,
      completed: 0,
      failed: 0,
      timedOut: 0,
      durationMs: 0,
      durationSamples: 0
    });
    return {
      ...totals,
      successRate: totals.total ? totals.completed / totals.total : null,
      avgDurationMs: totals.durationSamples ? Math.round(totals.durationMs / totals.durationSamples) : null
    };
  }

  function countToolsByKind(tools) {
    return tools.reduce((counts, tool) => {
      const kind = tool.kind || "unknown";
      counts[kind] = (counts[kind] || 0) + 1;
      return counts;
    }, {});
  }

  return {
    buildCapabilityRegistry,
    getDashboardDetection,
    getDashboardTools,
    summarizeCapabilityRegistry,
    summarizeToolConnections
  };
}
