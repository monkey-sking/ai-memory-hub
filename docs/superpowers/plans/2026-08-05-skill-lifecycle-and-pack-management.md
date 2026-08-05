# Skill Lifecycle and Pack Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make AMH Skills deduplicate local Agent projections, preserve multi-file Skill packages, and expose safe install/update/enable/sync/rollback lifecycle operations.

**Architecture:** Keep local Agent directories read-only discovery sources. Add an aggregated discovery model above `scanSkillRoots`, extend the immutable Registry to store complete package trees, and keep project selection in `.amh/skills.json`. Dashboard actions call explicit lifecycle endpoints and render source, Registry, project, and projection states separately.

**Tech Stack:** Node.js ESM, JSONL/JSON local storage, React + TypeScript + Vite, Node test runner.

---

## Scope and file map

- Modify `src/shared-skill-scan.js` to group sources by `id`, `contentHash`, and optional `amh-pack.json` metadata while retaining raw sources for detail views.
- Modify `src/shared-skills.js` to validate/copy complete Skill trees, read package metadata, and expose immutable version/update records.
- Add `src/shared-skill-pack.js` for pack manifest validation, dependency normalization, and package tree enumeration.
- Modify `src/shared-skill-project.js` to validate version constraints, enabled/disabled state, and selected package members.
- Modify `src/shared-skill-materializer.js` to report projection status and refuse unsafe overwrites.
- Modify `src/index.js` to expose aggregated scan, package detail, update, version selection, diff, sync, and doctor responses.
- Modify `dashboard-next/src/pages/Skills.tsx` and `dashboard-next/src/pages/Skills.css` to show deduplicated states and actions.
- Add `tests/shared-skill-lifecycle.test.mjs`, extend `tests/shared-skills.test.mjs`, and extend Dashboard structure/API tests.
- Add `src/relations.js` and `tests/relations.test.mjs` for auditable memory/Skill/project/task links.

### Task 1: Aggregate local discovery and duplicate/conflict states

**Files:**
- Modify: `src/shared-skill-scan.js`
- Test: `tests/shared-skill-lifecycle.test.mjs`

- [ ] **Step 1: Write failing aggregation tests**

Create fixtures for five source directories: two identical `deep-discuss` copies, one changed `deep-discuss`, one independent Skill, and one `amh-pack.json` directory. Assert the aggregate shape:

```js
const groups = aggregateSkillSources(sources);
assert.equal(groups.find((item) => item.id === "deep-discuss").sourceCount, 3);
assert.equal(groups.find((item) => item.id === "deep-discuss").duplicateCount, 1);
assert.equal(groups.find((item) => item.id === "deep-discuss").status, "conflict");
assert.equal(groups.find((item) => item.id === "independent").status, "discovered");
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/shared-skill-lifecycle.test.mjs`

Expected: FAIL because `aggregateSkillSources` is not exported.

- [ ] **Step 3: Implement deterministic aggregation**

Add `aggregateSkillSources(results)` that groups by normalized ID, then by `contentHash`, reports `sources`, `contentHashes`, `sourceCount`, `duplicateCount`, `conflict`, `packageId`, and one of `discovered`, `duplicate`, or `conflict`. Keep every source path in the response; do not import or modify source directories.

- [ ] **Step 4: Run focused and existing scanner tests**

Run: `node --test tests/shared-skill-lifecycle.test.mjs tests/shared-skills.test.mjs`

Expected: all tests pass and raw `scanSkillRoots` compatibility remains intact.

### Task 2: Add complete Skill package validation and immutable storage

**Files:**
- Create: `src/shared-skill-pack.js`
- Modify: `src/shared-skills.js`
- Test: `tests/shared-skill-lifecycle.test.mjs`

- [ ] **Step 1: Write package fixture tests**

Create a package containing `amh-pack.json`, two Skill directories, `scripts/check.mjs`, `references/guide.md`, and `templates/example.json`. Assert that import output contains the package metadata and that every relative file exists under the Registry package directory.

```js
const imported = await importSharedPack(memoryDir, packRoot);
assert.equal(imported.package, true);
assert.equal(imported.skills.length, 2);
assert.equal(await fs.readFile(path.join(imported.packagePath, "scripts", "check.mjs"), "utf8"), "export default true;\n");
```

