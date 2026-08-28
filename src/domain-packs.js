import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getPackTrustStatus } from "./external-integrations.js";
import { appendJsonl } from "./event-writer.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function loadPackManifest(source) {
  const sourcePath = path.resolve(String(source || "."));
  const manifestPath = isFile(sourcePath) ? sourcePath : path.join(sourcePath, "amh-pack.json");
  if (!isFile(manifestPath)) throw new Error(`Pack manifest not found: ${manifestPath}`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid pack manifest ${manifestPath}: ${error.message}`);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`Invalid pack manifest ${manifestPath}: expected a JSON object`);
  }
  return { manifest, root: path.dirname(manifestPath), manifestPath };
}

export function validatePack(root, manifest = {}) {
  const errors = [];
  const sourceRoot = path.resolve(String(root || "."));
  const packRoot = path.resolve(String(manifest.root || sourceRoot));
  const normalized = { ...manifest, root: packRoot };
  const paths = {};

  if (!ID_PATTERN.test(String(manifest.id || ""))) errors.push("id must contain 2-64 lowercase letters, numbers, dots, underscores, or hyphens");
  if (manifest.type !== undefined && manifest.type !== "domain-pack") errors.push("type must be domain-pack");
  if (manifest.source !== undefined && manifest.source !== "external") errors.push("source must be external");
  if (!isDirectory(packRoot)) errors.push("pack root does not exist");
  if (manifest.entry !== undefined && (!manifest.entry || typeof manifest.entry !== "object" || Array.isArray(manifest.entry))) {
    errors.push("entry must be an object of relative paths");
  }

  const rootReal = realPath(packRoot);
  for (const [kind, relative] of Object.entries(manifest.entry || {})) {
    if (typeof relative !== "string" || !relative.trim()) {
      errors.push(`${kind} entry must be a non-empty relative path`);
      continue;
    }
    const resolved = path.resolve(packRoot, relative);
    if (!isContained(packRoot, resolved)) {
      errors.push(`${kind} entry resolves outside pack root`);
      continue;
    }
    paths[kind] = resolved;
    if (!fs.existsSync(resolved)) {
      errors.push(`${kind} entry does not exist: ${relative}`);
      continue;
    }
    const resolvedReal = realPath(resolved);
    if (rootReal && resolvedReal && !isContained(rootReal, resolvedReal)) errors.push(`${kind} entry resolves outside pack root`);
  }

  const trust = getPackTrustStatus({
    payload: manifest.trust?.payload || JSON.stringify({ id: manifest.id, version: manifest.version, entry: manifest.entry || {} }),
    signature: manifest.trust?.signature || manifest.signature || "",
    publicKey: manifest.trust?.publicKey || manifest.publicKey || "",
    required: Boolean(manifest.trust?.required)
  });
  if (trust.required && !trust.verified) errors.push(`pack signature ${trust.status}`);
  return { valid: errors.length === 0, errors, trust, paths, manifest: normalized };
}

export function addPack(memoryDir, source) {
  const loaded = typeof source === "string" ? loadPackManifest(source) : { manifest: source || {}, root: source?.root || memoryDir, manifestPath: "" };
  const validation = validatePack(loaded.root, loaded.manifest);
  if (!validation.valid) throw new Error(`Invalid domain pack: ${validation.errors.join("; ")}`);
  const record = {
    ...validation.manifest,
    id: validation.manifest.id,
    name: validation.manifest.name || validation.manifest.id,
    version: validation.manifest.version || "0.0.0",
    type: validation.manifest.type || "domain-pack",
    source: validation.manifest.source || "external",
    paths: validation.paths,
    manifestPath: loaded.manifestPath || undefined,
    permissions: validation.manifest.permissions || {},
    trust: { ...(validation.manifest.trust || {}), ...validation.trust },
    enabled: false,
    valid: true,
    validationErrors: [],
    addedAt: new Date().toISOString(),
    eventId: crypto.randomUUID(),
    manifest: validation.manifest
  };
  appendRegistryEvent(memoryDir, { action: "add", pack: stripUndefined(record) });
  return record;
}

export function discoverPacks(memoryDir, explicitRoots = []) {
  const roots = [...(Array.isArray(explicitRoots) ? explicitRoots : [explicitRoots]).filter(Boolean)];
  const dataPacksRoot = path.join(memoryDir, "packs");
  if (isDirectory(dataPacksRoot)) {
    for (const entry of fs.readdirSync(dataPacksRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(path.join(dataPacksRoot, entry.name));
    }
  }
  const seen = new Set();
  return roots.map((candidate) => {
    const root = path.resolve(String(candidate));
    if (seen.has(root)) return null;
    seen.add(root);
    try {
      const loaded = loadPackManifest(root);
      const validation = validatePack(loaded.root, loaded.manifest);
      return { root: loaded.root, manifestPath: loaded.manifestPath, ...validation };
    } catch (error) {
      return { root, manifestPath: path.join(root, "amh-pack.json"), valid: false, errors: [error.message], manifest: { root } };
    }
  }).filter(Boolean);
}

export function listPacks(memoryDir) {
  const state = new Map();
  for (const event of readRegistry(memoryDir)) {
    if (!event.pack?.id) continue;
    const current = state.get(event.pack.id) || {};
    state.set(event.pack.id, { ...current, ...event.pack, ...(event.action === "enable" ? { enabled: true } : {}), ...(event.action === "disable" ? { enabled: false } : {}) });
  }
  return [...state.values()];
}

export function getEnabledPacks(memoryDir) {
  return listPacks(memoryDir).flatMap((pack) => {
    if (!pack.enabled) return [];
    const validation = validatePack(pack.root, pack.manifest || pack);
    if (!validation.valid) return [];
    return [{ ...pack, valid: true, validationErrors: [], paths: validation.paths, trust: { ...(pack.trust || {}), ...validation.trust } }];
  });
}

export function setPackEnabled(memoryDir, id, enabled) {
  const pack = findPack(memoryDir, id);
  const validation = validatePack(pack.root, pack.manifest || pack);
  if (enabled && !validation.valid) throw new Error(`Cannot enable invalid pack: ${validation.errors.join("; ")}`);
  appendRegistryEvent(memoryDir, { action: enabled ? "enable" : "disable", pack: { id: pack.id, enabled: Boolean(enabled), valid: validation.valid, validationErrors: validation.errors, paths: validation.paths, trust: validation.trust } });
  return { ...pack, enabled: Boolean(enabled), valid: validation.valid, validationErrors: validation.errors, paths: validation.paths, trust: validation.trust };
}

export function validateRegisteredPack(memoryDir, id) {
  const pack = findPack(memoryDir, id);
  const validation = validatePack(pack.root, pack.manifest || pack);
  appendRegistryEvent(memoryDir, { action: "validate", pack: { id: pack.id, valid: validation.valid, validationErrors: validation.errors, paths: validation.paths, trust: validation.trust } });
  return { ...pack, valid: validation.valid, validationErrors: validation.errors, paths: validation.paths, trust: validation.trust };
}

function findPack(memoryDir, id) {
  const packs = listPacks(memoryDir);
  const exact = packs.find((item) => item.id === id);
  if (exact) return exact;
  const matches = packs.filter((item) => item.id.startsWith(String(id || "")));
  if (matches.length > 1) throw new Error(`Domain pack id is ambiguous: ${id}`);
  if (!matches[0]) throw new Error(`Domain pack not found: ${id}`);
  return matches[0];
}

function registryFile(memoryDir) { return path.join(memoryDir, "packs", "registry.jsonl"); }
function readRegistry(memoryDir) {
  const file = registryFile(memoryDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
function appendRegistryEvent(memoryDir, event) {
  const file = registryFile(memoryDir);
  appendJsonl(file, { id: crypto.randomUUID(), ts: new Date().toISOString(), ...event });
}
function isFile(target) { try { return fs.statSync(target).isFile(); } catch { return false; } }
function isDirectory(target) { try { return fs.statSync(target).isDirectory(); } catch { return false; } }
function realPath(target) { try { return fs.realpathSync(target); } catch { return ""; } }
function isContained(root, target) { return target === root || target.startsWith(`${root}${path.sep}`); }
function stripUndefined(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
