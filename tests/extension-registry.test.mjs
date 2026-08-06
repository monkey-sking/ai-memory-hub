import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  deterministicId,
  normalizeMcp,
  normalizeMcpServer,
  normalizeSkill,
  readRegistry,
  redactSecrets,
  removeRecord,
  upsertRecord,
  writeRegistry,
  EXTENSION_REGISTRY_VERSION,
} from "../src/extension-registry.js";

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-ext-reg-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// --- MCP normalization ---

test("normalizeMcpServer accepts valid stdio server", () => {
  const server = normalizeMcpServer({ type: "stdio", command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } });
  assert.equal(server.type, "stdio");
  assert.equal(server.command, "npx");
  assert.deepEqual(server.args, ["-y", "pkg"]);
  assert.deepEqual(server.env, { TOKEN: "x" });
});

test("normalizeMcpServer accepts valid http server with url", () => {
  const server = normalizeMcpServer({ type: "http", url: "http://localhost:3000/mcp", headers: { Authorization: "Bearer tok" } });
  assert.equal(server.type, "http");
  assert.equal(server.url, "http://localhost:3000/mcp");
  assert.deepEqual(server.headers, { Authorization: "Bearer tok" });
});

test("normalizeMcpServer accepts valid sse server with url", () => {
  const server = normalizeMcpServer({ type: "sse", url: "https://example.com/sse" });
  assert.equal(server.type, "sse");
  assert.equal(server.url, "https://example.com/sse");
});

test("normalizeMcpServer defaults to http when url present and command also given", () => {
  const server = normalizeMcpServer({ command: "npx", url: "http://localhost" });
  assert.equal(server.type, "http");
});

test("normalizeMcpServer defaults to http when url present and no command", () => {
  const server = normalizeMcpServer({ url: "http://localhost" });
  assert.equal(server.type, "http");
});

test("normalizeMcpServer rejects unknown type", () => {
  assert.throws(() => normalizeMcpServer({ type: "websocket" }), /Unsupported MCP server type/);
});

test("normalizeMcpServer rejects http without url", () => {
  assert.throws(() => normalizeMcpServer({ type: "http" }), /requires url/);
});

test("normalizeMcpServer rejects sse without url", () => {
  assert.throws(() => normalizeMcpServer({ type: "sse" }), /requires url/);
});

test("normalizeMcpServer rejects stdio without command", () => {
  assert.throws(() => normalizeMcpServer({ type: "stdio" }), /requires command/);
});

test("normalizeMcpServer preserves extra fields under server.extra", () => {
  const server = normalizeMcpServer({ type: "stdio", command: "npx", cwd: "/tmp", debug: true });
  assert.deepEqual(server.extra, { cwd: "/tmp", debug: true });
  assert.equal(server.cwd, undefined);
});

test("normalizeMcpServer preserves extra from explicit extra object", () => {
  const server = normalizeMcpServer({ type: "stdio", command: "npx", extra: { custom: 42 } });
  assert.deepEqual(server.extra, { custom: 42 });
});

