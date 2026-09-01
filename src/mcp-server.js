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
import os from "node:os";
import path from "node:path";
import { listExtensions, importExtensions, diffExtensions, syncExtensions, removeExtensions, statusExtensions, diffSkillExtensions, syncSkillExtensions } from "./extension-sync.js";
import { ensureWritableDir } from "./lib/cli.js";

const AMH_BIN = "ai-memory-hub";
// Resolve home robustly. Never fall back to process.cwd(): if the MCP server is
// launched from a root-owned working directory (common for daemons / IDE
// extensions), the old `${cwd}/.ai-memory` fallback landed on a non-writable
// path and produced the "没有权限写入 ~/.ai-memory" EACCES report.
const HOME_DIR = process.env.USERPROFILE || process.env.HOME || os.homedir();
const MEMORY_DIR = process.env.AMH_MEMORY_DIR || process.env.AI_MEMORY_DIR || path.join(HOME_DIR, ".ai-memory");

// Surface a clear, actionable error at startup if the shared memory store is
// missing or not writable, instead of failing opaquely on the first write.
try {
  ensureWritableDir(MEMORY_DIR);
} catch (err) {
  console.error(`[AMH MCP] ${err.message}`);
}

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
    name: "amh_extension_list",
    description: "List extensions in registry (MCP or Skill)",
    inputSchema: { type: "object", properties: { type: { type: "string", enum: ["mcp", "skill"], default: "mcp" }, app: { type: "string" } } }
  },
  {
    name: "amh_extension_import",
    description: "Import extensions from client files",
    inputSchema: { type: "object", properties: { type: { type: "string", enum: ["mcp", "skill"], default: "mcp" }, app: { type: "string" }, all: { type: "boolean", default: false } } }
  },
  {
    name: "amh_extension_diff",
    description: "Show differences between registry and clients",
    inputSchema: { type: "object", properties: { type: { type: "string", enum: ["mcp", "skill"], default: "mcp" }, app: { type: "string" }, all: { type: "boolean", default: false } } }
  },
  {
    name: "amh_extension_sync",
    description: "Sync extensions to clients",
    inputSchema: { type: "object", properties: { type: { type: "string", enum: ["mcp", "skill"], default: "mcp" }, app: { type: "string" }, all: { type: "boolean", default: false }, apply: { type: "boolean", default: false }, force: { type: "boolean", default: false } } }
  },
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
  },
  {
    name: "amh_extension_remove",
    description: "Remove a managed MCP extension from registry and client files",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Extension ID to remove" },
        apps: { type: "array", items: { type: "string" } },
        apply: { type: "boolean", default: false }
      },
      required: ["id"]
    }
  },
  {
    name: "amh_extension_status",
    description: "Show status of MCP extensions across registry and clients",
    inputSchema: {
      type: "object",
      properties: {
        apps: { type: "array", items: { type: "string" } }
      }
    }
  }
  ,{
    name: "amh_skill_list",
    description: "List managed Skill records",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "amh_skill_diff",
    description: "Preview Skill projection differences",
    inputSchema: { type: "object", properties: { project: { type: "string" }, apps: { type: "array", items: { type: "string" } } } }
  },
  {
    name: "amh_skill_sync",
    description: "Preview or apply Skill projection synchronization",
    inputSchema: { type: "object", properties: { project: { type: "string" }, apps: { type: "array", items: { type: "string" } }, apply: { type: "boolean" } } }
  }
];

async function handleRequest(msg) {
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
    if (name === "amh_extension_list") {
      const kind = args?.type || "mcp";
      const records = await listExtensions(MEMORY_DIR, { kind });
      return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, type: kind, records }, null, 2) }] } };
    }
    if (name === "amh_extension_import") {
      const kind = args?.type || "mcp";
      const apps = args?.app ? [args.app] : (args?.all ? ["claude", "codex", "gemini", "opencode"] : undefined);
      const result = kind === "skill"
        ? await importExtensions(MEMORY_DIR, { apps, homeDir: HOME_DIR })
        : await importExtensions(MEMORY_DIR, { apps, homeDir: HOME_DIR });
      return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, type: kind, ...result }, null, 2) }] } };
    }
    if (name === "amh_extension_diff") {
      const kind = args?.type || "mcp";
      const apps = args?.app ? [args.app] : (args?.all ? ["claude", "codex", "gemini", "opencode"] : undefined);
      const result = kind === "skill"
        ? await diffSkillExtensions(MEMORY_DIR, { projectRoot: HOME_DIR, apps })
        : await diffExtensions(MEMORY_DIR, { apps, homeDir: HOME_DIR });
      return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, type: kind, ...result }, null, 2) }] } };
    }
    if (name === "amh_extension_sync") {
      const kind = args?.type || "mcp";
      const apps = args?.app ? [args.app] : (args?.all ? ["claude", "codex", "gemini", "opencode"] : undefined);
      const result = kind === "skill"
        ? await syncSkillExtensions(MEMORY_DIR, { projectRoot: HOME_DIR, apps, apply: args?.apply === true })
        : await syncExtensions(MEMORY_DIR, { apps, homeDir: HOME_DIR, apply: args?.apply === true, force: args?.force === true });
      return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, type: kind, ...result }, null, 2) }] } };
    }
    if (name === "amh_extension_remove") return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, ...(await removeExtensions(MEMORY_DIR, args?.id, { apps: args?.apps, apply: args?.apply === true })) }, null, 2) }] } };
    if (name === "amh_extension_status") return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, ...(await statusExtensions(MEMORY_DIR, { apps: args?.apps, homeDir: HOME_DIR })) }, null, 2) }] } };
    if (name === "amh_skill_list") return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, records: await listExtensions(MEMORY_DIR, { kind: "skill" }) }, null, 2) }] } };
    if (name === "amh_skill_diff") return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, ...(await diffSkillExtensions(MEMORY_DIR, { projectRoot: args?.project || HOME_DIR, apps: args?.apps })) }, null, 2) }] } };
    if (name === "amh_skill_sync") return { id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, ...(await syncSkillExtensions(MEMORY_DIR, { projectRoot: args?.project || HOME_DIR, apps: args?.apps, apply: args?.apply === true })) }, null, 2) }] } };
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

rl.on("line", async (line) => {
  try {
    const msg = JSON.parse(line);
    const response = await handleRequest(msg);
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (e) {
    process.stderr.write("MCP Server error: " + e.message + "\n");
  }
});

rl.on("close", () => process.exit(0));

process.stderr.write("AMH MCP Server v1.0 ready (stdio transport)\n");
