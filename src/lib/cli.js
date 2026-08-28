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
import { writeFileAtomic } from "../atomic-write.js";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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
  ensureDir(path.dirname(file));
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
