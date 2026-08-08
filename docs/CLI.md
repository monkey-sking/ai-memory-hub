# AI Memory Hub - CLI Commands Reference

Complete reference for all `ai-memory-hub` command-line commands.

## Table of Contents

- [Core Commands](#core-commands)
- [Memory Management](#memory-management)
- [Message Bus (Radio)](#message-bus-radio)
- [Task Management](#task-management)
- [Workflow System](#workflow-system)
- [Project Registry](#project-registry)
- [Session Management](#session-management)
- [RPC Communication](#rpc-communication)
- [Notifications](#notifications)
- [Context Packs](#context-packs)
- [Project Task Specs](#project-task-specs)
- [Shared Skill Layer](#shared-skill-layer)
- [Capability Registry](#capability-registry)
- [Runner Doctor](#runner-doctor)
- [Dispatch Relay](#dispatch-relay)
- [Dispatch Queue](#dispatch-queue)
- [Workflow Recipes](#workflow-recipes)
- [Metrics](#metrics)
- [System Commands](#system-commands)

---

## Core Commands

### `init`

Initialize the AI Memory Hub directory structure.

```bash
ai-memory-hub init
```

Creates `~/.ai-memory/` with all necessary subdirectories and default configuration.

### `status`

Display comprehensive hub status.

```bash
ai-memory-hub status
```

Shows:
- Memory directory path
- Pending events
- Synced event count
- Ledger events
- Index statistics
- Radio messages
- Task counts by status
- Workflow counts
- Relay thread status
- Lock status
- Tool summary
- Capability summary
- Connected tools

### `sync`

Synchronize inbox events to memory ledger.

```bash
ai-memory-hub sync
```

Processes events from `inbox/events.jsonl` and updates the memory system. It also rebuilds event-sourced task, workflow, and project projections from `tasks/events.jsonl`, `workflows/events.jsonl`, and `projects/events.jsonl`.

### `resolve`

Resolve an instruction include or file name from local paths and shared memory.

```bash
ai-memory-hub resolve "@RTK.md"
ai-memory-hub resolve "@RTK.md" --from ~/.codex/AGENTS.md
ai-memory-hub resolve "@RTK.md" --plain
```

The command checks direct paths, paths relative to `--from`, common tool
configuration directories, and filesystem paths mentioned in indexed memories.
Use it when an instruction file contains an include such as `@RTK.md` but the
relative file is missing.

### `update`

Check for updates or update to the latest version.

```bash
# Check if updates available
ai-memory-hub update --check

# Update to latest version
ai-memory-hub update

# Force update (discard local changes)
ai-memory-hub update --force
```

**Options:**
- `--check` - Check for updates without applying
- `--force` - Discard local changes and update

---

## Memory Management

### `memory search`

Search through memory index.

```bash
ai-memory-hub search [query] [--limit <n>] [--project <name>] [--tag <tag>|--tags <a,b>] [--thread <id>] [--task <id>] [--workflow <id>] [--radio <id>]
ai-memory-hub memory search [query] [--limit <n>] [--project <name>] [--tag <tag>|--tags <a,b>]
```

**Examples:**
```bash
ai-memory-hub search "git commit rules"
ai-memory-hub search "project setup" --limit 10
ai-memory-hub search "dispatch" --project ai-memory-hub --tag workflow
ai-memory-hub memory search --tags relay,review --project ai-memory-hub
ai-memory-hub search "relay lifecycle" --thread relay-lifecycle-2026-06-09
ai-memory-hub search --thread relay-lifecycle-2026-06-09
ai-memory-hub search "review result" --task task-relay --project ai-memory-hub
```

Search reads the rebuilt memory index and can filter by thread-aware references
stored in `refs.thread`, `refs.taskId`, `refs.workflowId`, and `refs.radioId`.
It can also filter by normalized project and tags. Multiple tags are treated as
an AND filter. Plain text search still works without any filters. If a filter is
provided without a query, search returns the newest matching records.

### `memory snapshot`

Print a filtered memory snapshot view to stdout without rewriting `MEMORY.md`.

```bash
ai-memory-hub snapshot [--limit <n>] [--project <name>] [--tag <tag>|--tags <a,b>]
ai-memory-hub memory snapshot [--limit <n>] [--project <name>] [--tag <tag>|--tags <a,b>]
```

**Options:**
- `--limit` - Maximum number of records in snapshot (default: 40)
- `--project` - Include only memories for a normalized project
- `--tag` / `--tags` - Include only memories matching all requested tags

### `memory op`

Lifecycle edits use append-only memory operations instead of editing
`memories/ledger.jsonl` directly.

```bash
ai-memory-hub memory op create --action annotate --record <id> --reason manual-review --patch @patch.json --by codex
ai-memory-hub memory op list --record <id>
ai-memory-hub memory op apply --dry-run
```

`apply` rebuilds derived indexes and snapshots; `--dry-run` reports projected
counts without writing them. Ledger records are never rewritten.

See [memory-lifecycle.md](memory-lifecycle.md) for the operation event schema,
supported actions, and API shape.

---

## Message Bus (Radio)

### `radio send`

Send a message to other tools.

```bash
ai-memory-hub radio send <text> --from <tool> --to <target> --type <type> [options]
```

**Required:**
- `<text>` - Message content
- `--from <tool>` - Sender tool name
- `--to <target>` - Target tool or "all"
- `--type <type>` - Message type: note, request, review, status, handoff

**Optional:**
- `--project <name>` - Project context
- `--thread <id>` - Thread ID for conversation
- `--reply-to <id>` - ID of message being replied to

**Examples:**
```bash
# Broadcast notification
ai-memory-hub radio send "Task completed" --from claude --to all --type note

# Request review
ai-memory-hub radio send "Please review PR #123" --from claude --to codex --type review --project my-app

# Status update
ai-memory-hub radio send "Working on feature X" --from claude --to all --type status --project my-app
```

### `radio list`

List recent radio messages.

```bash
ai-memory-hub radio list [--limit <n>] [--project <name>]
```

**Options:**
- `--limit <n>` - Number of messages to show (default: 20)
- `--project <name>` - Filter by project

### `radio mark-delivered`

Mark a message as delivered.

```bash
ai-memory-hub radio mark-delivered --id <message-id>
```

---

## Task Management

### `task add`

Create a new task.

```bash
ai-memory-hub task add <title> --from <tool> [options]
```

**Required:**
- `<title>` - Task title
- `--from <tool>` - Creator tool name

**Optional:**
- `--description <text>` - Detailed description
- `--project <name>` - Project name
- `--priority <level>` - Priority: low, normal, high, urgent (default: normal)
- `--handoff <text>` - Handoff notes

**Examples:**
```bash
# Simple task
ai-memory-hub task add "Fix login bug" --from claude --priority high

# Detailed task
ai-memory-hub task add "Implement user dashboard" \
  --from claude \
  --project web-app \
  --priority high \
  --description "Create responsive dashboard with charts" \
  --handoff "Backend API ready, need frontend implementation"
```

### `task list`

List tasks.

```bash
ai-memory-hub task list [--status <status>] [--project <name>] [--all]
```

**Options:**
- `--status <status>` - Filter by status: open, claimed, in_progress, blocked, done, cancelled, active
- `--project <name>` - Filter by project
- `--all` - Include cancelled tasks when listing all statuses

**Examples:**
```bash
# All active tasks
ai-memory-hub task list --status active

# Project-specific tasks
ai-memory-hub task list --project my-app

# Open tasks
ai-memory-hub task list --status open

# Include cancelled tasks in an all-status audit
ai-memory-hub task list --status all --all
```

`cancelled` is a normal terminal state. It is hidden from default task list
views to keep active work readable, but it remains queryable with
`--status cancelled` or `--status all --all`.

### `task claim`

Claim a task.

```bash
ai-memory-hub task claim --id <task-id> --by <tool>
```

### `task done`

Mark task as completed.

```bash
ai-memory-hub task done --id <task-id> --by <tool>
```

### `task note`

Add a note to a task.

```bash
ai-memory-hub task note --id <task-id> <note-text> --by <tool>
```

**Example:**
```bash
ai-memory-hub task note --id abc123 "Completed UI, starting tests" --by claude
```

---

## Workflow System

### `workflow create`

Create a new workflow.

```bash
ai-memory-hub workflow create <title> --from <tool> [options]
```

**Required:**
- `<title>` - Workflow title
- `--from <tool>` - Creator tool

**Optional:**
- `--project <name>` - Project name
- `--priority <level>` - Priority level
- `--planner <tool>` - Planner role assignment
- `--executor <tool>` - Executor role assignment
- `--reviewer <tool>` - Reviewer role assignment
- `--observer <tool>` - Observer role assignment
- `--plan <text>` - Initial plan
- `--acceptance <text>` - Acceptance criteria
- `--spawn-tasks` - Automatically create tasks for each role
- `--notify` - Send radio notifications

**Example:**
```bash
ai-memory-hub workflow create "Implement authentication" \
  --from claude \
  --project web-app \
  --planner claude \
  --executor codex \
  --reviewer gemini \
  --plan "Design OAuth flow, implement backend, review security" \
  --spawn-tasks \
  --notify
```

### `workflow list`

List workflows.

```bash
ai-memory-hub workflow list [--status <status>] [--project <name>]
```

**Options:**
- `--status <status>` - Filter by status: open, in_progress, review, blocked, done, cancelled
- `--project <name>` - Filter by project

### `workflow start`

Start a workflow.

```bash
ai-memory-hub workflow start --id <workflow-id> --by <tool>
```

### `workflow result`

Report execution result.

```bash
ai-memory-hub workflow result --id <workflow-id> --role <role> <result> --by <tool>
```

**Roles:** executor, planner, reviewer, observer

**Example:**
```bash
ai-memory-hub workflow result --id xyz789 --role executor "Implemented OAuth, all tests passing" --by codex
```

### `workflow review`

Add review feedback.

```bash
ai-memory-hub workflow review --id <workflow-id> --role <role> <feedback> --by <tool>
```

### `workflow signal`

Send signal to workflow participant.

```bash
ai-memory-hub workflow signal --id <workflow-id> --to <target> <message> --by <tool>
```

### `workflow done`

Complete a workflow.

```bash
ai-memory-hub workflow done --id <workflow-id> --by <tool>
```

---

## Project Registry

Project metadata is appended to `projects/events.jsonl`; `projects/projects.jsonl` is a rebuilt compatibility projection. The dashboard project selectors use the registry and hide `archived` and `test-*` projects by default.

For the data model, API endpoints, dashboard behavior, and AI tool guidance, see [Project Registry](project-registry.md).

### `project list`

List registered projects.

```bash
ai-memory-hub project list [--status visible|active|planning|paused|archived|all] [--include-hidden]
```

### `project add`

Create a project record.

```bash
ai-memory-hub project add <id> --name <name> [--status active] [--type tool] [--description text]
```

Useful resource options:

```bash
ai-memory-hub project add sample-media --name "sample-project" --type game --feishu <url> --repo <local-repo-path>
```

### `project update`

Update project metadata.

```bash
ai-memory-hub project update <id-or-alias> [--name text] [--display-name text] [--status paused] [--type game] [--description text]
```

### `project show`

Resolve a project by id, name, display name, or alias.

```bash
ai-memory-hub project show <id-or-alias>
```

### `project alias`

Add an alias.

```bash
ai-memory-hub project alias <id-or-alias> <alias>
```

### `project relate`

Record project relationships such as reskins, forks, or sequels.

```bash
ai-memory-hub project relate <id-or-alias> --based-on <parent-id> --relation reskin
```

### `project archive`

Soft-delete a project by moving it to `archived`.

```bash
ai-memory-hub project archive <id-or-alias> --by <tool>
```

### `project migrate`

Ensure seed projects are present.

```bash
ai-memory-hub project migrate          # preview
ai-memory-hub project migrate --apply  # write missing seed projects
```

---

## Session Management

### `session create`

Create a new session.

```bash
ai-memory-hub session create --title <title> --from <tool> [options]
```

**Required:**
- `--title <title>` - Session title
- `--from <tool>` - Creator tool

**Optional:**
- `--project <name>` - Project context
- `--participants <list>` - Comma-separated participant tools
- `--context <text>` - Initial context

**Example:**
```bash
ai-memory-hub session create \
  --title "Code review session" \
  --from claude \
  --project web-app \
  --participants claude,codex,gemini \
  --context "Reviewing authentication implementation"
```

### `session list`

List sessions.

```bash
ai-memory-hub session list [--active] [--project <name>]
```

**Options:**
- `--active` - Show only active sessions (last 2 hours)
- `--project <name>` - Filter by project

### `session update`

Update session context.

```bash
ai-memory-hub session update --id <session-id> --context <text>
```

---

## RPC Communication

### `rpc send`

Send an RPC request.

```bash
ai-memory-hub rpc send --to <tool> --method <name> --params <json>
```

**Required:**
- `--to <tool>` - Target tool
- `--method <name>` - Method name
- `--params <json>` - JSON parameters

**Example:**
```bash
ai-memory-hub rpc send \
  --to codex \
  --method "analyzeCode" \
  --params '{"file":"src/app.js","checks":["security","performance"]}'
```

### `rpc pending`

List pending RPC requests.

```bash
ai-memory-hub rpc pending --to <tool>
```

### `rpc respond`

Respond to an RPC request.

```bash
ai-memory-hub rpc respond --id <request-id> --result <json>
```

---

## Notifications

### `notify send`

Send a notification.

```bash
ai-memory-hub notify send --severity <level> --message <text> [options]
```

**Required:**
- `--severity <level>` - Severity: info, warning, error, critical, need_input
- `--message <text>` - Notification message

**Optional:**
- `--title <text>` - Notification title
- `--channels <list>` - Comma-separated channels
- `--from <tool>` - Sender tool
- `--project <name>` - Project context

**Example:**
```bash
ai-memory-hub notify send \
  --severity error \
  --title "Build Failed" \
  --message "Tests failed in authentication module" \
  --channels console,telegram \
  --project web-app
```

### `notify pending`

List pending notifications.

```bash
ai-memory-hub notify pending
```

### `notify deliver`

Mark notification as delivered.

```bash
ai-memory-hub notify deliver --id <notification-id> --channels <list>
```

---

## Context Packs

### `context create`

Create a context pack.

```bash
ai-memory-hub context create [options]
```

**Options:**
- `--task <id>` - Task ID
- `--workflow <id>` - Workflow ID
- `--project <name>` - Project name
- `--query <text>` - Search query for relevant memories

**Example:**
```bash
# Context for a task
ai-memory-hub context create --task abc123 --project web-app

# Context from search
ai-memory-hub context create --query "authentication setup" --project web-app
```

### `context list`

List context packs.

```bash
ai-memory-hub context list
```

### `context show`

Show context pack details.

```bash
ai-memory-hub context show <pack-id>
```

---

## Project Task Specs

Project task specs declare repeatable local project commands, similar in spirit
to `.it-runner` task files. By default the CLI looks for `.tasks.json`,
`task-specs.json`, then `.ai-memory/task-specs.json` in the current project
root. Use `.tasks.json` for committed project defaults; use the ignored
`.ai-memory/task-specs.json` path for personal overrides.

### Spec shape

```json
{
  "version": "1.0",
  "tasks": [
    {
      "id": "test",
      "title": "Run test suite",
      "command": "npm",
      "windowsCommand": "npm.cmd",
      "args": ["test"],
      "cwd": ".",
      "timeoutMs": 120000,
      "env": {},
      "ports": [],
      "resources": ["src/index.js", "tests/"],
      "logs": {
        "stdout": "logs/test.stdout.log",
        "stderr": "logs/test.stderr.log"
      },
      "verify": [
        {
          "command": "node",
          "args": ["--check", "src/index.js"]
        }
      ]
    }
  ]
}
```

`tasks` may also be an object keyed by task id. Commands run without a shell by
default. On Windows, `.cmd`/`.bat` shims are automatically launched through the
native shell when needed. `cwd` and log paths must stay inside the project root
unless `--allow-outside-cwd` is passed to `run`.

### `task-spec list`

List declared project commands.

```bash
ai-memory-hub task-spec list
ai-memory-hub task-spec list --file path/to/tasks.json
```

### `task-spec show`

Show one normalized task spec.

```bash
ai-memory-hub task-spec show test
```

### `task-spec validate`

Validate the task spec file without running commands.

```bash
ai-memory-hub task-spec validate
```

### `task-spec run`

Run a declared command and its optional `verify` commands. Output is structured
JSON containing command metadata, exit status, duration, trimmed stdout/stderr,
and configured log paths.

```bash
ai-memory-hub task-spec run test
ai-memory-hub task-spec run test --no-verify
```

---

## Shared Skill Layer

The Shared Skill Layer is the common instruction contract rendered into
tool-native adapters. It is marked by `AI_MEMORY_HUB_SHARED_SKILL_LAYER v1` and
defines how tools read startup memory, resolve missing includes such as
`@RTK.md`, write durable memory events, use tasks/workflows for active work, and
send risks or review requests through radio.

The same contract is installed into direct instruction files for `codex`,
`claude`, and `gemini`, native skill files for `qclaw`, `openclaw`,
`opencode`, and the Marvis integration skill. Repo-local instructions,
project docs, `.tasks.json`, and recipe gates act as the project-level overlay.

```bash
ai-memory-hub install --tool qclaw
ai-memory-hub install --tool opencode
ai-memory-hub install --tool codex --apply
ai-memory-hub install --local --tool codex --apply
ai-memory-hub detect
ai-memory-hub connect status
```

`detect` and `connect status` include `skillLayer`, `skillLayerVersion`, and
`skillLayerStatus` so legacy shared-memory snippets can be distinguished from
current shared skill adapters. See
[Shared Skill Layer](shared-skill-layer.md) for the memory/skill/task/workflow
and radio boundaries.

### Skill classification

`skill list` now returns a `classification` object for every discovered Skill.
The classifier keeps legacy Skills compatible (they default to `capability`) and
recognizes explicit frontmatter fields:

```yaml
---
type: agent        # agent | project | capability | integration | workflow | package
owner: codex
scope: global      # global | project | task
status: active     # active | outdated | conflict | disabled
targets: codex
---
```

The classification is metadata for routing, lifecycle checks, and relations; it
does not copy Skill content into memory or execute package code. Integration
Skills such as Feishu/Lark and GitHub are classified by their explicit type or
known provider prefix. The pure classifier is also available to integrations as
`classifySkill()` from `src/skill-registry.js`.

---

## Capability Registry

### `capabilities`

Print the cross-tool capability registry used by automation, review, and
dashboard code. The registry is derived from tool detection, runner profiles,
shared skill install state, and dispatch metrics.

```bash
ai-memory-hub capabilities
ai-memory-hub capabilities --tool claude
ai-memory-hub capabilities --refresh
```

The output includes:
- `summary.directCliProfiles` and `summary.autoDispatch`
- gateway and CDP adapter candidates
- each tool's `capability.integrationMode`
- conservative `permissions` guardrails
- `health.status` for ready, adapter-needed, candidate, or missing states

`ai-memory-hub status` includes `capabilitySummary`. The dashboard server exposes
the same model through `GET /api/capabilities`, and `/api/tools` attaches each
tool's `capability`, `permissions`, and `health` objects. See
[Capability Registry](capability-registry.md) for the data model and safety
policy.

---

## Runner Doctor

### `doctor`

Inspect AI tool runner compatibility without reading raw PATH or dispatch logs by hand. This is the quickest way to diagnose Windows shim, PowerShell, stdin, and per-tool CLI issues.

```bash
# Inspect every known runner profile
ai-memory-hub doctor

# Inspect one tool
ai-memory-hub doctor --tool claude

# Run optional non-model probes such as --help
ai-memory-hub doctor --tool gemini --run-probes
```

**Options:**
- `--tool <name>` - Limit output to one tool
- `--run-probes` - Execute optional non-model probes such as `--help`
- `--skip-version` - Skip the default version probe
- `--timeout-ms <n>` - Probe timeout in milliseconds (default: 5000)

Doctor reports:
- whether the tool is directly runnable or shared-state-only
- resolved command path and shim kind (`.exe`, `.cmd`, `.ps1`, native)
- prompt mode (`stdin` vs argv)
- output mode and session-resume capability
- installed shared skill layer status and version
- stderr warnings separated from actionable errors

On Windows, runner profiles prefer `.cmd` or `.exe` shims over `.ps1`. Dispatch prompt payloads are sent over stdin so long prompts and JSON are not embedded in PowerShell or cmd command text. Claude Code 2.x uses `claude -p -` so the print command reads the prompt from stdin explicitly; when installed through npm, the runner derives and prefers the underlying `claude.exe` next to `claude.cmd`.

---

## Dispatch Relay

### `dispatch`

Preview or run dispatchable radio messages and assigned tasks for verified tool runners.

```bash
# Preview jobs
ai-memory-hub dispatch --to codex --project ai-memory-hub --limit 5

# Run jobs
ai-memory-hub dispatch --run --to claude --project ai-memory-hub --limit 1
```

**Options:**
- `--run` - Execute matching jobs instead of previewing
- `--force` - Ignore previous successful dispatch logs
- `--to <tool>` - Target tool
- `--project <name>` - Project filter
- `--limit <n>` - Maximum jobs
- `--respect-recipe-dependencies` - Hold recipe step tasks until their
  `recipeStep.dependsOn` tasks are done or completed
- `--isolate-worktree` - Run each executed job in its own Git worktree and
  branch instead of the current working tree
- `--worktree-root <dir>` - Directory for isolated worktrees (default:
  `.ai-worktrees` under the repository root)

Direct dispatch only runs radio messages addressed to a concrete tool such as `codex`, `gemini`, or `claude`, plus assigned tasks. Radio broadcasts addressed to `all` stay in shared state for tools to poll or reply to, but the daemon does not fan them out into automatic CLI execution. This keeps coordination notes from being retried as stale work.

Every runner prompt includes autonomous safety rules: follow the current user/project guardrails, do not run `git push`, delete files, run destructive cleanup, install dependencies, or change system configuration unless the dispatch payload explicitly authorizes it. If the source task or workflow has a `qualityGate`, the prompt also includes its review requirement, max repair attempts, stop conditions, allowed/forbidden actions, and verification commands. Local commits are allowed only when user/project rules allow them and verification has passed.

When `--isolate-worktree` is enabled, AMH creates or reuses a deterministic
branch such as `amh/<tool>/<project>/<ref>` and runs the tool from the matching
worktree path. The prompt tells the runner to keep that branch and worktree for
review; AMH does not merge, delete, or push it automatically.

Each executed runner also writes a structured run record to `state/dispatch-runs.jsonl` and raw output logs under `dispatch-runs/`. The record includes `runId`, source task/radio/workflow, command metadata, `cwd`, start/end time, duration, exit code, stdout/stderr log paths, status, error summary, verification result, and when enabled, worktree metadata including path, branch, base/head commits, dirty status, and diff stat.

Successful task dispatches are marked `done` and receive a task note with the response summary. If the task is linked from a workflow, the workflow delivery fields are aggregated from its linked tasks, including progress percent/status and response/status radio IDs. Failed or timed-out dispatches keep the task open, write a diagnostic note, and surface the failing state on linked workflows.

### `dispatch status`

Inspect relay state by thread, source reference, or recent relay entries.

```bash
ai-memory-hub dispatch status --recent 10 --project ai-memory-hub
ai-memory-hub dispatch status --ref-id <task-radio-or-workflow-id>
ai-memory-hub dispatch status --thread-key claude:ai-memory-hub:<ref>
```

Single-source lookups resolve task, radio, and workflow relay sources. Workflow status results include linked tasks in `related.tasks`, so a workflow-level status check shows the current source plus the work items driving its delivery state. Status output also includes `summary.latestRunId`, latest run status/exit metadata, `summary.latestWorktree`, and `runHistory` entries pointing to the raw output log files.

### `dispatch progress`

Record a heartbeat/progress update for an existing dispatch thread. This keeps long-running work visible without marking the task complete.

```bash
ai-memory-hub dispatch progress --thread-key codex:ai-memory-hub:<ref> --percent 40 --status "working" --by codex
ai-memory-hub dispatch progress --ref-id <task-or-radio-id> --to gemini --project ai-memory-hub --status "reviewing tests"
```

**Options:**
- `--thread-key <tool:project:ref>` - Exact relay thread key
- `--ref-id <id>` - Task or radio ID when thread key is not known
- `--thread <id>` - Dispatch thread ID
- `--to <tool>` / `--project <name>` - Narrow the target lookup
- `--percent <0-100>` - Optional progress percent
- `--status <text>` - Short progress text
- `--by <tool>` - Reporter name

Progress entries appear as `progress` in `dispatch status`, `metrics`, and the dashboard dispatch panel. Heartbeats update the timeout base via `progressAt`, but they do not mark tasks `done`.

### `dispatch retry`

Retry failed relay jobs whose `nextRetryAt` is due. With `--run`, this also scans latest relay states for stale `dispatched`, `acked`, `progress`, or `retrying` entries and marks them `failed` or `abandoned` when `ackTimeout` has elapsed. Broadcast radio messages are not retried through direct CLI runners; convert them into targeted radio messages or assigned tasks when executable follow-up is needed. Relays whose source task, workflow, radio message, or linked radio thread is already completed, delivered, done, cancelled, or blocked are skipped instead of resurrected as stale work.

```bash
ai-memory-hub dispatch retry --run --project ai-memory-hub
```

Use `--respect-recipe-dependencies` to apply the same recipe step dependency
filter that the daemon uses. Use `--isolate-worktree` and `--worktree-root` on
retry runs when failed repair attempts should continue in isolated workspaces.

Timed-out entries use `progressAt` first, then `dispatchedAt`, `deliveryUpdatedAt`, `ts`, or `updatedAt` as the fallback timeout base. Timeout failures become visible in `dispatch status`, `metrics`, task notes, and the dashboard dispatch panel.

---

## Dispatch Queue

### `queue add`

Add entry to dispatch queue.

```bash
ai-memory-hub queue add --tool <tool> [options]
```

**Required:**
- `--tool <tool>` - Target tool

**Optional:**
- `--task <id>` - Task ID
- `--workflow <id>` - Workflow ID
- `--radio <id>` - Radio message ID
- `--priority <level>` - Priority: low, normal, high, urgent (default: normal)
- `--timeout <ms>` - Timeout in milliseconds (default: 30000)
- `--max-retries <n>` - Maximum retry attempts (default: 3)

**Example:**
```bash
ai-memory-hub queue add \
  --tool codex \
  --task abc123 \
  --priority high \
  --timeout 60000
```

### `queue list`

List queued entries (priority-sorted).

```bash
ai-memory-hub queue list
```

### `queue running`

List running entries.

```bash
ai-memory-hub queue running
```

### `queue failed`

List failed entries.

```bash
ai-memory-hub queue failed
```

### `queue start`

Mark queue entry as running.

```bash
ai-memory-hub queue start <entry-id>
```

### `queue complete`

Mark queue entry as completed.

```bash
ai-memory-hub queue complete <entry-id>
```

### `queue fail`

Mark queue entry as failed (with retry logic).

```bash
ai-memory-hub queue fail <entry-id> [--error <message>]
```

**Example:**
```bash
ai-memory-hub queue fail xyz789 --error "Connection timeout"
```

---

## Workflow Recipes

### `recipe list`

List available workflow recipes.

```bash
ai-memory-hub recipe list
```

Shows all JSON recipe templates in `~/.ai-memory/recipes/`.
The list also includes built-in templates from the repository `recipes/`
directory. User templates with the same recipe `name` override built-ins.

### `recipe show`

Display recipe details.

```bash
ai-memory-hub recipe show <recipe-name>
```

**Example:**
```bash
ai-memory-hub recipe show implement-and-review
```

### `recipe validate`

Validate a recipe.

```bash
ai-memory-hub recipe validate <recipe-name>
```

Checks:
- Required fields (name, title, roles, steps)
- Role references in steps
- Dependency references
- Machine-readable gate field types (`verifyCommands`, `reviewRequired`,
  `maxRepairAttempts`, `stopWhen`, `allowedActions`, `forbiddenActions`)
  - `verifyCommands` may contain command strings or command objects with `id`,
    `source`, `command`, `args`, `cwd`, `timeoutMs`, `required`, and
    `description`.

### `recipe create`

Create workflow from recipe.

```bash
ai-memory-hub recipe create --recipe <name> --tools <mapping> [options]
```

**Required:**
- `--recipe <name>` - Recipe name
- `--tools <mapping>` - Role-to-tool mapping: `role1:tool1,role2:tool2`

**Optional:**
- `--project <name>` - Project name
- `--var <key>=<value>` - Variable assignment (can repeat)

Generated workflows preserve recipe metadata and top-level `qualityGate` data.
Generated tasks preserve `recipe`, `recipeStep`, and the effective
`qualityGate` after applying step overrides. This lets daemon/dashboard code use
recipe gates without parsing natural-language task text.

**Example:**
```bash
ai-memory-hub recipe create \
  --recipe implement-and-review \
  --tools planner:claude,executor:codex,reviewer:gemini \
  --project web-app \
  --var feature="user-dashboard" \
  --var priority=high
```

**Built-in Recipes:**

#### `frontend-feature`
- **Roles:** planner, executor, reviewer
- **Steps:** 6 (requirements -> codebase analysis -> design -> implementation -> quality fix -> review)
- **Use:** UI work with explicit responsive, accessibility, and browser-verification gates

#### `backend-service`
- **Roles:** planner, executor, reviewer
- **Steps:** 6 (requirements -> codebase analysis -> task decomposition -> implementation -> quality fix -> review)
- **Use:** API, CLI, persistence, and automation changes with contract checks

#### `fullstack-feature`
- **Roles:** planner, executor, reviewer, observer
- **Steps:** 7 (requirements -> system analysis -> design doc -> task decomposition -> implementation -> quality fix -> review)
- **Use:** End-to-end changes spanning UI, API, state, docs, and cross-agent handoffs

#### `lights-out-local`
- **Roles:** planner, executor, reviewer, observer
- **Steps:** 7 (guardrails/scope -> loop plan -> implementation -> verification -> review -> repair loop -> final verification/closure)
- **Use:** Local unattended Loop Engineering where local commits may be allowed by current guardrails, while push, deletion, dependency install, and system configuration stop for fresh human approval
- **Gate:** `reviewRequired: true`, bounded repair attempts, default local
  verification commands, and explicit allowed/forbidden actions

See [Development Recipe Packs](development-recipe-packs.md) for the design
rules, stop points, and structured result expectations behind these templates.

---

## Metrics

### `metrics`

Display operational metrics.

```bash
ai-memory-hub metrics
```

Shows:
- **Task metrics:** total, by status, by tool, average duration
- **Workflow metrics:** total, by status, average duration
- **Relay metrics:** total, by status, success rate
- **Queue metrics:** total, queued, running, failed
- **Recent failures:** last 10 failures with error messages

**Example output:**
```json
{
  "tasks": {
    "total": 133,
    "byStatus": {"done": 98, "open": 21, ...},
    "byTool": {"claude": 40, "codex": 60, ...},
    "avgDurationMs": 11390161,
    "avgDurationHuman": "3.2h"
  },
  "workflows": {...},
  "relay": {...},
  "queue": {...},
  "recentFailures": [...]
}
```

---

## System Commands

### `connect`

Check tool connections or send handoff messages.

```bash
# Check status
ai-memory-hub connect status

# Send request
ai-memory-hub connect request --from <tool> --to <tool> --text <message> [--task] [--project <name>]

# Send review request
ai-memory-hub connect review --from <tool> --to <tool> --text <message> [--task] [--project <name>]

# Send handoff
ai-memory-hub connect handoff --from <tool> --to <tool> --text <message> [--task] [--project <name>]
```

**Options:**
- `--task` - Also create a task for the target tool
- `--project <name>` - Project context

### `detect`

Detect installed AI tools.

```bash
ai-memory-hub detect
```

Scans for Claude, Codex, Gemini, QClaw, OpenClaw, Marvis, and other supported tools.

### `install`

Show or apply tool integration instructions. Applying an adapter also refreshes
the AMH-managed Shared Skill Layer block when its rendered content is stale.
Only that marked block is replaced; tool-specific and user-authored content
outside the block is preserved.

```bash
# Preview instructions
ai-memory-hub install --tool <tool-name>

# Apply instructions
ai-memory-hub install --tool <tool-name> --apply
```

**Supported tools:**
- `claude`, `codex`, `gemini` - Direct instruction injection
- `qclaw`, `openclaw`, `opencode` - Native skill installation
- `marvis` - Desktop assistant integration skill
- Others - Adapter notes

All rendered adapters include the shared skill layer marker and can be checked
with `ai-memory-hub detect` or `ai-memory-hub doctor --tool <tool-name>`.
The install preview reports `new`, `missing`, `stale`, `current`, or `malformed`
for the managed block. A malformed block is left untouched for manual repair.

### `backup`

Create local hub backups, inspect/prune retention, and manage optional GitHub
data backups.

```bash
# Local filesystem backups
ai-memory-hub backup [--reason <text>]
ai-memory-hub backup --reason "before-major-refactor"
ai-memory-hub backup list --limit 20
ai-memory-hub backup prune --daily 7 --weekly 4 --pre-sync 20 [--apply]

# GitHub data backup configuration and execution
ai-memory-hub backup status
ai-memory-hub backup configure \
  --enabled \
  --remote-url "https://github.com/<owner>/<repo>.git" \
  --repo-dir "%USERPROFILE%\.ai-memory-github-backup" \
  --branch main
ai-memory-hub backup run [--no-push] [--dry-run] [--reason <text>]
ai-memory-hub backup configure --allow-plaintext-sensitive
ai-memory-hub backup configure --block-plaintext-sensitive

# Windows Scheduled Task management
ai-memory-hub backup schedule status
ai-memory-hub backup schedule install --time 03:30 [--dry-run]
ai-memory-hub backup schedule uninstall
```

GitHub backups export a snapshot repo containing `README.md`,
`manifest.json`, and `snapshot/`. The default include list excludes
`config.json` because configuration may contain local paths or private remote
URLs. Include configuration only by explicit operator choice.

Backups are intended for full restore. `backup run --no-push` writes a complete
local snapshot even when user data contains private URLs, local paths, or other
restore-critical values.

Before a plaintext GitHub push, AMH scans selected files for credential-shaped
values, local absolute paths, and known internal URL shapes. If anything is
found, the push is blocked by default so private data is not uploaded by
accident. Use `backup configure --allow-plaintext-sensitive` only when the
remote is approved for plaintext private backup data. `--dry-run` performs the
same scan and reports `wouldBlockPush` without writing backup state.

### `watch`

Start background watcher for automatic syncing.

```bash
ai-memory-hub watch [--interval-ms <ms>]
```

**Options:**
- `--interval-ms <ms>` - Check interval in milliseconds (default: 30000)

### `daemon`

Start the local dispatch daemon. It checks verified runners (`codex`, `gemini`, `claude`), marks stale relay entries timed out, retries due failures, and dispatches new matching tasks or radio messages. Daemon dispatch uses `--respect-recipe-dependencies` semantics by default, so recipe-generated steps do not run before their declared dependencies complete.

```bash
ai-memory-hub daemon [--interval-ms <ms>] [--project <name[,name]>] [--limit <n>]
ai-memory-hub daemon status
```

**Options:**
- `--interval-ms <ms>` - Loop interval in milliseconds (default: 10000)
- `--project <name[,name]>` - Optional project filter list
- `--limit <n>` - Maximum jobs per tool/project per cycle (default: 10)
- `--force` - Start even when local daemon metadata says a daemon is already running
- `--isolate-worktree` - Run daemon-dispatched jobs in per-job Git worktrees
- `--worktree-root <dir>` - Directory for daemon worktrees (default:
  `.ai-worktrees` under the repository root)

The daemon writes runtime metadata to:
- `state/daemon.pid`
- `state/daemon-status.json`

Use `ai-memory-hub daemon status` to inspect whether the recorded process is running, stale, stopped, or missing. Use `Ctrl+C` or send `SIGTERM` to stop the daemon cleanly; shutdown updates `daemon-status.json` and removes the PID file when it belongs to the current daemon process.

For recipe-generated lights-out work, the daemon passes `qualityGate` details
into runner prompts and uses `qualityGate.maxRepairAttempts` as the relay retry
limit. Tasks that are `blocked`, `cancelled`, `done`, or already completed are
not automatically resurrected by retries.

### `app`

Start local dashboard web server.

```bash
ai-memory-hub app [--port <port>]
```

**Options:**
- `--port <port>` - Port number (default: 38787)

**Example:**
```bash
ai-memory-hub app --port 8080
```

Then open `http://127.0.0.1:8080`

---

## Common Usage Patterns

### Pattern 1: Solo Task Flow

```bash
# 1. Create task
ai-memory-hub task add "Implement feature X" --from claude --priority high

# 2. Start work
ai-memory-hub task claim --id <id> --by claude

# 3. Add notes during work
ai-memory-hub task note --id <id> "UI complete, starting backend" --by claude

# 4. Complete
ai-memory-hub task done --id <id> --by claude
```

### Pattern 2: Multi-Tool Collaboration

```bash
# 1. Create workflow with recipe
ai-memory-hub recipe create \
  --recipe implement-and-review \
  --tools planner:claude,executor:codex,reviewer:gemini \
  --project my-app

# 2. Each tool works on their part
ai-memory-hub workflow result --id <id> --role executor "Implementation done" --by codex

# 3. Review
ai-memory-hub workflow review --id <id> --role reviewer "LGTM" --by gemini

# 4. Complete
ai-memory-hub workflow done --id <id> --by claude
```

### Pattern 3: Priority Queue Management

```bash
# 1. Add high-priority items to queue
ai-memory-hub queue add --tool codex --task <task-id> --priority urgent

# 2. Monitor queue
ai-memory-hub queue list
ai-memory-hub queue running

# 3. Handle failures
ai-memory-hub queue failed
ai-memory-hub queue fail <id> --error "Details here"
```

---

## Exit Codes

- `0` - Success
- `1` - Error (check stderr for details)

## Troubleshooting

### PowerShell blocks `ai-memory-hub` or `npm`

On Windows, PowerShell may refuse to run generated `.ps1` shims:

```text
cannot be loaded because running scripts is disabled on this system
```

Use the `.cmd` shim or direct Node entry point:

```powershell
ai-memory-hub.cmd status
npm.cmd test
node src/index.js status
```

For AI runner failures, run:

```powershell
node src/index.js doctor --tool claude
node src/index.js doctor --tool gemini
```

If doctor reports only a `.ps1` shim, install or expose a `.cmd`/`.exe` command path. If doctor reports a `.cmd` shim, dispatch uses `cmd.exe` only as a shim launcher and still sends prompt payloads on stdin.

### Runner command works manually but dispatch fails

Use `doctor` to separate the failure layer:

```bash
ai-memory-hub doctor --tool codex
ai-memory-hub doctor --tool codex --run-probes
```

Common causes:
- command is detected through PowerShell `.ps1` instead of `.cmd`/`.exe`
- the CLI supports prompt only on stdin or only as an argv argument
- the CLI prints environment warnings to stderr even on success
- the tool is shared-state-only and should be coordinated through radio/tasks instead of direct dispatch

### Dispatch appears stuck in `dispatched`

Run:

```bash
ai-memory-hub daemon status
ai-memory-hub dispatch retry --run --project <project>
ai-memory-hub dispatch status --recent 10 --project <project>
```

The retry command marks stale `dispatched`, `acked`, or `retrying` relay entries as failed when `ackTimeout` has elapsed. Running `ai-memory-hub daemon` keeps this check active in the background.

If `daemon status` reports `stale`, the recorded PID no longer points to an active daemon. Start a fresh daemon after checking that no separate terminal is still running one:

```bash
ai-memory-hub daemon --project <project>
```

### Gemini warning noise hides real failures

Known Gemini environment warnings such as skill conflicts, true-color warnings, and ripgrep fallback messages are classified as warnings by dispatch. The cleaned `stderr` remains focused on actionable failures, while full runner output is still available in dispatch logs.

## Environment Variables

- `AI_MEMORY_DIR` - Override default memory directory (default: `~/.ai-memory`)

## Configuration

Configuration file: `~/.ai-memory/config.json`

```json
{
  "memoryDir": "~/.ai-memory",
  "sync": {
    "snapshotLimit": 120,
    "coreLimit": 30,
    "recentLimit": 18
  }
}
```

`snapshotLimit` is the overall startup snapshot budget. When `coreLimit` or
`recentLimit` is omitted, ai-memory-hub derives compact defaults from
`snapshotLimit` so legacy configs can reduce startup context size by changing a
single value.

---

## See Also

- [README](../README.md) - Project overview
- [UPDATE Guide](UPDATE.md) - Update instructions
- [Memory Lifecycle](memory-lifecycle.md) - Memory system design
- [Relay Protocol](relay-protocol.md) - Communication protocol
### Memory audit

Audit durable memories for semantic duplicates and correction/version signals.
The default mode is read-only. `--apply` archives only high-confidence exact
semantic duplicates through the append-only lifecycle operation log; suspected
conflicts remain review candidates and are never deleted automatically.

```bash
ai-memory-hub memory audit --limit 50
ai-memory-hub memory audit --apply
ai-memory-hub memory op apply
```

### Session-targeted agent wake

Send a durable message to a concrete agent session. Claude resumes with its session id; direct runners such as Codex/Gemini use a fresh invocation while retaining the session/thread linkage; shared-state-only tools remain queued.

```bash
ai-memory-hub radio send "Continue the implementation" --from codex --to session:claude:<session-id> --project ai-memory-hub
ai-memory-hub radio send "Review the latest change" --from codex --to session:codex:<session-id> --project ai-memory-hub
ai-memory-hub session follow-up --id <session-id> --text "Continue"
ai-memory-hub daemon --tools codex,gemini,claude
```

AMH-owned dispatch lifecycle leases are persisted under `state/session-leases.jsonl`. This records lifecycle and recovery state; it is not a generic live terminal injection adapter.
