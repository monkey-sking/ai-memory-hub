# Handoff Bus Sync Model

**Author:** Claude  
**Date:** 2026-06-21  
**Status:** Design Specification

## Overview

The **handoff bus** is a coordination layer that synchronizes work state across multiple AI tools using the existing radio, task, and workflow infrastructure. It provides a unified view of "who is working on what" and enables smooth handoffs between tools.

## Problem Statement

Current state:
- Radio messages track communication but not ownership
- Tasks track assignments but not active work sessions
- Workflows track progress but not real-time handoffs
- No unified "current work state" across all tools
- Hard to know if another tool is already working on something

Needed:
- Real-time work session tracking
- Ownership claims and releases
- Handoff coordination (explicit transfers)
- Conflict detection (two tools claiming same work)
- State synchronization across tools

## Handoff Bus Concepts

### 1. Work Sessions

A **work session** represents an active work period by a tool:

```json
{
  "id": "session_abc123",
  "type": "handoff.session",
  "tool": "claude",
  "project": "ai-memory-hub",
  "workType": "task|workflow|ad-hoc",
  "workId": "task:xyz789",
  "status": "active|paused|completed|abandoned",
  "claimedAt": "2026-06-21T06:00:00.000Z",
  "lastHeartbeat": "2026-06-21T06:15:00.000Z",
  "completedAt": null,
  "context": {
    "description": "Implement VS Code integration",
    "priority": "normal",
    "assignedBy": "human"
  }
}
```

### 2. Handoff Events

A **handoff event** represents an explicit transfer of work:

```json
{
  "id": "handoff_def456",
  "type": "handoff.transfer",
  "from": "claude",
  "to": "codex",
  "workType": "task",
  "workId": "task:xyz789",
  "reason": "Claude completed implementation, Codex will review",
  "transferredAt": "2026-06-21T06:30:00.000Z",
  "accepted": true,
  "acceptedAt": "2026-06-21T06:31:00.000Z"
}
```

### 3. Sync State

A **sync state** is the unified view of all active work:

```json
{
  "activeSessions": [
    {
      "tool": "claude",
      "workId": "task:abc",
      "status": "active",
      "since": "2026-06-21T06:00:00.000Z"
    },
    {
      "tool": "codex",
      "workId": "workflow:def",
      "status": "active",
      "since": "2026-06-21T05:45:00.000Z"
    }
  ],
  "pendingHandoffs": [
    {
      "from": "gemini",
      "to": "claude",
      "workId": "task:ghi",
      "reason": "Review needed"
    }
  ],
  "recentCompletions": [
    {
      "tool": "claude",
      "workId": "task:jkl",
      "completedAt": "2026-06-21T05:30:00.000Z"
    }
  ]
}
```

## Storage Model

### Session Log

`<memoryDir>/handoff/sessions.jsonl` - Append-only session events:

```jsonl
{"type":"handoff.session.start","id":"session_1","tool":"claude","workId":"task:123","ts":"2026-06-21T06:00:00.000Z"}
{"type":"handoff.session.heartbeat","id":"session_1","tool":"claude","ts":"2026-06-21T06:15:00.000Z"}
{"type":"handoff.session.complete","id":"session_1","tool":"claude","result":"success","ts":"2026-06-21T06:30:00.000Z"}
```

### Handoff Log

`<memoryDir>/handoff/transfers.jsonl` - Append-only handoff events:

```jsonl
{"type":"handoff.transfer.offer","id":"handoff_1","from":"claude","to":"codex","workId":"task:123","reason":"Ready for review","ts":"2026-06-21T06:30:00.000Z"}
{"type":"handoff.transfer.accept","id":"handoff_1","to":"codex","ts":"2026-06-21T06:31:00.000Z"}
{"type":"handoff.session.start","id":"session_2","tool":"codex","workId":"task:123","parentSession":"session_1","ts":"2026-06-21T06:31:00.000Z"}
```

### Materialized View

`<memoryDir>/handoff/state.json` - Current active state (rebuilt from logs):