- [ ] **Step 2: Add validation and traversal tests**

Assert invalid IDs, invalid versions, missing `SKILL.md`, `../outside` file entries, and malformed dependency/credential declarations fail with a controlled error.

- [ ] **Step 3: Implement package helpers**

Implement `readSkillPackManifest(root)`, `validateSkillPack(root)`, `listPackFiles(root)`, and `normalizePackDependencies(value)`. Require `amh-pack.json` to keep `id`, `version`, and a non-empty `skills` array; resolve files relative to the package root and reject paths outside it.

- [ ] **Step 4: Refactor import to preserve trees**

Keep `importSharedSkill` backward-compatible for a single Skill, and add `importSharedPack`. Copy files recursively into `skill-store/packages/<id>/<version>`; if the same version has a different content hash, store the immutable hash suffix. Write `skill.json`, `pack.json`, and `provenance.json` without secrets.

- [ ] **Step 5: Run package tests**

Run: `node --test tests/shared-skill-lifecycle.test.mjs tests/shared-skills.test.mjs`

Expected: all package, single Skill, idempotency, and traversal tests pass.

### Task 3: Model project lifecycle, updates, and projections

**Files:**
- Modify: `src/shared-skill-project.js`
- Modify: `src/shared-skill-materializer.js`
- Test: `tests/shared-skill-lifecycle.test.mjs`

- [ ] **Step 1: Write lifecycle tests**

Cover `enabled`, `disabled`, exact/tilde/caret constraints, missing dependency, update available, rollback to an older immutable version, managed projection drift, and refusal to overwrite an unmanaged file.

```js
const manifest = await setProjectSkill(projectRoot, "lark-doc", "~1.0.0");
assert.deepEqual(manifest.skills["lark-doc"], { constraint: "~1.0.0", enabled: true });
assert.equal(selectProjectSkills(manifest, versions)[0].version, "1.0.2");
```

- [ ] **Step 2: Implement explicit lifecycle operations**

Add `disableProjectSkill`, `selectProjectSkillVersion`, and `getSkillLifecycleState`. Lifecycle state must include `registryVersion`, `selectedVersion`, `enabled`, `dependencyStatus`, `updateAvailable`, and `projectionStatus`.

- [ ] **Step 3: Preserve and inspect projections safely**

Extend materializer output with `synced`, `drifted`, `missing`, and `failed` records. Before writing, compare existing files with `.amh-managed.json`; reject unmanaged conflicts and allow an explicit `forceManaged` only for files already marked AMH-managed.

- [ ] **Step 4: Run lifecycle tests**

Run: `node --test tests/shared-skill-lifecycle.test.mjs tests/shared-skills.test.mjs`

Expected: lifecycle, rollback, drift, and compatibility tests pass.

### Task 4: Expose safe API actions

**Files:**
- Modify: `src/index.js`
- Test: `tests/dashboard-api.test.mjs`
- Test: `tests/shared-skill-lifecycle.test.mjs`

- [ ] **Step 1: Add API contract tests**

Assert these responses using a temporary `AI_MEMORY_DIR` and project:

```text
GET  /api/skills/scan                 -> aggregated groups with sources
GET  /api/skills                     -> registry, selected, lifecycle summary
GET  /api/skills/:id                 -> versions, dependencies, projections
POST /api/skills/install             -> single Skill or pack import
POST /api/skills/select              -> project version/enable selection
POST /api/skills/sync                -> per-target results and drift blockers
GET  /api/skills/doctor              -> actionable dependency/projection issues
```

- [ ] **Step 2: Implement route helpers**

Keep existing endpoints backward-compatible. Add explicit JSON errors with status 400 for invalid input, 404 for missing Skill/version, and 409 for unmanaged projection conflicts. Never include credential values in any response.

- [ ] **Step 3: Run API tests**

Run: `node --test --test-name-pattern "skill|Skill" tests/dashboard-api.test.mjs tests/shared-skill-lifecycle.test.mjs`

Expected: all matching API tests pass. If the existing dashboard server child-process leak prevents process exit, record the passing test count and stop only the test-owned child process.

### Task 5: Replace raw discovery list with deduplicated Skill operations UI

**Files:**
- Modify: `dashboard-next/src/pages/Skills.tsx`
- Modify: `dashboard-next/src/pages/Skills.css`
- Test: `tests/dashboard-next-structure.test.mjs`
- Test: `tests/shared-skill-lifecycle.test.mjs`

