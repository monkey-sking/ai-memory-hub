# AMH MCP and Skill Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement a local-first unified MCP/Skill registry with safe import, diff, sync, and client adapters for Claude, Codex, Gemini, and OpenCode.

**Architecture:** Add focused registry, adapter, and synchronization modules under `src/`; keep the existing shared-skill materializer as the Skill file-operation boundary; route CLI commands through `src/index.js`; extend `src/mcp-server.js` with explicit preview/apply tools. Use filesystem-isolated fixtures and atomic backup-aware writes.

**Tech Stack:** Node.js ESM, built-in `fs/path/crypto/os`, existing CLI command dispatcher, Node test runner.

---

### Task 1: Registry and normalized models

**Files:**
- Create: `src/extension-registry.js`
- Create: `tests/extension-registry.test.mjs`
- Modify: `src/index.js` to expose the configured AMH data directory helper if needed

- [ ] Write tests for MCP/Skill record validation, deterministic IDs, secret redaction in events, atomic JSON persistence, and idempotent upsert.
- [ ] Run `node --test tests/extension-registry.test.mjs` and confirm the new API is initially absent.
- [ ] Implement `readRegistry`, `writeRegistry`, `upsertRecord`, `removeRecord`, `normalizeMcpServer`, and `normalizeSkill` using a versioned JSON file under the existing memory directory.
- [ ] Run the focused test and confirm all registry cases pass.

### Task 2: Client adapter contract and JSON adapters

**Files:**
- Create: `src/extension-adapters.js`
- Create: `tests/extension-adapters-json.test.mjs`

- [ ] Write fixtures/tests for Claude `mcpServers`, Gemini `mcpServers`, and OpenCode `mcp`, including missing files, malformed entries, unrelated keys, and unmanaged-entry preservation.
- [ ] Define `createAdapter({app, homeDir})` with `readMcp`, `writeMcp`, `readSkills`, and `writeSkills` methods plus structured diagnostics.
- [ ] Implement JSON parsing/serialization with temp-file rename, timestamp backup, and mode preservation.
- [ ] Run the focused adapter tests.

### Task 3: Codex TOML adapter

**Files:**
- Create: `src/toml-lite.js`
- Modify: `src/extension-adapters.js`
- Create: `tests/extension-adapter-codex.test.mjs`

- [ ] Write round-trip tests for `[mcp_servers.<id>]`, command/args/env fields, unrelated TOML sections, and hostile IDs.
- [ ] Implement the narrow TOML reader/writer needed for Codex MCP sections, rejecting ambiguous syntax instead of rewriting it.
- [ ] Add the Codex adapter with `~/.codex/config.toml` and `~/.agents/skills` paths.
- [ ] Run the focused tests and `node --check` on changed modules.

### Task 4: Import, diff, and sync engine

**Files:**
- Create: `src/extension-sync.js`
- Create: `tests/extension-sync.test.mjs`

- [ ] Write tests for import idempotence, additions/updates/removals/conflicts, unmanaged preservation, preview non-mutation, `--force`, backups, and multi-app projections.
- [ ] Implement `importExtensions`, `diffExtensions`, and `syncExtensions` over the registry and adapters.
- [ ] Make normal apply skip conflicts, require `force` to replace them, and emit redacted AMH events.
- [ ] Integrate existing `shared-skill-materializer` for Skill writes and report unmanaged Skills separately.
- [ ] Run the focused sync suite.

### Task 5: CLI commands and JSON contract

**Files:**
- Modify: `src/index.js`
- Create: `tests/extension-cli.test.mjs`
- Modify: `docs/CLI.md`

- [ ] Add `mcp` and `skill` subcommands: `list`, `import`, `diff`, `sync`, `remove`, and `status` where applicable.
- [ ] Ensure sync defaults to preview and only `--apply` writes; support `--app` and `--all` selectors and stable JSON output.
- [ ] Add CLI tests using temporary AMH and HOME directories.
- [ ] Document examples, conflict behavior, backup location, and supported clients.
- [ ] Run CLI tests and `node src/index.js --help`.

### Task 6: MCP server tools

**Files:**
- Modify: `src/mcp-server.js`
- Create: `tests/mcp-extension-tools.test.mjs`

- [ ] Add `amh_extension_list`, `amh_extension_import`, `amh_extension_diff`, and `amh_extension_sync` with explicit `apply`/`force` booleans.
- [ ] Ensure tools return structured JSON and never apply writes unless `apply: true`.
- [ ] Add protocol-level tests for `tools/list` and representative `tools/call` requests.
- [ ] Run MCP tests and `node --check src/mcp-server.js`.

### Task 7: Full verification and handoff

**Files:**
- Modify: `docs/shared-skill-layer.md` if command integration needs documentation
- Modify: `docs/CLI.md` for final examples if gaps remain

- [ ] Run `npm test` and inspect failures without changing unrelated tests.
- [ ] Run `git diff --check` and `node --check` for every changed JavaScript module.
- [ ] Verify a clean temporary-home round trip for all four adapters, including a conflict and rollback backup.
- [ ] Record implementation and verification results in the shared task/workflow, then request review before claiming completion.

