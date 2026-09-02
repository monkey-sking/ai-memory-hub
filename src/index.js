#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { spawnSync, execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { createSearchDb, rebuildIndex, searchIndex, getIndexStats, tokenizeChinese } from "./fts5-search.js";
import { createDashboardActionsApi } from "./dashboard/actions.js";
import { createDashboardBackupsApi } from "./dashboard/backups.js";
import { createDashboardDispatchApi } from "./dashboard/dispatch.js";
import { createDashboardHealthApi } from "./dashboard/health.js";
import { createDashboardMemoryApi } from "./dashboard/memory.js";
import { createDashboardMetricsApi } from "./dashboard/metrics.js";
import { createDashboardProjectsApi } from "./dashboard/projects.js";
import { createDashboardRadioApi } from "./dashboard/radio.js";
import { createDashboardRealtimeApi } from "./dashboard/realtime.js";
import { getBackgroundQueue } from "./background-queue.js";
import { createDashboardSettingsApi, defaultDashboardShortcuts } from "./dashboard/settings.js";
import { createDashboardSearchApi } from "./dashboard/search.js";
import { createDashboardTasksApi } from "./dashboard/tasks.js";
import { createDashboardToolsApi } from "./dashboard/tools.js";
import { createDashboardWorkflowsApi } from "./dashboard/workflows.js";
import { createDashboardAgentSessionsApi } from "./dashboard/agent-sessions-api.js";
import { createDashboardCostSessionsApi } from "./dashboard/cost-sessions.js";
import { createDashboardWorktreesApi } from "./dashboard/worktrees-api.js";
import { createDashboardCollaborationApi } from "./dashboard/collaboration.js";
import { buildExecutionAdapters } from "./execution-adapters.js";
import { buildWorktreeSnapshot } from "./worktree-snapshot.js";
import { evaluateDaemonHeartbeat } from "./daemon-health.js";
import { appendJsonl } from "./event-writer.js";
import { eventsCommand } from "./commands/events.js";
import { modelsCommand } from "./commands/models.js";
const modelsCommandDeps = { get RUNNER_PROFILES() { return RUNNER_PROFILES; }, ensureHub, getToolRunner, loadConfig, normalizeToolName, readModelsCache, readToolDeclarationByTool, refreshModelsIfStale };
import { sshCommand } from "./commands/ssh.js";
const sshCommandDeps = {  };
import { roleCommand } from "./commands/role.js";
const roleCommandDeps = { ensureHub, loadConfig, parseDeclaredList, readAgents, readRoleById, readRoles, writeRole };
import { mergeCommand } from "./commands/merge.js";
const mergeCommandDeps = { ensureHub, loadConfig, mergeMemoryAccessMetadata, mergeQualityGates, mergeSeedProjects, mergeSkillDelta, readLedger, rebuildMemoryOutputs, resolveGitConflictsInFile, withHubLock };
import { backupCommand } from "./commands/backup.js";
const backupCommandDeps = { backupHub, configureGitHubBackup, ensureHub, getBackupRetentionConfig, getBackupSummary, getGitHubBackupStatus, githubBackupScheduleCommand, loadConfig, pruneBackups, runGitHubBackup, withHubLock };
import { recordCheckpointJob } from "./commands/record.js";
const recordCommandDeps = { recordCommand, recordMemoryAccess, recordRequestMetric };
import { resolveCommand } from "./commands/resolve.js";
const resolveCommandDeps = { ensureHub, loadConfig, resolveBackupDirectory, resolveCommandPaths, resolveConfiguredPath, resolveCredentialEnvironment, resolveDispatchWorktreeRoot, resolveGitConflictsInFile, resolveGitProcessCommand, resolveGitRepositoryRoot, resolveInside, resolveMemoryDir, resolvePermission, resolvePossiblyHomePath, resolveReference, resolveRelayRelatedObjects, resolveRelaySourceObject, resolveRelayThreadKeys, resolveRunnerCommand, resolveSnapshotLimits, resolveTaskSpecCwd, resolveTaskSpecFile, resolveTaskSpecFromArgs, resolveToolRunnerUncached };
import { helpCommand } from "./commands/help.js";
const helpCommandDeps = {  };
import { teamCommand } from "./commands/team.js";
const teamCommandDeps = { ensureHub, loadConfig, readAgentById, readTeamById, readTeams, writeTeam };
import { worktreeCommand } from "./commands/worktree.js";
const worktreeCommandDeps = { get dashboardWorktrees() { return dashboardWorktrees; }, ensureHub, loadConfig, runGit };
import { contextCommand } from "./commands/context.js";
const contextCommandDeps = { createContextPack, ensureHub, loadConfig, readContextPack, writeContextPack };
import { declareCommand } from "./commands/declare.js";
const declareCommandDeps = { ensureHub, loadConfig, normalizeToolName, parseDeclaredList, readToolDeclarationByTool, readToolDeclarations, removeToolDeclaration, withHubLock, writeToolDeclaration };
import { rpcCommand } from "./commands/rpc.js";
const rpcCommandDeps = { createRpcRequest, ensureHub, loadConfig, readRpcRequest, readRpcResult, waitForRpcResult, writeRpcRequest, writeRpcResult };
import { policyCommand } from "./commands/policy.js";
const policyCommandDeps = { appendPolicyRule, ensureHub, loadConfig, policyActorMatches, policyRuleSpecificity, policyScopeMatches, readPolicyRules, removePolicyRule, resolvePermission, seedDefaultPolicyRules, withHubLock };
import { notifyCommand } from "./commands/notify.js";
const notifyCommandDeps = { createNotification, get dashboardCollaboration() { return dashboardCollaboration; }, ensureHub, getNotificationChannels, getPendingNotifications, loadConfig, notifyWorkflowRoles, readNotifications, updateNotificationStatus, writeNotification };
import { sessionCommand } from "./commands/session.js";
const sessionCommandDeps = { createSession, get dashboardAgentSessions() { return dashboardAgentSessions; }, get dashboardCollaboration() { return dashboardCollaboration; }, ensureHub, getActiveSessions, loadConfig, readSessions, updateSession, withHubLock, writeSessions };
import { recipeCommand } from "./commands/recipe.js";
const recipeCommandDeps = { createWorkflowFromRecipe, ensureHub, listRecipes, loadConfig, readRecipe, recipeListLocations, recipeReadLocations, validateRecipe };
import { agentCommand } from "./commands/agent.js";
const agentCommandDeps = { get dashboardAgentSessions() { return dashboardAgentSessions; }, ensureHub, loadConfig, readAgentById, readAgents, readRoleById, touchAgentStatus, writeAgent };
import { connectCommand } from "./commands/connect.js";
const connectCommandDeps = { createRadioMessage, createTask, summarizeText, get dashboardTools() { return dashboardTools; }, detectTools, ensureHub, executeDispatch, getInstallTargetForTool, loadConfig, renderInstallSnippet, syncSharedSkillLayer, withHubLock };
import { searchCommand } from "./commands/search.js";
const searchCommandDeps = { buildMemoryIndex, ensureHub, filterMemoryRecords, getMemoryIdentityKeys, hasMemoryFilters, isMemoryLifecycleVisible, loadConfig, normalizeSupersedeToken, parseMemoryFilters, printMemorySearchResults, readLedger, rebuildMemoryOutputs, recordMemoryAccess, searchMemories, searchMemoriesForContext, semanticSearch, withHubLock, writeLedger };
import { queueCommand } from "./commands/queue.js";
const queueCommandDeps = { createDispatchQueueEntry, ensureHub, getFailedEntries, getQueuedEntries, getRunningEntries, loadConfig, readDispatchQueue, updateDispatchQueueEntry, writeDispatchQueueEntry };
import { skillCandidateCommand, skillCommand, skillDeltaCommand } from "./commands/skill.js";
const skillCommandDeps = { approveSkillDelta, createSkillDelta, ensureHub, loadConfig, mergeSkillDelta, readSkillCandidates, readSkillDeltas, rejectSkillDelta, updateSkillCandidate, updateTask, withHubLock, writeSkillDeltas };
import { githubCommand } from "./commands/github.js";
const githubCommandDeps = { createTaskNote, ensureHub, githubBackupScheduleCommand, loadConfig, updateTask, withHubLock };
import { gateCommand } from "./commands/gate.js";
const gateCommandDeps = { appendApprovalGateEvent, ensureHub, loadConfig, readApprovalGates };
import { radioCommand, radioPromoteCommand } from "./commands/radio.js";
const radioCommandDeps = { createRadioMessage, ensureHub, getUnreadRadioMessages, isCorruptedRadioMessage, loadConfig, readRadioMessages, updateRadioMessage, writeRadioCursor };
import { projectCommand } from "./commands/project.js";
const projectCommandDeps = { createProject, ensureHub, filterProjects, findProject, findProjectIndex, loadConfig, mergeSeedProjects, parseProjectResourceOptions, updateProject, withHubLock };
import { daemonCommand } from "./commands/daemon.js";
const daemonCommandDeps = { buildDaemonStatus, clearDaemonPid, ensureHub, executeDispatch, executeDispatchRetry, getCheckpointStats, getToolRunner, loadConfig, readLoopCheckpoint, refreshModelsIfStale, writeDaemonHeartbeat, writeDaemonPid, writeDaemonStatus, writeLoopCheckpoint };
import { dispatchCommand } from "./commands/dispatch.js";
const dispatchCommandDeps = { appendRelayStatus, buildRecentRelayStatusView, buildTaskDispatchText, buildWorkflowDispatchText, ensureHub, executeDispatch, executeDispatchRetry, findLatestRelayStatusEntry, getDispatchThreadKey, loadConfig, normalizeDispatchRetryLimit, normalizeToolName, parseProgressPercent, readDispatchLog, readDispatchRuns, readRelayStatus, rebuildDispatchJobFromRelay, resolveRelayRelatedObjects, resolveRelaySourceObject, resolveRelayThreadKeys, updateDispatchSourceState, withHubLock };
import { workflowCommand } from "./commands/workflow.js";
const workflowCommandDeps = { assertWorkflowStatus, autoCreateWorkflowNodes, createRadioMessage, createTaskNote, createWorkflow, ensureHub, loadConfig, notifyWorkflowRoles, spawnWorkflowTasks, updateWorkflow, withHubLock };
import { memoryCommand } from "./commands/memory.js";
const memoryCommandDeps = { buildMemoryIndex, ensureHub, isMemoryLifecycleVisible, loadConfig, normalizeMemoryMetadata, normalizeSupersedeToken, readLedger, rebuildMemoryOutputs, runAutomaticBackupStrategy, searchCommand, searchCommandDeps, snapshotCommand, withHubLock };
import { sqliteCommand } from "./commands/sqlite.js";
import { ensureDir, readJson, readJsonSafe, writeJson, createId, getOption, hasOption, hasFlag, parsePositiveIntegerOption, positionalArgs, countJsonlFiles, isPlainObject, hasOwnField } from "./lib/cli.js";
import { readEvents, parseJsonlLine, countJsonlLines, readToolDeclarations, readModelsCache, writeModelsCache, readRadioCursor, writeRadioCursor, readAgents, readRoles, readTeams, readClaudeSessionState, readDispatchLog, readDispatchRuns, appendDispatchRunRecord, appendDispatchLog, readRelayStatus, resolveGitConflictsInFile, writeLedger, readApprovalGates, appendApprovalGateEvent, readPolicyRules, readSessions, readUnreadReceipts, appendUnreadReceipt, writeSessions, writeRpcRequest, readRpcRequest, writeRpcResult, readRpcResult, writeNotification, readNotifications, writeContextPack, readContextPack, readDispatchQueue, writeDispatchQueueEntry, readMemoryLifecycleOperations, archiveInbox, writeInboxEvents, readBackupManifest, readLockFile, readLockEvents, appendLockEvent, readEventsWithLocations, readAgentById, readRoleById, readTeamById, resolveRelayThreadKeys, findLatestRelayStatusEntry, readLatestDispatchRunByThread, readLatestRelayStatusByThread, readLatestRelayStatusBySource, updateSession, getActiveSessions, getPendingNotifications, getQueuedEntries, getRunningEntries, getFailedEntries, buildRunnerArgs, writeClaudeSessionState, countRecentRelayOscillation, writeAgent, writeRole, writeTeam, createDispatchRunId, removePolicyRule, updateNotificationStatus, updateDispatchQueueEntry, releaseLock, describeLock, waitForRpcResult } from "./lib/io.js";
import { getEntityEventsFile, getEntityProjectionFile, readEntityEvents, bootstrapEntityEventsFromProjection, writeEntityRecords, appendEntityRecord, deleteEntityRecord, appendEntityEvents, createEntityEvent, replayEntityEvents, materializeEntityProjection, isEntityRecordNewerOrSame } from "./lib/entity-store.js";
import { PROJECT_STATUSES, RECIPE_GATE_STRING_ARRAY_FIELDS, RECIPE_GATE_FIELDS, extractQualityGate, normalizeQualityGate, normalizeVerifyCommand, normalizeNonNegativeInteger, normalizeMinimalImplementation, normalizeDependencyBudget, normalizePriority, normalizeDispatchWorktreeMetadata, normalizeWorkflowRole, parseProjectListOption, uniqueStringList, isTaskStatus, isWorkflowStatus, normalizeRecipeMetadata, normalizeRecipeStepMetadata, normalizeProjectStatus, normalizeProjectResources, normalizeProject, normalizeWorkflow, normalizeTask, normalizePrompt, getTaskEventStoreDefinition, getProjectEventStoreDefinition, getWorkflowEventStoreDefinition, getPromptEventStoreDefinition, rebuildEventSourcedProjections, updateProject, updateWorkflow, updateTask, assertTaskStatus, assertWorkflowStatus, mergeQualityGates } from "./lib/entity-models.js";
import { projectRoot } from "./lib/paths.js";
import { POLICY_OPERATIONS, APP_NAME, DEFAULT_DISPATCH_ACK_TIMEOUT_MS, ASYNC_CALL_STATES } from "./lib/constants.js";
import { MODEL_CACHE_STALE_MS } from "./lib/constants.js";
import { promptCommand } from "./commands/prompt.js";
import { workflowNodeCommand } from "./commands/workflow-node.js";
import { taskCommand, taskSpecCommand } from "./commands/task.js";
const taskCommandDeps = { appendSkillCandidates, assertTaskStatus, createRadioMessage, createTask, createTaskNote, ensureHub, findTaskIndex, getClaimTtlMs, isClaimStale, loadConfig, loadTaskSpecContext, releaseStaleClaim, resolveTaskSpecFromArgs, runTaskSpec, summarizeTaskSpec, touchAgentStatus, updateTask, validateTaskSpecDocument, withHubLock };
import {
  readTasks, writeTasks, readWorkflows, writeWorkflows, readProjects, writeProjects,
  getTasksFile, getWorkflowsFile, getProjectsFile,
  readWorkflowNodes, readWorkflowNodesByWorkflow, appendWorkflowNodeEvent,
  deriveWorkflowStatusFromNodes
} from "./lib/entity-repo.js";
import { acquireDaemonLock, releaseDaemonLock } from "./daemon-lock.js";
import { resolveAgentTarget } from "./agent-wake.js";
import { createSessionSupervisor } from "./session-supervisor-service.js";
import { buildWorkflowSharedState } from "./workflow-context.js";
import { applyCandidateDecision, mineSkillCandidates } from "./skill-mining.js";
import { formatGithubCommitMessage, normalizeGithubLinks } from "./github-links.js";
import { syncGithubLifecycle } from "./github-lifecycle.js";
import { buildGithubRequest, buildNotificationPayload, buildSshPlan, renderSkillMarkdown } from "./external-integrations.js";
import { parseGithubWebhook } from "./github-lifecycle.js";
import { addPack, discoverPacks, listPacks, setPackEnabled, validateRegisteredPack } from "./domain-packs.js";
import { listSkills, searchSkills } from "./skill-registry.js";
import { aggregateSkillSources, defaultSkillRoots, scanSkillRoots } from "./shared-skill-scan.js";
import { importSharedPack, importSharedSkill, listSharedSkillPackages, findSharedSkillPackage } from "./shared-skills.js";
import { applySkillGarbageCollection, planSkillGarbageCollection, rollbackSkillGarbageCollection } from "./skill-gc.js";
import { readSkillPackManifest } from "./shared-skill-pack.js";
import { disableProjectSkill, getSkillLifecycleState, loadProjectSkillManifest, setProjectSkill, removeProjectSkill, selectProjectSkillVersion, selectProjectSkills } from "./shared-skill-project.js";
import { doctorSkillProjections, syncSkillProjections } from "./shared-skill-materializer.js";
import { withPreparedSkillSource } from "./shared-skill-sources.js";
import { listExtensions, importExtensions, diffExtensions, syncExtensions, removeExtensions, statusExtensions, diffSkillExtensions, syncSkillExtensions, removeSkillExtension } from "./extension-sync.js";
import { writeFileAtomic } from "./atomic-write.js";
import { exportMemoryBundle, importMemoryBundle } from "./data-port.js";
import { mirrorUpsert, mirrorDelete, mirrorSync } from "./sqlite-dualwrite.js";
import * as memoryStore from "./memory-store.js";
import { listCredentialProfiles, setCredentialProfile, removeCredentialProfile, resolveCredential } from "./credentials.js";

import { listRelatedEntities, readRelations, recordMemoryRelations, recordRelation, rebuildMemoryRelations, revokeRelation } from "./relations.js";
import { auditMemories } from "./memory-audit.js";
import { parseRunnerModelList, semanticSearch, checkProcessLiveness, getContentType, readRequestJson, findProjectIndex, expandSynonyms, scanBackupFilesForSecrets, getRelayTimeoutBaseMs, renderDispatchWorktree, createHealthRepairAction, getPathSize, extractCjkNgrams, getBackupFileCatalog, markTieredBackups, parseCliArgs, parseDeclaredList, parseProgressPercent, isJobCheckpointed, getCheckpointStats, renderProjectRegistryReadme, extractSharedSkillLayerVersion, renderEmptyBootstrapSnapshot, sleep, sharedSkillLayerActionLabel, summarizeDir, releaseStaleClaim, inspectSharedMemoryInstructions, getDirectResolveCandidates, normalizeCandidatePath, getPageOptions, findProject, autoCreateWorkflowNodes, summarizeTaskSpec, writeTaskSpecProcessLogs, resolveTaskSpecCwd, getMemoryStorageSummary } from "./lib/util.js";
import { extractInstructionIncludes, normalizeSeverity, formatTopCounts, formatPercent, formatBytes, sanitizeDisplayText, getMemoryAgeDays, inferScope, normalizeSearchText, countBy, sortByImportance, titleCase, looksSensitive, formatEventLocation, extractSection, extractSectionBeforeAny, renderTemplate, trimOutput, summarizeText, textMentionsResolveQuery, summarizeHealthAnalysisForRepair, sanitizeLedgerText, normalizeDuplicateMemoryText, sanitizeInlineText, extractKeywords, extractCompactVariants, getMemoryEventSkipReason, extractLooseJsonStringField, formatMemoryRecordPointer, truncateText, extractSearchTerms } from "./lib/format.js";
import { normalizeMemoryKind, normalizeMemoryProject, normalizeMemoryScope, normalizeList, firstDefinedRef, hasMemoryFilters, normalizeRefToken, normalizeConfidence, applyMemoryAccessFields, normalizeMemoryAccessCount, normalizeMemoryAccessTimestamp, firstDefinedValue, getDaysSinceTimestamp, isMemoryLifecycleVisible, normalizeSupersedeToken, hasExplicitSyncKey, readPositiveInteger, isMemoryHealthExcluded, formatMemoryHealthRepairPlan, sanitizeRawJsonCandidate, getMemoryGrowthTrend, chooseMemoryLayer, parseListOption, parseMemoryTagFilters, formatMemoryFilterSummary, matchesMemoryTags, getMemoryAccessStats, applyMemoryLifecycleOperations, normalizeSupersedeRefs, isStartupMemoryRecord, resolveSnapshotLimits, inferTopics, normalizeMemoryRefs, flattenMemoryRefs, formatMemoryRefs, matchesMemoryRef, touchMemoryAccess, getMemorySupersedesRefs, isOperationalRadioMemory } from "./lib/memory-normalize.js";
import { createDispatchRecordMutex, isClaimStale, shouldPersistDispatchReport, isDispatchableRadioMessage, isClosedDispatchSourceState, buildTaskDispatchText, buildWorkflowDispatchText, findRecipeStepTask, normalizeToolName, safeGitPathSegment, isKnownGeminiWarning, stripExistingModelArgs, getDispatchThreadKey, formatDispatchVerifyCommand, getDispatchRunStatus, getDispatchRunVerificationResult, getAsyncCallStateMeta, getDispatchSourceKey, getRelaySourceKey, dispatchJobFromTask, dispatchJobFromWorkflow, dispatchJobFromRelayEntry, shouldDispatchJob, buildDispatchWorktreeBranch, buildDispatchWorktreeSlug, nextRelayAttempt } from "./lib/dispatch.js";
import { sendHtml, sendPlain, sendJson, sendErrorEnvelope, parsePageParam, getSafeStaticRelativePath, readTextIfExists } from "./lib/http.js";
import { getToolDeclarationsFile, getModelsCacheFile, getRadioCursorFile, getAgentRegistryFile, getRoleRegistryFile, getTeamRegistryFile, getPolicyRulesFile } from "./lib/registry-paths.js";
import { quoteWindowsCmdArg, escapeForWindowsCmd, quoteWindowsCommandArg, quoteShellArg, classifyCommandPath, shellQuote, getRunnerDoctorWarnings, runGit, resolveCommandPaths, commandPathPriority, shouldUseShellForCommand, buildWindowsCmdLine, resolveGitProcessCommand, commandExists, choosePreferredCommandPath } from "./lib/shell.js";
import { normalizeResolveQuery, extractFilesystemPathCandidates, resolvePossiblyHomePath, pathMatchesResolveQuery } from "./lib/resolve.js";
import { normalizeTaskSpecEnv, normalizeStringArray, normalizeTaskSpecList, normalizeTaskSpecLogs, selectPlatformCommand, getTaskSpecProcessStatus, resolveInside } from "./lib/task-spec.js";
import { policyActorMatches, policyRuleSpecificity, isHiddenProjectId, findWorkflowIndex, findTaskIndex, createTaskNote, getNotificationChannels } from "./lib/entity-index.js";
import { getFileHash, getGitHubBackupUploadWarnings, normalizeBackupPatternList, matchesAnyBackupPattern, normalizeScheduleTime, resolveConfiguredPath, extractListValue, renderGitHubBackupReadme, markProtectedBackups, parseBackupTimestampFromName, inferBackupReasonFromName, inferBackupRetentionTier, createdAtRetentionKey, formatBackupDay, getIsoWeekKey, isPathInsideDirectory, countBackupDirs, backupHub, resolveBackupDirectory, getGitHubBackupExportFiles, getDefaultGitHubBackupInclude, assertSafeGitHubBackupRepoDir, ensureSafeChildPath, planBackupRetention, inferBackupRetentionKey, assertSafeDispatchWorktreeRoot } from "./lib/backup.js";
import { relayFailureFingerprint, createSkillDelta, createProject, createWorkflow, createTask, createSession, createRpcRequest, createNotification, createDispatchQueueEntry, validateVerifyCommand, validateMinimalImplementation, validateDependencyBudget, normalizeRefValues, mergeMemoryAccessMetadata, parseJsonObjectCandidate, createRadioMessage } from "./lib/entity-factory.js";
import { readDiscoveredModels, detectVSCodeEnhanced, getDashboardStaticRoot, readTemplate, getLocalInstallTargets, getInstallTargets, renderDashboard } from "./lib/tools-detect.js";
import {
  normalizeAdversarialVerifier,
  normalizeReviewDimensions,
  validateAdversarialVerifier,
  validateReviewDimensions
} from "./review-config.js";

// Permission policy layer (P0: capability permission matrix) — defined at the
// top so they are initialized before dashboard module initialization.
const POLICY_DECISIONS = ["allow", "ask", "deny"];
const POLICY_SCOPES = ["all", "project", "own"];
const POLICY_SCOPE_BREADTH = { all: 3, project: 2, own: 1 };
const POLICY_DESTRUCTIVE_OPERATIONS = ["push", "delete", "purge", "install-dependencies"];

// Seeded defaults derived from the previously hardcoded guardrails.
const POLICY_DEFAULT_SEED = [
  { operation: "read-memory", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "write-memory", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "send-radio", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "claim-task", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "dispatch", decision: "allow", reason: "Standard collaboration operation" },
  { operation: "run-tests", decision: "allow", reason: "Running tests is safe" },
  { operation: "modify-files", decision: "allow", reason: "Editing within the workspace is allowed" },
  { operation: "archive", decision: "allow", reason: "Archiving is reversible" },
  { operation: "install-dependencies", decision: "ask", reason: "Dependency installs need approval (supply-chain safety)" },
  { operation: "push", decision: "ask", reason: "Pushing to remote needs human approval" },
  { operation: "delete", decision: "ask", reason: "Destructive data operations need approval" },
  { operation: "purge", decision: "ask", reason: "Destructive data operations need approval" }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEMORY_DIR_ENV = "AI_MEMORY_DIR";
// P0.1 TTL default: a claim auto-releases after this idle window (borrowed from Cumora markThinking TTL).
// Declared up here because main() runs as a top-level call before the task section below.
const DEFAULT_CLAIM_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MEMORY_DIR = path.join(os.homedir(), ".ai-memory");
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_MEMORY_DIR, "config.json");
const DEFAULT_GITHUB_BACKUP_REMOTE = "";
const DEFAULT_GITHUB_BACKUP_REPO_DIR = path.join(os.homedir(), ".ai-memory-github-backup");
const DEFAULT_GITHUB_BACKUP_TASK_NAME = "AI Memory Hub GitHub Backup";
const DEFAULT_DISPATCH_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const DISPATCH_MAX_CONCURRENCY = 6;

// Live dispatch-pool status for multi-runner collaboration visibility (feature ④).
const dispatchRunState = {
  active: false,
  startedAt: "",
  concurrency: 1,
  total: 0,
  queued: 0,
  running: 0,
  done: 0,
  failed: 0,
  jobs: Object.create(null)
};

function resetDispatchRunState(concurrency, total) {
  dispatchRunState.active = true;
  dispatchRunState.startedAt = new Date().toISOString();
  dispatchRunState.concurrency = concurrency;
  dispatchRunState.total = total;
  dispatchRunState.queued = total;
  dispatchRunState.running = 0;
  dispatchRunState.done = 0;
  dispatchRunState.failed = 0;
  dispatchRunState.jobs = Object.create(null);
}

// Serializes shared JSONL record writes across concurrent dispatch jobs so
// appendDispatchRunRecord / appendRelayStatus / appendDispatchLog don't interleave.
const dispatchRecordMutex = createDispatchRecordMutex();
const DEFAULT_DISPATCH_MAX_RETRIES = 3;
// Oscillation: N consecutive failed attempts with an identical (exitCode, error)
// fingerprint mean the loop is stuck repeating the same call for the same result.
// Abandon early instead of burning the full retry budget on a deterministic failure.
const DISPATCH_OSCILLATION_THRESHOLD = 2;
const DEFAULT_TASK_SPEC_TIMEOUT_MS = 10 * 60 * 1000;
const STALE_OPERATIONAL_RADIO_AFTER_DAYS = 7;
const OPERATIONAL_RADIO_DECAY_RATE_PER_DAY = 8;
const MEMORY_ACCESS_RECENT_DAYS = 7;
const MEMORY_ACCESS_STALE_AFTER_DAYS = 45;
const MEMORY_ACCESS_STALE_DECAY_RATE_PER_DAY = 0.5;
const MEMORY_ACCESS_MAX_HEAT = 12;
const MEMORY_ACCESS_MAX_STALE_PENALTY = 24;
const CORRUPTION_MARKER_PATTERN = /[\u0000\ufffd]/;
const TOOL_DETECTION_CACHE_TTL_MS = 30 * 1000;
const STARTUP_MEMORY_LIMIT = 8;
const SHARED_SKILL_LAYER_VERSION = "1";
const SHARED_SKILL_LAYER_MARKER = `AI_MEMORY_HUB_SHARED_SKILL_LAYER v${SHARED_SKILL_LAYER_VERSION}`;
const SHARED_SKILL_LAYER_MARKER_PREFIX = "AI_MEMORY_HUB_SHARED_SKILL_LAYER";
const PROJECT_VISIBLE_STATUSES = ["active", "paused", "planning"];
const DEFAULT_TASK_SPEC_FILES = [
  ".tasks.json",
  "task-specs.json",
  path.join(".ai-memory", "task-specs.json")
];
const RESEARCH_REPORTS_DIR = "research-reports";
const DISPATCH_RUNS_DIR = "dispatch-runs";
const DEFAULT_DISPATCH_WORKTREE_DIR = ".ai-worktrees";
const DAEMON_PID_FILE = "daemon.pid";
const DAEMON_STATUS_FILE = "daemon-status.json";
const LOOP_CHECKPOINT_FILE = "loop-checkpoint.json";
const DAEMON_HEARTBEAT_FILE = "daemon-heartbeat.json";
const DAEMON_HEARTBEAT_STALE_MS = 30000; // 30 seconds without heartbeat = stale
const SKILL_DELTA_FILE = "skill-deltas.jsonl";
const SKILL_CANDIDATE_FILE = "skill-candidates.jsonl";
const TOOL_CAPABILITY_REGISTRY_VERSION = 1;
let toolDetectionCache = null;

const dashboardMemory = createDashboardMemoryApi({
  appendJsonl,
  buildMemoryIndex,
  createId,
  getMemoryIdentityKeys,
  getMemoryPrimaryKey,
  isPlainObject,
  loadConfig,
  normalizeMemoryMetadata,
  normalizeSupersedeToken,
  readEvents,
  readLedger,
  readTextIfExists
});

const dashboardRadio = createDashboardRadioApi({
  readRadioMessages
});

const dashboardTasks = createDashboardTasksApi({
  readTasks
});

const dashboardWorkflows = createDashboardWorkflowsApi({
  appendJsonl,
  assertWorkflowStatus,
  createRadioMessage,
  createTaskNote,
  createWorkflow,
  deleteEntityRecord,
  findWorkflowIndex,
  getDefaultProjectName: () => path.basename(process.cwd()),
  getRadioMessagesFile: (memoryDir) => path.join(memoryDir, "radio", "messages.jsonl"),
  getWorkflowEventStoreDefinition,
  normalizePriority,
  normalizeReviewDimensions,
  normalizeWorkflowRole,
  notifyWorkflowRoles,
  readWorkflows,
  readWorkflowNodes,
  spawnWorkflowTasks,
  updateWorkflow,
  writeWorkflows
});

const dashboardProjects = createDashboardProjectsApi({
  createProject,
  filterProjects,
  findProjectIndex,
  isPlainObject,
  isHiddenProjectId,
  normalizeProjectStatus,
  parseProjectListOption,
  projectStatuses: PROJECT_STATUSES,
  projectVisibleStatuses: PROJECT_VISIBLE_STATUSES,
  readProjects,
  readRadioMessages,
  readTasks,
  readWorkflows,
  updateProject,
  writeProjects,
  uniqueStringList
});

const dashboardMetrics = createDashboardMetricsApi({
  readDispatchQueue,
  readLatestRelayStatusByThread,
  readRadioMessages,
  readRelayStatus,
  readTasks,
  readWorkflows
});

const dashboardDispatch = createDashboardDispatchApi({
  readDispatchLog,
  readLatestRelayStatusByThread
});

const dashboardAgentSessions = createDashboardAgentSessionsApi({
  readSessions,
  readTasks,
  readWorkflows,
  readLatestRelayStatusByThread,
  readDispatchRuns
});

const dashboardCostSessions = createDashboardCostSessionsApi({ homeDir: os.homedir() });

const dashboardWorktrees = createDashboardWorktreesApi({
  readTasks,
  readWorkflows,
  readLatestRelayStatusByThread,
  readDispatchRuns,
  inspect: inspectDashboardWorktree,
  snapshot: snapshotDashboardWorktree,
  buildAdapters: ({ worktree, remote }) => buildExecutionAdapters({ worktree, remote })
});

const dashboardCollaboration = createDashboardCollaborationApi({
  appendJsonl,
  createRadioMessage,
  getRadioMessagesFile: (memoryDir) => path.join(memoryDir, "radio", "messages.jsonl"),
  readRadioMessages,
  readTasks,
  readWorkflows,
  readUnreadReceipts,
  appendUnreadReceipt,
  readAgentSessions: (memoryDir) => dashboardAgentSessions.getDashboardAgentSessions(memoryDir).agentSessions,
  updateTask,
  updateWorkflow,
  createTaskNote,
  withHubLock
});

const dashboardTools = createDashboardToolsApi({
  capabilityRegistryVersion: TOOL_CAPABILITY_REGISTRY_VERSION,
  getCachedDetectedTools,
  getRunnerProfile,
  normalizeToolName,
  readDispatchRuns,
  readLatestRelayStatusByThread,
  readRadioMessages,
  readTasks,
  refreshDetectedTools,
  resolvePermission,
  readToolDeclarationByTool,
  readDiscoveredModels,
  POLICY_OPERATIONS
});

const dashboardSettings = createDashboardSettingsApi({
  defaultConfig,
  getBackupRetentionConfig,
  loadConfig,
  readJsonSafe,
  writeJson
});

const dashboardBackups = createDashboardBackupsApi({
  backupHub,
  configureGitHubBackup,
  getBackupDetail,
  getBackupRetentionConfig,
  getBackupSummary,
  getGitHubBackupStatus,
  loadConfig,
  pruneBackups,
  deleteBackups,
  restoreBackup,
  runGitHubBackup,
  withHubLock
});

const dashboardSearch = createDashboardSearchApi({
  buildMemoryIndex,
  countBy,
  extractSearchTerms,
  loadConfig,
  normalizeList,
  normalizeSearchText,
  readLedger,
  readRadioMessages,
  readTasks,
  readWorkflows,
  sanitizeInlineText,
  titleCase,
  truncateText
});

const dashboardHealth = createDashboardHealthApi({
  analyzeMemoryHealth,
  buildMemoryIndex,
  formatBytes,
  formatMemoryRecordPointer,
  formatPercent,
  readLedger,
  renderMemoryHealthReport,
  sanitizeInlineText,
  truncateText
});

const dashboardRealtime = createDashboardRealtimeApi({
  dashboardAgentSessions,
  dashboardBackups,
  dashboardCollaboration,
  dashboardDispatch,
  dashboardMemory,
  dashboardMetrics,
  dashboardProjects,
  dashboardRadio,
  dashboardSettings,
  dashboardTasks,
  dashboardTools,
  dashboardWorktrees,
  dashboardWorkflows,
  getStatusObject
});

const dashboardActions = createDashboardActionsApi({
  appendIfMissing,
  appendJsonl,
  assertTaskStatus,
  createRadioMessage,
  createTask,
  createTaskNote,
  ensureDir,
  executeDispatch,
  findTaskIndex,
  getDefaultProjectName: () => path.basename(process.cwd()),
  getEntityEventsFile,
  getEntityProjectionFile,
  getInstallTargets,
  getLocalInstallTargets,
  getRadioMessagesFile: (memoryDir) => path.join(memoryDir, "radio", "messages.jsonl"),
  getStatusObject,
  getTaskEventStoreDefinition,
  invalidateToolDetectionCache,
  materializeEntityProjection,
  pullCommand,
  radioPromoteCommand: (...args) => radioPromoteCommand(...args, radioCommandDeps),
  readEntityEvents,
  readTasks,
  readWorkflows,
  recordCommand,
  renderInstallSnippet,
  syncCommand,
  updateTask,
  withHubLock,
  writeTasks,
  writeWorkflows
});

const RUNNER_PROFILES = {
  codex: {
    tool: "codex",
    commandCandidates: ["codex.cmd", "codex"],
    args: ["exec", "--sandbox", "danger-full-access", "--skip-git-repo-check"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "codex exec --sandbox danger-full-access --skip-git-repo-check <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
  },
  claude: {
    tool: "claude",
    commandCandidates: ["claude.cmd", "claude"],
    windowsExeFromCmd: path.join("node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
    args: ["-p", "-", "--output-format", "json", "--permission-mode", "bypassPermissions", "--bare", "--model", "sonnet", "--effort", "low"],
    promptMode: "stdin",
    outputMode: "claude-json",
    preview: "claude -p - --output-format json --permission-mode bypassPermissions --bare <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    resumeArgs: (sessionId) => ["--resume", sessionId],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "json-output", "session-resume"]
  },
  codebuddy: {
    tool: "codebuddy",
    commandCandidates: ["codebuddy.cmd", "codebuddy", "codebuddy-code"],
    args: ["-p", "--permission-mode", "bypassPermissions"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "codebuddy -p --permission-mode bypassPermissions <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
  },
  gemini: {
    tool: "gemini",
    commandCandidates: ["gemini.cmd", "gemini"],
    args: [],
    promptMode: "stdin",
    outputMode: "text",
    preview: "gemini <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output", "warning-filter"]
  },
  "qoder-cn": {
    tool: "qoder-cn",
    commandCandidates: ["qoder-cn.cmd", "qoder-cn"],
    args: ["run"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "qoder-cn run <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
  },
  opencode: {
    tool: "opencode",
    commandCandidates: ["opencode.cmd", "opencode", "qoder-cn.cmd", "qoder-cn"],
    args: ["run", "--auto"],
    promptMode: "stdin",
    outputMode: "text",
    preview: "opencode run --auto <stdin>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    modelsCommand: ["models"],
    modelListFormat: "provider-model",
    capabilities: ["direct-dispatch", "stdin-prompt", "text-output"]
  },
  mimocode: {
    tool: "mimocode",
    commandCandidates: ["mimo.cmd", "mimo", "mimocode.cmd", "mimocode"],
    args: ["run"],
    promptMode: "argv",
    outputMode: "text",
    compactPrompt: true,
    preview: "mimo run <prompt>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    modelsCommand: ["models"],
    modelListFormat: "provider-model",
    capabilities: ["direct-dispatch", "argv-prompt", "text-output", "opencode-compatible"]
  },
  grok: {
    tool: "grok",
    commandCandidates: [
      path.join(os.homedir(), ".grok", "bin", "grok"),
      path.join(os.homedir(), ".grok", "bin", "grok.exe"),
      path.join(os.homedir(), ".local", "bin", "grok"),
      "grok.cmd",
      "grok"
    ],
    args: ["--always-approve", "-p"],
    promptMode: "argv",
    outputMode: "text",
    compactPrompt: true,
    preview: "grok --always-approve -p <prompt>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    modelsCommand: ["models"],
    modelListFormat: "grok",
    capabilities: ["direct-dispatch", "argv-prompt", "text-output"]
  },
  marvis: {
    tool: "marvis",
    sharedStateOnly: true,
    reason: "marvis currently integrates through shared radio/task state only; no verified direct CLI runner is configured on this machine"
  },
  qclaw: {
    tool: "qclaw",
    sharedStateOnly: true,
    reason: "qclaw should currently be coordinated through shared tasks/radio or its own gateway; no verified direct prompt runner is configured"
  },
  coze: {
    tool: "coze",
    sharedStateOnly: true,
    reason: "coze (扣子) should currently be coordinated through shared tasks/radio or its own gateway; no verified direct prompt runner is configured"
  },
  openclaw: {
    tool: "openclaw",
    sharedStateOnly: true,
    reason: "openclaw should currently be coordinated through shared tasks/radio or gateway APIs; no verified direct prompt runner is configured"
  },
  antigravity: {
    tool: "antigravity",
    commandCandidates: [
      path.join(os.homedir(), "AppData", "Local", "agy", "bin", "agy.exe"),
      "agy.cmd",
      "agy"
    ],
    args: ["--print"],
    promptMode: "argv",
    outputMode: "text",
    compactPrompt: true,
    preview: "agy --print <prompt>",
    versionArgs: ["--version"],
    probeArgs: ["--help"],
    modelArgs: (model) => ["--model", model],
    capabilities: ["direct-dispatch", "argv-prompt", "text-output", "session-history"]
  },
  "codex-app": {
    tool: "codex-app",
    sharedStateOnly: true,
    reason: "codex-app is a desktop/app target; use shared state or app automation rather than direct CLI dispatch"
  },
  "claude-desktop": {
    tool: "claude-desktop",
    sharedStateOnly: true,
    reason: "claude-desktop is a desktop/app target; use shared state or app automation rather than direct CLI dispatch"
  }
};

// Unified async call state machine

const ASYNC_CALL_TRANSITIONS = {
  "pending": ["dispatched"],
  "dispatched": ["acked", "progress", "failed", "completed"],
  "acked": ["progress", "completed", "failed"],
  "progress": ["progress", "acked", "completed", "failed"],
  "retrying": ["dispatched", "progress", "failed", "abandoned"],
  "failed": ["retrying", "abandoned"],
  "completed": [],
  "abandoned": []
};


const runnerResolutionCache = new Map();

const rawArgs = process.argv.slice(2);
const parsedArgs = parseCliArgs(rawArgs);
const args = parsedArgs.args;
const command = parsedArgs.command;
const rest = parsedArgs.rest;

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

async function main() {
  switch (command) {
    case "init":
      return initCommand(rest);
    case "detect":
      return detectCommand();
    case "capability":
    case "capabilities":
      return capabilitiesCommand(rest);
    case "declare":
    case "declaration":
      return declareCommand(rest, declareCommandDeps);
    case "models":
      return modelsCommand(rest, modelsCommandDeps);
    case "policy":
      return policyCommand(rest, policyCommandDeps);
    case "status":
      return statusCommand();
    case "record":
      return recordCommand(rest);
    case "memory":
      return memoryCommand(rest, memoryCommandDeps);
    case "radio":
      return radioCommand(rest, radioCommandDeps);
    case "project":
    case "projects":
      return projectCommand(rest, projectCommandDeps);
    case "task":
    case "todo":
      return taskCommand(rest, taskCommandDeps);
    case "workflow":
    case "flow":
      return workflowCommand(rest, workflowCommandDeps);
    case "prompt":
      return promptCommand(rest, { loadConfig, ensureHub, withHubLock });
    case "gate":
      return gateCommand(rest, gateCommandDeps);
    case "session":
      return sessionCommand(rest, sessionCommandDeps);
    case "agent":
      return agentCommand(rest, agentCommandDeps);
    case "role":
    case "roles":
      return roleCommand(rest, roleCommandDeps);
    case "team":
    case "teams":
      return teamCommand(rest, teamCommandDeps);
    case "review":
      return reviewCommand(rest);
    case "worktree":
      return worktreeCommand(rest, worktreeCommandDeps);
    case "rpc":
      return rpcCommand(rest, rpcCommandDeps);
    case "notify":
      return notifyCommand(rest, notifyCommandDeps);
    case "context":
      return contextCommand(rest, contextCommandDeps);
    case "queue":
      return queueCommand(rest, queueCommandDeps);
    case "recipe":
      return recipeCommand(rest, recipeCommandDeps);
    case "task-spec":
    case "taskspec":
      return taskSpecCommand(rest, taskCommandDeps);
    case "metrics":
      return metricsCommand(rest);
    case "health":
      return healthCommand(rest);
    case "relations":
    case "relation":
      return relationsCommand(rest);
    case "update":
      return updateCommand(rest);
    case "connect":
    case "contact":
      return connectCommand(rest, connectCommandDeps);
    case "doctor":
      return doctorCommand(rest);
    case "dispatch":
      return dispatchCommand(rest, dispatchCommandDeps);
    case "checkpoint":
      return checkpointCommand(rest);
    case "heartbeat":
      return heartbeatCommand(rest);
    case "skill-delta":
    case "skilldelta":
      return skillDeltaCommand(rest, skillCommandDeps);
    case "skill-candidate":
    case "skillcandidate":
      return skillCandidateCommand(rest, skillCommandDeps);
    case "skill":
      return skillCommand(rest, skillCommandDeps);
    case "mcp":
      return mcpCommand(rest);
    case "pack":
    case "domain-pack":
      return packCommand(rest);
    case "sync":
      return syncCommand(rest);
    case "sqlite":
    case "db":
      return sqliteCommand(rest, { loadConfig });
    case "index":
      return indexCommand(rest);
    case "events":
      return eventsCommand(rest, { loadConfig, ensureHub, hasFlag, getOption, positionalArgs, memoryStore, fs });
    case "search":
      return searchCommand(rest, searchCommandDeps);
    case "snapshot":
      return snapshotCommand(rest);
    case "resolve":
      return resolveCommand(rest, resolveCommandDeps);
    case "pull":
      return pullCommand(rest);
    case "merge":
      return mergeCommand(rest, mergeCommandDeps);
    case "backup":
      return backupCommand(rest, backupCommandDeps);
    case "gh":
    case "github":
      return githubCommand(rest, githubCommandDeps);
    case "ssh":
      return sshCommand(rest, sshCommandDeps);
    case "watch":
      return watchCommand(rest);
    case "daemon":
      return daemonCommand(rest, daemonCommandDeps);
    case "app":
      return appCommand(rest);
    case "install":
      return installCommand(rest);
    case "help":
    case "--help":
    case "-h":
      return helpCommand();
    default:
      throw new Error(`Unknown command: ${command}\nRun "${APP_NAME} help".`);
  }
}


function resolveMemoryDir(argv = rawArgs) {
  const fromArgs = getOption(argv, "--memory-dir");
  const fromEnv = process.env[MEMORY_DIR_ENV];
  return path.resolve(fromArgs || fromEnv || DEFAULT_MEMORY_DIR);
}

function initCommand(argv) {
  const memoryDir = resolveMemoryDir();
  ensureHub(memoryDir);

  const configPath = path.join(memoryDir, "config.json");
  if (!fs.existsSync(configPath) || hasFlag(argv, "--force")) {
    writeJson(configPath, defaultConfig(memoryDir));
  }

  console.log(`Initialized shared memory directory: ${memoryDir}`);
  console.log(`Config: ${configPath}`);

  if (hasFlag(argv, "--all")) {
    initAllTools(memoryDir, { apply: hasFlag(argv, "--apply") });
  }
}

// One-shot onboarding: detect installed tools and install their shared-memory
// adapters in a single step, instead of running install --tool per tool. Lowers
// the adoption cost that keeps some tools from ever reading the hub.
function initAllTools(memoryDir, { apply = false } = {}) {
  const detected = detectTools(memoryDir).filter((tool) => tool.installed);
  const detectedNames = new Set(detected.map((tool) => normalizeToolName(tool.name)));
  const targets = getInstallTargets(memoryDir).filter((target) =>
    detectedNames.has(normalizeToolName(target.tool))
  );

  console.log(`\nDetected ${detected.length} installed tool(s); ${targets.length} have a shared-memory adapter.`);

  if (targets.length === 0) {
    console.log("No matching adapters to install. Run \"ai-memory-hub detect\" to see what was found.");
    return;
  }

  if (!apply) {
    console.log("\n[dry-run] Would install adapters for:");
    for (const target of targets) {
      console.log(`  ${target.tool}: ${target.file}`);
    }
    console.log("\nRe-run with --apply to write these files.");
    return;
  }

  let installed = 0;
  for (const target of targets) {
    const snippet = renderInstallSnippet(target, memoryDir);
    ensureDir(path.dirname(target.file));
    const result = syncSharedSkillLayer(target.file, snippet, { apply: true });
    console.log(`${sharedSkillLayerActionLabel(result.status)} shared memory instructions for ${target.tool}: ${target.file}`);
    installed += 1;
  }
  console.log(`\nOnboarded ${installed} tool(s) into the shared memory hub.`);
}

function detectCommand() {
  const tools = detectTools();
  console.log(JSON.stringify(tools, null, 2));
}

function capabilitiesCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const tool = getOption(argv, "--tool") || getOption(argv, "--to") || positionalArgs(argv)[0] || "";
  const registry = dashboardTools.buildCapabilityRegistry(config.memoryDir, {
    refresh: hasFlag(argv, "--refresh")
  });
  if (tool) {
    const name = normalizeToolName(tool);
    console.log(JSON.stringify({
      ...registry,
      tools: registry.tools.filter((entry) => normalizeToolName(entry.name) === name),
      summary: dashboardTools.summarizeCapabilityRegistry(registry.tools.filter((entry) => normalizeToolName(entry.name) === name))
    }, null, 2));
    return;
  }
  console.log(JSON.stringify(registry, null, 2));
}



function readToolDeclarationByTool(memoryDir, tool) {
  const name = normalizeToolName(tool);
  const entries = readToolDeclarations(memoryDir);
  const sorted = entries
    .filter((entry) => normalizeToolName(entry.tool) === name)
    .sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")));
  return sorted[sorted.length - 1] || null;
}


function writeToolDeclaration(memoryDir, declaration) {
  const file = getToolDeclarationsFile(memoryDir);
  ensureDir(path.dirname(file));
  const existing = readToolDeclarations(memoryDir);
  const name = normalizeToolName(declaration.tool);
  const updated = existing.filter((entry) => normalizeToolName(entry.tool) !== name);
  updated.push(declaration);
  writeFileAtomic(file, updated.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  return declaration;
}

function removeToolDeclaration(memoryDir, tool) {
  const file = getToolDeclarationsFile(memoryDir);
  const name = normalizeToolName(tool);
  const existing = readToolDeclarations(memoryDir);
  const remaining = existing.filter((entry) => normalizeToolName(entry.tool) !== name);
  if (remaining.length === existing.length) {
    return false;
  }
  writeFileAtomic(file, remaining.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  return true;
}







function fetchToolModels(memoryDir, tool) {
  const runner = getToolRunner(tool);
  if (!runner.available || !Array.isArray(runner.modelsCommand) || runner.modelsCommand.length === 0) {
    return { tool: normalizeToolName(tool), supported: false, models: [], error: runner.reason || "No model list command for this runner." };
  }
  const completed = invokeRunnerCommand(runner, runner.modelsCommand, "", 15000);
  if (completed.status !== 0) {
    return {
      tool: normalizeToolName(tool),
      supported: true,
      models: [],
      error: completed.error?.message || normalizeRunnerStderr(tool, completed.stderr).stderr || `models command exited ${completed.status}`
    };
  }
  const parsed = parseRunnerModelList(tool, runner, completed.stdout);
  return {
    tool: normalizeToolName(tool),
    supported: true,
    models: parsed,
    fetchedAt: new Date().toISOString()
  };
}





function refreshModelsIfStale(memoryDir, { tool = "", force = false } = {}) {
  const cache = readModelsCache(memoryDir);
  const targets = tool ? [normalizeToolName(tool)] : Object.keys(RUNNER_PROFILES);
  const refreshed = [];
  for (const name of targets) {
    const runner = getToolRunner(name);
    const supportsList = Array.isArray(runner.modelsCommand) && runner.modelsCommand.length > 0;
    const cached = cache[name] || null;
    const cachedAgeMs = cached?.fetchedAt ? Date.now() - new Date(cached.fetchedAt).getTime() : null;
    const stale = !cached || cachedAgeMs === null || cachedAgeMs > MODEL_CACHE_STALE_MS;
    if (!supportsList || (!force && !stale)) {
      continue;
    }
    const fetched = fetchToolModels(memoryDir, name);
    if (fetched.supported && fetched.models.length > 0) {
      cache[name] = { models: fetched.models, fetchedAt: fetched.fetchedAt };
      refreshed.push({ tool: name, models: fetched.models.length });
    }
  }
  if (refreshed.length > 0) {
    writeModelsCache(memoryDir, cache);
  }
  return refreshed;
}









function doctorCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const tool = getOption(argv, "--tool") || getOption(argv, "--to") || "";
  const runProbes = hasFlag(argv, "--run-probes");
  const skipVersion = hasFlag(argv, "--skip-version");
  const timeoutMs = Number(getOption(argv, "--timeout-ms") || 5000);
  const tools = tool ? [tool] : getKnownRunnerToolNames();
  const results = tools.map((name) => inspectRunnerTool(name, {
    runProbes,
    skipVersion,
    timeoutMs,
    memoryDir: config.memoryDir
  }));
  const summary = {
    total: results.length,
    runnable: results.filter((item) => item.available).length,
    sharedStateOnly: results.filter((item) => item.sharedStateOnly).length,
    missing: results.filter((item) => !item.available && !item.sharedStateOnly).length,
    skillLayer: results.filter((item) => item.install?.skillLayer).length,
    warnings: results.reduce((sum, item) => sum + item.warnings.length, 0)
  };
  console.log(JSON.stringify({
    platform: process.platform,
    memoryDir: config.memoryDir,
    runProbes,
    summary,
    tools: results
  }, null, 2));
}

function inspectRunnerTool(tool, { runProbes = false, skipVersion = false, timeoutMs = 5000, memoryDir = resolveMemoryDir() } = {}) {
  const name = normalizeToolName(tool);
  const profile = getRunnerProfile(name);
  const runner = getToolRunner(name);
  const warnings = getRunnerDoctorWarnings(runner);
  const target = getInstallTargetForTool(memoryDir, name);
  const instructionFile = target?.file || path.join(memoryDir, "tools", `${name}-shared-memory.md`);
  const install = inspectSharedMemoryInstructions(instructionFile);
  const versionProbe = runner.available && !skipVersion
    ? runRunnerProbe(name, runner, runner.versionArgs || ["--version"], "", timeoutMs)
    : {
      skipped: true,
      reason: runner.available ? "Version probe skipped." : "Runner is not directly runnable."
    };
  const invocationProbe = runner.available && runProbes
    ? runRunnerProbe(name, runner, runner.probeArgs || runner.versionArgs || ["--help"], "", timeoutMs)
    : {
      skipped: true,
      reason: runner.available ? "Pass --run-probes to execute optional non-model probe." : "Runner is not directly runnable."
    };

  return {
    tool: name,
    available: Boolean(runner.available),
    sharedStateOnly: Boolean(runner.sharedStateOnly),
    reason: runner.available ? "" : runner.reason || "",
    profile: profile ? {
      promptMode: profile.promptMode || "",
      outputMode: profile.outputMode || "",
      capabilities: profile.capabilities || []
    } : null,
    command: runner.commandPath ? {
      path: runner.commandPath,
      name: runner.commandName || "",
      kind: runner.commandKind || "",
      usesShell: Boolean(runner.usesShell),
      shell: runner.shell || "",
      resolved: runner.resolvedCommands || []
    } : null,
    install: {
      instructionFile,
      configured: install.configured,
      skillLayer: install.skillLayer,
      skillLayerVersion: install.skillLayerVersion,
      status: install.status
    },
    warnings,
    versionProbe,
    invocationProbe
  };
}

function runRunnerProbe(tool, runner, args = [], input = "", timeoutMs = 5000) {
  const completed = invokeRunnerCommand(runner, args, input, timeoutMs);
  const normalizedStderr = normalizeRunnerStderr(tool, completed.stderr);
  return {
    ok: completed.status === 0,
    status: completed.status,
    signal: completed.signal || "",
    timedOut: Boolean(completed.error?.code === "ETIMEDOUT"),
    args,
    shell: runner.usesShell ? runner.shell || "shell" : "",
    stdout: trimOutput(completed.stdout, 1000),
    stderr: trimOutput(normalizedStderr.stderr, 1000),
    stderrWarnings: normalizedStderr.warnings,
    error: completed.error ? completed.error.message : ""
  };
}


function statusCommand() {
  console.log(JSON.stringify(getStatusObject(), null, 2));
}

function getStatusObject() {
  const config = loadConfig();
  const memoryDir = config.memoryDir;
  ensureHub(memoryDir);

  const pending = readEvents(path.join(memoryDir, "inbox", "events.jsonl")).length;
  const synced = countJsonlFiles(path.join(memoryDir, "synced"));
  const ledger = readLedger(memoryDir).length;
  const indexPath = path.join(memoryDir, "memories", "index.json");
  const indexStats = fs.existsSync(indexPath) ? readJson(indexPath).stats : {};
  const radio = readRadioMessages(memoryDir).length;
  const tasks = readTasks(memoryDir);
  const activeTasks = tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length;
  const workflows = readWorkflows(memoryDir);
  const activeWorkflows = workflows.filter((workflow) => !["done", "cancelled"].includes(workflow.status)).length;
  const projects = readProjects(memoryDir);
  const relayLatest = Object.values(readLatestRelayStatusByThread(memoryDir));
  const backups = countBackupDirs(memoryDir);
  const lock = readLockStatus(memoryDir);
  const tools = getCachedDetectedTools(memoryDir);
  const toolSummary = dashboardTools.summarizeToolConnections(tools);
  const capabilityRegistry = dashboardTools.buildCapabilityRegistry(memoryDir, { tools, includeMetrics: false });
  const daemon = buildDaemonStatus(memoryDir);

  return {
    memoryDir,
    pendingEvents: pending,
    syncedEventFiles: synced,
    ledgerEvents: ledger,
    index: indexStats || {},
    radioMessages: radio,
    tasks: {
      total: tasks.length,
      active: activeTasks,
      open: tasks.filter((task) => task.status === "open").length,
      claimed: tasks.filter((task) => task.status === "claimed").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      blocked: tasks.filter((task) => task.status === "blocked").length,
      done: tasks.filter((task) => task.status === "done").length
    },
    workflows: {
      total: workflows.length,
      active: activeWorkflows,
      open: workflows.filter((workflow) => workflow.status === "open").length,
      inProgress: workflows.filter((workflow) => workflow.status === "in_progress").length,
      review: workflows.filter((workflow) => workflow.status === "review").length,
      blocked: workflows.filter((workflow) => workflow.status === "blocked").length,
      done: workflows.filter((workflow) => workflow.status === "done").length
    },
    projects: {
      total: projects.length,
      visible: projects.filter(isProjectVisible).length,
      active: projects.filter((project) => project.status === "active").length,
      paused: projects.filter((project) => project.status === "paused").length,
      planning: projects.filter((project) => project.status === "planning").length,
      archived: projects.filter((project) => project.status === "archived").length
    },
    relay: {
      totalThreads: relayLatest.length,
      pending: relayLatest.filter((entry) => entry.state === "pending").length,
      dispatched: relayLatest.filter((entry) => entry.state === "dispatched").length,
      acked: relayLatest.filter((entry) => entry.state === "acked").length,
      progress: relayLatest.filter((entry) => entry.state === "progress").length,
      retrying: relayLatest.filter((entry) => entry.state === "retrying").length,
      failed: relayLatest.filter((entry) => entry.state === "failed").length,
      completed: relayLatest.filter((entry) => entry.state === "completed").length,
      abandoned: relayLatest.filter((entry) => entry.state === "abandoned").length,
      dueRetries: relayLatest.filter((entry) => isRelayRetryDue(entry) && isRelayRetryRunnable(entry)).length
    },
    backups,
    lock,
    daemon,
    toolSummary,
    capabilitySummary: capabilityRegistry.summary,
    tools
  };
}




function recordCommand(argv) {
  const text = positionalArgs(argv).join(" ").trim();
  if (!text) {
    throw new Error("Usage: ai-memory-hub record <text> [--source tool] [--kind preference] [--project name] [--skills id1,id2] [--task task-id] [--workflow workflow-id] [--tags a,b] [--ttl days] [--priority high|normal|low]");
  }

  const config = loadConfig();
  ensureHub(config.memoryDir);
  const source = getOption(argv, "--source") || "manual";
  const kind = normalizeMemoryKind(getOption(argv, "--kind") || "note");
  // OPC v1.1 P1: memory decay support
  const ttlDays = getOption(argv, "--ttl") || "";
  const priority = getOption(argv, "--priority") || "normal";
  // OPC v1.1 P2: token counting support
  const tokenCount = getOption(argv, "--tokens") || "";
  const ttlDate = ttlDays ? new Date(Date.now() + parseInt(ttlDays, 10) * 86400000).toISOString() : "";
  const taskIds = parseListOption(getOption(argv, "--task"));
  const workflowIds = parseListOption(getOption(argv, "--workflow"));
  const metadata = normalizeMemoryMetadata({
    kind,
    project: getOption(argv, "--project") || "",
    skills: parseListOption(getOption(argv, "--skills")),
    refs: {
      ...(taskIds.length ? { taskId: taskIds.length === 1 ? taskIds[0] : taskIds } : {}),
      ...(workflowIds.length ? { workflowId: workflowIds.length === 1 ? workflowIds[0] : workflowIds } : {})
    },
    tags: parseListOption(getOption(argv, "--tags")),
    scope: getOption(argv, "--scope") || "",
    confidence: getOption(argv, "--confidence") || ""
  });
  // Add decay fields
  metadata.priority = ["high", "normal", "low"].includes(priority) ? priority : "normal";
  if (ttlDate) metadata.expiresAt = ttlDate;

  const event = {
    id: createId(text),
    ts: new Date().toISOString(),
    device: os.hostname(),
    source,
    text,
    metadata,
    tokens: tokenCount ? parseInt(tokenCount, 10) : 0
  };

  appendJsonl(path.join(config.memoryDir, "inbox", "events.jsonl"), event);
  const relations = recordMemoryRelations(config.memoryDir, event);

  // Incrementally update FTS5 search index
  let db = null;
  try {
    db = createSearchDb(config.memoryDir);
    const content = tokenizeChinese(text);
    const tags = Array.isArray(metadata.tags) ? metadata.tags.join(" ") : "";
    const project = metadata.project || "";
    db.prepare(`INSERT INTO search_index (entity_type, entity_id, title, content, kind, project, tags, ts)
      VALUES ('memory', ?, '', ?, ?, ?, ?, ?)`).run(event.id, content, kind, project, tokenizeChinese(tags), event.ts);
  } catch { /* index not yet built or unavailable */ }
  finally { if (db) try { db.close(); } catch {} }

  console.log(`Recorded memory event: ${event.id}`);
  return { event, relations };
}




function getUnreadRadioMessages(memoryDir, consumer) {
  const messages = readRadioMessages(memoryDir);
  const cursor = readRadioCursor(memoryDir, consumer);
  const startIdx = cursor.lastMessageId
    ? messages.findIndex((m) => m.id === cursor.lastMessageId)
    : -1;
  const after = startIdx === -1 ? messages : messages.slice(startIdx + 1);
  const processed = new Set(cursor.processedIds);
  return after.filter((m) => !processed.has(m.id));
}



// ---- P1: agent + role registries (borrowed from Cumora participants; role is a first-class entity here) ----

// Upsert an agent's live status; creates the agent record if it doesn't exist yet.
// Used by P0 task-claim linkage so a runner that claims a task auto-shows as busy.
function touchAgentStatus(memoryDir, id, state, by) {
  const nowIso = new Date().toISOString();
  const existing = readAgentById(memoryDir, id) || { id: String(id).trim(), name: String(id).trim(), createdAt: nowIso };
  return writeAgent(memoryDir, { ...existing, status: state, statusBy: by || existing.statusBy || "system", statusAt: nowIso });
}

// P2: team registry (first-class org entity, Cumora has none).








function reviewCommand(argv) {
  const action = argv[0] || "list";
  const config = loadConfig();
  ensureHub(config.memoryDir);
  if (action === "list") {
    console.log(JSON.stringify(dashboardCollaboration.getDashboardCollaboration(config.memoryDir).reviews, null, 2));
    return;
  }
  if (action === "result") {
    const taskId = getOption(argv.slice(1), "--task") || "";
    const decision = getOption(argv.slice(1), "--decision") || "";
    if (!taskId || !["approved", "rejected"].includes(decision)) throw new Error("Usage: ai-memory-hub review result --task <id> --decision approved|rejected [--reopen]");
    const result = dashboardActions.reviewDashboardTask(loadConfig(), { id: taskId, decision, reopen: hasFlag(argv.slice(1), "--reopen"), by: getOption(argv.slice(1), "--by") || "manual", note: getOption(argv.slice(1), "--note") || "" });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action !== "request") throw new Error("Usage: ai-memory-hub review list|request|result --task <id> [--to <agent>] [--text <text>]");
  const taskId = getOption(argv.slice(1), "--task") || "";
  const workflowId = getOption(argv.slice(1), "--workflow") || "";
  const sessionId = getOption(argv.slice(1), "--session") || "";
  if (!taskId && !workflowId && !sessionId) throw new Error("review request requires --task, --workflow, or --session");
  const result = withHubLock(config.memoryDir, "review-request", () => dashboardCollaboration.requestReview(config.memoryDir, {
    taskId, workflowId, sessionId, to: getOption(argv.slice(1), "--to") || "all", by: getOption(argv.slice(1), "--by") || "manual", text: getOption(argv.slice(1), "--text") || "Review requested."
  }), config.sync.lockStaleMs);
  console.log(JSON.stringify(result, null, 2));
}



/** 创建隔离 worktree：git worktree add <repo>/.ai-worktrees/<name> [-b <branch>]，并归档一条 memory 事件。 */

/** 移除隔离 worktree：从 worktree 的 .git 文件反查主仓库后执行 git worktree remove。 */



















/**
 * events — UNIFIED READ API for the raw memory-event log (single-writer truth).
 * Every subcommand reads through memory-store (SQLite memory_events + FTS5),
 * never the raw JSONL directly. This is the read counterpart to the
 * appendJsonl write chokepoint: one module owns the event log's read surface.
 */

















function metricsCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const metrics = dashboardMetrics.calculateMetrics(config.memoryDir);
  console.log(JSON.stringify(metrics, null, 2));
}

function healthCommand(argv) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "report";
  if (action === "repair" || action === "fix") {
    return healthRepairCommand(argv.slice(1));
  }
  if (action !== "report") {
    throw new Error("Usage: ai-memory-hub health [--limit N] | ai-memory-hub health repair [--apply] [--limit N]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const issueLimit = getOption(argv, "--limit")
    ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
    : 5;
  const report = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit });
  console.log(report.markdown);
}

function relationsCommand(argv) {
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "rebuild";
  if (action !== "rebuild") {
    throw new Error("Usage: ai-memory-hub relations rebuild [--dry-run]");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const dryRun = hasFlag(argv, "--dry-run");
  const result = rebuildMemoryRelations(config.memoryDir, readLedger(config.memoryDir), { dryRun });
  console.log(JSON.stringify({ ok: true, action, apply: !dryRun, ...result }, null, 2));
}

function healthRepairCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const apply = hasFlag(argv, "--apply");
  const issueLimit = getOption(argv, "--limit")
    ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
    : 10;
  const result = apply
    ? withHubLock(config.memoryDir, "health-repair", () => runMemoryHealthRepair(config, { apply, issueLimit }), config.sync.lockStaleMs)
    : runMemoryHealthRepair(config, { apply, issueLimit });
  console.log(JSON.stringify(result, null, 2));
}

function updateCommand(argv) {
  const check = hasFlag(argv, "--check");
  const force = hasFlag(argv, "--force");

  if (check) {
    return checkForUpdates();
  }

  return performUpdate(force);
}

function checkForUpdates() {
  console.log("Checking for updates...");

  try {
    // Get current version from package.json
    const packagePath = path.join(__dirname, "..", "package.json");
    const pkg = readJson(packagePath);
    const currentVersion = pkg.version || "unknown";

    // Check git remote for updates

    // Fetch latest from remote
    execSync("git fetch origin main", { stdio: "pipe" });

    // Get local and remote commit hashes
    const localHash = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    const remoteHash = execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();

    if (localHash === remoteHash) {
      console.log(JSON.stringify({
        upToDate: true,
        currentVersion,
        message: "You are running the latest version"
      }, null, 2));
    } else {
      // Get commit count between local and remote
      const behindCount = execSync(`git rev-list --count HEAD..origin/main`, { encoding: "utf8" }).trim();

      console.log(JSON.stringify({
        upToDate: false,
        currentVersion,
        behindBy: parseInt(behindCount),
        message: `${behindCount} new commit(s) available. Run 'ai-memory-hub update' to update.`
      }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({
      error: true,
      message: `Failed to check for updates: ${error.message}`
    }, null, 2));
    process.exit(1);
  }
}

function performUpdate(force) {
  console.log("Updating ai-memory-hub...");

  try {
    // Check for uncommitted changes
    const status = execSync("git status --porcelain", { encoding: "utf8" });

    if (status && !force) {
      console.error(JSON.stringify({
        error: true,
        message: "You have uncommitted changes. Commit or stash them first, or use --force to discard.",
        uncommittedFiles: status.split("\n").filter(Boolean)
      }, null, 2));
      process.exit(1);
    }

    // Fetch latest changes
    console.log("Fetching latest changes...");
    execSync("git fetch origin main", { stdio: "inherit" });

    // Reset to origin/main (discard local changes if --force)
    if (force) {
      console.log("Discarding local changes and updating...");
      execSync("git reset --hard origin/main", { stdio: "inherit" });
    } else {
      console.log("Pulling latest changes...");
      execSync("git pull origin main", { stdio: "inherit" });
    }

    // Install/update dependencies
    console.log("Checking dependencies...");
    const packagePath = path.join(__dirname, "..", "package.json");
    if (fs.existsSync(packagePath)) {
      console.log("Updating dependencies...");
      execSync("npm install", { stdio: "inherit", cwd: path.join(__dirname, "..") });
    }

    // Get new version
    const pkg = readJson(packagePath);
    const newVersion = pkg.version || "unknown";

    console.log(JSON.stringify({
      success: true,
      version: newVersion,
      message: "Update complete! Restart any running processes to use the new version."
    }, null, 2));

  } catch (error) {
    console.error(JSON.stringify({
      error: true,
      message: `Update failed: ${error.message}`
    }, null, 2));
    process.exit(1);
  }
}

function getClaimTtlMs(config) {
  const ttl = config && config.task && config.task.claimTtlMs;
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CLAIM_TTL_MS;
}



function buildRecentRelayStatusView(memoryDir, { project = "", tool = "", state = "", limit = 20 }) {
  const filteredEntries = Object.values(readLatestRelayStatusByThread(memoryDir))
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => tool ? entry.tool === tool : true)
    .filter((entry) => state ? entry.state === state : true)
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  const latestEntries = filteredEntries.slice(0, Math.max(1, Number(limit || 20)));
  const latestRuns = readLatestDispatchRunByThread(memoryDir);

  const countsByState = {};
  const countsByTool = {};
  for (const entry of filteredEntries) {
    const stateKey = entry.state || "unknown";
    const toolKey = entry.tool || "unknown";
    countsByState[stateKey] = (countsByState[stateKey] || 0) + 1;
    countsByTool[toolKey] = (countsByTool[toolKey] || 0) + 1;
  }

  return {
    found: latestEntries.length > 0,
    mode: "recent",
    query: {
      recent: limit,
      project,
      tool,
      state
    },
    summary: {
      totalMatched: filteredEntries.length,
      returned: latestEntries.length,
      countsByState,
      countsByTool
    },
    items: latestEntries.map((entry) => ({
      threadKey: entry.threadKey || "",
      thread: entry.thread || "",
      project: entry.project || "",
      tool: entry.tool || "",
      state: entry.state || "",
      sourceKind: entry.sourceKind || "",
      sourceId: entry.sourceId || "",
      attempt: Number(entry.attempt || 0),
      maxRetries: Number(entry.maxRetries || 0),
      progressPercent: entry.progressPercent ?? null,
      progressStatus: entry.progressStatus || "",
      progressAt: entry.progressAt || "",
      progressBy: entry.progressBy || "",
      nextRetryAt: entry.nextRetryAt || "",
      latestRunId: latestRuns[entry.threadKey || ""]?.runId || "",
      latestRunStatus: latestRuns[entry.threadKey || ""]?.status || "",
      latestRunFinishedAt: latestRuns[entry.threadKey || ""]?.finishedAt || "",
      lastError: summarizeText(entry.lastError || "", 120),
      ts: entry.ts || ""
    }))
  };
}




function resolveRelaySourceObject(memoryDir, entry) {
  if (!entry?.sourceKind || !entry?.sourceId) {
    return null;
  }
  if (entry.sourceKind === "radio") {
    return readRadioMessages(memoryDir).find((message) => message.id === entry.sourceId) || null;
  }
  if (entry.sourceKind === "task") {
    return readTasks(memoryDir).find((task) => task.id === entry.sourceId) || null;
  }
  if (entry.sourceKind === "workflow") {
    return readWorkflows(memoryDir).find((workflow) => workflow.id === entry.sourceId) || null;
  }
  return null;
}

function resolveRelayRelatedObjects(memoryDir, entry, source = null) {
  const thread = entry?.thread || "";
  const project = entry?.project || "";
  const radios = readRadioMessages(memoryDir)
    .filter((message) => thread ? message.thread === thread : false)
    .filter((message) => project ? message.project === project : true);
  const workflows = readWorkflows(memoryDir)
    .filter((workflow) => thread ? workflow.id === thread : false)
    .filter((workflow) => project ? workflow.project === project : true);
  const linkedTaskIds = new Set(workflows.flatMap((workflow) => workflow.linkedTasks || []));
  const tasks = readTasks(memoryDir)
    .filter((task) => thread ? task.id === thread || linkedTaskIds.has(task.id) : false)
    .filter((task) => project ? task.project === project : true);

  return {
    radios,
    tasks,
    workflows,
    sourceTask: source?.id ? tasks.find((task) => task.id === source.id) || null : null,
    sourceWorkflow: source?.id ? workflows.find((workflow) => workflow.id === source.id) || null : null
  };
}

function prepareDispatchJobForRun(memoryDir, job, relayState, { model, run, isolateWorktree, worktreeRoot }) {
  if (model) {
    job.model = model;
    const declared = readToolDeclarationByTool(memoryDir, job.tool)?.models || [];
    const discovered = readDiscoveredModels(memoryDir, job.tool);
    const knownModels = [...new Set([...declared, ...discovered])];
    if (knownModels.length > 0 && !knownModels.includes(model) && !knownModels.some((known) => known.endsWith(`/${model}`) || known.endsWith(`:${model}`))) {
      job.modelNote = `Requested model "${model}" is not in ${job.tool}'s declared/discovered list. Available: ${knownModels.length} model(s). Use "ai-memory-hub models --to ${job.tool} --refresh" to refresh from the provider.`;
    }
  }
  const runner = getToolRunner(job.tool);
  if (!runner.available) {
    const result = { ...job, runnable: false, reason: runner.reason };
    if (run && !runner.sharedStateOnly) {
      const attempt = nextRelayAttempt(relayState, job);
      const maxRetries = getDispatchJobMaxRetries(job);
      const state = getRelayFailureState(attempt, maxRetries);
      appendRelayStatus(memoryDir, job, {
        state, attempt, maxRetries, exitCode: null, lastError: runner.reason,
        sessionId: "", ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        nextRetryAt: computeNextRetryAt(attempt, maxRetries)
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: state, dispatchId: job.id, threadKey: getDispatchThreadKey(job),
        attempt, maxRetries, nextRetryAt: computeNextRetryAt(attempt, maxRetries),
        sessionId: "", lastError: runner.reason
      });
      const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: state });
      appendDispatchLog(memoryDir, result);
      applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, state, { statusMessage });
    }
    return { skip: result };
  }
  if (!run) {
    const sourceKey = getDispatchSourceKey(job);
    return { skip: {
      ...job, runnable: true, dryRun: true, command: runner.preview,
      relayState: relayState[sourceKey]?.state || "pending",
      attempt: relayState[sourceKey]?.attempt || 0
    }};
  }
  const attempt = nextRelayAttempt(relayState, job);
  const maxRetries = getDispatchJobMaxRetries(job);
  const permission = resolvePermission(memoryDir, {
    actor: job.tool, actorRoles: job.roles || [],
    project: job.project || "*", operation: "dispatch", scope: "all"
  });
  if (permission.decision === "deny") {
    const result = {
      ...job, runnable: false,
      reason: `Permission denied: ${permission.reason}`,
      exitCode: 403,
      error: `Policy layer blocked dispatch: ${permission.reason}`
    };
    appendRelayStatus(memoryDir, job, {
      state: "failed-permanent", attempt, maxRetries, exitCode: 403,
      lastError: result.error, sessionId: "", ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "failed-permanent", dispatchId: job.id, threadKey: getDispatchThreadKey(job),
      attempt, maxRetries, nextRetryAt: "", sessionId: "", lastError: result.error
    });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "failed-permanent" });
    appendDispatchLog(memoryDir, result);
    applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "failed-permanent", { statusMessage });
    return { skip: result };
  }
  if (permission.decision === "ask") {
    const gate = appendApprovalGateEvent(memoryDir, {
      status: "requested", actor: job.tool, scope: "dispatch", operation: "dispatch",
      refId: job.id, refType: "dispatch-job", reason: permission.reason,
      reviewer: "human", project: job.project || ""
    });
    const result = {
      ...job, runnable: false,
      reason: `Approval required: ${permission.reason}`,
      exitCode: 451,
      error: `Policy requires approval (gate ${gate.gateId}): ${permission.reason}`,
      gateId: gate.gateId
    };
    appendRelayStatus(memoryDir, job, {
      state: "approval-required", attempt, maxRetries, exitCode: 451,
      lastError: result.error, sessionId: "", ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      gateId: gate.gateId
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "approval-required", dispatchId: job.id, threadKey: getDispatchThreadKey(job),
      attempt, maxRetries, nextRetryAt: "", sessionId: "",
      lastError: result.error, gateId: gate.gateId
    });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "approval-required" });
    appendDispatchLog(memoryDir, result);
    applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "approval-required", { statusMessage });
    return { skip: result };
  }
  // permission.decision === "allow" → mark dispatched, prepare for run
  appendRelayStatus(memoryDir, job, {
    state: "dispatched", attempt, maxRetries, exitCode: null,
    lastError: "", sessionId: "", ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS
  });
  updateDispatchSourceState(memoryDir, job, {
    deliveryState: "dispatched", dispatchId: job.id, threadKey: getDispatchThreadKey(job),
    attempt, maxRetries, nextRetryAt: "", sessionId: "", lastError: ""
  });
  return { job, runner, attempt, maxRetries, options: { isolateWorktree, worktreeRoot } };
}

// processDispatchJobResult: does everything AFTER the runner subprocess finishes.
// Handles relay status updates, radio messages, dispatch log, and outcome application.
function processDispatchJobResult(memoryDir, job, result, { attempt, maxRetries }) {
  if (result.exitCode === 0) {
    appendRelayStatus(memoryDir, job, {
      state: "acked", attempt, maxRetries, exitCode: 0,
      lastError: "", sessionId: result.sessionId || "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS, nextRetryAt: "",
      worktree: result.worktree || null
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "acked", dispatchId: job.id, threadKey: getDispatchThreadKey(job),
      attempt, maxRetries, nextRetryAt: "", sessionId: result.sessionId || "",
      lastError: "", worktree: result.worktree || null
    });
  }
  const finalState = result.exitCode === 0 ? "completed" : getRelayFailureState(attempt, maxRetries);
  const nextRetryAt = result.exitCode === 0 ? "" : computeNextRetryAt(attempt, maxRetries);
  const lastError = result.exitCode === 0 ? "" : (result.error || result.stderr || "");
  const fingerprint = result.exitCode === 0 ? "" : relayFailureFingerprint(result.exitCode, lastError);
  let resolvedState = finalState;
  let oscillating = false;
  if (result.exitCode !== 0) {
    const osc = getRelayFailureStateWithOscillation(memoryDir, job, attempt, maxRetries, fingerprint);
    resolvedState = osc.state;
    oscillating = osc.oscillating;
  }
  const resolvedNextRetryAt = resolvedState === "abandoned" ? "" : nextRetryAt;
  appendRelayStatus(memoryDir, job, {
    state: resolvedState, attempt, maxRetries, exitCode: result.exitCode,
    lastError, sessionId: result.sessionId || "",
    ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS, nextRetryAt: resolvedNextRetryAt,
    worktree: result.worktree || null, fingerprint, oscillating
  });
  updateDispatchSourceState(memoryDir, job, {
    deliveryState: resolvedState, dispatchId: job.id, threadKey: getDispatchThreadKey(job),
    attempt, maxRetries, nextRetryAt: resolvedNextRetryAt,
    sessionId: result.sessionId || "", lastError, worktree: result.worktree || null
  });
  const responseMessage = appendDispatchResponseMessage(memoryDir, job, { ...result, relayState: resolvedState });
  const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: resolvedState, oscillating });
  const enrichedResult = {
    ...result, relayState: resolvedState, oscillating, attempt, maxRetries,
    nextRetryAt: resolvedNextRetryAt,
    responseRadioId: responseMessage?.id || "",
    statusRadioId: statusMessage?.id || ""
  };
  appendDispatchLog(memoryDir, enrichedResult);
  applyDispatchOutcome(memoryDir, job, enrichedResult, resolvedState, { responseMessage, statusMessage });
  return enrichedResult;
}

async function executeDispatch(memoryDir, {
  run = false,
  force = false,
  to = "",
  project = "",
  limit = 10,
  model = "",
  respectRecipeDependencies = false,
  isolateWorktree = false,
  worktreeRoot = "",
  concurrency = 1
}) {
  const jobs = buildDispatchJobs(memoryDir, { to, project, limit, force, respectRecipeDependencies });
  const results = [];
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const preparedJobs = [];
  for (const job of jobs) {
    const prepared = prepareDispatchJobForRun(memoryDir, job, relayState, { model, run, isolateWorktree, worktreeRoot });
    if (prepared.skip) {
      results.push(prepared.skip);
    } else {
      preparedJobs.push(prepared);
    }
  }
  if (preparedJobs.length === 0) return results;
  if (concurrency <= 1) {
    // Sequential path — identical to pre-refactor behavior
    for (const { job, runner, attempt, maxRetries, options } of preparedJobs) {
      const result = runDispatchJob(memoryDir, job, runner, options);
      results.push(processDispatchJobResult(memoryDir, job, result, { attempt, maxRetries }));
    }
  } else {
    // Concurrent path — bounded pool with live status
    const poolResults = await runDispatchPool(memoryDir, preparedJobs.map((p) => ({ job: p.job, runner: p.runner, options: p.options })), { concurrency });
    for (let i = 0; i < preparedJobs.length; i++) {
      const { job, attempt, maxRetries } = preparedJobs[i];
      results.push(processDispatchJobResult(memoryDir, job, poolResults[i], { attempt, maxRetries }));
    }
  }
  return results;
}

function executeDispatchRetry(memoryDir, {
  run = false,
  to = "",
  project = "",
  limit = 10,
  model = "",
  respectRecipeDependencies = false,
  isolateWorktree = false,
  worktreeRoot = ""
}) {
  const timeoutResults = run
    ? markTimedOutRelayStatuses(memoryDir, { to, project })
    : [];
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const jobs = buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit, respectRecipeDependencies });
  const results = [...timeoutResults];
  for (const job of jobs) {
    if (model) {
      job.model = model;
      const declared = readToolDeclarationByTool(memoryDir, job.tool)?.models || [];
      const discovered = readDiscoveredModels(memoryDir, job.tool);
      const knownModels = [...new Set([...declared, ...discovered])];
      if (knownModels.length > 0 && !knownModels.includes(model) && !knownModels.some((known) => known.endsWith(`/${model}`) || known.endsWith(`:${model}`))) {
        job.modelNote = `Requested model "${model}" is not in ${job.tool}'s declared/discovered list. Available: ${knownModels.length} model(s). Use "ai-memory-hub models --to ${job.tool} --refresh" to refresh from the provider.`;
      }
    }
    const runner = getToolRunner(job.tool);
    const maxRetries = getDispatchJobMaxRetries(job, job.maxRetries);
    if (!runner.available) {
      const result = {
        ...job,
        runnable: false,
        reason: runner.reason
      };
      if (run && !runner.sharedStateOnly) {
        const state = getRelayFailureState(job.attempt, maxRetries);
        appendRelayStatus(memoryDir, job, {
          state,
          attempt: job.attempt,
          maxRetries,
          exitCode: null,
          lastError: runner.reason,
          sessionId: "",
          ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
          nextRetryAt: computeNextRetryAt(job.attempt, maxRetries)
        });
        updateDispatchSourceState(memoryDir, job, {
          deliveryState: state,
          dispatchId: job.id,
          threadKey: getDispatchThreadKey(job),
          attempt: job.attempt,
          maxRetries,
          nextRetryAt: computeNextRetryAt(job.attempt, maxRetries),
          sessionId: "",
          lastError: runner.reason
        });
        const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: state });
        appendDispatchLog(memoryDir, result);
        applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, state, {
          statusMessage
        });
      }
      results.push(result);
      continue;
    }
    if (!run) {
      results.push({
        ...job,
        runnable: true,
        dryRun: true,
        command: runner.preview,
        relayState: "retrying"
      });
      continue;
    }

    // Phase 2: Check approval gate before retry
    if (job.gateId) {
      const gates = readApprovalGates(memoryDir, { });
      const gate = gates.find((g) => g.gateId === job.gateId);
      if (gate) {
        if (gate.status === "rejected") {
          // Gate rejected → permanent failure
          const result = {
            ...job,
            runnable: false,
            reason: `Approval gate rejected: ${gate.decisionNote || gate.reason}`,
            exitCode: 403,
            error: `Gate ${gate.gateId} rejected by ${gate.reviewer}: ${gate.decisionNote || gate.reason}`
          };
          if (run) {
            appendRelayStatus(memoryDir, job, {
              state: "failed-permanent",
              attempt: job.attempt,
              maxRetries,
              exitCode: 403,
              lastError: result.error,
              sessionId: "",
              ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
              gateId: job.gateId
            });
            updateDispatchSourceState(memoryDir, job, {
              deliveryState: "failed-permanent",
              dispatchId: job.id,
              threadKey: getDispatchThreadKey(job),
              attempt: job.attempt,
              maxRetries,
              nextRetryAt: "",
              sessionId: "",
              lastError: result.error,
              gateId: job.gateId
            });
            const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: "failed-permanent" });
            appendDispatchLog(memoryDir, result);
            applyDispatchOutcome(memoryDir, job, { ...result, statusRadioId: statusMessage?.id || "" }, "failed-permanent", {
              statusMessage
            });
          }
          results.push(result);
          continue;
        }
        if (gate.status === "requested" || gate.status === "needs_changes") {
          // Gate still pending → block retry
          const result = {
            ...job,
            runnable: false,
            reason: `Waiting for approval: gate ${gate.gateId} status=${gate.status}`,
            exitCode: 451,
            error: `Gate ${gate.gateId} still pending (${gate.status}). Use 'gate approve/reject --id ${gate.gateId}' to decide.`,
            gateId: job.gateId
          };
          results.push(result);
          continue;
        }
        // gate.status === "approved" or "waived" → proceed
      }
    }

    appendRelayStatus(memoryDir, job, {
      state: "retrying",
      attempt: job.attempt,
      maxRetries,
      exitCode: null,
      lastError: "",
      sessionId: "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      nextRetryAt: ""
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: "retrying",
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: job.attempt,
      maxRetries,
      nextRetryAt: "",
      sessionId: "",
      lastError: ""
    });
    const result = runDispatchJob(memoryDir, job, runner, { isolateWorktree, worktreeRoot });
    if (result.exitCode === 0) {
      appendRelayStatus(memoryDir, job, {
        state: "acked",
        attempt: job.attempt,
        maxRetries,
        exitCode: 0,
        lastError: "",
        sessionId: result.sessionId || "",
        ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
        nextRetryAt: "",
        worktree: result.worktree || null
      });
      updateDispatchSourceState(memoryDir, job, {
        deliveryState: "acked",
        dispatchId: job.id,
        threadKey: getDispatchThreadKey(job),
        attempt: job.attempt,
        maxRetries,
        nextRetryAt: "",
        sessionId: result.sessionId || "",
        lastError: "",
        worktree: result.worktree || null
      });
    }
    const finalState = result.exitCode === 0
      ? "completed"
      : getRelayFailureState(job.attempt, maxRetries);
    const nextRetryAt = result.exitCode === 0 ? "" : computeNextRetryAt(job.attempt, maxRetries);
    const lastError = result.exitCode === 0 ? "" : (result.error || result.stderr || "");
    appendRelayStatus(memoryDir, job, {
      state: finalState,
      attempt: job.attempt,
      maxRetries,
      exitCode: result.exitCode,
      lastError,
      sessionId: result.sessionId || "",
      ackTimeout: DEFAULT_DISPATCH_ACK_TIMEOUT_MS,
      nextRetryAt,
      worktree: result.worktree || null
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: finalState,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: job.attempt,
      maxRetries,
      nextRetryAt,
      sessionId: result.sessionId || "",
      lastError,
      worktree: result.worktree || null
    });
    const responseMessage = appendDispatchResponseMessage(memoryDir, job, { ...result, relayState: finalState });
    const statusMessage = appendDispatchStatusMessage(memoryDir, job, { ...result, relayState: finalState });
    const enrichedResult = {
      ...result,
      retry: true,
      relayState: finalState,
      attempt: job.attempt,
      maxRetries,
      nextRetryAt,
      responseRadioId: responseMessage?.id || "",
      statusRadioId: statusMessage?.id || ""
    };
    appendDispatchLog(memoryDir, enrichedResult);
    applyDispatchOutcome(memoryDir, job, enrichedResult, finalState, {
      responseMessage,
      statusMessage
    });
    results.push(enrichedResult);
  }
  return results;
}

function markTimedOutRelayStatuses(memoryDir, { to = "", project = "", now = Date.now() } = {}) {
  const timedOutEntries = Object.values(readLatestRelayStatusBySource(memoryDir))
    .filter((entry) => to ? entry.tool === to : true)
    .filter((entry) => project ? entry.project === project : true)
    .filter((entry) => isRelayTimedOut(entry, now));
  const results = [];

  for (const entry of timedOutEntries) {
    const job = rebuildDispatchJobFromRelay(memoryDir, entry) || dispatchJobFromRelayEntry(entry);
    if (!job?.refId) {
      continue;
    }

    const attempt = Number(entry.attempt || 1);
    const maxRetries = getDispatchJobMaxRetries(job, entry.maxRetries);
    const state = getRelayFailureState(attempt, maxRetries);
    const timeoutMs = Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS);
    const lastError = `Timeout: no response within ackTimeout (${timeoutMs}ms) while relay was ${entry.state || "unknown"}`;
    const nextRetryAt = state === ASYNC_CALL_STATES.FAILED
      ? computeNextRetryAt(attempt, maxRetries)
      : "";
    const worktree = normalizeDispatchWorktreeMetadata(entry.worktree);
    const result = {
      ...job,
      runnable: true,
      timeout: true,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: lastError,
      sessionId: entry.sessionId || "",
      relayState: state,
      worktree
    };

    appendRelayStatus(memoryDir, job, {
      state,
      attempt,
      maxRetries,
      exitCode: null,
      lastError,
      sessionId: entry.sessionId || "",
      ackTimeout: timeoutMs,
      nextRetryAt,
      worktree
    });
    updateDispatchSourceState(memoryDir, job, {
      deliveryState: state,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt,
      maxRetries,
      nextRetryAt,
      sessionId: entry.sessionId || "",
      lastError,
      worktree
    });

    const statusMessage = appendDispatchStatusMessage(memoryDir, job, result);
    const enrichedResult = {
      ...result,
      statusRadioId: statusMessage?.id || ""
    };
    appendDispatchLog(memoryDir, enrichedResult);
    applyDispatchOutcome(memoryDir, job, enrichedResult, state, { statusMessage });
    results.push(enrichedResult);
  }

  return results;
}

function isRelayTimedOut(entry, now = Date.now()) {
  if (!entry || ![
    ASYNC_CALL_STATES.DISPATCHED,
    ASYNC_CALL_STATES.ACKED,
    ASYNC_CALL_STATES.PROGRESS,
    ASYNC_CALL_STATES.RETRYING
  ].includes(entry.state || "")) {
    return false;
  }
  const timeoutMs = Number(entry.ackTimeout || DEFAULT_DISPATCH_ACK_TIMEOUT_MS);
  if (timeoutMs <= 0) {
    return false;
  }
  const baseMs = getRelayTimeoutBaseMs(entry);
  return Number.isFinite(baseMs) && baseMs + timeoutMs <= now;
}


function applyDispatchOutcome(memoryDir, job, result, relayState, { responseMessage = null, statusMessage = null } = {}) {
  if (job?.kind !== "task" || !job.refId) {
    return null;
  }
  const now = new Date().toISOString();
  const completed = relayState === ASYNC_CALL_STATES.COMPLETED;
  const failed = [ASYNC_CALL_STATES.FAILED, ASYNC_CALL_STATES.ABANDONED].includes(relayState);
  const reportPath = completed ? writeDispatchReportIfUseful(memoryDir, job, result, relayState) : "";
  const responseSummary = summarizeText(result.stdout || "", 220);
  const errorSummary = summarizeText(result.error || result.stderr || "", 220);
  let outcomeNoteText = "";

  const updatedTask = updateTask(memoryDir, job.refId, (task) => {
    const notes = [...(task.notes || [])];
    if (completed) {
      const parts = [`Dispatch completed by ${job.tool || "unknown"}.`];
      if (responseSummary) {
        parts.push(`Response: ${responseSummary}`);
      }
      if (reportPath) {
        parts.push(`Report: ${reportPath}`);
      }
      outcomeNoteText = parts.join(" ");
      notes.push(createTaskNote("ai-memory-hub", outcomeNoteText));
    } else if (failed) {
      outcomeNoteText = `Dispatch ${relayState} for ${job.tool || "unknown"}: ${errorSummary || "no error output"}`;
      notes.push(createTaskNote("ai-memory-hub", outcomeNoteText));
    }

    return {
      ...task,
      status: completed ? "done" : task.status,
      assignee: task.assignee || job.tool || "",
      updatedAt: now,
      completedAt: completed ? now : task.completedAt || "",
      deliveryState: relayState,
      deliveryUpdatedAt: now,
      dispatchId: job.id,
      threadKey: getDispatchThreadKey(job),
      attempt: Number(result.attempt || task.attempt || 0),
      maxRetries: Number(result.maxRetries || task.maxRetries || 0),
      nextRetryAt: result.nextRetryAt || task.nextRetryAt || "",
      sessionId: result.sessionId || task.sessionId || "",
      lastError: failed ? (result.error || result.stderr || task.lastError || "") : "",
      responseRadioId: responseMessage?.id || task.responseRadioId || "",
      statusRadioId: statusMessage?.id || task.statusRadioId || "",
      dispatchReportPath: reportPath || task.dispatchReportPath || "",
      worktree: result.worktree || task.worktree || null,
      notes
    };
  });
  syncLinkedWorkflowDeliveryState(memoryDir, updatedTask, {
    deliveryState: relayState,
    dispatchId: job.id,
    threadKey: getDispatchThreadKey(job),
    attempt: Number(result.attempt || updatedTask.attempt || 0),
    maxRetries: Number(result.maxRetries || updatedTask.maxRetries || 0),
    nextRetryAt: result.nextRetryAt || updatedTask.nextRetryAt || "",
    sessionId: result.sessionId || updatedTask.sessionId || "",
    lastError: failed ? (result.error || result.stderr || updatedTask.lastError || "") : "",
    responseRadioId: responseMessage?.id || updatedTask.responseRadioId || "",
    statusRadioId: statusMessage?.id || updatedTask.statusRadioId || "",
    dispatchReportPath: reportPath || updatedTask.dispatchReportPath || "",
    worktree: result.worktree || updatedTask.worktree || null,
    noteText: outcomeNoteText ? `Linked task ${updatedTask.id}: ${outcomeNoteText}` : ""
  });
  return updatedTask;
}

function syncLinkedWorkflowDeliveryState(memoryDir, task, patch = {}) {
  if (!task?.id) {
    return [];
  }
  const workflows = readWorkflows(memoryDir).filter((workflow) => (workflow.linkedTasks || []).includes(task.id));
  if (workflows.length === 0) {
    return [];
  }
  const tasks = readTasks(memoryDir);
  const updated = [];
  for (const workflow of workflows) {
    const aggregate = summarizeWorkflowLinkedTaskDelivery(workflow, tasks, patch);
    const next = updateWorkflow(memoryDir, workflow.id, (current) => {
      const notes = [...(current.notes || [])];
      if (patch.noteText && !notes.some((note) => note.text === patch.noteText)) {
        notes.push(createTaskNote("ai-memory-hub", patch.noteText));
      }
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        deliveryState: aggregate.deliveryState,
        deliveryUpdatedAt: new Date().toISOString(),
        dispatchId: patch.dispatchId || current.dispatchId || "",
        threadKey: patch.threadKey || current.threadKey || "",
        attempt: Number(patch.attempt || current.attempt || 0),
        maxRetries: Number(patch.maxRetries || current.maxRetries || 0),
        nextRetryAt: aggregate.nextRetryAt || patch.nextRetryAt || current.nextRetryAt || "",
        sessionId: patch.sessionId || current.sessionId || "",
        lastError: aggregate.lastError || patch.lastError || "",
        progressPercent: aggregate.progressPercent,
        progressStatus: aggregate.progressStatus,
        progressAt: aggregate.progressAt || current.progressAt || "",
        progressBy: aggregate.progressBy || current.progressBy || "",
        responseRadioId: patch.responseRadioId || current.responseRadioId || "",
        statusRadioId: patch.statusRadioId || current.statusRadioId || "",
        dispatchReportPath: patch.dispatchReportPath || current.dispatchReportPath || "",
        worktree: patch.worktree || current.worktree || null,
        notes
      };
    });
    updated.push(next);
  }
  return updated;
}

function summarizeWorkflowLinkedTaskDelivery(workflow, tasks, patch = {}) {
  const linkedTasks = (workflow.linkedTasks || [])
    .map((id) => tasks.find((task) => task.id === id))
    .filter(Boolean);
  if (linkedTasks.length === 0) {
    return {
      deliveryState: patch.deliveryState || workflow.deliveryState || "",
      progressPercent: workflow.progressPercent ?? null,
      progressStatus: workflow.progressStatus || "",
      progressAt: workflow.progressAt || "",
      progressBy: workflow.progressBy || "",
      lastError: patch.lastError || workflow.lastError || "",
      nextRetryAt: patch.nextRetryAt || workflow.nextRetryAt || ""
    };
  }

  const states = linkedTasks.map((task) => task.deliveryState || "").filter(Boolean);
  const completedCount = linkedTasks.filter((task) => task.status === "done" || task.deliveryState === ASYNC_CALL_STATES.COMPLETED).length;
  const failedTask = linkedTasks.find((task) => [ASYNC_CALL_STATES.ABANDONED, ASYNC_CALL_STATES.FAILED].includes(task.deliveryState));
  const statePriority = [
    ASYNC_CALL_STATES.ABANDONED,
    ASYNC_CALL_STATES.FAILED,
    ASYNC_CALL_STATES.RETRYING,
    ASYNC_CALL_STATES.PROGRESS,
    ASYNC_CALL_STATES.ACKED,
    ASYNC_CALL_STATES.DISPATCHED
  ];
  let deliveryState = statePriority.find((state) => states.includes(state)) || "";
  if (!deliveryState && completedCount === linkedTasks.length) {
    deliveryState = ASYNC_CALL_STATES.COMPLETED;
  } else if (!deliveryState && completedCount > 0) {
    deliveryState = ASYNC_CALL_STATES.PROGRESS;
  } else if (!deliveryState) {
    deliveryState = patch.deliveryState || workflow.deliveryState || "";
  }

  return {
    deliveryState,
    progressPercent: Math.round((completedCount / linkedTasks.length) * 100),
    progressStatus: `${completedCount}/${linkedTasks.length} linked tasks completed`,
    progressAt: patch.progressAt || new Date().toISOString(),
    progressBy: patch.progressBy || patch.tool || "",
    lastError: failedTask?.lastError || patch.lastError || "",
    nextRetryAt: linkedTasks
      .map((task) => task.nextRetryAt || "")
      .filter(Boolean)
      .sort()[0] || patch.nextRetryAt || ""
  };
}

function writeDispatchReportIfUseful(memoryDir, job, result, relayState) {
  const stdout = String(result.stdout || "").trim();
  if (!stdout || !shouldPersistDispatchReport(job, stdout)) {
    return "";
  }
  const idPart = String(job.refId || job.id || "dispatch").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 40);
  const tsPart = new Date().toISOString().replace(/[:.]/g, "-");
  const relativePath = path.join(RESEARCH_REPORTS_DIR, `${tsPart}-${idPart}.md`);
  const file = path.join(memoryDir, relativePath);
  ensureDir(path.dirname(file));
  const lines = [
    `# Dispatch Report: ${job.refId || job.id}`,
    "",
    `- Tool: ${job.tool || "unknown"}`,
    `- Project: ${job.project || ""}`,
    `- Kind: ${job.kind || ""}`,
    `- State: ${relayState || ""}`,
    `- Thread: ${job.thread || ""}`,
    `- Created: ${new Date().toISOString()}`,
    "",
    "## Task",
    "",
    job.text || "",
    "",
    "## Response",
    "",
    stdout,
    ""
  ];
  writeFileAtomic(file, lines.join("\n"), "utf8");
  return relativePath.replace(/\\/g, "/");
}


function updateDispatchSourceState(memoryDir, job, patch) {
  if (!job || !job.refId) {
    return;
  }
  const statePatch = {
    deliveryState: patch.deliveryState || "",
    deliveryUpdatedAt: new Date().toISOString(),
    dispatchId: patch.dispatchId || "",
    threadKey: patch.threadKey || "",
    attempt: Number(patch.attempt || 0),
    maxRetries: Number(patch.maxRetries || 0),
    nextRetryAt: patch.nextRetryAt || "",
    sessionId: patch.sessionId || "",
    lastError: String(patch.lastError || "").trim(),
    progressPercent: patch.progressPercent ?? null,
    progressStatus: patch.progressStatus || "",
    progressAt: patch.progressAt || "",
    progressBy: patch.progressBy || "",
    worktree: patch.worktree || null,
    gateId: patch.gateId || ""
  };
  if (job.kind === "radio") {
    updateRadioMessage(memoryDir, job.refId, statePatch);
    return;
  }
  if (job.kind === "task") {
    const updatedTask = updateTask(memoryDir, job.refId, (task) => ({
      ...task,
      ...statePatch,
      updatedAt: new Date().toISOString()
    }));
    syncLinkedWorkflowDeliveryState(memoryDir, updatedTask, statePatch);
    return;
  }
  if (job.kind === "workflow") {
    updateWorkflow(memoryDir, job.refId, (workflow) => ({
      ...workflow,
      ...statePatch,
      updatedAt: new Date().toISOString()
    }));
  }
}



function isDirectDispatchRadioMessage(message, to = "") {
  if (!isDispatchableRadioMessage(message)) {
    return false;
  }
  if (isClosedDispatchSourceState(message?.deliveryState || message?.status)) {
    return false;
  }
  const target = resolveAgentTarget(message?.to || "");
  if (!target.tool || target.tool === "all") {
    return false;
  }
  const requested = resolveAgentTarget(to || "").tool;
  return requested ? target.tool === requested : true;
}

function isRadioTargetingClosedSession(memoryDir, message) {
  const target = resolveAgentTarget(message?.to || "");
  if (target.kind !== "session" || !target.sessionId) return false;
  const latest = [...readSessions(memoryDir)].reverse().find((session) => (session.id || session.sessionId) === target.sessionId);
  const state = String(latest?.state || latest?.status || "").trim().toLowerCase();
  return ["completed", "delivered", "done", "cancelled", "blocked", "failed", "stale", "dead", "abandoned"].includes(state);
}

function isRadioLinkedToClosedSource(memoryDir, message) {
  if (isRadioTargetingClosedSession(memoryDir, message)) return true;
  const refs = [message?.thread, message?.replyTo]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (refs.length === 0) {
    return false;
  }
  const refSet = new Set(refs);
  const closedTask = readTasks(memoryDir)
    .some((task) => refSet.has(task.id) && isClosedDispatchSourceState(task.status || task.deliveryState));
  if (closedTask) {
    return true;
  }
  return readWorkflows(memoryDir)
    .some((workflow) => refSet.has(workflow.id) && isClosedDispatchSourceState(workflow.status || workflow.deliveryState));
}

function buildDispatchJobs(memoryDir, { to, project, limit, force, respectRecipeDependencies = false }) {
  const relayState = readLatestRelayStatusBySource(memoryDir);
  const dispatched = force ? new Set() : readDispatchLog(memoryDir)
    .filter((item) => item.runnable && item.exitCode === 0)
    .reduce((set, item) => set.add(item.id), new Set());

  // 读取消息并按时间倒序排序（最新的在前）
  const allMessages = readRadioMessages(memoryDir)
    .filter((message) => project ? message.project === project : true)
    .filter((message) => isDirectDispatchRadioMessage(message, to))
    .filter((message) => !isRadioLinkedToClosedSource(memoryDir, message))
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

  // 只取最新的limit条
  const messages = allMessages
    .slice(0, limit)
    .flatMap((message) => {
      const target = resolveAgentTarget(message.to);
      if (target.kind === "tool" && target.tool === "all") {
        const tools = ["codex", "gemini", "claude"];
        return tools
          .filter((tool) => to ? tool === to : true)
          .map((tool) => ({
            id: `radio:${message.id}:${tool}`,
            kind: "radio",
            tool: normalizeToolName(tool),
            project: message.project || "",
            text: message.text,
            refId: message.id,
            thread: message.thread || message.id,
            roles: []
          }));
      }
      return [{
        id: `radio:${message.id}`,
        kind: "radio",
        tool: target.tool,
        sessionId: target.sessionId,
        project: message.project || "",
        text: message.text,
        refId: message.id,
        thread: message.thread || message.id,
        roles: []
      }];
    });
  const allTasks = readTasks(memoryDir);
  const tasks = allTasks
    .filter((task) => !["done", "cancelled", "blocked"].includes(task.status))
    .filter((task) => project ? task.project === project : true)
    .filter((task) => to ? task.assignee === to : Boolean(task.assignee))
    .filter((task) => respectRecipeDependencies ? areTaskRecipeDependenciesSatisfied(task, allTasks) : true)
    .slice(0, limit)
    .map((task) => dispatchJobFromTask(task));
  return [...messages, ...tasks]
    .filter((job) => job.tool)
    .filter((job) => !dispatched.has(job.id))
    .filter((job) => shouldDispatchJob(relayState, job, force))
    .slice(0, limit);
}



function areTaskRecipeDependenciesSatisfied(task, allTasks = []) {
  const deps = Array.isArray(task?.recipeStep?.dependsOn) ? task.recipeStep.dependsOn : [];
  if (deps.length === 0) {
    return true;
  }
  return deps.every((depId) => {
    const dependency = findRecipeStepTask(allTasks, task, depId);
    return Boolean(dependency && isDispatchSourceComplete(dependency));
  });
}


function isDispatchSourceComplete(source) {
  const status = String(source?.status || "").toLowerCase();
  const deliveryState = String(source?.deliveryState || "").toLowerCase();
  return status === "done" || deliveryState === ASYNC_CALL_STATES.COMPLETED;
}


function buildRetryDispatchJobs(memoryDir, relayState, { to, project, limit, respectRecipeDependencies = false }) {
  const now = Date.now();
  const candidates = Object.values(relayState)
    .filter((entry) => isRelayRetryCandidate(entry, now))
    .filter((entry) => isRelayRetryRunnable(entry))
    .filter((entry) => to ? entry.tool === to : true)
    .filter((entry) => project ? entry.project === project : true);

  return candidates
    .map((entry) => {
      const job = rebuildDispatchJobFromRelay(memoryDir, entry, { respectRecipeDependencies });
      const maxRetries = getDispatchJobMaxRetries(job, entry.maxRetries);
      if (!job || !shouldRetryJob(job) || Number(entry.attempt || 0) >= maxRetries) {
        return null;
      }
      return {
        ...job,
        attempt: Number(entry.attempt || 0) + 1,
        maxRetries
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

function rebuildDispatchJobFromRelay(memoryDir, entry, { respectRecipeDependencies = false } = {}) {
  if (entry.sourceKind === "radio") {
    const message = readRadioMessages(memoryDir).find((item) => item.id === entry.sourceId);
    if (!message) return null;
    if (!isDirectDispatchRadioMessage(message, entry.tool || message.to)) return null;
    if (isRadioLinkedToClosedSource(memoryDir, message)) return null;
    return {
      id: `radio:${message.id}`,
      kind: "radio",
      tool: normalizeToolName(entry.tool || message.to),
      project: message.project || "",
      text: message.text,
      refId: message.id,
      thread: message.thread || message.id,
      gateId: entry.gateId || ""
    };
  }
  if (entry.sourceKind === "task") {
    const tasks = readTasks(memoryDir);
    const task = tasks.find((item) => item.id === entry.sourceId);
    if (!task) return null;
    if (isClosedDispatchSourceState(task.status || task.deliveryState)) return null;
    if (respectRecipeDependencies && !areTaskRecipeDependenciesSatisfied(task, tasks)) return null;
    return {
      ...dispatchJobFromTask(task),
      gateId: entry.gateId || ""
    };
  }
  if (entry.sourceKind === "workflow") {
    const workflow = readWorkflows(memoryDir).find((item) => item.id === entry.sourceId);
    if (!workflow) return null;
    if (isClosedDispatchSourceState(workflow.status || workflow.deliveryState)) return null;
    return {
      ...dispatchJobFromWorkflow(workflow, entry.tool || ""),
      gateId: entry.gateId || ""
    };
  }
  return null;
}

function shouldRetryJob(job) {
  if (!job?.tool) {
    return false;
  }
  return !isSharedStateOnlyTool(job.tool);
}

function getRunnerProfile(tool) {
  return RUNNER_PROFILES[normalizeToolName(tool)] || null;
}

function getKnownRunnerToolNames() {
  return Object.keys(RUNNER_PROFILES);
}


// runnerResolutionCache 声明已上移至本文件 main() 调用之前，避免 TDZ

function getToolRunner(tool) {
  const name = normalizeToolName(tool);
  if (runnerResolutionCache.has(name)) {
    return runnerResolutionCache.get(name);
  }
  const result = resolveToolRunnerUncached(name);
  runnerResolutionCache.set(name, result);
  return result;
}

function resolveToolRunnerUncached(name) {
  const profile = getRunnerProfile(name);
  if (!profile) {
    return {
      tool: name,
      available: false,
      reason: `${name || "unknown"} has shared instructions but no verified CLI runner on this machine`
    };
  }
  if (profile.sharedStateOnly) {
    return {
      ...profile,
      available: false,
      sharedStateOnly: true,
      reason: profile.reason || `${profile.tool} is shared-state-only`
    };
  }

  const resolution = resolveRunnerCommand(profile);
  if (!resolution.path) {
    return {
      ...profile,
      available: false,
      reason: `${profile.tool} CLI not found in PATH`,
      commandCandidates: profile.commandCandidates || [profile.command].filter(Boolean),
      resolvedCommands: resolution.allPaths || []
    };
  }
  if (resolution.kind === "powershell-shim") {
    return {
      ...profile,
      available: false,
      reason: `${profile.tool} only resolved to a PowerShell .ps1 shim; install a .cmd/.exe shim or use a direct Node entry point for safe dispatch`,
      commandName: resolution.name,
      commandKind: resolution.kind,
      commandPath: resolution.path,
      resolvedCommands: resolution.allPaths
    };
  }

  const shell = shouldUseShellForCommand(resolution.path);
  return {
    ...profile,
    available: true,
    command: resolution.path,
    commandName: resolution.name,
    commandKind: resolution.kind,
    commandPath: resolution.path,
    resolvedCommands: resolution.allPaths,
    usesShell: shell,
    shell: shell ? "cmd.exe" : "none",
    preview: profile.preview || `${profile.tool} <${profile.promptMode || "argv"}>`
  };
}

function isSharedStateOnlyTool(tool) {
  const profile = getRunnerProfile(tool);
  return Boolean(profile?.sharedStateOnly);
}

function prepareDispatchWorktree(job, { root = "" } = {}) {
  const repoRoot = resolveGitRepositoryRoot(process.cwd());
  const base = runGitCommand(repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const branch = buildDispatchWorktreeBranch(job);
  const worktreeRoot = resolveDispatchWorktreeRoot(repoRoot, root);
  const worktreePath = path.join(worktreeRoot, buildDispatchWorktreeSlug(job));
  assertSafeDispatchWorktreeRoot(repoRoot, worktreeRoot);
  ensureSafeChildPath(worktreePath, worktreeRoot);
  ensureDir(worktreeRoot);

  const exists = fs.existsSync(worktreePath);
  if (!exists) {
    const branchRef = `refs/heads/${branch}`;
    const branchExists = runGitCommand(repoRoot, ["rev-parse", "--verify", branchRef], { allowFailure: true }).ok;
    const args = branchExists
      ? ["worktree", "add", worktreePath, branch]
      : ["worktree", "add", "-b", branch, worktreePath, base];
    runGitCommand(repoRoot, args);
  } else {
    const validation = runGitCommand(worktreePath, ["rev-parse", "--show-toplevel"], { allowFailure: true });
    if (!validation.ok) {
      throw new Error(`Dispatch worktree path already exists but is not a git worktree: ${worktreePath}`);
    }
  }

  const head = runGitCommand(worktreePath, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim() || base;
  return {
    enabled: true,
    repoRoot,
    root: worktreeRoot,
    path: worktreePath,
    branch,
    base,
    head,
    reused: exists,
    createdAt: new Date().toISOString()
  };
}

function collectDispatchWorktreeReviewMetadata(worktree) {
  if (!worktree?.enabled || !worktree.path) {
    return worktree || null;
  }
  const head = runGitCommand(worktree.path, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim() || worktree.head || "";
  const status = runGitCommand(worktree.path, ["status", "--short"], { allowFailure: true }).stdout.trim();
  const diffStat = runGitCommand(worktree.path, ["diff", "--stat"], { allowFailure: true }).stdout.trim();
  return {
    ...worktree,
    head,
    diffStatus: status,
    diffStat,
    hasChanges: Boolean(status || diffStat)
  };
}

function inspectDashboardWorktree(worktree) {
  if (!worktree?.path || !fs.existsSync(worktree.path)) {
    return { ...worktree, exists: false };
  }
  const reviewed = collectDispatchWorktreeReviewMetadata(worktree);
  return {
    ...reviewed,
    exists: true,
    dirty: Boolean(reviewed.hasChanges)
  };
}

function snapshotDashboardWorktree(worktree) {
  if (!worktree?.path || !fs.existsSync(worktree.path)) {
    return buildWorktreeSnapshot(worktree, { exists: false });
  }
  return buildWorktreeSnapshot(worktree, {
    exists: true,
    runGit: (command) => runGitCommand(worktree.path, command.split(" "), { allowFailure: true }).stdout
  });
}


function resolveGitRepositoryRoot(startDir) {
  const result = runGitCommand(startDir, ["rev-parse", "--show-toplevel"]);
  const root = result.stdout.trim();
  if (!root) {
    throw new Error("Unable to resolve git repository root for isolated dispatch worktree.");
  }
  return path.resolve(root);
}

function resolveDispatchWorktreeRoot(repoRoot, rootOption = "") {
  const raw = String(rootOption || DEFAULT_DISPATCH_WORKTREE_DIR).trim();
  return path.resolve(repoRoot, raw);
}





function resolveRunnerCommand(profile) {
  const candidates = profile.commandCandidates || [profile.command].filter(Boolean);
  const allPaths = [];
  for (const candidate of candidates) {
    for (const found of resolveCommandPaths(candidate)) {
      if (!allPaths.includes(found)) {
        allPaths.push(found);
      }
    }
  }
  if (process.platform === "win32" && profile.windowsExeFromCmd) {
    const found = allPaths.find((item) => classifyCommandPath(item) === "cmd-shim");
    if (found) {
      const exe = path.join(path.dirname(found), profile.windowsExeFromCmd);
      if (fs.existsSync(exe) && !allPaths.includes(exe)) {
        allPaths.push(exe);
      }
    }
  }
  const pathValue = choosePreferredCommandPath(allPaths);
  return {
    name: pathValue ? path.basename(pathValue) : "",
    path: pathValue,
    kind: pathValue ? classifyCommandPath(pathValue) : "",
    allPaths
  };
}

function prepareDispatchJobContext(memoryDir, job, runner, options = {}) {
  const initialWorktree = options.isolateWorktree
    ? prepareDispatchWorktree(job, { root: options.worktreeRoot })
    : null;
  const jobWithWorktree = initialWorktree ? { ...job, worktree: initialWorktree } : job;
  const prompt = runner.compactPrompt
    ? renderCompactDispatchPrompt(memoryDir, jobWithWorktree)
    : renderDispatchPrompt(memoryDir, jobWithWorktree);
  const args = buildRunnerArgs(memoryDir, jobWithWorktree, runner, prompt);
  const input = runner.promptMode === "stdin" ? prompt : "";
  const runId = createDispatchRunId(job);
  const cwd = initialWorktree?.path || process.cwd();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const invocation = buildRunnerInvocation(runner, args);
  const supervisor = createSessionSupervisor({ memoryDir });
  const leaseSessionId = job.sessionId || `dispatch:${runId}`;
  supervisor.start({
    sessionId: leaseSessionId,
    tool: job.tool || runner.tool || "unknown",
    project: job.project || "",
    cwd,
    transport: "amh-dispatch"
  });
  return {
    initialWorktree,
    jobWithWorktree,
    args,
    input,
    runId,
    cwd,
    startedAtMs,
    startedAt,
    invocation,
    supervisor,
    leaseSessionId,
    credentialEnv: resolveCredentialEnvironment(memoryDir, job.credentialRefs || job.credentials || [])
  };
}

function finalizeDispatchJob(memoryDir, job, runner, completed, ctx) {
  const { initialWorktree, jobWithWorktree, runId, cwd, startedAtMs, startedAt, invocation, supervisor, leaseSessionId } = ctx;
  const finishedAtMs = Date.now();
  const finishedAt = new Date(finishedAtMs).toISOString();
  const parsed = parseRunnerOutput(memoryDir, jobWithWorktree, runner, completed.stdout);
  const normalizedStderr = normalizeRunnerStderr(job.tool, completed.stderr);
  const stdoutLogPath = writeDispatchRunLog(memoryDir, runId, "stdout", completed.stdout);
  const stderrLogPath = writeDispatchRunLog(memoryDir, runId, "stderr", completed.stderr);
  const runStatus = getDispatchRunStatus(completed);
  const verificationResult = getDispatchRunVerificationResult(runStatus, completed.status);
  const worktree = initialWorktree
    ? collectDispatchWorktreeReviewMetadata(initialWorktree)
    : null;
  const errorSummary = summarizeText(completed.error?.message || normalizedStderr.stderr || "", 220);
  supervisor.finish(leaseSessionId, {
    status: runStatus === "completed" ? "completed" : "failed",
    exitCode: completed.status ?? null,
    error: errorSummary
  });
  const runRecord = {
    runId,
    dispatchId: job.id,
    threadKey: getDispatchThreadKey(job),
    sourceKind: job.kind || "",
    sourceId: job.refId || "",
    tool: job.tool || "",
    project: job.project || "",
    model: job.model || "",
    command: invocation.command,
    commandArgs: invocation.args,
    commandLine: invocation.commandLine,
    cwd,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    timeoutMs: DEFAULT_DISPATCH_RUN_TIMEOUT_MS,
    exitCode: completed.status ?? null,
    status: runStatus,
    errorSummary,
    stdoutLogPath,
    stderrLogPath,
    stdoutBytes: Buffer.byteLength(String(completed.stdout || ""), "utf8"),
    stderrBytes: Buffer.byteLength(String(completed.stderr || ""), "utf8"),
    verificationResult,
    ...(worktree ? { worktree } : {})
  };
  appendDispatchRunRecord(memoryDir, runRecord);
  return {
    ...job,
    runnable: true,
    exitCode: completed.status,
    stdout: trimOutput(parsed.stdout),
    stderr: trimOutput(normalizedStderr.stderr),
    stderrWarnings: normalizedStderr.warnings,
    error: completed.error ? completed.error.message : "",
    sessionId: parsed.sessionId || job.sessionId || "",
    runnerMode: runner.promptMode || "",
    runnerCommand: runner.commandName || runner.command || "",
    runnerShell: runner.usesShell ? runner.shell || "shell" : "",
    runId,
    runStatus,
    runStartedAt: startedAt,
    runFinishedAt: finishedAt,
    runDurationMs: Math.max(0, finishedAtMs - startedAtMs),
    stdoutLogPath,
    stderrLogPath,
    runRecordPath: path.join("state", "dispatch-runs.jsonl").replace(/\\/g, "/"),
    verificationResult,
    ...(worktree ? { worktree } : {})
  };
}

function runDispatchJob(memoryDir, job, runner, options = {}) {
  const ctx = prepareDispatchJobContext(memoryDir, job, runner, options);
  let completed;
  try {
    completed = invokeRunnerCommand(runner, ctx.args, ctx.input, DEFAULT_DISPATCH_RUN_TIMEOUT_MS, ctx.cwd, ctx.credentialEnv);
  } catch (error) {
    ctx.supervisor.finish(ctx.leaseSessionId, { status: "failed", error: error.message });
    throw error;
  }
  return finalizeDispatchJob(memoryDir, job, runner, completed, ctx);
}

async function runDispatchJobAsync(memoryDir, job, runner, options = {}) {
  const ctx = prepareDispatchJobContext(memoryDir, job, runner, options);
  let completed;
  try {
    completed = await invokeRunnerCommandAsync(runner, ctx.args, ctx.input, DEFAULT_DISPATCH_RUN_TIMEOUT_MS, ctx.cwd, ctx.credentialEnv);
  } catch (error) {
    ctx.supervisor.finish(ctx.leaseSessionId, { status: "failed", error: error.message });
    throw error;
  }
  return finalizeDispatchJob(memoryDir, job, runner, completed, ctx);
}

// ── feature ④: concurrent dispatch pool with live status ──────────────────
// Module-level singleton tracking active pool execution for dashboard visibility.
const dispatchPoolState = {
  active: false,
  concurrency: 1,
  total: 0,
  completed: 0,
  failed: 0,
  running: [],
  finished: [],
  startedAt: null,
  finishedAt: null,
  lastError: null
};

function resetDispatchPoolState(concurrency, total) {
  dispatchPoolState.active = true;
  dispatchPoolState.concurrency = concurrency;
  dispatchPoolState.total = total;
  dispatchPoolState.completed = 0;
  dispatchPoolState.failed = 0;
  dispatchPoolState.running = [];
  dispatchPoolState.finished = [];
  dispatchPoolState.startedAt = new Date().toISOString();
  dispatchPoolState.finishedAt = null;
  dispatchPoolState.lastError = null;
}

function markDispatchPoolJobStart(jobInfo) {
  dispatchPoolState.running.push(jobInfo);
}

function markDispatchPoolJobDone(runId, status, durationMs) {
  dispatchPoolState.running = dispatchPoolState.running.filter((j) => j.runId !== runId);
  dispatchPoolState.finished.push({ runId, status, durationMs, finishedAt: new Date().toISOString() });
  dispatchPoolState.completed++;
  if (status !== "completed") dispatchPoolState.failed++;
}

function markDispatchPoolFinished(lastError = null) {
  dispatchPoolState.active = false;
  dispatchPoolState.running = [];
  dispatchPoolState.finishedAt = new Date().toISOString();
  dispatchPoolState.lastError = lastError;
}

function getDispatchPoolSnapshot() {
  return {
    active: dispatchPoolState.active,
    concurrency: dispatchPoolState.concurrency,
    total: dispatchPoolState.total,
    completed: dispatchPoolState.completed,
    failed: dispatchPoolState.failed,
    pending: Math.max(0, dispatchPoolState.total - dispatchPoolState.completed),
    running: dispatchPoolState.running.slice(),
    finished: dispatchPoolState.finished.slice(-20),
    startedAt: dispatchPoolState.startedAt,
    finishedAt: dispatchPoolState.finishedAt,
    lastError: dispatchPoolState.lastError
  };
}

/**
 * Run an array of prepared dispatch jobs through a bounded-concurrency pool.
 * Each entry in `preparedJobs` is { job, runner, options }.
 * Returns results in the same order as input (order-preserving).
 */
async function runDispatchPool(memoryDir, preparedJobs, { concurrency = DISPATCH_MAX_CONCURRENCY } = {}) {
  const limit = Math.max(1, Math.min(concurrency || 1, preparedJobs.length || 1));
  resetDispatchPoolState(limit, preparedJobs.length);
  const results = new Array(preparedJobs.length);
  let cursor = 0;
  let poolError = null;

  async function worker() {
    while (cursor < preparedJobs.length) {
      const idx = cursor++;
      const { job, runner, options } = preparedJobs[idx];
      const runId = createDispatchRunId(job);
      const jobInfo = {
        runId,
        dispatchId: job.id,
        tool: job.tool || "",
        project: job.project || "",
        startedAt: new Date().toISOString()
      };
      markDispatchPoolJobStart(jobInfo);
      try {
        // eslint-disable-next-line no-await-in-loop -- pool worker loop
        const result = await runDispatchJobAsync(memoryDir, job, runner, options);
        markDispatchPoolJobDone(runId, result.runStatus || (result.exitCode === 0 ? "completed" : "failed"), result.runDurationMs || 0);
        results[idx] = result;
      } catch (error) {
        markDispatchPoolJobDone(runId, "failed", 0);
        poolError = poolError || error;
        results[idx] = {
          ...job,
          runnable: true,
          exitCode: -1,
          runId,
          runStatus: "failed",
          error: error.message,
          runStartedAt: jobInfo.startedAt,
          runFinishedAt: new Date().toISOString()
        };
      }
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  markDispatchPoolFinished(poolError?.message || null);
  return results;
}

function buildRunnerInvocation(runner, args = []) {
  const useCmdLauncher = process.platform === "win32" && runner.usesShell;
  const command = useCmdLauncher ? buildWindowsCmdLine(runner.command, args) : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  return {
    command: runner.commandName || runner.command || "",
    args: args.map((arg) => String(arg)),
    commandLine: [command, ...commandArgs].filter(Boolean).join(" "),
    usesShell: useCmdLauncher
  };
}

function resolveCredentialEnvironment(memoryDir, references = []) {
  const env = {};
  for (const reference of Array.isArray(references) ? references : []) {
    const id = typeof reference === "string" ? reference : reference?.id;
    const envName = typeof reference === "string" ? id : reference?.envVar || id;
    if (!id || !envName) continue;
    env[envName] = resolveCredential(memoryDir, id);
  }
  return env;
}
function invokeRunnerCommand(runner, args = [], input = "", timeoutMs = DEFAULT_DISPATCH_RUN_TIMEOUT_MS, cwd = process.cwd(), credentialEnv = {}) {
  const invocation = buildRunnerInvocation(runner, args);
  const useCmdLauncher = invocation.usesShell;
  const command = useCmdLauncher ? invocation.commandLine : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    shell: useCmdLauncher,
    input,
    env: { ...process.env, ...credentialEnv }
  });
}

// Async twin of invokeRunnerCommand for the concurrent dispatch pool (feature ④).
// Uses non-blocking spawn so multiple tool runners can execute in parallel. Retries
// only transient transport errors (spawn/connection), never logical exit failures.
async function invokeRunnerCommandAsync(runner, args = [], input = "", timeoutMs = DEFAULT_DISPATCH_RUN_TIMEOUT_MS, cwd = process.cwd(), credentialEnv = {}, { transientRetries = 2, transientBackoffMs = 500 } = {}) {
  const invocation = buildRunnerInvocation(runner, args);
  const useCmdLauncher = invocation.usesShell;
  const command = useCmdLauncher ? invocation.commandLine : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  let lastError;
  for (let attempt = 0; attempt <= transientRetries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential retry, not parallel
      const completed = await new Promise((resolve, reject) => {
        let child;
        try {
          child = spawn(command, commandArgs, {
            cwd,
            env: { ...process.env, ...credentialEnv },
            windowsHide: true,
            shell: useCmdLauncher
          });
        } catch (spawnErr) {
          reject(spawnErr);
          return;
        }
        let stdout = "";
        let stderr = "";
        if (child.stdout) {
          child.stdout.setEncoding("utf8").on("data", (d) => { stdout += d; });
        }
        if (child.stderr) {
          child.stderr.setEncoding("utf8").on("data", (d) => { stderr += d; });
        }
        if (input && child.stdin) {
          try { child.stdin.end(input); } catch {}
        }
        const timer = setTimeout(() => {
          try { child.kill("SIGKILL"); } catch {}
          resolve({ status: null, signal: "SIGKILL", stdout, stderr, error: { message: `Runner exceeded ${timeoutMs}ms timeout` } });
        }, timeoutMs);
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on("close", (code, signal) => {
          clearTimeout(timer);
          resolve({ status: code, signal, stdout, stderr, error: null });
        });
      });
      return completed;
    } catch (error) {
      lastError = error;
      const text = String(error?.code || error?.message || "");
      const transient = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPERM|EPIPE|ENOENT/i.test(text);
      if (!transient || attempt === transientRetries) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, transientBackoffMs * (attempt + 1)));
    }
  }
  throw lastError;
}



function normalizeRunnerStderr(tool, stderr) {
  const text = String(stderr || "");
  if (!text.trim()) {
    return { stderr: "", warnings: [] };
  }
  const lines = text.split(/\r?\n/);
  const warnings = [];
  const kept = [];
  for (const line of lines) {
    if (tool === "gemini" && isKnownGeminiWarning(line)) {
      warnings.push(line.trim());
      continue;
    }
    kept.push(line);
  }
  return {
    stderr: kept.join("\n").trim(),
    warnings: warnings.filter(Boolean)
  };
}




function parseRunnerOutput(memoryDir, job, runner, stdout) {
  if (runner.outputMode !== "claude-json") {
    return { stdout, sessionId: "" };
  }
  const text = String(stdout || "").trim();
  if (!text) {
    return { stdout: "", sessionId: "" };
  }
  try {
    const payload = JSON.parse(text);
    const sessionId = payload.session_id || "";
    if (sessionId && job.thread) {
      writeClaudeSessionState(memoryDir, job, sessionId);
    }
    return {
      stdout: payload.result || text,
      sessionId
    };
  } catch {
    return { stdout: text, sessionId: "" };
  }
}





function renderDispatchQualityGate(job) {
  const gate = normalizeQualityGate(job?.qualityGate || {});
  const lines = [];
  if (job?.recipe?.name) {
    lines.push(`- Recipe: ${job.recipe.name}${job.recipe.version ? `@${job.recipe.version}` : ""}`);
  }
  if (job?.recipeStep?.id) {
    const deps = Array.isArray(job.recipeStep.dependsOn) && job.recipeStep.dependsOn.length > 0
      ? `; depends on ${job.recipeStep.dependsOn.join(", ")}`
      : "";
    lines.push(`- Recipe step: ${job.recipeStep.id}${job.recipeStep.role ? ` (${job.recipeStep.role})` : ""}${deps}`);
  }
  if (typeof gate.reviewRequired === "boolean") {
    lines.push(`- Review required: ${gate.reviewRequired ? "yes" : "no"}`);
  }
  if (Number.isInteger(gate.maxRepairAttempts)) {
    lines.push(`- Max repair attempts: ${gate.maxRepairAttempts}`);
  }
  if (Array.isArray(gate.stopWhen) && gate.stopWhen.length > 0) {
    lines.push(`- Stop when: ${gate.stopWhen.join("; ")}`);
  }
  if (Array.isArray(gate.allowedActions) && gate.allowedActions.length > 0) {
    lines.push(`- Allowed actions: ${gate.allowedActions.join("; ")}`);
  }
  if (Array.isArray(gate.forbiddenActions) && gate.forbiddenActions.length > 0) {
    lines.push(`- Forbidden actions: ${gate.forbiddenActions.join("; ")}`);
  }
  if (Array.isArray(gate.reviewDimensions) && gate.reviewDimensions.length > 0) {
    lines.push(`- Review dimensions: ${gate.reviewDimensions.join("; ")}`);
  }
  if (gate.adversarialVerifier?.enabled) {
    lines.push("- Adversarial verifier: enabled; actively try to find a counterexample before reporting success.");
    if (gate.adversarialVerifier.checks.length > 0) {
      lines.push(`- Adversarial checks: ${gate.adversarialVerifier.checks.join("; ")}`);
    }
  }
  if (Array.isArray(gate.verifyCommands) && gate.verifyCommands.length > 0) {
    lines.push("- Verification commands:");
    for (const command of gate.verifyCommands) {
      lines.push(`  - ${formatDispatchVerifyCommand(command)}`);
    }
  }
  if (lines.length > 0) {
    lines.push("- If a stop condition or forbidden action is required, stop and write a task note instead of proceeding.");
  }
  return lines;
}



function renderDispatchPrompt(memoryDir, job) {
  const qualityGateLines = renderDispatchQualityGate(job);
  const worktreeLines = renderDispatchWorktree(job.worktree);
  return [
    `__AI_MEMORY_THREAD__: ${getDispatchThreadKey(job)}`,
    `Dispatch target: ${job.tool}`,
    `Project: ${job.project || "(none)"}`,
    `Kind: ${job.kind}`,
    `Ref: ${job.refId}`,
    "",
    "Instructions:",
    "- Continue the existing thread context if this dispatch resumes a prior session.",
    "- Do the dispatched task directly. Do not introduce yourself, list tools, or ask what to work on.",
    "- Keep the response compact: at most 6 short bullets or 1 short paragraph.",
    "- If the payload asks for a design or plan, return concrete steps and state transitions.",
    "- For work expected to take longer than 30 seconds, report heartbeat/progress with: ai-memory-hub dispatch progress --thread-key " + getDispatchThreadKey(job) + " --percent <0-100> --status \"short status\" --by " + (job.tool || "tool"),
    "- If you need to mention follow-up, end with a single 'Next:' line.",
    "",
    ...(qualityGateLines.length > 0 ? [
      "Quality gate:",
      ...qualityGateLines,
      ""
    ] : []),
    ...(worktreeLines.length > 0 ? [
      "Execution isolation:",
      ...worktreeLines,
      ""
    ] : []),
    "Autonomous safety rules:",
    "- Follow the user's current guardrails, project instructions, and repository policy.",
    "- Do not run git push, delete files, run destructive cleanup, install dependencies, or change system configuration unless this dispatch payload explicitly authorizes it.",
    "- Local git commits are allowed only when current user/project rules allow them and the work has passed verification.",
    "- For important code changes, run focused tests and request cross-AI review when available before closing the source task.",
    "",
    "Payload:",
    job.text
  ].join("\n");
}

function renderCompactDispatchPrompt(memoryDir, job) {
  const qualityGateLines = renderDispatchQualityGate(job);
  const worktreeLines = renderDispatchWorktree(job.worktree);
  const parts = [
    `Payload: ${job.text}`,
    "Instruction: Do this AI Memory Hub dispatch payload directly; keep the response compact; do not ask what to work on.",
    qualityGateLines.length > 0 ? `Quality gate: ${qualityGateLines.join("; ")}` : "",
    worktreeLines.length > 0 ? `Execution isolation: ${worktreeLines.join("; ")}` : "",
    "Safety: Do not run git push, delete files, run destructive cleanup, install dependencies, or change system configuration unless explicitly authorized in the payload. If you cannot proceed, say exactly what configuration or input is missing.",
    `AMH metadata: thread=${getDispatchThreadKey(job)} project=${job.project || "(none)"} ref=${job.refId}`
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}





function writeDispatchRunLog(memoryDir, runId, stream, text) {
  const safeRunId = String(runId || "run").replace(/[^a-zA-Z0-9_.-]+/g, "-");
  const safeStream = stream === "stderr" ? "stderr" : "stdout";
  const relativePath = path.join(DISPATCH_RUNS_DIR, `${safeRunId}.${safeStream}.log`);
  const file = path.join(memoryDir, relativePath);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, String(text || ""), "utf8");
  return relativePath.replace(/\\/g, "/");
}









function getDispatchJobMaxRetries(job, fallback = DEFAULT_DISPATCH_MAX_RETRIES) {
  const gateLimit = normalizeNonNegativeInteger(job?.qualityGate?.maxRepairAttempts);
  if (gateLimit !== null) {
    return gateLimit;
  }
  return normalizeDispatchRetryLimit(fallback);
}

function normalizeDispatchRetryLimit(value) {
  const limit = normalizeNonNegativeInteger(value);
  return limit !== null ? limit : DEFAULT_DISPATCH_MAX_RETRIES;
}

function computeNextRetryAt(attempt, maxRetries = DEFAULT_DISPATCH_MAX_RETRIES) {
  const limit = normalizeDispatchRetryLimit(maxRetries);
  if (Number(attempt || 0) >= limit) {
    return "";
  }
  const delays = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];
  const delayMs = delays[Math.max(0, Number(attempt || 1) - 1)] || delays[delays.length - 1];
  return new Date(Date.now() + delayMs).toISOString();
}

function getRelayFailureState(attempt, maxRetries = DEFAULT_DISPATCH_MAX_RETRIES) {
  return Number(attempt || 0) >= normalizeDispatchRetryLimit(maxRetries) ? "abandoned" : "failed";
}

// Fingerprint a failed attempt by its observable outcome (exit code + error text),
// normalizing volatile substrings (timestamps, hex ids) so two structurally
// identical failures hash the same. Used to detect oscillation across attempts.

// Count how many of the most recent consecutive failed attempts for this job's
// source share the given fingerprint. A run of identical failures signals the
// dispatch loop is oscillating rather than making progress.

// Decide the terminal/retry state for a failed dispatch, abandoning early when
// the same failure has now repeated past the oscillation threshold.
function getRelayFailureStateWithOscillation(memoryDir, job, attempt, maxRetries, fingerprint) {
  const baseState = getRelayFailureState(attempt, maxRetries);
  if (baseState === "abandoned") {
    return { state: baseState, oscillating: false };
  }
  // +1 for the current attempt about to be recorded.
  const repeated = countRecentRelayOscillation(memoryDir, job, fingerprint) + 1;
  if (repeated >= DISPATCH_OSCILLATION_THRESHOLD) {
    return { state: "abandoned", oscillating: true, repeated };
  }
  return { state: baseState, oscillating: false };
}

function isValidAsyncCallState(state) {
  return Object.values(ASYNC_CALL_STATES).includes(state);
}

function isValidAsyncCallTransition(fromState, toState) {
  if (!isValidAsyncCallState(fromState) || !isValidAsyncCallState(toState)) {
    return false;
  }
  const allowedTransitions = ASYNC_CALL_TRANSITIONS[fromState] || [];
  return allowedTransitions.includes(toState);
}


function isRelayRetryDue(entry) {
  if (!entry || entry.state !== ASYNC_CALL_STATES.FAILED || !entry.nextRetryAt) {
    return false;
  }
  const nextRetryMs = Date.parse(entry.nextRetryAt);
  if (Number.isNaN(nextRetryMs)) {
    return false;
  }
  return nextRetryMs <= Date.now() && Number(entry.attempt || 0) < normalizeDispatchRetryLimit(entry.maxRetries);
}

function isRelayRetryRunnable(entry) {
  return !isSharedStateOnlyTool(entry?.tool || "");
}

function isRelayRetryCandidate(entry, now = Date.now()) {
  if (!entry) {
    return false;
  }
  // Phase 2: approval-required is retryable once gate is approved
  if (entry.state === "approval-required") {
    return true;
  }
  if (entry.state === ASYNC_CALL_STATES.FAILED) {
    if (!entry.nextRetryAt) {
      return false;
    }
    const nextRetryMs = Date.parse(entry.nextRetryAt);
    return !Number.isNaN(nextRetryMs) && nextRetryMs <= now;
  }
  return isRelayTimedOut(entry, now);
}

function appendRelayStatus(memoryDir, job, patch = {}) {
  const now = new Date().toISOString();
  const nextState = patch.state || ASYNC_CALL_STATES.PENDING;

  appendJsonl(path.join(memoryDir, "state", "relay-status.jsonl"), {
    id: createId(`relay:${job.id}:${now}:${nextState}`),
    ts: now,
    threadKey: getDispatchThreadKey(job),
    sourceKind: job.kind,
    sourceId: job.refId,
    dispatchId: job.id,
    state: nextState,
    attempt: Number(patch.attempt || 1),
    maxRetries: normalizeDispatchRetryLimit(patch.maxRetries),
    dispatchedAt: patch.state === ASYNC_CALL_STATES.DISPATCHED ? now : "",
    ackTimeout: Number(patch.ackTimeout || 0),
    sessionId: patch.sessionId || "",
    exitCode: patch.exitCode ?? null,
    lastError: String(patch.lastError || "").trim(),
    progressPercent: patch.progressPercent ?? null,
    progressStatus: String(patch.progressStatus || "").trim(),
    progressAt: patch.progressAt || "",
    progressBy: patch.progressBy || "",
    nextRetryAt: patch.nextRetryAt || "",
    worktree: patch.worktree || null,
    fingerprint: patch.fingerprint || "",
    oscillating: patch.oscillating === true,
    project: job.project || "",
    tool: job.tool || "",
    thread: job.thread || "",
    gateId: patch.gateId || ""
  });
}



function appendDispatchResponseMessage(memoryDir, job, result) {
  const origin = findDispatchOrigin(memoryDir, job);
  if (!origin?.from || !result.stdout) {
    return null;
  }
  const message = createRadioMessage({
    from: job.tool || "unknown",
    to: origin.from,
    type: "response",
    text: trimOutput(result.stdout),
    thread: origin.thread || job.thread || job.refId,
    replyTo: origin.id || job.refId,
    project: origin.project || job.project || ""
  });
  appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), message);
  return message;
}

function appendDispatchStatusMessage(memoryDir, job, result) {
  const origin = findDispatchOrigin(memoryDir, job);
  if (!origin?.from) {
    return null;
  }
  const state = result.relayState || (result.exitCode === 0 ? "completed" : "failed");
  const parts = [
    `Dispatch ${state} for ${job.tool}`,
    `thread=${job.thread || job.refId}`
  ];
  if (result.sessionId) {
    parts.push(`session=${result.sessionId}`);
  }
  if (result.exitCode !== null && result.exitCode !== undefined) {
    parts.push(`exit=${result.exitCode}`);
  }
  if (result.error) {
    parts.push(`error=${summarizeText(result.error, 120)}`);
  }
  const message = createRadioMessage({
    from: "ai-memory-hub",
    to: origin.from,
    type: "status",
    text: parts.join(" | "),
    thread: origin.thread || job.thread || job.refId,
    replyTo: origin.id || job.refId,
    project: origin.project || job.project || ""
  });
  appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), message);
  return message;
}

function findDispatchOrigin(memoryDir, job) {
  if (job.kind === "radio") {
    return readRadioMessages(memoryDir).find((message) => message.id === job.refId) || null;
  }
  if (job.kind === "task") {
    const task = readTasks(memoryDir).find((item) => item.id === job.refId);
    if (!task) {
      return null;
    }
    return {
      id: task.id,
      from: task.createdBy,
      thread: task.id,
      project: task.project
    };
  }
  if (job.kind === "workflow") {
    const workflow = readWorkflows(memoryDir).find((item) => item.id === job.refId);
    if (!workflow) {
      return null;
    }
    return {
      id: workflow.id,
      from: workflow.createdBy,
      thread: workflow.id,
      project: workflow.project
    };
  }
  return null;
}

function syncCommand(argv) {
  const dryRun = hasFlag(argv, "--dry-run");
  const allowSensitive = hasFlag(argv, "--allow-sensitive") || hasFlag(argv, "--force");
  const config = loadConfig();
  ensureHub(config.memoryDir);

  if (!dryRun) {
    return withHubLock(config.memoryDir, "sync", () => syncIndexedEvents(config, dryRun, allowSensitive), config.sync.lockStaleMs);
  }
  return syncIndexedEvents(config, dryRun, allowSensitive);
}

function syncIndexedEvents(config, dryRun, allowSensitive = false) {
  const inboxPath = path.join(config.memoryDir, "inbox", "events.jsonl");
  const eventEntries = readEventsWithLocations(inboxPath);
  const events = eventEntries.map((entry) => entry.event);
  const backupRun = dryRun
    ? null
    : runAutomaticBackupStrategy(config, {
      trigger: "sync",
      includePreSync: events.length > 0
  });
  if (events.length === 0) {
    if (!dryRun) {
      rebuildMemoryOutputs(config, readLedger(config.memoryDir));
    }
    const projections = dryRun ? null : rebuildEventSourcedProjections(config.memoryDir);
    console.log("No pending memory events.");
    if (projections) {
      console.log(`Rebuilt event-sourced projections: tasks=${projections.tasks}, workflows=${projections.workflows}, projects=${projections.projects}.`);
    }
    if (backupRun?.created.length) {
      console.log(`Created ${backupRun.created.length} scheduled backup(s).`);
    }
    return;
  }

  const backup = backupRun?.preSync || null;
  let synced = 0;
  const remaining = [];
  const ledger = readLedger(config.memoryDir);
  const knownIds = new Set(ledger.map((item) => item.localEventId || item.id).filter(Boolean));
  const newRecords = [];

  for (const entry of eventEntries) {
    const event = entry.event;
    const normalizedEvent = normalizeMemoryEvent(event);
    let skipReason = getMemoryEventSkipReason(normalizedEvent);
    if (skipReason === "looks sensitive" && allowSensitive) {
      skipReason = "";
    }
    if (skipReason) {
      console.log(`Skipped event ${event.id || "(no id)"} at ${formatEventLocation(entry)}: ${skipReason}.`);
      remaining.push(event);
      continue;
    }

    const localEventId = normalizedEvent.id || createId(normalizedEvent.text);
    if (knownIds.has(localEventId)) {
      synced++;
      continue;
    }

    const record = {
      id: createId(`memory:${localEventId}:${normalizedEvent.text}`),
      localEventId,
      schemaVersion: 2,
      ts: normalizedEvent.ts || new Date().toISOString(),
      indexedAt: new Date().toISOString(),
      source: normalizedEvent.source || "unknown",
      text: String(normalizedEvent.text).trim(),
      kind: normalizedEvent.metadata?.kind || "note",
      project: normalizedEvent.metadata?.project || "",
      tags: normalizedEvent.metadata?.tags || [],
      scope: normalizedEvent.metadata?.scope || "",
      refs: normalizedEvent.metadata?.refs || {},
      confidence: normalizedEvent.metadata?.confidence ?? 1,
      device: normalizedEvent.device || normalizedEvent.metadata?.device || os.hostname(),
      metadata: normalizedEvent.metadata || {}
    };

    if (dryRun) {
      console.log(`[dry-run] Would index: ${record.text}`);
      synced++;
      continue;
    }

    appendJsonl(path.join(config.memoryDir, "memories", "ledger.jsonl"), record);
    recordMemoryRelations(config.memoryDir, record);
    newRecords.push(record);
    knownIds.add(localEventId);
    synced++;
  }

  if (!dryRun) {
    const updatedLedger = [...ledger, ...newRecords];
    rebuildMemoryOutputs(config, updatedLedger);
    const projections = rebuildEventSourcedProjections(config.memoryDir);
    writeJson(path.join(config.memoryDir, "state", "last-sync.json"), {
      syncedAt: new Date().toISOString(),
      indexed: newRecords.length,
      pending: remaining.length,
      projections,
      backupDir: backup?.dir || "",
      backups: backupRun
        ? {
          created: backupRun.created.map((item) => ({
            reason: item.reason,
            dir: item.dir,
            retention: item.retention
          })),
          pruned: backupRun.pruned?.pruned || []
        }
        : null
    });
    if (config.sync.archiveIndexedInboxItems !== false) {
      archiveInbox(config.memoryDir, events.filter((event) => !remaining.includes(event)));
    }
    writeInboxEvents(inboxPath, remaining);
  }

  console.log(`Indexed ${synced} memory event(s) into the local hub.`);
  if (!dryRun) {
    const lastSync = readJson(path.join(config.memoryDir, "state", "last-sync.json"));
    if (lastSync.projections) {
      console.log(`Rebuilt event-sourced projections: tasks=${lastSync.projections.tasks}, workflows=${lastSync.projections.workflows}, projects=${lastSync.projections.projects}.`);
    }
  }
}

function indexCommand() {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "index", () => {
    const ledger = readLedger(config.memoryDir);
    rebuildMemoryOutputs(config, ledger);
    console.log(`Rebuilt memory index for ${ledger.length} record(s).`);
  }, config.sync.lockStaleMs);
}





function printMemorySearchResults(results, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const item of results) {
    const kind = item.metadata?.kind || "note";
    const topics = (item.topics || []).slice(0, 4).join(",");
    const refs = formatMemoryRefs(item.refs);
    const project = item.project ? `project=${item.project} ` : "";
    const tags = item.tags?.length ? `tags=${item.tags.slice(0, 5).join(",")} ` : "";
    console.log(`[${item.score.toFixed(2)}] ${item.source}/${kind} ${project}${tags}${topics ? `(${topics}) ` : ""}${refs ? `[${refs}] ` : ""}${item.text}`);
  }
}

function snapshotCommand(argv) {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const rawLimit = getOption(argv, "--limit");
  const limit = rawLimit ? parsePositiveIntegerOption(rawLimit, "--limit") : 0;
  const filters = parseMemoryFilters(argv);
  const baseIndex = buildMemoryIndex(readLedger(config.memoryDir), config);
  const records = filterMemoryRecords(baseIndex.records, filters);
  const index = hasMemoryFilters(filters) ? buildMemoryIndex(records, config) : baseIndex;
  console.log(renderMemorySnapshot(index, config, {
    limit,
    filterSummary: formatMemoryFilterSummary(filters)
  }));
}


function pullCommand() {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "pull", () => {
    const ledger = readLedger(config.memoryDir);
    const backup = backupHub(config.memoryDir, "pre-pull");
    rebuildMemoryOutputs(config, ledger);
    writeJson(path.join(config.memoryDir, "state", "last-pull.json"), {
      pulledAt: new Date().toISOString(),
      count: ledger.length,
      backupDir: backup.dir
    });

    console.log(`Rebuilt MEMORY.md, INDEX.md, and memories/index.json from ${ledger.length} local memory record(s).`);
  }, config.sync.lockStaleMs);
}





function watchCommand(argv) {
  const intervalMs = Number(getOption(argv, "--interval-ms") || 30000);
  const config = loadConfig();
  ensureHub(config.memoryDir);

  console.log(`Watching ${path.join(config.memoryDir, "inbox")} every ${intervalMs}ms. Press Ctrl+C to stop.`);
  const tick = () => {
    try {
      const inboxPath = path.join(config.memoryDir, "inbox", "events.jsonl");
      const events = readEvents(inboxPath);
      if (events.length > 0) {
        syncCommand([]);
      }
    } catch (error) {
      console.error(`[watch] ${error.message || error}`);
    }
  };

  tick();
  setInterval(tick, intervalMs);
}

function getSkillCandidatesFile(memoryDir) {
  return path.join(memoryDir, "prompts", SKILL_CANDIDATE_FILE);
}

function readSkillCandidates(memoryDir) {
  const file = getSkillCandidatesFile(memoryDir);
  return fs.existsSync(file) ? readEvents(file) : [];
}

function appendSkillCandidates(memoryDir, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const existing = readSkillCandidates(memoryDir);
  const existingIds = new Set(existing.map((candidate) => candidate.id));
  const fresh = candidates.filter((candidate) => !existingIds.has(candidate.id));
  if (fresh.length === 0) return [];
  const file = getSkillCandidatesFile(memoryDir);
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, fresh.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n", "utf8");
  return fresh;
}

function updateSkillCandidate(memoryDir, id, updater) {
  const candidates = readSkillCandidates(memoryDir);
  const index = candidates.findIndex((candidate) => candidate.id === id || candidate.id.startsWith(id));
  if (index === -1) throw new Error(`Skill candidate not found: ${id}`);
  candidates[index] = updater(candidates[index]);
  const file = getSkillCandidatesFile(memoryDir);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, candidates.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n", "utf8");
  return candidates[index];
}


function packCommand(argv) {
  const action = argv[0] || "list";
  const config = loadConfig();
  ensureHub(config.memoryDir);
  if (action === "list") { console.log(JSON.stringify(listPacks(config.memoryDir), null, 2)); return; }
  if (action === "discover") {
    const roots = argv.slice(1).filter((item) => item !== "--path");
    console.log(JSON.stringify(discoverPacks(config.memoryDir, roots), null, 2)); return;
  }
  if (action === "add") {
    const root = getOption(argv.slice(1), "--path") || argv[1] || "";
    if (!root) throw new Error("Usage: ai-memory-hub pack add --path <pack-directory>");
    console.log(JSON.stringify(addPack(config.memoryDir, root), null, 2)); return;
  }
  const id = getOption(argv.slice(1), "--id") || argv[1] || "";
  if (!id) throw new Error(`Usage: ai-memory-hub pack ${action} <id>`);
  if (action === "enable") console.log(JSON.stringify(setPackEnabled(config.memoryDir, id, true), null, 2));
  else if (action === "disable") console.log(JSON.stringify(setPackEnabled(config.memoryDir, id, false), null, 2));
  else if (action === "validate") console.log(JSON.stringify(validateRegisteredPack(config.memoryDir, id), null, 2));
  else if (action === "show") console.log(JSON.stringify(listPacks(config.memoryDir).find((item) => item.id === id || item.id.startsWith(id)) || null, null, 2));
  else throw new Error("Usage: ai-memory-hub pack add|list|show|enable|disable|validate|discover");
}

async function mcpCommand(argv) {
  const action = argv[0] || "list";
  if (action === "--help" || action === "-h") {
    console.log("Usage: ai-memory-hub mcp list|import|diff|sync|remove|status [--app <client>] [--apply] [--force]");
    return;
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const app = getOption(argv.slice(1), "--app");
  const apps = app ? [app] : ["claude", "codex", "gemini", "opencode"];
  const homeDir = os.homedir();
  if (action === "list") console.log(JSON.stringify(await listExtensions(config.memoryDir), null, 2));
  else if (action === "import") console.log(JSON.stringify(await importExtensions(config.memoryDir, { apps, homeDir }), null, 2));
  else if (action === "diff") console.log(JSON.stringify(await diffExtensions(config.memoryDir, { apps, homeDir }), null, 2));
  else if (action === "sync") console.log(JSON.stringify(await syncExtensions(config.memoryDir, { apps, homeDir, apply: argv.includes("--apply"), force: argv.includes("--force") }), null, 2));
  else if (action === "remove") {
    const id = argv[1];
    if (!id) throw new Error("Usage: ai-memory-hub mcp remove <id> [--app <client>] [--apply]");
    console.log(JSON.stringify(await removeExtensions(config.memoryDir, id, { apps, apply: argv.includes("--apply") }), null, 2));
  }
  else if (action === "status") console.log(JSON.stringify(await statusExtensions(config.memoryDir, { apps, homeDir }), null, 2));
  else throw new Error("Usage: ai-memory-hub mcp list|import|diff|sync|remove|status [--app <client>] [--apply] [--force]");
}


function getSkillDeltasFile(memoryDir) {
  return path.join(memoryDir, "prompts", SKILL_DELTA_FILE);
}

function readSkillDeltas(memoryDir) {
  const file = getSkillDeltasFile(memoryDir);
  if (!fs.existsSync(file)) return [];
  return readEvents(file);
}


function approveSkillDelta(memoryDir, id, reviewer) {
  const deltas = readSkillDeltas(memoryDir);
  const index = deltas.findIndex((d) => d.id === id || d.id.startsWith(id));
  if (index === -1) throw new Error(`Skill delta not found: ${id}`);
  deltas[index].status = "approved";
  deltas[index].reviewedBy = reviewer;
  deltas[index].reviewedAt = new Date().toISOString();
  writeSkillDeltas(memoryDir, deltas);
  return deltas[index];
}

function rejectSkillDelta(memoryDir, id, reviewer, reason) {
  const deltas = readSkillDeltas(memoryDir);
  const index = deltas.findIndex((d) => d.id === id || d.id.startsWith(id));
  if (index === -1) throw new Error(`Skill delta not found: ${id}`);
  deltas[index].status = "rejected";
  deltas[index].reviewedBy = reviewer;
  deltas[index].reviewedAt = new Date().toISOString();
  if (reason) deltas[index].rejectReason = reason;
  writeSkillDeltas(memoryDir, deltas);
  return deltas[index];
}

function mergeSkillDelta(memoryDir, id) {
  const deltas = readSkillDeltas(memoryDir);
  const index = deltas.findIndex((d) => d.id === id || d.id.startsWith(id));
  if (index === -1) throw new Error(`Skill delta not found: ${id}`);
  const delta = deltas[index];
  if (delta.status !== "approved") {
    throw new Error(`Delta must be approved before merging. Current status: ${delta.status}`);
  }

  // Find and update the skill template
  const toolName = delta.tool;
  const templateDir = path.join(__dirname, "..", "templates");
  const possibleFiles = [
    path.join(templateDir, `${toolName.toUpperCase()}.md`),
    path.join(templateDir, `${toolName.toUpperCase()}_SKILL.md`),
    path.join(templateDir, "shared-skill-layer.md"),
    path.join(templateDir, "shared-instructions.md")
  ];

  let merged = false;
  for (const file of possibleFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (delta.original && content.includes(delta.original)) {
      const updated = content.replace(delta.original, delta.proposed);
      writeFileAtomic(file, updated, "utf8");
      delta.status = "merged";
      delta.mergedAt = new Date().toISOString();
      merged = true;
      break;
    }
  }

  if (!merged) {
    throw new Error(`Could not find original text in any template file for tool: ${toolName}`);
  }

  writeSkillDeltas(memoryDir, deltas);
  return delta;
}

function writeSkillDeltas(memoryDir, deltas) {
  const file = getSkillDeltasFile(memoryDir);
  ensureDir(path.dirname(file));
  const lines = deltas.map((d) => JSON.stringify(d)).join("\n") + "\n";
  writeFileAtomic(file, lines, "utf8");
}


function checkpointCommand(argv) {
  const action = argv[0] || "status";
  const config = loadConfig();
  ensureHub(config.memoryDir);

  switch (action) {
    case "status": {
      const checkpoint = readLoopCheckpoint(config.memoryDir);
      const stats = getCheckpointStats(checkpoint);
      console.log(JSON.stringify(stats, null, 2));
      break;
    }
    case "reset": {
      writeLoopCheckpoint(config.memoryDir, { cycle: 0, jobs: {}, lastCompletedAt: "" });
      console.log(JSON.stringify({ ok: true, message: "Checkpoint reset." }, null, 2));
      break;
    }
    case "show": {
      const checkpoint = readLoopCheckpoint(config.memoryDir);
      console.log(JSON.stringify(checkpoint, null, 2));
      break;
    }
    default:
      throw new Error("Usage: ai-memory-hub checkpoint <status|reset|show>");
  }
}

function heartbeatCommand(argv) {
  const action = argv[0] || "check";
  const config = loadConfig();
  ensureHub(config.memoryDir);

  switch (action) {
    case "check": {
      const result = checkDaemonHeartbeat(config.memoryDir);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "show": {
      const heartbeat = readDaemonHeartbeat(config.memoryDir);
      console.log(JSON.stringify(heartbeat, null, 2));
      break;
    }
    case "watch": {
      const interval = Number(getOption(argv, "--interval") || 10000);
      console.log(`Watching daemon heartbeat every ${interval}ms. Press Ctrl+C to stop.`);
      const check = () => {
        const result = checkDaemonHeartbeat(config.memoryDir);
        const status = result.alive ? "ALIVE" : (result.stale ? "STALE" : "DEAD");
        const icon = result.alive ? "+" : (result.stale ? "!" : "x");
        console.log(`[${new Date().toISOString()}] ${icon} ${status} pid=${result.pid || "?"} cycle=${result.cycle || "?"} age=${result.ageMs ? Math.round(result.ageMs / 1000) + "s" : "?"} — ${result.reason}`);
      };
      check();
      setInterval(check, interval);
      break;
    }
    default:
      throw new Error("Usage: ai-memory-hub heartbeat <check|show|watch>");
  }
}

function readLoopCheckpoint(memoryDir) {
  const filePath = path.join(memoryDir, "state", LOOP_CHECKPOINT_FILE);
  if (!fs.existsSync(filePath)) {
    return { cycle: 0, jobs: {}, lastCompletedAt: "" };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { cycle: 0, jobs: {}, lastCompletedAt: "" };
  }
}

function writeLoopCheckpoint(memoryDir, checkpoint) {
  const filePath = path.join(memoryDir, "state", LOOP_CHECKPOINT_FILE);
  ensureDir(path.dirname(filePath));
  writeFileAtomic(filePath, JSON.stringify(checkpoint, null, 2), "utf8");
}




function buildDaemonStatus(memoryDir) {
  const paths = getDaemonStatePaths(memoryDir);
  const status = readDaemonStatus(memoryDir);
  const pidFromFile = readDaemonPid(memoryDir);
  const pidFromStatus = Number(status.pid || 0);
  const pid = pidFromFile || (Number.isInteger(pidFromStatus) && pidFromStatus > 0 ? pidFromStatus : null);
  const liveness = checkProcessLiveness(pid);
  const declaredActive = ["starting", "running", "stopping"].includes(status.state || "") || (pidFromFile && !status.state);
  const running = Boolean(pid && declaredActive && liveness.running);
  const state = status.state === "invalid"
    ? "invalid"
    : running
      ? (status.state || "running")
      : status.state === "stopped"
        ? "stopped"
        : pid
          ? "stale"
          : "not_running";

  return {
    state,
    running,
    stalePid: Boolean(pid && !running),
    pid,
    pidFile: paths.pidFile,
    statusFile: paths.statusFile,
    liveness,
    status
  };
}

function getDaemonStatePaths(memoryDir) {
  return {
    pidFile: path.join(memoryDir, "state", DAEMON_PID_FILE),
    statusFile: path.join(memoryDir, "state", DAEMON_STATUS_FILE)
  };
}

function readDaemonPid(memoryDir) {
  const text = readTextIfExists(getDaemonStatePaths(memoryDir).pidFile).trim();
  const pid = Number(text);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function writeDaemonPid(memoryDir, pid) {
  const paths = getDaemonStatePaths(memoryDir);
  ensureDir(path.dirname(paths.pidFile));
  writeFileAtomic(paths.pidFile, `${pid}\n`, "utf8");
}

function clearDaemonPid(memoryDir, pid) {
  const paths = getDaemonStatePaths(memoryDir);
  const currentPid = readDaemonPid(memoryDir);
  if (currentPid === pid && fs.existsSync(paths.pidFile)) {
    fs.unlinkSync(paths.pidFile);
  }
}

function writeDaemonHeartbeat(memoryDir, data) {
  const filePath = path.join(memoryDir, "state", DAEMON_HEARTBEAT_FILE);
  ensureDir(path.dirname(filePath));
  writeFileAtomic(filePath, JSON.stringify({
    ...data,
    ts: new Date().toISOString()
  }, null, 2), "utf8");
}

function readDaemonHeartbeat(memoryDir) {
  const filePath = path.join(memoryDir, "state", DAEMON_HEARTBEAT_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function checkDaemonHeartbeat(memoryDir) {
  const heartbeat = readDaemonHeartbeat(memoryDir);
  const processAlive = heartbeat?.pid ? checkProcessLiveness(heartbeat.pid).running : true;
  return evaluateDaemonHeartbeat({
    heartbeat,
    staleMs: DAEMON_HEARTBEAT_STALE_MS,
    processAlive
  });
}

function readDaemonStatus(memoryDir) {
  const file = getDaemonStatePaths(memoryDir).statusFile;
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return readJson(file);
  } catch (error) {
    return {
      state: "invalid",
      error: error.message || String(error)
    };
  }
}

function writeDaemonStatus(memoryDir, patch) {
  const paths = getDaemonStatePaths(memoryDir);
  const existing = readDaemonStatus(memoryDir);
  writeJson(paths.statusFile, {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}


function appCommand(argv) {
  const host = getOption(argv, "--host") || "127.0.0.1";
  const port = Number(getOption(argv, "--port") || 38787);
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const realtime = dashboardRealtime.createDashboardRealtime(config.memoryDir);
  const broadcastDashboardUpdate = (reason) => realtime.broadcastSnapshot(reason);
  const backgroundQueue = getBackgroundQueue({
    onProgress: (task) => {
      try {
        broadcastDashboardUpdate(`task:${task.status}`);
        // 进度推送也走 snapshot 的附带字段由前端按需读取；此处仅触发刷新
      } catch {
        // ignore
      }
    }
  });

  const server = http.createServer(async (req, res) => {
    const requestStartedAt = Date.now();
    const requestMethod = req.method || "GET";
    const requestRawPath = String(req.url || "/").split(/[?#]/, 1)[0] || "/";
    let requestCapturedStatus = 200;
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = (status, ...rest) => {
      requestCapturedStatus = status;
      return originalWriteHead(status, ...rest);
    };
    res.on("finish", () => {
      const ms = Date.now() - requestStartedAt;
      const isError = requestCapturedStatus >= 400;
      recordRequestMetric(requestMethod, requestRawPath, requestCapturedStatus, ms, isError);
      if (process.env.AMH_LOG_REQUESTS === "1") {
        console.log(`[req] ${requestMethod} ${requestRawPath} -> ${requestCapturedStatus} (${ms}ms)`);
      }
    });
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      const rawPathname = String(req.url || "/").split(/[?#]/, 1)[0] || "/";
      if ((req.method === "GET" || req.method === "HEAD") && rawPathname.startsWith("/assets/")) {
        return sendStaticAsset(res, rawPathname);
      }
      if ((req.method === "GET" || req.method === "HEAD") && (rawPathname.startsWith("/css/") || rawPathname.startsWith("/js/") || rawPathname.startsWith("/assets/") || /\.(svg|png|jpg|jpeg|gif|ico|webp|woff2?)$/i.test(rawPathname))) {
        return sendStaticFile(res, rawPathname);
      }
      if (req.method === "GET" && url.pathname === "/api/dashboard") {
        return sendJson(res, dashboardRealtime.getDashboardSnapshot(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/dashboard/overview") {
        return sendJson(res, dashboardRealtime.getDashboardOverview(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/credentials") {
        return sendJson(res, { profiles: listCredentialProfiles(config.memoryDir) });
      }
      if (req.method === "POST" && url.pathname === "/api/credentials") {
        const body = await readRequestJson(req);
        const profile = withHubLock(config.memoryDir, "credentials:set", () => setCredentialProfile(config.memoryDir, body));
        return sendJson(res, { ok: true, profile });
      }
      if (req.method === "DELETE" && url.pathname === "/api/credentials") {
        const body = await readRequestJson(req);
        return sendJson(res, { ok: true, profiles: withHubLock(config.memoryDir, "credentials:remove", () => removeCredentialProfile(config.memoryDir, body.id)) });
      }
      if (url.pathname === "/api/extensions") {
        const app = url.searchParams.get("app") || "";
        const kind = url.searchParams.get("kind") || "mcp";
        const apps = app ? [app] : ["claude", "codex", "gemini", "opencode"];
        if (req.method === "GET") {
          const [records, status, diff] = await Promise.all([
            listExtensions(config.memoryDir, { kind }),
            statusExtensions(config.memoryDir, { apps, homeDir: os.homedir() }),
            diffExtensions(config.memoryDir, { apps, homeDir: os.homedir() })
          ]);
          return sendJson(res, { records, extensions: records, status, diff });
        }
        if (req.method === "POST") {
          const body = await readRequestJson(req);
          const options = { apps, homeDir: os.homedir(), apply: body.apply === true, force: body.force === true };
          if (body.action === "sync") return sendJson(res, await syncExtensions(config.memoryDir, options));
          return sendJson(res, await diffExtensions(config.memoryDir, options));
        }
      }      if (req.method === "GET" && url.pathname === "/api/skills") {
        const packages = await listSharedSkillPackages(config.memoryDir);
        const project = url.searchParams.get("project") || process.cwd();
        const manifest = await loadProjectSkillManifest(project);
        const ids = [...new Set(packages.map((item) => item.id))];
        const lifecycle = Object.fromEntries(ids.map((id) => [id, getSkillLifecycleState(manifest, packages, id)]));
        return sendJson(res, { packages, manifest, selected: selectProjectSkills(manifest, packages), lifecycle });
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/skills/") && url.pathname !== "/api/skills/scan" && url.pathname !== "/api/skills/install" && url.pathname !== "/api/skills/sync" && url.pathname !== "/api/skills/doctor") {
        const id = decodeURIComponent(url.pathname.slice("/api/skills/".length));
        const packages = (await listSharedSkillPackages(config.memoryDir)).filter((item) => item.id === id);
        if (!packages.length) return sendJson(res, { error: `Skill not found: ${id}` }, 404);
        const project = url.searchParams.get("project") || process.cwd();
        const manifest = await loadProjectSkillManifest(project);
        return sendJson(res, { id, packages, manifest: manifest.skills[id] || null, lifecycle: getSkillLifecycleState(manifest, packages, id) });
      }
      if (req.method === "GET" && url.pathname === "/api/skills/scan") {
        const skills = await scanSkillRoots(defaultSkillRoots());
        return sendJson(res, { skills, groups: aggregateSkillSources(skills) });
      }
      if (req.method === "POST" && url.pathname === "/api/skills/install") {
        const body = await readRequestJson(req);
        if ((!body.path || typeof body.path !== "string") && (!body.source || typeof body.source !== "string")) return sendJson(res, { error: "path or source is required" }, 400);
        const imported = await withPreparedSkillSource(config.memoryDir, body.source || body.path, { ref: body.ref || "" }, async (prepared) => {
          const pack = await readSkillPackManifest(prepared.path);
          return pack
            ? importSharedPack(config.memoryDir, prepared.path, { source: prepared.source })
            : importSharedSkill(config.memoryDir, prepared.path, { id: body.id, version: body.version || "1.0.0", source: prepared.source });
        });
        let manifest = null;
        let synced = [];
        if (body.project) {
          const enabledSkills = imported.package ? imported.skills : [imported];
          for (const skill of enabledSkills) manifest = await setProjectSkill(body.project, skill.id, body.version || skill.version);
          const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
          synced = await syncSkillProjections(body.project, packages, Array.isArray(body.targets) && body.targets.length ? body.targets : ["codex", "claude", "gemini", "opencode", "antigravity"]);
        }
        broadcastDashboardUpdate("skills:install");
        return sendJson(res, { ok: true, imported, manifest, synced });
      }
      if (req.method === "POST" && url.pathname === "/api/skills/sync") {
        const body = await readRequestJson(req);
        const project = body.project || process.cwd();
        const manifest = await loadProjectSkillManifest(project);
        const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
        const result = await syncSkillProjections(project, packages, Array.isArray(body.targets) && body.targets.length ? body.targets : (manifest.targets.length ? manifest.targets : ["codex", "claude", "gemini", "opencode", "antigravity"]));
        broadcastDashboardUpdate("skills:sync");
        return sendJson(res, { ok: true, project, result });
      }
      if (req.method === "POST" && url.pathname === "/api/skills/select") {
        const body = await readRequestJson(req);
        const project = body.project || process.cwd();
        if (typeof body.id !== "string" || !body.id) return sendJson(res, { error: "id is required" }, 400);
        const manifest = body.enabled === false
          ? await disableProjectSkill(project, body.id)
          : await selectProjectSkillVersion(project, body.id, body.version || "*");
        const packages = await listSharedSkillPackages(config.memoryDir);
        broadcastDashboardUpdate("skills:select");
        return sendJson(res, { ok: true, project, manifest, selected: selectProjectSkills(manifest, packages) });
      }
      if (req.method === "GET" && url.pathname === "/api/relations") {
        const type = url.searchParams.get("entityType") || "";
        const id = url.searchParams.get("entityId") || "";
        return sendJson(res, listRelatedEntities(config.memoryDir, { type, id }, { includeSuggestions: url.searchParams.get("suggestions") !== "0" }));
      }
      if (req.method === "POST" && url.pathname === "/api/relations") {
        const body = await readRequestJson(req);
        return sendJson(res, { ok: true, relation: recordRelation(config.memoryDir, body) });
      }
      if (req.method === "POST" && url.pathname === "/api/relations/revoke") {
        const body = await readRequestJson(req);
        return sendJson(res, { ok: true, relation: revokeRelation(config.memoryDir, body.id, body.reason || "") });
      }
      // ── Agent / Role / Team registry endpoints ──
      if (req.method === "GET" && url.pathname === "/api/agents") {
        const agents = readAgents(config.memoryDir);
        const roles = readRoles(config.memoryDir);
        const rels = readRelations(config.memoryDir);
        const enriched = agents.map((a) => {
          const roleBindings = rels.filter((r) => r.relation === "plays-role" && r.from === `agent:${a.id}`);
          return { ...a, roleBindings: roleBindings.map((r) => r.to) };
        });
        return sendJson(res, { agents: enriched, roles });
      }
      if (req.method === "GET" && url.pathname === "/api/roles") {
        return sendJson(res, { roles: readRoles(config.memoryDir) });
      }
      if (req.method === "GET" && url.pathname === "/api/teams") {
        const teams = readTeams(config.memoryDir);
        const agents = readAgents(config.memoryDir);
        const rels = readRelations(config.memoryDir);
        const enriched = teams.map((t) => {
          const memberRels = rels.filter((r) => r.relation === "member-of" && r.status === "active" && r.to?.type === "team" && String(r.to?.id).toLowerCase() === String(t.id).toLowerCase());
          return { ...t, memberCount: memberRels.length, memberIds: memberRels.map((r) => r.from?.id || "") };
        });
        return sendJson(res, { teams: enriched, agents: agents.map((a) => ({ id: a.id, name: a.name, status: a.status })) });
      }
      // ── Role CRUD ──
      if (req.method === "POST" && url.pathname === "/api/roles") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const existing = readRoleById(config.memoryDir, body.id) || {};
        const role = writeRole(config.memoryDir, {
          ...existing,
          id: existing.id || body.id,
          name: body.name || existing.name || body.id,
          description: body.description ?? existing.description ?? "",
          permissions: Array.isArray(body.permissions) ? body.permissions : (existing.permissions || []),
          createdAt: existing.createdAt || new Date().toISOString(),
        });
        return sendJson(res, { ok: true, role });
      }
      if (req.method === "DELETE" && url.pathname === "/api/roles") {
        const id = (url.searchParams.get("id") || "").trim();
        if (!id) return sendJson(res, { error: "id is required" }, 400);
        const roles = readRoles(config.memoryDir);
        const next = roles.filter((r) => String(r.id).toLowerCase() !== id.toLowerCase());
        if (next.length === roles.length) return sendJson(res, { error: "role not found" }, 404);
        writeFileAtomic(getRoleRegistryFile(config.memoryDir), next.map((r) => JSON.stringify(r)).join("\n") + (next.length ? "\n" : ""), "utf8");
        return sendJson(res, { ok: true, deleted: id });
      }
      // ── Team CRUD ──
      if (req.method === "POST" && url.pathname === "/api/teams") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const existing = readTeamById(config.memoryDir, body.id) || {};
        const team = writeTeam(config.memoryDir, {
          ...existing,
          id: existing.id || body.id,
          name: body.name || existing.name || body.id,
          description: body.description ?? existing.description ?? "",
          createdAt: existing.createdAt || new Date().toISOString(),
        });
        return sendJson(res, { ok: true, team });
      }
      if (req.method === "DELETE" && url.pathname === "/api/teams") {
        const id = (url.searchParams.get("id") || "").trim();
        if (!id) return sendJson(res, { error: "id is required" }, 400);
        const teams = readTeams(config.memoryDir);
        const next = teams.filter((t) => String(t.id).toLowerCase() !== id.toLowerCase());
        if (next.length === teams.length) return sendJson(res, { error: "team not found" }, 404);
        writeFileAtomic(getTeamRegistryFile(config.memoryDir), next.map((t) => JSON.stringify(t)).join("\n") + (next.length ? "\n" : ""), "utf8");
        return sendJson(res, { ok: true, deleted: id });
      }
      if (req.method === "POST" && url.pathname === "/api/teams/member") {
        const body = await readRequestJson(req);
        if (!body.teamId || !body.agentId) return sendJson(res, { error: "teamId and agentId are required" }, 400);
        const rel = recordRelation(config.memoryDir, {
          from: { type: "agent", id: body.agentId },
          to: { type: "team", id: body.teamId },
          relation: "member-of",
          source: "dashboard",
          evidence: { note: `agent ${body.agentId} joined team ${body.teamId} via dashboard` },
        });
        return sendJson(res, { ok: true, relation: rel });
      }
      if (req.method === "DELETE" && url.pathname === "/api/teams/member") {
        const teamId = (url.searchParams.get("teamId") || "").trim();
        const agentId = (url.searchParams.get("agentId") || "").trim();
        if (!teamId || !agentId) return sendJson(res, { error: "teamId and agentId are required" }, 400);
        const rel = readRelations(config.memoryDir).find((r) => r.status === "active" && r.relation === "member-of" && r.from?.type === "agent" && String(r.from?.id).toLowerCase() === agentId.toLowerCase() && r.to?.type === "team" && String(r.to?.id).toLowerCase() === teamId.toLowerCase());
        if (!rel) return sendJson(res, { error: "no active member-of relation found" }, 404);
        revokeRelation(config.memoryDir, rel.id, "removed via dashboard");
        return sendJson(res, { ok: true, removed: { agentId, teamId } });
      }
      // ── Agent persona/bio update ──
      if (req.method === "POST" && url.pathname === "/api/agents") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const existing = readAgentById(config.memoryDir, body.id) || { id: body.id, name: body.id, createdAt: new Date().toISOString() };
        const agent = writeAgent(config.memoryDir, {
          ...existing,
          id: existing.id || body.id,
          name: body.name || existing.name || body.id,
          persona: body.persona ?? existing.persona ?? "",
          bio: body.bio ?? existing.bio ?? "",
          status: existing.status || "idle",
        });
        return sendJson(res, { ok: true, agent });
      }
      if (req.method === "GET" && url.pathname === "/api/skills/doctor") {
        const project = url.searchParams.get("project") || process.cwd();
        const manifest = await loadProjectSkillManifest(project);
        const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
        return sendJson(res, { project, result: await doctorSkillProjections(project, packages, manifest.targets.length ? manifest.targets : ["codex", "claude", "gemini", "opencode", "antigravity"]) });
      }
      if (req.method === "GET" && url.pathname === "/api/extensions") {
        const kind = url.searchParams.get("kind") || "mcp";
        return sendJson(res, { extensions: await listExtensions(config.memoryDir, { kind }) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/import") {
        const body = await readRequestJson(req);
        const apps = Array.isArray(body.apps) && body.apps.length ? body.apps : undefined;
        const homeDir = body.homeDir || undefined;
        return sendJson(res, { ok: true, ...(await importExtensions(config.memoryDir, { apps, homeDir })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/diff") {
        const body = await readRequestJson(req);
        const apps = Array.isArray(body.apps) && body.apps.length ? body.apps : undefined;
        const homeDir = body.homeDir || undefined;
        return sendJson(res, { ok: true, ...(await diffExtensions(config.memoryDir, { apps, homeDir })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/sync") {
        const body = await readRequestJson(req);
        const apps = Array.isArray(body.apps) && body.apps.length ? body.apps : undefined;
        const homeDir = body.homeDir || undefined;
        const apply = body.apply === true;
        const force = body.force === true;
        return sendJson(res, { ok: true, ...(await syncExtensions(config.memoryDir, { apps, homeDir, apply, force })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/remove") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const apps = Array.isArray(body.apps) && body.apps.length ? body.apps : undefined;
        const apply = body.apply === true;
        return sendJson(res, { ok: true, ...(await removeExtensions(config.memoryDir, body.id, { apps, apply })) });
      }
      if (req.method === "GET" && url.pathname === "/api/extensions/status") {
        const homeDir = url.searchParams.get("homeDir") || os.homedir();
        return sendJson(res, { ok: true, ...(await statusExtensions(config.memoryDir, { homeDir })) });
      }
      if (req.method === "GET" && url.pathname === "/api/metrics") {
        return sendJson(res, { ...dashboardMetrics.calculateMetrics(config.memoryDir), requests: getRequestMetricsSnapshot() });
      }
      // ── Phase 1.1: 后台任务队列查询/取消（独立命名空间，避免与看板任务 /api/tasks 冲突） ──
      if (req.method === "GET" && url.pathname === "/api/background-tasks") {
        return sendJson(res, { ok: true, tasks: backgroundQueue.list({ limit: Number(url.searchParams.get("limit")) || 50 }) });
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/background-tasks/")) {
        const id = url.pathname.slice("/api/background-tasks/".length);
        const task = backgroundQueue.get(id);
        if (!task) return sendJson(res, { ok: false, error: "task not found" }, 404);
        return sendJson(res, { ok: true, task });
      }
      if (req.method === "POST" && url.pathname.startsWith("/api/background-tasks/") && url.pathname.endsWith("/cancel")) {
        const id = url.pathname.slice("/api/background-tasks/".length, -"/cancel".length);
        return sendJson(res, { ok: true, ...backgroundQueue.cancel(id) });
      }
      // ── feature ③: 数据导入/导出与迁移 ──────────────────────────────
      if (req.method === "GET" && url.pathname === "/api/data/export") {
        return sendJson(res, exportMemoryBundle(config.memoryDir));
      }
      if (req.method === "POST" && url.pathname === "/api/data/import") {
        const body = await readRequestJson(req, 128 * 1024 * 1024);
        const apply = body.apply === true;
        if (url.searchParams.get("background") === "1" && apply) {
          const enqueued = backgroundQueue.enqueue({
            type: "data-import",
            label: "导入数据迁移包",
            run: async (ctx) => {
              ctx.report(0.1, "taking safety backup");
              const result = withHubLock(
                config.memoryDir,
                "data-import",
                () => importMemoryBundle(config.memoryDir, body.bundle, { apply: true }),
                config.sync.lockStaleMs
              );
              ctx.report(0.9, "imported");
              return result;
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = apply
          ? withHubLock(
              config.memoryDir,
              "data-import",
              () => importMemoryBundle(config.memoryDir, body.bundle, { apply: true }),
              config.sync.lockStaleMs
            )
          : importMemoryBundle(config.memoryDir, body.bundle, { apply: false });
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return sendJson(res, getStatusObject());
      }
      if (req.method === "GET" && url.pathname === "/api/memory") {
        return sendJson(res, dashboardMemory.getDashboardMemory(config.memoryDir, getPageOptions(url)));
      }
      if (req.method === "POST" && url.pathname === "/api/memory/supersede") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        let event;
        withHubLock(config.memoryDir, "memory-supersede", () => {
          event = dashboardMemory.createMemorySupersedeEvent(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("memory:supersede");
        return sendJson(res, { ok: true, event, status: getStatusObject() });
      }
      if (req.method === "GET" && url.pathname === "/api/radio") {
        return sendJson(res, dashboardRadio.getDashboardRadio(config.memoryDir, getPageOptions(url)));
      }
      if (req.method === "GET" && url.pathname === "/api/tasks") {
        const status = url.searchParams.get("status") || "all";
        const includeCancelled = url.searchParams.get("includeCancelled") === "1";
        return sendJson(res, dashboardTasks.getDashboardTasks(config.memoryDir, status, { includeCancelled, ...getPageOptions(url) }));
      }
      if (req.method === "GET" && url.pathname === "/api/workflows") {
        return sendJson(res, dashboardWorkflows.getDashboardWorkflows(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/projects") {
        return sendJson(res, dashboardProjects.getDashboardProjects(config.memoryDir, {
          status: url.searchParams.get("status") || "all",
          includeHidden: url.searchParams.get("includeHidden") === "1"
        }));
      }
      if (req.method === "POST" && url.pathname === "/api/projects") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.name || typeof body.name !== "string") {
          return sendJson(res, { error: "name is required" }, 400);
        }
        let project;
        withHubLock(config.memoryDir, "project-create", () => {
          project = dashboardProjects.createDashboardProject(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("project:create");
        return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
      }
      const projectApiMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectApiMatch) {
        const projectId = decodeURIComponent(projectApiMatch[1]);
        if (req.method === "GET") {
          const project = findProject(readProjects(config.memoryDir), projectId);
          if (!project) {
            return sendJson(res, { error: "project not found" }, 404);
          }
          return sendJson(res, { project });
        }
        if (req.method === "PATCH") {
          const body = await readRequestJson(req);
          let project;
          withHubLock(config.memoryDir, "project-update", () => {
            project = dashboardProjects.updateDashboardProject(config.memoryDir, projectId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("project:update");
          return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
        }
        if (req.method === "DELETE") {
          const body = await readRequestJson(req);
          let project;
          withHubLock(config.memoryDir, "project-archive", () => {
            project = dashboardProjects.archiveDashboardProject(config.memoryDir, projectId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("project:archive");
          return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
        }
      }
      if (req.method === "POST" && url.pathname === "/api/workflows") {
        const body = await readRequestJson(req);
        if (!body.title || typeof body.title !== "string") {
          return sendJson(res, { error: "title is required" }, 400);
        }
        let workflow;
        withHubLock(config.memoryDir, "workflow-create", () => {
          workflow = dashboardWorkflows.createDashboardWorkflow(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("workflow:create");
        return sendJson(res, { ok: true, workflow, status: getStatusObject() });
      }
      const workflowApiMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)(?:\/([^/]+))?$/);
      if (workflowApiMatch) {
        const workflowId = decodeURIComponent(workflowApiMatch[1]);
        const workflowAction = workflowApiMatch[2] ? decodeURIComponent(workflowApiMatch[2]) : "";
        if (req.method === "GET" && workflowAction === "nodes") {
          return sendJson(res, dashboardWorkflows.getDashboardWorkflowNodes(config.memoryDir, workflowId));
        }
        if (req.method === "PATCH" && !workflowAction) {
          const body = await readRequestJson(req);
          let workflow;
          withHubLock(config.memoryDir, "workflow-update", () => {
            workflow = dashboardWorkflows.updateDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:update");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "DELETE" && !workflowAction) {
          const body = await readRequestJson(req);
          let workflow;
          withHubLock(config.memoryDir, "workflow-delete", () => {
            workflow = dashboardWorkflows.deleteDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:delete");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && workflowAction === "status") {
          const body = await readRequestJson(req);
          if (!body.status || typeof body.status !== "string") {
            return sendJson(res, { error: "status is required" }, 400);
          }
          let workflow;
          withHubLock(config.memoryDir, "workflow-status", () => {
            workflow = dashboardWorkflows.setDashboardWorkflowStatus(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:status");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && ["result", "review", "note"].includes(workflowAction)) {
          const body = await readRequestJson(req);
          if (!body.text || typeof body.text !== "string") {
            return sendJson(res, { error: "text is required" }, 400);
          }
          let workflow;
          withHubLock(config.memoryDir, `workflow-${workflowAction}`, () => {
            workflow = dashboardWorkflows.appendDashboardWorkflowEntry(config.memoryDir, workflowId, workflowAction, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate(`workflow:${workflowAction}`);
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && workflowAction === "signal") {
          const body = await readRequestJson(req);
          if (!body.to || typeof body.to !== "string") {
            return sendJson(res, { error: "to is required" }, 400);
          }
          if (!body.text || typeof body.text !== "string") {
            return sendJson(res, { error: "text is required" }, 400);
          }
          let result;
          withHubLock(config.memoryDir, "workflow-signal", () => {
            result = dashboardWorkflows.signalDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:signal");
          return sendJson(res, { ok: true, ...result, status: getStatusObject() });
        }
      }
      if (req.method === "GET" && url.pathname === "/api/dispatch") {
        return sendJson(res, dashboardDispatch.getDashboardDispatch(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/agent-sessions") {
        return sendJson(res, dashboardAgentSessions.getDashboardAgentSessions(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/cost-sessions") {
        return sendJson(res, dashboardCostSessions.getCostSessions());
      }
      if (req.method === "GET" && url.pathname === "/api/worktrees") {
        return sendJson(res, dashboardWorktrees.getDashboardWorktrees(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/collaboration") {
        return sendJson(res, dashboardCollaboration.getDashboardCollaboration(config.memoryDir, url.searchParams.get("actor") || "all"));
      }
      if (req.method === "GET" && url.pathname === "/api/reviews") {
        return sendJson(res, { reviews: dashboardCollaboration.getDashboardCollaboration(config.memoryDir).reviews });
      }
      if (req.method === "POST" && url.pathname === "/api/unread/read") {
        const body = await readRequestJson(req);
        const result = withHubLock(config.memoryDir, "unread-read", () => dashboardCollaboration.markRead(config.memoryDir, body), config.sync.lockStaleMs);
        broadcastDashboardUpdate("unread:read");
        return sendJson(res, { ok: true, ...result });
      }
      if (req.method === "POST" && ["/api/agent/follow-up", "/api/session/follow-up"].includes(url.pathname)) {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") return sendJson(res, { error: "text is required" }, 400);
        const result = withHubLock(config.memoryDir, "agent-follow-up", () => dashboardCollaboration.sendFollowUp(config.memoryDir, body), config.sync.lockStaleMs);
        broadcastDashboardUpdate("agent:follow-up");
        return sendJson(res, { ok: true, ...result });
      }
      if (req.method === "POST" && url.pathname === "/api/reviews/request") {
        const body = await readRequestJson(req);
        if (!body.taskId && !body.workflowId && !body.sessionId) return sendJson(res, { error: "taskId, workflowId, or sessionId is required" }, 400);
        const result = withHubLock(config.memoryDir, "review-request", () => dashboardCollaboration.requestReview(config.memoryDir, body), config.sync.lockStaleMs);
        broadcastDashboardUpdate("review:request");
        return sendJson(res, { ok: true, ...result });
      }
      if (req.method === "POST" && url.pathname === "/api/reviews/result") {
        const body = await readRequestJson(req);
        const taskId = body.taskId || body.id || "";
        const decision = String(body.decision || "").toLowerCase();
        if (!taskId || !["approved", "rejected"].includes(decision)) return sendJson(res, { error: "taskId and decision approved|rejected are required" }, 400);
        const result = dashboardActions.reviewDashboardTask(config, { ...body, id: taskId, decision });
        broadcastDashboardUpdate("review:result");
        return sendJson(res, { ok: true, ...result });
      }
      if (req.method === "GET" && url.pathname === "/api/execution-adapters") {
        const taskId = url.searchParams.get("task") || "";
        const workflowId = url.searchParams.get("workflow") || "";
        const task = readTasks(config.memoryDir).find((item) => item.id === taskId || item.id.startsWith(taskId)) || {};
        const workflow = readWorkflows(config.memoryDir).find((item) => item.id === workflowId || item.id.startsWith(workflowId)) || {};
        return sendJson(res, { adapters: buildExecutionAdapters({ task, workflow, worktree: task.worktree || workflow.worktree || {} }) });
      }
      if (req.method === "POST" && url.pathname === "/api/notifications/payload") {
        const body = await readRequestJson(req);
        if (!body.message || typeof body.message !== "string") return sendJson(res, { error: "message is required" }, 400);
        return sendJson(res, { ok: true, dryRun: true, ...buildNotificationPayload(body) });
      }
      if (req.method === "POST" && url.pathname === "/api/github/webhook") {
        const body = await readRequestJson(req);
        return sendJson(res, { ...parseGithubWebhook(body), apply: false, hint: "Use amh gh webhook --data <file> --apply for explicit task updates." });
      }
      if (req.method === "GET" && url.pathname === "/api/detect") {
        // ?background=1 把全量重扫（冷启动 ~12s）收口到后台队列，立即返回 task id
        if (url.searchParams.get("background") === "1") {
          const enqueued = backgroundQueue.enqueue({
            type: "detect",
            label: "重新扫描已安装工具",
            run: async (ctx) => {
              ctx.report(0.1, "scanning install targets");
              const tools = refreshDetectedTools(config.memoryDir);
              ctx.report(0.9, "enriching connections");
              return { tools };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        return sendJson(res, dashboardTools.getDashboardDetection(config.memoryDir, { refresh: url.searchParams.get("refresh") === "1" }));
      }
      if (req.method === "GET" && url.pathname === "/api/tools") {
        return sendJson(res, dashboardTools.getDashboardTools(config.memoryDir, {
          refresh: url.searchParams.get("refresh") === "1"
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/capabilities") {
        return sendJson(res, dashboardTools.buildCapabilityRegistry(config.memoryDir, {
          refresh: url.searchParams.get("refresh") === "1"
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/extensions") {
        const kind = url.searchParams.get("kind") || "mcp";
        return sendJson(res, { ok: true, records: await listExtensions(config.memoryDir, { kind }) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/import") {
        const body = await readRequestJson(req);
        const appParam = body.app || "";
        const apps = appParam ? [appParam] : ["claude", "codex", "gemini", "opencode"];
        return sendJson(res, { ok: true, ...(await importExtensions(config.memoryDir, { apps, homeDir: os.homedir() })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/diff") {
        const body = await readRequestJson(req);
        const appParam = body.app || "";
        const apps = appParam ? [appParam] : ["claude", "codex", "gemini", "opencode"];
        const kind = body.kind || "mcp";
        if (kind === "skill") {
          return sendJson(res, { ok: true, ...(await diffSkillExtensions(config.memoryDir, { projectRoot: body.project || process.cwd(), apps })) });
        }
        return sendJson(res, { ok: true, ...(await diffExtensions(config.memoryDir, { apps, homeDir: os.homedir() })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/sync") {
        const body = await readRequestJson(req);
        const appParam = body.app || "";
        const apps = appParam ? [appParam] : ["claude", "codex", "gemini", "opencode"];
        const kind = body.kind || "mcp";
        if (kind === "skill") {
          return sendJson(res, { ok: true, ...(await syncSkillExtensions(config.memoryDir, { projectRoot: body.project || process.cwd(), apps, apply: body.apply === true })) });
        }
        return sendJson(res, { ok: true, ...(await syncExtensions(config.memoryDir, { apps, homeDir: os.homedir(), apply: body.apply === true, force: body.force === true })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/remove") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const kind = body.kind || "mcp";
        if (kind === "skill") {
          return sendJson(res, { ok: true, ...(await removeSkillExtension(config.memoryDir, { projectRoot: body.project || process.cwd(), id: body.id })) });
        }
        return sendJson(res, { ok: true, ...(await removeExtensions(config.memoryDir, body.id, { apps: body.apps || ["claude", "codex", "gemini", "opencode"], apply: body.apply === true })) });
      }
      if (req.method === "GET" && url.pathname === "/api/extensions/status") {
        return sendJson(res, { ok: true, ...(await statusExtensions(config.memoryDir, { apps: ["claude", "codex", "gemini", "opencode"], homeDir: os.homedir() })) });
      }
      if (req.method === "GET" && url.pathname === "/api/policy") {
        const rules = readPolicyRules(config.memoryDir);
        return sendJson(res, {
          ok: true,
          count: rules.length,
          rules,
          operations: POLICY_OPERATIONS,
          decisions: POLICY_DECISIONS,
          scopes: POLICY_SCOPES
        });
      }
      if (req.method === "GET" && url.pathname === "/api/backups") {
        return sendJson(res, dashboardBackups.getDashboardBackups(config));
      }
      if (req.method === "GET" && url.pathname === "/api/backups/github/status") {
        return sendJson(res, dashboardBackups.getDashboardGitHubBackupStatus());
      }
      if (req.method === "POST" && url.pathname === "/api/backups/github/configure") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.configureDashboardGitHubBackup(body);
        broadcastDashboardUpdate("backup:github-configure");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/github/run") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.runDashboardGitHubBackup(body);
        broadcastDashboardUpdate("backup:github-run");
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/backups/detail") {
        return sendJson(res, dashboardBackups.getDashboardBackupDetail(config, url.searchParams.get("name") || ""));
      }
      if (req.method === "POST" && url.pathname === "/api/backups/create") {
        const body = await readRequestJson(req);
        if (url.searchParams.get("background") === "1") {
          const enqueued = backgroundQueue.enqueue({
            type: "backup-create",
            label: "创建备份",
            run: async (ctx) => {
              ctx.report(0.05, "preparing backup");
              const result = dashboardBackups.createDashboardBackup(config, body);
              broadcastDashboardUpdate("backup:create");
              ctx.report(1, "backup created");
              return { result };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = dashboardBackups.createDashboardBackup(config, body);
        broadcastDashboardUpdate("backup:create");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/prune") {
        const body = await readRequestJson(req);
        if (url.searchParams.get("background") === "1") {
          const enqueued = backgroundQueue.enqueue({
            type: "backup-prune",
            label: "按策略清理备份",
            run: async (ctx) => {
              ctx.report(0.05, "scanning retention policy");
              const result = dashboardBackups.pruneDashboardBackups(config, body);
              if (Boolean(body.apply)) broadcastDashboardUpdate("backup:prune");
              ctx.report(1, "prune done");
              return { result };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = dashboardBackups.pruneDashboardBackups(config, body);
        if (Boolean(body.apply)) {
          broadcastDashboardUpdate("backup:prune");
        }
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/delete") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.deleteDashboardBackups(config, body);
        if (Boolean(body.apply)) {
          broadcastDashboardUpdate("backup:delete");
        }
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/restore") {
        const body = await readRequestJson(req);
        if (url.searchParams.get("background") === "1" && Boolean(body.apply)) {
          const enqueued = backgroundQueue.enqueue({
            type: "backup-restore",
            label: `恢复备份 ${String(body.name || "")}`.trim(),
            run: async (ctx) => {
              ctx.report(0.05, "preparing restore");
              const result = dashboardBackups.restoreDashboardBackup(config, body);
              if (Boolean(body.apply)) broadcastDashboardUpdate("backup:restore");
              ctx.report(1, "restore done");
              return { result };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = dashboardBackups.restoreDashboardBackup(config, body);
        if (Boolean(body.apply)) {
          broadcastDashboardUpdate("backup:restore");
        }
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/search") {
        return sendJson(res, dashboardSearch.getDashboardSearch(config.memoryDir, {
          query: url.searchParams.get("q") || url.searchParams.get("query") || "",
          type: url.searchParams.get("type") || "all",
          tag: url.searchParams.get("tag") || "",
          range: url.searchParams.get("range") || "all",
          sort: url.searchParams.get("sort") || "relevance",
          limit: Number(url.searchParams.get("limit") || 50)
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/settings") {
        return sendJson(res, dashboardSettings.getDashboardSettings());
      }
      if (req.method === "POST" && url.pathname === "/api/settings") {
        const body = await readRequestJson(req);
        const settings = dashboardSettings.updateDashboardSettings(body);
        broadcastDashboardUpdate("settings:update");
        return sendJson(res, { ok: true, settings });
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        const diagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit: 10 });
        return sendJson(res, {
          ok: true,
          stdout: diagnostic.markdown,
          report: diagnostic.markdown,
          analysis: dashboardHealth.formatHealthAnalysisForDashboard(diagnostic.analysis),
          exitCode: 0
        });
      }
      if (req.method === "POST" && url.pathname === "/api/health/repair") {
        const body = await readRequestJson(req);
        if (url.searchParams.get("background") === "1") {
          const enqueued = backgroundQueue.enqueue({
            type: "health-repair",
            label: "修复记忆健康问题",
            run: async (ctx) => {
              const apply = body.apply !== false;
              ctx.report(0.05, "scanning issues");
              const result = withHubLock(config.memoryDir, "health-repair", () => runMemoryHealthRepair(config, {
                apply,
                issueLimit: Number(body.limit || 10)
              }), config.sync.lockStaleMs);
              if (apply && result.applied.ledgerRecordsUpdated > 0) broadcastDashboardUpdate("health:repair");
              ctx.report(1, "repair done");
              return { result };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const apply = body.apply !== false;
        const result = withHubLock(config.memoryDir, "health-repair", () => runMemoryHealthRepair(config, {
          apply,
          issueLimit: Number(body.limit || 10)
        }), config.sync.lockStaleMs);
        if (apply && result.applied.ledgerRecordsUpdated > 0) {
          broadcastDashboardUpdate("health:repair");
        }
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/record") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.recordDashboardMemory(body);
        broadcastDashboardUpdate("record");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/radio/send") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.sendDashboardRadio(config, body);
        broadcastDashboardUpdate("radio:send");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/add") {
        const body = await readRequestJson(req);
        if (!body.title || typeof body.title !== "string") {
          return sendJson(res, { error: "title is required" }, 400);
        }
        const result = dashboardActions.addDashboardTask(config, body);
        broadcastDashboardUpdate("task:add");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/claim") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const result = dashboardActions.claimDashboardTask(config, body);
        broadcastDashboardUpdate("task:claim");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/status") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.status || typeof body.status !== "string") {
          return sendJson(res, { error: "status is required" }, 400);
        }
        const result = dashboardActions.setDashboardTaskStatus(config, body);
        broadcastDashboardUpdate("task:status");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/review") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const decision = String(body.decision || "").toLowerCase();
        if (!["approved", "rejected"].includes(decision)) {
          return sendJson(res, { error: "decision must be approved or rejected" }, 400);
        }
        const result = dashboardActions.reviewDashboardTask(config, body);
        broadcastDashboardUpdate("task:review");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/purge") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.confirm || typeof body.confirm !== "string") {
          return sendJson(res, { error: "confirm is required" }, 400);
        }
        const result = dashboardActions.purgeDashboardTask(config, body);
        broadcastDashboardUpdate("task:purge");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch/run") {
        const body = await readRequestJson(req);
        const concurrency = Math.max(1, Math.min(Number(body.concurrency || 1), 6));
        if (url.searchParams.get("background") === "1" && concurrency > 1) {
          const enqueued = backgroundQueue.enqueue({
            type: "dispatch-run",
            label: `并发 Dispatch (concurrency=${concurrency})`,
            run: async (ctx) => {
              ctx.report(0.05, "dispatching jobs");
              const result = await dashboardActions.runDashboardDispatch(config, body);
              ctx.report(0.95, "dispatch completed");
              return result;
            }
          });
          broadcastDashboardUpdate("dispatch:run");
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = await dashboardActions.runDashboardDispatch(config, body);
        broadcastDashboardUpdate("dispatch:run");
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/dispatch/pool") {
        return sendJson(res, getDispatchPoolSnapshot());
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch/marvis") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.dispatchDashboardMarvis(config, body);
        broadcastDashboardUpdate("dispatch:marvis");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/radio/promote") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const result = dashboardActions.promoteDashboardRadio(body);
        broadcastDashboardUpdate("radio:promote");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/sync") {
        const result = dashboardActions.syncDashboardMemory();
        broadcastDashboardUpdate("sync");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/pull") {
        const result = dashboardActions.pullDashboardMemory();
        broadcastDashboardUpdate("pull");
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/install/preview") {
        const toolName = url.searchParams.get("tool");
        const isLocal = url.searchParams.get("scope") === "local";
        try {
          return sendJson(res, dashboardActions.getDashboardInstallPreview(config, { toolName, isLocal }));
        } catch (error) {
          return sendJson(res, { error: error.message || String(error) }, 404);
        }
      }
      if (req.method === "POST" && url.pathname === "/api/install/apply") {
        const body = await readRequestJson(req);
        const toolName = body.tool;
        if (!toolName) {
          return sendJson(res, { error: "tool is required" }, 400);
        }
        let result;
        try {
          result = dashboardActions.applyDashboardInstall(config, body);
        } catch (error) {
          return sendJson(res, { error: error.message || String(error) }, 404);
        }
        broadcastDashboardUpdate("install:apply");
        return sendJson(res, result);
      }
      // SPA fallback: serve Dashboard HTML for all other GET requests
      // This allows React Router to handle client-side routing for paths like /tasks, /workflows, etc.
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && path.extname(url.pathname)) {
        return sendPlain(res, "Not Found", 404);
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        return sendHtml(res, renderDashboard());
      }
      return sendJson(res, { error: "not found" }, 404);
    } catch (error) {
      console.error(`[req-error] ${requestMethod} ${requestRawPath}:`, error);
      return sendErrorEnvelope(res, 500, error?.message || String(error), process.env.AMH_DEBUG === "1" ? String(error?.stack || "") : undefined);
    }
  });

  server.on("upgrade", (req, socket) => {
    realtime.handleUpgrade(req, socket, host, port);
  });

  const stopDashboardWatcher = dashboardRealtime.watchDashboardState(config.memoryDir, broadcastDashboardUpdate);
  server.on("close", () => {
    stopDashboardWatcher();
    realtime.close();
  });

  server.listen(port, host, () => {
    console.log(`AI Memory Hub app: http://${host}:${port}`);
  });
}

function installCommand(argv) {
  const tool = getOption(argv, "--tool") || "all";
  const apply = hasFlag(argv, "--apply");
  const isLocal = hasFlag(argv, "--local");
  const config = loadConfig();
  ensureHub(config.memoryDir);

  const targets = (isLocal
    ? getLocalInstallTargets(process.cwd(), config.memoryDir)
    : getInstallTargets(config.memoryDir)
  ).filter((target) => tool === "all" || target.tool === tool);
  
  if (targets.length === 0) {
    throw new Error(`No install targets found for tool: ${tool}`);
  }

  for (const target of targets) {
    const snippet = renderInstallSnippet(target, config.memoryDir);
    const preview = syncSharedSkillLayer(target.file, snippet, { apply: false });
    if (!apply) {
      console.log(`\n[dry-run] ${target.tool}: ${target.file}`);
      console.log(`Status: ${preview.status}`);
      console.log(snippet.trim());
      continue;
    }

    ensureDir(path.dirname(target.file));
    const result = syncSharedSkillLayer(target.file, snippet, { apply: true });
    console.log(`${sharedSkillLayerActionLabel(result.status)} shared memory instructions for ${target.tool}: ${target.file}`);
  }
}


function defaultConfig(memoryDir) {
  return {
    memoryDir,
    sync: {
      archiveIndexedInboxItems: true,
      snapshotLimit: 120,
      coreLimit: 30,
      recentLimit: 18,
      lockStaleMs: 120000,
      backupRetention: {
        daily: 7,
        weekly: 4,
        preSync: 20,
        prePull: 20,
        pruneAfterSync: true
      }
    },
    dashboard: {
      autoRefresh: true,
      refreshIntervalMs: 5000,
      language: "zh",
      theme: "dark",
      notifications: true,
      shortcuts: defaultDashboardShortcuts()
    },
    backup: {
      github: {
        enabled: false,
        remoteUrl: DEFAULT_GITHUB_BACKUP_REMOTE,
        repoDir: DEFAULT_GITHUB_BACKUP_REPO_DIR,
        branch: "main",
        allowPlaintextSensitive: false,
        include: getDefaultGitHubBackupInclude(memoryDir),
        exclude: [],
        schedule: {
          enabled: false,
          time: "03:30",
          taskName: DEFAULT_GITHUB_BACKUP_TASK_NAME
        },
        lastRunAt: "",
        lastCommit: "",
        lastError: ""
      }
    },
    tools: {
      codex: { enabled: true },
      codexApp: { enabled: true },
      claude: { enabled: true },
      claudeDesktop: { enabled: true },
      gemini: { enabled: true },
      antigravity: { enabled: true },
      antigravityCockpit: { enabled: true },
      marvis: { enabled: true },
      qclaw: { enabled: true },
      coze: { enabled: true },
      openclaw: { enabled: true },
      opencode: { enabled: true },
      mimocode: { enabled: true },
      grok: { enabled: true },
      cursor: { enabled: true },
      windsurf: { enabled: true },
      vscode: { enabled: true },
      continue: { enabled: true },
      cline: { enabled: true },
      rooCode: { enabled: true },
      trae: { enabled: true },
      kiro: { enabled: true },
      zed: { enabled: true },
      chatgpt: { enabled: true },
      ollama: { enabled: true },
      lmstudio: { enabled: true },
      jan: { enabled: true },
      anythingllm: { enabled: true },
      cherryStudio: { enabled: true },
      dify: { enabled: true },
      openWebui: { enabled: true },
      aider: { enabled: true },
      tabby: { enabled: true },
      codeium: { enabled: true },
      augment: { enabled: true },
      supermaven: { enabled: true }
    }
  };
}

function ensureHub(memoryDir) {
  for (const dir of [
    memoryDir,
    path.join(memoryDir, "inbox"),
    path.join(memoryDir, "synced"),
    path.join(memoryDir, "memories"),
    path.join(memoryDir, "radio"),
    path.join(memoryDir, "tasks"),
    path.join(memoryDir, "workflows"),
    path.join(memoryDir, "projects"),
    path.join(memoryDir, "prompts"),
    path.join(memoryDir, "tools"),
    path.join(memoryDir, "backups"),
    path.join(memoryDir, "locks"),
    path.join(memoryDir, "state")
  ]) {
    ensureDir(dir);
  }

  const profilePath = path.join(memoryDir, "profile.md");
  if (!fs.existsSync(profilePath)) {
    writeFileAtomic(profilePath, "# Profile\n\nAdd stable user preferences here.\n", "utf8");
  }

  const memoryPath = path.join(memoryDir, "MEMORY.md");
  if (!fs.existsSync(memoryPath)) {
    writeFileAtomic(memoryPath, "# Shared AI Memory\n\nNo local memories indexed yet.\n", "utf8");
  }

  const bootstrapPath = path.join(memoryDir, "BOOTSTRAP.md");
  if (!fs.existsSync(bootstrapPath)) {
    writeFileAtomic(bootstrapPath, renderEmptyBootstrapSnapshot(memoryDir), "utf8");
  }

  const projectsFile = getProjectsFile(memoryDir);
  if (!fs.existsSync(projectsFile)) {
    writeProjects(memoryDir, getSeedProjects());
  }

  const projectsReadmePath = path.join(memoryDir, "projects", "README.md");
  if (!fs.existsSync(projectsReadmePath)) {
    writeFileAtomic(projectsReadmePath, renderProjectRegistryReadme(), "utf8");
  }
}


function loadConfig() {
  const memoryDir = resolveMemoryDir();
  const configPath = path.join(memoryDir, "config.json");
  if (!fs.existsSync(configPath)) {
    ensureHub(memoryDir);
    writeJson(configPath, defaultConfig(memoryDir));
  }
  const config = readJson(configPath);
  const cleanConfig = { ...config };
  delete cleanConfig["m" + "e" + "m" + "0"];
  const base = defaultConfig(memoryDir);
  const sync = { ...base.sync, ...(config.sync || {}) };
  const dashboard = { ...base.dashboard, ...(config.dashboard || {}) };
  const backup = {
    ...base.backup,
    ...(config.backup || {}),
    github: {
      ...base.backup.github,
      ...(config.backup?.github || {}),
      schedule: {
        ...base.backup.github.schedule,
        ...(config.backup?.github?.schedule || {})
      }
    }
  };
  sync.backupRetention = {
    ...base.sync.backupRetention,
    ...(config.backups || {}),
    ...(config.sync?.backupRetention || {})
  };
  Object.defineProperty(sync, "_explicitKeys", {
    value: new Set(Object.keys(config.sync || {})),
    enumerable: false
  });
  return {
    ...base,
    ...cleanConfig,
    memoryDir,
    sync,
    dashboard,
    backup,
    tools: { ...base.tools, ...(config.tools || {}) }
  };
}

function getCachedDetectedTools(memoryDir = resolveMemoryDir()) {
  const now = Date.now();
  if (
    toolDetectionCache &&
    toolDetectionCache.memoryDir === memoryDir &&
    now - toolDetectionCache.ts < TOOL_DETECTION_CACHE_TTL_MS
  ) {
    return toolDetectionCache.tools;
  }
  const tools = detectTools(memoryDir);
  toolDetectionCache = { memoryDir, ts: now, tools };
  return tools;
}

function refreshDetectedTools(memoryDir = resolveMemoryDir()) {
  const tools = detectTools(memoryDir);
  toolDetectionCache = { memoryDir, ts: Date.now(), tools };
  return tools;
}

function invalidateToolDetectionCache(memoryDir = resolveMemoryDir()) {
  if (!toolDetectionCache || toolDetectionCache.memoryDir === memoryDir) {
    toolDetectionCache = null;
  }
}


function detectTools(memoryDir = resolveMemoryDir()) {
  const home = os.homedir();
  const checks = [
    {
      name: "codex",
      kind: "cli-config",
      dir: path.join(home, ".codex")
    },
    {
      name: "codex-app",
      kind: "app-state",
      dir: path.join(home, ".codex")
    },
    {
      name: "codebuddy",
      kind: "cli-config",
      dir: path.join(home, ".codebuddy")
    },
    {
      name: "claude",
      kind: "cli-config",
      dir: path.join(home, ".claude")
    },
    {
      name: "claude-desktop",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Claude")
    },
    {
      name: "gemini",
      kind: "cli-config",
      dir: path.join(home, ".gemini")
    },
    {
      name: "antigravity",
      kind: "app-state",
      dir: path.join(home, ".antigravity")
    },
    {
      name: "antigravity-cockpit",
      kind: "app-state",
      dir: path.join(home, ".antigravity_cockpit")
    },
    {
      name: "antigravity-gemini",
      kind: "app-state",
      dir: path.join(home, ".gemini", "antigravity")
    },
    {
      name: "marvis",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Tencent", "Marvis")
    },
    {
      name: "qclaw",
      kind: "app-state",
      dir: path.join(home, ".qclaw")
    },
    {
      name: "coze",
      kind: "app-state",
      dir: path.join(home, ".coze")
    },
    {
      name: "openclaw",
      kind: "app-state",
      dir: path.join(home, ".openclaw")
    },
    {
      name: "cc-switch",
      kind: "app-state",
      dir: path.join(home, ".cc-switch")
    },
    {
      name: "opencode",
      kind: "skill-config",
      dir: path.join(home, ".config", "opencode")
    },
    {
      name: "mimocode",
      kind: "skill-config",
      dir: path.join(home, ".config", "mimocode")
    },
    {
      name: "grok",
      kind: "cli-config",
      dir: path.join(home, ".grok")
    },
    {
      name: "cursor",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Cursor")
    },
    {
      name: "windsurf",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Windsurf")
    },
    {
      name: "vscode",
      kind: "editor-state",
      dir: path.join(home, "AppData", "Roaming", "Code")
    },
    {
      name: "continue",
      kind: "extension-state",
      dir: path.join(home, ".continue")
    },
    {
      name: "cline",
      kind: "extension-state",
      dir: path.join(home, "AppData", "Roaming", "Code", "User", "globalStorage", "saoudrizwan.claude-dev")
    },
    {
      name: "roo-code",
      kind: "extension-state",
      dir: path.join(home, "AppData", "Roaming", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline")
    },
    {
      name: "trae",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Trae")
    },
    {
      name: "kiro",
      kind: "app-state",
      dir: path.join(home, ".kiro")
    },
    {
      name: "zed",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Zed")
    },
    {
      name: "chatgpt",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "ChatGPT")
    },
    {
      name: "ollama",
      kind: "local-model-runtime",
      dir: path.join(home, ".ollama")
    },
    {
      name: "lmstudio",
      kind: "local-model-runtime",
      dir: path.join(home, ".lmstudio")
    },
    {
      name: "jan",
      kind: "local-model-runtime",
      dir: path.join(home, "jan")
    },
    {
      name: "anythingllm",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "anythingllm-desktop")
    },
    {
      name: "cherry-studio",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "CherryStudio")
    },
    {
      name: "dify",
      kind: "app-state",
      dir: path.join(home, "AppData", "Roaming", "Dify")
    },
    {
      name: "open-webui",
      kind: "app-state",
      dir: path.join(home, ".open-webui")
    },
    {
      name: "aider",
      kind: "cli-config",
      dir: path.join(home, ".aider")
    },
    {
      name: "tabby",
      kind: "extension-state",
      dir: path.join(home, ".tabby")
    },
    {
      name: "codeium",
      kind: "extension-state",
      dir: path.join(home, ".codeium")
    },
    {
      name: "augment",
      kind: "extension-state",
      dir: path.join(home, ".augment")
    },
    {
      name: "supermaven",
      kind: "extension-state",
      dir: path.join(home, ".supermaven")
    }
  ];

  const installTargets = getInstallTargets(memoryDir);
  const tools = checks.map((check) => {
    // Use enhanced detection for vscode
    if (check.name === 'vscode') {
      const enhanced = detectVSCodeEnhanced();
      return enrichToolConnection(enhanced, memoryDir, installTargets);
    }

    return enrichToolConnection({
      name: check.name,
      kind: check.kind,
      installed: fs.existsSync(check.dir),
      dir: check.dir,
      files: fs.existsSync(check.dir) ? summarizeDir(check.dir) : []
    }, memoryDir, installTargets);
  });

  return tools;
}

function enrichToolConnection(tool, memoryDir, installTargets) {
  const target = getInstallTargetForTool(memoryDir, tool.name, installTargets);
  const instructionFile = target?.file || path.join(memoryDir, "tools", `${tool.name}-shared-memory.md`);
  const instruction = inspectSharedMemoryInstructions(instructionFile);
  const configured = instruction.configured;
  const runner = getToolRunner(tool.name);
  const connected = Boolean(tool.installed && configured);
  let connectionStatus = "missing";
  let action = "Install the tool first, then run ai-memory-hub connect --apply.";

  if (tool.installed && configured && instruction.skillLayer) {
    connectionStatus = runner.available ? "connected-runnable" : "connected-shared-state";
    action = runner.available
      ? "Ready for shared memory and verified dispatch runner."
      : "Ready for shared memory; no verified automatic runner yet.";
  } else if (tool.installed && configured) {
    connectionStatus = "connected-legacy";
    action = `Run ai-memory-hub install --tool ${tool.name} --apply to add the Shared Skill Layer.`;
  } else if (tool.installed) {
    connectionStatus = "detected-unconfigured";
    action = `Run ai-memory-hub connect --apply or ai-memory-hub install --tool ${tool.name} --apply.`;
  } else if (configured) {
    connectionStatus = instruction.skillLayer ? "preconfigured-missing" : "preconfigured-legacy";
    action = instruction.skillLayer
      ? "Adapter note exists; install or launch the tool to use it."
      : `Adapter note exists but needs Shared Skill Layer v${SHARED_SKILL_LAYER_VERSION}.`;
  }

  return {
    ...tool,
    configured,
    connected,
    connectionStatus,
    skillLayer: instruction.skillLayer,
    skillLayerVersion: instruction.skillLayerVersion,
    skillLayerStatus: instruction.status,
    runnable: Boolean(runner.available),
    runnerReason: runner.available ? "" : runner.reason || "",
    runnerProfile: runner.promptMode || "",
    runnerCommand: runner.commandPath || "",
    runnerCommandKind: runner.commandKind || "",
    runnerUsesShell: Boolean(runner.usesShell),
    sharedStateOnly: Boolean(runner.sharedStateOnly),
    instructionFile,
    action
  };
}

function hasSharedMemoryInstructions(file) {
  return inspectSharedMemoryInstructions(file).configured;
}



function getInstallTargetForTool(memoryDir, toolName, installTargets) {
  const targets = installTargets || getInstallTargets(memoryDir);
  return targets.find((target) => target.tool === toolName) || null;
}



function resolveReference(query, config, options = {}) {
  const normalizedQuery = normalizeResolveQuery(query);
  const fromFile = options.fromFile ? resolvePossiblyHomePath(options.fromFile) : "";
  const records = Array.isArray(options.records)
    ? options.records
    : buildMemoryIndex(readLedger(config.memoryDir), config).records;
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidatePath, source, evidence = "", confidence = 50) => {
    const resolvedPath = normalizeCandidatePath(candidatePath);
    if (!resolvedPath || !pathMatchesResolveQuery(resolvedPath, normalizedQuery)) {
      return;
    }
    const key = resolvedPath.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      path: resolvedPath,
      exists: fs.existsSync(resolvedPath),
      source,
      confidence,
      evidence: sanitizeInlineText(evidence).slice(0, 240)
    });
  };

  for (const candidate of getDirectResolveCandidates(normalizedQuery, config, fromFile)) {
    addCandidate(candidate.path, candidate.source, candidate.evidence, candidate.confidence);
  }

  for (const record of records) {
    const text = String(record.text || "");
    if (!text || !textMentionsResolveQuery(text, normalizedQuery)) {
      continue;
    }
    for (const candidatePath of extractFilesystemPathCandidates(text)) {
      addCandidate(
        candidatePath,
        `memory:${record.localEventId || record.id || record.source || "record"}`,
        text,
        70 + Math.min(25, Number(record.importance || 0) / 4)
      );
    }
  }

  candidates.sort((a, b) =>
    Number(b.exists) - Number(a.exists) ||
    Number(b.confidence || 0) - Number(a.confidence || 0) ||
    a.path.localeCompare(b.path)
  );
  const limited = candidates.slice(0, Number(options.limit || 10));
  return {
    ok: limited.length > 0,
    query,
    normalizedQuery,
    fromFile,
    best: limited[0] || null,
    candidates: limited
  };
}








function analyzeInstructionIncludes(config, options = {}) {
  const records = Array.isArray(options.records) ? options.records : buildMemoryIndex(readLedger(config.memoryDir), config).records;
  const files = getInstructionIncludeFiles(config.memoryDir);
  const diagnostics = {
    filesScanned: 0,
    includesChecked: 0,
    missing: []
  };
  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }
    diagnostics.filesScanned += 1;
    const text = fs.readFileSync(file, "utf8");
    for (const include of extractInstructionIncludes(text)) {
      diagnostics.includesChecked += 1;
      const expectedPath = path.resolve(path.dirname(file), normalizeResolveQuery(include));
      if (fs.existsSync(expectedPath)) {
        continue;
      }
      const resolved = resolveReference(include, config, {
        fromFile: file,
        records,
        limit: 5
      });
      diagnostics.missing.push({
        file,
        include,
        expectedPath,
        suggestions: resolved.candidates.filter((candidate) => candidate.exists).slice(0, 5)
      });
    }
  }
  diagnostics.ok = diagnostics.missing.length === 0;
  return diagnostics;
}

function getInstructionIncludeFiles(memoryDir) {
  const targets = [
    ...getInstallTargets(memoryDir),
    ...getLocalInstallTargets(process.cwd(), memoryDir)
  ];
  const files = new Set();
  for (const target of targets) {
    if (target.file) {
      files.add(path.resolve(target.file));
    }
  }
  return [...files].sort();
}



function sendStaticFile(res, pathname) {
  const publicDir = getDashboardStaticRoot();
  const relativePath = getSafeStaticRelativePath(pathname);
  if (!relativePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  const filePath = path.join(publicDir, relativePath);
  const normalizedFilePath = path.resolve(filePath);
  const normalizedPublicDir = path.resolve(publicDir);

  if (!normalizedFilePath.startsWith(normalizedPublicDir + path.sep) && normalizedFilePath !== normalizedPublicDir) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(normalizedFilePath) || !fs.statSync(normalizedFilePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(normalizedFilePath);
  const contentTypeMap = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".html": "text/html; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  };

  res.writeHead(200, {
    "Content-Type": contentTypeMap[ext] || "text/plain",
    "Cache-Control": "public, max-age=3600"
  });
  fs.createReadStream(normalizedFilePath).pipe(res);
}




// ── Phase 1.0: 可观测性 ───────────────────────────────────────────────
// 请求级延迟直方图 + 错误计数，供 /api/metrics 复用。
const requestMetrics = {
  total: 0,
  byStatus: Object.create(null),
  byPath: Object.create(null), // path → { count, totalMs, errors, maxMs }
  errors: 0,
  startedAt: Date.now()
};

function recordRequestMetric(method, path, status, ms, isError) {
  requestMetrics.total += 1;
  const bucket = String(status).startsWith("2") || String(status).startsWith("3") ? "2xx3xx" : String(status);
  requestMetrics.byStatus[bucket] = (requestMetrics.byStatus[bucket] || 0) + 1;
  if (isError) requestMetrics.errors += 1;
  const key = `${method} ${path}`;
  const slot = requestMetrics.byPath[key] || (requestMetrics.byPath[key] = { count: 0, totalMs: 0, errors: 0, maxMs: 0 });
  slot.count += 1;
  slot.totalMs += ms;
  slot.errors += isError ? 1 : 0;
  if (ms > slot.maxMs) slot.maxMs = ms;
}

function getRequestMetricsSnapshot() {
  const paths = Object.entries(requestMetrics.byPath)
    .map(([key, v]) => ({ path: key, count: v.count, avgMs: Math.round(v.totalMs / v.count), maxMs: v.maxMs, errors: v.errors }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  return {
    uptimeMs: Date.now() - requestMetrics.startedAt,
    total: requestMetrics.total,
    errors: requestMetrics.errors,
    byStatus: requestMetrics.byStatus,
    topPaths: paths
  };
}

// 统一错误信封：仅用于未捕获异常，局部 400/404 保持原样不动（不破坏前端契约）。



function sendStaticAsset(res, pathname) {
  const publicDir = getDashboardStaticRoot();
  const relativePath = getSafeStaticRelativePath(pathname);
  if (!relativePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  const assetPath = path.join(publicDir, relativePath);
  const assetsRoot = path.join(publicDir, "assets");
  const normalizedAssetPath = path.resolve(assetPath);
  const normalizedAssetsRoot = path.resolve(assetsRoot);

  if (!normalizedAssetPath.startsWith(normalizedAssetsRoot + path.sep) && normalizedAssetPath !== normalizedAssetsRoot) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(normalizedAssetPath) || !fs.statSync(normalizedAssetPath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": getContentType(normalizedAssetPath),
    "Cache-Control": "public, max-age=31536000, immutable"
  });
  fs.createReadStream(normalizedAssetPath).pipe(res);
}






function readLedger(memoryDir) {
  return readEvents(path.join(memoryDir, "memories", "ledger.jsonl"))
    .map((item) => {
      const baseMetadata = normalizeMemoryMetadata(item.metadata || {}, item);
      const access = getMemoryAccessStats({ ...item, metadata: baseMetadata });
      const metadata = mergeMemoryAccessMetadata(baseMetadata, access);
      const record = {
        ...item,
        id: item.id || createId(item.text || JSON.stringify(item)),
        localEventId: item.localEventId || item.local_event_id || "",
        schemaVersion: item.schemaVersion || 1,
        ts: item.ts || item.createdAt || "",
        indexedAt: item.indexedAt || "",
        source: item.source || metadata.source || "unknown",
        text: item.text || item.memory || "",
        device: item.device || metadata.device || "",
        metadata
      };
      return applyMemoryAccessFields(record, access);
    })
    .filter((item) => item.text);
}















// Workflow node history (P0: workflow execution history with node states)


// Read every workflow's current nodes in a single pass over nodes.jsonl.
// Returns a Map of workflowId -> sorted node array. Used by readWorkflows to
// avoid re-reading the file once per derived-status workflow.


// ─────────────────────────────────────────────────────────────────────────────
// Approval Gates
// ─────────────────────────────────────────────────────────────────────────────




// Permission policy layer (P0: capability permission matrix)



function normalizePolicyRule(rule) {
  const operation = String(rule.operation || "").trim();
  const decision = String(rule.decision || "").trim();
  const scope = POLICY_SCOPES.includes(rule.scope) ? rule.scope : "all";
  const now = new Date().toISOString();
  return {
    type: "policy.rule",
    id: rule.id || createId(`policy:${rule.actor}:${rule.project}:${operation}:${scope}`),
    actor: String(rule.actor || "*").trim() || "*",
    project: String(rule.project || "*").trim() || "*",
    operation,
    scope,
    decision,
    reason: String(rule.reason || "").trim(),
    priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
    createdAt: rule.createdAt || now,
    createdBy: rule.createdBy || "manual",
    ts: now
  };
}

function appendPolicyRule(memoryDir, rule) {
  if (!POLICY_OPERATIONS.includes(rule.operation)) {
    throw new Error(`Invalid operation: ${rule.operation}. Valid: ${POLICY_OPERATIONS.join(", ")}`);
  }
  if (!POLICY_DECISIONS.includes(rule.decision)) {
    throw new Error(`Invalid decision: ${rule.decision}. Valid: ${POLICY_DECISIONS.join(", ")}`);
  }
  if (rule.scope && !POLICY_SCOPES.includes(rule.scope)) {
    throw new Error(`Invalid scope: ${rule.scope}. Valid: ${POLICY_SCOPES.join(", ")}`);
  }
  const file = getPolicyRulesFile(memoryDir);
  ensureDir(path.dirname(file));
  const normalized = normalizePolicyRule(rule);
  appendJsonl(file, normalized);
  return normalized;
}


function seedDefaultPolicyRules(memoryDir) {
  const existing = readPolicyRules(memoryDir);
  const seededOps = new Set(
    existing
      .filter((rule) => rule.actor === "*" && rule.project === "*" && rule.scope === "all" && rule.priority === 0)
      .map((rule) => rule.operation)
  );
  let added = 0;
  for (const seed of POLICY_DEFAULT_SEED) {
    if (seededOps.has(seed.operation)) {
      continue;
    }
    appendPolicyRule(memoryDir, {
      actor: "*",
      project: "*",
      scope: "all",
      operation: seed.operation,
      decision: seed.decision,
      reason: seed.reason,
      priority: 0,
      createdBy: "system"
    });
    added += 1;
  }
  return added;
}

// Actor query carries the literal actor plus any roles it holds (e.g. ["role:executor"]).

function policyScopeMatches(rule, scope) {
  // A rule applies if its scope is at least as broad as the queried scope.
  return POLICY_SCOPE_BREADTH[rule.scope] >= POLICY_SCOPE_BREADTH[scope];
}


function resolvePermission(memoryDir, { actor = "*", actorRoles = [], project = "*", operation, scope = "all" }) {
  if (!POLICY_OPERATIONS.includes(operation)) {
    throw new Error(`Invalid operation: ${operation}. Valid: ${POLICY_OPERATIONS.join(", ")}`);
  }
  if (!POLICY_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Valid: ${POLICY_SCOPES.join(", ")}`);
  }
  let rules = readPolicyRules(memoryDir);
  if (rules.length === 0) {
    seedDefaultPolicyRules(memoryDir);
    rules = readPolicyRules(memoryDir);
  }
  const matches = rules.filter((rule) =>
    rule.operation === operation &&
    policyActorMatches(rule, actor, actorRoles) &&
    (rule.project === "*" || rule.project === project) &&
    policyScopeMatches(rule, scope)
  );
  if (matches.length > 0) {
    matches.sort((a, b) => {
      const specDelta = policyRuleSpecificity(b) - policyRuleSpecificity(a);
      if (specDelta !== 0) return specDelta;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return String(b.ts || "").localeCompare(String(a.ts || ""));
    });
    const top = matches[0];
    return { decision: top.decision, reason: top.reason, matchedRule: top };
  }
  // Fail-safe fallback when no rule matches.
  if (POLICY_DESTRUCTIVE_OPERATIONS.includes(operation)) {
    return { decision: "ask", reason: "No policy matched; destructive operation requires approval by default", matchedRule: null };
  }
  return { decision: "allow", reason: "No policy restricts this operation", matchedRule: null };
}







function filterProjects(projects, { status = "all", includeHidden = false } = {}) {
  const cleanStatus = String(status || "all").trim().toLowerCase();
  return projects
    .filter((project) => {
      if (cleanStatus === "all") return true;
      if (cleanStatus === "visible") return isProjectVisible(project);
      normalizeProjectStatus(cleanStatus);
      return project.status === cleanStatus;
    })
    .filter((project) => includeHidden || cleanStatus !== "visible" || !isHiddenProjectId(project.id))
    .sort((a, b) => String(a.displayName || a.name || a.id).localeCompare(String(b.displayName || b.name || b.id), "zh-Hans"));
}

function isProjectVisible(project) {
  return PROJECT_VISIBLE_STATUSES.includes(project.status) && !isHiddenProjectId(project.id);
}





function parseProjectResourceOptions(argv) {
  const resources = {};
  for (const key of ["feishu", "repo", "docs"]) {
    const value = getOption(argv, `--${key}`);
    if (value !== "") {
      resources[key] = key === "docs" ? parseProjectListOption(value) : value;
    }
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--resource") {
      continue;
    }
    const raw = argv[index + 1] || "";
    const equals = raw.indexOf("=");
    if (equals > 0) {
      const key = raw.slice(0, equals).trim();
      const value = raw.slice(equals + 1).trim();
      if (key && value) {
        resources[key] = value;
      }
    }
  }
  return resources;
}


function mergeSeedProjects(projects) {
  const merged = [...projects];
  for (const seed of getSeedProjects()) {
    const identities = uniqueStringList([seed.id, seed.name, seed.displayName, ...(seed.aliases || [])]);
    const exists = identities.some((identity) => findProjectIndex(merged, identity) !== -1);
    if (!exists) {
      merged.push(seed);
    }
  }
  return merged;
}

function getSeedProjects() {
  return [
    {
      id: "ai-memory-hub",
      name: "AI Memory Hub",
      displayName: "AI Memory Hub",
      status: "active",
      type: "tool",
      description: "本地优先的多AI工具共享记忆中心",
      metadata: {},
      aliases: [],
      resources: {
        repo: "https://github.com/<owner>/ai-memory-hub"
      },
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-11T12:00:00Z"
    }
  ].map(normalizeProject);
}





function spawnWorkflowTasks(memoryDir, workflow) {
  const tasks = readTasks(memoryDir);
  const linkedTasks = [];
  for (const [role, assignees] of Object.entries({
    planner: workflow.planner,
    executor: workflow.executor,
    reviewer: workflow.reviewer,
    observer: workflow.observer
  })) {
    for (const assignee of assignees || []) {
      const task = {
        ...createTask({
          title: `[workflow:${workflow.id}] ${role}: ${workflow.title}`,
          description: workflow.plan || workflow.acceptance || "",
          handoff: `Workflow ${workflow.id}; role=${role}`,
          createdBy: workflow.createdBy,
          project: workflow.project,
          priority: workflow.priority,
          qualityGate: workflow.qualityGate
        }),
        assignee,
        status: "claimed"
      };
      tasks.push(task);
      linkedTasks.push(task.id);
    }
  }
  writeTasks(memoryDir, tasks);
  updateWorkflow(memoryDir, workflow.id, (current) => ({ ...current, linkedTasks }));
}

function notifyWorkflowRoles(memoryDir, workflow) {
  const recipients = new Set([
    ...(workflow.planner || []),
    ...(workflow.executor || []),
    ...(workflow.reviewer || []),
    ...(workflow.observer || [])
  ].filter(Boolean));
  const linkedRadio = [];
  for (const to of recipients) {
    const message = createRadioMessage({
      from: workflow.createdBy,
      to,
      type: "handoff",
      text: `[workflow:${workflow.id}] ${workflow.title}`,
      thread: workflow.id,
      project: workflow.project
    });
    appendJsonl(path.join(memoryDir, "radio", "messages.jsonl"), message);
    linkedRadio.push(message.id);
  }
  updateWorkflow(memoryDir, workflow.id, (current) => ({ ...current, linkedRadio }));
}














// Session Handoff Functions








// RPC Functions






// Notification Bus Functions







// Context Pack Functions
function createContextPack({ taskId, workflowId, project, query }) {
  const memoryDir = loadConfig().memoryDir;

  const pack = {
    id: createId(`context:${taskId || workflowId}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    taskId: taskId || "",
    workflowId: workflowId || "",
    project: project || "",
    task: null,
    workflow: null,
    relevantMemories: [],
    recentRadio: [],
    skills: [],
    relations: [],
    sharedState: null,
    projectPath: process.cwd(),
    constraints: [],
    acceptanceCriteria: []
  };

  // Load task or workflow details
  if (taskId) {
    const tasks = readTasks(memoryDir);
    pack.task = tasks.find((t) => t.id === taskId || t.id.startsWith(taskId));
  }

  if (workflowId) {
    const workflows = readWorkflows(memoryDir);
    pack.workflow = workflows.find((w) => w.id === workflowId || w.id.startsWith(workflowId));
    if (pack.workflow) {
      pack.sharedState = buildWorkflowSharedState({
        workflow: pack.workflow,
        nodes: readWorkflowNodes(memoryDir, pack.workflow.id),
        tasks: readTasks(memoryDir),
        radio: readRadioMessages(memoryDir),
        updatedAt: pack.workflow.updatedAt
      });
    }
  }

  if (project) {
    pack.relations.push(...listRelatedEntities(memoryDir, { type: "project", id: project }).explicit, ...listRelatedEntities(memoryDir, { type: "project", id: project }).suggestions);
  }
  for (const skillId of pack.task?.skills || []) {
    const related = listRelatedEntities(memoryDir, { type: "skill", id: skillId });
    pack.relations.push(...related.explicit, ...related.suggestions);
  }
  pack.relations = [...new Map(pack.relations.map((relation) => [relation.id, relation])).values()].slice(0, 40);

  // Search relevant memories
  if (query || pack.task || pack.workflow) {
    const searchQuery = query || pack.task?.title || pack.workflow?.title || "";
    pack.relevantMemories = searchMemoriesForContext(memoryDir, searchQuery, project, 10);
    pack.skills = searchSkills(memoryDir, searchQuery).slice(0, 5);
  }

  // Get recent radio messages for this project
  if (project) {
    pack.recentRadio = readRadioMessages(memoryDir)
      .filter((m) => m.project === project)
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
      .slice(0, 10);
  }

  return pack;
}

function searchMemoriesForContext(memoryDir, query, project, limit = 10) {
  try {
    // 原实现读 INDEX.md 再交给 parseIndexFile —— 但 INDEX.md 只有统计与
    // top N 主题/项目/标签，不含任何记忆条目，而 parseIndexFile 在代码库里
    // 从来就不存在（a657fc9 引入的疏漏）。整段被 try/catch 包住，所以只是
    // 静默返回空数组：context pack 永远搜不到记忆，看不到任何报错。
    // 改成读结构化索引 memories/index.json 的 records，字段与 searchMemories
    // 期望的 text / kind / source / project / tags 完全对齐。
    const indexPath = path.join(memoryDir, "memories", "index.json");
    if (!fs.existsSync(indexPath)) {
      return [];
    }

    const records = readJson(indexPath).records || [];
    const projectRecords = project ? records.filter((r) => r.project === project) : records;

    if (!query) {
      return projectRecords.slice(0, limit).map((r) => ({
        text: r.text,
        kind: r.kind,
        source: r.source,
        project: r.project
      }));
    }

    const scored = searchMemories(projectRecords, query);
    return scored.slice(0, limit).map((r) => ({
      text: r.text,
      kind: r.kind,
      source: r.source,
      project: r.project,
      score: r.score
    }));
  } catch (error) {
    return [];
  }
}



// Scheduler Queue Functions







// Workflow Recipe Functions
function readRecipe(memoryDir, recipeName) {
  for (const location of recipeReadLocations(memoryDir)) {
    const file = path.join(location.dir, `${recipeName}.json`);
    if (fs.existsSync(file)) {
      return readJson(file);
    }
  }
  return null;
}

function listRecipes(memoryDir) {
  const recipes = new Map();
  for (const location of recipeListLocations(memoryDir)) {
    if (!fs.existsSync(location.dir)) {
      continue;
    }
    const files = fs.readdirSync(location.dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const recipe = readJson(path.join(location.dir, file));
        const name = recipe.name || path.basename(file, ".json");
        recipes.set(name, {
          name,
          title: recipe.title,
          description: recipe.description,
          version: recipe.version,
          source: location.source,
          roles: Object.keys(recipe.roles || {}),
          steps: (recipe.steps || []).length
        });
      } catch {
        // Skip malformed recipes; recipe validate reports details for explicit names.
      }
    }
  }
  return Array.from(recipes.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function recipeReadLocations(memoryDir) {
  return [
    { source: "user", dir: path.join(memoryDir, "recipes") },
    { source: "builtin", dir: path.join(projectRoot(), "recipes") }
  ];
}

function recipeListLocations(memoryDir) {
  return [
    { source: "builtin", dir: path.join(projectRoot(), "recipes") },
    { source: "user", dir: path.join(memoryDir, "recipes") }
  ];
}





function validateQualityGateFields(source, label) {
  if (!isPlainObject(source)) {
    return { valid: false, error: `${label} must be an object` };
  }
  if (hasOwnField(source, "verifyCommands")) {
    if (!Array.isArray(source.verifyCommands)) {
      return { valid: false, error: `${label}.verifyCommands must be an array` };
    }
    for (const [index, command] of source.verifyCommands.entries()) {
      const validation = validateVerifyCommand(command, `${label}.verifyCommands[${index}]`);
      if (!validation.valid) {
        return validation;
      }
    }
  }
  for (const field of RECIPE_GATE_STRING_ARRAY_FIELDS) {
    if (hasOwnField(source, field)) {
      if (!Array.isArray(source[field]) || source[field].some((item) => typeof item !== "string" || item.trim() === "")) {
        return { valid: false, error: `${label}.${field} must be an array of non-empty strings` };
      }
    }
  }
  if (hasOwnField(source, "reviewDimensions")) {
    const validation = validateReviewDimensions(source.reviewDimensions);
    if (!validation.valid) {
      return { valid: false, error: `${label}.${validation.error}` };
    }
  }
  if (hasOwnField(source, "reviewRequired") && typeof source.reviewRequired !== "boolean") {
    return { valid: false, error: `${label}.reviewRequired must be a boolean` };
  }
  if (hasOwnField(source, "maxRepairAttempts") && (!Number.isInteger(source.maxRepairAttempts) || source.maxRepairAttempts < 0)) {
    return { valid: false, error: `${label}.maxRepairAttempts must be a non-negative integer` };
  }
  if (hasOwnField(source, "minimalImplementation")) {
    const validation = validateMinimalImplementation(source.minimalImplementation, `${label}.minimalImplementation`);
    if (!validation.valid) {
      return validation;
    }
  }
  if (hasOwnField(source, "dependencyBudget")) {
    const validation = validateDependencyBudget(source.dependencyBudget, `${label}.dependencyBudget`);
    if (!validation.valid) {
      return validation;
    }
  }
  if (hasOwnField(source, "adversarialVerifier")) {
    const validation = validateAdversarialVerifier(source.adversarialVerifier);
    if (!validation.valid) {
      return { valid: false, error: `${label}.${validation.error}` };
    }
  }
  return { valid: true };
}









function validateQualityGate(source, label) {
  if (!isPlainObject(source)) {
    return { valid: true };
  }
  for (const containerField of ["qualityGate", "gates"]) {
    if (hasOwnField(source, containerField)) {
      const validation = validateQualityGateFields(source[containerField], `${label}.${containerField}`);
      if (!validation.valid) {
        return validation;
      }
    }
  }
  const directFields = {};
  for (const field of RECIPE_GATE_FIELDS) {
    if (hasOwnField(source, field)) {
      directFields[field] = source[field];
    }
  }
  if (Object.keys(directFields).length > 0) {
    const validation = validateQualityGateFields(directFields, label);
    if (!validation.valid) {
      return validation;
    }
  }
  return { valid: true };
}

function validateRecipe(recipe) {
  if (!recipe.name || !recipe.title) {
    return { valid: false, error: "Recipe must have name and title" };
  }

  if (!recipe.roles || Object.keys(recipe.roles).length === 0) {
    return { valid: false, error: "Recipe must define at least one role" };
  }

  if (!recipe.steps || recipe.steps.length === 0) {
    return { valid: false, error: "Recipe must have at least one step" };
  }

  const recipeGateValidation = validateQualityGate(recipe, "Recipe");
  if (!recipeGateValidation.valid) {
    return recipeGateValidation;
  }

  // Check all step roles are defined
  for (const step of recipe.steps) {
    if (!step.id || !step.task) {
      return { valid: false, error: "Recipe steps must have id and task" };
    }
    if (!recipe.roles[step.role]) {
      return { valid: false, error: `Step ${step.id} references undefined role: ${step.role}` };
    }
    if (step.dependsOn && (!Array.isArray(step.dependsOn) || step.dependsOn.some((depId) => typeof depId !== "string" || depId.trim() === ""))) {
      return { valid: false, error: `Step ${step.id} dependsOn must be an array of non-empty strings` };
    }
    const stepGateValidation = validateQualityGate(step, `Step ${step.id}`);
    if (!stepGateValidation.valid) {
      return stepGateValidation;
    }
  }

  // Check dependsOn references exist
  for (const step of recipe.steps) {
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        const depExists = recipe.steps.some((s) => s.id === depId);
        if (!depExists) {
          return { valid: false, error: `Step ${step.id} depends on non-existent step: ${depId}` };
        }
      }
    }
  }

  return { valid: true };
}

function createWorkflowFromRecipe(memoryDir, recipeName, toolMapping, variables) {
  const recipe = readRecipe(memoryDir, recipeName);

  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeName}`);
  }

  const validation = validateRecipe(recipe);
  if (!validation.valid) {
    throw new Error(`Invalid recipe: ${validation.error}`);
  }

  // Merge variables
  const vars = { ...recipe.variables, ...variables };
  const roleNames = Object.keys(recipe.roles);
  const recipeGateInput = extractQualityGate(recipe);
  const maxRepairAttempts = normalizeNonNegativeInteger(vars.maxRepairAttempts);
  if (maxRepairAttempts !== null && Object.keys(recipeGateInput).length > 0) {
    recipeGateInput.maxRepairAttempts = maxRepairAttempts;
  }
  const recipeGate = normalizeQualityGate(recipeGateInput);
  const recipeMetadata = normalizeRecipeMetadata({
    name: recipe.name || recipeName,
    title: recipe.title,
    version: recipe.version,
    variables: vars,
    steps: recipe.steps.length
  });

  // Create workflow
  const workflow = createWorkflow({
    title: `${recipe.title} - ${vars.project || 'default'}`,
    createdBy: "recipe",
    project: vars.project || "",
    priority: vars.priority || "normal",
    planner: toolMapping.planner || toolMapping[roleNames[0]] || "",
    executor: toolMapping.executor || toolMapping[roleNames[1]] || "",
    reviewer: toolMapping.reviewer || toolMapping[roleNames[2]] || "",
    observer: toolMapping.observer || toolMapping[roleNames[3]] || "",
    plan: `Recipe: ${recipeName}\nSteps: ${recipe.steps.length}`,
    acceptance: recipe.description || ""
  });
  workflow.recipe = recipeMetadata;
  if (Object.keys(recipeGate).length > 0) {
    workflow.qualityGate = recipeGate;
  }

  const workflows = readWorkflows(memoryDir);
  workflows.push(workflow);
  writeWorkflows(memoryDir, workflows);

  // Phase 4: Auto-create workflow nodes
  autoCreateWorkflowNodes(memoryDir, workflow);

  // Create tasks for each step
  const tasks = [];
  for (const step of recipe.steps) {
    const tool = toolMapping[step.role] || "";
    const task = createTask({
      title: `[${recipeName}] ${step.task}`,
      description: step.task,
      createdBy: "recipe",
      project: vars.project || "",
      priority: vars.priority || "normal"
    });

    if (tool) {
      task.assignee = tool;
    }

    if (step.dependsOn && step.dependsOn.length > 0) {
      task.handoff = `Depends on: ${step.dependsOn.join(", ")}`;
    }
    task.recipe = recipeMetadata;
    task.recipeStep = normalizeRecipeStepMetadata({
      id: step.id,
      role: step.role,
      dependsOn: step.dependsOn,
      workflowId: workflow.id
    });
    const stepGate = mergeQualityGates(recipeGate, extractQualityGate(step));
    if (Object.keys(stepGate).length > 0) {
      task.qualityGate = stepGate;
    }

    tasks.push(task);
  }

  // Write tasks
  const allTasks = readTasks(memoryDir);
  allTasks.push(...tasks);
  writeTasks(memoryDir, allTasks);

  return { workflow, tasks, recipe };
}

// Project Task Spec Functions
function loadTaskSpecContext(argv) {
  const projectRoot = path.resolve(getOption(argv, "--root") || process.cwd());
  const file = resolveTaskSpecFile(argv, projectRoot);
  const document = readJson(file);
  return {
    projectRoot,
    file,
    displayFile: path.relative(projectRoot, file).replace(/\\/g, "/") || path.basename(file),
    document
  };
}

function resolveTaskSpecFile(argv, projectRoot) {
  const fileArg = getOption(argv, "--file");
  if (fileArg) {
    const resolved = path.resolve(projectRoot, fileArg);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Task spec file not found: ${resolved}`);
    }
    return resolved;
  }

  for (const candidate of DEFAULT_TASK_SPEC_FILES) {
    const file = path.join(projectRoot, candidate);
    if (fs.existsSync(file)) {
      return file;
    }
  }

  throw new Error(`Task spec file not found. Tried: ${DEFAULT_TASK_SPEC_FILES.join(", ")}`);
}

function resolveTaskSpecFromArgs(argv, taskId) {
  const context = loadTaskSpecContext(argv);
  const validation = validateTaskSpecDocument(context.document);
  if (!validation.valid) {
    throw new Error(`Invalid task spec: ${validation.error}`);
  }
  const task = validation.tasks.find((item) => item.id === taskId || item.name === taskId);
  if (!task) {
    throw new Error(`Task spec not found: ${taskId}`);
  }
  return { task, context };
}

function validateTaskSpecDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { valid: false, error: "Task spec file must be a JSON object" };
  }
  const tasks = normalizeTaskSpecs(document);
  if (tasks.length === 0) {
    return { valid: false, error: "Task spec must define at least one task" };
  }

  const seen = new Set();
  for (const task of tasks) {
    if (!task.id) {
      return { valid: false, error: "Each task spec needs an id or object key" };
    }
    if (!/^[A-Za-z0-9_.:-]+$/.test(task.id)) {
      return { valid: false, error: `Task spec id contains unsupported characters: ${task.id}` };
    }
    if (seen.has(task.id)) {
      return { valid: false, error: `Duplicate task spec id: ${task.id}` };
    }
    seen.add(task.id);
    const command = selectPlatformCommand(task);
    if (!command) {
      return { valid: false, error: `Task spec ${task.id} requires command` };
    }
    if (!Array.isArray(task.args)) {
      return { valid: false, error: `Task spec ${task.id} args must be an array` };
    }
    if (!Number.isInteger(task.timeoutMs) || task.timeoutMs <= 0) {
      return { valid: false, error: `Task spec ${task.id} timeoutMs must be a positive integer` };
    }
    for (const verify of task.verify) {
      if (!selectPlatformCommand(verify)) {
        return { valid: false, error: `Task spec ${task.id} verify command requires command` };
      }
      if (!Array.isArray(verify.args)) {
        return { valid: false, error: `Task spec ${task.id} verify args must be an array` };
      }
    }
  }

  return { valid: true, tasks };
}

function normalizeTaskSpecs(document) {
  const rawTasks = document.tasks || document.commands || {};
  if (Array.isArray(rawTasks)) {
    return rawTasks.map((task) => normalizeTaskSpec(task));
  }
  if (rawTasks && typeof rawTasks === "object") {
    return Object.entries(rawTasks).map(([id, task]) => normalizeTaskSpec({ id, ...(task || {}) }));
  }
  return [];
}

function normalizeTaskSpec(task) {
  const normalized = normalizeTaskSpecCommand(task || {});
  return {
    ...normalized,
    id: String(task.id || task.name || "").trim(),
    name: String(task.name || task.id || "").trim(),
    title: String(task.title || task.name || task.id || "").trim(),
    description: String(task.description || ""),
    ports: normalizeTaskSpecList(task.ports),
    resources: normalizeTaskSpecList(task.resources),
    logs: normalizeTaskSpecLogs(task.logs),
    verify: normalizeTaskSpecVerify(task.verify)
  };
}

function normalizeTaskSpecCommand(commandSpec) {
  return {
    command: String(commandSpec.command || "").trim(),
    windowsCommand: String(commandSpec.windowsCommand || "").trim(),
    args: normalizeStringArray(commandSpec.args),
    cwd: String(commandSpec.cwd || "."),
    env: normalizeTaskSpecEnv(commandSpec.env),
    timeoutMs: Number(commandSpec.timeoutMs || DEFAULT_TASK_SPEC_TIMEOUT_MS),
    shell: Boolean(commandSpec.shell),
    logs: normalizeTaskSpecLogs(commandSpec.logs)
  };
}

function normalizeTaskSpecVerify(verify) {
  if (!verify) {
    return [];
  }
  const entries = Array.isArray(verify) ? verify : [verify];
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => normalizeTaskSpecCommand(entry));
}







function runTaskSpec(task, { projectRoot, runVerify = true, allowOutsideCwd = false } = {}) {
  const startedAt = new Date().toISOString();
  const main = runTaskSpecProcess(task, {
    projectRoot,
    phase: "command",
    inherit: task,
    allowOutsideCwd
  });

  const verification = {
    status: "skipped",
    commands: []
  };

  if (main.status === "passed" && runVerify && task.verify.length > 0) {
    verification.status = "passed";
    for (const verify of task.verify) {
      const result = runTaskSpecProcess(verify, {
        projectRoot,
        phase: "verify",
        inherit: task,
        allowOutsideCwd
      });
      verification.commands.push(result);
      if (result.status !== "passed") {
        verification.status = result.status;
        break;
      }
    }
  }

  const status = main.status === "passed" && ["passed", "skipped"].includes(verification.status)
    ? "passed"
    : main.status === "timed_out" || verification.status === "timed_out"
      ? "timed_out"
      : "failed";

  return {
    taskId: task.id,
    title: task.title,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    command: main,
    verification
  };
}

function runTaskSpecProcess(commandSpec, { projectRoot, phase, inherit = {}, allowOutsideCwd = false } = {}) {
  const cwd = resolveTaskSpecCwd(projectRoot, commandSpec.cwd || inherit.cwd || ".", allowOutsideCwd);
  const commandName = selectPlatformCommand(commandSpec);
  const commandPaths = resolveCommandPaths(commandName);
  const resolvedCommand = choosePreferredCommandPath(commandPaths) || commandName;
  const args = commandSpec.args || [];
  const timeoutMs = commandSpec.timeoutMs || inherit.timeoutMs || DEFAULT_TASK_SPEC_TIMEOUT_MS;
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const useCmdLauncher = process.platform === "win32" && shouldUseShellForCommand(resolvedCommand);
  const usesShell = Boolean(commandSpec.shell) || useCmdLauncher;
  const spawnCommand = useCmdLauncher ? buildWindowsCmdLine(resolvedCommand, args) : resolvedCommand;
  const spawnArgs = useCmdLauncher ? [] : args;
  const completed = spawnSync(spawnCommand, spawnArgs, {
    cwd,
    env: {
      ...process.env,
      ...(inherit.env || {}),
      ...(commandSpec.env || {})
    },
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    shell: usesShell
  });
  const finishedAtMs = Date.now();
  const status = getTaskSpecProcessStatus(completed);
  const logs = writeTaskSpecProcessLogs(projectRoot, commandSpec.logs || {}, completed);
  return {
    phase,
    command: commandName,
    resolvedCommand,
    args,
    commandLine: [commandName, ...args].map((part) => String(part)).join(" "),
    cwd: path.relative(projectRoot, cwd).replace(/\\/g, "/") || ".",
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    timeoutMs,
    exitCode: completed.status ?? null,
    status,
    error: completed.error?.message || "",
    stdout: trimOutput(completed.stdout, 2000),
    stderr: trimOutput(completed.stderr, 2000),
    logs
  };
}






function normalizeMemoryMetadata(metadata = {}, fallback = {}) {
  const normalized = { ...metadata };
  normalized.kind = normalizeMemoryKind(normalized.kind || normalized.type || fallback.kind || fallback.type || "note");
  normalized.project = normalizeMemoryProject(normalized.project || fallback.project || "");
  normalized.tags = normalizeList(normalized.tags?.length ? normalized.tags : fallback.tags);
  normalized.scope = normalizeMemoryScope(normalized.scope || fallback.scope || "");
  normalized.refs = normalizeMemoryRefs(normalized.refs || normalized.references || {}, { ...fallback, ...normalized });
  normalized.confidence = normalizeConfidence(normalized.confidence ?? fallback.confidence);
  normalized.device = normalized.device || fallback.device || os.hostname();
  return normalized;
}












function parseMemoryFilters(argv) {
  return {
    project: getOption(argv, "--project") || "",
    tags: parseMemoryTagFilters(argv),
    thread: getOption(argv, "--thread") || "",
    taskId: getOption(argv, "--task") || getOption(argv, "--task-id") || "",
    workflowId: getOption(argv, "--workflow") || getOption(argv, "--workflow-id") || "",
    radioId: getOption(argv, "--radio") || getOption(argv, "--radio-id") || ""
  };
}




function filterMemoryRecords(records, filters = {}) {
  return records
    .filter((record) => isMemoryLifecycleVisible(record))
    .filter((record) => filters.project ? record.project === normalizeMemoryProject(filters.project) : true)
    .filter((record) => matchesMemoryTags(record, filters.tags))
    .filter((record) => matchesMemoryRef(record, "thread", filters.thread))
    .filter((record) => matchesMemoryRef(record, "taskId", filters.taskId))
    .filter((record) => matchesMemoryRef(record, "workflowId", filters.workflowId))
    .filter((record) => matchesMemoryRef(record, "radioId", filters.radioId));
}





function recordMemoryAccess(ledger, results, accessedAt = new Date().toISOString()) {
  const resultKeys = new Set(results.flatMap((result) => getMemoryIdentityKeys(result)));
  if (resultKeys.size === 0) {
    return { ledger, updated: 0 };
  }

  let updated = 0;
  const updatedLedger = ledger.map((record) => {
    const matched = getMemoryIdentityKeys(record).some((key) => resultKeys.has(key));
    if (!matched) {
      return record;
    }
    updated++;
    return touchMemoryAccess(record, accessedAt);
  });

  return { ledger: updatedLedger, updated };
}








function scoreMemoryAccessHeat(access = {}) {
  const count = normalizeMemoryAccessCount(access.accessCount);
  if (count <= 0) {
    return 0;
  }
  const countBoost = Math.min(MEMORY_ACCESS_MAX_HEAT, Math.log2(count + 1) * 3);
  const daysSinceAccess = getDaysSinceTimestamp(access.lastAccessedAt);
  const recencyBoost = access.lastAccessedAt && daysSinceAccess <= MEMORY_ACCESS_RECENT_DAYS ? 2 : 0;
  return Math.min(MEMORY_ACCESS_MAX_HEAT, Math.round(countBoost + recencyBoost));
}

function scoreStaleMemoryAccessPenalty(access = {}) {
  if (!access.hasAccessTelemetry || !access.lastAccessedAt) {
    return 0;
  }
  const daysSinceAccess = getDaysSinceTimestamp(access.lastAccessedAt);
  if (daysSinceAccess <= MEMORY_ACCESS_STALE_AFTER_DAYS) {
    return 0;
  }
  return Math.min(
    MEMORY_ACCESS_MAX_STALE_PENALTY,
    Math.ceil((daysSinceAccess - MEMORY_ACCESS_STALE_AFTER_DAYS) * MEMORY_ACCESS_STALE_DECAY_RATE_PER_DAY)
  );
}


function rebuildMemoryOutputs(config, ledger) {
  const index = buildMemoryIndex(ledger, config);
  writeFileAtomic(path.join(config.memoryDir, "MEMORY.md"), renderMemorySnapshot(index, config), "utf8");
  writeFileAtomic(path.join(config.memoryDir, "BOOTSTRAP.md"), renderBootstrapSnapshot(index, config), "utf8");
  writeFileAtomic(path.join(config.memoryDir, "INDEX.md"), renderIndexMarkdown(index), "utf8");
  writeJson(path.join(config.memoryDir, "memories", "index.json"), index);
}

function buildMemoryIndex(memories, config) {
  const sorted = [...memories].sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  const enrichedRecords = sorted.map((memory, index) => enrichMemory(memory, index, sorted.length));
  const lifecycleRecords = applyMemoryLifecycleOperations(enrichedRecords, readMemoryLifecycleOperations(config.memoryDir), getMemoryIdentityKeys);
  const supersededBy = buildMemorySupersededBy(lifecycleRecords);
  const records = lifecycleRecords.map((record) => applyMemorySupersedeState(record, supersededBy));
  const snapshotLimits = resolveSnapshotLimits(config);
  const stats = {
    records: records.length,
    core: records.filter((item) => item.layer === "core").length,
    working: records.filter((item) => item.layer === "working").length,
    archive: records.filter((item) => item.layer === "archive").length,
    snapshotLimit: snapshotLimits.snapshotLimit,
    snapshotCoreLimit: snapshotLimits.coreLimit,
    snapshotRecentLimit: snapshotLimits.recentLimit,
    rebuiltAt: new Date().toISOString()
  };
  return {
    version: 2,
    schemaVersion: 2,
    memoryDir: config.memoryDir,
    stats,
    topics: countBy(records.flatMap((item) => item.topics)),
    kinds: countBy(records.map((item) => item.kind || item.metadata?.kind || "note")),
    projects: countBy(records.map((item) => item.project || item.metadata?.project || "").filter(Boolean)),
    scopes: countBy(records.map((item) => item.scope || "").filter(Boolean)),
    tags: countBy(records.flatMap((item) => item.tags || [])),
    threads: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.thread))),
    tasks: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.taskId))),
    workflows: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.workflowId))),
    radios: countBy(records.flatMap((item) => normalizeRefValues(item.refs?.radioId))),
    sources: countBy(records.map((item) => item.source || "unknown")),
    records
  };
}




function enrichMemory(memory, ordinal, total) {
  const metadata = normalizeMemoryMetadata(memory.metadata || {}, memory);
  const kind = normalizeMemoryKind(metadata.kind || "note");
  const tags = normalizeList(metadata.tags);
  const project = normalizeMemoryProject(metadata.project || memory.project || "");
  const refs = normalizeMemoryRefs(metadata.refs || memory.refs || {}, { ...memory, ...metadata });
  const canonicalMemory = {
    ...memory,
    project,
    tags,
    refs,
    metadata: {
      ...metadata,
      project,
      tags,
      kind,
      refs
    }
  };
  const topics = inferTopics(canonicalMemory);
  const access = getMemoryAccessStats(canonicalMemory);
  const accessHeat = scoreMemoryAccessHeat(access);
  const staleAccessPenalty = scoreStaleMemoryAccessPenalty(access);
  const importance = scoreImportance(canonicalMemory, topics, ordinal, total, {
    accessHeat,
    staleAccessPenalty
  });
  const confidence = normalizeConfidence(metadata.confidence);
  const staleWorkingContext = isStaleOperationalRadioMemory(canonicalMemory, memory.text);
  const layer = staleWorkingContext ? "archive" : chooseMemoryLayer(kind, importance);
  const scope = normalizeMemoryScope(metadata.scope) || inferScope(kind, topics, project);
  const enrichedMetadata = mergeMemoryAccessMetadata({
    ...metadata,
    kind,
    project,
    tags,
    scope,
    confidence,
    staleWorkingContext,
    refs
  }, access, { heat: accessHeat, stalePenalty: staleAccessPenalty });
  return {
    ...memory,
    schemaVersion: 2,
    kind,
    project,
    tags,
    refs,
    confidence,
    metadata: enrichedMetadata,
    layer,
    importance,
    accessCount: access.accessCount,
    lastAccessedAt: access.lastAccessedAt,
    accessHeat,
    staleAccessPenalty,
    staleWorkingContext,
    scope,
    topics,
    keywords: extractKeywords(`${memory.text} ${project} ${tags.join(" ")} ${flattenMemoryRefs(refs).join(" ")} ${(topics || []).join(" ")}`)
  };
}

function buildMemorySupersededBy(records) {
  const lookup = new Map();
  for (const record of records) {
    for (const key of getMemoryIdentityKeys(record)) {
      if (!lookup.has(key)) {
        lookup.set(key, record);
      }
    }
  }

  const supersededBy = new Map();
  for (const superseder of records) {
    const refs = getMemorySupersedesRefs(superseder);
    for (const ref of refs) {
      const target = lookup.get(ref);
      if (!target || target === superseder) {
        continue;
      }
      const targetKey = getMemoryPrimaryKey(target);
      if (!targetKey) {
        continue;
      }
      const supersederRef = getMemoryPrimaryKey(superseder);
      const existing = supersededBy.get(targetKey) || [];
      if (supersederRef && !existing.includes(supersederRef)) {
        existing.push(supersederRef);
      }
      supersededBy.set(targetKey, existing);
    }
  }
  return supersededBy;
}

function applyMemorySupersedeState(record, supersededBy) {
  const supersededByRefs = supersededBy.get(getMemoryPrimaryKey(record)) || [];
  if (supersededByRefs.length === 0) {
    return record;
  }
  const importance = Math.max(1, Number(record.importance || 0) - 50);
  return {
    ...record,
    superseded: true,
    supersededBy: supersededByRefs,
    importance,
    layer: "archive",
    metadata: {
      ...record.metadata,
      superseded: true,
      supersededBy: supersededByRefs,
      lifecycle: {
        ...(record.metadata?.lifecycle || {}),
        superseded: true,
        supersededBy: supersededByRefs
      }
    }
  };
}


function getMemoryPrimaryKey(record) {
  return getMemoryIdentityKeys(record)[0] || "";
}

function getMemoryIdentityKeys(record) {
  return [
    record.localEventId,
    record.id,
    record.metadata?.localEventId,
    record.metadata?.id,
    record.metadata?.stableId,
    record.metadata?.key,
    ...flattenMemoryRefs(record.refs || record.metadata?.refs)
  ]
    .map(normalizeSupersedeToken)
    .filter(Boolean);
}



function renderMemorySnapshot(index, config, options = {}) {
  const snapshotLimits = resolveSnapshotLimits(config);
  const coreLimit = snapshotLimits.coreLimit;
  const recentLimit = snapshotLimits.recentLimit;
  const totalLimit = Number(options.limit || snapshotLimits.snapshotLimit || 0);
  const visibleRecords = index.records.filter((item) => !item.superseded && isMemoryLifecycleVisible(item));
  const startup = selectStartupMemoryRecords(visibleRecords, config);
  const startupKeys = new Set(startup.map(getMemoryRecordStableKey).filter(Boolean));
  const allCore = visibleRecords
    .filter((item) => item.layer === "core" && !startupKeys.has(getMemoryRecordStableKey(item)))
    .sort(sortByImportance);
  const allRecent = [...visibleRecords]
    .filter((item) => (options.filterSummary || item.layer === "working") && !startupKeys.has(getMemoryRecordStableKey(item)))
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  let core = allCore.slice(0, coreLimit);
  let recent = allRecent.slice(0, recentLimit);
  if (totalLimit > 0) {
    core = allCore.slice(0, Math.min(coreLimit, totalLimit));
    const remaining = Math.max(0, totalLimit - core.length);
    recent = allRecent.slice(0, Math.min(recentLimit, remaining));
  }
  const lines = [
    "# Shared AI Memory",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "This snapshot is intentionally short. Full local history is in `memories/ledger.jsonl`; structured search data is in `memories/index.json`; readable grouped index is in `INDEX.md`.",
    "",
    "Use `ai-memory-hub search <query> --limit 10` when task-specific context is needed.",
    "",
    "Startup-critical records are repeated in `BOOTSTRAP.md` and pinned below.",
    ""
  ];
  if (options.filterSummary) {
    lines.push(`Filtered view: ${options.filterSummary}.`);
    lines.push("");
  }
  if (visibleRecords.length === 0) {
    lines.push("No memories found.");
    lines.push("");
    return lines.join("\n");
  }

  if (startup.length > 0) {
    lines.push("## Startup Essentials");
    lines.push("");
    for (const memory of startup) {
      lines.push(renderMemoryLine(memory));
    }
    lines.push("");
  }

  lines.push("## Core Memory");
  lines.push("");
  for (const memory of core) {
    lines.push(renderMemoryLine(memory));
  }
  lines.push("");
  lines.push("## Recent Working Context");
  lines.push("");
  for (const memory of recent) {
    lines.push(renderMemoryLine(memory));
  }
  lines.push("");
  lines.push("## Index Summary");
  lines.push("");
  lines.push(`- Records: ${index.stats.records}; core: ${index.stats.core}; working: ${index.stats.working}; archive: ${index.stats.archive}.`);
  lines.push(`- Top topics: ${index.topics.slice(0, 12).map((item) => `${item.key}(${item.count})`).join(", ") || "none"}.`);
  lines.push(`- Top projects: ${index.projects.slice(0, 8).map((item) => `${item.key}(${item.count})`).join(", ") || "none"}.`);
  lines.push("");
  return lines.join("\n");
}


function renderBootstrapSnapshot(index, config) {
  const startup = selectStartupMemoryRecords(index.records || [], config);
  const lines = [
    "# AI Memory Hub Bootstrap",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "This file repeats startup-critical records that should remain reachable even when `MEMORY.md` is compacted.",
    "",
    "If an instruction include such as `@RTK.md` is missing, run `ai-memory-hub resolve \"@RTK.md\"` and then use the resolved local path when reading the include.",
    "",
    "## Startup Essentials",
    ""
  ];
  if (startup.length === 0) {
    lines.push("- No startup-critical memories found.");
  } else {
    for (const memory of startup) {
      lines.push(renderMemoryLine(memory));
    }
  }
  lines.push("");
  return lines.join("\n");
}

function selectStartupMemoryRecords(records = [], _config = {}) {
  return [...records]
    .filter((record) => !record.superseded && isStartupMemoryRecord(record))
    .sort(sortByImportance)
    .slice(0, STARTUP_MEMORY_LIMIT);
}


function getMemoryRecordStableKey(record) {
  return getMemoryPrimaryKey(record) || record.id || record.localEventId || record.text || "";
}




function renderIndexMarkdown(index) {
  const lines = [
    "# Shared AI Memory Index",
    "",
    `Rebuilt locally at ${index.stats.rebuiltAt}.`,
    "",
    "## Stats",
    "",
    `- Records: ${index.stats.records}`,
    `- Core: ${index.stats.core}`,
    `- Working: ${index.stats.working}`,
    `- Archive: ${index.stats.archive}`,
    `- Schema version: ${index.schemaVersion || index.version || 1}`,
    "",
    "## Top Topics",
    ""
  ];
  for (const item of index.topics.slice(0, 40)) {
    lines.push(`- ${item.key}: ${item.count}`);
  }
  lines.push("");
  lines.push("## Top Projects");
  lines.push("");
  for (const item of index.projects.slice(0, 40)) {
    lines.push(`- ${item.key}: ${item.count}`);
  }
  lines.push("");
  lines.push("## Top Tags");
  lines.push("");
  for (const item of index.tags.slice(0, 40)) {
    lines.push(`- ${item.key}: ${item.count}`);
  }
  lines.push("");
  for (const layer of ["core", "working", "archive"]) {
    lines.push(`## ${titleCase(layer)} Records`);
    lines.push("");
    const records = index.records
      .filter((item) => item.layer === layer)
      .sort(layer === "core" ? sortByImportance : (a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
    for (const memory of records) {
      lines.push(renderMemoryLine(memory));
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderMemoryHealthReport(config, index, options = {}) {
  const analysis = options.analysis || analyzeMemoryHealth(config, index, options);
  const lines = [
    "# AI Memory Hub Health Report",
    "",
    `Generated at ${analysis.generatedAt}.`,
    "",
    "## Summary",
    "",
    `- Health score: ${analysis.score}/100 (${analysis.status})`,
    `- Memory records: ${analysis.totalRecords}`,
    `- Duplicate records: ${analysis.duplicateRecords} (${formatPercent(analysis.duplicateRate)})`,
    `- Corrupted records: ${analysis.corruptedRecords.length}`,
    `- Storage used: ${formatBytes(analysis.storage.totalBytes)}`,
    "",
    "## Distribution",
    "",
    `- Layers: core ${index.stats.core}, working ${index.stats.working}, archive ${index.stats.archive}`,
    `- Kinds: ${formatTopCounts(index.kinds, 8)}`,
    `- Projects: ${formatTopCounts(index.projects, 8)}`,
    `- Tags: ${formatTopCounts(index.tags, 8)}`,
    `- Topics: ${formatTopCounts(index.topics, 8)}`,
    "",
    "## Growth Trend",
    ""
  ];

  if (analysis.growthTrend.length === 0) {
    lines.push("- No dated records found.");
  } else {
    for (const item of analysis.growthTrend) {
      lines.push(`- ${item.date}: ${item.count}`);
    }
  }

  lines.push("");
  lines.push("## Storage");
  lines.push("");
  for (const item of analysis.storage.items) {
    lines.push(`- ${item.label}: ${formatBytes(item.bytes)}`);
  }

  lines.push("");
  lines.push("## Issues");
  lines.push("");
  if (analysis.issues.length === 0) {
    lines.push("- No optimization issues detected.");
  } else {
    for (const issue of analysis.issues) {
      lines.push(`- **${issue.level}** ${issue.title}: ${issue.detail}`);
    }
  }

  lines.push("");
  lines.push("## Recommended Actions");
  lines.push("");
  if (analysis.repairSuggestions.length === 0) {
    lines.push("- No repair actions suggested.");
  } else {
    for (const action of analysis.repairSuggestions) {
      const command = action.command ? ` Command: \`${action.command}\`.` : "";
      lines.push(`- ${action.label}: ${action.detail}${command}`);
    }
  }

  if (analysis.duplicateGroups.length > 0) {
    lines.push("");
    lines.push("## Duplicate Examples");
    lines.push("");
    for (const group of analysis.duplicateGroups.slice(0, analysis.issueLimit)) {
      lines.push(`- ${group.count}x ${group.example}`);
    }
  }

  if (analysis.corruptedRecords.length > 0) {
    lines.push("");
    lines.push("## Corrupted Record Examples");
    lines.push("");
    for (const record of analysis.corruptedRecords.slice(0, analysis.issueLimit)) {
      lines.push(`- ${formatMemoryRecordPointer(record)} ${truncateText(record.text, 120)}`);
    }
  }

  if (analysis.includeDiagnostics?.missing?.length > 0) {
    lines.push("");
    lines.push("## Instruction Include Diagnostics");
    lines.push("");
    for (const item of analysis.includeDiagnostics.missing.slice(0, analysis.issueLimit)) {
      const suggestions = item.suggestions.length
        ? ` Suggestions: ${item.suggestions.map((candidate) => `\`${candidate.path}\``).join(", ")}.`
        : " No existing local suggestions found.";
      lines.push(`- ${item.include} in \`${item.file}\` is missing at \`${item.expectedPath}\`.${suggestions}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function analyzeMemoryHealth(config, index, options = {}) {
  const records = index.records || [];
  const totalRecords = records.length;
  const qualityRecords = records.filter((record) => !isMemoryHealthExcluded(record));
  const issueLimit = Number(options.issueLimit || 5);
  const duplicateGroups = findDuplicateMemoryGroups(qualityRecords);
  const duplicateRecords = duplicateGroups.reduce((sum, group) => sum + group.count - 1, 0);
  const duplicateRate = qualityRecords.length > 0 ? duplicateRecords / qualityRecords.length : 0;
  const corruptedRecords = qualityRecords.filter(isCorruptedMemoryRecord);
  const storage = getMemoryStorageSummary(config.memoryDir);
  const growthTrend = getMemoryGrowthTrend(records, 14);
  const pendingInbox = countJsonlLines(path.join(config.memoryDir, "inbox", "events.jsonl"));
  const includeDiagnostics = analyzeInstructionIncludes(config, { records });
  const issues = [];
  const repairSuggestions = [];

  const addIssue = (issue) => {
    issues.push(issue);
    if (issue.action) {
      repairSuggestions.push(issue.action);
    }
  };

  if (corruptedRecords.length > 0) {
    addIssue({
      level: "high",
      title: "Corrupted records detected",
      detail: `${corruptedRecords.length} record(s) contain null bytes, replacement characters, or raw unparsed JSONL text.`,
      action: createHealthRepairAction({
        id: "repair-corrupted-records",
        label: "Repair corrupted records",
        command: "ai-memory-hub health repair --apply",
        detail: "Create a backup, recover parseable raw JSON records, archive unrecoverable corrupted records, and rebuild generated memory outputs.",
        endpoint: "/api/health/repair",
        method: "POST"
      })
    });
  }
  if (duplicateRecords > 0) {
    addIssue({
      level: duplicateRate >= 0.1 ? "high" : "medium",
      title: "Duplicate memory content",
      detail: `${duplicateRecords} duplicate record(s) across ${duplicateGroups.length} repeated text group(s).`,
      action: createHealthRepairAction({
        id: "repair-duplicate-groups",
        label: "Supersede duplicate records",
        command: "ai-memory-hub health repair --apply",
        detail: "Keep the highest-quality record in each duplicate group, mark older duplicate records as superseded, and rebuild generated memory outputs.",
        endpoint: "/api/health/repair",
        method: "POST"
      })
    });
  }
  if (pendingInbox > 0) {
    addIssue({
      level: pendingInbox >= 50 ? "medium" : "low",
      title: "Pending inbox events",
      detail: `${pendingInbox} event(s) remain in inbox/events.jsonl; run sync when ready.`,
      action: createHealthRepairAction({
        id: "sync-pending-inbox",
        label: "Sync pending inbox",
        command: "ai-memory-hub sync",
        detail: "Index pending inbox events into the ledger and rebuild the readable snapshot.",
        endpoint: "/api/sync",
        method: "POST"
      })
    });
  }
  if (includeDiagnostics.missing.length > 0) {
    const first = includeDiagnostics.missing[0];
    addIssue({
      level: "medium",
      title: "Missing instruction includes",
      detail: `${includeDiagnostics.missing.length} @include reference(s) are missing from tool instruction files. First missing include: ${first.include} in ${first.file}.`,
      action: createHealthRepairAction({
        id: "resolve-missing-instruction-include",
        label: "Resolve missing instruction include",
        command: `ai-memory-hub resolve "${first.include}" --from "${first.file}"`,
        detail: "Resolve the missing include from local candidate paths and shared memory before assuming the referenced instruction file is unavailable."
      })
    });
  }
  if (storage.backupsBytes > storage.ledgerBytes && storage.backupsBytes > 0) {
    addIssue({
      level: "low",
      title: "Backup storage exceeds ledger size",
      detail: `backups/ uses ${formatBytes(storage.backupsBytes)} versus ledger ${formatBytes(storage.ledgerBytes)}.`,
      action: createHealthRepairAction({
        id: "backup-storage-review",
        label: "Review backup storage",
        command: "ai-memory-hub backup list",
        detail: "Inspect backup age and retention status before running any explicit prune operation."
      })
    });
  }

  const score = Math.max(0, 100
    - Math.min(40, Math.round(duplicateRate * 200))
    - Math.min(35, corruptedRecords.length * 8)
    - Math.min(10, pendingInbox)
    - Math.min(10, includeDiagnostics.missing.length * 3));

  return {
    generatedAt: new Date().toISOString(),
    score,
    status: score >= 90 ? "good" : score >= 70 ? "needs attention" : "critical",
    totalRecords,
    qualityRecords: qualityRecords.length,
    duplicateGroups,
    duplicateRecords,
    duplicateRate,
    corruptedRecords,
    includeDiagnostics,
    storage,
    growthTrend,
    issues,
    repairSuggestions,
    issueLimit
  };
}



function runMemoryHealthRepair(config, { apply = false, issueLimit = 10 } = {}) {
  const beforeDiagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit });
  const plan = buildMemoryHealthRepairPlan(beforeDiagnostic.analysis);
  const result = {
    ok: true,
    apply,
    generatedAt: new Date().toISOString(),
    before: summarizeHealthAnalysisForRepair(beforeDiagnostic.analysis),
    plan: formatMemoryHealthRepairPlan(plan),
    backup: null,
    applied: {
      ledgerRecordsUpdated: 0,
      corruptedRecovered: 0,
      corruptedArchived: 0,
      duplicateSuperseded: 0
    },
    after: null
  };

  if (!apply || plan.totalActions === 0) {
    return result;
  }

  const backup = backupHub(config.memoryDir, "pre-health-repair");
  const ledger = readLedger(config.memoryDir);
  const applied = applyMemoryHealthRepairPlan(ledger, plan);
  writeLedger(config.memoryDir, applied.ledger);
  rebuildMemoryOutputs(config, applied.ledger);

  const afterDiagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit });
  return {
    ...result,
    backup,
    applied: applied.summary,
    after: summarizeHealthAnalysisForRepair(afterDiagnostic.analysis)
  };
}

function buildMemoryHealthRepairPlan(analysis) {
  const corrupted = analysis.corruptedRecords.map((record) => ({
    key: getMemoryPrimaryKey(record) || record.id || "",
    id: record.localEventId || record.id || "",
    pointer: formatMemoryRecordPointer(record),
    text: truncateText(record.text, 160),
    recoverable: Boolean(recoverMemoryEventFromRawText(record.text))
  })).filter((item) => item.key);

  const duplicateGroups = analysis.duplicateGroups.map((group) => {
    const keeper = chooseDuplicateKeeper(group.records);
    const keeperKey = getMemoryPrimaryKey(keeper) || keeper.id || "";
    const losers = group.records
      .filter((record) => record !== keeper)
      .map((record) => ({
        key: getMemoryPrimaryKey(record) || record.id || "",
        id: record.localEventId || record.id || "",
        pointer: formatMemoryRecordPointer(record),
        ts: record.ts || record.indexedAt || ""
      }))
      .filter((item) => item.key);
    return {
      keeperKey,
      keeperId: keeper.localEventId || keeper.id || "",
      example: group.example,
      count: group.count,
      losers
    };
  }).filter((group) => group.keeperKey && group.losers.length > 0);

  const duplicateLosers = duplicateGroups.reduce((sum, group) => sum + group.losers.length, 0);
  return {
    corrupted,
    duplicateGroups,
    totalActions: corrupted.length + duplicateLosers
  };
}



function applyMemoryHealthRepairPlan(ledger, plan) {
  const now = new Date().toISOString();
  const corruptedByKey = new Map(plan.corrupted.map((item) => [item.key, item]));
  const duplicateByKey = new Map();
  for (const group of plan.duplicateGroups) {
    for (const loser of group.losers) {
      duplicateByKey.set(loser.key, group);
    }
  }
  const summary = {
    ledgerRecordsUpdated: 0,
    corruptedRecovered: 0,
    corruptedArchived: 0,
    duplicateSuperseded: 0
  };

  const repairedLedger = ledger.map((record) => {
    const key = getMemoryPrimaryKey(record) || record.id || "";
    let next = record;
    if (corruptedByKey.has(key)) {
      const repaired = repairCorruptedLedgerRecord(next, now);
      next = repaired.record;
      summary.ledgerRecordsUpdated += 1;
      if (repaired.action === "recovered") {
        summary.corruptedRecovered += 1;
      } else {
        summary.corruptedArchived += 1;
      }
    }
    const duplicateGroup = duplicateByKey.get(key);
    if (duplicateGroup && !isMemoryHealthExcluded(next)) {
      next = markDuplicateLedgerRecordSuperseded(next, duplicateGroup.keeperKey, now);
      summary.ledgerRecordsUpdated += 1;
      summary.duplicateSuperseded += 1;
    }
    return next;
  });

  return { ledger: repairedLedger, summary };
}

function chooseDuplicateKeeper(records) {
  return [...records].sort((a, b) => {
    const corruptDelta = Number(isCorruptedMemoryRecord(a)) - Number(isCorruptedMemoryRecord(b));
    if (corruptDelta !== 0) return corruptDelta;
    const importanceDelta = Number(b.importance || 0) - Number(a.importance || 0);
    if (importanceDelta !== 0) return importanceDelta;
    return String(b.ts || b.indexedAt || "").localeCompare(String(a.ts || a.indexedAt || ""));
  })[0];
}

function repairCorruptedLedgerRecord(record, repairedAt) {
  const recovered = recoverMemoryEventFromRawText(record.text);
  if (recovered && recovered.text && !containsCorruptionMarker(recovered.text)) {
    return {
      action: "recovered",
      record: {
        ...record,
        source: recovered.source || (record.source === "raw" ? "health-repair" : record.source),
        text: sanitizeLedgerText(recovered.text),
        metadata: normalizeMemoryMetadata({
          ...record.metadata,
          ...recovered.metadata,
          lifecycle: {
            ...(record.metadata?.lifecycle || {}),
            healthRepair: {
              status: "recovered-corrupted",
              repairedAt,
              originalSource: record.source || "",
              originalKind: record.metadata?.kind || record.kind || ""
            }
          }
        }, recovered)
      }
    };
  }

  return {
    action: "archived",
    record: {
      ...record,
      source: record.source === "raw" ? "health-repair" : record.source,
      text: sanitizeLedgerText(record.text),
      superseded: true,
      supersededBy: ["health-repair"],
      healthExcluded: true,
      metadata: normalizeMemoryMetadata({
        ...record.metadata,
        kind: "archived",
        scope: "archive",
        confidence: 0.1,
        tags: [...normalizeList(record.metadata?.tags), "health-repair", "corrupted"],
        superseded: true,
        supersededBy: ["health-repair"],
        healthExcluded: true,
        lifecycle: {
          ...(record.metadata?.lifecycle || {}),
          healthExcluded: true,
          healthRepair: {
            status: "archived-corrupted",
            healthExcluded: true,
            repairedAt,
            originalSource: record.source || "",
            originalKind: record.metadata?.kind || record.kind || ""
          }
        }
      }, record)
    }
  };
}

function markDuplicateLedgerRecordSuperseded(record, keeperKey, repairedAt) {
  return {
    ...record,
    superseded: true,
    supersededBy: [keeperKey],
    healthExcluded: true,
    metadata: normalizeMemoryMetadata({
      ...record.metadata,
      superseded: true,
      supersededBy: [keeperKey],
      healthExcluded: true,
      lifecycle: {
        ...(record.metadata?.lifecycle || {}),
        superseded: true,
        supersededBy: [keeperKey],
        healthExcluded: true,
        healthRepair: {
          status: "superseded-duplicate",
          healthExcluded: true,
          repairedAt,
          duplicateOf: keeperKey
        }
      }
    }, record)
  };
}

function recoverMemoryEventFromRawText(rawText) {
  const cleaned = sanitizeRawJsonCandidate(rawText);
  if (!cleaned) {
    return null;
  }
  const parsed = parseJsonObjectCandidate(cleaned) || parseLooseJsonMemoryEvent(cleaned);
  if (!parsed || !parsed.text) {
    return null;
  }
  const event = normalizeMemoryEvent(parsed);
  if (parsed.type && (!parsed.metadata || !parsed.metadata.kind)) {
    event.metadata.kind = normalizeMemoryKind(parsed.type);
  }
  event.text = sanitizeLedgerText(event.text);
  return event.text ? event : null;
}



function parseLooseJsonMemoryEvent(text) {
  if (!text.startsWith("{")) {
    return null;
  }
  const source = extractLooseJsonStringField(text, "source") || "health-repair";
  const type = extractLooseJsonStringField(text, "type") || "";
  const memoryText = extractLooseJsonStringField(text, "text") || "";
  if (!memoryText) {
    return null;
  }
  const kind = extractLooseJsonStringField(text, "kind") || type || "reference";
  const project = extractLooseJsonStringField(text, "project") || "";
  return {
    source,
    text: memoryText,
    metadata: {
      kind,
      project
    }
  };
}



function findDuplicateMemoryGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const key = normalizeDuplicateMemoryText(record.text);
    if (!key || key.length < 16) {
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  }
  return [...groups.values()]
    .filter((items) => items.length > 1)
    .map((items) => ({
      count: items.length,
      example: truncateText(items[0].text, 120),
      records: items
    }))
    .sort((a, b) => b.count - a.count || a.example.localeCompare(b.example));
}


function isCorruptedMemoryRecord(record) {
  if (isMemoryHealthExcluded(record)) {
    return false;
  }
  const text = String(record.text || "");
  return record.source === "raw" ||
    record.kind === "raw" ||
    containsCorruptionMarker(text);
}










function renderMemoryLine(memory) {
  const source = sanitizeInlineText(memory.source || "unknown");
  const memoryKind = sanitizeInlineText(memory.kind || memory.metadata?.kind || "");
  const kind = memoryKind ? `/${memoryKind}` : "";
  const topics = memory.topics?.length ? ` topics=${memory.topics.slice(0, 5).map(sanitizeInlineText).join(",")}` : "";
  const project = memory.project ? ` project=${sanitizeInlineText(memory.project)}` : "";
  const tags = memory.tags?.length ? ` tags=${memory.tags.slice(0, 5).map(sanitizeInlineText).join(",")}` : "";
  const refs = formatMemoryRefs(memory.refs);
  return `- [${source}${kind} score=${memory.importance}${project}${tags}${topics}${refs ? ` refs=${refs}` : ""}] ${sanitizeInlineText(memory.text)}`;
}

function containsCorruptionMarker(value) {
  return CORRUPTION_MARKER_PATTERN.test(String(value || ""));
}




function searchMemories(records, query) {
  const queryTerms = extractKeywords(query);
  const queryNgrams = extractSearchTerms(query);
  const queryNormalized = normalizeSearchText(query);
  return records
    .map((memory) => {
      const text = String(memory.text || "");
      const haystack = new Set([
        ...extractKeywords(text),
        ...(memory.keywords || []),
        ...(memory.topics || []),
        memory.source || "",
        memory.kind || memory.metadata?.kind || "",
        memory.project || memory.metadata?.project || "",
        memory.scope || "",
        ...(memory.tags || memory.metadata?.tags || []),
        ...flattenMemoryRefs(memory.refs || memory.metadata?.refs)
      ]);
      const searchTerms = new Set([
        ...extractSearchTerms(text),
        ...extractSearchTerms((memory.topics || []).join(" ")),
        ...extractSearchTerms(memory.source || ""),
        ...extractSearchTerms(memory.kind || memory.metadata?.kind || ""),
        ...extractSearchTerms(memory.project || memory.metadata?.project || ""),
        ...extractSearchTerms(memory.scope || ""),
        ...extractSearchTerms((memory.tags || memory.metadata?.tags || []).join(" ")),
        ...extractSearchTerms(flattenMemoryRefs(memory.refs || memory.metadata?.refs).join(" "))
      ]);
      const normalizedText = normalizeSearchText(text);
      const normalizedJoinedKeywords = normalizeSearchText([
        ...haystack,
        ...searchTerms
      ].join(" "));
      let score = 0;
      const expandedTerms = expandSynonyms(queryTerms);
      for (const term of expandedTerms) {
        if (haystack.has(term)) {
          score += 4;
        } else if (searchTerms.has(term)) {
          score += 3;
        } else if (normalizedText.includes(normalizeSearchText(term))) {
          score += 2;
        }
      }
      for (const term of queryNgrams) {
        if (!term) continue;
        if (searchTerms.has(term)) {
          score += term.length >= 4 ? 2.5 : 1.5;
        } else if (normalizedText.includes(term) || normalizedJoinedKeywords.includes(term)) {
          score += term.length >= 4 ? 2 : 1;
        }
      }
      if (queryNormalized && normalizedText.includes(queryNormalized)) {
        score += queryNormalized.length >= 6 ? 8 : 5;
      } else if (queryNormalized && normalizedJoinedKeywords.includes(queryNormalized)) {
        score += 3;
      }
      for (const topic of memory.topics || []) {
        for (const term of expandedTerms) {
          if (topic.includes(term) || term.includes(topic)) {
            score += 5;
          }
        }
      }
      score += Number(memory.importance || 0) / 100;
      score += Number(memory.accessHeat || 0) / 50;
      score -= Number(memory.staleAccessPenalty || 0) / 50;
      return { ...memory, score };
    })
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score);
}


function scoreImportance(memory, topics, ordinal, total, access = {}) {
  const text = String(memory.text || "");
  const kind = memory.metadata?.kind || "note";
  let score = 20;
  if (["preference", "workflow", "correction"].includes(kind)) score += 45;
  if (["project", "lesson"].includes(kind)) score += 30;
  if (["reference", "raw", "note"].includes(kind)) score += 10;
  if (/must|always|never|必须|不要|偏好|规范|规则|纠错|红线|合规|错误|lesson/i.test(text)) score += 18;
  if (/github|git|lark|feishu|qclaw|coze|扣子|claude|codex|opencode|mimocode|mimo code|grok|xai|memory|飞书|微信|小游戏/i.test(text)) score += 8;
  if (topics.length > 0) score += Math.min(10, topics.length * 2);
  const recency = total > 0 ? ordinal / total : 0;
  score += Math.round(recency * 8);
  score += Number(access.accessHeat || 0);
  score -= Number(access.staleAccessPenalty || 0);
  score -= getStaleWorkingContextPenalty(memory, text);
  return Math.max(1, Math.min(100, score));
}

function getStaleWorkingContextPenalty(memory, text) {
  if (!isStaleOperationalRadioMemory(memory, text)) {
    return 0;
  }
  const ageDays = getMemoryAgeDays(memory);
  return Math.min(90, Math.ceil(ageDays * OPERATIONAL_RADIO_DECAY_RATE_PER_DAY));
}

function isStaleOperationalRadioMemory(memory, text) {
  return isOperationalRadioMemory(memory, text) && getMemoryAgeDays(memory) > STALE_OPERATIONAL_RADIO_AFTER_DAYS;
}

















function getBackupDetail(memoryDir, name) {
  const backupDir = resolveBackupDirectory(memoryDir, name);
  const backup = listBackupDirectories(memoryDir).find((item) => item.name === path.basename(backupDir)) || null;
  const manifest = readBackupManifest(backupDir);
  const restore = buildBackupRestorePlan(memoryDir, name);
  return {
    ok: true,
    backup,
    manifest,
    files: listBackupFiles(memoryDir, name),
    restore
  };
}

function restoreBackup(memoryDir, name, { apply = false, confirm = "" } = {}) {
  const plan = buildBackupRestorePlan(memoryDir, name);
  if (!apply) {
    return {
      apply: false,
      plan
    };
  }
  if (confirm !== "RESTORE") {
    throw new Error("Restore requires confirm=RESTORE.");
  }

  const safetyBackup = backupHub(memoryDir, "pre-restore", {
    trigger: "restore",
    retentionTier: "protected",
    retentionKey: new Date().toISOString(),
    retentionPolicy: "protected pre-restore backup"
  });
  const backupDir = resolveBackupDirectory(memoryDir, name);
  const catalog = new Map(getBackupFileCatalog(memoryDir).map((file) => [file.name, file]));
  const memoryRoot = path.resolve(memoryDir);
  const restored = [];

  for (const file of plan.files) {
    if (!file.restorable) {
      continue;
    }
    const spec = catalog.get(file.name);
    const backupFile = path.join(backupDir, file.name);
    const target = path.resolve(spec.target);
    if (!isPathInsideDirectory(target, memoryRoot)) {
      throw new Error(`Refusing to restore outside memory dir: ${file.name}`);
    }
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlink target: ${file.currentPath}`);
    }
    ensureDir(path.dirname(target));
    fs.copyFileSync(backupFile, target);
    restored.push(file.name);
  }

  if (restored.includes("memory-ledger.jsonl")) {
    rebuildMemoryOutputs(loadConfig(), readLedger(memoryDir));
  }

  return {
    apply: true,
    backup: safetyBackup,
    restored,
    before: plan,
    after: buildBackupRestorePlan(memoryDir, name)
  };
}

function buildBackupRestorePlan(memoryDir, name) {
  const backupDir = resolveBackupDirectory(memoryDir, name);
  const files = listBackupFiles(memoryDir, name).filter((file) => file.restorable);
  const changed = files.filter((file) => file.status !== "unchanged");
  return {
    name: path.basename(backupDir),
    generatedAt: new Date().toISOString(),
    requiresConfirmation: "RESTORE",
    destructive: changed.some((file) => file.status === "different"),
    summary: {
      total: files.length,
      changed: changed.length,
      missingCurrent: files.filter((file) => file.status === "missing-current").length,
      different: files.filter((file) => file.status === "different").length,
      unchanged: files.filter((file) => file.status === "unchanged").length,
      bytes: changed.reduce((sum, file) => sum + file.bytes, 0),
      display: formatBytes(changed.reduce((sum, file) => sum + file.bytes, 0))
    },
    files: files.map((file) => ({
      name: file.name,
      kind: file.kind,
      bytes: file.bytes,
      display: file.display,
      currentPath: file.currentPath,
      currentExists: file.currentExists,
      currentDisplay: file.currentDisplay,
      status: file.status,
      restorable: file.restorable
    }))
  };
}

function listBackupFiles(memoryDir, name) {
  const backupDir = resolveBackupDirectory(memoryDir, name);
  const catalog = new Map(getBackupFileCatalog(memoryDir).map((file) => [file.name, file]));
  return fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => describeBackupFile(memoryDir, backupDir, entry.name, catalog.get(entry.name)))
    .sort((a, b) => Number(b.restorable) - Number(a.restorable) || a.name.localeCompare(b.name));
}

function describeBackupFile(memoryDir, backupDir, name, spec) {
  const backupFile = path.join(backupDir, name);
  const backupStat = fs.statSync(backupFile);
  const currentExists = Boolean(spec && fs.existsSync(spec.target));
  const currentBytes = currentExists ? fs.statSync(spec.target).size : 0;
  const backupHash = getFileHash(backupFile);
  const currentHash = currentExists ? getFileHash(spec.target) : "";
  const status = !spec
    ? "browse-only"
    : !currentExists
      ? "missing-current"
      : backupHash === currentHash
        ? "unchanged"
        : "different";
  return {
    name,
    kind: spec?.kind || "metadata",
    bytes: backupStat.size,
    display: formatBytes(backupStat.size),
    modifiedAt: backupStat.mtime.toISOString(),
    restorable: Boolean(spec),
    currentPath: spec ? path.relative(memoryDir, spec.target).replace(/\\/g, "/") : "",
    currentExists,
    currentBytes,
    currentDisplay: formatBytes(currentBytes),
    status,
    preview: getBackupFilePreview(backupFile)
  };
}




function getBackupFilePreview(file) {
  const ext = path.extname(file).toLowerCase();
  const basename = path.basename(file).toLowerCase();
  if (![".json", ".jsonl", ".md", ".txt"].includes(ext) && basename !== "manifest.json") {
    return "";
  }
  const buffer = fs.readFileSync(file);
  const sample = buffer.subarray(0, Math.min(buffer.length, 2000)).toString("utf8");
  if (sample.includes("\u0000")) {
    return "";
  }
  return truncateText(sample, 1000);
}

function runAutomaticBackupStrategy(config, { trigger = "sync", includePreSync = true, now = new Date() } = {}) {
  const retention = getBackupRetentionConfig(config);
  const result = {
    trigger,
    policy: retention,
    created: [],
    skipped: [],
    preSync: null,
    daily: null,
    weekly: null,
    pruned: null
  };

  if (includePreSync) {
    result.preSync = backupHub(config.memoryDir, "pre-sync", {
      now,
      trigger,
      retentionTier: "pre-sync",
      retentionKey: createdAtRetentionKey(now),
      retentionPolicy: `keep latest ${retention.preSync} pre-sync backups`
    });
    result.created.push(result.preSync);
  }

  result.daily = createScheduledBackupIfDue(config.memoryDir, {
    now,
    trigger,
    tier: "daily",
    key: formatBackupDay(now),
    reason: "daily",
    policy: `keep latest ${retention.daily} daily backups`
  });
  if (result.daily) {
    result.created.push(result.daily);
  } else {
    result.skipped.push({ tier: "daily", reason: "already-current", key: formatBackupDay(now) });
  }

  result.weekly = createScheduledBackupIfDue(config.memoryDir, {
    now,
    trigger,
    tier: "weekly",
    key: getIsoWeekKey(now),
    reason: "weekly",
    policy: `keep latest ${retention.weekly} weekly backups`
  });
  if (result.weekly) {
    result.created.push(result.weekly);
  } else {
    result.skipped.push({ tier: "weekly", reason: "already-current", key: getIsoWeekKey(now) });
  }

  if (retention.pruneAfterSync !== false) {
    result.pruned = pruneBackups(config.memoryDir, {
      apply: true,
      daily: retention.daily,
      weekly: retention.weekly,
      preSync: retention.preSync,
      prePull: retention.prePull
    });
  }

  return result;
}

function createScheduledBackupIfDue(memoryDir, { now, trigger, tier, key, reason, policy }) {
  if (!key || hasBackupForRetentionKey(memoryDir, tier, key)) {
    return null;
  }
  return backupHub(memoryDir, reason, {
    now,
    trigger,
    retentionTier: tier,
    retentionKey: key,
    retentionPolicy: policy
  });
}

function hasBackupForRetentionKey(memoryDir, tier, key) {
  return listBackupDirectories(memoryDir).some((backup) => backup.retentionTier === tier && backup.retentionKey === key);
}

function getBackupRetentionConfig(config = {}) {
  const defaults = defaultConfig(config.memoryDir || resolveMemoryDir()).sync.backupRetention;
  const raw = {
    ...defaults,
    ...(config.backups || {}),
    ...(config.sync?.backupRetention || {})
  };
  return {
    daily: readPositiveInteger(raw.daily, defaults.daily),
    weekly: readPositiveInteger(raw.weekly, defaults.weekly),
    preSync: readPositiveInteger(raw.preSync ?? raw.pre_sync, defaults.preSync),
    prePull: readPositiveInteger(raw.prePull ?? raw.pre_pull, defaults.prePull || 20),
    pruneAfterSync: raw.pruneAfterSync !== false
  };
}

function getGitHubBackupConfig(config = loadConfig()) {
  const defaults = defaultConfig(config.memoryDir || resolveMemoryDir()).backup.github;
  const raw = {
    ...defaults,
    ...(config.backup?.github || {}),
    schedule: {
      ...defaults.schedule,
      ...(config.backup?.github?.schedule || {})
    }
  };
  return {
    enabled: raw.enabled === true,
    remoteUrl: String(raw.remoteUrl || "").trim(),
    repoDir: resolveConfiguredPath(raw.repoDir || defaults.repoDir),
    branch: String(raw.branch || "main").trim() || "main",
    allowPlaintextSensitive: raw.allowPlaintextSensitive === true,
    include: normalizeBackupPatternList(raw.include, defaults.include),
    exclude: normalizeBackupPatternList(raw.exclude, []),
    schedule: {
      enabled: raw.schedule?.enabled === true,
      time: normalizeScheduleTime(raw.schedule?.time || defaults.schedule.time),
      taskName: String(raw.schedule?.taskName || defaults.schedule.taskName).trim() || defaults.schedule.taskName
    },
    lastRunAt: String(raw.lastRunAt || ""),
    lastCommit: String(raw.lastCommit || ""),
    lastError: String(raw.lastError || "")
  };
}

function configureGitHubBackup(config, argv = []) {
  const configPath = path.join(config.memoryDir, "config.json");
  const current = readJsonSafe(configPath, defaultConfig(config.memoryDir));
  const currentGithub = getGitHubBackupConfig(config);
  const nextGithub = {
    ...currentGithub,
    schedule: { ...currentGithub.schedule }
  };

  if (hasFlag(argv, "--enabled") || hasFlag(argv, "--enable")) {
    nextGithub.enabled = true;
  }
  if (hasFlag(argv, "--disabled") || hasFlag(argv, "--disable")) {
    nextGithub.enabled = false;
  }
  if (hasOption(argv, "--remote-url")) {
    nextGithub.remoteUrl = getOption(argv, "--remote-url");
  }
  if (hasOption(argv, "--repo-dir") && getOption(argv, "--repo-dir")) {
    nextGithub.repoDir = resolveConfiguredPath(getOption(argv, "--repo-dir"));
  }
  if (hasOption(argv, "--branch") && getOption(argv, "--branch")) {
    nextGithub.branch = getOption(argv, "--branch");
  }
  if (hasFlag(argv, "--allow-plaintext-sensitive")) {
    nextGithub.allowPlaintextSensitive = true;
  }
  if (hasFlag(argv, "--block-plaintext-sensitive")) {
    nextGithub.allowPlaintextSensitive = false;
  }
  if (getOption(argv, "--include")) {
    nextGithub.include = normalizeBackupPatternList(getOption(argv, "--include").split(","), nextGithub.include);
  }
  if (getOption(argv, "--exclude")) {
    nextGithub.exclude = normalizeBackupPatternList(getOption(argv, "--exclude").split(","), nextGithub.exclude);
  }
  if (hasFlag(argv, "--schedule-enabled") || hasFlag(argv, "--schedule-enable")) {
    nextGithub.schedule.enabled = true;
  }
  if (hasFlag(argv, "--schedule-disabled") || hasFlag(argv, "--schedule-disable")) {
    nextGithub.schedule.enabled = false;
  }
  if (getOption(argv, "--time")) {
    nextGithub.schedule.time = normalizeScheduleTime(getOption(argv, "--time"));
  }
  if (getOption(argv, "--task-name")) {
    nextGithub.schedule.taskName = getOption(argv, "--task-name");
  }

  const next = {
    ...current,
    backup: {
      ...(current.backup || {}),
      github: nextGithub
    }
  };
  writeJson(configPath, next);
  const warnings = [];
  if (nextGithub.allowPlaintextSensitive) {
    warnings.push("Data security reminder: plaintext GitHub backup uploads can include private user data. Use only with an approved private remote, restricted access, and an understood retention policy.");
  }
  return {
    ok: true,
    github: getGitHubBackupConfig(loadConfig()),
    warnings
  };
}

function getGitHubBackupStatus(config = loadConfig()) {
  const github = getGitHubBackupConfig(config);
  const repoDir = github.repoDir;
  const gitDir = path.join(repoDir, ".git");
  const repoExists = fs.existsSync(repoDir);
  const isGitRepo = fs.existsSync(gitDir);
  const status = {
    ok: true,
    enabled: github.enabled,
    remoteUrl: github.remoteUrl,
    repoDir,
    branch: github.branch,
    allowPlaintextSensitive: github.allowPlaintextSensitive,
    include: github.include,
    exclude: github.exclude,
    lastRunAt: github.lastRunAt,
    lastCommit: github.lastCommit,
    lastError: github.lastError,
    repo: {
      exists: repoExists,
      isGitRepo,
      currentBranch: "",
      head: "",
      remoteUrl: "",
      dirty: false,
      changes: []
    },
    schedule: getGitHubBackupScheduleStatus(github)
  };

  if (isGitRepo) {
    const branch = runGitCommand(repoDir, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true });
    const head = runGitCommand(repoDir, ["rev-parse", "HEAD"], { allowFailure: true });
    const remote = runGitCommand(repoDir, ["remote", "get-url", "origin"], { allowFailure: true });
    const changes = runGitCommand(repoDir, ["status", "--porcelain"], { allowFailure: true });
    status.repo.currentBranch = branch.ok ? branch.stdout.trim() : "";
    status.repo.head = head.ok ? head.stdout.trim() : "";
    status.repo.remoteUrl = remote.ok ? remote.stdout.trim() : "";
    status.repo.changes = changes.ok ? changes.stdout.split(/\r?\n/).filter(Boolean) : [];
    status.repo.dirty = status.repo.changes.length > 0;
  }

  return status;
}

function runGitHubBackup(config, argv = []) {
  const startedAt = new Date();
  const configuredGithub = getGitHubBackupConfig(config);
  const github = {
    ...configuredGithub,
    remoteUrl: getOption(argv, "--remote-url") || configuredGithub.remoteUrl,
    repoDir: getOption(argv, "--repo-dir") ? resolveConfiguredPath(getOption(argv, "--repo-dir")) : configuredGithub.repoDir,
    branch: getOption(argv, "--branch") || configuredGithub.branch
  };
  const dryRun = hasFlag(argv, "--dry-run");
  const noPush = hasFlag(argv, "--no-push");
  const wouldPush = Boolean(github.remoteUrl) && !noPush;
  const push = wouldPush && !dryRun;
  const reason = getOption(argv, "--reason") || "github-backup";

  try {
    assertSafeGitHubBackupRepoDir(config.memoryDir, github.repoDir);
    const files = getGitHubBackupExportFiles(config.memoryDir, github);
    const scan = scanBackupFilesForSecrets(files);
    const warnings = getGitHubBackupUploadWarnings(github, scan, { wouldPush, push, dryRun });
    const plaintextPushBlocked = scan.issues.length > 0 && push && !github.allowPlaintextSensitive;
    if (plaintextPushBlocked) {
      const message = `GitHub backup push blocked by sensitive content scan: ${scan.issues.map((issue) => `${issue.file}:${issue.line}:${issue.kind}`).join(", ")}. Use --no-push for a complete local backup, or configure --allow-plaintext-sensitive only when the remote is approved for plaintext private data. ${warnings.join(" ")}`.trim();
      if (!dryRun) {
        updateGitHubBackupState(config, { lastRunAt: startedAt.toISOString(), lastError: message });
      }
      throw new Error(message);
    }

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        push: false,
        wouldPush,
        wouldBlockPush: scan.issues.length > 0 && wouldPush && !github.allowPlaintextSensitive,
        allowPlaintextSensitive: github.allowPlaintextSensitive,
        warnings,
        repoDir: github.repoDir,
        remoteUrl: github.remoteUrl,
        branch: github.branch,
        files: files.map((file) => file.name),
        scan,
        status: getGitHubBackupStatus(config)
      };
    }

    ensureGitHubBackupRepo(github);
    const exportResult = exportGitHubBackupSnapshot(config.memoryDir, github.repoDir, files, {
      reason,
      startedAt,
      remoteUrl: github.remoteUrl,
      branch: github.branch
    });

    runGitCommand(github.repoDir, ["add", "README.md", "manifest.json", "snapshot"]);
    const status = runGitCommand(github.repoDir, ["status", "--porcelain"]);
    const changed = status.stdout.split(/\r?\n/).some(Boolean);
    let committed = false;
    let pushed = false;
    let commit = runGitCommand(github.repoDir, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim();

    if (changed) {
      const message = `Back up AI memory ${startedAt.toISOString()}`;
      runGitCommand(github.repoDir, ["commit", "-m", message]);
      committed = true;
      commit = runGitCommand(github.repoDir, ["rev-parse", "HEAD"]).stdout.trim();
      if (push && github.remoteUrl) {
        runGitCommand(github.repoDir, ["push", "-u", "origin", github.branch]);
        pushed = true;
      }
    }

    updateGitHubBackupState(config, {
      enabled: true,
      remoteUrl: github.remoteUrl,
      repoDir: github.repoDir,
      branch: github.branch,
      lastRunAt: startedAt.toISOString(),
      lastCommit: commit,
      lastError: ""
    });

    return {
      ok: true,
      dryRun: false,
      changed,
      committed,
      pushed,
      push,
      wouldPush,
      wouldBlockPush: false,
      allowPlaintextSensitive: github.allowPlaintextSensitive,
      warnings,
      commit,
      repoDir: github.repoDir,
      remoteUrl: github.remoteUrl,
      branch: github.branch,
      files: exportResult.files,
      manifest: exportResult.manifest,
      scan,
      status: getGitHubBackupStatus(loadConfig())
    };
  } catch (error) {
    if (!dryRun) {
      updateGitHubBackupState(config, {
        lastRunAt: startedAt.toISOString(),
        lastError: error.message || String(error)
      });
    }
    throw error;
  }
}


function githubBackupScheduleCommand(config, argv = []) {
  const github = getGitHubBackupConfig(config);
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "status";
  if (action === "status") {
    return getGitHubBackupScheduleStatus(github);
  }
  if (action === "install") {
    return installGitHubBackupSchedule(config, argv.slice(1));
  }
  if (action === "uninstall" || action === "remove") {
    return uninstallGitHubBackupSchedule(config, argv.slice(1));
  }
  throw new Error("Usage: ai-memory-hub backup schedule [status|install|uninstall] [--time HH:mm] [--task-name <name>] [--dry-run]");
}

function installGitHubBackupSchedule(config, argv = []) {
  const github = getGitHubBackupConfig(config);
  const time = normalizeScheduleTime(getOption(argv, "--time") || github.schedule.time);
  const taskName = getOption(argv, "--task-name") || github.schedule.taskName;
  const command = buildGitHubBackupScheduledTaskCommand(config.memoryDir);
  const args = ["/Create", "/F", "/SC", "DAILY", "/ST", time, "/TN", taskName, "/TR", command];
  if (hasFlag(argv, "--dry-run") || process.platform !== "win32") {
    return {
      ok: process.platform === "win32",
      apply: false,
      supported: process.platform === "win32",
      taskName,
      time,
      command: `schtasks.exe ${args.map(quoteShellArg).join(" ")}`
    };
  }
  const result = runProcess("schtasks.exe", args);
  updateGitHubBackupScheduleState(config, { enabled: true, time, taskName });
  return {
    ok: true,
    apply: true,
    supported: true,
    taskName,
    time,
    stdout: result.stdout.trim(),
    status: getGitHubBackupScheduleStatus(getGitHubBackupConfig(loadConfig()))
  };
}

function uninstallGitHubBackupSchedule(config, argv = []) {
  const github = getGitHubBackupConfig(config);
  const taskName = getOption(argv, "--task-name") || github.schedule.taskName;
  const args = ["/Delete", "/F", "/TN", taskName];
  if (hasFlag(argv, "--dry-run") || process.platform !== "win32") {
    return {
      ok: process.platform === "win32",
      apply: false,
      supported: process.platform === "win32",
      taskName,
      command: `schtasks.exe ${args.map(quoteShellArg).join(" ")}`
    };
  }
  const result = runProcess("schtasks.exe", args, { allowFailure: true });
  if (result.exitCode !== 0 && !/cannot find|does not exist/i.test(result.stderr + result.stdout)) {
    throw new Error(`schtasks delete failed: ${result.stderr || result.stdout}`);
  }
  updateGitHubBackupScheduleState(config, { enabled: false, taskName });
  return {
    ok: true,
    apply: true,
    supported: true,
    taskName,
    stdout: result.stdout.trim(),
    status: getGitHubBackupScheduleStatus(getGitHubBackupConfig(loadConfig()))
  };
}

function getGitHubBackupScheduleStatus(github = getGitHubBackupConfig()) {
  const taskName = github.schedule?.taskName || DEFAULT_GITHUB_BACKUP_TASK_NAME;
  const result = {
    enabled: github.schedule?.enabled === true,
    configuredTime: github.schedule?.time || "03:30",
    taskName,
    supported: process.platform === "win32",
    installed: false,
    raw: "",
    lastTaskResult: "",
    nextRunTime: "",
    error: ""
  };
  if (process.platform !== "win32") {
    result.error = "Windows Scheduled Tasks are only supported on win32.";
    return result;
  }
  const query = runProcess("schtasks.exe", ["/Query", "/TN", taskName, "/FO", "LIST", "/V"], { allowFailure: true });
  if (query.exitCode !== 0) {
    result.error = (query.stderr || query.stdout || "Task not found.").trim();
    return result;
  }
  result.installed = true;
  result.raw = query.stdout;
  result.lastTaskResult = extractListValue(query.stdout, "Last Result") || extractListValue(query.stdout, "上次运行结果");
  result.nextRunTime = extractListValue(query.stdout, "Next Run Time") || extractListValue(query.stdout, "下次运行时间");
  return result;
}



function exportGitHubBackupSnapshot(memoryDir, repoDir, files, { reason, startedAt, remoteUrl, branch }) {
  const root = path.resolve(repoDir);
  const snapshotDir = path.join(root, "snapshot");
  ensureSafeChildPath(snapshotDir, root);
  ensureDir(snapshotDir);
  const manifestPath = path.join(root, "manifest.json");
  const readmePath = path.join(root, "README.md");
  const existingManifest = readJsonSafe(manifestPath, {});

  const copied = [];
  for (const file of files) {
    const target = path.join(snapshotDir, file.name);
    ensureSafeChildPath(target, snapshotDir);
    fs.copyFileSync(file.target, target);
    copied.push({
      name: file.name,
      kind: file.kind,
      bytes: fs.statSync(target).size,
      sha256: getFileHash(target)
    });
  }

  for (const file of getBackupFileCatalog(memoryDir)) {
    if (!copied.some((item) => item.name === file.name)) {
      const stale = path.join(snapshotDir, file.name);
      if (fs.existsSync(stale) && fs.statSync(stale).isFile()) {
        fs.unlinkSync(stale);
      }
    }
  }

  const previousFiles = Array.isArray(existingManifest.files) ? existingManifest.files : [];
  const snapshotChanged = JSON.stringify(previousFiles) !== JSON.stringify(copied);
  const manifest = {
    generatedAt: startedAt.toISOString(),
    reason,
    source: "ai-memory-hub",
    remoteConfigured: Boolean(remoteUrl),
    branch,
    files: copied
  };
  if (snapshotChanged || !fs.existsSync(manifestPath) || !fs.existsSync(readmePath)) {
    writeJson(manifestPath, manifest);
    writeFileAtomic(readmePath, renderGitHubBackupReadme(manifest), "utf8");
  }
  return {
    manifest: snapshotChanged || !existingManifest.generatedAt ? manifest : existingManifest,
    files: copied.map((file) => file.name)
  };
}

function ensureGitHubBackupRepo(github) {
  ensureDir(github.repoDir);
  if (!fs.existsSync(path.join(github.repoDir, ".git"))) {
    runGitCommand(github.repoDir, ["init"]);
  }
  ensureGitIdentity(github.repoDir);
  runGitCommand(github.repoDir, ["checkout", "-B", github.branch]);
  if (github.remoteUrl) {
    const existingRemote = runGitCommand(github.repoDir, ["remote", "get-url", "origin"], { allowFailure: true });
    if (existingRemote.ok) {
      runGitCommand(github.repoDir, ["remote", "set-url", "origin", github.remoteUrl]);
    } else {
      runGitCommand(github.repoDir, ["remote", "add", "origin", github.remoteUrl]);
    }
  }
}

function ensureGitIdentity(repoDir) {
  const name = runGitCommand(repoDir, ["config", "user.name"], { allowFailure: true });
  if (!name.ok || !name.stdout.trim()) {
    runGitCommand(repoDir, ["config", "user.name", "AI Memory Hub"]);
  }
  const email = runGitCommand(repoDir, ["config", "user.email"], { allowFailure: true });
  if (!email.ok || !email.stdout.trim()) {
    runGitCommand(repoDir, ["config", "user.email", "ai-memory-hub@localhost"]);
  }
}


function updateGitHubBackupState(config, patch) {
  const configPath = path.join(config.memoryDir, "config.json");
  const current = readJsonSafe(configPath, defaultConfig(config.memoryDir));
  const github = {
    ...getGitHubBackupConfig(config),
    ...patch,
    schedule: {
      ...getGitHubBackupConfig(config).schedule,
      ...(patch.schedule || {})
    }
  };
  writeJson(configPath, {
    ...current,
    backup: {
      ...(current.backup || {}),
      github
    }
  });
}

function updateGitHubBackupScheduleState(config, patch) {
  const github = getGitHubBackupConfig(config);
  updateGitHubBackupState(config, {
    schedule: {
      ...github.schedule,
      ...patch
    }
  });
}







function runGitCommand(repoDir, args, options = {}) {
  const git = resolveGitProcessCommand();
  return runProcess(git.command, ["-C", repoDir, ...args], {
    ...options,
    shell: git.usesShell
  });
}

function runProcess(command, args, options = {}) {
  const useWindowsShellLauncher = process.platform === "win32" && options.shell;
  const spawnCommand = useWindowsShellLauncher ? buildWindowsCmdLine(command, args) : command;
  const spawnArgs = useWindowsShellLauncher ? [] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    encoding: "utf8",
    windowsHide: true,
    shell: Boolean(options.shell)
  });
  const output = {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    command: `${command} ${args.map(quoteShellArg).join(" ")}`
  };
  if (!output.ok && !options.allowFailure) {
    throw new Error(`${command} failed (${output.exitCode}): ${output.stderr || output.stdout || result.error?.message || ""}`.trim());
  }
  return output;
}


function buildGitHubBackupScheduledTaskCommand(memoryDir) {
  return [
    quoteWindowsCommandArg(process.execPath),
    quoteWindowsCommandArg(__filename),
    "backup",
    "run",
    "--memory-dir",
    quoteWindowsCommandArg(memoryDir)
  ].join(" ");
}





function getBackupSummary(memoryDir, { limit = 50, daily = 7, weekly = 4, preSync = 20, prePull = 20, pruneAfterSync = true } = {}) {
  const backups = listBackupDirectories(memoryDir);
  const retention = planBackupRetention(backups, { daily, weekly, preSync, prePull });
  const retentionByName = new Map(retention.backups.map((item) => [item.name, item]));
  return {
    dir: path.join(memoryDir, "backups"),
    count: backups.length,
    totalBytes: backups.reduce((sum, backup) => sum + backup.bytes, 0),
    totalDisplay: formatBytes(backups.reduce((sum, backup) => sum + backup.bytes, 0)),
    policy: {
      daily,
      weekly,
      preSync,
      prePull,
      pruneAfterSync,
      note: "Manual backups are protected; daily, weekly, pre-sync, and pre-pull backups are pruned only inside backups/."
    },
    retention: {
      keep: retention.keep.length,
      prune: retention.prune.length,
      pruneBytes: retention.prune.reduce((sum, backup) => sum + backup.bytes, 0),
      pruneDisplay: formatBytes(retention.prune.reduce((sum, backup) => sum + backup.bytes, 0))
    },
    backups: backups.slice(0, limit).map((backup) => ({
      ...backup,
      retention: retentionByName.get(backup.name)?.retention || "prune",
      retentionReason: retentionByName.get(backup.name)?.retentionReason || "outside retention policy"
    }))
  };
}

function pruneBackups(memoryDir, { apply = false, daily = 7, weekly = 4, preSync = 20, prePull = 20 } = {}) {
  const backups = listBackupDirectories(memoryDir);
  const retention = planBackupRetention(backups, { daily, weekly, preSync, prePull });
  const backupsRoot = path.resolve(memoryDir, "backups");
  const pruned = [];
  if (apply) {
    for (const backup of retention.prune) {
      const target = path.resolve(backup.dir);
      if (!isPathInsideDirectory(target, backupsRoot)) {
        throw new Error(`Refusing to prune backup outside backups dir: ${backup.dir}`);
      }
      fs.rmSync(target, { recursive: true, force: true });
      pruned.push(backup);
    }
  }
  return {
    apply,
    policy: { daily, weekly, preSync, prePull },
    total: backups.length,
    keep: retention.keep.length,
    prune: retention.prune.length,
    pruneBytes: retention.prune.reduce((sum, backup) => sum + backup.bytes, 0),
    pruneDisplay: formatBytes(retention.prune.reduce((sum, backup) => sum + backup.bytes, 0)),
    pruned: pruned.map((backup) => backup.name),
    candidates: retention.prune.map((backup) => ({
      name: backup.name,
      createdAt: backup.createdAt,
      reason: backup.reason,
      bytes: backup.bytes,
      display: backup.display,
      retentionReason: backup.retentionReason
    }))
  };
}

// Delete an explicit set of backups by name (the dashboard "bulk delete"
// feature). Distinct from pruneDashboardBackups, which is retention-policy
// driven. Same safety model: every target must resolve inside <memoryDir>/backups.
function deleteBackups(memoryDir, { names = [], apply = false } = {}) {
  const backupsRoot = path.resolve(memoryDir, "backups");
  const existing = listBackupDirectories(memoryDir);
  const byName = new Map(existing.map((backup) => [backup.name, backup]));
  const deleted = [];
  const missing = [];
  for (const name of names) {
    const backup = byName.get(name);
    if (!backup) {
      missing.push(name);
      continue;
    }
    const target = path.resolve(backup.dir);
    if (!isPathInsideDirectory(target, backupsRoot)) {
      throw new Error(`Refusing to delete backup outside backups dir: ${name}`);
    }
    if (apply) {
      fs.rmSync(target, { recursive: true, force: true });
      deleted.push(name);
    }
  }
  return { apply, requested: names.length, deleted, missing };
}

function listBackupDirectories(memoryDir) {
  const dir = path.join(memoryDir, "backups");
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const backupDir = path.join(dir, entry.name);
      const manifestPath = path.join(backupDir, "manifest.json");
      const manifest = fs.existsSync(manifestPath) ? readJsonSafe(manifestPath) : {};
      const stat = fs.statSync(backupDir);
      const createdAt = manifest.createdAt || parseBackupTimestampFromName(entry.name) || stat.mtime.toISOString();
      const reason = manifest.reason || inferBackupReasonFromName(entry.name);
      const retentionTier = manifest.retention?.tier || inferBackupRetentionTier(reason);
      const bytes = getPathSize(backupDir);
      return {
        name: entry.name,
        dir: backupDir,
        createdAt,
        reason,
        retentionTier,
        retentionKey: manifest.retention?.key || inferBackupRetentionKey(retentionTier, createdAt),
        retentionPolicy: manifest.retention?.policy || "",
        files: Array.isArray(manifest.files) ? manifest.files : [],
        bytes,
        display: formatBytes(bytes),
        manifest: Boolean(manifest.createdAt)
      };
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}












function withHubLock(memoryDir, owner, fn, staleMs = 120000) {
  const lockPath = path.join(memoryDir, "locks", "hub.lock");
  ensureDir(path.dirname(lockPath));
  acquireLock(lockPath, owner, staleMs);
  try {
    return fn();
  } finally {
    releaseLock(lockPath, owner);
  }
}

function acquireLock(lockPath, owner, staleMs) {
  const started = Date.now();
  while (Date.now() - started < staleMs) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      const payload = {
        owner,
        pid: process.pid,
        createdAt: new Date().toISOString(),
        host: os.hostname(),
        cwd: process.cwd(),
        staleMs
      };
      fs.writeFileSync(fd, JSON.stringify(payload, null, 2));
      fs.closeSync(fd);
      appendLockEvent(lockPath, {
        type: "acquired",
        owner,
        pid: process.pid,
        host: os.hostname()
      });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (isLockStale(lockPath, staleMs)) {
        try {
          const staleInfo = readLockFile(lockPath);
          fs.unlinkSync(lockPath);
          appendLockEvent(lockPath, {
            type: "stale-reaped",
            owner,
            pid: process.pid,
            staleLock: staleInfo
          });
          continue;
        } catch {
          // Another process may have removed it first; retry.
        }
      }
      sleep(100);
    }
  }
  const status = describeLock(lockPath, staleMs);
  throw new Error(`Memory hub lock timeout at ${lockPath} (owner=${status.owner || "unknown"}, pid=${status.pid || "unknown"}, ageMs=${status.ageMs ?? "unknown"}, stale=${status.stale ? "yes" : "no"})`);
}


function isLockStale(lockPath, staleMs) {
  try {
    const status = describeLock(lockPath, staleMs);
    return Boolean(status.stale);
  } catch {
    return false;
  }
}

function readLockStatus(memoryDir) {
  const lockPath = path.join(memoryDir, "locks", "hub.lock");
  if (!fs.existsSync(lockPath)) {
    return {
      locked: false,
      path: lockPath,
      events: readLockEvents(memoryDir).slice(-10)
    };
  }
  return {
    locked: true,
    ...describeLock(lockPath, loadConfig().sync.lockStaleMs),
    events: readLockEvents(memoryDir).slice(-10)
  };
}







function normalizeMemoryEvent(event) {
  const text = event.text ?? event.content ?? event.memory ?? "";
  const metadata = normalizeMemoryMetadata(event.metadata || {}, event);
  if (!metadata.kind && event.type) {
    metadata.kind = normalizeMemoryKind(event.type);
  }
  if (event.tags && !metadata.tags) {
    metadata.tags = normalizeList(event.tags);
  }
  return {
    id: event.id || "",
    ts: event.ts || event.timestamp || event.createdAt || "",
    source: event.source || metadata.source || "unknown",
    text: String(text || "").trim(),
    device: event.device || metadata.device || os.hostname(),
    metadata
  };
}







function isCorruptedRadioMessage(message) {
  return String(message.from || "").toLowerCase() === "raw" ||
    String(message.type || "").toLowerCase() === "raw" ||
    containsCorruptionMarker(message.text) ||
    containsCorruptionMarker(message.thread) ||
    containsCorruptionMarker(message.replyTo);
}

function readRadioMessages(memoryDir) {
  const file = path.join(memoryDir, "radio", "messages.jsonl");
  return readEvents(file).map(normalizeRadioMessage);
}

function normalizeRadioMessage(message) {
  const recovered = recoverEmbeddedJsonMessage(message.text);
  const content = recovered || message;
  return {
    id: message.id || content.id || createId(JSON.stringify(message)),
    ts: message.ts || content.ts || "",
    from: content.from || content.source || message.from || message.source || "unknown",
    to: content.to || message.to || "all",
    type: content.type || message.type || message.metadata?.kind || "note",
    text: content.text || message.text || "",
    thread: content.thread || message.thread || "",
    replyTo: content.replyTo || content.reply_to || message.replyTo || message.reply_to || "",
    project: content.project || message.project || "",
    metadata: message.metadata || content.metadata || {},
    deliveryState: message.deliveryState || "pending",
    deliveryUpdatedAt: message.deliveryUpdatedAt || "",
    dispatchId: message.dispatchId || "",
    threadKey: message.threadKey || "",
    attempt: Number(message.attempt || 0),
    maxRetries: Number(message.maxRetries || 0),
    nextRetryAt: message.nextRetryAt || "",
    sessionId: message.sessionId || "",
    lastError: message.lastError || "",
    progressPercent: message.progressPercent ?? null,
    progressStatus: message.progressStatus || "",
    progressAt: message.progressAt || "",
    progressBy: message.progressBy || "",
    worktree: normalizeDispatchWorktreeMetadata(message.worktree),
    promoted: Boolean(message.promoted),
    promotedAt: message.promotedAt || ""
  };
}

function recoverEmbeddedJsonMessage(value) {
  const text = String(value || "");
  if (!text || !containsCorruptionMarker(text)) {
    return null;
  }
  const candidate = text
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u001f\u007f]/g, "")
    .trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function updateRadioMessage(memoryDir, id, patch) {
  const file = path.join(memoryDir, "radio", "messages.jsonl");
  const messages = readRadioMessages(memoryDir).map((message) => (
    message.id === id ? { ...message, ...patch } : message
  ));
  ensureDir(path.dirname(file));
  writeFileAtomic(file, messages.map((message) => JSON.stringify(message)).join("\n") + (messages.length ? "\n" : ""), "utf8");
}


function syncSharedSkillLayer(file, snippet, { apply = false } = {}) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const renderedSnippet = String(snippet || "").trim();
  const renderedStart = renderedSnippet.match(/<!--\s*AI_MEMORY_HUB_SHARED_SKILL_LAYER v[0-9]+\s*-->/);
  const renderedEndMarker = "<!-- /AI_MEMORY_HUB_SHARED_SKILL_LAYER -->";
  const renderedEnd = renderedStart
    ? renderedSnippet.indexOf(renderedEndMarker, renderedStart.index + renderedStart[0].length)
    : -1;
  const rendered = renderedStart && renderedEnd !== -1
    ? renderedSnippet.slice(renderedStart.index, renderedEnd + renderedEndMarker.length).trim()
    : renderedSnippet;
  const startMatch = existing.match(/<!--\s*AI_MEMORY_HUB_SHARED_SKILL_LAYER v[0-9]+\s*-->/);
  const endMarker = "<!-- /AI_MEMORY_HUB_SHARED_SKILL_LAYER -->";

  if (startMatch) {
    const start = startMatch.index;
    const end = existing.indexOf(endMarker, start + startMatch[0].length);
    if (end === -1) {
      return { status: "malformed", changed: false };
    }
    const endExclusive = end + endMarker.length;
    const current = existing.slice(start, endExclusive).trim();
    const normalize = (value) => value.replace(/\r\n/g, "\n");
    if (normalize(current) === normalize(rendered)) {
      return { status: "current", changed: false };
    }
    if (!apply) {
      return { status: "stale", changed: true };
    }
    writeFileAtomic(file, `${existing.slice(0, start)}${rendered}${existing.slice(endExclusive)}`, "utf8");
    return { status: "updated", changed: true };
  }

  if (!apply) {
    return { status: existing ? "missing" : "new", changed: true };
  }
  appendIfMissing(file, snippet, "Shared AI Memory");
  return { status: existing ? "upgraded" : "installed", changed: true };
}


function appendIfMissing(file, snippet, marker) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const hasSkillLayer = existing.includes(SHARED_SKILL_LAYER_MARKER_PREFIX);
  if (
    existing.includes(marker) &&
    hasSkillLayer &&
    existing.includes("Shared Agent Radio") &&
    existing.includes("Shared Task List") &&
    existing.includes("Shared Workflows") &&
    existing.includes("Contact Other AI Tools")
  ) {
    return;
  }
  if (existing.includes(marker)) {
    const sections = [];
    if (!hasSkillLayer) {
      sections.push(extractSection(
        snippet,
        "<!-- AI_MEMORY_HUB_SHARED_SKILL_LAYER",
        "<!-- /AI_MEMORY_HUB_SHARED_SKILL_LAYER -->"
      ));
    }
    if (!existing.includes("Shared Task List")) {
      sections.push(extractSection(snippet, "## Shared Task List", "## Shared Workflows"));
    }
    if (!existing.includes("Shared Workflows")) {
      sections.push(extractSection(snippet, "## Shared Workflows", "## Shared Agent Radio"));
    }
    if (!existing.includes("Shared Agent Radio")) {
      sections.push(extractSectionBeforeAny(snippet, "## Shared Agent Radio", [
        "## Contact Other AI Tools",
        "## Commands",
        "## Calling Marvis",
        "## Other AI Tools Calling Marvis"
      ]));
    }
    if (!existing.includes("Contact Other AI Tools")) {
      sections.push(extractSectionBeforeAny(snippet, "## Contact Other AI Tools", [
        "## Commands",
        "## Calling Marvis",
        "## Other AI Tools Calling Marvis"
      ]));
    }
    const addition = sections.filter(Boolean).map((section) => section.trim()).join("\n\n");
    if (addition) {
      const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : "";
      writeFileAtomic(file, `${prefix}${addition}\n`, "utf8");
    }
    return;
  }
  const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : "";
  writeFileAtomic(file, `${prefix}${snippet.trim()}\n`, "utf8");
}




function renderInstallSnippet(target, memoryDir) {
  return renderTemplate(target.template, buildInstallTemplateValues(target.tool, memoryDir));
}

function buildInstallTemplateValues(tool, memoryDir) {
  const baseValues = {
    MEMORY_DIR: memoryDir,
    TOOL: tool,
    SHARED_SKILL_LAYER_VERSION
  };
  return {
    ...baseValues,
    SHARED_SKILL_LAYER: renderTemplate(readTemplate("shared-skill-layer.md"), baseValues)
  };
}













// Export policy functions for dashboard integration (Phase 2).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    resolvePermission,
    POLICY_OPERATIONS
  };
}
