// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
