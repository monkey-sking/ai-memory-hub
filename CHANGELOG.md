# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-07-13

### Added

#### Dashboard Redesign
- **React + TypeScript SPA** - Migrated from static HTML to Vite + React + TypeScript + Tailwind v4
- **shadcn/ui Components** - Modern UI component library integration
- **Light Blue Theme** - Redesigned from dark teal to clean light blue palette
- **Workflow Execution Graph** - Visual node-based workflow progress tracking
- **Task Purge UI** - Physical deletion of cancelled tasks from the dashboard
- **Memory Supersede Actions** - Supersede and update memories directly from the dashboard
- **GitHub Backup Controls** - Privacy-safe backup management with plaintext upload warnings
- **Search & Analytics** - Full-text search across memory, tasks, radio, and backups
- **Tools Icon Table** - Tool connections rendered as icon-based status table
- **Dashboard Backend Modularization** - 13+ extracted API modules (memory, tasks, workflows, projects, radio, dispatch, metrics, settings, health, search, backups, tools, realtime)

#### Workflow Node System (5 Phases)
- **Node-Level Execution History** - Track individual node execution with timestamps and status
- **Auto-Create Nodes** - Workflow nodes created automatically from recipe steps
- **Auto-Update Status** - Node status updated from command execution results
- **Status Derivation** - Workflow-level status derived from aggregated node states
- **Execution Graph UI** - Visual representation of workflow node dependencies and progress

#### Permission Policy Layer (3 Phases)
- **Data Layer + Resolver + CLI** - Policy rules, role resolution, and CLI commands
- **Dashboard Integration** - Policy management UI in the dashboard
- **Dispatch Preflight Enforcement** - Pre-dispatch policy checks and approval gates

#### Approval Gates
- **Data Layer + CLI** - Machine-readable approval gates for dispatch operations
- **Dispatch Integration** - Gates wired into the dispatch flow for automated enforcement

#### Quality Gate Rules
- **minimalImplementation Rule** - Validates minimum implementation completeness
- **dependencyBudget Rule** - Enforces dependency count and size limits

#### Event-Driven Daemon
- **Heartbeat Monitoring** - Daemon reports health via periodic heartbeats
- **Cycle-Start Heartbeat** - Heartbeat at each dispatch cycle start
- **Lights-Out Gate Handling** - Automated quality gate enforcement in daemon mode
- **Skill Self-Improvement** - Daemon can suggest and apply skill refinements

#### CDP Bridge
- **Chrome DevTools Protocol Bridge** - Connect non-CLI tools (VS Code, browsers) via CDP
- **VS Code Extension Generator** - Auto-generate VS Code extensions for tool integration
- **Enhanced VS Code Detection** - Improved tool detection and verification

#### Infrastructure
- **Generic RPC Envelope** - Standardized RPC over dispatch APIs
- **Handoff Bus Sync Model** - Cross-tool context transfer via handoff bus
- **File Locks + Notifications** - Infrastructure for concurrent access and cross-tool notifications
- **Session Relay** - Session context transfer between tools

#### Prompt & Search
- **Prompt Templates** - Reusable prompt templates for common workflows
- **FTS5 Search** - Full-text search with SQLite FTS5 for fast memory retrieval
- **Loop Checkpoint** - Checkpoint support for long-running loop operations

#### Backup & Archiving
- **Automatic Backup Pruning** - Configurable retention policies (daily/weekly/monthly)
- **Task/Radio Archiving** - Archive completed tasks and delivered radio messages
- **Privacy-Safe GitHub Backup** - Warnings before plaintext uploads, sensitive data scanning

#### New Tool Support
- **Coze Tool Support** - Verified integration with Coze AI platform
- **MiMo Code Adapter** - Memory hub adapter for MiMo Code
- **Device Tagging** - Track which device originated each memory/task
- **Native Merge Command** - Merge memories from multiple sources

#### Security
- **Security Check Report** - Comprehensive security audit documentation
- **looksSensitive Regex** - Improved detection of sensitive data in memories

