// Project identity normalization.
//
// AMH currently carries three different notions of "project":
//   1. the registry id in projects/projects.jsonl (lifeos, aion, ...)
//   2. a project root directory (used by <root>/.amh/skills.json)
//   3. free-form labels written into memory/task/capture records
//
// This module resolves (1) and (2) from any input and normalizes (3) toward the
// registry id, so downstream data does not invent a fourth spelling of the same
// project. Nothing here mutates project data; callers decide when to persist.

import fs from "node:fs";
import path from "node:path";
import { readProjects } from "./entity-repo.js";

// Labels that are session scaffolding rather than project identity. Keeping
// them out of project columns is what prevents recall from filling up with
// "new-chat-2" or a pasted URL.
const NOISE_EXACT = new Set([
  "c",
  "m",
  "dev",
  "content",
  "workspace",
  "tmp",
  "temp",
  "home",
  "users",
  "desktop",
  "documents",
  "downloads",
  "library"
]);

const NOISE_PATTERNS = [
  /^new-chat(?:-\d+)?$/i,
  /^https?[-_:]/i,
  /^www\./i,
  /^\d{4}-\d{2}-\d{2}/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i,
  /^\d+$/,
  /^[a-z]$/i,
  /^session-\d{4,}$/i
];

/**
 * Canonical slug for an arbitrary project label. Mirrors the memory layer's
 * normalizeMemoryProject (lowercase + spaces to dashes) but also trims path
 * separators so a project root with a trailing slash does not become a label.
 */
export function slugifyProjectLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function isNoiseProjectLabel(value) {
  const label = String(value ?? "").trim();
  if (!label) return true;
  if (NOISE_EXACT.has(label.toLowerCase())) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(label));
}

function localPathFromResources(resources) {
  if (!resources || typeof resources !== "object") return [];
  const values = [resources.path, resources.repo, resources.root].filter((item) => typeof item === "string" && item.trim());
  return values
    .map((item) => item.trim())
    .filter((item) => item.startsWith("/") || item.startsWith("~/"))
    .map((item) => path.resolve(item.replace(/^~\//, `${process.env.HOME || ""}/`)));
}

/**
 * Build the lookup index once per command so scanning thousands of transcript
 * turns does not re-read the project registry for every record.
 */
export function loadProjectIndex(memoryDir) {
  const projects = readProjects(memoryDir);
  const byName = new Map();
  const paths = [];

  for (const project of projects) {
    byName.set(String(project.id).toLowerCase(), project.id);
    for (const alias of project.aliases || []) {
      const key = String(alias || "").trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, project.id);
    }
    for (const root of localPathFromResources(project.resources)) {
      paths.push({ root, id: project.id });
    }
  }

  // Longest root wins so /dev/aion/AionWebsite resolves to aion before /dev/aion
  // is considered a prefix of an unrelated sibling.
  paths.sort((a, b) => b.root.length - a.root.length);
  return { projects, byName, paths };
}

function rootForProject(index, id) {
  return index.paths.find((item) => item.id === id)?.root || "";
}

function matchPath(index, candidate) {
  return index.paths.find((item) => candidate === item.root || candidate.startsWith(`${item.root}${path.sep}`)) || null;
}

/**
 * Resolve an id, alias, or path to a registered project.
 * Returns null when nothing in the registry matches.
 */
export function resolveProject(memoryDir, input, index = null) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const idx = index || loadProjectIndex(memoryDir);

  const looksLikePath = raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../") || raw.startsWith("~/");
  if (looksLikePath) {
    const candidate = path.resolve(raw.replace(/^~\//, `${process.env.HOME || ""}/`));
    const hit = matchPath(idx, candidate);
    if (hit) return { id: hit.id, match: "path", root: hit.root, input: raw };
  }

  const direct = idx.byName.get(raw.toLowerCase());
  if (direct) return { id: direct, match: "name", root: rootForProject(idx, direct), input: raw };

  const base = path.basename(raw.replace(/[\\/]+$/, ""));
  if (base && base !== raw) {
    const byBase = idx.byName.get(base.toLowerCase());
    if (byBase) return { id: byBase, match: "basename", root: rootForProject(idx, byBase), input: raw };
  }

  return null;
}

/**
 * Resolve a project root directory for skill manifests.
 * Registered paths win; otherwise any existing directory is accepted so
 * ad-hoc projects keep working exactly as before.
 */
export function resolveProjectRoot(memoryDir, input, index = null) {
  const hit = resolveProject(memoryDir, input, index);
  if (hit?.root) return hit.root;
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const candidate = path.resolve(raw.replace(/^~\//, `${process.env.HOME || ""}/`));
  return fs.existsSync(candidate) ? candidate : "";
}

/**
 * Normalize a free-form project label for data records.
 *
 * - registered id / alias / path -> canonical registry id
 * - unregistered but meaningful label -> lowercase slug
 * - scaffolding noise -> "" (callers should store an empty project)
 */
export function normalizeProjectLabel(memoryDir, input, index = null) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const hit = resolveProject(memoryDir, raw, index);
  if (hit) return hit.id;

  // Noise is checked against the original value first so URLs and session
  // scaffolding are filtered even when their basename looks meaningful.
  if (isNoiseProjectLabel(slugifyProjectLabel(raw))) return "";

  // An unregistered path becomes a project label from its basename, not the
  // full flattened path ("/tmp/foo" -> "foo", never "tmp-foo").
  const base = pathLikeBase(raw);
  const slug = slugifyProjectLabel(base || raw);
  if (!slug || isNoiseProjectLabel(slug)) return "";
  return slug;
}

function pathLikeBase(value) {
  if (!/[\\/]/.test(value)) return "";
  return value.replace(/[\\/]+$/, "").split(/[\\/]+/).pop() || "";
}
