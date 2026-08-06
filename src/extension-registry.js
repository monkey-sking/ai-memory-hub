import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const EXTENSION_REGISTRY_VERSION = 1;
const VALID_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SECRET_KEYS = /(?:env|header|token|secret|password|auth(?:orization)?)/i;

function now() {
  return new Date().toISOString();
}

function validateId(id, source) {
  const normalized = String(id || "").trim().toLowerCase();
  if (!VALID_ID.test(normalized)) {
    throw new Error(`Invalid extension id "${source}": must be 2-64 chars, lowercase alphanumeric with . _ -`);
  }
  return normalized;
}

export function normalizeMcpServer(input = {}) {
  const raw = { ...input };
  const type = raw.type || (raw.url ? "http" : "stdio");
  if (!["stdio", "http", "sse"].includes(type)) {
    throw new Error(`Unsupported MCP server type: ${type}`);
  }
  if ((type === "http" || type === "sse") && !raw.url) {
    throw new Error(`MCP ${type} server requires url`);
  }
  if (type === "stdio" && !raw.command) {
    throw new Error("MCP stdio server requires command");
  }
  const known = new Set(["type", "command", "args", "env", "url", "headers"]);
  const extra = { ...(raw.extra || {}) };
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key) && key !== "extra") extra[key] = value;
  }
  const server = { type };
  if (raw.command != null) server.command = String(raw.command);
  if (raw.args != null) server.args = raw.args.map(String);
  if (raw.env != null) server.env = { ...raw.env };
  if (raw.url != null) server.url = String(raw.url);
  if (raw.headers != null) server.headers = { ...raw.headers };
  if (Object.keys(extra).length > 0) server.extra = extra;
  return server;
}

export function normalizeMcp(input = {}) {
  const id = validateId(input.id || input.name, input.id || input.name);
  const server = normalizeMcpServer(input.server || input);
  return {
    id,
    kind: "mcp",
    server,
    apps: { ...(input.apps || {}) },
    managed: input.managed !== false,
    source: input.source || "manual",
    updatedAt: input.updatedAt || now(),
  };
}

export function normalizeSkill(input = {}) {
  const id = validateId(input.id, input.id);
  const source = input.source || { type: "local", path: null, repo: null, ref: null };
  const contentHash = input.contentHash || "";
  return {
    id,
    kind: "skill",
    source: { ...source },
    contentHash,
    apps: { ...(input.apps || {}) },
    managed: input.managed !== false,
    updatedAt: input.updatedAt || now(),
  };
}

export function deterministicId(kind, seed) {
  const hash = crypto.createHash("sha256").update(`${kind}:${JSON.stringify(seed)}`).digest("hex").slice(0, 12);
  const prefix = kind === "mcp" ? "mcp" : "sk";
  return `${prefix}-${hash}`;
}

export function redactSecrets(record) {
  if (Array.isArray(record)) return record.map(redactSecrets);
  if (!record || typeof record !== "object") return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (typeof value === "string") {
        if (SECRET_KEYS.test(key)) {
          return [key, crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)];
        }
        return [key, value];
      }
      if (typeof value === "object" && value !== null) {
        return [key, redactSecrets(value)];
      }
      return [key, value];
    }),
  );
}

export function registryPath(memoryDir) {
  return path.join(path.resolve(memoryDir), "extension-registry.json");
}

export async function readRegistry(memoryDir) {
  const file = registryPath(memoryDir);
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      return { version: EXTENSION_REGISTRY_VERSION, mcp: {}, skills: {} };
    }
    throw err;
  }
}

export async function writeRegistry(memoryDir, registry) {
  const file = registryPath(memoryDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(
    { version: EXTENSION_REGISTRY_VERSION, mcp: registry.mcp || {}, skills: registry.skills || {} },
    null,
    2,
  );
  await fs.writeFile(tmp, payload + "\n");
  await fs.rename(tmp, file);
  return { version: EXTENSION_REGISTRY_VERSION, mcp: registry.mcp || {}, skills: registry.skills || {} };
}

export async function upsertRecord(memoryDir, record) {
  const normalized = record.kind === "skill" ? normalizeSkill(record) : normalizeMcp(record);
  const registry = await readRegistry(memoryDir);
  const bucket = normalized.kind === "skill" ? "skills" : "mcp";
  registry[bucket] = registry[bucket] || {};
  registry[bucket][normalized.id] = { ...normalized, updatedAt: now() };
  await writeRegistry(memoryDir, registry);
  return registry[bucket][normalized.id];
}

export async function removeRecord(memoryDir, kind, id) {
  const normalizedId = validateId(id, id);
  const registry = await readRegistry(memoryDir);
  const bucket = kind === "skill" ? "skills" : "mcp";
  if (registry[bucket]) {
    delete registry[bucket][normalizedId];
  }
  await writeRegistry(memoryDir, registry);
  return registry;
}
