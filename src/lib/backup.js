// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createId, ensureDir, writeJson } from "./cli.js";
import { getBackupFileCatalog, markTieredBackups } from "./util.js";

export function getFileHash(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return "";
  }
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function getGitHubBackupUploadWarnings(github, scan, { wouldPush = false } = {}) {
  const warnings = [];
  if (wouldPush) {
    warnings.push("Data security reminder: this backup upload may send private user data to the configured remote. Verify the remote owner, access controls, retention policy, and recovery need before uploading.");
    if (scan.issues.length > 0) {
      warnings.push(github.allowPlaintextSensitive
        ? "Sensitive-looking content was detected and plaintext upload is explicitly allowed; proceed only if this remote is approved for private backup data."
        : "Sensitive-looking content was detected; plaintext upload is blocked by default.");
    }
  } else if (scan.issues.length > 0) {
    warnings.push("Local backup contains private user data; protect the backup directory and use remote upload only after confirming data security.");
  }
  return warnings;
}

export function normalizeBackupPatternList(value, fallback = []) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const normalized = list.map((item) => String(item || "").trim()).filter(Boolean);
  return normalized.length ? normalized : [...fallback];
}

export function matchesAnyBackupPattern(name, patterns = []) {
  if (!patterns.length) {
    return false;
  }
  return patterns.some((pattern) => {
    if (pattern === "*" || pattern === name) {
      return true;
    }
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(name);
  });
}

export function normalizeScheduleTime(value) {
  const raw = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) {
    throw new Error("Schedule time must use HH:mm format.");
  }
  const [hours, minutes] = raw.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    throw new Error("Schedule time must be a valid 24-hour time.");
  }
  return raw;
}

export function resolveConfiguredPath(value) {
  const raw = String(value || "").trim();
  const expanded = raw
    .replace(/^~(?=$|[\\/])/, os.homedir())
    .replace(/%USERPROFILE%/gi, os.homedir())
    .replace(/\$HOME/g, os.homedir());
  return path.resolve(expanded);
}

export function extractListValue(text, key) {
  const line = String(text || "").split(/\r?\n/).find((item) => item.toLowerCase().startsWith(key.toLowerCase()));
  if (!line) {
    return "";
  }
  return line.slice(line.indexOf(":") + 1).trim();
}

export function renderGitHubBackupReadme(manifest) {
  return `# AI Memory Hub Data Backup

This repository is maintained by \`ai-memory-hub backup run\`.

- Generated at: ${manifest.generatedAt}
- Files: ${manifest.files.length}

Restore manually by copying files from \`snapshot/\` back into the matching
AI Memory Hub data files, or use the local AMH restore tools for local backup
sets in \`.ai-memory/backups\`.
`;
}

export function markProtectedBackups(backups, markKeep) {
  for (const backup of backups) {
    if (backup.retentionTier === "manual" || backup.retentionTier === "protected") {
      markKeep(backup, `${backup.retentionTier}-protected`);
    }
  }
}

export function parseBackupTimestampFromName(name) {
  const match = String(name || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!match) {
    return "";
  }
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}

export function inferBackupReasonFromName(name) {
  return String(name || "").replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-?/, "") || "manual";
}

export function inferBackupRetentionTier(reason) {
  const value = String(reason || "").toLowerCase();
  if (value.startsWith("pre-sync")) return "pre-sync";
  if (value.startsWith("daily")) return "daily";
  if (value.startsWith("weekly")) return "weekly";
  if (value.startsWith("pre-pull")) return "pre-pull";
  return "manual";
}