### Changed
- Dashboard backend refactored from monolithic to 13+ modular API files
- Task review states improved with better status transitions
- Dashboard UX and accessibility improvements
- Privacy controls for backup uploads

### Fixed
- Daemon tools field stored as array instead of string
- MiMo Code dispatch prompt formatting
- Dashboard missing CSS imports and wrapper class

## [0.2.0] - 2026-06-11

### Added

#### Hermes Agent Integration
- **Hermes Agent 支持** - 已验证适配：记忆写入（events.jsonl）、任务管理（task CLI）、Radio 通信（messages.jsonl）
- **Hermes Agent 模板** - `templates/HERMES_AGENTS.md` 集成指南
- **Cron 同步方案** - 30 分钟周期的 no_agent cron 自动同步
- **config.example.json 更新** - 添加 Hermes 工具配置示例

#### Documentation
- README 添加 Hermes Agent 到已验证支持列表
- 新增 Hermes Agent 集成模板文档

## [0.1.0] - 2026-06-09

### Added

#### Core Features (11)
- **replyTo Field & Message Tracking** - Bidirectional message tracking with replyTo field and response/status filtering
- **Unified Async State Machine** - 7-state async call management (pending/dispatched/acked/retrying/failed/completed/abandoned)
- **Session Handoff** - Cross-tool context transfer with sessions.jsonl and CLI commands
- **RPC Communication** - Synchronous request-response mechanism for tool-to-tool calls
- **Unified Notification Bus** - Severity-based routing (info/warning/error/critical/need_input) with multi-channel delivery
- **VS Code Extension Template** - Extension template with status bar, sync, and task viewing
- **Context Packs** - Task-specific memory bundles with relevant memories and recent radio
- **Scheduler Queue** - Priority-based dispatch queue with retry controls and timeout management
- **Workflow Recipes** - JSON-driven collaboration templates (docs-cleanup, implement-and-review, multi-tool-review)
- **Operational Metrics** - Success rates, average durations, by-tool counts, recent failures
- **Auto-Update System** - Version checking and automatic updates with `--check` and `--force` options

#### Tool Support
- **Gemini CLI Runner** - Automatic dispatch support for Gemini CLI (`gemini -p`)
- **3 Verified CLI Runners** - Codex, Claude, Gemini can now be auto-dispatched
- **35+ Tools Pre-configured** - Adapter notes for major AI tools

#### Documentation
- **Comprehensive README** - 717 lines with complete feature list, installation guide, quick start, architecture
- **CLI Reference Documentation** - Complete 60+ command reference with examples (docs/CLI.md)
- **Update Guide** - Auto-update instructions and troubleshooting (docs/UPDATE.md)

### Changed
- Improved relay status with thread-level queries and project/tool filtering
- Enhanced dispatch with priority sorting (urgent > high > normal > low)
- Context packs now include relevantMemories, recentRadio, task/workflow details

### Fixed
- ES module compatibility with `__dirname` and `__filename`
- Recipe validation for role references and dependency cycles
- Queue entry status transitions with automatic retry logic

### Technical Details
- **Lines of Code**: 2,918 (1,698 core + 1,220 docs)
- **Git Commits**: 12
- **Recipe Templates**: 3
- **CLI Commands**: 60+
- **Supported Tools**: 35+ (13 connected, 3 runnable)

### Architecture
- Local-first, no LLM proxying
- Pure JSONL append-only event logs
- File-based locking for concurrent safety
- Tool-neutral collaboration layer

## [Unreleased]

### Planned
- Test framework and CI/CD
- Thread-aware memory search
- Enhanced async relay loop with delivery callbacks

---

## Version History

- **0.3.0** (2026-07-13) - Dashboard redesign, workflow nodes, policy layer, approval gates, event-driven daemon
- **0.2.0** (2026-06-11) - Hermes Agent integration
- **0.1.0** (2026-06-09) - Initial release with 13 core features
