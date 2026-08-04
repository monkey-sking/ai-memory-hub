# Shared Skill Registry Design

## Status

Design approved in direction: use a unified Skill Registry with generated
per-agent adapter entries. Implementation is pending written-spec review.

## Problem

The machine currently contains duplicated Skill trees under Codex, the shared
agent skill directory, Claude, Gemini, QClaw, OpenCode, and other tools. The
same Skill can have different content, versions, and provenance in each tree.
Updating one Agent therefore does not reliably update the others, and a
project cannot declare which shared Skills it expects.

The goal is to install and maintain a Skill once, then expose the selected
version to multiple projects and multiple Agents without overwriting
user-managed Skills.

## Goals

- Scan supported Agent Skill directories on the current machine.
- Import selected local Skills into one AMH-owned canonical store.
- Preserve source, version, hash, trust, and import history.
- Let each project declare its enabled Skills and version constraints.
- Generate or synchronize Agent-native entry points for enabled Skills.
- Support local directories, Git repositories, ZIP archives, and existing AMH
  domain packs as Skill sources.
- Detect drift, conflicts, missing links, and stale generated copies.
- Support update, disable, and rollback without deleting user-owned files.
- Keep Skill content separate from AMH memory, tasks, workflows, and radio.

## Non-goals

- Do not execute arbitrary Skill scripts during scan, import, or validation.
- Do not silently overwrite an Agent's user-authored Skill.
- Do not make every installed Skill globally active in every project.
- Do not require symbolic-link privileges on Windows.
- Do not turn AMH into a remote Skill marketplace in the first increment.

## Architecture

```text
Agent Skill directories / local path / Git / ZIP / domain pack
                         |
                         v
                 Skill Source Scanner
                         |
                         v
                 AMH Skill Registry
       C:\\Users\\<user>\\.ai-memory\\skill-store\\
                         |
              project .amh/skills.json
                         |
                         v
                 Adapter Materializer
          Codex / Claude / Gemini / Antigravity /
          QClaw / OpenCode / MiMo / other adapters
                         |
                         v
                  Doctor and drift repair
```

The registry is machine-level and shared by projects. Project manifests are
repository-local and contain only selection and version policy. Agent adapter
directories contain generated projections or managed links, never the source
of truth.

## Canonical storage

The first implementation uses:

```text
%USERPROFILE%\\.ai-memory\\skill-store\\
  registry.jsonl
  packages\\<skill-id>\\<version>\\
    SKILL.md
    skill.json
    provenance.json
```

`skill.json` contains normalized metadata:

```json
{
  "id": "systematic-debugging",
  "version": "1.0.0",
  "name": "Systematic Debugging",
  "source": { "kind": "local", "location": "...", "ref": "" },
  "contentHash": "sha256:...",
  "permissions": { "network": "unknown", "scripts": "not-run" },
  "status": "installed",
  "importedAt": "2026-08-04T00:00:00.000Z"
}
```

The registry is append-only event data. Materialized indexes may be rebuilt.
Existing AMH domain packs remain supported; enabled pack Skills become
read-only registry candidates and are not copied unless explicitly imported.

## Project manifest

Each project may opt in with `.amh/skills.json`:

```json
{
  "version": 1,
  "skills": {
    "browser": { "constraint": "^1.0.0", "enabled": true },
    "systematic-debugging": { "constraint": "1.0.0", "enabled": true }
  },
  "targets": ["codex", "claude", "gemini", "antigravity"]
}
```

An absent manifest means no arbitrary external Skill is materialized for the
project. The existing AMH shared-skill adapter remains independent and is not
managed as an external Skill package.

## Scan and import

`skill scan` discovers known directories using the installed-tool registry and
reports each Skill's path, hash, inferred version, source Agent, and whether
it is user-owned, AMH-managed, duplicated, or conflicting.

`skill import` is explicit. Importing creates an immutable version directory
and provenance record. If the same content already exists, the registry
reuses the existing package. If the same ID has different content, both
versions remain available and no source file is overwritten.

Import supports:

- a local Skill directory containing `SKILL.md`;
- a directory containing multiple Skill subdirectories;
- a Git repository at a selected ref;
- a ZIP archive with path traversal protection;
- an enabled AMH domain pack.

Network fetches and archive extraction are explicit user actions. Validation
is filesystem-only and never runs package scripts.

## Agent materialization

The adapter materializer maps a project manifest to each supported Agent's
native Skill location. It uses this order:

1. managed junction/symlink only when the Agent and filesystem support it;
2. a generated managed copy with content hash and provenance header;
3. a shared instruction entry pointing the Agent to the canonical file when
   that Agent supports instruction references.

Generated entries are marked with an AMH ownership file. Existing files that
do not carry that marker are never replaced; the materializer reports a
conflict and offers an explicit adopt/rename/skip decision.

Agent-specific layout rules live in the existing tool adapter registry, not
inside individual Skill packages. Adding an Agent therefore requires one
adapter mapping, not changes to every Skill.

## Lifecycle commands

The CLI surface is:

```text
ai-memory-hub skill scan [--tool <tool>]
ai-memory-hub skill import --path <path> [--id <id>] [--version <version>]
ai-memory-hub skill install --source <path|git|zip|pack> ...
ai-memory-hub skill list [--source <source>] [--project <project>]
ai-memory-hub skill show <id> [--version <version>]
ai-memory-hub skill enable <id> --project <path> [--version <constraint>]
ai-memory-hub skill disable <id> --project <path>
ai-memory-hub skill sync --project <path> [--tool <tool>]
ai-memory-hub skill update [<id>] [--project <path>]
ai-memory-hub skill rollback <id> --version <version> --project <path>
ai-memory-hub skill doctor [--project <path>] [--tool <tool>]
```

Existing `skill list`, `skill search`, `skill attach`, and `skill render`
remain compatible. `skill list/search` will include registry and enabled-pack
sources with source and version fields.

## Conflict, trust, and safety

- A Skill ID plus version identifies a package; content hash detects tampering
  or drift.
- Same ID with incompatible content is a conflict, not an overwrite.
- Imported content is read-only from AMH's perspective.
- Generated Agent copies can be repaired from the canonical package.
- User-owned Agent Skills remain outside AMH ownership and are never removed
  by sync or uninstall.
- ZIP and Git paths are normalized and rejected if they escape the source root.
- Skill instructions are data; AMH does not execute commands found in them.
- Network/script permissions are metadata and require a later explicit policy
  decision before any runner uses them.

## Rollout phases

1. Registry schema, source scanner, local import, hash/provenance, and CLI list
   and show.
2. Project manifest, version selection, enable/disable, and local materializer
   for Codex, Claude, Gemini, and Antigravity.
3. Remaining detected adapters, doctor, drift repair, update, and rollback.
4. Git/ZIP/domain-pack sources, trust metadata, and dashboard visibility.

Each phase is independently testable and does not change current task,
workflow, radio, dispatch, or memory behavior.

## Verification

- Unit tests cover manifest validation, source scanning, hashing, version
  selection, provenance, conflict handling, and path traversal rejection.
- Fixture tests cover each supported Agent's native layout and a user-owned
  conflict.
- Integration tests scan the current machine's known directories without
  modifying them, import into a temporary AMH directory, materialize into a
  temporary project, repair drift, and roll back.
- `skill doctor` must report canonical, project, and Agent projection state
  separately.
- Existing AMH tests and existing shared-skill adapter behavior must remain
  unchanged.