export function createdAtRetentionKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function formatBackupDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function getIsoWeekKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function isPathInsideDirectory(target, root) {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function countBackupDirs(memoryDir) {
  const dir = path.join(memoryDir, "backups");
  if (!fs.existsSync(dir)) {
    return 0;
  }
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

export function backupHub(memoryDir, reason, options = {}) {
  const createdAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  const safeReason = String(reason || "manual").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 48) || "manual";
  const backupDir = path.join(memoryDir, "backups", `${stamp}-${safeReason}`);
  ensureDir(backupDir);

  const files = getBackupFileCatalog(memoryDir);
  const copied = [];
  for (const file of files) {
    if (fs.existsSync(file.target)) {
      fs.copyFileSync(file.target, path.join(backupDir, file.name));
      copied.push(file.name);
    }
  }

  const manifest = {
    id: createId(`backup:${createdAt}:${reason}:${backupDir}`),
    createdAt,
    reason,
    dir: backupDir,
    trigger: options.trigger || "",
    retention: {
      tier: options.retentionTier || inferBackupRetentionTier(reason),
      key: options.retentionKey || "",
      policy: options.retentionPolicy || ""
    },
    files: copied
  };
  writeJson(path.join(backupDir, "manifest.json"), manifest);
  return manifest;
}

export function resolveBackupDirectory(memoryDir, name) {
  const rawName = String(name || "").trim();
  if (!rawName || rawName.includes("/") || rawName.includes("\\") || rawName === "." || rawName === "..") {
    throw new Error("A valid backup name is required.");
  }
  const backupsRoot = path.resolve(memoryDir, "backups");
  const backupDir = path.resolve(backupsRoot, rawName);
  if (!isPathInsideDirectory(backupDir, backupsRoot)) {
    throw new Error("Backup path is outside backups directory.");
  }
  if (!fs.existsSync(backupDir) || !fs.statSync(backupDir).isDirectory()) {
    throw new Error(`Backup not found: ${rawName}`);
  }
  return backupDir;
}

export function getGitHubBackupExportFiles(memoryDir, github) {
  const include = github.include.length ? github.include : getBackupFileCatalog(memoryDir).map((file) => file.name);
  const exclude = github.exclude || [];
  return getBackupFileCatalog(memoryDir)
    .filter((file) => fs.existsSync(file.target))
    .filter((file) => matchesAnyBackupPattern(file.name, include))
    .filter((file) => !matchesAnyBackupPattern(file.name, exclude));
}

export function getDefaultGitHubBackupInclude(memoryDir) {
  return getBackupFileCatalog(memoryDir)
    .map((file) => file.name)
    .filter((name) => name !== "config.json");
}

export function assertSafeGitHubBackupRepoDir(memoryDir, repoDir) {
  const memoryRoot = path.resolve(memoryDir);
  const repoRoot = path.resolve(repoDir);
  if (repoRoot === memoryRoot || isPathInsideDirectory(repoRoot, memoryRoot)) {
    throw new Error("GitHub backup repoDir must be outside the memoryDir to avoid recursive backup.");
  }
  if (repoRoot === path.parse(repoRoot).root) {
    throw new Error("GitHub backup repoDir cannot be a filesystem root.");
  }
}

export function ensureSafeChildPath(target, root) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  if (resolvedTarget !== resolvedRoot && !isPathInsideDirectory(resolvedTarget, resolvedRoot)) {
    throw new Error(`Refusing to write outside expected directory: ${target}`);
  }
}

export function planBackupRetention(backups, { daily = 7, weekly = 4, preSync = 20, prePull = 20 } = {}) {
  const keep = new Map();
  const markKeep = (backup, reason) => {
    if (!backup || keep.has(backup.name)) return;
    keep.set(backup.name, { ...backup, retention: "keep", retentionReason: reason });
  };
  const sorted = [...backups].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  markKeep(sorted[0], "latest");

  markProtectedBackups(sorted, markKeep);
  markTieredBackups(sorted, {
    tier: "daily",
    limit: daily,
    keyForBackup: (backup) => backup.retentionKey || formatBackupDay(backup.createdAt),
    label: "daily"
  }, markKeep);
  markTieredBackups(sorted, {
    tier: "weekly",
    limit: weekly,
    keyForBackup: (backup) => backup.retentionKey || getIsoWeekKey(backup.createdAt),
    label: "weekly"
  }, markKeep);
  markTieredBackups(sorted, {
    tier: "pre-sync",
    limit: preSync,
    keyForBackup: (backup) => backup.name,
    label: "pre-sync"
  }, markKeep);
  markTieredBackups(sorted, {
    tier: "pre-pull",
    limit: prePull,
    keyForBackup: (backup) => backup.name,
    label: "pre-pull"
  }, markKeep);

  const keepList = sorted.map((backup) => keep.get(backup.name)).filter(Boolean);
  const prune = sorted
    .filter((backup) => !keep.has(backup.name))
    .map((backup) => ({ ...backup, retention: "prune", retentionReason: "outside retention policy" }));
  return {
    backups: [...keepList, ...prune].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    keep: keepList,
    prune
  };
}

export function inferBackupRetentionKey(tier, createdAt) {
  if (tier === "daily") return formatBackupDay(createdAt);
  if (tier === "weekly") return getIsoWeekKey(createdAt);
  if (tier === "pre-sync") return createdAtRetentionKey(createdAt);
  return "";
}

export function assertSafeDispatchWorktreeRoot(repoRoot, worktreeRoot) {
  const resolvedRoot = path.resolve(worktreeRoot);
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new Error("Dispatch worktree root cannot be a filesystem root.");
  }
  const gitDir = path.join(path.resolve(repoRoot), ".git");
  if (resolvedRoot === gitDir || isPathInsideDirectory(resolvedRoot, gitDir)) {
    throw new Error("Dispatch worktree root cannot be inside the repository .git directory.");
  }
}
