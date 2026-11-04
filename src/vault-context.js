import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export function resolveVaultRoot(config = {}, override = "") {
  const root = override || process.env.AMH_VAULT_ROOT || config.vault?.root || "";
  if (!root) return "";
  return path.resolve(root === "~" ? os.homedir() : root.startsWith("~/") ? path.join(os.homedir(), root.slice(2)) : root);
}

export function vaultStatus(root) {
  if (!root) return { status: "unconfigured", root: "", readOnly: true };
  try {
    if (!fs.statSync(root).isDirectory()) return { status: "unavailable", root, readOnly: true };
    fs.accessSync(root, fs.constants.R_OK);
    return { status: "available", root, readOnly: true };
  } catch (error) {
    return { status: error.code === "ENOENT" ? "missing" : "unavailable", root, readOnly: true };
  }
}

function hash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function tokens(text) {
  const words = String(text).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
  return [...new Set(words.flatMap((word) => /^[\p{Script=Han}]+$/u.test(word) && word.length > 2
    ? Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2))
    : [word]))];
}

function sections(content, fallbackTitle) {
  const lines = content.split(/\r?\n/);
  const result = [];
  const headings = [];
  let title = fallbackTitle;
  let section = { heading: "", lines: [] };
  let fence = null;
  for (const [index, text] of lines.entries()) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && /^\s{0,3}(?:`+|~+)\s*$/.test(text)) fence = null;
    }
    const heading = !fence && !marker && /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(text);
    if (heading) {
      if (section.lines.length) result.push(section);
      const level = heading[1].length;
      if (level === 1 && title === fallbackTitle) title = heading[2];
      while (headings.length && headings.at(-1).level >= level) headings.pop();
      headings.push({ level, text: heading[2] });
      section = { heading: headings.map((item) => item.text).join(" > "), lines: [] };
    }
    section.lines.push({ text, number: index + 1 });
  }
  if (section.lines.length) result.push(section);
  return { title, sections: result };
}

export function searchVault(root, query, { limit = 5 } = {}) {
  const status = vaultStatus(root);
  const report = { ...status, query: String(query || ""), scannedFiles: 0, skippedFiles: 0, truncated: false, sources: [] };
  const terms = tokens(query || "");
  if (status.status !== "available" || !terms.length) return report;
  const boundedLimit = Math.max(1, Math.min(20, Number.parseInt(limit, 10) || 5));
  const candidates = [];
  let totalBytes = 0;
  let visitedFiles = 0;
  function walk(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      report.skippedFiles++;
      return;
    }
    for (const entry of entries) {
      if (report.truncated) break;
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
      if (++visitedFiles > MAX_FILES) { report.truncated = true; break; }
      try {
        const stat = fs.statSync(file);
        if (stat.size > MAX_FILE_BYTES) { report.skippedFiles++; continue; }
        if (totalBytes + stat.size > MAX_TOTAL_BYTES) { report.truncated = true; break; }
        const bytes = fs.readFileSync(file);
        totalBytes += bytes.length;
        report.scannedFiles++;
        const relativePath = path.relative(root, file).split(path.sep).join("/");
        const document = sections(bytes.toString("utf8"), path.basename(file, path.extname(file)));
        const contentHash = hash(bytes);
        for (const section of document.sections) {
          const header = `${relativePath} ${section.heading}`.toLowerCase();
          const body = section.lines.map((line) => line.text).join("\n").toLowerCase();
          const score = terms.reduce((sum, term) => sum + (header.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0), 0);
          if (!score) continue;
          const excerptLine = section.lines.reduce((best, line) => {
            const hits = terms.filter((term) => line.text.toLowerCase().includes(term)).length;
            return hits > best.hits ? { ...line, hits } : best;
          }, { ...section.lines[0], hits: -1 });
          candidates.push({
            kind: "vault", path: relativePath, title: document.title, heading: section.heading,
            lineStart: excerptLine.number, lineEnd: excerptLine.number,
            excerpt: excerptLine.text.slice(0, 320), contentHash,
            modifiedAt: stat.mtime.toISOString(), score
          });
          if (candidates.length > boundedLimit * 2) {
            candidates.sort(compareSources).splice(boundedLimit);
          }
        }
      } catch { report.skippedFiles++; }
    }
  }
  walk(root);
  report.sources = candidates.sort(compareSources).slice(0, boundedLimit);
  return report;
}

function compareSources(a, b) {
  return b.score - a.score || a.path.localeCompare(b.path) || a.lineStart - b.lineStart;
}

// Resolve each component without following symlinks or trusting stored pack paths.
function sourceFile(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.includes("\0")) return null;
  const parts = relativePath.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return null;
  let file = root;
  for (const part of parts) {
    file = path.join(file, part);
    if (fs.lstatSync(file).isSymbolicLink()) return null;
  }
  return file;
}

export function validateVaultSources(root, sources = []) {
  const status = vaultStatus(root);
  return sources.map((source) => {
    try {
      if (status.status !== "available") return { ...source, status: status.status };
      const file = sourceFile(root, source.path);
      if (!file) return { ...source, status: "invalid" };
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return { ...source, status: "unavailable" };
      const currentHash = hash(fs.readFileSync(file));
      return { ...source, status: currentHash === source.contentHash ? "current" : "changed", currentHash };
    } catch (error) {
      return { ...source, status: error.code === "ENOENT" ? "missing" : "unavailable" };
    }
  });
}
