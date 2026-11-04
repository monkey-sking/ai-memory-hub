import { getOption } from "../lib/cli.js";
import { resolveVaultRoot, searchVault, vaultStatus } from "../vault-context.js";

export function vaultCommand(argv, deps) {
  const action = argv[0] || "status";
  if (!["status", "search"].includes(action)) throw new Error("Usage: ai-memory-hub vault status|search [--query <text>] [--vault-root <path>]");
  const query = getOption(argv, "--query") || "";
  if (action === "search" && !query.trim()) throw new Error("Usage: ai-memory-hub vault search --query <text> [--limit <n>] [--vault-root <path>]");
  const root = resolveVaultRoot(deps.loadConfig(), getOption(argv, "--vault-root"));
  const result = action === "status" ? vaultStatus(root) : searchVault(root, query, { limit: getOption(argv, "--limit") });
  console.log(JSON.stringify(result, null, 2));
}
