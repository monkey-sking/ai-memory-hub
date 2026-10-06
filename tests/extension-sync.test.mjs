import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  listExtensions,
  importExtensions,
  diffExtensions,
  syncExtensions,
  removeExtensions,
  statusExtensions,
} from "../src/extension-sync.js";
import { upsertRecord, readRegistry } from "../src/extension-registry.js";

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-ext-sync-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function withTempHome(fn) {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
  try {
    return await fn(homeDir);
  } finally {
    await fs.rm(homeDir, { recursive: true, force: true });
  }
}

test("listExtensions returns empty array for new registry", async () => {
  await withTempDir(async (memoryDir) => {
    const result = await listExtensions(memoryDir);
    assert.deepEqual(result, []);
  });
});

test("listExtensions returns MCP records", async () => {
  await withTempDir(async (memoryDir) => {
    await upsertRecord(memoryDir, {
      id: "test-server",
      kind: "mcp",
      server: { type: "stdio", command: "npx", args: ["-y", "test"] },
      managed: true,
    });
    const result = await listExtensions(memoryDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "test-server");
  });
});

test("importExtensions imports from client files", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      // Create Claude config file
      const claudeConfig = {
        mcpServers: {
          "test-claude": {
            type: "stdio",
            command: "npx",
            args: ["-y", "test-claude-server"],
          },
        },
      };
      await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude.json"),
        JSON.stringify(claudeConfig, null, 2)
      );

      const result = await importExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
      });
      assert.equal(result.imported.length, 1);
      assert.equal(result.imported[0].id, "test-claude");
      assert.equal(result.imported[0].apps.claude, true);
    });
  });
});

test("diffExtensions detects additions", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      // Add record to registry
      await upsertRecord(memoryDir, {
        id: "new-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "new-server"] },
        managed: true,
        apps: { claude: true },
      });

      // Create empty Claude config
      await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude.json"),
        JSON.stringify({ mcpServers: {} }, null, 2)
      );

      const result = await diffExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
      });
      assert.equal(result.changes.length, 1);
      assert.equal(result.changes[0].action, "add");
      assert.equal(result.changes[0].id, "new-server");
    });
  });
});

test("diffExtensions detects conflicts", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      // Add record to registry
      await upsertRecord(memoryDir, {
        id: "conflict-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "registry-version"] },
        managed: true,
        apps: { claude: true },
      });

      // Create Claude config with different version
      const claudeConfig = {
        mcpServers: {
          "conflict-server": {
            type: "stdio",
            command: "npx",
            args: ["-y", "client-version"],
          },
        },
      };
      await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude.json"),
        JSON.stringify(claudeConfig, null, 2)
      );

      const result = await diffExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
      });
      assert.equal(result.changes.length, 1);
      assert.equal(result.changes[0].action, "conflict");
    });
  });
});

test("syncExtensions preview does not write files", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      // Add record to registry
      await upsertRecord(memoryDir, {
        id: "preview-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "preview"] },
        managed: true,
        apps: { claude: true },
      });

      // Create empty Claude config
      await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude.json"),
        JSON.stringify({ mcpServers: {} }, null, 2)
      );

      const result = await syncExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
        apply: false,
      });
      assert.equal(result.applied, false);

      // Verify file unchanged
      const content = await fs.readFile(path.join(homeDir, ".claude.json"), "utf8");
      const config = JSON.parse(content);
      assert.deepEqual(config.mcpServers, {});
    });
  });
});

test("syncExtensions apply writes files", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      // Add record to registry
      await upsertRecord(memoryDir, {
        id: "apply-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "apply"] },
        managed: true,
        apps: { claude: true },
      });

      // Create empty Claude config
      await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude.json"),
        JSON.stringify({ mcpServers: {} }, null, 2)
      );

      const result = await syncExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
        apply: true,
      });
      assert.equal(result.applied, true);

      // Verify file updated
      const content = await fs.readFile(path.join(homeDir, ".claude.json"), "utf8");
      const config = JSON.parse(content);
      assert.deepEqual(config.mcpServers, {
        "apply-server": { type: "stdio", command: "npx", args: ["-y", "apply"] },
      });
    });
  });
});

test("syncExtensions apply skips only conflicting entries", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      await upsertRecord(memoryDir, {
        id: "conflict-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "registry-version"] },
        managed: true,
        apps: { claude: true },
      });
      await upsertRecord(memoryDir, {
        id: "fresh-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "fresh"] },
        managed: true,
        apps: { claude: true },
      });
      const configFile = path.join(homeDir, ".claude.json");
      await fs.writeFile(configFile, JSON.stringify({
        mcpServers: {
          "conflict-server": { type: "stdio", command: "npx", args: ["-y", "client-version"] },
        },
      }, null, 2));

      const result = await syncExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
        apply: true,
      });
      assert.equal(result.applied, true);
      assert.deepEqual(result.skippedApps, ["claude"]);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0].id, "conflict-server");
      const config = JSON.parse(await fs.readFile(configFile, "utf8"));
      assert.deepEqual(config.mcpServers["conflict-server"].args, ["-y", "client-version"]);
      assert.deepEqual(config.mcpServers["fresh-server"].args, ["-y", "fresh"]);

      const forced = await syncExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
        apply: true,
        force: true,
      });
      assert.equal(forced.applied, true);
      assert.deepEqual(forced.skippedApps, []);
      const overwritten = JSON.parse(await fs.readFile(configFile, "utf8"));
      assert.deepEqual(overwritten.mcpServers["conflict-server"].args, ["-y", "registry-version"]);
    });
  });
});

