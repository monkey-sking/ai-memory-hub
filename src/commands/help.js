import { APP_NAME } from "../lib/constants.js";
// help command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function helpCommand(deps) {
  console.log(`Usage: ${APP_NAME} <command> [options]

Commands:
  init       Create ~/.ai-memory and config. Use --all to detect installed tools and install their adapters in one step.
  detect     Detect installed AI tools.
  capabilities
             Show the cross-tool capability registry and safety policy.
  declare    Declare an agent's models and strengths, or list/remove declarations.
  models     Show or refresh the model catalog for each tool (pulled from the provider where supported).
  status     Show hub and tool status.
  record     Append a local memory event.
  radio      Send, list, and promote cross-agent radio messages.
  sync       Index pending inbox events into the local memory ledger.
  index      Rebuild MEMORY.md, INDEX.md, and the structured local index.
  search     Search indexed local memories (FTS5 with BM25 ranking).
  snapshot   Print a filtered memory snapshot view without rewriting MEMORY.md.
  resolve    Resolve an @include or file name from local paths and memory.
  task       Share task/todo state across AI tools.
  workflow   Coordinate planner/executor/reviewer/observer work across AI tools.
  prompt     Manage prompt templates with Nunjucks rendering for AI tools.
  project    Manage project metadata, aliases, resources, and archive state.
  session    Manage session handoff for context transfer between tools.
  agent      Manage agent registry (persona/bio/status) and role bindings.
  review     Request or list linked reviews.
  role       Manage first-class role entities (permissions, agent bindings).
  team       Manage first-class team entities (agent memberships via member-of).
  worktree   Inspect projected execution worktrees.
  rpc        Synchronous request-response RPC calls between tools.
  notify     Send cross-platform notifications with severity-based routing.
  context    Generate task-specific memory bundles for focused context.
  queue      Manage dispatch queue with priority and retry controls.
  recipe     Manage workflow recipes for reusable collaboration templates.
  task-spec  List, validate, and run project-declared task commands.
  metrics    Show operational metrics for tasks, workflows, relay, and queue.
  health     Generate a Markdown health report for the local memory hub.
  update     Check for updates or update to the latest version.
  connect    Check tool connections or send a request/review/handoff to another tool.
  doctor     Diagnose AI tool runner paths, shims, probes, and prompt mode.
  dispatch   Dispatch pending radio/task work to verified CLI runners.
  checkpoint Show, reset, or inspect loop checkpoint state for resumable daemon loops.
  heartbeat  Check daemon heartbeat status, or watch for stale/dead daemon.
  skill-delta Manage skill improvement proposals (observer → reviewer → merge).
  skill      List/search/attach reusable skills.
  pack       Register and validate external domain packs.
  pull       Rebuild MEMORY.md from the local memory ledger.
  merge      Merge local memory with backup data or resolve Git conflicts.
  backup     Back up hub files, inspect/prune retention, and manage GitHub data backups.
  gh         Sync linked task state, build read-only API requests, or parse webhooks.
  ssh        Build approval-gated remote execution plans (never executes commands).
  watch      Periodically index pending inbox events.
  daemon     Run or inspect the local dispatch daemon.
  app        Start the local dashboard app.
  install    Show or apply per-tool instruction snippets. Use --local to write rules in the current project directory.
  help       Show this help.

Examples:
  ${APP_NAME} init
  ${APP_NAME} init --all
  ${APP_NAME} init --all --apply
  ${APP_NAME} record "User prefers concise answers." --source codex --kind preference
  ${APP_NAME} record "Project memory with tags." --source codex --kind project --project ai-memory-hub --tags schema,memos --confidence 0.8
  ${APP_NAME} radio send "Please review the latest implementation." --from codex --to claude --type review
  ${APP_NAME} radio list --limit 10
  ${APP_NAME} radio promote --id <message-id>
  ${APP_NAME} sync --dry-run
  ${APP_NAME} sync
  ${APP_NAME} index
  ${APP_NAME} search "git commit rules" --limit 5 --tag workflow
  ${APP_NAME} merge
  ${APP_NAME} merge --auto-git
  ${APP_NAME} merge --from <path>
  ${APP_NAME} snapshot --project ai-memory-hub --tags workflow,git --limit 20
  ${APP_NAME} resolve "@RTK.md" --from ~/.codex/AGENTS.md
  ${APP_NAME} task add "Review README task-list section" --description "Goal: check task docs. Scope: README only. Acceptance: examples are accurate." --handoff "Next: reviewer verifies wording." --from codex --project ai-memory-hub --priority high
  ${APP_NAME} task list --status active
  ${APP_NAME} task claim --id <task-id> --by claude
  ${APP_NAME} task update --id <task-id> --description "Goal: ... Scope: ... Acceptance: ..." --handoff "Current state and next step." --by codex
  ${APP_NAME} task note --id <task-id> "Reviewed Chinese docs." --by qclaw
  ${APP_NAME} task done --id <task-id> --by codex
  ${APP_NAME} task archive --days 30
  ${APP_NAME} radio archive --days 30
  ${APP_NAME} connect
  ${APP_NAME} connect --apply
  ${APP_NAME} capabilities --tool claude
  ${APP_NAME} declare --tool opencode --models "grok-4.5,claude-sonnet-4" --strengths "前端开发,代码审查" --by opencode
  ${APP_NAME} declare list
  ${APP_NAME} models --to opencode --refresh
  ${APP_NAME} connect request --from gemini --to codex --project ai-memory-hub --text "Please inspect the current task list." --task
  ${APP_NAME} doctor --tool claude
  ${APP_NAME} workflow create "Review dashboard changes" --from codex --project ai-memory-hub --planner codex --executor opencode --reviewer qclaw --spawn-tasks --notify
  ${APP_NAME} workflow list --status active
  ${APP_NAME} prompt create "飞书 PRD" --type prd --file template.njk --description "飞书文档 PRD 模板"
  ${APP_NAME} prompt list --type prd
  ${APP_NAME} prompt get prd-feishu
  ${APP_NAME} prompt render prd-feishu --vars '{"game_name":"示例项目","version":"V0.1"}'
  ${APP_NAME} prompt update prd-feishu --file new-template.njk
  ${APP_NAME} prompt versions prd-feishu
  ${APP_NAME} prompt delete prd-feishu
  ${APP_NAME} project list --status visible
  ${APP_NAME} project add my-app --name "My App" --status active --type tool
  ${APP_NAME} dispatch --project ai-memory-hub
  ${APP_NAME} dispatch --to codex --run
  ${APP_NAME} dispatch --to codex --run --model gpt-5.2
  ${APP_NAME} dispatch --to codex --run --isolate-worktree
  ${APP_NAME} dispatch status --thread <thread-id> --project ai-memory-hub
  ${APP_NAME} dispatch status --recent 10 --project ai-memory-hub
  ${APP_NAME} dispatch status --recent --state failed --to claude
  ${APP_NAME} dispatch progress --thread-key codex:ai-memory-hub:<ref> --percent 40 --status "working" --by codex
  ${APP_NAME} dispatch retry --project ai-memory-hub --to qclaw --run --limit 1
  ${APP_NAME} checkpoint status
  ${APP_NAME} checkpoint show
  ${APP_NAME} checkpoint reset
  ${APP_NAME} task-spec list
  ${APP_NAME} task-spec validate
  ${APP_NAME} task-spec run test
  ${APP_NAME} health
  ${APP_NAME} pull
  ${APP_NAME} backup --reason manual
  ${APP_NAME} backup list --limit 20
  ${APP_NAME} backup prune --daily 7 --weekly 4 --pre-sync 20 --apply
  ${APP_NAME} backup status
  ${APP_NAME} backup run --no-push
  ${APP_NAME} watch --interval-ms 30000
  ${APP_NAME} daemon status
  ${APP_NAME} daemon --project ai-memory-hub --isolate-worktree
  ${APP_NAME} daemon --project ai-memory-hub --interval-ms 10000
  ${APP_NAME} app --port 38787
  ${APP_NAME} install --tool codex
  ${APP_NAME} install --tool codex --apply
  ${APP_NAME} install --local --apply
`);
}
