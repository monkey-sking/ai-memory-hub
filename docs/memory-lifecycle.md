# Durable Memory Lifecycle Policy

This policy defines how durable memories move through the local hub without
turning the hub into a lossy cache or a model-dependent memory service.

## Goals

- Keep the ledger durable and auditable.
- Keep `MEMORY.md` small enough for AI tools to read cheaply.
- Make index records structured enough for filtering, search, and future stale
  handling.
- Avoid destructive automatic deletion of long-lived facts.

## Storage Model

Durable memory has three storage surfaces:

- `memories/ledger.jsonl`: the append-only durable record of synced memory
  events. Sync and index commands must not delete ledger entries as part of
  normal lifecycle management.
- `memories/index.json` and `INDEX.md`: rebuilt derived indexes. These may add
  canonical structure, ranking, topics, and lifecycle hints without changing
  the source ledger fact.
- `MEMORY.md`: a compact snapshot for agent startup context. It is intentionally
  lossy and should contain only the most useful core and recent working context.

Inbox files are not durable memory until `sync` indexes them. Indexed inbox
events may be archived under `synced/` according to the existing config.

## Canonical Fields

The index schema uses these lifecycle-relevant fields:

- `schemaVersion`: current structured index schema version.
- `kind`: normalized memory kind, such as `preference`, `project`, `workflow`,
  `correction`, `lesson`, `reference`, `raw`, or `note`.
- `project`: normalized project identifier when known.
- `tags`: normalized tag array.
- `scope`: inferred or supplied scope, such as `user`, `project`, `workflow`,
  `memory-hub`, or `general`.
- `confidence`: numeric value from `0` to `1`; missing values default to `1`.
- `importance`: derived score used for ranking.
- `layer`: derived snapshot tier: `core`, `working`, or `archive`.

Unknown metadata fields should be preserved. The hub should normalize known
fields for search and display, not strip tool-specific context.

The next lifecycle extension should use a nested `lifecycle` object instead of
overloading `layer`:

- `lifecycle.state`: `active`, `stale`, `archived`, `superseded`, or `revoked`.
- `lifecycle.reason`: short reason, such as `expired`, `manual-archive`,
  `low-confidence`, or `superseded-by`.
- `lifecycle.reviewAfter`: ISO timestamp for review, not deletion.
- `lifecycle.expiresAt`: ISO timestamp for temporary facts. Expired records
  should be hidden from `MEMORY.md` by default but kept in the ledger and index.
- `lifecycle.supersedes` and `lifecycle.supersededBy`: record ids or stable
  references for corrections and preference changes.

The field name `lifecycle.state=archived` means a record has been deliberately
lowered in exposure. It is different from `layer=archive`, which is only the
current ranking tier produced during index rebuild.

## Layers

Layers describe how likely a memory is to appear in startup context:

- `core`: stable preferences, corrections, workflow rules, and high-importance
  durable facts. These are eligible for the compact `MEMORY.md` core section.
- `working`: recent project facts, references, lessons, and medium-importance
  context. These are eligible for the recent working section.
- `archive`: low-priority or raw history retained in the ledger and index, but
  excluded from startup snapshots by default.

Layer assignment is derived from `kind`, `importance`, and topic signals during
index rebuilds. It is not a deletion or retention state.

## Stale And Superseded Memories

The current policy does not automatically delete or hide stale durable facts.
When a fact becomes wrong, tools should append a new `correction` or `lesson`
memory that clearly states the corrected rule or fact. The corrected record
should rank into `core` or `working`, while the old record remains auditable in
the ledger and searchable in the index.

Future implementation may add the explicit `lifecycle` fields listed above, but
they should become mutating CLI behavior only after the operation abstraction and
thread-aware linking tasks define how records reference one another.

## Retention

Default retention is:

- Ledger records: retained indefinitely unless a user explicitly performs a
  destructive maintenance operation.
- Derived indexes and snapshots: rebuilt freely from the ledger.
- Startup snapshot: bounded by `sync.coreLimit` and `sync.recentLimit`.
- Backups: governed by `sync.backupRetention`.
- Indexed inbox events: archived or retained according to
  `sync.archiveIndexedInboxItems`.

Age alone should not remove a durable memory. Age may reduce snapshot priority
through ranking, but deletion must be explicit and backed up.

## Deferred Work

The following are intentionally deferred to separate tasks:

- Project and tag filter UX for search and snapshot views.
- Thread-aware linking between corrections, stale facts, and source events.
- A unified memory operation abstraction for explicit update, archive, pin, and
  supersede operations.
- Automatic expiration, stale review queues, and destructive cleanup commands.

This keeps the current lifecycle policy conservative: structured enough for
agents to reason about, but not yet a mutating lifecycle engine.
