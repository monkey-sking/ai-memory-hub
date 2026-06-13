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
  assert.match(radioModule, /readRadioMessages\(memoryDir\)\.slice\(-50\)/);
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
  assert.match(tasksModule, /\.slice\(0,\s*200\)/);
});

test("dashboard workflow read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const workflowsModule = await readRepoFile("src/dashboard/workflows.js");

  assert.match(index, /from\s+["']\.\/dashboard\/workflows\.js["']/);
  assert.match(index, /createDashboardWorkflowsApi\(/);
  assert.match(index, /dashboardWorkflows\.getDashboardWorkflows/);
  assert.doesNotMatch(index, /function\s+getDashboardWorkflows\(/);

  assert.match(workflowsModule, /export\s+function\s+createDashboardWorkflowsApi/);
  assert.match(workflowsModule, /function\s+getDashboardWorkflows\(/);
  assert.match(workflowsModule, /readWorkflows\(memoryDir\)/);
  assert.match(workflowsModule, /\.slice\(0,\s*100\)/);
});

test("dashboard project read model lives outside the CLI entrypoint", async () => {
  const index = await readRepoFile("src/index.js");
  const projectsModule = await readRepoFile("src/dashboard/projects.js");

  assert.match(index, /from\s+["']\.\/dashboard\/projects\.js["']/);
  assert.match(index, /createDashboardProjectsApi\(/);
  assert.match(index, /dashboardProjects\.getDashboardProjects/);
  assert.doesNotMatch(index, /function\s+getDashboardProjects\(/);

  assert.match(projectsModule, /export\s+function\s+createDashboardProjectsApi/);
  assert.match(projectsModule, /function\s+getDashboardProjects\(/);
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
  assert.match(dispatchModule, /readDispatchLog\(memoryDir\)\.slice\(-100\)\.reverse\(\)/);
  assert.match(dispatchModule, /readLatestRelayStatusByThread\(memoryDir\)/);
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
