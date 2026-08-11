export function createDashboardBackupsApi({
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
}) {
  function getDashboardBackups(config) {
    const effectiveConfig = typeof config === "string"
      ? { ...loadConfig(), memoryDir: config }
      : config;
    return getBackupSummary(effectiveConfig.memoryDir, { limit: 100, ...getBackupRetentionConfig(effectiveConfig) });
  }

  function getDashboardGitHubBackupStatus() {
    return {
      ok: true,
      github: getGitHubBackupStatus(loadConfig())
    };
  }

  function configureDashboardGitHubBackup(body = {}) {
    const result = configureGitHubBackup(loadConfig(), buildDashboardGitHubBackupConfigureArgv(body));
    return {
      ...result,
      status: getGitHubBackupStatus(loadConfig())
    };
  }

  function runDashboardGitHubBackup(body = {}) {
    const runConfig = loadConfig();
    return withHubLock(
      runConfig.memoryDir,
      "github-backup",
      () => runGitHubBackup(runConfig, buildDashboardGitHubBackupRunArgv(body)),
      runConfig.sync.lockStaleMs
    );
  }

  function getDashboardBackupDetail(config, name) {
    const effectiveConfig = typeof config === "string"
      ? { ...loadConfig(), memoryDir: config }
      : config;
    return getBackupDetail(effectiveConfig.memoryDir, name);
  }

  function createDashboardBackup(config, body = {}) {
    const reason = String(body.reason || "dashboard-manual").trim() || "dashboard-manual";
    const backup = withHubLock(
      config.memoryDir,
      "backup",
      () => backupHub(config.memoryDir, reason),
      config.sync.lockStaleMs
    );
    return { ok: true, backup, backups: getDashboardBackups(config) };
  }

  function pruneDashboardBackups(config, body = {}) {
    const retention = getBackupRetentionConfig(config);
    const daily = Number.isInteger(Number(body.daily)) && Number(body.daily) > 0 ? Number(body.daily) : retention.daily;
    const weekly = Number.isInteger(Number(body.weekly)) && Number(body.weekly) > 0 ? Number(body.weekly) : retention.weekly;
    const preSync = Number.isInteger(Number(body.preSync)) && Number(body.preSync) > 0 ? Number(body.preSync) : retention.preSync;
    const apply = Boolean(body.apply);
    const result = apply
      ? withHubLock(config.memoryDir, "backup-prune", () => pruneBackups(config.memoryDir, { apply, daily, weekly, preSync }), config.sync.lockStaleMs)
      : pruneBackups(config.memoryDir, { apply, daily, weekly, preSync });
    return { ok: true, ...result, backups: getDashboardBackups(config) };
  }

  function restoreDashboardBackup(config, body = {}) {
    const apply = Boolean(body.apply);
    const result = apply
      ? withHubLock(config.memoryDir, "backup-restore", () => restoreBackup(config.memoryDir, body.name, {
        apply,
        confirm: body.confirm
      }), config.sync.lockStaleMs)
      : restoreBackup(config.memoryDir, body.name, { apply: false });
    return { ok: true, ...result, backups: getDashboardBackups(config) };
  }

  // Bulk delete of an explicit set of backups chosen in the dashboard. `apply`
  // mirrors prune: false returns the plan without touching disk.
  function deleteDashboardBackups(config, body = {}) {
    const names = Array.isArray(body.names) ? body.names.map(String).filter(Boolean) : [];
    const apply = Boolean(body.apply);
    const result = apply
      ? withHubLock(config.memoryDir, "backup-delete", () => deleteBackups(config.memoryDir, { names, apply }), config.sync.lockStaleMs)
      : deleteBackups(config.memoryDir, { names, apply: false });
    return { ok: true, ...result, backups: getDashboardBackups(config) };
  }

  function buildDashboardGitHubBackupRunArgv(body = {}) {
    const argv = [];
    if (body.dryRun === true) {
      argv.push("--dry-run");
    }
    if (body.push !== true) {
      argv.push("--no-push");
    }
    for (const [field, option] of [
      ["reason", "--reason"],
      ["remoteUrl", "--remote-url"],
      ["repoDir", "--repo-dir"],
      ["branch", "--branch"]
    ]) {
      if (body[field] !== undefined) {
        argv.push(option, String(body[field] ?? ""));
      }
    }
    return argv;
  }

  function buildDashboardGitHubBackupConfigureArgv(body = {}) {
    const argv = [];
    if (body.enabled === true) {
      argv.push("--enabled");
    } else if (body.enabled === false) {
      argv.push("--disabled");
    }
    if (body.allowPlaintextSensitive === true) {
      argv.push("--allow-plaintext-sensitive");
    } else if (body.allowPlaintextSensitive === false) {
      argv.push("--block-plaintext-sensitive");
    }
    if (body.scheduleEnabled === true) {
      argv.push("--schedule-enabled");
    } else if (body.scheduleEnabled === false) {
      argv.push("--schedule-disabled");
    }
    for (const [field, option] of [
      ["remoteUrl", "--remote-url"],
      ["repoDir", "--repo-dir"],
      ["branch", "--branch"],
      ["include", "--include"],
      ["exclude", "--exclude"],
      ["time", "--time"],
      ["taskName", "--task-name"]
    ]) {
      if (body[field] !== undefined) {
        const value = Array.isArray(body[field]) ? body[field].join(",") : String(body[field] ?? "");
        argv.push(option, value);
      }
    }
    return argv;
  }

  return {
    configureDashboardGitHubBackup,
    createDashboardBackup,
    getDashboardBackupDetail,
    getDashboardBackups,
    getDashboardGitHubBackupStatus,
    pruneDashboardBackups,
    deleteDashboardBackups,
    restoreDashboardBackup,
    runDashboardGitHubBackup
  };
}
