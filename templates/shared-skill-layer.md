<!-- AI_MEMORY_HUB_SHARED_SKILL_LAYER v1 -->
## Shared Skill Layer

This adapter implements the same AI Memory Hub workflow contract for `{{TOOL}}`.

### Startup and Includes

- At session start, read `{{MEMORY_DIR}}/MEMORY.md` when available before making project or workflow assumptions.
- If an instruction include such as `@RTK.md` is missing, do not treat it as absent immediately. Run `ai-memory-hub resolve "@RTK.md"` or `ai-memory-hub search "RTK.md"` first, then read the resolved path if it exists.
- Keep durable memory concise and limited to long-lived preferences, project facts, workflow rules, and corrections.

### Durable Memory

- Append durable events to `{{MEMORY_DIR}}/inbox/events.jsonl` as JSONL:

```json
{"source":"{{TOOL}}","text":"short durable memory","metadata":{"kind":"preference|project|workflow|correction"}}
```

- Never edit `{{MEMORY_DIR}}/memories/ledger.jsonl` or `{{MEMORY_DIR}}/MEMORY.md` directly.
- After writing a durable event, run `ai-memory-hub sync` when command execution is available.

### Task, Workflow, and Review

- Use `ai-memory-hub task list --status active` before substantial shared work.
- Use `task claim`, `task note`, and `task done` for single-owner handoff state.
- Use `workflow create`, `workflow start`, `workflow result`, `workflow review`, and `workflow signal` for planner/executor/reviewer/observer collaboration.
- For review loops, record findings in workflow reviews or task notes, repair only in bounded attempts, then rerun the stated verification commands.
- Broadcast risks, blockers, and handoffs through Agent Radio instead of durable memory.

### Project Skill Overlay

- Treat repo-local instructions, project docs, task specs, and recipe gates as a project-level skill overlay.
- Capture project background, documentation paths, acceptance checks, forbidden actions, and common verification commands in project instructions or `.tasks.json`.
- If project instructions conflict with this shared layer, keep the shared memory safety rules and follow the stricter project guardrail.

### Health Check

- `ai-memory-hub detect` and `ai-memory-hub connect status` should show this adapter as configured.
- `ai-memory-hub doctor --tool {{TOOL}}` should report runner health separately from shared-state skill installation.

### Declare Capabilities

Declare the models you can run and what you are best at so other agents can pick the right tool for dispatch:

```bash
ai-memory-hub declare --tool {{TOOL}} --models "model-a,model-b" --strengths "frontend,code-review" --note "short description" --by {{TOOL}}
ai-memory-hub declare list
ai-memory-hub models --to {{TOOL}} --refresh
```

- Use `declare` for models that require explicit membership (e.g. `grok-4.5`), and `models --refresh` to pull the provider's latest catalog where the CLI supports it.
- Keep strengths short and concrete so dispatch callers can route work accurately.
<!-- /AI_MEMORY_HUB_SHARED_SKILL_LAYER -->
