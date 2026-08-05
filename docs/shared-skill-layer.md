# Shared Skill Layer

The Shared Skill Layer is the instruction contract installed into each AI tool
adapter. It does not replace the memory ledger, radio, tasks, workflows, or
runner dispatch. It tells each tool how to use those shared primitives in the
same way.

## Boundaries

- **Memory** stores durable preferences, project facts, workflow rules, and
  corrections. Tools append JSONL events to `inbox/events.jsonl`; `sync`
  indexes them into the ledger and snapshots.
- **Skill adapters** are tool-native instruction files, such as Codex
  `AGENTS.md`, Claude `CLAUDE.md`, QClaw/OpenClaw/OpenCode/MiMo Code `SKILL.md`, and
  Marvis integration instructions. They contain the common startup and workflow
  contract.
- **Tasks** store active single-owner work and handoff state. Use them for
  claim, progress notes, blockers, and completion.
- **Workflows** coordinate planner, executor, reviewer, and observer roles.
  Use workflows when more than one tool or role participates.
- **Radio** carries cross-agent messages, review requests, risk broadcasts, and
  handoffs. Do not put active coordination chatter into durable memory.

## Installed Contract

All supported adapters include the `AI_MEMORY_HUB_SHARED_SKILL_LAYER v1` marker.
The shared contract requires each tool to:

1. Read `MEMORY.md` at session startup when available.
2. Resolve missing includes such as `@RTK.md` with `ai-memory-hub resolve` or
   `ai-memory-hub search` before assuming the file is absent.
3. Append durable facts to `inbox/events.jsonl` and run `ai-memory-hub sync`
   when command execution is available.
4. Use tasks for active handoff state.
5. Use workflows for planner/executor/reviewer/observer collaboration.
6. Use radio for review requests, risks, blockers, and handoffs.
7. Treat repo-local instructions, project docs, `.tasks.json`, and recipe
   gates as a project-level skill overlay.

When an Agent writes a durable memory, it should declare known context in the
event metadata. AMH accepts `project`, `skills`, `tags`, and
`refs.taskId` / `refs.workflowId` (or the equivalent CLI flags). Direct
CLI/API writes create high-confidence relation events immediately; direct
adapter writes to `inbox/events.jsonl` receive the same relation enrichment
during `sync`.

## Installation and Verification

Preview an adapter:

```bash
ai-memory-hub install --tool qclaw
ai-memory-hub install --tool opencode
ai-memory-hub install --tool mimocode
```

Apply globally or locally:

```bash
ai-memory-hub install --tool codex --apply
ai-memory-hub install --local --tool codex --apply
```

Verify shared skill installation separately from runner automation:

```bash
ai-memory-hub detect
ai-memory-hub connect status
ai-memory-hub doctor --tool claude
```

`detect` and `connect status` report `skillLayer`, `skillLayerVersion`, and
`skillLayerStatus`. `doctor` reports the same installation status under
`install`, while runner availability remains separate.

## Shared external Skills

External Skills are managed once by the AMH registry instead of being copied manually into every Agent. A local Skill can be imported and bound to a project with:

```bash
ai-memory-hub skill install --path <skill-directory> --version 1.0.0 --project <project> --tool codex
ai-memory-hub skill sync --project <project>
ai-memory-hub skill doctor --project <project>
```

The canonical package is stored below `~/.ai-memory/skill-store`; the project selection is stored in `.amh/skills.json`. Agent directories contain only AMH-managed projections and are never used as the source of truth. Existing unmarked Skills are reported as conflicts and are not overwritten.

The reserved `ai-memory-hub` adapter is a protected core Skill. Its copies in
Codex, Claude, Gemini, OpenCode, QClaw, or MiMo Code remain tool-specific
projections and cannot be imported back into the AMH registry. For other
multiple-hash groups, AMH distinguishes identical duplicates, target-agent
variants, and true content conflicts: variants remain separated by target,
while true conflicts require an explicit source choice.

The dashboard Skill Center exposes the same scan, import, sync, and doctor operations. Credential profiles can be configured once from the Skill Center or `/api/credentials`. Secret values are protected with Windows DPAPI where available, never returned in API responses, and may be injected only into a runner invocation that explicitly references the profile.
### External source types

The installer accepts a local Skill directory, a ZIP archive, or a Git repository URL. ZIP imports use a temporary extraction directory with traversal handled by PowerShell `Expand-Archive`; Git imports use a shallow clone and optional `--ref`. A plain directory is validated by its `SKILL.md`; a directory with `amh-pack.json` is validated as a generic multi-Skill package and its non-executable resources are preserved. AMH never executes package scripts.

```bash
ai-memory-hub skill install --path <directory|archive.zip|git-url> --version 1.0.0 --project <project>
ai-memory-hub skill install --path <git-url> --ref <tag-or-branch> --project <project>
```

Use `skill update` to import a new immutable version and `skill rollback` to select an earlier version. The dashboard exposes registry discovery, credential setup, sync, and projection health checks.

### Skill, memory, and project associations

AMH does not copy memory text into a Skill and does not treat every Skill
mention in a memory as a confirmed relationship. The relation layer stores
auditable edges in `relations/events.jsonl`:

- `project` edges come from the existing project field and project registry;
- `task` and `workflow` edges carry the project and explicitly attached Skills;
- `memory -> skill` edges may be explicit or inferred from tags/text and are
  shown as suggestions until confirmed;
- `skill-pack -> skill` edges preserve generic package membership, including
  Feishu, reverse-engineering, or any future package without vendor-specific
  code.

Context Packs use project and task links first, then enabled Skills and related
memories. This gives an Agent reusable evidence and operating instructions
without turning all historical memory into executable Skill content.

The dashboard exposes the same relation drawer from Skills, Projects, Memory,
and Task detail views. It lists confirmed edges and lets the user confirm
inferred suggestions; confirmation writes an append-only relation event.
