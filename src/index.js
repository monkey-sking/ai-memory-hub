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
import { appCommand } from "./commands/app.js";
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
import { captureCommand, runCaptureScan } from "./commands/capture.js";
const captureCommandDeps = { backupHub, ensureHub, loadConfig, readLedger, rebuildMemoryOutputs, searchMemoriesForContext, syncCommand, writeLedger };
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
import { readEvents, parseJsonlLine, countJsonlLines, readToolDeclarations, readModelsCache, writeModelsCache, readRadioCursor, writeRadioCursor, readAgents, readRoles, readTeams, readClaudeSessionState, readDispatchLog, readDispatchRuns, appendDispatchRunRecord, appendDispatchLog, readRelayStatus, resolveGitConflictsInFile, writeLedger, readApprovalGates, appendApprovalGateEvent, readPolicyRules, readSessions, readUnreadReceipts, appendUnreadReceipt, writeSessions, writeRpcRequest, readRpcRequest, writeRpcResult, readRpcResult, writeNotification, readNotifications, writeContextPack, readContextPack, readDispatchQueue, writeDispatchQueueEntry, readMemoryLifecycleOperations, archiveInbox, writeInboxEvents, readBackupManifest, readLockFile, readLockEvents, appendLockEvent, readEventsWithLocations, readAgentById, readRoleById, readTeamById, resolveRelayThreadKeys, findLatestRelayStatusEntry, readLatestDispatchRunByThread, readLatestRelayStatusByThread, readLatestRelayStatusBySource, updateSession, getActiveSessions, getPendingNotifications, getQueuedEntries, getRunningEntries, getFailedEntries, buildRunnerArgs, writeClaudeSessionState, countRecentRelayOscillation, writeAgent, writeRole, writeTeam, createDispatchRunId, removePolicyRule, updateNotificationStatus, updateDispatchQueueEntry, releaseLock, describeLock, waitForRpcResult, touchAgentStatus, parseRunnerOutput, isLockStale, removeToolDeclaration, writeToolDeclaration, acquireLock, readToolDeclarationByTool, withHubLock, resolveCredentialEnvironment, isRadioTargetingClosedSession, buildRecentRelayStatusView } from "./lib/io.js";
import { getEntityEventsFile, getEntityProjectionFile, readEntityEvents, bootstrapEntityEventsFromProjection, writeEntityRecords, appendEntityRecord, deleteEntityRecord, appendEntityEvents, createEntityEvent, replayEntityEvents, materializeEntityProjection, isEntityRecordNewerOrSame } from "./lib/entity-store.js";
import { PROJECT_STATUSES, RECIPE_GATE_STRING_ARRAY_FIELDS, RECIPE_GATE_FIELDS, extractQualityGate, normalizeQualityGate, normalizeVerifyCommand, normalizeNonNegativeInteger, normalizeMinimalImplementation, normalizeDependencyBudget, normalizePriority, normalizeDispatchWorktreeMetadata, normalizeWorkflowRole, parseProjectListOption, uniqueStringList, isTaskStatus, isWorkflowStatus, normalizeRecipeMetadata, normalizeRecipeStepMetadata, normalizeProjectStatus, normalizeProjectResources, normalizeProject, normalizeWorkflow, normalizeTask, normalizePrompt, getTaskEventStoreDefinition, getProjectEventStoreDefinition, getWorkflowEventStoreDefinition, getPromptEventStoreDefinition, rebuildEventSourcedProjections, updateProject, updateWorkflow, updateTask, assertTaskStatus, assertWorkflowStatus, mergeQualityGates, getSeedProjects, mergeSeedProjects, parseProjectResourceOptions, ensureHub } from "./lib/entity-models.js";
import { projectRoot, recipeReadLocations, recipeListLocations, readRecipe, listRecipes } from "./lib/paths.js";
import { POLICY_OPERATIONS, APP_NAME, DEFAULT_DISPATCH_ACK_TIMEOUT_MS, ASYNC_CALL_STATES, summarizeWorkflowLinkedTaskDelivery, isDispatchSourceComplete, isValidAsyncCallState, isRelayTimedOut, isRelayRetryCandidate, areTaskRecipeDependenciesSatisfied, ASYNC_CALL_TRANSITIONS, isValidAsyncCallTransition } from "./lib/constants.js";
import { MODEL_CACHE_STALE_MS } from "./lib/constants.js";
import { containsCorruptionMarker, isCorruptedRadioMessage, readRadioMessages, updateRadioMessage, getUnreadRadioMessages } from "./lib/radio-messages.js";
import { loadConfig, resolveMemoryDir, defaultConfig, DEFAULT_GITHUB_BACKUP_TASK_NAME } from "./lib/config.js";
import { DEFAULT_DISPATCH_MAX_RETRIES, normalizeDispatchRetryLimit, computeNextRetryAt, getRelayFailureState, getDispatchJobMaxRetries, isSharedStateOnlyTool, shouldRetryJob, isRelayRetryDue, isRelayRetryRunnable } from "./lib/dispatch-retry.js";
import { POLICY_DECISIONS, POLICY_SCOPES, appendPolicyRule, policyScopeMatches, resolvePermission, seedDefaultPolicyRules } from "./lib/policy.js";
import { promptCommand } from "./commands/prompt.js";
import { workflowNodeCommand } from "./commands/workflow-node.js";
import { taskCommand, taskSpecCommand } from "./commands/task.js";
import { compactCommand } from "./commands/compact.js";
const compactCommandDeps = { backupHub, ensureHub, loadConfig };
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
import { parseRunnerModelList, semanticSearch, checkProcessLiveness, getContentType, readRequestJson, findProjectIndex, expandSynonyms, scanBackupFilesForSecrets, getRelayTimeoutBaseMs, renderDispatchWorktree, createHealthRepairAction, getPathSize, extractCjkNgrams, getBackupFileCatalog, markTieredBackups, parseCliArgs, parseDeclaredList, parseProgressPercent, isJobCheckpointed, getCheckpointStats, renderProjectRegistryReadme, extractSharedSkillLayerVersion, renderEmptyBootstrapSnapshot, sleep, sharedSkillLayerActionLabel, summarizeDir, releaseStaleClaim, inspectSharedMemoryInstructions, getDirectResolveCandidates, normalizeCandidatePath, getPageOptions, findProject, autoCreateWorkflowNodes, getMemoryStorageSummary, hasSharedMemoryInstructions } from "./lib/util.js";
import { extractInstructionIncludes, normalizeSeverity, formatTopCounts, formatPercent, formatBytes, sanitizeDisplayText, getMemoryAgeDays, inferScope, normalizeSearchText, countBy, sortByImportance, titleCase, looksSensitive, formatEventLocation, extractSection, extractSectionBeforeAny, renderTemplate, trimOutput, summarizeText, textMentionsResolveQuery, summarizeHealthAnalysisForRepair, sanitizeLedgerText, normalizeDuplicateMemoryText, sanitizeInlineText, extractKeywords, extractCompactVariants, getMemoryEventSkipReason, extractLooseJsonStringField, formatMemoryRecordPointer, truncateText, extractSearchTerms, parseLooseJsonMemoryEvent, findDuplicateMemoryGroups, getBackupFilePreview } from "./lib/format.js";
import { normalizeMemoryKind, normalizeMemoryProject, normalizeMemoryScope, normalizeList, firstDefinedRef, hasMemoryFilters, normalizeRefToken, normalizeConfidence, applyMemoryAccessFields, normalizeMemoryAccessCount, normalizeMemoryAccessTimestamp, firstDefinedValue, getDaysSinceTimestamp, isMemoryLifecycleVisible, normalizeSupersedeToken, hasExplicitSyncKey, readPositiveInteger, isMemoryHealthExcluded, formatMemoryHealthRepairPlan, sanitizeRawJsonCandidate, getMemoryGrowthTrend, chooseMemoryLayer, parseListOption, parseMemoryTagFilters, formatMemoryFilterSummary, matchesMemoryTags, getMemoryAccessStats, applyMemoryLifecycleOperations, normalizeSupersedeRefs, isStartupMemoryRecord, resolveSnapshotLimits, inferTopics, normalizeMemoryRefs, flattenMemoryRefs, formatMemoryRefs, matchesMemoryRef, touchMemoryAccess, getMemorySupersedesRefs, isOperationalRadioMemory, printMemorySearchResults, filterMemoryRecords, getMemoryIdentityKeys, normalizeMemoryMetadata, recordMemoryAccess, getMemoryPrimaryKey, buildMemorySupersededBy, applyMemorySupersedeState, getMemoryRecordStableKey, markDuplicateLedgerRecordSuperseded, normalizeMemoryEvent, renderMemoryLine, recoverMemoryEventFromRawText, parseMemoryFilters, readLedger, renderIndexMarkdown, searchMemories, searchMemoriesForContext } from "./lib/memory-normalize.js";
import { createDispatchRecordMutex, isClaimStale, shouldPersistDispatchReport, isDispatchableRadioMessage, isClosedDispatchSourceState, buildTaskDispatchText, buildWorkflowDispatchText, findRecipeStepTask, normalizeToolName, safeGitPathSegment, isKnownGeminiWarning, stripExistingModelArgs, getDispatchThreadKey, formatDispatchVerifyCommand, getDispatchRunStatus, getDispatchRunVerificationResult, getAsyncCallStateMeta, getDispatchSourceKey, getRelaySourceKey, dispatchJobFromTask, dispatchJobFromWorkflow, dispatchJobFromRelayEntry, shouldDispatchJob, buildDispatchWorktreeBranch, buildDispatchWorktreeSlug, nextRelayAttempt, normalizeRunnerStderr, isDirectDispatchRadioMessage, renderDispatchQualityGate } from "./lib/dispatch.js";
import { sendHtml, sendPlain, sendJson, sendErrorEnvelope, parsePageParam, getSafeStaticRelativePath, readTextIfExists } from "./lib/http.js";
import { getToolDeclarationsFile, getModelsCacheFile, getRadioCursorFile, getAgentRegistryFile, getRoleRegistryFile, getTeamRegistryFile, getPolicyRulesFile } from "./lib/registry-paths.js";
import { quoteWindowsCmdArg, escapeForWindowsCmd, quoteWindowsCommandArg, quoteShellArg, classifyCommandPath, shellQuote, getRunnerDoctorWarnings, runGit, resolveCommandPaths, commandPathPriority, shouldUseShellForCommand, buildWindowsCmdLine, resolveGitProcessCommand, commandExists, choosePreferredCommandPath, resolveRunnerCommand, buildRunnerInvocation, runProcess, runGitCommand, collectDispatchWorktreeReviewMetadata, ensureGitIdentity, inspectDashboardWorktree, resolveGitRepositoryRoot, snapshotDashboardWorktree } from "./lib/shell.js";
import { normalizeResolveQuery, extractFilesystemPathCandidates, resolvePossiblyHomePath, pathMatchesResolveQuery } from "./lib/resolve.js";
import { resolveInside, loadTaskSpecContext, resolveTaskSpecFile, resolveTaskSpecFromArgs, validateTaskSpecDocument, runTaskSpec, summarizeTaskSpec, resolveTaskSpecCwd } from "./lib/task-spec.js";
import { buildDaemonStatus, clearDaemonPid, readDaemonHeartbeat, checkDaemonHeartbeat, writeDaemonHeartbeat, writeDaemonPid, writeDaemonStatus } from "./lib/daemon-state.js";
import { appendSkillCandidates, approveSkillDelta, mergeSkillDelta, readSkillCandidates, readSkillDeltas, rejectSkillDelta, updateSkillCandidate, writeSkillDeltas } from "./lib/skill-store.js";
import { getGitHubBackupConfig, configureGitHubBackup, getGitHubBackupStatus, runGitHubBackup, githubBackupScheduleCommand, installGitHubBackupSchedule, uninstallGitHubBackupSchedule, getGitHubBackupScheduleStatus, updateGitHubBackupState, updateGitHubBackupScheduleState, buildGitHubBackupScheduledTaskCommand, initGithubBackupDeps } from "./lib/github-backup.js";
import { resetDispatchPoolState, markDispatchPoolJobStart, markDispatchPoolJobDone, markDispatchPoolFinished, getDispatchPoolSnapshot, runDispatchPool, initDispatchPoolDeps } from "./lib/dispatch-pool.js";
import { invokeRunnerCommand, runDispatchJob, runDispatchJobAsync, resolveDispatchWorktreeRoot, initDispatchRunDeps } from "./lib/dispatch-run.js";
import { appendRelayStatus, appendDispatchResponseMessage, appendDispatchStatusMessage, findDispatchOrigin, updateDispatchSourceState } from "./lib/relay-status.js";
import { executeDispatch, executeDispatchRetry, rebuildDispatchJobFromRelay } from "./lib/dispatch-orchestration.js";
import { buildMemoryIndex, renderMemorySnapshot, renderBootstrapSnapshot, resolveReference, analyzeInstructionIncludes, rebuildMemoryOutputs } from "./lib/memory-index.js";
import { dashboardHealth, runMemoryHealthRepair } from "./lib/memory-health.js";
import { detectTools, getCachedDetectedTools, refreshDetectedTools, invalidateToolDetectionCache, appendIfMissing, renderInstallSnippet, syncSharedSkillLayer, initAllTools } from "./lib/tool-detection.js";
import { RUNNER_PROFILES, getRunnerProfile, getKnownRunnerToolNames, getToolRunner, resolveToolRunnerUncached } from "./lib/runner-core.js";
import { policyActorMatches, policyRuleSpecificity, isHiddenProjectId, findWorkflowIndex, findTaskIndex, createTaskNote, getNotificationChannels } from "./lib/entity-index.js";
import { getFileHash, getGitHubBackupUploadWarnings, normalizeBackupPatternList, matchesAnyBackupPattern, normalizeScheduleTime, resolveConfiguredPath, extractListValue, renderGitHubBackupReadme, markProtectedBackups, parseBackupTimestampFromName, inferBackupReasonFromName, inferBackupRetentionTier, createdAtRetentionKey, formatBackupDay, getIsoWeekKey, isPathInsideDirectory, countBackupDirs, backupHub, resolveBackupDirectory, getGitHubBackupExportFiles, getDefaultGitHubBackupInclude, assertSafeGitHubBackupRepoDir, ensureSafeChildPath, planBackupRetention, inferBackupRetentionKey, assertSafeDispatchWorktreeRoot, ensureGitHubBackupRepo, describeBackupFile, listBackupFiles, listBackupDirectories, buildBackupRestorePlan, hasBackupForRetentionKey, getBackupSummary, pruneBackups, deleteBackups, getBackupDetail, createScheduledBackupIfDue, exportGitHubBackupSnapshot } from "./lib/backup.js";
import { relayFailureFingerprint, createSkillDelta, createProject, createWorkflow, createTask, createSession, createRpcRequest, createNotification, createDispatchQueueEntry, validateVerifyCommand, validateMinimalImplementation, validateDependencyBudget, normalizeRefValues, mergeMemoryAccessMetadata, parseJsonObjectCandidate, createRadioMessage, validateQualityGateFields, validateQualityGate, validateRecipe } from "./lib/entity-factory.js";
import { readDiscoveredModels, detectVSCodeEnhanced, getDashboardStaticRoot, readTemplate, getLocalInstallTargets, getInstallTargets, renderDashboard, getInstructionIncludeFiles, getInstallTargetForTool, sendStaticFile, sendStaticAsset } from "./lib/tools-detect.js";
import { isRadioLinkedToClosedSource, syncLinkedWorkflowDeliveryState, spawnWorkflowTasks, notifyWorkflowRoles } from "./lib/entity-repo.js";
import {
  normalizeAdversarialVerifier,
  normalizeReviewDimensions,
  validateAdversarialVerifier,
  validateReviewDimensions
} from "./review-config.js";
import { initSyncStatusDeps, PROJECT_VISIBLE_STATUSES, getStatusObject, inspectRunnerTool, isProjectVisible, recordCommand, syncIndexedEvents } from "./lib/sync-status.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// P0.1 TTL default: a claim auto-releases after this idle window (borrowed from Cumora markThinking TTL).
// Declared up here because main() runs as a top-level call before the task section below.
const DEFAULT_CLAIM_TTL_MS = 30 * 60 * 1000;
// github-backup lib 模块需要 index.js 内部符号（config 读取 / 入口文件 / 常量），
// 经 initGithubBackupDeps 注入。__filename 在 187 行已就绪，无 TDZ。
initGithubBackupDeps({ loadConfig, defaultConfig, resolveMemoryDir, DEFAULT_GITHUB_BACKUP_TASK_NAME, entryFile: __filename });
const DEFAULT_DISPATCH_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const DISPATCH_MAX_CONCURRENCY = 6;
// dispatch-pool lib 模块需要 index.js 内部符号（DISPATCH_MAX_CONCURRENCY 常量），
// 经 initDispatchPoolDeps 注入。须置于 DISPATCH_MAX_CONCURRENCY const 定义之后
// （TDZ-safe）。runDispatchJobAsync 已随 P0-2 第22批下沉到 ./lib/dispatch-run.js，
// dispatch-pool 直接 import，不再经 init 注入。
initDispatchPoolDeps({ DISPATCH_MAX_CONCURRENCY });

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
const DISPATCH_RUNS_DIR = "dispatch-runs";
const DEFAULT_DISPATCH_WORKTREE_DIR = ".ai-worktrees";
// dispatch-run lib 模块需要 index.js 内部 3 个常量（DEFAULT_DISPATCH_WORKTREE_DIR /
// DISPATCH_RUNS_DIR / DEFAULT_DISPATCH_RUN_TIMEOUT_MS），经 initDispatchRunDeps 注入。
// 须置于上述 const 定义之后（TDZ-safe）。
initDispatchRunDeps({ DEFAULT_DISPATCH_WORKTREE_DIR, DISPATCH_RUNS_DIR, DEFAULT_DISPATCH_RUN_TIMEOUT_MS });
const LOOP_CHECKPOINT_FILE = "loop-checkpoint.json";
const TOOL_CAPABILITY_REGISTRY_VERSION = 1;

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

