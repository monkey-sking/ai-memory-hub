// Shared CLI / filesystem helper layer.
//
// These are the zero-business-dependency primitives that *every* command in the
// hub relies on (getOption alone is called ~470 times across index.js). They
// were previously inlined at the bottom of the 18k-line index.js monolith;
// extracting them here is the first step of the "shared helper layer" refactor
// (v2.5) so the monolith can shrink and later command extractions stay clean.
//
// Everything here depends only on node builtins (fs/path/crypto) and the
// atomic-write helper — never on index.js internals, so this module is fully
// self-contained and importable from any command module.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { writeFileAtomic } from "../atomic-write.js";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Resolve the current user's home directory robustly. We deliberately fall back
// to os.homedir() and never to process.cwd(): a server launched from a
// root-owned working directory (common for daemons / IDE extensions) would
// otherwise resolve the shared memory store to a non-writable path and produce
// the "没有权限写入 ~/.ai-memory" EACCES report that users have hit.
export function userHome() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir();
}

// Ensure a directory exists AND is writable by the current process. Throws a
// clear, actionable error instead of an opaque EACCES stack trace. This single
// guard turns "写入共享记忆失败" into a message the user can actually act on.
export function ensureWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (err) {
    throw new Error(
      `AI Memory Hub 无法创建共享记忆目录：${dir}（${err.code || "错误"}）。` +
      `请确认上级目录可写，或用环境变量 AI_MEMORY_DIR 指定一个可写目录后重试。`
    );
  }
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (err) {
    const hint = process.platform === "win32"
      ? `请右键该目录 → 属性 → 安全，赋予当前用户“完全控制”，或删除后重新运行 ai-memory-hub init。`
      : `请运行：sudo chown -R $USER "${dir}"，或删除该目录后重新运行 ai-memory-hub init。`;
    throw new Error(
      `AI Memory Hub 没有权限写入共享记忆目录：${dir}（${err.code || "EACCES"}）。${hint}` +
      `也可设置环境变量 AI_MEMORY_DIR 指向一个可写目录。`
    );
  }
  return dir;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function readJsonSafe(file, fallback = {}) {
  try {
    return readJson(file);
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  ensureWritableDir(path.dirname(file));
  writeFileAtomic(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function createId(input) {
  return crypto.createHash("sha256")
    .update(`${Date.now()}:${input}`)
    .digest("hex")
    .slice(0, 16);
}

export function getOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return "";
  }
  const value = argv[index + 1] || "";
  return value.startsWith("--") ? "" : value;
}

export function hasOption(argv, name) {
  return argv.indexOf(name) !== -1;
}

export function hasFlag(argv, name) {
  return argv.includes(name);
}

export function parsePositiveIntegerOption(rawValue, name, { allowEmpty = false, defaultValue = 0 } = {}) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (allowEmpty) {
      return defaultValue;
    }
    throw new Error(`${name} requires a positive integer.`);
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function positionalArgs(argv) {
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      index++;
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

export function countJsonlFiles(dir) {
  if (!fs.existsSync(dir)) {
    return 0;
  }
  return fs.readdirSync(dir).filter((file) => file.endsWith(".jsonl")).length;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasOwnField(source, field) {
  return Object.prototype.hasOwnProperty.call(source, field);
}
