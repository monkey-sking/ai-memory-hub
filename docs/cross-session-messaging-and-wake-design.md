# Cross-Session Messaging and Wake Design

**Status:** MVP implemented
**Date:** 2026-08-08

## Purpose

This document records the reusable lessons from Claude Code's public
cross-session messaging model and defines the implementation boundary for AI
Memory Hub (AMH).

## Claude's Public Model

Claude Code exposes two conceptual tools for independent sessions:

- `ListAgents` discovers sessions that can be reached.
- `SendMessage` delivers text to one discovered session by name.

The message is text, not a copy of conversation history or files. To continue
the full conversation elsewhere, Claude resumes the session instead. The
receiver can reply through the same messaging mechanism. Claude may decide to
send a message proactively, or the user may request one.

The public documentation describes this contract, but not the local transport
or the receiver event loop. AMH should copy the semantics, not assume an
undocumented Claude protocol.

## Direct Delivery vs Wake/Resume

Direct delivery means a message reaches an already running session input queue
and receives an acknowledgement. A Radio record alone is durable intent, not
direct delivery.

Wake means making an idle or stopped session process a pending message. For
AMH's current Claude runner, the reliable portable primitive is a new runner
invocation with the recorded session id and `--resume`, passing the message as
the new prompt. This resumes conversation context; it does not inject input
into another terminal's interactive stdin.

## Current AMH State

AMH already provides session ids and inspection, Radio threads and replies,
relay status and retries, daemon/watch infrastructure, Claude `--resume`, and
actor semantics for tools, sessions, users, systems, and groups.

The current `session follow-up` operation writes a durable `follow_up` Radio
message associated with `sessionId`. It does not guarantee that a live Claude
process receives the message or that an idle session is automatically resumed.

## Proposed Architecture

```text
sender/tool -> AMH broker -> resolve session actor -> session adapter
                                      |-> live send
                                      |-> wake/resume runner
             <- ack / response / failure <- relay status + Radio audit record
```

### Session registry

Add a runtime projection for each known session:

```json
{
  "sessionId": "claude-session-xyz",
  "actor": "session:claude:claude-session-xyz",
  "tool": "claude",
  "project": "ai-memory-hub",
  "cwd": "D:/Project/ai-memory-hub",
  "state": "idle",
  "transport": "resume",
  "pid": null,
  "lastHeartbeat": "2026-08-08T00:00:00.000Z",
  "capabilities": ["message", "resume"]
}
```

The registry is a routing projection, not a replacement for existing logs. A
session actor is a valid direct message target; a tool actor remains the
fallback when no concrete session is known.

### Session adapter contract

```text
discover() -> sessions
inspect(sessionId) -> session state
send(sessionId, message) -> accepted or unsupported
wake(sessionId, message) -> dispatch/resume result
heartbeat(sessionId) -> liveness result
```

The broker owns authorization, deduplication, queueing, retries, and status
records. The adapter owns tool-specific transport.

## Delivery State Machine

```text
pending -> resolving -> accepted -> processing -> completed
                         |                       |
                         +-> failed -> retrying -> abandoned
```

For a live adapter, `accepted` means the target input queue accepted the
message, not merely that AMH appended a file. For a resume adapter, it means
the runner started with the expected session id and prompt.

Every transition should retain `messageId`, `sessionId`, `threadKey`,
`dispatchId`, `attempt`, and an idempotency key. Ambiguous timeouts must not
cause duplicate delivery.

## Phased Implementation

### Phase 1: reliable wake/resume

1. Resolve `session:<tool>:<sessionId>` before falling back to a tool.
2. Let a daemon worker watch pending session-targeted messages.
3. Call `send` for a verified live adapter.
4. Otherwise call `wake` with `--resume` when the runner supports it.
5. Record acceptance, processing, response, timeout, and retry states.

This gives Claude automatic wake/resume without controlling an interactive
terminal.

### Phase 2: live session adapters

Add a live transport only where a stable local or official API is available.
Do not treat PTY stdin injection as generic transport: it can interleave with
user input, permission prompts, or another model turn.

### Phase 3: remote sessions

Remote delivery needs an authenticated gateway or the tool's official remote
control channel. AMH should send an envelope through that gateway, not expose
local Radio files or accept unauthenticated session ids.

## Safety Rules

- A session id is a routing identifier, not an authorization credential.
- Validate sender, target project, and session ownership.
- Never execute message text as a shell command.
- Do not claim delivery when only the durable record was written.
- Use idempotency keys and bounded retries.
- Preserve project and cwd boundaries when resuming.
- Do not wake completed, failed, blocked, or stale sessions without policy.
- Do not inject interactive stdin unless an adapter owns framing and ack.

## Implemented MVP

The current MVP supports session-targeted Radio messages through `session:<tool>:<sessionId>`. Dispatch resolves the target tool, preserves the concrete session id, and passes it to resume-capable runners. `session follow-up` resolves a known session to a concrete target automatically. Agents without a verified live or resume adapter remain durable queue targets. Dispatch checks the latest session lifecycle state before consuming a session-targeted follow-up, so completed, delivered, done, cancelled, blocked, failed, stale, dead, and abandoned sessions are not woken.

## Recommendation

Implement Phase 1 first. It uses AMH capabilities already present, provides
observable automatic wake/resume behavior, and leaves live transport behind a
narrow adapter boundary instead of reproducing Claude's undocumented channel.


### Supervisor implementation note

AMH-owned dispatches now persist session lease events in state/session-leases.jsonl and retain the targeted sessionId for fresh-run outputs. The supervisor records lifecycle and can reconcile exited/stale leases; it does not claim a live PTY injection capability or a reliable child PID where the current runner uses synchronous invocation.

