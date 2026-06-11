# Shared AI Memory

Use the local shared memory directory as the durable cross-assistant memory hub:

```text
{{MEMORY_DIR}}
```

{{SHARED_SKILL_LAYER}}

At the start of a session, read `{{MEMORY_DIR}}/MEMORY.md` if it exists and use it as durable user/project context.

RTK.md-style referenced instruction includes are optional unless the file exists at the referenced path. If an include is missing, continue with the visible instructions in this file and repo-local docs instead of failing or inventing tool-specific rules.

When you learn a durable preference, project fact, workflow rule, or long-lived correction, append a JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl` with this shape:

```json
{"source":"{{TOOL}}","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}
```

Do not edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly. After appending a durable memory event, run `ai-memory-hub sync` when command execution is available. If not, the local watcher will index it later.

Only save durable facts. Do not save secrets, API keys, one-off commands, or transient chat details.

## Lark / Feishu CLI Notes

When using `lark-cli` or Feishu/Lark commands from PowerShell:

- Quote file-content arguments that use `@`, for example `--content "@path.html"`, so PowerShell does not treat `@` as splatting syntax.
- On permission errors such as "Only bot creator has permission" or inaccessible user documents, retry with `--as user` when user-level authorization is intended.
- If authentication is expired or missing, run `lark-cli auth login` and complete the browser or QR-code login flow.
- For complex JSON request bodies, prefer a quoted temporary JSON file reference such as `--params "@params.json"` or `--data "@data.json"` instead of inline PowerShell JSON escaping.
- Do not store Feishu tokens, cookies, or other secrets in durable memory, tasks, radio messages, or repo files.

## Shared Task List

For shared work tracking, check and update the local task list:

```bash
ai-memory-hub task list --status active
ai-memory-hub task add "short task title" --description "Goal: ... Scope: ... Acceptance: ..." --handoff "Current state, next step, owner, risks." --from {{TOOL}} --project <project> --priority normal
ai-memory-hub task claim --id <task-id> --by {{TOOL}}
ai-memory-hub task update --id <task-id> --description "Goal: ... Scope: ... Acceptance: ..." --handoff "Current state, next step, owner, risks." --by {{TOOL}}
ai-memory-hub task note --id <task-id> "handoff note or progress update" --by {{TOOL}}
ai-memory-hub task done --id <task-id> --by {{TOOL}}
```

Use tasks for active handoff state. Use durable memory only for long-lived facts and rules.

## Shared Workflows

For multi-agent work with planner, executor, reviewer, and observer roles, prefer workflows over ad hoc tasks:

```bash
ai-memory-hub workflow list --status active
ai-memory-hub workflow create "short workflow title" --from {{TOOL}} --project <project> --planner {{TOOL}} --executor <tool> --reviewer <tool> --spawn-tasks
ai-memory-hub workflow start --id <workflow-id> --by {{TOOL}}
ai-memory-hub workflow result --id <workflow-id> --role executor "execution result" --by {{TOOL}}
ai-memory-hub workflow review --id <workflow-id> --role reviewer "review result" --by {{TOOL}}
ai-memory-hub workflow signal --id <workflow-id> --to <role-or-tool> "handoff note" --by {{TOOL}}
```

Use workflows when multiple tools may act as planner, executor, reviewer, or observer. Use standalone tasks for small single-owner work.

## Shared Agent Radio

For cross-agent handoffs, review requests, risk notes, and status updates, append JSONL messages to `{{MEMORY_DIR}}/radio/messages.jsonl`.

Use this shape:

```json
{"source":"{{TOOL}}","from":"{{TOOL}}","to":"all","type":"note","text":"short cross-agent message"}
```

## Contact Other AI Tools

Use `connect` when you need a specific AI tool to inspect, execute, review, or continue work. It writes a Radio message and can also create an assigned shared task.

```bash
ai-memory-hub connect status
ai-memory-hub connect request --from {{TOOL}} --to <tool> --project <project> --text "please inspect this task" --task
ai-memory-hub connect review --from {{TOOL}} --to <tool> --project <project> --text "please review this change" --task
ai-memory-hub connect handoff --from {{TOOL}} --to <tool> --project <project> --text "handoff context and next step" --task
ai-memory-hub dispatch --to <tool> --project <project>
ai-memory-hub dispatch --to <tool> --project <project> --run
```

Use `--to codex` when asking Codex to continue or review work. Use `--run` only for targets with verified CLI runners. Without `--run`, the request remains shared local state until the target tool reads it.

## Calling Marvis (Windows Desktop AI Assistant)

Marvis is a Windows desktop assistant with access to local files, system settings, Android apps (via emulator), and Windows desktop apps. When you need Marvis to perform a task in the local Windows environment, call its dispatch API.

The AI Memory Hub app server must be running. Start it if needed:

```bash
start /B ai-memory-hub app --port 38787
```

Then send a task to Marvis:

```bash
curl -s -X POST http://127.0.0.1:38787/api/dispatch/marvis ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Find all PDF invoices in D:\\Documents and convert them to a single Excel file at D:\\Documents\\invoices.xlsx\",\"from\":\"{{TOOL}}\",\"project\":\"<project-name>\"}"
```

Marvis polls for queued tasks every 30 minutes via scheduled task, or immediately when the user sends any message.

**What to delegate to Marvis:**
- Windows file operations (find, organize, convert, clean up)
- Windows system settings (display, audio, network, power)
- Android app operations (Xiaohongshu, Meituan, Duolingo, WeChat mini-programs, etc.)
- Windows desktop app interactions (CapCut Pro, WeChat PC, Steam games)
- APK/app/game installation and management

**Do NOT delegate to Marvis:** web browsing, web search, code generation, git operations, cloud infrastructure.
