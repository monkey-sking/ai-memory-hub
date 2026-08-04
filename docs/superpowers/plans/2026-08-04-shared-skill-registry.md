# Shared Skill Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install external Skills once in an AMH-owned registry and expose selected, versioned Skills to multiple projects and Agents without overwriting user-owned files.

**Architecture:** Add focused modules for package normalization, registry events, source scanning, project manifests, and adapter materialization. Keep the registry machine-level under the AMH memory directory, keep project selection in `.amh/skills.json`, and reuse the existing tool adapter metadata for native Agent paths.

**Tech Stack:** Node.js 24 ESM, built-in `node:fs`, `node:path`, `node:crypto`, existing CLI dispatch in `src/index.js`, Node test runner.

---

## Repository map before implementation

- Create `src/shared-skills.js`: canonical package metadata, hashing, version constraints, immutable package storage, registry event replay.
- Create `src/shared-skill-scan.js`: read-only discovery of known Agent Skill roots and classification of ownership/drift/conflicts.
- Create `src/shared-skill-project.js`: `.amh/skills.json` validation, selection, and project-relative paths.
- Create `src/shared-skill-materializer.js`: adapter target mapping, managed marker files, copy/junction fallback, conflict-safe sync and doctor results.
- Modify `src/skill-registry.js`: expose canonical registry and enabled project Skills alongside existing local/domain-pack Skills while retaining current API fields.
- Modify `src/index.js`: add `skill scan/import/install/list/show/enable/disable/sync/update/rollback/doctor` subcommands and help text.
- Create `tests/shared-skills.test.mjs`: unit and integration fixtures for registry, scan, manifest, materialization, drift, conflict, and rollback.
- Modify `docs/CLI.md` and `README.md`: document the shared Skill lifecycle after implementation passes.

## Task 1: Build the canonical Skill package and registry core

**Files:**
- Create: `src/shared-skills.js`
- Create: `tests/shared-skills.test.mjs`

- [ ] **Step 1: Add failing tests for package normalization and hashing.**

Test a temporary Skill directory containing `SKILL.md`; assert normalized IDs
reject path separators and uppercase IDs, content hashes are stable, and
missing `SKILL.md` is rejected.

- [ ] **Step 2: Run the focused test and verify it fails.**

Run `node --test tests/shared-skills.test.mjs`.
Expected: module/function-not-found failures.

- [ ] **Step 3: Implement package primitives.**

Export `SKILL_REGISTRY_VERSION`, `normalizeSkillId`, `hashSkillContent`,
`readSkillPackage`, and `validateSkillPackage`. Use SHA-256 over the exact
UTF-8 `SKILL.md` bytes and reject files outside the source root.

- [ ] **Step 4: Add registry event replay and immutable import.**

Export `listSharedSkillPackages(memoryDir)`, `findSharedSkillPackage`, and
`importSharedSkill(memoryDir, sourcePath, metadata)`. Store packages under
`memoryDir/skill-store/packages/<id>/<version>/`, write `SKILL.md`,
`skill.json`, and `provenance.json`, and append events to
`memoryDir/skill-store/registry.jsonl`. Reimporting identical content returns
the existing package without rewriting it; a different hash remains a
separate conflict record.

- [ ] **Step 5: Run focused tests and commit.**

Run `node --test tests/shared-skills.test.mjs`.
Expected: all registry-core tests pass.
Commit: `feat: add canonical shared skill registry`.

## Task 2: Scan existing Agent Skill directories safely

**Files:**
- Create: `src/shared-skill-scan.js`
- Modify: `src/shared-skills.js`
- Modify: `tests/shared-skills.test.mjs`

- [ ] **Step 1: Add fixture tests for duplicate and user-owned Skills.**

Create temporary Codex, Claude, Gemini, and QClaw roots with identical and
different `SKILL.md` files. Assert scan results include `tool`, `path`,
`contentHash`, `ownership` (`user`, `amh-managed`, or `unknown`), and a
conflict group for same IDs with different hashes. Assert scan never writes.

- [ ] **Step 2: Implement `scanSkillRoots` and known-root resolution.**

Use the existing tool registry/config paths where available, plus explicit
`--root` arguments for tests. Recursively discover only directories containing
`SKILL.md`; ignore `node_modules`, caches, backups, and AMH marker directories.

- [ ] **Step 3: Implement ownership and duplicate classification.**

Recognize an AMH-managed Skill only from its marker/provenance file. Never
classify an unmarked file as AMH-owned. Group by normalized ID and report
content-hash conflicts.

- [ ] **Step 4: Run tests and commit.**

Run `node --test tests/shared-skills.test.mjs`.
Expected: scan tests pass and no fixture file is changed.
Commit: `feat: scan installed agent skills`.

## Task 3: Add project Skill manifest and version selection

**Files:**
- Create: `src/shared-skill-project.js`
- Modify: `tests/shared-skills.test.mjs`

- [ ] **Step 1: Add failing manifest tests.**

