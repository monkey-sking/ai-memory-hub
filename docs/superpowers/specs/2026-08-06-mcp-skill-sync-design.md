# AMH MCP and Skill Synchronization Design

**Status:** Approved for implementation

## Goal

Add a local-first MCP and Skill synchronization layer to ai-memory-hub, modeled on CCSwitch's unified registry plus per-client adapters, while preserving unmanaged user configuration and requiring explicit conflict application.

## Scope

The first release supports Claude, Codex, Gemini, and OpenCode. It manages MCP server definitions and installed/shared Skills. It provides import, list, diff, sync, remove, and status operations through the CLI and exposes read/write operations through the existing AMH MCP server.

## Architecture

AMH stores normalized extension records in its existing per-user memory/config directory. MCP records contain an id, normalized server spec, enabled client set, metadata, and provenance. Skill records contain an id, source/path metadata, enabled client set, content hash, and materialization state. Client adapters own discovery, parsing, normalization, and serialization for each target configuration format.

Import reads all supported client files and merges only records not already managed. `diff` compares the registry projection with current client files and reports additions, updates, removals, and conflicts. `sync` defaults to preview; `--apply` writes only non-conflicting changes, creates a timestamped backup, and uses atomic replacement. `--force` is required to replace a conflicting managed entry. Unmanaged entries are always preserved.

## MCP Normalized Model

```json
{
  "id": "context7",
  "kind": "mcp",
  "server": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@upstash/context7-mcp"],
    "env": {}
  },
  "apps": {"claude": true, "codex": true, "gemini": false, "opencode": true},
  "managed": true,
  "source": "import|manual|amh",
  "updatedAt": "ISO-8601"
}
```

Supported types are `stdio`, `http`, and `sse`. Unknown extension fields are preserved under `server.extra` and copied only when the target adapter supports them.

## Skill Normalized Model

```json
{
  "id": "ai-memory-hub",
  "kind": "skill",
  "source": {"type": "local", "path": "...", "repo": null, "ref": null},
  "contentHash": "sha256:...",
  "apps": {"codex": true, "claude": true, "gemini": true, "opencode": true},
  "managed": true,
  "updatedAt": "ISO-8601"
}
```

Skill materialization reuses the current shared-skill materializer and scanner. Existing unmanaged skills are reported separately and are never deleted by a normal sync.

## Client Adapters

| Client | MCP path | Format | Skill path |
|---|---|---|---|
| Claude | `~/.claude.json` | JSON `mcpServers` | `~/.claude/skills` |
| Codex | `~/.codex/config.toml` | TOML `[mcp_servers.<id>]` | `~/.agents/skills` |
| Gemini | `~/.gemini/settings.json` | JSON `mcpServers` | `~/.gemini/skills` |
| OpenCode | `~/.config/opencode/opencode.json` | JSON `mcp` | `~/.config/opencode/skills` |

Adapters must tolerate missing files, preserve unrelated keys, normalize equivalent stdio/http/sse forms, and return structured diagnostics rather than silently dropping malformed entries.

## CLI and MCP Surface

CLI commands:

```text
ai-memory-hub mcp list [--app <client>]
ai-memory-hub mcp import [--app <client>|--all]
ai-memory-hub mcp diff [--app <client>|--all]
ai-memory-hub mcp sync [--app <client>|--all] [--apply] [--force]
ai-memory-hub mcp remove <id> [--app <client>] [--apply]
ai-memory-hub skill list|import|diff|sync|remove ...
```

The existing MCP server adds tools for registry list/import/diff/sync with an explicit `apply` boolean and never performs destructive writes unless requested.

## Safety and Conflict Rules

1. Preview is the default for all sync operations.
2. Every applied write creates a backup beside the target file with a timestamp and operation id.
3. Writes use a temporary file plus rename and retain original permissions where possible.
4. A conflict means the managed record and live client record differ in fields controlled by the registry. Conflicts are reported and skipped unless `--force` is supplied.
5. Unmanaged client entries remain untouched.
6. Secrets in `env` and `headers` are stored as values only in local config; event logs record field names and hashes, never secret values.
7. Import and sync emit AMH events with project/skill/task metadata when available.

## Verification

Tests must cover normalization, each adapter's read/write round trip, missing and malformed files, preservation of unmanaged keys, import idempotence, diff conflict classification, preview non-mutation, backup creation, atomic apply, Skill materialization integration, CLI JSON output, and MCP tool dispatch. A focused suite runs with `npm test`; adapter fixtures remain filesystem-isolated under temporary directories.

