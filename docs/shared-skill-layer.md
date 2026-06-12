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
