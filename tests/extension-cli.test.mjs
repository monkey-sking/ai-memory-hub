import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import test from "node:test";

const CLI_PATH = path.join(import.meta.dirname, "..", "src", "index.js");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-cli-ext-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function runCli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { encoding: "utf8", timeout: 10000, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error?.code || 0,
          stdout: stdout?.trim() || "",
          stderr: stderr?.trim() || "",
        });
      }
    );
  });
}

test("mcp list shows empty array for new registry", async () => {
  await withTempDir(async (memoryDir) => {
    const result = await runCli(["mcp", "list"], { AI_MEMORY_DIR: memoryDir });
    assert.equal(result.exitCode, 0);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output, []);
  });
});

test("mcp import imports from client files", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Create Claude config file
      const claudeConfig = {
        mcpServers: {
          "test-server": {
            type: "stdio",
            command: "npx",
            args: ["-y", "test-server"],
          },
        },
      };
      await fs.mkdir(path.join(homeDir, ".claude"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude.json"),
        JSON.stringify(claudeConfig, null, 2)
      );

      const result = await runCli(["mcp", "import", "--app", "claude"], {
        AI_MEMORY_DIR: memoryDir,
        USERPROFILE: homeDir,
        HOME: homeDir,
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.equal(output.imported.length, 1);
      assert.equal(output.imported[0].id, "test-server");
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("mcp diff shows additions", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Add record to registry
      const { upsertRecord } = await import("../src/extension-registry.js");
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

      const result = await runCli(["mcp", "diff", "--app", "claude"], {
        AI_MEMORY_DIR: memoryDir,
        USERPROFILE: homeDir,
        HOME: homeDir,
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.equal(output.changes.length, 1);
      assert.equal(output.changes[0].action, "add");
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("mcp sync preview does not write files", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Add record to registry
      const { upsertRecord } = await import("../src/extension-registry.js");
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

      const result = await runCli(["mcp", "sync", "--app", "claude"], {
        AI_MEMORY_DIR: memoryDir,
        USERPROFILE: homeDir,
        HOME: homeDir,
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.equal(output.applied, false);

      // Verify file unchanged
      const content = await fs.readFile(path.join(homeDir, ".claude.json"), "utf8");
      const config = JSON.parse(content);
      assert.deepEqual(config.mcpServers, {});
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("mcp sync apply writes files", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Add record to registry
      const { upsertRecord } = await import("../src/extension-registry.js");
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

      const result = await runCli(
        ["mcp", "sync", "--app", "claude", "--apply"],
        { AI_MEMORY_DIR: memoryDir, USERPROFILE: homeDir, HOME: homeDir }
      );
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.equal(output.applied, true);

      // Verify file updated
      const content = await fs.readFile(path.join(homeDir, ".claude.json"), "utf8");
      const config = JSON.parse(content);
      assert.deepEqual(config.mcpServers, {
        "apply-server": { type: "stdio", command: "npx", args: ["-y", "apply"] },
      });
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("mcp remove removes record from registry", async () => {
  await withTempDir(async (memoryDir) => {
    // Add record to registry
    const { upsertRecord } = await import("../src/extension-registry.js");
    await upsertRecord(memoryDir, {
      id: "remove-server",
      kind: "mcp",
      server: { type: "stdio", command: "npx", args: ["-y", "remove"] },
      managed: true,
    });

    const result = await runCli(["mcp", "remove", "remove-server", "--apply"], {
      AI_MEMORY_DIR: memoryDir,
    });
    assert.equal(result.exitCode, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.removed, true);

    // Verify record removed
    const { readRegistry } = await import("../src/extension-registry.js");
    const registry = await readRegistry(memoryDir);
    assert.equal(registry.mcp["remove-server"], undefined);
  });
});

test("mcp status shows registry and client status", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Add record to registry
      const { upsertRecord } = await import("../src/extension-registry.js");
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

      const result = await runCli(["mcp", "status", "--app", "claude"], {
        AI_MEMORY_DIR: memoryDir,
        USERPROFILE: homeDir,
        HOME: homeDir,
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.equal(output.registry.mcp, 1);
      assert.equal(output.clients.claude.mcp, 1);
      assert.equal(output.clients.claude.managed.mcp, 0);
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("mcp help shows usage", async () => {
  const result = await runCli(["mcp", "--help"]);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes("Usage: ai-memory-hub mcp list|import|diff|sync|remove|status"));
});

test("skill list returns JSON output", async () => {
  await withTempDir(async (memoryDir) => {
    const result = await runCli(["skill", "list"], { AI_MEMORY_DIR: memoryDir });
    assert.equal(result.exitCode, 0);
    const output = JSON.parse(result.stdout);
    assert.ok(Array.isArray(output));
  });
});

test("skill list --app filters by app", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Create skill directory for Claude
      await fs.mkdir(path.join(homeDir, ".claude", "skills", "test-skill"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude", "skills", "test-skill", "SKILL.md"),
        "# Test Skill\n> A test skill"
      );

      const result = await runCli(["skill", "list", "--app", "claude"], {
        AI_MEMORY_DIR: memoryDir,
        USERPROFILE: homeDir,
        HOME: homeDir,
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(Array.isArray(output));
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("skill diff shows skill differences", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Create skill directory for Claude
      await fs.mkdir(path.join(homeDir, ".claude", "skills", "new-skill"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude", "skills", "new-skill", "SKILL.md"),
        "# New Skill\n> A new skill"
      );

      const result = await runCli(["skill", "diff", "--app", "claude"], {
        AI_MEMORY_DIR: memoryDir,
        USERPROFILE: homeDir,
        HOME: homeDir,
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output);
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("skill sync preview does not write files", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Create skill directory for Claude
      await fs.mkdir(path.join(homeDir, ".claude", "skills", "sync-skill"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude", "skills", "sync-skill", "SKILL.md"),
        "# Sync Skill\n> A sync skill"
      );

      const result = await runCli(["skill", "sync", "--app", "claude"], {
        AI_MEMORY_DIR: memoryDir,
        USERPROFILE: homeDir,
        HOME: homeDir,
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.equal(output.applied, false);
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("skill remove removes skill extension", async () => {
  await withTempDir(async (memoryDir) => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-home-"));
    try {
      // Create skill directory for Claude
      await fs.mkdir(path.join(homeDir, ".claude", "skills", "remove-skill"), { recursive: true });
      await fs.writeFile(
        path.join(homeDir, ".claude", "skills", "remove-skill", "SKILL.md"),
        "# Remove Skill\n> A skill to remove"
      );

      const result = await runCli(["skill", "remove", "remove-skill", "--app", "claude"], {
        AI_MEMORY_DIR: memoryDir,
        USERPROFILE: homeDir,
        HOME: homeDir,
      });
      assert.equal(result.exitCode, 0);
      const output = JSON.parse(result.stdout);
      assert.ok(output);
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});

test("mcp --help shows usage", async () => {
  const result = await runCli(["mcp", "--help"]);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes("Usage: ai-memory-hub mcp"));
});

test("skill --help shows usage", async () => {
  const result = await runCli(["skill", "--help"]);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes("Usage: ai-memory-hub skill"));
});