export function createDashboardBackupsApi({
  getBackupRetentionConfig,
  getBackupSummary,
  loadConfig
}) {
  function getDashboardBackups(config) {
    const effectiveConfig = typeof config === "string"
      ? { ...loadConfig(), memoryDir: config }
      : config;
    return getBackupSummary(effectiveConfig.memoryDir, { limit: 100, ...getBackupRetentionConfig(effectiveConfig) });
  }

  return {
    getDashboardBackups
  };
}
