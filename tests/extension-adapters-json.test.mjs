import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAdapter } from "../src/extension-adapters.js";

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-ext-adapter-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

test("Claude adapter: read/write round trip for mcpServers", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    const mcp = {
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        env: {},
      },
    };
    await writeJson(configPath, { mcpServers: mcp });

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const result = await adapter.readMcp();

    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].id, "context7");
    assert.equal(result.records[0].server.type, "stdio");
    assert.equal(result.records[0].server.command, "npx");
    assert.deepEqual(result.records[0].server.args, ["-y", "@upstash/context7-mcp"]);
    assert.deepEqual(result.records[0].server.env, {});
    assert.equal(result.records[0].apps.claude, true);

    const record = { ...result.records[0], managed: true };
    const writeResult = await adapter.writeMcp([record], { apply: true });
    assert.equal(writeResult.applied, true);

    const adapter2 = createAdapter({ app: "claude", homeDir: home });
    const result2 = await adapter2.readMcp();
    assert.equal(result2.records.length, 1);
    assert.equal(result2.records[0].id, "context7");
    assert.equal(result2.records[0].server.command, "npx");
  });
});

test("Gemini adapter: read/write round trip for mcpServers", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".gemini", "settings.json");
    const mcp = {
      "my-server": {
        command: "node",
        args: ["server.js"],
        env: { PORT: "3000" },
      },
    };
    await writeJson(configPath, { mcpServers: mcp });

    const adapter = createAdapter({ app: "gemini", homeDir: home });
    const result = await adapter.readMcp();

    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].id, "my-server");
    assert.equal(result.records[0].server.type, "stdio");
    assert.equal(result.records[0].server.command, "node");
    assert.deepEqual(result.records[0].server.args, ["server.js"]);
    assert.deepEqual(result.records[0].server.env, { PORT: "3000" });

    const record = { ...result.records[0], managed: true };
    await adapter.writeMcp([record], { apply: true });

    const adapter2 = createAdapter({ app: "gemini", homeDir: home });
    const result2 = await adapter2.readMcp();
    assert.equal(result2.records.length, 1);
    assert.equal(result2.records[0].id, "my-server");
    assert.deepEqual(result2.records[0].server.env, { PORT: "3000" });
  });
});

test("OpenCode adapter: read/write round trip for mcp", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".config", "opencode", "opencode.json");
    const mcp = {
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        env: {},
      },
      "remote-sse": {
        url: "http://localhost:8080/sse",
        type: "sse",
      },
    };
    await writeJson(configPath, { mcp });

    const adapter = createAdapter({ app: "opencode", homeDir: home });
    const result = await adapter.readMcp();

    assert.equal(result.records.length, 2);
    const stdio = result.records.find((r) => r.id === "context7");
    const sse = result.records.find((r) => r.id === "remote-sse");
    assert.equal(stdio.server.type, "stdio");
    assert.equal(sse.server.type, "sse");
    assert.equal(sse.server.url, "http://localhost:8080/sse");

    const managed = result.records.map((r) => ({ ...r, managed: true }));
    await adapter.writeMcp(managed, { apply: true });

    const adapter2 = createAdapter({ app: "opencode", homeDir: home });
    const result2 = await adapter2.readMcp();
    assert.equal(result2.records.length, 2);
  });
});

test("Missing files: adapter returns empty array, no error", async () => {
  await withTempDir(async (home) => {
    for (const app of ["claude", "gemini", "opencode"]) {
      const adapter = createAdapter({ app, homeDir: home });
      const result = await adapter.readMcp();
      assert.equal(result.records.length, 0);
      assert.equal(result.diagnostics.length, 0);
    }
  });
});

test("Malformed entries: adapter returns diagnostics with warnings", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    await writeJson(configPath, {
      mcpServers: {
        good: { command: "npx", args: ["-y", "pkg"] },
        "no-cmd": { args: ["-y", "pkg"] },
        "bad-type": { command: "npx", args: [], type: "websocket" },
      },
    });

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const result = await adapter.readMcp();

    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].id, "good");
    assert.ok(result.diagnostics.length > 0);
    const warnings = result.diagnostics.filter((d) => d.level === "warn");
    assert.ok(warnings.length >= 1);
  });
});

test("Unrelated keys: preserved after write round trip", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    const original = {
      theme: "dark",
      fontSize: 14,
      mcpServers: {
        context7: { command: "npx", args: ["-y", "pkg"], env: {} },
      },
    };
    await writeJson(configPath, original);

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const read = await adapter.readMcp();
    const record = { ...read.records[0], managed: true };
    await adapter.writeMcp([record], { apply: true });

    const written = JSON.parse(await fs.readFile(configPath, "utf8"));
    assert.equal(written.theme, "dark");
    assert.equal(written.fontSize, 14);
    assert.equal(written.mcpServers.context7.command, "npx");
  });
});

test("Unmanaged entries: not touched by write (only managed records written)", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    await writeJson(configPath, {
      mcpServers: {
        existing: { command: "node", args: ["a.js"], env: {} },
        "user-added": { command: "python", args: ["b.py"], env: {} },
      },
    });

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const read = await adapter.readMcp();

    const managedRecord = {
      ...read.records.find((r) => r.id === "existing"),
      managed: true,
    };
    await adapter.writeMcp([managedRecord], { apply: true });

    const written = JSON.parse(await fs.readFile(configPath, "utf8"));
    assert.equal(written.mcpServers.existing.command, "node");
    assert.equal(written.mcpServers["user-added"].command, "python");
  });
});