- [ ] **Step 1: Add UI contract tests**

Assert the page renders grouped source counts, conflict/update/disabled/drifted badges, pack rows, and action labels for import, compare, enable, disable, update, sync, retry, and rollback.

- [ ] **Step 2: Implement grouped view model**

Use `scan.groups` rather than raw source rows. Render one row per logical Skill, expand `sources` on demand, and show pack members under a collapsible pack row. Keep empty states distinct: no sources, no Registry imports, no project selections, and no current problems.

- [ ] **Step 3: Implement guarded actions**

Add confirmation dialogs for conflict selection, disabling referenced Skills, switching versions, and resolving drift. Show API errors inline and keep a successful action visible until the next refresh.

- [ ] **Step 4: Verify frontend**

Run: `node --test tests/dashboard-next-structure.test.mjs tests/shared-skill-lifecycle.test.mjs`

Expected: UI contract and lifecycle tests pass.

### Task 6: Integrate and verify

**Files:**
- Modify: `docs/shared-skill-layer.md`
- Modify: `README.md`
- Test: `tests/shared-skill-lifecycle.test.mjs`

- [ ] **Step 1: Document user workflow**

Document the recommended flow: scan, deduplicated review, import, project enable, target sync, update review, rollback, and conflict handling. Include the Feishu package example without assuming that every `lark-*` directory is a package.

- [ ] **Step 2: Run focused verification**

Run:

```powershell
node --test tests/shared-skill-lifecycle.test.mjs tests/shared-skills.test.mjs tests/dashboard-next-structure.test.mjs
npm.cmd --prefix dashboard-next run build
git diff --check
```

Expected: all focused tests pass, frontend build succeeds, and diff check is clean.

- [ ] **Step 3: Run broader verification and inspect status**

Run: `node --test --test-concurrency=1 tests/domain-pack-skill-registry.test.mjs tests/shared-skills.test.mjs tests/external-integrations.test.mjs`

Expected: all selected tests pass; no source Agent directory is modified.

- [ ] **Step 4: Commit the implementation**

```powershell
git add src/shared-skill-scan.js src/shared-skills.js src/shared-skill-pack.js src/shared-skill-project.js src/shared-skill-materializer.js src/index.js dashboard-next/src/pages/Skills.tsx dashboard-next/src/pages/Skills.css tests/shared-skill-lifecycle.test.mjs tests/shared-skills.test.mjs tests/dashboard-api.test.mjs tests/dashboard-next-structure.test.mjs docs/shared-skill-layer.md README.md
git commit -m "feat: manage skill lifecycle and packs"
```

### Task 7: Connect Skills, memories, projects, tasks, and context packs

**Files:**
- Create: `src/relations.js`
- Modify: `src/index.js`
- Test: `tests/relations.test.mjs`
- Modify: `docs/memory-execution-boundary.md`
- Modify: `docs/shared-skill-layer.md`

- [ ] **Step 1: Write relation tests**

Assert append-only relation events, duplicate reuse, revoke events, project-derived memory/task suggestions, and Skill-derived task/memory suggestions. Existing memories must remain byte-for-byte unchanged.

- [ ] **Step 2: Implement relation storage**

Store normalized edges in `relations/events.jsonl` with `from`, `to`, `relation`, `source`, `confidence`, `evidence`, and `status`. Supported entities are `memory`, `skill`, `skill-pack`, `project`, `task`, `workflow`, `agent`, and `tool`.

- [ ] **Step 3: Expose relation APIs**

Implement `GET /api/relations?entityType=<type>&entityId=<id>`, `POST /api/relations`, and `POST /api/relations/revoke`. Return explicit relations separately from inferred suggestions, and never copy secrets into relation evidence.

- [ ] **Step 4: Connect context assembly**

When a context pack has a task or project, use explicit project/Skill links first, then inferred suggestions, then existing text search. Include related memories and Skills with source/confidence metadata so agents can distinguish facts from suggestions.

- [ ] **Step 5: Document relationship semantics**

Document that `metadata.project`, task `skills`, and tags are compatibility signals; the relation event store is the authoritative mutable link layer and can revoke incorrect inferred/explicit links without rewriting memory history.