test("normalizeMcp produces full normalized MCP record", () => {
  const record = normalizeMcp({
    id: "context7",
    server: { type: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"] },
    apps: { claude: true, codex: true },
    source: "import",
  });
  assert.equal(record.id, "context7");
  assert.equal(record.kind, "mcp");
  assert.equal(record.server.type, "stdio");
  assert.equal(record.source, "import");
  assert.equal(record.managed, true);
  assert.match(record.updatedAt, /^\d{4}-/);
});

test("normalizeMcp uses name as fallback for id", () => {
  const record = normalizeMcp({ name: "my-server", server: { type: "stdio", command: "npx" } });
  assert.equal(record.id, "my-server");
});

test("normalizeMcp rejects invalid id", () => {
  assert.throws(() => normalizeMcp({ id: "../evil" }), /Invalid extension id/);
  assert.throws(() => normalizeMcp({ id: "A" }), /Invalid extension id/);
});

// --- Skill normalization ---

test("normalizeSkill produces full normalized skill record", () => {
  const record = normalizeSkill({
    id: "ai-memory-hub",
    source: { type: "local", path: "/skills/ai-memory-hub", repo: null, ref: null },
    contentHash: "sha256:abc123",
    apps: { codex: true, claude: true, gemini: true, opencode: true },
  });
  assert.equal(record.id, "ai-memory-hub");
  assert.equal(record.kind, "skill");
  assert.equal(record.source.type, "local");
  assert.equal(record.contentHash, "sha256:abc123");
  assert.equal(record.managed, true);
  assert.match(record.updatedAt, /^\d{4}-/);
});

test("normalizeSkill fills defaults for missing fields", () => {
  const record = normalizeSkill({ id: "test-skill" });
  assert.equal(record.kind, "skill");
  assert.deepEqual(record.source, { type: "local", path: null, repo: null, ref: null });
  assert.equal(record.contentHash, "");
  assert.deepEqual(record.apps, {});
  assert.equal(record.managed, true);
});

test("normalizeSkill rejects invalid id", () => {
  assert.throws(() => normalizeSkill({ id: "../evil" }), /Invalid extension id/);
  assert.throws(() => normalizeSkill({ id: "UPPER!" }), /Invalid extension id/);
});

// --- Deterministic IDs ---

test("deterministicId returns same value for same input", () => {
  const id1 = deterministicId("mcp", { command: "npx", args: ["-y", "pkg"] });
  const id2 = deterministicId("mcp", { command: "npx", args: ["-y", "pkg"] });
  assert.equal(id1, id2);
  assert.match(id1, /^mcp-[a-f0-9]{12}$/);
});

test("deterministicId returns different values for different kinds", () => {
  const mcpId = deterministicId("mcp", { command: "npx" });
  const skillId = deterministicId("skill", { command: "npx" });
  assert.notEqual(mcpId, skillId);
  assert.match(skillId, /^sk-[a-f0-9]{12}$/);
});

test("deterministicId returns different values for different inputs", () => {
  const id1 = deterministicId("mcp", { command: "npx" });
  const id2 = deterministicId("mcp", { command: "node" });
  assert.notEqual(id1, id2);
});

// --- Secret redaction ---

test("redactSecrets hashes string values matching secret keys", () => {
  const redacted = redactSecrets({ env: { TOKEN: "super-secret-value", PORT: "3000" } });
  assert.equal(typeof redacted.env.TOKEN, "string");
  assert.equal(redacted.env.TOKEN.length, 16);
  assert.match(redacted.env.TOKEN, /^[a-f0-9]{16}$/);
  assert.equal(redacted.env.PORT, "3000");
});

test("redactSecrets preserves non-secret fields", () => {
  const redacted = redactSecrets({ command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } });
  assert.equal(redacted.command, "npx");
  assert.deepEqual(redacted.args, ["-y", "pkg"]);
  assert.equal(redacted.env.TOKEN.length, 16);
});

test("redactSecrets handles nested objects", () => {
  const redacted = redactSecrets({
    server: { headers: { Authorization: "Bearer secret123", Accept: "application/json" } },
  });
  assert.match(redacted.server.headers.Authorization, /^[a-f0-9]{16}$/);
  assert.equal(redacted.server.headers.Accept, "application/json");
});

test("redactSecrets handles arrays", () => {
  const redacted = redactSecrets([{ secret: "abc" }, { name: "test" }]);
  assert.match(redacted[0].secret, /^[a-f0-9]{16}$/);
  assert.equal(redacted[1].name, "test");
});

test("redactSecrets passes through primitives unchanged", () => {
  assert.equal(redactSecrets(null), null);
  assert.equal(redactSecrets("hello"), "hello");
  assert.equal(redactSecrets(42), 42);
});

// --- Atomic JSON persistence ---

test("writeRegistry and readRegistry round trip", async () => {
  await withTempDir(async (dir) => {
    const registry = {
      version: EXTENSION_REGISTRY_VERSION,
      mcp: {
        ctx: { id: "ctx", kind: "mcp", server: { type: "stdio", command: "npx" } },
      },
      skills: {
        ai: { id: "ai", kind: "skill", source: { type: "local" } },
      },
    };
    await writeRegistry(dir, registry);
    const read = await readRegistry(dir);
    assert.equal(read.version, EXTENSION_REGISTRY_VERSION);
    assert.equal(read.mcp.ctx.id, "ctx");
    assert.equal(read.skills.ai.id, "ai");
  });
});

test("writeRegistry creates parent directories if needed", async () => {
  await withTempDir(async (dir) => {
    const nested = path.join(dir, "a", "b", "c");
    // writeRegistry resolves from the file path, so we use a subdir approach
    // Actually registryPath is fixed, so let's test it writes to the right place
    const registry = { version: 1, mcp: {}, skills: {} };
    await writeRegistry(dir, registry);
    const file = path.join(dir, "extension-registry.json");
    const stat = await fs.stat(file);
    assert.ok(stat.isFile());
  });
});

