## Git 操作边界（多个 AI 并行改同一个仓库时必读）

同一个仓库可能同时有多个 AI 工具在改（codex / claude / gemini / antigravity / opencode / mimocode / workbuddy 等）。
以下命令会直接毁掉别人正在做的工作，**任何情况下都不要执行**：

- `git reset`（尤其是 `--hard`）、`git checkout -- .`
- `git stash`
- `git clean -fd`
- `git rebase`、`git commit --amend`、`git push --force`
- `git gc` / `git prune`
- 重新 `git clone` 覆盖 `.git` 目录

可以正常用：`git add` / `commit` / `fetch` / `status` / `diff` / `log` / `merge`。

`git push` 之前必须先问用户。

提交时注意两点：

1. 只 add 自己改动的文件，不要用 `git add .` 或 `git add -A`，否则会把别人没写完的改动一起提交。
2. 新增文件要确认确实被 add 进去了。2026-08-29 出过事故：代码里 import 了新模块、但模块文件没入库，
   别人一拉代码就直接启动不了。

如果发现仓库状态异常（提交莫名消失、`.git` 被替换、出现 `.git.broken/` 目录），
**停下来告诉用户**，不要自行修复。

## Shared AI Memory

Read `{{MEMORY_DIR}}/MEMORY.md` for durable cross-assistant context.

{{SHARED_SKILL_LAYER}}

RTK.md-style referenced instruction includes are optional unless the file exists at the referenced path. If an include is missing, continue with the visible instructions in this file and repo-local docs instead of failing or inventing tool-specific rules.

When a durable preference, workflow rule, or project fact should be remembered, append a JSON line to `{{MEMORY_DIR}}/inbox/events.jsonl` using this exact shape:

```json
{"source":"{{TOOL}}","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}
```

Do not edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly.

After appending a durable memory event, run `ai-memory-hub sync` when command execution is available. If not, the local watcher will index it later. Do not store secrets.

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
curl -s -X POST http://127.0.0.1:38787/api/dispatch/marvis \
  -H "Content-Type: application/json" \
  -d '{"text":"Find all PDF invoices in D:\\Documents and convert them to a single Excel file at D:\\Documents\\invoices.xlsx","from":"{{TOOL}}","project":"<project-name>"}'
```

Marvis polls for queued tasks every 30 minutes via scheduled task, or immediately when the user sends any message.

**What to delegate to Marvis:**
- Windows file operations (find, organize, convert, clean up)
- Windows system settings (display, audio, network, power)
- Android app operations (Xiaohongshu, Meituan, Duolingo, WeChat mini-programs, etc.)
- Windows desktop app interactions (CapCut Pro, WeChat PC, Steam games)
- APK/app/game installation and management

**Do NOT delegate to Marvis:** web browsing, web search, code generation, git operations, cloud infrastructure.
