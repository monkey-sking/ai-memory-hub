import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_FILES_PER_SOURCE = 500;
const MAX_FILE_BYTES = 16 * 1024 * 1024;

export const NATIVE_MEMORY_SOURCE_DEFS = [
  {
    source: "codex",
    label: "Codex native memory",
    files: [".codex/memories_v2/memory_summary.md", ".codex/memories/memory_summary.md"]
  },
  {
    source: "workbuddy",
    label: "WorkBuddy native memory",
    roots: [".workbuddy/memory"],
    match: (filePath) => filePath.endsWith("_memory.md")
  }
];

export function scanNativeMemorySources({ home = os.homedir(), sources = NATIVE_MEMORY_SOURCE_DEFS } = {}) {
  const found = [];
  const missing = [];
  for (const definition of sources) {
    const files = definition.files
      ? definition.files.map((item) => path.join(home, item))
      : findFiles(path.join(home, definition.roots[0]), definition.match);
    for (const file of files) {
      const stat = fs.statSync(file, { throwIfNoEntry: false });
      if (!stat?.isFile()) {
        if (definition.files) missing.push({ source: definition.source, path: file, reason: "missing" });
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        found.push({ source: definition.source, path: file, size: stat.size, mtimeMs: Math.round(stat.mtimeMs), status: "skipped", disposition: "too large; inspect manually" });
        continue;
      }
      const content = fs.readFileSync(file);
      found.push({
        source: definition.source,
        path: file,
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
        status: "candidate",
        empty: stat.size === 0,
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
        disposition: stat.size === 0
          ? "empty; no content to merge"
          : "read-only candidate; review before selective manual extraction; never auto-merge"
      });
    }
  }
  return {
    ok: true,
    readOnly: true,
    mergePolicy: "manual-selective",
    scannedAt: new Date().toISOString(),
    sources: found,
    missing
  };
}

function findFiles(root, match) {
  const found = [];
  const walk = (directory, depth) => {
    if (found.length >= MAX_FILES_PER_SOURCE || depth > 5) return;
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_FILES_PER_SOURCE) return;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if ([".git", "node_modules", "cache", "caches", "tmp"].includes(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile() && match(full)) {
        found.push(full);
      }
    }
  };
  walk(root, 0);
  return found;
}