```json
{
  "version": 1,
  "updatedAt": "2026-06-21T06:31:00.000Z",
  "activeSessions": { /* indexed by tool */ },
  "workOwnership": { /* indexed by workId */ },
  "pendingHandoffs": [],
  "staleSessionThresholdMs": 900000
}
```

## Integration with Existing Systems

### Radio Messages

Radio messages remain for **communication**, handoff bus tracks **ownership**:

```javascript
// Radio: Communication
{
  "type": "note",
  "from": "claude",
  "to": "codex",
  "text": "Implementation complete, ready for review"
}

// Handoff: Ownership transfer
{
  "type": "handoff.transfer",
  "from": "claude",
  "to": "codex",
  "workId": "task:123",
  "reason": "Ready for review"
}
```

### Tasks

Tasks track **assignment**, handoff bus tracks **active work**:

```javascript
// Task: Assignment (long-lived)
{
  "id": "task:123",
  "assignee": "codex",  // Who should work on it
  "status": "claimed"
}

// Handoff: Active session (ephemeral)
{
  "tool": "codex",
  "workId": "task:123",
  "status": "active",
  "claimedAt": "2026-06-21T06:31:00.000Z"
}
```

### Workflows

Workflows track **step progression**, handoff bus tracks **who is executing**:

```javascript
// Workflow: Progress
{
  "id": "workflow:456",
  "status": "in_progress",
  "plan": "...",
  "executor": "claude"
}

// Handoff: Active execution
{
  "tool": "claude",
  "workId": "workflow:456",
  "status": "active",
  "context": { "currentStep": "implementation" }
}
```

## CLI Commands

### Session Management

```bash
# Start a work session
ai-memory-hub handoff start --work-id task:123 --tool claude

# Send heartbeat (keep session alive)
ai-memory-hub handoff heartbeat --session-id session_abc

# Complete session
ai-memory-hub handoff complete --session-id session_abc --result success

# Abandon session
ai-memory-hub handoff abandon --session-id session_abc --reason "blocked"
```

### Handoff Operations

```bash
# Offer handoff to another tool
ai-memory-hub handoff offer \
  --from claude \
  --to codex \
  --work-id task:123 \
  --reason "Ready for review"

# Accept handoff
ai-memory-hub handoff accept --handoff-id handoff_abc

# Reject handoff
ai-memory-hub handoff reject --handoff-id handoff_abc --reason "busy"
```

### State Queries

```bash
# Show all active sessions
ai-memory-hub handoff status

# Show sessions by tool
ai-memory-hub handoff status --tool claude

# Show sessions by work ID
ai-memory-hub handoff status --work-id task:123

# Show pending handoffs
ai-memory-hub handoff pending

# Show recent completions
ai-memory-hub handoff history --limit 10
```

## Heartbeat Mechanism

Sessions require periodic heartbeats to stay active:

**Default:** 15 minutes between heartbeats  
**Stale threshold:** 15 minutes since last heartbeat  
**Auto-abandon:** Sessions without heartbeat for 30 minutes

```javascript
// Heartbeat sent by active tools
setInterval(() => {
  if (activeWorkSession) {
    sendHeartbeat(activeWorkSession.id);
  }
}, 15 * 60 * 1000); // Every 15 minutes
```

## Conflict Detection

### Same Work, Multiple Tools

**Scenario:** Two tools try to claim the same work simultaneously.

**Resolution:**
1. First claim wins (timestamp ordering)
2. Second tool receives conflict error
3. Second tool can:
   - Wait for handoff
   - Request explicit transfer
   - Work on different task

```bash
# Claude claims task:123 at 06:00:00
ai-memory-hub handoff start --work-id task:123 --tool claude

# Codex tries to claim task:123 at 06:00:05
ai-memory-hub handoff start --work-id task:123 --tool codex
# Error: Work already claimed by claude at 2026-06-21T06:00:00.000Z
```

### Stale Sessions

**Scenario:** Tool crashes without completing session.

**Resolution:**
1. Heartbeat expires after 15 minutes
2. Session marked as stale after 30 minutes
3. Other tools can forcibly claim after staleness
4. Original tool can resume if within grace period

## Dashboard Integration

### Active Work Panel

