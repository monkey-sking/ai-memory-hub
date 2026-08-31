import { getOption, hasFlag, parsePositiveIntegerOption, positionalArgs } from "../lib/cli.js";

// backup command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function backupCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const retention = deps.getBackupRetentionConfig(config);
  const action = argv[0] && !argv[0].startsWith("--") ? argv[0] : "create";
  if (action === "status") {
    console.log(JSON.stringify(deps.getGitHubBackupStatus(config), null, 2));
    return;
  }
  if (action === "run") {
    const result = deps.withHubLock(config.memoryDir, "github-backup", () => deps.runGitHubBackup(config, argv.slice(1)), config.sync.lockStaleMs);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "configure" || action === "config") {
    const result = deps.configureGitHubBackup(config, argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "schedule") {
    const result = deps.githubBackupScheduleCommand(config, argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "list") {
    const limit = getOption(argv, "--limit")
      ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit")
      : 50;
    console.log(JSON.stringify(deps.getBackupSummary(config.memoryDir, { limit, ...retention }), null, 2));
    return;
  }
  if (action === "prune") {
    const apply = hasFlag(argv, "--apply");
    const daily = getOption(argv, "--daily")
      ? parsePositiveIntegerOption(getOption(argv, "--daily"), "--daily")
      : retention.daily;
    const weekly = getOption(argv, "--weekly")
      ? parsePositiveIntegerOption(getOption(argv, "--weekly"), "--weekly")
      : retention.weekly;
    const preSync = getOption(argv, "--pre-sync")
      ? parsePositiveIntegerOption(getOption(argv, "--pre-sync"), "--pre-sync")
      : retention.preSync;
    const prePull = getOption(argv, "--pre-pull")
      ? parsePositiveIntegerOption(getOption(argv, "--pre-pull"), "--pre-pull")
      : retention.prePull;
    const result = apply
      ? deps.withHubLock(config.memoryDir, "backup-prune", () => deps.pruneBackups(config.memoryDir, { apply, daily, weekly, preSync, prePull }), config.sync.lockStaleMs)
      : deps.pruneBackups(config.memoryDir, { apply, daily, weekly, preSync, prePull });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action !== "create") {
    throw new Error("Usage: ai-memory-hub backup [--reason manual] | ai-memory-hub backup status | ai-memory-hub backup run [--no-push] | ai-memory-hub backup configure [--enabled] [--remote-url <url>] [--repo-dir <dir>] [--allow-plaintext-sensitive] | ai-memory-hub backup schedule <status|install|uninstall> | ai-memory-hub backup list [--limit N] | ai-memory-hub backup prune [--daily 7] [--weekly 4] [--pre-sync 20] [--pre-pull 20] [--apply]");
  }
  const reason = getOption(argv, "--reason") || positionalArgs(argv).join(" ").trim() || "manual";
  const backup = deps.withHubLock(config.memoryDir, "backup", () => deps.backupHub(config.memoryDir, reason, deps), config.sync.lockStaleMs);
  console.log(JSON.stringify(backup, null, 2));
}
