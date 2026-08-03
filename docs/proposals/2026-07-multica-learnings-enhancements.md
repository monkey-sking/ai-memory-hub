# Proposal: AMH Enhancements Inspired by Multica Benchmarking

> **Author**: Gemini  
> **Date**: 2026-07-23  
> **Status**: Proposed / Pending Implementation  
> **Reference**: [multica-ai/multica](https://github.com/multica-ai/multica)

---

## 📌 Executive Summary

Based on architectural benchmarking against [Multica](https://github.com/multica-ai/multica), this document outlines three key enhancement modules for **AI Memory Hub (AMH)**. While AMH excels in local-first privacy, shared memory ledger, and Git worktree execution isolation, Multica presents compelling UX patterns around **Compounding Skills (auto-mining skills from completed tasks)**, **Visual Agent Teammate Kanban**, and **GitHub Lifecycle Integration**.

Implementing these feature modules in AMH will enable seamless knowledge compounding, better visual multi-agent observability, and tighter Git/PR workflow alignment for team operations.

---

## 🛠️ Feature Module 1: Compounding Skill Mining Workflow (`amh-skill-mining`)

### Background & Problem Statement
Currently, AMH supports pre-defined `recipes` and a `shared skill layer`. However, when an agent successfully solves a complex debugging case or feature request (e.g. migrating DB schemas or setting up a deployment pipeline), that procedural knowledge remains in raw execution logs or transient radio messages.

### Key Requirements
1. **Auto Skill Extraction Post-Task**:
   - When a task reaches `done` status with a successful Quality Gate check, trigger an optional `skill-miner` hook.
   - Summarize the key reusable steps, patterns, and code snippets into standard markdown Skill format (`~/.ai-memory/skills/<skill-name>/SKILL.md`).
2. **Skill Registry & CLI**:
   - `ai-memory-hub skill list`
   - `ai-memory-hub skill search <query>`
   - `ai-memory-hub skill attach --id <task-id> <skill-name>`
3. **Automatic Context Injection**:
   - When dispatching new tasks, match relevant Skills via FTS5 / vector search and auto-pack them into `context pack`.

---

## 🖥️ Feature Module 2: Live Agent Teammate Kanban & Visual UX (`amh-dashboard-live-agents`)

### Background & Problem Statement
AMH Dashboard currently provides React/shadcn management for tasks, workflows, and memory. However, Multica's UX treats agents as "living teammates" on a real-time Kanban board with clear state transitions, live terminal/stdout streams, and active blocker indicators.

### Key Requirements
1. **Teammate Avatar & Live Status**:
   - Display each registered runner/agent (Claude, Codex, Gemini, Antigravity, QClaw, etc.) as an active team member card.
   - Real-time indicator for `Idle`, `In Progress (Task #123)`, `Blocked (Waiting for Approval)`, `Quality Check Failed`.
2. **Interactive Task Kanban**:
   - Drag-and-drop or one-click agent assignment (`Unassigned` -> `Claimed by Claude` -> `In Progress` -> `Review by Gemini` -> `Done`).
3. **Live Output Stream Bridge**:
   - Connect WebSocket / CDP bridge to stream dispatch log updates in real-time on the Dashboard board.

---

## 🔗 Feature Module 3: GitHub Issue & PR Lifecycle Integration (`amh-github-bridge`)

### Background & Problem Statement
Multica provides seamless integration with GitHub, linking issue tickets (e.g. `MUL-123`) to PRs and automatically closing issues when PRs are merged. AMH needs a lightweight local-first equivalent.

### Key Requirements
1. **Task ID to Commit/PR Linking**:
   - Auto-format commit messages with `[AMH-TASK-ID]` during worktree commits.
2. **Git Hook & Webhook Sync**:
   - Provide `ai-memory-hub gh sync` CLI tool or git post-commit hook.
   - When a PR referencing `[AMH-TASK-123]` is merged on GitHub/GitLab, automatically update the local task status to `done`.
3. **PR Auto-Review Trigger**:
   - Trigger the `multi-tool-review` recipe automatically upon PR creation.

---

## 📋 Recommended Action Plan & Tasks

For active tracking, the following tasks have been registered in the AMH shared task queue:

1. `[AMH-ENHANCE-1] Implement Compounding Skill Mining workflow (auto extract skills on task completion)`
2. `[AMH-ENHANCE-2] Upgrade AMH Dashboard with Live Agent Kanban & progress visualization`
3. `[AMH-ENHANCE-3] Build GitHub Issue and PR auto-linking lifecycle integration`

---
*Created automatically by Gemini during Multica benchmarking analysis.*
