import { getOption, hasFlag, readJson } from "../lib/cli.js";
import fs from "node:fs";
import path from "node:path";

// rpc command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function rpcCommand(argv, deps) {
  const action = argv[0] || "call";
  switch (action) {
    case "call":
      return rpcCallCommand(argv.slice(1), deps);
    case "respond":
      return rpcRespondCommand(argv.slice(1), deps);
    case "pending":
      return rpcPendingCommand(argv.slice(1), deps);
    default:
      throw new Error(`Unknown rpc action: ${action}\nTry: ai-memory-hub rpc call|respond|pending`);
  }
}

export function rpcCallCommand(argv, deps) {
  const to = getOption(argv, "--to") || "";
  const method = getOption(argv, "--method") || "";
  const paramsJson = getOption(argv, "--params") || "{}";
  const timeout = Number(getOption(argv, "--timeout") || 30000);
  const from = getOption(argv, "--from") || "unknown";

  if (!to || !method) {
    throw new Error("Usage: ai-memory-hub rpc call --to <tool> --method <method> [--params '{\"key\":\"value\"}'] [--timeout 30000] [--from <tool>]");
  }

  let params;
  try {
    params = JSON.parse(paramsJson);
  } catch (error) {
    throw new Error(`Invalid JSON params: ${error.message}`);
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const request = deps.createRpcRequest({ from, to, method, params, timeout });
  deps.writeRpcRequest(config.memoryDir, request);

  console.log(JSON.stringify({ request, status: "waiting" }, null, 2));

  const result = deps.waitForRpcResult(config.memoryDir, request.id, timeout);

  if (!result) {
    console.log(JSON.stringify({ request, status: "timeout", error: "No response within timeout" }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ request, result }, null, 2));
  process.exit(result.success ? 0 : 1);
}

export function rpcRespondCommand(argv, deps) {
  const requestId = getOption(argv, "--id") || "";
  const dataJson = getOption(argv, "--data") || "null";
  const error = getOption(argv, "--error") || "";
  const success = !error && !hasFlag(argv, "--error");

  if (!requestId) {
    throw new Error("Usage: ai-memory-hub rpc respond --id <request-id> [--data '{\"result\":\"value\"}'] [--error <message>]");
  }

  let data;
  try {
    data = JSON.parse(dataJson);
  } catch (err) {
    throw new Error(`Invalid JSON data: ${err.message}`);
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const request = deps.readRpcRequest(config.memoryDir, requestId);
  if (!request) {
    throw new Error(`RPC request not found: ${requestId}`);
  }

  const result = deps.writeRpcResult(config.memoryDir, requestId, { success, data, error });
  console.log(JSON.stringify(result, null, 2));
}

export function rpcPendingCommand(argv, deps) {
  const to = getOption(argv, "--to") || "";

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const requestsDir = path.join(config.memoryDir, "rpc", "requests");
  if (!fs.existsSync(requestsDir)) {
    console.log(JSON.stringify([], null, 2));
    return;
  }

  const files = fs.readdirSync(requestsDir).filter((f) => f.endsWith(".json"));
  const pending = files
    .map((file) => {
      try {
        return readJson(path.join(requestsDir, file));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((req) => to ? req.to === to : true)
    .filter((req) => !deps.readRpcResult(config.memoryDir, req.id));

  console.log(JSON.stringify(pending, null, 2));
}
