import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const MCP_SERVER = path.join(import.meta.dirname, "..", "src", "mcp-server.js");
const REAL_HOME = process.env.USERPROFILE || process.env.HOME || os.homedir();
const GUARDED_CONFIGS = [
  path.join(REAL_HOME, ".codex", "config.toml"),
  path.join(REAL_HOME, ".claude.json"),
  path.join(REAL_HOME, ".gemini", "settings.json"),
  path.join(REAL_HOME, ".config", "opencode", "opencode.json"),
];

async function fingerprint(file) {
  try {
    const [buf, st] = await Promise.all([fs.readFile(file), fs.stat(file)]);
    return { exists: true, sha256: createHash("sha256").update(buf).digest("hex"), size: st.size };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false };
    throw error;
  }
}

async function backupNames(dir, baseName) {
  try {
    const names = await fs.readdir(dir);
    return names.filter((name) => name.startsWith("backup_") && name.endsWith(`_${baseName}`)).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function snapshotUserConfigs() {
  const files = {};
  const backups = {};
  for (const file of GUARDED_CONFIGS) {
    files[file] = await fingerprint(file);
    const key = `${path.dirname(file)}\0${path.basename(file)}`;
    backups[key] = await backupNames(path.dirname(file), path.basename(file));
  }
  return { files, backups };
}

async function createMcpClient({ registry } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-mcp-test-"));
  const homeDir = path.join(root, "home");
  const memoryDir = path.join(root, "memory");
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(memoryDir, { recursive: true });
  if (registry) {
    await fs.writeFile(
      path.join(memoryDir, "extension-registry.json"),
      JSON.stringify(registry, null, 2) + "\n"
    );
  }
  // AMH_MEMORY_DIR only redirects the registry. sync --apply writes client
  // configs under HOME/USERPROFILE, so the child must not inherit the real home.
  const child = spawn(process.execPath, [MCP_SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      AMH_MEMORY_DIR: memoryDir,
      AI_MEMORY_DIR: memoryDir,
    }
  });
  return {
    homeDir,
    memoryDir,
    async send(msg) {
      return new Promise((resolve, reject) => {
        let buffer = "";
        const onData = (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          if (lines.length > 1) {
            child.stdout.removeListener("data", onData);
            try {
              resolve(JSON.parse(lines[0]));
            } catch (e) {
              reject(new Error("Invalid JSON: " + lines[0]));
            }
          }
        };
        child.stdout.on("data", onData);
        child.stdin.write(JSON.stringify(msg) + "\n");
        setTimeout(() => {
          child.stdout.removeListener("data", onData);
          reject(new Error("Timeout waiting for response"));
        }, 5000);
      });
    },
    async close() {
      child.stdin.end();
      child.kill();
      await fs.rm(root, { recursive: true, force: true });
    }
  };
}

test("tools/list includes the 4 new extension tools", async () => {
  const client = await createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/list" });
    const toolNames = response.result.tools.map(t => t.name);
    assert.ok(toolNames.includes("amh_extension_list"), "amh_extension_list not found");
    assert.ok(toolNames.includes("amh_extension_import"), "amh_extension_import not found");
    assert.ok(toolNames.includes("amh_extension_diff"), "amh_extension_diff not found");
    assert.ok(toolNames.includes("amh_extension_sync"), "amh_extension_sync not found");
    
    const listTool = response.result.tools.find(t => t.name === "amh_extension_list");
    assert.ok(listTool.inputSchema.properties.type, "type property missing");
    assert.deepEqual(listTool.inputSchema.properties.type.enum, ["mcp", "skill"]);
    assert.ok(listTool.inputSchema.properties.app, "app property missing");
  } finally {
    await client.close();
  }
});

test("amh_extension_list returns JSON", async () => {
  const client = await createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_list", arguments: { type: "mcp" } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.ok(Array.isArray(result.records));
  } finally {
    await client.close();
  }
});

test("amh_extension_import returns JSON", async () => {
  const client = await createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_import", arguments: { type: "mcp", all: false } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.ok(Array.isArray(result.imported));
  } finally {
    await client.close();
  }
});

test("amh_extension_diff returns JSON", async () => {
  const client = await createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_diff", arguments: { type: "mcp", all: false } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.ok(Array.isArray(result.changes));
  } finally {
    await client.close();
  }
});

test("amh_extension_sync preview returns JSON without applying", async () => {
  const client = await createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_sync", arguments: { type: "mcp", all: false, apply: false } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.equal(result.applied, false);
    assert.ok(Array.isArray(result.changes));
  } finally {
    await client.close();
  }
});

test("amh_extension_sync with apply=true applies changes", async () => {
  const before = await snapshotUserConfigs();
  const client = await createMcpClient({
    registry: {
      version: 1,
      mcp: {
        "sandbox-server": {
          id: "sandbox-server",
          kind: "mcp",
          server: { type: "stdio", command: "echo", args: ["sandbox"] },
          apps: { claude: true, codex: true, gemini: true, opencode: true },
          managed: true,
          source: "manual",
          updatedAt: "2026-10-05T00:00:00.000Z",
        },
      },
      skills: {},
    },
  });
  try {
    assert.notEqual(path.resolve(client.homeDir), path.resolve(REAL_HOME));
    await fs.mkdir(path.join(client.homeDir, ".codex"), { recursive: true });
    await fs.writeFile(
      path.join(client.homeDir, ".codex", "config.toml"),
      "[mcp_servers.keep]\ncommand = \"echo\"\nargs = [\"keep\"]\n"
    );
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_sync", arguments: { type: "mcp", all: false, apply: true } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.equal(result.applied, true);

    const sandboxConfigs = [
      path.join(client.homeDir, ".codex", "config.toml"),
      path.join(client.homeDir, ".claude.json"),
      path.join(client.homeDir, ".gemini", "settings.json"),
      path.join(client.homeDir, ".config", "opencode", "opencode.json"),
    ];
    for (const file of sandboxConfigs) {
      const content = await fs.readFile(file, "utf8");
      assert.match(content, /sandbox-server/);
      assert.ok(path.resolve(file).startsWith(path.resolve(client.homeDir) + path.sep));
    }
    assert.deepEqual(await snapshotUserConfigs(), before);
  } finally {
    await client.close();
  }
});

test("Unknown tool returns error", async () => {
  const client = await createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "nonexistent_tool", arguments: {} } });
    assert.ok(response.error, "Expected error response");
    assert.equal(response.error.code, -32601);
    assert.ok(response.error.message.includes("Unknown tool"));
  } finally {
    await client.close();
  }
});
