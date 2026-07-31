# Why Use AMH With One AI Tool?

AI Memory Hub is useful even when only one AI tool is installed. Multi-agent handoff is an optional benefit, not the foundation.

## 1. Durable Context

AMH keeps durable project facts, corrections, workflow rules, and preferences outside a single chat session. The tool can start a new session by reading the compact memory snapshot and search the full ledger only when task-specific context is needed.

## 2. Loop Checkpoints

Long-running work can record task progress, workflow nodes, dispatch attempts, heartbeats, and verification results. If a terminal closes or a daemon becomes stale, the next session can inspect the last known state instead of reconstructing it from memory.

## 3. Local Recovery

The hub is local-first. JSONL event stores, backups, projections, and health checks make state inspectable and recoverable without requiring a hosted orchestration service.

## 4. Evidence and Review

Tasks and workflows can carry acceptance criteria, review dimensions, adversarial checks, progress signals, and explicit approval states. This makes “completed” different from “the assistant said it was done.”

## 5. Optional Expansion

When another AI tool is added later, the existing task, radio, workflow, context, and event history can be handed off without migrating the project into a new system. CDP file events and shared context packs provide the bridge.

## Minimum Setup

1. Install the shared skill layer for the tool.
2. Read `C:\Users\<user>\.ai-memory\MEMORY.md` at session start.
3. Use `ai-memory-hub task`, `workflow`, `context`, and `search` for durable work state.
4. Run `ai-memory-hub health` and `ai-memory-hub heartbeat check` when state looks inconsistent.

AMH does not replace the model provider, billing account, source control, or project documentation. It coordinates local context and evidence around them.
