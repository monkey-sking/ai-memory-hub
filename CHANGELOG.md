# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Dashboard Web UI for workflow and task visualization
- Chrome DevTools Protocol bridge for non-CLI tools
- Enhanced async relay loop with delivery callbacks
- Memory operation abstraction (create, annotate, supersede, archive)
- Thread-aware memory search
- VS Code integration improvements
- Test framework and CI/CD

---

## Version History

- **0.1.0** (2026-06-09) - Initial release with 13 core features

[0.1.0]: https://github.com/<owner>/ai-memory-hub/releases/tag/v0.1.0
