import path from "node:path";

const DEFAULT_DASHBOARD_SHORTCUT_BINDINGS = Object.freeze({
  focusSearch: "/",
  openSearch: "mod+k",
  showHelp: "ctrl+/",
  closeLayer: "escape"
});

const DEFAULT_DASHBOARD_TAB_BINDINGS = Object.freeze({
  dashboard: "1",
  memory: "2",
  radio: "3",
  tasks: "4",
  dispatch: "5",
  workflows: "6",
  analytics: "7",
  backups: "8",
  settings: "9",
  health: "0"
});

export function createDashboardSettingsApi({
  defaultConfig,
  getBackupRetentionConfig,
  loadConfig,
  readJsonSafe,
  writeJson
}) {
  function getDashboardSettings() {
    const config = loadConfig();
    const backupRetention = getBackupRetentionConfig(config);
    return {
      memoryDir: config.memoryDir,
      sync: {
        snapshotLimit: config.sync.snapshotLimit,
        coreLimit: config.sync.coreLimit,
        recentLimit: config.sync.recentLimit,
        lockStaleMs: config.sync.lockStaleMs
      },
      dashboard: {
        autoRefresh: config.dashboard?.autoRefresh ?? true,
        refreshIntervalMs: config.dashboard?.refreshIntervalMs || 5000,
        language: config.dashboard?.language || "zh",
        theme: config.dashboard?.theme || "dark",
        notifications: config.dashboard?.notifications ?? true,
        shortcuts: normalizeDashboardShortcuts(config.dashboard?.shortcuts)
      },
      backupPolicy: {
        daily: backupRetention.daily,
        weekly: backupRetention.weekly,
        preSync: backupRetention.preSync,
        pruneAfterSync: backupRetention.pruneAfterSync
      }
    };
  }

  function updateDashboardSettings(body = {}) {
    const config = loadConfig();
    const configPath = path.join(config.memoryDir, "config.json");
    const current = readJsonSafe(configPath, defaultConfig(config.memoryDir));
    const next = { ...current };
    const syncPatch = body.sync || {};
    const dashboardPatch = body.dashboard || {};
    const backupPatch = body.backupPolicy || body.backups || {};

    next.sync = { ...(current.sync || {}) };
    for (const key of ["snapshotLimit", "coreLimit", "recentLimit", "lockStaleMs"]) {
      if (syncPatch[key] !== undefined && syncPatch[key] !== "") {
        const numeric = Number(syncPatch[key]);
        if (!Number.isInteger(numeric) || numeric <= 0) {
          throw new Error(`settings.sync.${key} must be a positive integer`);
        }
        next.sync[key] = numeric;
      }
    }

    next.dashboard = { ...(defaultConfig(config.memoryDir).dashboard || {}), ...(current.dashboard || {}) };
    if (dashboardPatch.autoRefresh !== undefined) {
      next.dashboard.autoRefresh = Boolean(dashboardPatch.autoRefresh);
    }
    if (dashboardPatch.refreshIntervalMs !== undefined && dashboardPatch.refreshIntervalMs !== "") {
      const interval = Number(dashboardPatch.refreshIntervalMs);
      if (!Number.isInteger(interval) || interval < 1000 || interval > 60000) {
        throw new Error("settings.dashboard.refreshIntervalMs must be between 1000 and 60000");
      }
      next.dashboard.refreshIntervalMs = interval;
    }
    if (dashboardPatch.language) {
      next.dashboard.language = ["zh", "en"].includes(dashboardPatch.language) ? dashboardPatch.language : "zh";
    }
    if (dashboardPatch.theme) {
      next.dashboard.theme = ["dark", "light"].includes(dashboardPatch.theme) ? dashboardPatch.theme : "dark";
    }
    if (dashboardPatch.notifications !== undefined) {
      next.dashboard.notifications = Boolean(dashboardPatch.notifications);
    }
    next.dashboard.shortcuts = normalizeDashboardShortcuts(next.dashboard.shortcuts);
    if (dashboardPatch.shortcuts !== undefined) {
      const shortcutPatch = dashboardPatch.shortcuts && typeof dashboardPatch.shortcuts === "object"
        ? dashboardPatch.shortcuts
        : {};
      next.dashboard.shortcuts = normalizeDashboardShortcuts({
        ...next.dashboard.shortcuts,
        ...shortcutPatch,
        bindings: {
          ...(next.dashboard.shortcuts.bindings || {}),
          ...(shortcutPatch.bindings || {})
        },
        tabBindings: {
          ...(next.dashboard.shortcuts.tabBindings || {}),
          ...(shortcutPatch.tabBindings || {})
        }
      });
    }

    next.sync.backupRetention = { ...(current.sync?.backupRetention || {}) };
    for (const key of ["daily", "weekly", "preSync"]) {
      if (backupPatch[key] !== undefined && backupPatch[key] !== "") {
        const numeric = Number(backupPatch[key]);
        if (!Number.isInteger(numeric) || numeric <= 0) {
          throw new Error(`settings.backupPolicy.${key} must be a positive integer`);
        }
        next.sync.backupRetention[key] = numeric;
      }
    }
    if (backupPatch.pruneAfterSync !== undefined) {
      next.sync.backupRetention.pruneAfterSync = Boolean(backupPatch.pruneAfterSync);
    }

    writeJson(configPath, next);
    return getDashboardSettings();
  }

  return {
    getDashboardSettings,
    updateDashboardSettings
  };
}

export function defaultDashboardShortcuts() {
  return {
    enabled: true,
    bindings: { ...DEFAULT_DASHBOARD_SHORTCUT_BINDINGS },
    tabBindings: { ...DEFAULT_DASHBOARD_TAB_BINDINGS }
  };
}

function normalizeDashboardShortcutMap(defaults, patch = {}) {
  const source = patch && typeof patch === "object" ? patch : {};
  const result = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const raw = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallback;
    const value = String(raw ?? "").trim();
    result[key] = value ? value.slice(0, 40) : fallback;
  }
  return result;
}

function normalizeDashboardShortcuts(input = {}) {
  const defaults = defaultDashboardShortcuts();
  const source = input && typeof input === "object" ? input : {};
  return {
    enabled: source.enabled !== undefined ? Boolean(source.enabled) : defaults.enabled,
    bindings: normalizeDashboardShortcutMap(defaults.bindings, source.bindings),
    tabBindings: normalizeDashboardShortcutMap(defaults.tabBindings, source.tabBindings)
  };
}
