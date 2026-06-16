# NocoBase Benchmark Optimization Items

This note turns the NocoBase AI/no-code platform patterns into actionable
optimization items for AI Memory Hub. It is not a plan to copy NocoBase's
business-system builder. The useful learning is how NocoBase makes AI agents
operate through explicit skills, permissions, workflow history, versioning, and
plugins.

## Source Snapshot

Official sources reviewed on 2026-06-15:

- NocoBase repository: https://github.com/nocobase/nocobase
- AI Agent Integration Guide: https://docs.nocobase.com/ai/quick-start
- NocoBase Skills repository: https://github.com/nocobase/skills
- AI Builder Quick Start: https://docs.nocobase.com/ai-builder/
- AI Employees Overview: https://docs.nocobase.com/ai-employees/
- Users and Permissions: https://docs.nocobase.com/users-permissions/user
- Configuring Permissions: https://docs.nocobase.com/users-permissions/acl/permissions
- Workflow Overview: https://docs.nocobase.com/workflow
- Workflow Execution History: https://docs.nocobase.com/workflow/advanced/executions
- Workflow Version Management: https://docs.nocobase.com/workflow/advanced/revisions
- AI Plugin Development Quick Start: https://docs.nocobase.com/ai-dev/

## Positioning Difference

NocoBase is an AI plus no-code platform for building business systems. Its
core objects are business data models, pages, workflows, permissions, plugins,
and business users.

AI Memory Hub is a local-first coordination layer for multiple AI tools. Its
core objects are durable memory, radio messages, shared tasks, workflows,
dispatch runs, capabilities, tool actors, and local files. AMH should borrow
NocoBase's control-plane discipline without becoming a business application
builder or a shared LLM proxy.

## What To Learn

NocoBase has several patterns that map cleanly to AMH:

- CLI bootstrap installs both runtime connection and domain skills, so agents
  start with the correct operating model.
- Skills are split by domain: environment, data modeling, UI, workflow, ACL,
  plugin management, release, and version control.
- AI action risk is controlled by permissions, role boundaries, and explicit
  ask/allow decisions.
- Workflows have execution plans, node-level statuses, waiting states, failure
  statuses, execution history, and versions.
- AI-generated changes are saved as restorable milestones after coherent,
  verified work, not after every small edit.
- Plugins are first-class extension units with management, permissions,
  frontend/backend boundaries, migrations, and i18n.
- AI employees are role-scoped executable agents that carry context, tools,
  skill permissions, and model preferences.

## Optimization Backlog

### P0. Capability Permission Matrix

Current AMH has conservative guardrails in the capability registry, but they
are mostly static: no push, no deletion, no dependency install unless approved.
NocoBase's ACL model suggests a more expressive permission matrix.

Build an AMH permission policy layer with these dimensions:

- actor: tool, session, workflow role, human, system
- project: exact project or project group
- operation: read memory, write memory, send radio, claim task, dispatch,
  modify files, run tests, install dependencies, push, delete, purge, archive
- scope: all data, project data, own task/session data
- decision: allow, ask, deny
- reason: human-readable explanation surfaced in CLI and dashboard

Acceptance:

- `ai-memory-hub capabilities` shows effective permissions per tool.
- Dispatch preflight explains why an action is allowed, blocked, or requires
  approval.
- Dashboard can show the same policy result without recomputing it.
- Existing hardcoded guardrails become default policy entries, not scattered
  special cases.

### P0. Workflow Execution History With Node States

AMH workflows currently track planner/executor/reviewer state, task notes, and
dispatch status, but execution is not yet modeled as a clear node plan.
NocoBase's execution history provides a strong template.

Add workflow run records with node-level status:

- queued
- running
- waiting
- completed
- failed
- error
- cancelled
- rejected

Each node should record role, actor, started/completed timestamps, input refs,
output refs, log refs, and whether the status is final.

Acceptance:

- A workflow can show "where it is stuck" without reading radio/task notes.
- Waiting human approval and rejected review are explicit states.
- Failed configuration, runtime error, cancellation, and review rejection are
  distinguishable.
- Completion requires all required nodes to reach completed.

### P0. Approval And Review Gates As First-Class State

NocoBase workflows support human-machine collaboration through manual approval
nodes. AMH has review notes, but approval is still too informal.

Add dedicated review gate records:

- requested
- approved
- rejected
- needs_changes
- waived

Each gate should include reviewer actor, target diff/run/task/workflow, scope,
decision time, evidence refs, and optional expiry.

Acceptance:

- A task cannot be marked truly complete when a required gate is pending.
- Dashboard shows review state separately from task notes.
- Dispatch retry/repair can resume from `needs_changes` without closing the
  source task.

