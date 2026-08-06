import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const MCP_SERVER = path.join(import.meta.dirname, "..", "src", "mcp-server.js");

function createMcpClient() {
  const child = spawn(process.execPath, [MCP_SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, AMH_MEMORY_DIR: process.env.AMH_MEMORY_DIR || path.join(os.tmpdir(), "amh-mcp-test-" + Date.now()) }
  });
  return {
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
    close() {
      child.stdin.end();
      child.kill();
    }
  };
}

test("tools/list includes the 4 new extension tools", async () => {
  const client = createMcpClient();
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
    client.close();
  }
});

test("amh_extension_list returns JSON", async () => {
  const client = createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_list", arguments: { type: "mcp" } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.ok(Array.isArray(result.records));
  } finally {
    client.close();
  }
});

test("amh_extension_import returns JSON", async () => {
  const client = createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_import", arguments: { type: "mcp", all: false } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.ok(Array.isArray(result.imported));
  } finally {
    client.close();
  }
});

test("amh_extension_diff returns JSON", async () => {
  const client = createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_diff", arguments: { type: "mcp", all: false } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.ok(Array.isArray(result.changes));
  } finally {
    client.close();
  }
});

test("amh_extension_sync preview returns JSON without applying", async () => {
  const client = createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_sync", arguments: { type: "mcp", all: false, apply: false } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.equal(result.applied, false);
    assert.ok(Array.isArray(result.changes));
  } finally {
    client.close();
  }
});

test("amh_extension_sync with apply=true applies changes", async () => {
  const client = createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "amh_extension_sync", arguments: { type: "mcp", all: false, apply: true } } });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.ok, true);
    assert.equal(result.type, "mcp");
    assert.equal(result.applied, true);
  } finally {
    client.close();
  }
});

test("Unknown tool returns error", async () => {
  const client = createMcpClient();
  try {
    await client.send({ id: 1, method: "initialize" });
    const response = await client.send({ id: 2, method: "tools/call", params: { name: "nonexistent_tool", arguments: {} } });
    assert.ok(response.error, "Expected error response");
    assert.equal(response.error.code, -32601);
    assert.ok(response.error.message.includes("Unknown tool"));
  } finally {
    client.close();
  }
});