test("Atomic write: temp file + rename pattern", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    await writeJson(configPath, {
      mcpServers: { a: { command: "npx", args: [], env: {} } },
    });

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const read = await adapter.readMcp();
    const record = { ...read.records[0], managed: true };

    const beforeContent = await fs.readFile(configPath, "utf8");
    assert.ok(beforeContent.includes('"a"'));

    const result = await adapter.writeMcp([record], { apply: true });
    assert.equal(result.applied, true);

    const afterContent = await fs.readFile(configPath, "utf8");
    assert.ok(afterContent.includes('"a"'));
    assert.ok(!afterContent.includes(".tmp"));
  });
});

test("Backup creation before overwrite", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    await writeJson(configPath, {
      mcpServers: { x: { command: "ls", args: [], env: {} } },
    });

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const read = await adapter.readMcp();
    const record = { ...read.records[0], managed: true };
    const result = await adapter.writeMcp([record], { apply: true });

    assert.ok(result.backup);
    const backupExists = await fs
      .stat(result.backup)
      .then(() => true)
      .catch(() => false);
    assert.ok(backupExists, "Backup file should exist");

    const backupContent = await fs.readFile(result.backup, "utf8");
    const parsed = JSON.parse(backupContent);
    assert.ok(parsed.mcpServers.x);
  });
});

test("getMcpPath and getSkillPath return correct paths", async () => {
  await withTempDir(async (home) => {
    const claude = createAdapter({ app: "claude", homeDir: home });
    assert.equal(claude.getMcpPath(), path.join(home, ".claude.json"));
    assert.equal(claude.getSkillPath(), path.join(home, ".claude", "skills"));

    const gemini = createAdapter({ app: "gemini", homeDir: home });
    assert.equal(
      gemini.getMcpPath(),
      path.join(home, ".gemini", "settings.json")
    );
    assert.equal(gemini.getSkillPath(), path.join(home, ".gemini", "skills"));

    const opencode = createAdapter({ app: "opencode", homeDir: home });
    assert.equal(
      opencode.getMcpPath(),
      path.join(home, ".config", "opencode", "opencode.json")
    );
    assert.equal(
      opencode.getSkillPath(),
      path.join(home, ".config", "opencode", "skills")
    );
  });
});

test("getDiagnostics returns warnings from last operation", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    await writeJson(configPath, {
      mcpServers: {
        broken: { type: "websocket", url: "ws://x" },
      },
    });

    const adapter = createAdapter({ app: "claude", homeDir: home });
    await adapter.readMcp();
    const diags = adapter.getDiagnostics();
    assert.ok(diags.length > 0);
    assert.equal(diags[0].level, "warn");
  });
});

test("HTTP/SSE server entries normalize correctly", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    await writeJson(configPath, {
      mcpServers: {
        "http-srv": { url: "http://localhost:9000/mcp", type: "http" },
        "sse-srv": { url: "http://localhost:9001/sse" },
      },
    });

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const result = await adapter.readMcp();

    const httpSrv = result.records.find((r) => r.id === "http-srv");
    const sseSrv = result.records.find((r) => r.id === "sse-srv");
    assert.equal(httpSrv.server.type, "http");
    assert.equal(httpSrv.server.url, "http://localhost:9000/mcp");
    assert.equal(sseSrv.server.type, "http");
    assert.equal(sseSrv.server.url, "http://localhost:9001/sse");
  });
});

test("Unsupported app throws", () => {
  assert.throws(() => createAdapter({ app: "vscode", homeDir: "/tmp" }), /Unsupported app/);
});

test("writeMcp preview mode does not modify file", async () => {
  await withTempDir(async (home) => {
    const configPath = path.join(home, ".claude.json");
    const original = {
      mcpServers: { a: { command: "ls", args: [], env: {} } },
    };
    await writeJson(configPath, original);

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const read = await adapter.readMcp();
    const record = { ...read.records[0], managed: true };
    const result = await adapter.writeMcp([record], { apply: false });

    assert.equal(result.applied, false);
    const after = JSON.parse(await fs.readFile(configPath, "utf8"));
    assert.deepEqual(after, original);
  });
});

test("readSkills returns empty for missing skill dir", async () => {
  await withTempDir(async (home) => {
    const adapter = createAdapter({ app: "claude", homeDir: home });
    const result = await adapter.readSkills();
    assert.equal(result.records.length, 0);
  });
});

test("readSkills discovers SKILL.md files", async () => {
  await withTempDir(async (home) => {
    const skillDir = path.join(home, ".claude", "skills", "my-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "# My Skill\n\n> A useful skill for testing\n\nSome content.\n",
      "utf8"
    );

    const adapter = createAdapter({ app: "claude", homeDir: home });
    const result = await adapter.readSkills();
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].id, "my-skill");
    assert.equal(result.records[0].title, "My Skill");
    assert.equal(result.records[0].description, "A useful skill for testing");
    assert.equal(result.records[0].kind, "skill");
  });
});
