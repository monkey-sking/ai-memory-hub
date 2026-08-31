import { buildSshPlan } from "../external-integrations.js";
import { getOption, hasFlag, positionalArgs } from "../lib/cli.js";

// ssh command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function sshCommand(argv, deps) {
  const action = argv[0] || "plan";
  if (action !== "plan") throw new Error("Usage: ai-memory-hub ssh plan --host <host> --user <user> --worktree <path> --command <command> [--approved] [--policy ask|allow]");
  const host = getOption(argv.slice(1), "--host") || "";
  const user = getOption(argv.slice(1), "--user") || "";
  const worktree = getOption(argv.slice(1), "--worktree") || "";
  const command = getOption(argv.slice(1), "--command") || positionalArgs(argv.slice(1)).join(" ");
  if (!host || !user || !worktree || !command) throw new Error("Usage: ai-memory-hub ssh plan --host <host> --user <user> --worktree <path> --command <command> [--approved] [--policy ask|allow]");
  console.log(JSON.stringify(buildSshPlan({ host, user, worktree, command, approved: hasFlag(argv, "--approved"), policy: getOption(argv, "--policy") || "ask" }), null, 2));
}
