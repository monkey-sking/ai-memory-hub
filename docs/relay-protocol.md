# Session Relay Protocol Design

For target identity semantics, see [Actor Model](actor-model.md). In this
document the `{tool}` segment of `threadKey` is a concrete target tool actor,
not a session id or workflow role.

## Thread ID Schema

**Unified Format**: `{tool}:{project}:{ref}`

- `tool`: Target agent (codex, claude, marvis, etc.)
- `project`: Project context (defaults to "default")
- `ref`: Stable reference ID (task ID, workflow ID, or message ID)

**Examples**:
- `claude:ai-memory-hub:task-abc123`
- `codex:ai-memory-hub:workflow-xyz789`
- `marvis:frontend:radio-msg456`

## Delivery States

### Message Lifecycle

```
pending → dispatched → (acked | failed) → [retrying] → (completed | abandoned)
```

**State Definitions**:
- `pending`: Created, awaiting dispatch
- `dispatched`: Sent to runner, awaiting response
- `acked`: Runner received and started processing
- `failed`: Dispatch failed (CLI error, timeout, etc.)
- `retrying`: In retry backoff
- `completed`: Final response received and linked
- `abandoned`: Max retries exceeded

### Status Tracking Structure

**File**: `state/relay-status.jsonl`

```json
{
  "id": "relay-{timestamp}-{hash}",
  "threadKey": "claude:ai-memory-hub:task-abc123",
  "sourceKind": "task",
  "sourceId": "task-abc123",
  "dispatchId": "radio:msg123",
  "state": "dispatched",
  "attempt": 1,
  "maxRetries": 3,
  "dispatchedAt": "2026-06-06T10:00:00Z",
  "ackTimeout": 300000,
  "sessionId": "claude-session-xyz",
  "exitCode": 0,
  "lastError": "",
  "nextRetryAt": ""
}
```

`sourceKind` is one of `radio`, `task`, or `workflow`. `sourceId` points at the durable source record, while `dispatchId` uses a typed prefix such as `radio:<id>`, `task:<id>`, or `workflow:<id>` so status lookup can resolve the source even when only a reference ID is known.

## Reply Threading

### Forward Thread Linking

**Radio Message**:
```json
{
  "id": "radio-msg123",
  "thread": "task-abc123",
  "replyTo": "",
  "project": "ai-memory-hub"
}
```

**Dispatch Job**:
```json
{
  "id": "task:task-abc123",
  "thread": "task-abc123",
  "threadKey": "claude:ai-memory-hub:task-abc123"
}
```

**Reply Message** (from agent back to hub):
```json
{
  "id": "radio-msg456",
  "from": "claude",
  "to": "codex",
  "thread": "task-abc123",
  "replyTo": "radio-msg123",
  "type": "response"
}
```

### Backward Status Notification

When dispatch completes, create status notification:

```json
{
  "id": "status-{hash}",
  "from": "ai-memory-hub",
  "to": "{original-from}",
  "type": "status",
  "thread": "{original-thread}",
  "replyTo": "{original-message-id}",
  "text": "Dispatched to {target}. Session: {sessionId}. Status: {state}.",
  "metadata": {
    "relayStatus": "completed",
    "sessionId": "...",
    "threadKey": "..."
  }
}
```

## Retry Strategy

### Exponential Backoff

```
attempt | delay
--------|-------
1       | immediate
2       | 30s
3       | 120s (2min)
4       | 300s (5min)
```

**Retry Conditions**:
- Exit code != 0
- Timeout (> 10min for CLI runners)
- Session error (JSON parse failure)
- Runner unavailable

**No Retry**:
- Exit code 0 (success)
- Manual abandonment
- Max retries exceeded (3)

### Retry State Machine

```javascript
{
  state: "failed",
  attempt: 2,
  nextRetryAt: "2026-06-06T10:02:00Z",
  retryReason: "Exit code 1: timeout"
}
```

## Implementation Notes

### Phase 1: State Tracking
1. Add `state/relay-status.jsonl` for delivery tracking
2. Update `appendDispatchLog` to write relay status entries
3. Read relay status in dispatch command to show delivery state

### Phase 2: Reply Threading
1. Add `replyTo` field to radio messages
2. When dispatch completes, send status notification back to `createdBy`
3. Link responses to original thread using `threadKey`

### Phase 3: Retry Logic
1. Add `dispatch retry` command to scan failed entries
2. Check `nextRetryAt` timestamp and retry eligible jobs
3. Update attempt count and backoff delay

### Phase 4: Session Continuity
1. Unified session state file: `state/sessions.json`
2. Map `{threadKey} → {sessionId}` for all agents (not just Claude)
3. Pass `--resume {sessionId}` or equivalent to agent runners

## Unified Notification Semantics

### Notification Types

**Radio message types** (already exist):
- `note`: Informational
- `request`: Asking for action
- `response`: Replying to request
- `review`: Asking for review
- `handoff`: Transferring work
- `status`: Delivery/state update (new)

### Cross-Agent Flow

**Example: Task dispatch with ack/reply**

1. **Create Task**:
   ```json
   {
     "id": "task-abc",
     "title": "Review README",
     "assignee": "claude",
     "status": "claimed"
   }
   ```

2. **Dispatch creates relay entry**:
   ```json
   {
     "threadKey": "claude:ai-memory-hub:task-abc",
     "state": "pending",
     "sourceKind": "task",
     "sourceId": "task-abc"
   }
   ```

3. **Runner executes** → state: `dispatched`
   
4. **On success** (exit 0):
   - State: `completed`
   - Extract session ID from JSON output
   - If the source is a task linked from one or more workflows, aggregate linked-task delivery state back onto each workflow (`deliveryState`, progress percent/status, retry metadata, response/status radio IDs, and dispatch report path).
   - Create status notification to task creator:
     ```json
     {
       "from": "ai-memory-hub",
       "to": "codex",
       "type": "status",
       "thread": "task-abc",
       "text": "Task dispatched to claude. Session: abc-xyz."
     }
     ```

5. **On failure**:
   - State: `failed` → `retrying`
   - Schedule retry with backoff
   - Notify creator of failure

6. **Agent response** (manual or auto):
   ```json
   {
     "from": "claude",
     "to": "codex",
     "type": "response",
     "thread": "task-abc",
     "replyTo": "radio-msg-original",
     "text": "README reviewed. Changes needed in section 3."
   }
   ```

## State Queries

**Check dispatch status**:
```bash
ai-memory-hub dispatch status --thread task-abc
ai-memory-hub dispatch status --thread-key claude:ai-memory-hub:task-abc
ai-memory-hub dispatch status --ref-id radio-msg123 --project ai-memory-hub
ai-memory-hub dispatch status --ref-id workflow-xyz --project ai-memory-hub
ai-memory-hub dispatch status --recent 10 --project ai-memory-hub
ai-memory-hub dispatch status --recent --state failed --to claude
```

Single-thread status queries return the latest relay state, full timeline, matched dispatch log entries, the resolved source object, and related radio/task/workflow objects for the same thread. Workflow source queries also include linked tasks in the related objects so workflow delivery state can be traced back to the task dispatches that produced it.

Recent status queries return the latest relay entry per thread plus summary counts grouped by state and tool across the full filtered result set. The returned `items` list is then capped by `--recent` or `--limit`, which is useful for scanning failed, retrying, acked, or abandoned work without opening one thread at a time.

**Retry failed dispatches**:
```bash
ai-memory-hub dispatch retry --project ai-memory-hub
```

**Show session continuity**:
```bash
ai-memory-hub session list --tool claude
```
