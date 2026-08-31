import { appendJsonl } from "../event-writer.js";
import { getOption, hasFlag } from "../lib/cli.js";
import fs from "node:fs";
import path from "node:path";

// worktree command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function worktreeCommand(argv, deps) {
  const action = argv[0] || "list";
  if (action === "add") return worktreeAddCommand(argv.slice(1), deps);
  if (action === "rm" || action === "remove") return worktreeRemoveCommand(argv.slice(1), deps);
  if (!["list", "inspect", "snapshot"].includes(action)) throw new Error("Usage: ai-memory-hub worktree list|inspect|snapshot [--id <path-or-id>] | add <repo> [--name <n>] [--branch <b>] | rm <worktree-path> [--force]");
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const worktrees = deps.dashboardWorktrees.getDashboardWorktrees(config.memoryDir).worktrees;
  const id = getOption(argv.slice(1), "--id") || argv[1] || "";
  console.log(JSON.stringify(id ? worktrees.filter((item) => item.id === id || item.path === id || item.branch === id) : worktrees, null, 2));
}

export function worktreeAddCommand(argv, deps) {
  const repo = (argv[0] || "").trim();
  if (!repo) throw new Error("Usage: ai-memory-hub worktree add <repo-path> [--name <worktree-name>] [--branch <branch>]");
  const name = (getOption(argv, "--name") || "").trim() || `agent-${Date.now().toString(36)}`;
  const branch = (getOption(argv, "--branch") || "").trim();
  const repoAbs = path.resolve(repo);
  if (!fs.existsSync(repoAbs)) throw new Error(`Repo path not found: ${repoAbs}`);
  deps.runGit(repoAbs, ["rev-parse", "--git-dir"]); // 校验是 git 仓库
  const wtDir = path.join(repoAbs, ".ai-worktrees", name);
  if (fs.existsSync(wtDir)) throw new Error(`Worktree already exists: ${wtDir}`);
  fs.mkdirSync(path.dirname(wtDir), { recursive: true });
  const args = ["worktree", "add", wtDir];
  if (branch) args.push("-b", branch);
  deps.runGit(repoAbs, args);
  const result = { ok: true, name, path: wtDir, branch: branch || "(detached)", repo: repoAbs, createdAt: new Date().toISOString() };
  try {
    const config = deps.loadConfig();
    deps.ensureHub(config.memoryDir);
    appendJsonl(path.join(config.memoryDir, "inbox", "events.jsonl"), {
      source: "amh-cli",
      text: `Created isolated worktree ${name} at ${wtDir} (branch ${branch || "detached"}) for repo ${repoAbs}`,
      metadata: { kind: "workflow", project: path.basename(repoAbs), scope: "worktree", confidence: "high" }
    });
  } catch (_) { /* 归档失败不影响 worktree 创建 */ }
  console.log(JSON.stringify(result, null, 2));
}

export function worktreeRemoveCommand(argv, deps) {
  const target = (argv[0] || "").trim();
  const force = hasFlag(argv, "--force");
  if (!target) throw new Error("Usage: ai-memory-hub worktree rm <worktree-path> [--force]");
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error(`Worktree path not found: ${abs}`);
  const dotGitFile = path.join(abs, ".git");
  let repo = "";
  if (fs.existsSync(dotGitFile) && fs.statSync(dotGitFile).isFile()) {
    const content = fs.readFileSync(dotGitFile, "utf8");
    const m = content.match(/gitdir:\s*(.+)/);
    if (m) repo = path.resolve(path.dirname(m[1].trim()), "..", ".."); // <repo>/.git/worktrees/<name> → <repo>
  }
  if (!repo) {
    // 直接在主仓库里找：尝试把 target 当作 <repo>/.ai-worktrees/<name> 解析
    const candidates = [path.join(abs, ".."), abs];
    for (const c of candidates) {
      try {
        deps.runGit(c, ["rev-parse", "--git-dir"]);
        repo = c;
        break;
      } catch (_) { /* 继续 */ }
    }
  }
  if (!repo) throw new Error(`Cannot locate parent repo for worktree: ${abs}`);
  const args = ["worktree", "remove", abs];
  if (force) args.push("--force");
  deps.runGit(repo, args);
  console.log(JSON.stringify({ ok: true, removed: abs }, null, 2));
}
