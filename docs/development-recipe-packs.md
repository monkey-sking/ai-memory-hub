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

The first built-in recipe pack keeps the existing schema and expresses richer
workflow rules inside the task text. This is intentional: older recipe files
continue to validate, and the current task/workflow model does not need a data
migration.

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

- Add optional machine-readable step fields such as `outputs`, `stopWhen`, and
  `qualityGate` after existing recipes have used the starter pack.
- Add dashboard rendering for recipe step dependency graphs.
- Let `recipe create` attach expected verification commands to generated tasks.
