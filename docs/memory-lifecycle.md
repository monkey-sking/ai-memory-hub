# Durable Memory Lifecycle Policy

This policy defines how durable memories move through the local hub without
turning the hub into a lossy cache or a model-dependent memory service.

For the boundary between durable memory, shared collaboration state, and runtime
execution state, see [Memory And Execution State Boundary](memory-execution-boundary.md).

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
- `refs`: normalized context references used by thread-aware search:
  - `refs.thread`: conversation, radio, dispatch, task, or workflow thread id.
  - `refs.threadKey`: exact relay thread key when known.
  - `refs.taskId`: related shared task id.
  - `refs.workflowId`: related workflow id.
  - `refs.radioId`: related radio/message id.
  - `refs.dispatchId` and `refs.sourceId`: optional execution/source ids.

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

## Operation Abstraction

Memory updates must be modeled as append-only operations over durable records,
not as in-place edits to `memories/ledger.jsonl`. The operation log is the
auditable source of lifecycle intent; rebuilt indexes apply those operations as
an overlay when deciding search ranking, snapshot visibility, and lifecycle
links.

The planned storage surface is:

- `memories/operations.jsonl`: append-only operation events.
- `memories/operation-state.json`: optional derived state for fast lookup. It
  may be rebuilt from `ledger.jsonl` and `operations.jsonl`.

Each operation should use this shape:

```json
{
  "id": "op-{timestamp}-{hash}",
  "ts": "2026-06-09T10:00:00.000Z",
  "source": "codex",
  "action": "annotate",
  "target": {
    "recordId": "memory-record-id",
    "localEventId": "inbox-event-id",
    "thread": "relay-lifecycle-2026-06-09",
    "project": "ai-memory-hub"
  },
  "reason": "manual-review",
  "patch": {
    "lifecycle": {
      "state": "archived",
      "reason": "superseded-by"
    },
    "tags": ["relay", "workflow"]
  },
  "refs": {
    "supersedes": [],
    "supersededBy": ["memory-record-id-2"],
    "taskId": "",
    "workflowId": "",
    "radioId": ""
  }
}
```

Supported actions are:

- `create`: append a new durable fact through the existing inbox and sync path.
- `annotate`: add normalized metadata or lifecycle hints without changing the
  source text.
- `supersede`: link an old record to a newer correction or replacement.
- `archive`: lower snapshot exposure while keeping the record searchable.
- `pin`: raise snapshot exposure for a reviewed high-value record.
- `revoke`: hide a record from startup snapshots and default search because it
  is unsafe or clearly wrong, while keeping an audit trail.
- `review`: record that a human or tool checked the memory and either confirmed
  or requested follow-up.

Index rebuilds should apply operations in timestamp order. Conflicting
operations are resolved by the latest operation for the same lifecycle field,
except `refs` fields should merge by id. `revoke` has higher visibility priority
than `pin` or `archive`: a revoked record stays out of `MEMORY.md` and default
search unless the user asks for revoked records explicitly.

### CLI And API Shape

The CLI should expose one operation-oriented namespace rather than separate
commands that rewrite records:

```bash
ai-memory-hub memory op create --action annotate --record <id> --reason manual-review --patch @patch.json --by codex
ai-memory-hub memory op create --action supersede --record <old-id> --superseded-by <new-id> --reason correction --by codex
ai-memory-hub memory op list --record <id>
ai-memory-hub memory op apply --dry-run
```

Convenience aliases may be added later, such as `memory archive`, `memory pin`,
or `memory revoke`, but they should still append operation events internally.

The dashboard/API equivalent should mirror the same event model:

- `POST /api/memory/operations`: append one operation.
- `GET /api/memory/operations?record=<id>`: inspect operation history.
- `POST /api/memory/operations/apply?dryRun=1`: preview derived lifecycle
  overlays before rebuilding snapshots.

The API must not expose a direct "edit ledger record" endpoint.

### Thread Compatibility

Operations should carry optional task, workflow, radio, and thread references so
thread-aware search can explain why a memory changed. A supersede operation
created from a correction should link:

- the old memory record,
- the new correction record,
- the task or workflow where the correction was produced,
- the radio thread or dispatch thread that requested review.

This keeps memory lifecycle changes compatible with shared task/workflow state
without mixing runtime delivery state into durable memory facts.

### Safety Rules

- Never edit `memories/ledger.jsonl` in place for lifecycle changes.
- Never delete a ledger record as part of archive, supersede, pin, review, or
  revoke.
- Require a short reason for every operation except `create`.
- Preserve unknown operation fields during rebuilds for forward compatibility.
- Treat destructive cleanup as a separate maintenance command with backup and
  explicit user confirmation.

## Retention

Default retention is:

- Ledger records: retained indefinitely unless a user explicitly performs a
  destructive maintenance operation.
- Derived indexes and snapshots: rebuilt freely from the ledger.
- Startup snapshot: bounded by `sync.snapshotLimit`, `sync.coreLimit`, and
  `sync.recentLimit`; when core/recent limits are omitted, they are derived
  from `sync.snapshotLimit`.
- Backups: governed by `sync.backupRetention`.
- Indexed inbox events: archived or retained according to
  `sync.archiveIndexedInboxItems`.

Age alone should not remove a durable memory. Age may reduce snapshot priority
through ranking, but deletion must be explicit and backed up.

## Deferred Work

The following are intentionally deferred to separate tasks:

- Thread-aware linking between corrections, stale facts, and source events.
- Implementation of the operation abstraction described above.
- Automatic expiration, stale review queues, and destructive cleanup commands.

This keeps the current lifecycle policy conservative: structured enough for
agents to reason about, but not yet a mutating lifecycle engine.