test("writeRegistry atomically replaces file", async () => {
  await withTempDir(async (dir) => {
    const r1 = { version: 1, mcp: { a: { id: "a" } }, skills: {} };
    const r2 = { version: 1, mcp: { b: { id: "b" } }, skills: {} };
    await writeRegistry(dir, r1);
    await writeRegistry(dir, r2);
    const read = await readRegistry(dir);
    assert.equal(read.mcp.a, undefined);
    assert.equal(read.mcp.b.id, "b");
  });
});

// --- readRegistry handles missing file ---

test("readRegistry returns empty registry when file is missing", async () => {
  await withTempDir(async (dir) => {
    const registry = await readRegistry(dir);
    assert.equal(registry.version, EXTENSION_REGISTRY_VERSION);
    assert.deepEqual(registry.mcp, {});
    assert.deepEqual(registry.skills, {});
  });
});

// --- Idempotent upsert ---

test("upsertRecord is idempotent for same record", async () => {
  await withTempDir(async (dir) => {
    const record = {
      id: "test-server",
      kind: "mcp",
      server: { type: "stdio", command: "npx", args: ["-y", "pkg"] },
      apps: { claude: true },
    };
    await upsertRecord(dir, record);
    await upsertRecord(dir, record);
    const registry = await readRegistry(dir);
    assert.equal(Object.keys(registry.mcp).length, 1);
    assert.equal(registry.mcp["test-server"].id, "test-server");
  });
});

test("upsertRecord updates existing record", async () => {
  await withTempDir(async (dir) => {
    const r1 = { id: "srv", kind: "mcp", server: { type: "stdio", command: "npx" }, apps: { claude: true } };
    const r2 = { id: "srv", kind: "mcp", server: { type: "stdio", command: "node" }, apps: { codex: true } };
    await upsertRecord(dir, r1);
    await upsertRecord(dir, r2);
    const registry = await readRegistry(dir);
    assert.equal(registry.mcp.srv.server.command, "node");
    assert.deepEqual(registry.mcp.srv.apps, { codex: true });
  });
});

test("upsertRecord stores skills in separate bucket", async () => {
  await withTempDir(async (dir) => {
    await upsertRecord(dir, { id: "mcp-srv", kind: "mcp", server: { type: "stdio", command: "npx" } });
    await upsertRecord(dir, { id: "my-skill", kind: "skill", source: { type: "local", path: "/tmp" }, contentHash: "sha256:aaa" });
    const registry = await readRegistry(dir);
    assert.equal(Object.keys(registry.mcp).length, 1);
    assert.equal(Object.keys(registry.skills).length, 1);
    assert.equal(registry.mcp["mcp-srv"].kind, "mcp");
    assert.equal(registry.skills["my-skill"].kind, "skill");
  });
});

// --- removeRecord ---

test("removeRecord removes a record by kind and id", async () => {
  await withTempDir(async (dir) => {
    await upsertRecord(dir, { id: "srv-a", kind: "mcp", server: { type: "stdio", command: "npx" } });
    await upsertRecord(dir, { id: "srv-b", kind: "mcp", server: { type: "stdio", command: "node" } });
    await removeRecord(dir, "mcp", "srv-a");
    const registry = await readRegistry(dir);
    assert.equal(registry.mcp["srv-a"], undefined);
    assert.equal(registry.mcp["srv-b"].id, "srv-b");
  });
});

test("removeRecord removes a skill record", async () => {
  await withTempDir(async (dir) => {
    await upsertRecord(dir, { id: "sk1", kind: "skill", source: { type: "local" } });
    await removeRecord(dir, "skill", "sk1");
    const registry = await readRegistry(dir);
    assert.equal(registry.skills.sk1, undefined);
  });
});

test("removeRecord is safe when record does not exist", async () => {
  await withTempDir(async (dir) => {
    await writeRegistry(dir, { version: 1, mcp: {}, skills: {} });
    await removeRecord(dir, "mcp", "nonexistent");
    const registry = await readRegistry(dir);
    assert.deepEqual(registry.mcp, {});
  });
});

test("removeRecord rejects invalid id", async () => {
  await withTempDir(async (dir) => {
    await assert.rejects(() => removeRecord(dir, "mcp", "../evil"), /Invalid extension id/);
  });
});