initSyncStatusDeps({
  dashboardTools,
  runAutomaticBackupStrategy
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

// appCommand 的 index.js 内部依赖：dashboard 实例（在上面构建）+ 助手函数 +
// POLICY 常量。随 appCommand 一起迁到 src/commands/app.js 后经此注入。
const appCommandDeps = {
  POLICY_DECISIONS,
  POLICY_SCOPES,
  dashboardActions,
  dashboardAgentSessions,
  dashboardBackups,
  dashboardCollaboration,
  dashboardCostSessions,
  dashboardDispatch,
  dashboardHealth,
  dashboardMemory,
  dashboardMetrics,
  dashboardProjects,
  dashboardRadio,
  dashboardRealtime,
  dashboardSearch,
  dashboardSettings,
  dashboardTasks,
  dashboardTools,
  dashboardWorkflows,
  dashboardWorktrees,
  getDispatchPoolSnapshot,
  getRequestMetricsSnapshot,
  getStatusObject,
  loadConfig,
  recordRequestMetric,
  refreshDetectedTools,
  runMemoryHealthRepair
};

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
    case "capture":
      return captureCommand(rest, captureCommandDeps);
    case "compact":
    case "gc":
      return compactCommand(rest, compactCommandDeps);
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
      return appCommand(rest, appCommandDeps);
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




function statusCommand() {
  console.log(JSON.stringify(getStatusObject(), null, 2));
}












// ---- P1: agent + role registries (borrowed from Cumora participants; role is a first-class entity here) ----

// Upsert an agent's live status; creates the agent record if it doesn't exist yet.
// Used by P0 task-claim linkage so a runner that claims a task auto-shows as busy.

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


function indexCommand() {
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "index", () => {
    const ledger = readLedger(config.memoryDir);
    rebuildMemoryOutputs(config, ledger);
    console.log(`Rebuilt memory index for ${ledger.length} record(s).`);
  }, config.sync.lockStaleMs);
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
  const captureEnabled = hasFlag(argv, "--capture");
  const captureLimit = getOption(argv, "--capture-limit") || "50";
  const config = loadConfig();
  ensureHub(config.memoryDir);

  console.log(`Watching ${path.join(config.memoryDir, "inbox")} every ${intervalMs}ms${captureEnabled ? " (auto-capture on)" : ""}. Press Ctrl+C to stop.`);
  const tick = () => {
    try {
      if (captureEnabled) {
        // 静默扫描：只有真的抓到新 turn 才出声，否则周期任务会刷屏。
        const result = runCaptureScan(["scan", "--sync", "--limit", captureLimit], captureCommandDeps);
        if (result.eventsWritten > 0) {
          console.log(`[watch] captured ${result.eventsWritten} turn(s) from ${result.scannedFiles} file(s).`);
        }
      }
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
























// Workflow node history (P0: workflow execution history with node states)


// Read every workflow's current nodes in a single pass over nodes.jsonl.
// Returns a Map of workflowId -> sorted node array. Used by readWorkflows to
// avoid re-reading the file once per derived-status workflow.


// ─────────────────────────────────────────────────────────────────────────────
// Approval Gates
// ─────────────────────────────────────────────────────────────────────────────

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




// Scheduler Queue Functions







// Workflow Recipe Functions



















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
    prePull: readPositiveInteger(raw.prePull ?? raw.pre_pull, defaults.prePull || 5),
    adHoc: readPositiveInteger(raw.adHoc ?? raw.ad_hoc, defaults.adHoc || 10),
    pruneAfterSync: raw.pruneAfterSync !== false
  };
}






































// Export policy functions for dashboard integration (Phase 2).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    resolvePermission,
    POLICY_OPERATIONS
  };
}
