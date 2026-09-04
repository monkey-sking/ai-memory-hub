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
import { buildMemoryIndex, renderMemorySnapshot, renderBootstrapSnapshot, resolveReference, analyzeInstructionIncludes } from "./lib/memory-index.js";
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
const TOOL_DETECTION_CACHE_TTL_MS = 30 * 1000;
const SHARED_SKILL_LAYER_VERSION = "1";
const SHARED_SKILL_LAYER_MARKER = `AI_MEMORY_HUB_SHARED_SKILL_LAYER v${SHARED_SKILL_LAYER_VERSION}`;
const SHARED_SKILL_LAYER_MARKER_PREFIX = "AI_MEMORY_HUB_SHARED_SKILL_LAYER";
const PROJECT_VISIBLE_STATUSES = ["active", "paused", "planning"];
const DISPATCH_RUNS_DIR = "dispatch-runs";
const DEFAULT_DISPATCH_WORKTREE_DIR = ".ai-worktrees";
// dispatch-run lib 模块需要 index.js 内部 3 个常量（DEFAULT_DISPATCH_WORKTREE_DIR /
// DISPATCH_RUNS_DIR / DEFAULT_DISPATCH_RUN_TIMEOUT_MS），经 initDispatchRunDeps 注入。
// 须置于上述 const 定义之后（TDZ-safe）。
initDispatchRunDeps({ DEFAULT_DISPATCH_WORKTREE_DIR, DISPATCH_RUNS_DIR, DEFAULT_DISPATCH_RUN_TIMEOUT_MS });
const LOOP_CHECKPOINT_FILE = "loop-checkpoint.json";
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

function isProjectVisible(project) {
  return PROJECT_VISIBLE_STATUSES.includes(project.status) && !isHiddenProjectId(project.id);
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



function rebuildMemoryOutputs(config, ledger) {
  const index = buildMemoryIndex(ledger, config);
  writeFileAtomic(path.join(config.memoryDir, "MEMORY.md"), renderMemorySnapshot(index, config), "utf8");
  writeFileAtomic(path.join(config.memoryDir, "BOOTSTRAP.md"), renderBootstrapSnapshot(index, config), "utf8");
  writeFileAtomic(path.join(config.memoryDir, "INDEX.md"), renderIndexMarkdown(index), "utf8");
  writeJson(path.join(config.memoryDir, "memories", "index.json"), index);
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










function isCorruptedMemoryRecord(record) {
  if (isMemoryHealthExcluded(record)) {
    return false;
  }
  const text = String(record.text || "");
  return record.source === "raw" ||
    record.kind === "raw" ||
    containsCorruptionMarker(text);
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
    prePull: readPositiveInteger(raw.prePull ?? raw.pre_pull, defaults.prePull || 20),
    pruneAfterSync: raw.pruneAfterSync !== false
  };
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