Test `.amh/skills.json` parsing with enabled/disabled entries, exact versions,
caret constraints, malformed IDs, and a missing project file. Assert an absent
manifest means no external Skill materialization.

- [ ] **Step 2: Implement manifest APIs.**

Export `loadProjectSkillManifest(projectRoot)`, `saveProjectSkillManifest`,
`setProjectSkill`, `removeProjectSkill`, and `selectProjectSkills`. Validate
against the versioned manifest schema, resolve the project root, and select
the highest installed compatible version with deterministic tie-breaking by
content hash.

- [ ] **Step 3: Run tests and commit.**

Run `node --test tests/shared-skills.test.mjs`.
Expected: manifest and version-selection tests pass.
Commit: `feat: add project shared skill manifest`.

## Task 4: Materialize selected Skills into Agent adapters

**Files:**
- Create: `src/shared-skill-materializer.js`
- Modify: `src/shared-skills.js`
- Modify: `tests/shared-skills.test.mjs`

- [ ] **Step 1: Add fixture tests for adapter targets and conflicts.**

Use temporary home/tool roots for Codex, Claude, Gemini, and Antigravity.
Assert an enabled project Skill creates a managed projection, writes a
provenance marker, does not overwrite an unmarked existing Skill, and reports
drift after the managed file is edited.

- [ ] **Step 2: Implement target mapping.**

Map the existing supported tool names to their native Skill roots. For each
project-enabled Skill, use a project-scoped subdirectory when the Agent
supports project Skills; otherwise create a managed global projection only
when explicitly requested by `--global`.

- [ ] **Step 3: Implement materialization fallback order.**

Try a junction/symlink only when requested and supported; otherwise copy the
canonical package. Always write an AMH marker containing package ID, version,
hash, and source path. Never remove or replace an unmarked destination.

- [ ] **Step 4: Implement `syncSkillProjections` and `doctorSkillProjections`.**

Return structured states: `current`, `missing`, `drifted`, `conflict`, and
`unsupported`. Repair only AMH-managed projections. Keep user-owned conflicts
visible and actionable.

- [ ] **Step 5: Run tests and commit.**

Run `node --test tests/shared-skills.test.mjs`.
Expected: materialization, drift, and conflict tests pass.
Commit: `feat: materialize shared skills for agents`.

## Task 5: Wire the CLI lifecycle

**Files:**
- Modify: `src/index.js`
- Modify: `tests/shared-skills.test.mjs`

- [ ] **Step 1: Add CLI contract tests.**

Exercise `skill scan`, `skill import`, `skill list`, `skill show`,
`skill enable`, `skill disable`, `skill sync`, and `skill doctor` against a
temporary `AI_MEMORY_DIR` and project root. Assert JSON output has stable
fields and failures use actionable messages.

- [ ] **Step 2: Add command dispatch and help text.**

Keep existing `skill list/search/attach/render` behavior intact. Add handlers
that call the focused modules and print JSON by default. Require explicit
paths for imports and explicit project roots for enable/sync.

- [ ] **Step 3: Add update and rollback event handling.**

`skill update` imports a newer selected source version and updates only the
requested project selection. `skill rollback` changes the manifest selection
to an existing immutable version and then syncs projections. Neither command
deletes packages or user-owned files.

- [ ] **Step 4: Run focused and existing skill tests; commit.**

Run `node --test tests/shared-skills.test.mjs tests/external-integrations.test.mjs`.
Expected: all new and existing Skill/domain-pack tests pass.
Commit: `feat: expose shared skill lifecycle commands`.

## Task 6: Integrate existing registry and documentation

**Files:**
- Modify: `src/skill-registry.js`
- Modify: `README.md`
- Modify: `docs/CLI.md`
- Modify: `docs/shared-skill-layer.md`
- Modify: `tests/shared-skills.test.mjs`

- [ ] **Step 1: Add compatibility tests.**

Assert `listSkills` still returns local/domain-pack Skills and now includes
canonical registry Skills without duplicate entries for the same package.

- [ ] **Step 2: Update registry integration.**

Merge canonical packages into `listSkills`/`searchSkills` with `source`,
`version`, and `contentHash` fields while preserving existing callers.

- [ ] **Step 3: Document the one-install workflow.**

Document scan/import/enable/sync/doctor, project manifest format, ownership
markers, supported Agent targets, and the fact that user-owned Skills are not
overwritten.

- [ ] **Step 4: Run the complete verification set.**

Run:

```text
node --test tests/shared-skills.test.mjs tests/external-integrations.test.mjs
npm test -- --test-concurrency=1
```

Run `node src/index.js skill doctor --project .` and confirm user-owned
workspace changes remain untouched. Commit: `docs: document shared skill registry`.

## Final verification and handoff

- [ ] Run `git diff --check` and `git status --short`.
- [ ] Confirm only intended files are committed; preserve unrelated existing
  dashboard changes in the working tree.
- [ ] Run `ai-memory-hub task note --id 3b1321bec3bf594a --by codex` with the
  implementation commits and verification results.
- [ ] Mark the shared task done only after the full test and doctor checks pass.

