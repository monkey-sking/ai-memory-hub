#!/usr/bin/env node
/**
 * AMH MCP Server — OPC v1.1 P2
 * Exposes AMH core capabilities via Model Context Protocol.
 * Any MCP-compatible AI tool can call AMH without CLI.
 *
 * Usage: node mcp-server.js  (stdio transport)
 * Config in MCP settings: { "command": "node", "args": ["/path/to/mcp-server.js"] }
 */

import { execFileSync } from "child_process";
import readline from "readline";

const AMH_BIN = "ai-memory-hub";

function runAmh(args) {
  try {
    const out = execFileSync(AMH_BIN, args, { encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, error: e.message, stderr: e.stderr ? e.stderr.toString() : "" };
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

const TOOLS = [
  {
    name: "amh_record",
    description: "Write a memory event to AMH shared memory hub",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Memory text to record" },
        source: { type: "string", description: "AI tool name (e.g. claude, codex, trae)" },
        kind: { type: "string", enum: ["preference", "project", "workflow", "correction", "note"], default: "note" },
        project: { type: "string" },
        tags: { type: "string", description: "Comma-separated tags" },
        priority: { type: "string", enum: ["high", "normal", "low"], default: "normal" },
        ttl: { type: "number", description: "TTL in days" }
      },
      required: ["text", "source"]
    }
  },
  {
    name: "amh_search",
    description: "Search AMH shared memory (FTS or semantic mode)",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number", default: 10 },
        mode: { type: "string", enum: ["fts", "semantic"], default: "fts" },
        type: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "amh_radio_send",
    description: "Send a message to another AI tool via AMH radio",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        type: { type: "string", enum: ["workflow", "review", "alert", "info"], default: "workflow" },
        project: { type: "string" }
      },
      required: ["text", "from", "to"]
    }
  },
  {
    name: "amh_task_list",
    description: "List AMH tasks",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "done", "all"], default: "open" },
        project: { type: "string" }
      }
    }
  },
  {
    name: "amh_task_add",
    description: "Create a new AMH task",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        from: { type: "string" },
        project: { type: "string" },
        priority: { type: "string", enum: ["high", "normal", "low"], default: "normal" }
      },
      required: ["title", "from"]
    }
  },
  {
    name: "amh_task_done",
    description: "Mark an AMH task as done (respects evaluation signal gate)",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        by: { type: "string" },
        force: { type: "boolean", default: false }
      },
      required: ["id", "by"]
    }
  },
  {
    name: "amh_task_fail",
    description: "Report a task failure with 6-class routing (OPC v1.1)",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["temporal", "param", "permission", "evidence", "conflict", "risk"] },
        by: { type: "string" },
        detail: { type: "string" }
      },
      required: ["id", "type"]
    }
  },
  {
    name: "amh_task_budget",
    description: "Set or check task budget (OPC v1.1 stop conditions)",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        maxIterations: { type: "number" },
        maxToolCalls: { type: "number" },
        maxMinutes: { type: "number" },
        maxTokens: { type: "number" },
        check: { type: "boolean", default: false }
      },
      required: ["id"]
    }
  }
];

function handleRequest(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return { id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "amh-mcp-server", version: "1.0.0" } } };
  }
  if (method === "tools/list") {
    return { id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    let amhArgs = [];
    switch (name) {
      case "amh_record":
        amhArgs = ["record", args.text, "--source", args.source, "--kind", args.kind || "note"];
        if (args.project) amhArgs.push("--project", args.project);
        if (args.tags) amhArgs.push("--tags", args.tags);
        if (args.priority) amhArgs.push("--priority", args.priority);
        if (args.ttl) amhArgs.push("--ttl", String(args.ttl));
        break;
      case "amh_search":
        amhArgs = ["search", args.query, "--limit", String(args.limit || 10)];
        if (args.mode) amhArgs.push("--mode", args.mode);
        if (args.type) amhArgs.push("--type", args.type);
        break;
      case "amh_radio_send":
        amhArgs = ["radio", "send", args.text, "--from", args.from, "--to", args.to, "--type", args.type || "workflow"];
        if (args.project) amhArgs.push("--project", args.project);
        break;
      case "amh_task_list":
        amhArgs = ["task", "list"];
        if (args.status && args.status !== "open") amhArgs.push("--status", args.status);
        if (args.project) amhArgs.push("--project", args.project);
        break;
      case "amh_task_add":
        amhArgs = ["task", "add", args.title, "--from", args.from];
        if (args.description) amhArgs.push("--description", args.description);
        if (args.project) amhArgs.push("--project", args.project);
        if (args.priority) amhArgs.push("--priority", args.priority);
        break;
      case "amh_task_done":
        amhArgs = ["task", "done", "--id", args.id, "--by", args.by];
        if (args.force) amhArgs.push("--force");
        break;
      case "amh_task_fail":
        amhArgs = ["task", "fail", "--id", args.id, "--type", args.type];
        if (args.by) amhArgs.push("--by", args.by);
        if (args.detail) amhArgs.push("--detail", args.detail);
        break;
      case "amh_task_budget":
        amhArgs = ["task", "budget", "--id", args.id];
        if (args.maxIterations) amhArgs.push("--max-iterations", String(args.maxIterations));
        if (args.maxToolCalls) amhArgs.push("--max-tool-calls", String(args.maxToolCalls));
        if (args.maxMinutes) amhArgs.push("--max-minutes", String(args.maxMinutes));
        if (args.maxTokens) amhArgs.push("--max-tokens", String(args.maxTokens));
        if (args.check) amhArgs.push("--check");
        break;
      default:
        return { id, error: { code: -32601, message: "Unknown tool: " + name } };
    }
    const result = runAmh(amhArgs);
    return { id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
  }
  return { id, error: { code: -32601, message: "Unknown method: " + method } };
}

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    const response = handleRequest(msg);
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (e) {
    process.stderr.write("MCP Server error: " + e.message + "\n");
  }
});

rl.on("close", () => process.exit(0));

process.stderr.write("AMH MCP Server v1.0 ready (stdio transport)\n");
