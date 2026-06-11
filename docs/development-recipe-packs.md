# Development Recipe Packs

This design adapts the useful parts of claude-code-workflows into AI Memory Hub
without changing the hub into a single-tool workflow runner. Recipes remain
cross-tool templates that create shared workflows and task records.

## Goals

- Make development workflows explicit before implementation starts.
- Keep planner, executor, reviewer, and observer responsibilities visible in
  shared state.
- Add stop points for unclear requirements, unsafe scope, missing verification,
  or unresolved review blockers.
- Prefer structured step outputs so another tool can continue without guessing.
- Provide starter templates for frontend, backend, fullstack, and unattended
  local loop work.

## Recipe Shape

Recipes are JSON files with `roles` and ordered `steps`. A step may include:

- `id`: stable step identifier.
- `role`: one of the recipe roles.
- `task`: natural-language work instruction for the assigned tool.
- `dependsOn`: step ids that must be completed first.

Recipes may also include a top-level `qualityGate` object. Individual steps may
set gate fields directly or inside a step-level `qualityGate`; step values
override the recipe defaults when `recipe create` builds task records. Older
recipe files without gates continue to validate.

Supported machine-readable gate fields:

- `verifyCommands`: array of local command strings or command objects. Strings
  are normalized to `{ "command": "...", "args": [] }`; objects may define
  `id`, `source`, `command`, `args`, `cwd`, `timeoutMs`, `required`, and
  `description`.
- `reviewRequired`: boolean indicating whether an external review gate must
  pass before closure.
- `maxRepairAttempts`: non-negative integer for bounded repair loops.
- `stopWhen`: array of stop conditions that require a note, handoff, or human
  approval.
- `allowedActions`: array of actions the workflow may perform under current
  guardrails.
- `forbiddenActions`: array of actions that must stop unless freshly approved.

`recipe create` stores recipe metadata and the effective `qualityGate` on the
created workflow and tasks. Each task also gets `recipeStep` metadata with the
step id, role, dependency ids, and workflow id, so daemon and dashboard code can
advance or render recipe-driven work without parsing task prose.

## Built-In Templates

- `frontend-feature`: requirement analysis, UI/codebase analysis, design plan,
  implementation, quality fix, and review.
- `backend-service`: behavior/API contract, data ownership, task decomposition,
  implementation, quality fix, and review.
- `fullstack-feature`: end-to-end requirements, system analysis, design doc,
  shared task decomposition, implementation, quality fix, and review.
- `lights-out-local`: local unattended loop engineering with guardrails,
  implementation, verification, review, bounded repair, final verification, and
  closure.

Built-in templates live in the repository `recipes/` directory. User templates
in `~/.ai-memory/recipes/` are still supported and override built-ins with the
same `name`.

## Stop Points

Recipe step text should tell an agent to stop and report blockers when:

- Product intent or acceptance criteria are unclear.
- Required files, credentials, services, or permissions are missing.
- A change requires push, deletion, dependency install, system config, or other
  actions outside the current user guardrails.
- Verification cannot run or returns unexplained failures.
- Review returns blockers.
- A lights-out run reaches its repair attempt limit.

## Structured Results

Recipes should ask for JSON-style summaries at analysis and verification gates.
Recommended fields are:

- `scope`
- `assumptions`
- `acceptance`
- `files`
- `commands`
- `results`
- `risks`
- `next`

These fields can be pasted into task notes, workflow results, or radio replies.

## Next Extensions

- Add optional structured step output declarations, such as required result
  fields and artifact paths.
- Add dashboard rendering for recipe step dependency graphs.
- Let the daemon execute `verifyCommands` and enforce `maxRepairAttempts` for
  lights-out loops.
