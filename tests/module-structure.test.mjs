import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("dashboard memory API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const memoryModule = await readRepoFile("src/dashboard/memory.js");

  assert.match(index, /from\s+["']\.\/dashboard\/memory\.js["']/);
  assert.match(index, /createDashboardMemoryApi\(/);
  assert.match(index, /dashboardMemory\.getDashboardMemory/);
  assert.match(index, /dashboardMemory\.createMemorySupersedeEvent/);
  assert.doesNotMatch(index, /function\s+getDashboardMemory\(/);
  assert.doesNotMatch(index, /function\s+formatDashboardMemoryRecord\(/);
  assert.doesNotMatch(index, /function\s+createMemorySupersedeEvent\(/);

  assert.match(memoryModule, /export\s+function\s+createDashboardMemoryApi/);
  assert.match(memoryModule, /function\s+getDashboardMemory\(/);
  assert.match(memoryModule, /function\s+formatDashboardMemoryRecord\(/);
  assert.match(memoryModule, /function\s+createMemorySupersedeEvent\(/);
});

test("dashboard radio read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const radioModule = await readRepoFile("src/dashboard/radio.js");

  assert.match(index, /from\s+["']\.\/dashboard\/radio\.js["']/);
  assert.match(index, /createDashboardRadioApi\(/);
  assert.match(index, /dashboardRadio\.getDashboardRadio/);
  assert.doesNotMatch(index, /function\s+getDashboardRadio\(/);

  assert.match(radioModule, /export\s+function\s+createDashboardRadioApi/);
  assert.match(radioModule, /function\s+getDashboardRadio\(/);
  assert.match(radioModule, /readRadioMessages\(memoryDir\)/);
  assert.match(radioModule, /messages: orderedMessages\.slice\(pageStart, pageEnd\)/);
});

test("dashboard task read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const tasksModule = await readRepoFile("src/dashboard/tasks.js");

  assert.match(index, /from\s+["']\.\/dashboard\/tasks\.js["']/);
  assert.match(index, /createDashboardTasksApi\(/);
  assert.match(index, /dashboardTasks\.getDashboardTasks/);
  assert.doesNotMatch(index, /function\s+getDashboardTasks\(/);

  assert.match(tasksModule, /export\s+function\s+createDashboardTasksApi/);
  assert.match(tasksModule, /function\s+getDashboardTasks\(/);
  assert.match(tasksModule, /readTasks\(memoryDir\)/);
  assert.match(tasksModule, /tasks: filteredTasks\.slice\(offset, offset \+ limit\)/);
});

test("dashboard workflow API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const workflowsModule = await readRepoFile("src/dashboard/workflows.js");

  assert.match(index, /from\s+["']\.\/dashboard\/workflows\.js["']/);
  assert.match(index, /createDashboardWorkflowsApi\(/);
  assert.match(index, /dashboardWorkflows\.getDashboardWorkflows/);
  assert.match(index, /dashboardWorkflows\.createDashboardWorkflow/);
  assert.match(index, /dashboardWorkflows\.updateDashboardWorkflow/);
  assert.match(index, /dashboardWorkflows\.deleteDashboardWorkflow/);
  assert.match(index, /dashboardWorkflows\.setDashboardWorkflowStatus/);
  assert.match(index, /dashboardWorkflows\.appendDashboardWorkflowEntry/);
  assert.match(index, /dashboardWorkflows\.signalDashboardWorkflow/);
  assert.doesNotMatch(index, /function\s+getDashboardWorkflows\(/);
  assert.doesNotMatch(index, /function\s+createDashboardWorkflow\(/);
  assert.doesNotMatch(index, /function\s+updateDashboardWorkflow\(/);
  assert.doesNotMatch(index, /function\s+deleteDashboardWorkflow\(/);
  assert.doesNotMatch(index, /function\s+setDashboardWorkflowStatus\(/);
  assert.doesNotMatch(index, /function\s+appendDashboardWorkflowEntry\(/);
  assert.doesNotMatch(index, /function\s+signalDashboardWorkflow\(/);
  assert.doesNotMatch(index, /function\s+normalizeDashboardList\(/);

  assert.match(workflowsModule, /export\s+function\s+createDashboardWorkflowsApi/);
  assert.match(workflowsModule, /function\s+getDashboardWorkflows\(/);
  assert.match(workflowsModule, /function\s+createDashboardWorkflow\(/);
  assert.match(workflowsModule, /function\s+updateDashboardWorkflow\(/);
  assert.match(workflowsModule, /function\s+deleteDashboardWorkflow\(/);
  assert.match(workflowsModule, /function\s+setDashboardWorkflowStatus\(/);
  assert.match(workflowsModule, /function\s+appendDashboardWorkflowEntry\(/);
  assert.match(workflowsModule, /function\s+signalDashboardWorkflow\(/);
  assert.match(workflowsModule, /function\s+normalizeDashboardList\(/);
  assert.match(workflowsModule, /readWorkflows\(memoryDir\)/);
  assert.match(workflowsModule, /\.slice\(0,\s*100\)/);
});

test("dashboard project read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const projectsModule = await readRepoFile("src/dashboard/projects.js");

  assert.match(index, /from\s+["']\.\/dashboard\/projects\.js["']/);
  assert.match(index, /createDashboardProjectsApi\(/);
  assert.match(index, /dashboardProjects\.getDashboardProjects/);
  assert.match(index, /dashboardProjects\.createDashboardProject/);
  assert.match(index, /dashboardProjects\.updateDashboardProject/);
  assert.match(index, /dashboardProjects\.archiveDashboardProject/);
  assert.doesNotMatch(index, /function\s+getDashboardProjects\(/);
  assert.doesNotMatch(index, /function\s+createDashboardProject\(/);
  assert.doesNotMatch(index, /function\s+updateDashboardProject\(/);
  assert.doesNotMatch(index, /function\s+archiveDashboardProject\(/);

  assert.match(projectsModule, /export\s+function\s+createDashboardProjectsApi/);
  assert.match(projectsModule, /function\s+getDashboardProjects\(/);
  assert.match(projectsModule, /function\s+createDashboardProject\(/);
  assert.match(projectsModule, /function\s+updateDashboardProject\(/);
  assert.match(projectsModule, /function\s+archiveDashboardProject\(/);
  assert.match(projectsModule, /readProjects\(memoryDir\)/);
  assert.match(projectsModule, /readTasks\(memoryDir\)/);
  assert.match(projectsModule, /readRadioMessages\(memoryDir\)/);
  assert.match(projectsModule, /readWorkflows\(memoryDir\)/);
});

test("dashboard metrics read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const metricsModule = await readRepoFile("src/dashboard/metrics.js");

  assert.match(index, /from\s+["']\.\/dashboard\/metrics\.js["']/);
  assert.match(index, /createDashboardMetricsApi\(/);
  assert.match(index, /dashboardMetrics\.calculateMetrics/);
  assert.doesNotMatch(index, /function\s+calculateMetrics\(/);
  assert.doesNotMatch(index, /function\s+formatDuration\(/);

  assert.match(metricsModule, /export\s+function\s+createDashboardMetricsApi/);
  assert.match(metricsModule, /function\s+calculateMetrics\(/);
  assert.match(metricsModule, /function\s+formatDuration\(/);
  assert.match(metricsModule, /readLatestRelayStatusByThread\(memoryDir\)/);
  assert.match(metricsModule, /readDispatchQueue\(memoryDir\)/);
});

test("dashboard dispatch read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const dispatchModule = await readRepoFile("src/dashboard/dispatch.js");

  assert.match(index, /from\s+["']\.\/dashboard\/dispatch\.js["']/);
  assert.match(index, /createDashboardDispatchApi\(/);
  assert.match(index, /dashboardDispatch\.getDashboardDispatch/);
  assert.doesNotMatch(index, /function\s+getDashboardDispatch\(/);

  assert.match(dispatchModule, /export\s+function\s+createDashboardDispatchApi/);
  assert.match(dispatchModule, /function\s+getDashboardDispatch\(/);
  assert.match(dispatchModule, /readDispatchLog\(memoryDir\)/);
  assert.match(dispatchModule, /\.slice\(-100\)\.reverse\(\)/);
  assert.match(dispatchModule, /readLatestRelayStatusByThread\(memoryDir\)/);
  // `logs` and `relay` are display windows capped at 100 entries. The uncapped counts
  // must stay in the payload, or the dashboard is back to rendering an array length as
  // if it were a total.
  assert.match(dispatchModule, /logsTotal:/);
  assert.match(dispatchModule, /relayActive:/);
});

test("dashboard tools and capabilities API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const toolsModule = await readRepoFile("src/dashboard/tools.js");

  assert.match(index, /from\s+["']\.\/dashboard\/tools\.js["']/);
  assert.match(index, /createDashboardToolsApi\(/);
  assert.match(index, /dashboardTools\.getDashboardTools/);
  assert.match(index, /dashboardTools\.buildCapabilityRegistry/);
  assert.match(index, /dashboardTools\.summarizeToolConnections/);
  assert.match(index, /dashboardTools\.getDashboardDetection/);
  assert.doesNotMatch(index, /function\s+getDashboardTools\(/);
  assert.doesNotMatch(index, /function\s+buildCapabilityRegistry\(/);
  assert.doesNotMatch(index, /function\s+buildToolCapabilityEntry\(/);
  assert.doesNotMatch(index, /function\s+summarizeToolConnections\(/);

  assert.match(toolsModule, /export\s+function\s+createDashboardToolsApi/);
  assert.match(toolsModule, /function\s+getDashboardTools\(/);
  assert.match(toolsModule, /function\s+buildCapabilityRegistry\(/);
  assert.match(toolsModule, /function\s+buildToolCapabilityEntry\(/);
  assert.match(toolsModule, /function\s+summarizeToolConnections\(/);
  assert.match(toolsModule, /function\s+buildToolMetricsByName\(/);
  assert.match(toolsModule, /readDispatchRuns\(memoryDir\)/);
  assert.match(toolsModule, /refreshDetectedTools\(memoryDir\)/);
});

test("dashboard settings API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const settingsModule = await readRepoFile("src/dashboard/settings.js");

  assert.match(index, /from\s+["']\.\/dashboard\/settings\.js["']/);
  assert.match(index, /createDashboardSettingsApi\(/);
  assert.match(index, /dashboardSettings\.getDashboardSettings/);
  assert.match(index, /dashboardSettings\.updateDashboardSettings/);
  assert.doesNotMatch(index, /function\s+getDashboardSettings\(/);
  assert.doesNotMatch(index, /function\s+updateDashboardSettings\(/);
  assert.doesNotMatch(index, /function\s+normalizeDashboardShortcuts\(/);

  assert.match(settingsModule, /export\s+function\s+createDashboardSettingsApi/);
  assert.match(settingsModule, /function\s+getDashboardSettings\(/);
  assert.match(settingsModule, /function\s+updateDashboardSettings\(/);
  assert.match(settingsModule, /function\s+normalizeDashboardShortcuts\(/);
  assert.match(settingsModule, /DEFAULT_DASHBOARD_SHORTCUT_BINDINGS/);
});

test("dashboard backups API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const backupsModule = await readRepoFile("src/dashboard/backups.js");

  assert.match(index, /from\s+["']\.\/dashboard\/backups\.js["']/);
  assert.match(index, /createDashboardBackupsApi\(/);
  assert.match(index, /dashboardBackups\.getDashboardBackups/);
  assert.match(index, /dashboardBackups\.getDashboardGitHubBackupStatus/);
  assert.match(index, /dashboardBackups\.configureDashboardGitHubBackup/);
  assert.match(index, /dashboardBackups\.runDashboardGitHubBackup/);
  assert.match(index, /dashboardBackups\.getDashboardBackupDetail/);
  assert.match(index, /dashboardBackups\.createDashboardBackup/);
  assert.match(index, /dashboardBackups\.pruneDashboardBackups/);
  assert.match(index, /dashboardBackups\.restoreDashboardBackup/);
  assert.doesNotMatch(index, /function\s+getDashboardBackups\(/);
  assert.doesNotMatch(index, /function\s+buildDashboardGitHubBackupRunArgv\(/);
  assert.doesNotMatch(index, /function\s+buildDashboardGitHubBackupConfigureArgv\(/);

  assert.match(backupsModule, /export\s+function\s+createDashboardBackupsApi/);
  assert.match(backupsModule, /function\s+getDashboardBackups\(/);
  assert.match(backupsModule, /function\s+getDashboardGitHubBackupStatus\(/);
  assert.match(backupsModule, /function\s+configureDashboardGitHubBackup\(/);
  assert.match(backupsModule, /function\s+runDashboardGitHubBackup\(/);
  assert.match(backupsModule, /function\s+getDashboardBackupDetail\(/);
  assert.match(backupsModule, /function\s+createDashboardBackup\(/);
  assert.match(backupsModule, /function\s+pruneDashboardBackups\(/);
  assert.match(backupsModule, /function\s+restoreDashboardBackup\(/);
  assert.match(backupsModule, /function\s+buildDashboardGitHubBackupRunArgv\(/);
  assert.match(backupsModule, /function\s+buildDashboardGitHubBackupConfigureArgv\(/);
  assert.match(backupsModule, /getBackupSummary\(effectiveConfig\.memoryDir/);
  assert.match(backupsModule, /getBackupRetentionConfig\(effectiveConfig\)/);
});

test("dashboard search API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const searchModule = await readRepoFile("src/dashboard/search.js");

  assert.match(index, /from\s+["']\.\/dashboard\/search\.js["']/);
  assert.match(index, /createDashboardSearchApi\(/);
  assert.match(index, /dashboardSearch\.getDashboardSearch/);
  assert.doesNotMatch(index, /function\s+getDashboardSearch\(/);
  assert.doesNotMatch(index, /function\s+buildDashboardSearchCorpus\(/);
  assert.doesNotMatch(index, /function\s+makeDashboardSearchPreview\(/);

  assert.match(searchModule, /export\s+function\s+createDashboardSearchApi/);
  assert.match(searchModule, /function\s+getDashboardSearch\(/);
  assert.match(searchModule, /function\s+buildDashboardSearchCorpus\(/);
  assert.match(searchModule, /function\s+makeDashboardSearchPreview\(/);
  assert.match(searchModule, /buildMemoryIndex\(readLedger\(memoryDir\)/);
});

test("dashboard health API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const healthModule = await readRepoFile("src/dashboard/health.js");

  assert.match(index, /from\s+["']\.\/dashboard\/health\.js["']/);
  assert.match(index, /createDashboardHealthApi\(/);
  assert.match(index, /dashboardHealth\.buildMemoryHealthDiagnostic/);
  assert.match(index, /dashboardHealth\.formatHealthAnalysisForDashboard/);
  assert.doesNotMatch(index, /function\s+buildMemoryHealthDiagnostic\(/);
  assert.doesNotMatch(index, /function\s+formatHealthAnalysisForDashboard\(/);

  assert.match(healthModule, /export\s+function\s+createDashboardHealthApi/);
  assert.match(healthModule, /function\s+buildMemoryHealthDiagnostic\(/);
  assert.match(healthModule, /function\s+formatHealthAnalysisForDashboard\(/);
  assert.match(healthModule, /renderMemoryHealthReport\(config,\s*index/);
});

test("dashboard realtime and snapshot API lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const realtimeModule = await readRepoFile("src/dashboard/realtime.js");

  assert.match(index, /from\s+["']\.\/dashboard\/realtime\.js["']/);
  assert.match(index, /createDashboardRealtimeApi\(/);
  assert.match(index, /dashboardRealtime\.getDashboardSnapshot/);
  assert.match(index, /dashboardRealtime\.createDashboardRealtime/);
  assert.match(index, /dashboardRealtime\.watchDashboardState/);
  assert.doesNotMatch(index, /function\s+getDashboardSnapshot\(/);
  assert.doesNotMatch(index, /function\s+createDashboardRealtime\(/);
  assert.doesNotMatch(index, /function\s+handleIncomingWebSocketData\(/);
  assert.doesNotMatch(index, /function\s+sendWebSocketJson\(/);
  assert.doesNotMatch(index, /function\s+sendWebSocketFrame\(/);
  assert.doesNotMatch(index, /function\s+watchDashboardState\(/);

  assert.match(realtimeModule, /export\s+function\s+createDashboardRealtimeApi/);
  assert.match(realtimeModule, /function\s+getDashboardSnapshot\(/);
  assert.match(realtimeModule, /function\s+createDashboardRealtime\(/);
  assert.match(realtimeModule, /function\s+handleIncomingWebSocketData\(/);
  assert.match(realtimeModule, /function\s+sendWebSocketJson\(/);
  assert.match(realtimeModule, /function\s+sendWebSocketFrame\(/);
  assert.match(realtimeModule, /function\s+watchDashboardState\(/);
  assert.match(realtimeModule, /dashboardMemory\.getDashboardMemory\(memoryDir\)/);
  assert.match(realtimeModule, /snapshot:\s*getDashboardSnapshot\(memoryDir\)/);
});

test("dashboard action route wrappers live outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const actionsModule = await readRepoFile("src/dashboard/actions.js");

  assert.match(index, /from\s+["']\.\/dashboard\/actions\.js["']/);
  assert.match(index, /createDashboardActionsApi\(/);
  for (const action of [
    "recordDashboardMemory",
    "sendDashboardRadio",
    "addDashboardTask",
    "claimDashboardTask",
    "setDashboardTaskStatus",
    "reviewDashboardTask",
    "runDashboardDispatch",
    "dispatchDashboardMarvis",
    "promoteDashboardRadio",
    "syncDashboardMemory",
    "pullDashboardMemory",
    "getDashboardInstallPreview",
    "applyDashboardInstall"
  ]) {
    assert.match(index, new RegExp(`dashboardActions\\.${action}`));
    assert.match(actionsModule, new RegExp(`function\\s+${action}\\(`));
  }

  assert.doesNotMatch(index, /recordCommand\(\[/);
  assert.doesNotMatch(index, /createRadioMessage\(\{\s*[\s\S]*?to:\s*"marvis"/);
  assert.match(actionsModule, /export\s+function\s+createDashboardActionsApi/);
  assert.match(actionsModule, /appendIfMissing\(target\.file,\s*snippet,\s*"Shared AI Memory"\)/);
});

