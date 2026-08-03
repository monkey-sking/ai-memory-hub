import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function validatePack(root, manifest = {}) {
  const errors = [];
  const packRoot = path.resolve(manifest.root || root || ".");
  if (!ID_PATTERN.test(String(manifest.id || ""))) errors.push("id must contain 2-64 lowercase letters, numbers, dots, underscores, or hyphens");
  if (!fs.existsSync(packRoot) || !fs.statSync(packRoot).isDirectory()) errors.push("pack root does not exist");
  for (const [kind, relative] of Object.entries(manifest.entry || {})) {
    if (!relative) continue;
    const resolved = path.resolve(packRoot, String(relative));
    if (resolved !== packRoot && !resolved.startsWith(`${packRoot}${path.sep}`)) errors.push(`${kind} entry resolves outside pack root`);
    else if (!fs.existsSync(resolved)) errors.push(`${kind} entry does not exist: ${relative}`);
  }
  return { valid: errors.length === 0, errors, manifest: { ...manifest, root: packRoot } };
}

export function addPack(memoryDir, manifest) {
  const validation = validatePack(manifest.root || memoryDir, manifest);
  if (!validation.valid) throw new Error(`Invalid domain pack: ${validation.errors.join("; ")}`);
  const record = { id: manifest.id, name: manifest.name || manifest.id, version: manifest.version || "0.0.0", root: validation.manifest.root, entry: manifest.entry || {}, permissions: manifest.permissions || {}, enabled: false, valid: true, addedAt: new Date().toISOString(), eventId: crypto.randomUUID() };
  appendRegistryEvent(memoryDir, { action: "add", pack: record });
  return record;
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

export function setPackEnabled(memoryDir, id, enabled) {
  const pack = listPacks(memoryDir).find((item) => item.id === id || item.id.startsWith(id));
  if (!pack) throw new Error(`Domain pack not found: ${id}`);
  const validation = validatePack(pack.root, pack);
  if (enabled && !validation.valid) throw new Error(`Cannot enable invalid pack: ${validation.errors.join("; ")}`);
  appendRegistryEvent(memoryDir, { action: enabled ? "enable" : "disable", pack: { id: pack.id, enabled: Boolean(enabled), valid: validation.valid, validationErrors: validation.errors } });
  return { ...pack, enabled: Boolean(enabled), valid: validation.valid, validationErrors: validation.errors };
}

export function validateRegisteredPack(memoryDir, id) {
  const pack = listPacks(memoryDir).find((item) => item.id === id || item.id.startsWith(id));
  if (!pack) throw new Error(`Domain pack not found: ${id}`);
  const validation = validatePack(pack.root, pack);
  appendRegistryEvent(memoryDir, { action: "validate", pack: { id: pack.id, valid: validation.valid, validationErrors: validation.errors } });
  return { ...pack, valid: validation.valid, validationErrors: validation.errors };
}

function registryFile(memoryDir) { return path.join(memoryDir, "packs", "registry.jsonl"); }
function readRegistry(memoryDir) { const file = registryFile(memoryDir); if (!fs.existsSync(file)) return []; return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
function appendRegistryEvent(memoryDir, event) { const file = registryFile(memoryDir); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify({ id: crypto.randomUUID(), ts: new Date().toISOString(), ...event }) + "\n", "utf8"); }

