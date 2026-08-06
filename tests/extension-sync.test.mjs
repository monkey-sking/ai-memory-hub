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