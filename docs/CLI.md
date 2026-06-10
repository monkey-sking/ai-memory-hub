# AI Memory Hub - CLI Commands Reference

Complete reference for all `ai-memory-hub` command-line commands.

## Table of Contents

- [Core Commands](#core-commands)
- [Memory Management](#memory-management)
- [Message Bus (Radio)](#message-bus-radio)
- [Task Management](#task-management)
- [Workflow System](#workflow-system)
- [Session Management](#session-management)
- [RPC Communication](#rpc-communication)
- [Notifications](#notifications)
- [Context Packs](#context-packs)
- [Project Task Specs](#project-task-specs)
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
- Connected tools

### `sync`

Synchronize inbox events to memory ledger.

```bash
ai-memory-hub sync
```

Processes events from `inbox/events.jsonl` and updates the memory system.

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
ai-memory-hub search [query] [--limit <n>] [--project <name>] [--thread <id>] [--task <id>] [--workflow <id>] [--radio <id>]
```

**Examples:**
```bash
ai-memory-hub search "git commit rules"
ai-memory-hub search "project setup" --limit 10
ai-memory-hub search "relay lifecycle" --thread relay-lifecycle-2026-06-09
ai-memory-hub search --thread relay-lifecycle-2026-06-09
ai-memory-hub search "review result" --task task-relay --project ai-memory-hub
```

Search reads the rebuilt memory index and can filter by thread-aware references
stored in `refs.thread`, `refs.taskId`, `refs.workflowId`, and `refs.radioId`.
Plain text search still works without any reference filters. If a reference
filter is provided without a query, search returns the newest matching records.

### `memory snapshot`

Generate memory snapshot.

```bash
ai-memory-hub memory snapshot [--limit <n>]
```

**Options:**
- `--limit` - Maximum number of records in snapshot (default: 40)

### Planned `memory op`

Future lifecycle edits should use append-only memory operations instead of
editing `memories/ledger.jsonl` directly.

```bash
ai-memory-hub memory op create --action annotate --record <id> --reason manual-review --patch @patch.json --by codex
ai-memory-hub memory op list --record <id>
ai-memory-hub memory op apply --dry-run
```

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
ai-memory-hub task list [--status <status>] [--project <name>]
```

**Options:**
- `--status <status>` - Filter by status: open, claimed, in_progress, blocked, done, cancelled, active
- `--project <name>` - Filter by project

**Examples:**
```bash
# All active tasks
ai-memory-hub task list --status active

# Project-specific tasks
ai-memory-hub task list --project my-app

# Open tasks
ai-memory-hub task list --status open
```

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

Direct dispatch only runs radio messages addressed to a concrete tool such as `codex`, `gemini`, or `claude`, plus assigned tasks. Radio broadcasts addressed to `all` stay in shared state for tools to poll or reply to, but the daemon does not fan them out into automatic CLI execution. This keeps coordination notes from being retried as stale work.

Every runner prompt includes autonomous safety rules: follow the current user/project guardrails, do not run `git push`, delete files, run destructive cleanup, install dependencies, or change system configuration unless the dispatch payload explicitly authorizes it. Local commits are allowed only when user/project rules allow them and verification has passed.

Each executed runner also writes a structured run record to `state/dispatch-runs.jsonl` and raw output logs under `dispatch-runs/`. The record includes `runId`, source task/radio/workflow, command metadata, `cwd`, start/end time, duration, exit code, stdout/stderr log paths, status, error summary, and verification result.

Successful task dispatches are marked `done` and receive a task note with the response summary. If the task is linked from a workflow, the workflow delivery fields are aggregated from its linked tasks, including progress percent/status and response/status radio IDs. Failed or timed-out dispatches keep the task open, write a diagnostic note, and surface the failing state on linked workflows.

### `dispatch status`

Inspect relay state by thread, source reference, or recent relay entries.

```bash
ai-memory-hub dispatch status --recent 10 --project ai-memory-hub
ai-memory-hub dispatch status --ref-id <task-radio-or-workflow-id>
ai-memory-hub dispatch status --thread-key claude:ai-memory-hub:<ref>
```

Single-source lookups resolve task, radio, and workflow relay sources. Workflow status results include linked tasks in `related.tasks`, so a workflow-level status check shows the current source plus the work items driving its delivery state. Status output also includes `summary.latestRunId`, latest run status/exit metadata, and `runHistory` entries pointing to the raw output log files.

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

Retry failed relay jobs whose `nextRetryAt` is due. With `--run`, this also scans latest relay states for stale `dispatched`, `acked`, `progress`, or `retrying` entries and marks them `failed` or `abandoned` when `ackTimeout` has elapsed. Broadcast radio messages are not retried through direct CLI runners; convert them into targeted radio messages or assigned tasks when executable follow-up is needed. Relays whose source task, workflow, radio message, or linked radio thread is already completed, delivered, done, or cancelled are skipped instead of resurrected as stale work.

```bash
ai-memory-hub dispatch retry --run --project ai-memory-hub
```

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

#### `docs-cleanup`
- **Roles:** analyzer, writer, reviewer
- **Steps:** 3 (analyze → write → review)
- **Use:** Systematic documentation improvement

#### `implement-and-review`
- **Roles:** planner, executor, reviewer
- **Steps:** 3 (planning → implementation → review)
- **Use:** Standard feature implementation workflow

#### `multi-tool-review`
- **Roles:** reviewer1, reviewer2, reviewer3, synthesizer
- **Steps:** 4 (3 parallel reviews → synthesis)
- **Use:** Comprehensive multi-perspective code review

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

Show or apply tool integration instructions.

```bash
# Preview instructions
ai-memory-hub install --tool <tool-name>

# Apply instructions
ai-memory-hub install --tool <tool-name> --apply
```

**Supported tools:**
- `claude`, `codex`, `gemini` - Direct instruction injection
- `qclaw`, `openclaw`, `opencode` - Skill installation
- Others - Adapter notes

### `backup`

Create a backup.

```bash
ai-memory-hub backup [--reason <text>]
```

**Example:**
```bash
ai-memory-hub backup --reason "before-major-refactor"
```

### `watch`

Start background watcher for automatic syncing.

```bash
ai-memory-hub watch [--interval-ms <ms>]
```

**Options:**
- `--interval-ms <ms>` - Check interval in milliseconds (default: 30000)

### `daemon`

Start the local dispatch daemon. It checks verified runners (`codex`, `gemini`, `claude`), marks stale relay entries timed out, retries due failures, and dispatches new matching tasks or radio messages.

```bash
ai-memory-hub daemon [--interval-ms <ms>] [--project <name[,name]>] [--limit <n>]
ai-memory-hub daemon status
```

**Options:**
- `--interval-ms <ms>` - Loop interval in milliseconds (default: 10000)
- `--project <name[,name]>` - Optional project filter list
- `--limit <n>` - Maximum jobs per tool/project per cycle (default: 10)
- `--force` - Start even when local daemon metadata says a daemon is already running

The daemon writes runtime metadata to:
- `state/daemon.pid`
- `state/daemon-status.json`

Use `ai-memory-hub daemon status` to inspect whether the recorded process is running, stale, stopped, or missing. Use `Ctrl+C` or send `SIGTERM` to stop the daemon cleanly; shutdown updates `daemon-status.json` and removes the PID file when it belongs to the current daemon process.

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
    "coreLimit": 40,
    "recentLimit": 20
  }
}
```

---

## See Also

- [README](../README.md) - Project overview
- [UPDATE Guide](UPDATE.md) - Update instructions
- [Memory Lifecycle](memory-lifecycle.md) - Memory system design
- [Relay Protocol](relay-protocol.md) - Communication protocol