test("syncExtensions apply does not report success when every entry conflicts", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      await upsertRecord(memoryDir, {
        id: "conflict-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "registry-version"] },
        managed: true,
        apps: { claude: true },
      });
      const configFile = path.join(homeDir, ".claude.json");
      const original = JSON.stringify({
        mcpServers: {
          "conflict-server": { type: "stdio", command: "npx", args: ["-y", "client-version"] },
        },
      }, null, 2);
      await fs.writeFile(configFile, original);
      const result = await syncExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
        apply: true,
      });
      assert.equal(result.applied, false);
      assert.deepEqual(result.skippedApps, ["claude"]);
      assert.equal(await fs.readFile(configFile, "utf8"), original);
    });
  });
});

test("syncExtensions apply does not rewrite an unchanged Codex config", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      const configFile = path.join(homeDir, ".codex", "config.toml");
      await fs.mkdir(path.dirname(configFile), { recursive: true });
      const original = `# comment stays\nmodel = "kept"\n\n[mcp_servers.local]\ncommand = "echo"\n`;
      await fs.writeFile(configFile, original);
      const result = await syncExtensions(memoryDir, { apps: ["codex"], homeDir, apply: true });
      assert.equal(result.applied, true);
      assert.equal(await fs.readFile(configFile, "utf8"), original);
    });
  });
});

test("removeExtensions deletes the server from the client config", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      await upsertRecord(memoryDir, {
        id: "remove-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "remove"] },
        managed: true,
        apps: { claude: true, codex: true },
      });
      const claudeFile = path.join(homeDir, ".claude.json");
      await fs.writeFile(claudeFile, JSON.stringify({
        theme: "dark",
        mcpServers: {
          "remove-server": { command: "npx", args: ["-y", "remove"] },
          keep: { command: "echo" },
        },
      }, null, 2));
      const codexFile = path.join(homeDir, ".codex", "config.toml");
      await fs.mkdir(path.dirname(codexFile), { recursive: true });
      await fs.writeFile(codexFile, `# stay\nmodel = "kept"\n\n[mcp_servers.remove-server]\ncommand = "npx"\n\n[mcp_servers.keep]\ncommand = "echo"\n`);

      const result = await removeExtensions(memoryDir, "remove-server", { apply: true, homeDir });
      assert.equal(result.removed, true);
      const claude = JSON.parse(await fs.readFile(claudeFile, "utf8"));
      assert.equal(claude.theme, "dark");
      assert.equal(claude.mcpServers.keep.command, "echo");
      assert.equal(claude.mcpServers["remove-server"], undefined);
      const codex = await fs.readFile(codexFile, "utf8");
      assert.match(codex, /# stay/);
      assert.match(codex, /model = "kept"/);
      assert.match(codex, /\[mcp_servers\.keep\]/);
      assert.doesNotMatch(codex, /\[mcp_servers\.remove-server\]/);
    });
  });
});

test("removeExtensions removes record from registry", async () => {
  await withTempDir(async (memoryDir) => {
    await upsertRecord(memoryDir, {
      id: "remove-server",
      kind: "mcp",
      server: { type: "stdio", command: "npx", args: ["-y", "remove"] },
      managed: true,
    });

    const result = await removeExtensions(memoryDir, "remove-server", {
      apply: true,
      apps: [],
    });
    assert.equal(result.removed, true);

    // Verify record removed
    const registry = await readRegistry(memoryDir);
    assert.equal(registry.mcp["remove-server"], undefined);
  });
});

test("removeExtensions returns error for missing record", async () => {
  await withTempDir(async (memoryDir) => {
    const result = await removeExtensions(memoryDir, "missing-server", {
      apply: true,
      apps: [],
    });
    assert.equal(result.removed, false);
    assert.equal(result.error, "Extension not found: missing-server");
  });
});

test("statusExtensions shows registry and client status", async () => {
  await withTempHome(async (homeDir) => {
    await withTempDir(async (memoryDir) => {
      // Add records to registry
      await upsertRecord(memoryDir, {
        id: "status-server",
        kind: "mcp",
        server: { type: "stdio", command: "npx", args: ["-y", "status"] },
        managed: true,
        apps: { claude: true },
      });

      // Create Claude config
      const claudeConfig = {
        mcpServers: {
          "existing-server": {
            type: "stdio",
            command: "npx",
            args: ["-y", "existing"],
          },
        },
      };
      await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude.json"),
        JSON.stringify(claudeConfig, null, 2)
      );

      const result = await statusExtensions(memoryDir, {
        apps: ["claude"],
        homeDir,
      });
      assert.equal(result.registry.mcp, 1);
      assert.equal(result.clients.claude.mcp, 1);
      assert.equal(result.clients.claude.managed.mcp, 0);
    });
  });
});