### P1. Versioned Skill Packs

NocoBase's skill repository is organized by operating domain and installed by
the CLI during initialization. AMH already has a shared skill layer, but it can
be made more product-like.

Create a versioned AMH skill-pack model:

- core startup rules
- memory operations
- task/workflow/radio operations
- review and verification
- dispatch and runner safety
- project-specific adapter packs
- external platform packs such as Lark, WeCom, Unity, browser automation

Acceptance:

- `ai-memory-hub skill list` shows installed, available, version, and health.
- `ai-memory-hub skill install <pack>` installs or refreshes a pack.
- `ai-memory-hub doctor` reports stale or missing shared skills.
- Skills can declare required CLI commands and safety policies.

### P1. Visual Setup And Connection Wizard

NocoBase's `nb init --ui` reduces setup risk by guiding users through app
connection, database, auth, and environment setup. AMH setup still leans on CLI
knowledge.

Add a dashboard-backed setup wizard for:

- memory root detection and health
- tool detection and runner availability
- shared instruction installation
- policy defaults
- project registration
- dashboard/API port checks
- backup and sync status

Acceptance:

- A new user can run one command and finish AMH setup through the browser.
- The wizard produces the same config files as CLI init.
- The final screen shows verified ready/missing states for each tool.

### P1. Named Milestones And Restorable Revisions

NocoBase asks AI to save restorable versions after meaningful verified
milestones. AMH has backups and append-only state, but lacks a user-facing
milestone concept.

Add named revisions for AMH state:

- memory snapshot revision
- task/workflow/radio state revision
- project registry revision
- dashboard/config revision
- optional Git commit/diff refs

Acceptance:

- `ai-memory-hub revision create "reason"` records a named restorable point.
- `revision list` shows date, author, included state classes, and refs.
- Restore remains explicit and approval-gated.
- Revisions are created after verified milestones, not every event.

### P1. Agent Profiles Inspired By AI Employees

NocoBase AI Employees package role setting, model choice, skill/tool access,
context, and capability boundary into named agent identities. AMH has an actor
model, but not a profile layer.

Add agent profiles for common collaboration roles:

- planner
- executor
- reviewer
- observer
- release manager
- memory curator
- dashboard operator

Each profile should define preferred tool actors, allowed skills, default
permissions, required review gates, and context sources.

Acceptance:

- Workflows can bind roles to profiles rather than raw tool names.
- Profiles resolve to concrete actors at dispatch time.
- Dashboard explains each profile's boundary and current tool availability.

### P2. Plugin And Adapter Manager

NocoBase treats plugins as the stable extension boundary. AMH currently has
tool adapters, recipes, templates, skills, and dashboard modules, but not one
unified plugin manifest.

Define an AMH extension manifest for:

- tool runners
- shared-state adapters
- dashboard panels
- recipe packs
- skill packs
- notification channels
- approval surfaces

Acceptance:

- `ai-memory-hub extension list` shows enabled/disabled/missing extensions.
- Each extension declares commands, files, permissions, health checks, and
  dashboard surfaces.
- Enabling/disabling an extension is auditable and policy-checked.

### P2. Environment And Release Management

NocoBase separates local, remote, test, and production app environments and
supports migration/release operations. AMH needs a lighter version for local
coordination contexts.

Add environment profiles:

- personal local
- project local
- team shared filesystem
- remote node candidate
- CI/automation candidate

Acceptance:

- Commands can target `--env <name>` consistently.
- Doctor reports which env is active and where state is stored.
- Release/export/import workflows do not leak secrets or user-specific paths.

## Recommended Implementation Order

1. Capability permission matrix.
2. Workflow execution history with node states.
3. First-class approval and review gates.
4. Versioned skill packs.
5. Visual setup wizard.
6. Named milestones and revisions.
7. Agent profiles.
8. Extension manager.
9. Environment and release management.

The first three are the highest leverage because they make autonomous and
multi-agent execution safer. The rest improve onboarding, extensibility, and
operational maturity.

## Non-Goals

- Do not turn AMH into a no-code business app builder.
- Do not centralize model credentials or become an LLM proxy.
- Do not store secrets in memory, task, workflow, radio, or revision records.
- Do not allow visual convenience to bypass CLI-level safety checks.
- Do not make plugin enablement equivalent to execution permission.

## Follow-Up Implementation Plans

Create separate implementation plans for the P0 items:

1. `permission-policy-layer`
2. `workflow-run-node-history`
3. `review-gate-state-model`

Each plan should include schema changes, CLI/API behavior, dashboard changes,
tests, and migration/backward-compatibility handling.