```
┌─ Active Work ───────────────────────────────┐
│ Claude    task:abc123    Implementation     │
│           15m ago        ai-memory-hub       │
│                                              │
│ Codex     workflow:def   Review             │
│           2m ago         feature-auth        │
│                                              │
│ Gemini    task:ghi789    Testing            │
│           45s ago        api-refactor        │
└──────────────────────────────────────────────┘
```

### Pending Handoffs

```
┌─ Pending Handoffs ──────────────────────────┐
│ Claude → Codex                              │
│ task:abc123 "Ready for review"              │
│ Offered 5m ago                              │
│ [Accept] [Reject]                           │
└──────────────────────────────────────────────┘
```

### Recent Activity

```
┌─ Recent Activity ───────────────────────────┐
│ ✓ Claude completed task:jkl456   10m ago    │
│ → Claude handed off to Codex      5m ago    │
│ ✓ Codex accepted handoff          4m ago    │
│ ⚠ Gemini session stale            2m ago    │
└──────────────────────────────────────────────┘
```

## API Endpoints

### GET /api/handoff/status

Returns current sync state:

```json
{
  "activeSessions": [...],
  "pendingHandoffs": [...],
  "recentCompletions": [...]
}
```

### POST /api/handoff/start

Start a work session:

```json
{
  "tool": "claude",
  "workId": "task:123",
  "workType": "task",
  "context": {}
}
```

### POST /api/handoff/transfer

Offer a handoff:

```json
{
  "from": "claude",
  "to": "codex",
  "workId": "task:123",
  "reason": "Ready for review"
}
```

### POST /api/handoff/heartbeat

Keep session alive:

```json
{
  "sessionId": "session_abc"
}
```

## Workflow Integration

### Recipe Step Handoffs

In workflows, handoffs are automatic between steps:

```json
{
  "steps": [
    {
      "id": "plan",
      "role": "planner",
      "task": "Define scope"
    },
    {
      "id": "implement",
      "role": "executor",
      "task": "Implement features",
      "dependsOn": ["plan"]
    }
  ]
}
```

When "plan" completes:
1. Planner session completes
2. Automatic handoff to executor
3. Executor session starts
4. Executor receives context from planner

## Use Cases

### Use Case 1: Task Handoff

```bash
# Claude implements
ai-memory-hub handoff start --work-id task:123 --tool claude
# ... Claude works ...
ai-memory-hub handoff complete --session-id session_1

# Automatic handoff to reviewer
ai-memory-hub handoff offer --from claude --to codex --work-id task:123

# Codex accepts and reviews
ai-memory-hub handoff accept --handoff-id handoff_1
ai-memory-hub handoff start --work-id task:123 --tool codex
```

### Use Case 2: Collision Avoidance

```bash
# Check before claiming
ai-memory-hub handoff status --work-id task:123
# Output: No active session

# Safe to claim
ai-memory-hub handoff start --work-id task:123 --tool claude
```

### Use Case 3: Stale Session Recovery

```bash
# Tool crashes, 30 minutes pass
# Another tool checks status
ai-memory-hub handoff status --work-id task:123
# Output: Stale session detected (claude, 35m ago)

# Force claim after staleness
ai-memory-hub handoff start --work-id task:123 --tool codex --force
```

## Benefits

1. **Visibility** - See who is working on what in real-time
2. **Coordination** - Explicit handoffs prevent conflicts
3. **Resilience** - Stale session detection and recovery
4. **History** - Full audit trail of work ownership
5. **Dashboard** - Unified view of active work across tools

## Future Enhancements

1. **Session Replay** - Reconstruct work history from logs
2. **Work Queues** - Auto-assign tasks from queue to available tools
3. **Load Balancing** - Distribute work based on tool availability
4. **Priority Preemption** - Higher priority work can interrupt lower
5. **Session Snapshots** - Save partial work for resumption
6. **Cross-Machine Sync** - Sync handoff state across multiple machines

## See Also

- [Radio Messages](../src/index.js#radio) - Communication layer
- [Task Management](../src/index.js#tasks) - Work assignment
- [Workflow System](../src/index.js#workflows) - Process orchestration
- [Dispatch System](./dispatch-system.md) - Execution coordination
