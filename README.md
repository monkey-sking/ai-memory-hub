# AI Memory Hub

**Language**: [中文](#中文说明) | [English](#english)

---

## 中文说明

### 🌟 项目简介

`ai-memory-hub` 是一个给多个 AI 工具共用的本地协作层。它让 Claude、Codex、Gemini、Antigravity、QClaw、OpenClaw、OpenCode、MiMo Code、Marvis 等工具使用同一个本地目录共享记忆、消息和任务，同时每个工具继续使用自己的模型 Token、服务商和计费账户。

**核心特点**：
- ✅ **不代理 LLM 请求** - 各工具直连自己的 API
- ✅ **不统一配置** - 每个工具保持独立配置
- ✅ **不读取 Token** - 完全不接触各工具的认证信息
- ✅ **纯本地协作** - 所有数据存储在本地

### 当前自动执行 Runner

- `codex`、`claude`、`opencode`、`mimocode` 等使用各自 CLI runner。
- `antigravity` 使用官方 `agy` CLI 的 `--print` 非交互模式，不调用桌面 APP。
- Windows 默认查找 `C:\Users\<user>\AppData\Local\agy\bin\agy.exe`，也支持 PATH 中的 `agy.cmd` / `agy`。
- `antigravity-gemini` 仅表示共享记忆适配器，不是另一个执行 agent。

### 🚀 核心功能

#### 1. 共享记忆系统
- **持久化记忆** - 跨工具共享的长期记忆，自动维护核心/工作/归档分层
- **快速搜索** - 基于关键词、标签、线程、任务、工作流的记忆检索
- **上下文打包** - 为任务生成专用上下文包（含相关记忆、最近消息、任务/工作流状态）
- **记忆快照** - 可按项目/标签过滤的快照视图，不重写 MEMORY.md
- **Pull 重建** - 从 ledger 重建 MEMORY.md 和 INDEX.md

#### 2. 多工具协作
- **消息总线 (Radio)** - 工具间实时消息传递，支持 replyTo 双向追踪
- **任务管理** - 共享任务队列（open/claimed/in_progress/blocked/done/cancelled），支持认领、进展记录、完成、物理删除
- **工作流节点系统** - 节点级执行历史、自动创建节点、状态自动更新、工作流状态从节点派生
- **工作流系统** - 多角色协作（planner/executor/reviewer/observer），支持 result/review/signal 交互
- **Shared Skill Layer** - 为 Codex/Claude/Gemini/QClaw/OpenClaw/OpenCode/MiMo Code/Marvis 等工具安装统一协作流程
- **Capability Registry** - 汇总工具能力、接入方式、自动执行状态和安全权限边界
- **Session 切换** - 跨工具上下文传递
- **Connect** - 跨工具连接管理，发送 request/review/handoff 消息

#### 3. 权限策略与审批门禁
- **Permission Policy Layer** - 三阶段实现：数据层+解析器+CLI → Dashboard 集成 → 调度预检执行
- **Approval Gates** - 机器可读的审批门禁，自动执行调度前检查
- **Quality Gate Rules** - `minimalImplementation`（最小实现完整性）和 `dependencyBudget`（依赖预算）规则
- **Policy Packs** - 可附加的执行 persona，集成到工作流角色中

#### 4. 调度与分发
- **Dispatch Relay** - 异步状态机管理 8 种投递状态（pending/dispatched/acked/progress/retrying/failed/completed/abandoned）
- **Event-Driven Daemon** - 事件驱动守护进程，心跳监控，cycle-start 心跳，自动化质量门禁执行
- **Worktree 隔离** - `--isolate-worktree` 在独立 Git worktree 中运行分发任务，不影响当前工作区
- **Progress 上报** - 长时间运行的任务通过 heartbeat 报告进度百分比和状态
- **Dispatch Retry** - 自动重试超时/失败的分发，支持 recipe 修复次数上限

#### 5. 工作流自动化
- **Recipe 模板** - JSON 驱动的协作模板，内置 `frontend-feature`、`backend-service`、`fullstack-feature`、`lights-out-local`
- **QualityGate** - 机器可读的质量门禁（验证命令、review 要求、最大修复次数、停止条件、允许/禁止动作）
- **Scheduler 队列** - 优先级调度和自动重试
- **Metrics 统计** - 成功率、持续时间、失败原因分析

#### 6. 运维与诊断
- **Dashboard Web UI** - `ai-memory-hub app` 启动本地 Web 面板（React + shadcn/ui + Tailwind v4），可视化管理记忆、任务、工作流、分发、项目
- **CDP Bridge** - Chrome DevTools Protocol 桥接，连接非 CLI 工具（VS Code、浏览器）
- **VS Code Extension** - 自动生成 VS Code 扩展，集成状态栏、同步、任务查看
- **Health Report** - `ai-memory-hub health` 生成健康报告（存储、损坏记录、增长趋势、建议操作）
- **Doctor 诊断** - `ai-memory-hub doctor` 检查工具 runner 兼容性（shim 类型、prompt 模式、版本探测）
- **Backup 系统** - 本地备份 + GitHub 数据备份，支持自动剪枝、敏感数据扫描、保留策略
- **Watch 定时同步** - `ai-memory-hub watch` 后台自动索引 inbox 事件
- **Prompt Templates** - 可复用的 prompt 模板
- **FTS5 Search** - 基于 SQLite FTS5 的快速全文搜索
- **自动更新** - 一键检查和更新到最新版本

### 📁 本地目录结构

```text
~/.ai-memory/
  ├── profile.md              # 用户配置文件
  ├── MEMORY.md              # AI 工具读取的快照
  ├── BOOTSTRAP.md           # 启动关键记忆快照
  ├── INDEX.md               # 可读的分层索引
  ├── inbox/                 # 待同步的事件
  │   └── events.jsonl
  ├── synced/                # 已同步的事件
  ├── memories/              # 记忆系统
  │   ├── ledger.jsonl       # 完整记忆账本
  │   └── index.json         # 结构化索引
  ├── radio/                 # 消息总线
  │   └── messages.jsonl
  ├── tasks/                 # 任务管理
  │   ├── events.jsonl
  │   └── tasks.jsonl        # 兼容投影
  ├── workflows/             # 工作流
  │   ├── events.jsonl
  │   └── workflows.jsonl    # 兼容投影
  ├── projects/              # 项目注册表
  │   ├── events.jsonl
  │   └── projects.jsonl     # 兼容投影
  ├── sessions/              # 会话管理
  │   └── sessions.jsonl
  ├── rpc/                   # RPC 调用
  │   └── requests.jsonl
  ├── notifications/         # 通知
  │   └── notifications.jsonl
  ├── dispatch/              # 调度队列
  │   └── queue.jsonl
  ├── context/               # 上下文包
  │   └── packs/*.json
  ├── recipes/               # 工作流模板
  │   ├── docs-cleanup.json
  │   ├── implement-and-review.json
  │   └── multi-tool-review.json
  ├── backups/               # 备份
  ├── locks/                 # 文件锁
  │   └── hub.lock
  ├── state/                 # 运行状态
  │   └── daemon.pid         # 守护进程 PID
  ├── tools/                 # 工具适配器
  └── extensions/            # 扩展（VS Code等）
```

### 📦 安装

#### 方式 1：从源码安装（推荐）

```bash
# 克隆仓库
git clone https://github.com/<owner>/ai-memory-hub.git
cd ai-memory-hub

# 全局安装
npm install -g .

# 初始化
ai-memory-hub init
```


#### 可选：安装 Antigravity CLI

Windows PowerShell：

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```
#### 方式 2：从 npm 安装

```bash
npm install -g ai-memory-hub
ai-memory-hub init
```

### 🎯 快速开始

#### 1. 初始化 Hub

```bash
# 创建 ~/.ai-memory 目录和配置
ai-memory-hub init

# 查看状态
ai-memory-hub status
```

#### 2. 同步记忆

```bash
# 手动同步
ai-memory-hub sync

# 查看记忆快照
cat ~/.ai-memory/MEMORY.md
```

#### 3. 发送消息

```bash
# 发送广播消息
ai-memory-hub radio send "Hello from Claude!" --from claude --to all --type note

# 查看消息
ai-memory-hub radio list
```

#### 4. 管理任务
# Gemini 不可用时，可手动改派给 Antigravity CLI
ai-memory-hub task claim --id <task-id> --by antigravity

```bash
# 创建任务
ai-memory-hub task add "Implement feature X" --from claude --project my-project --priority high

# 认领任务
ai-memory-hub task claim --id <task-id> --by claude

# 完成任务
ai-memory-hub task done --id <task-id> --by claude

# 取消任务
ai-memory-hub task update --id <task-id> --status cancelled

# 物理删除已取消的任务（需要确认任务标题）
ai-memory-hub task purge --id <task-id> --confirm "Implement feature X"
```

#### 5. 使用工作流模板

```bash
# 查看可用模板
ai-memory-hub recipe list

# 从模板创建工作流
ai-memory-hub recipe create \
  --recipe implement-and-review \
  --tools planner:claude,executor:codex,reviewer:gemini \
  --project my-project \
  --var feature="new-dashboard"
```

#### 6. 查看指标

```bash
# 显示操作指标
ai-memory-hub metrics
```

#### 7. 启动 Dashboard

```bash
# 启动本地仪表盘
ai-memory-hub app --port 38787

# 浏览器访问
# http://127.0.0.1:38787
```

#### 8. 启动守护进程

```bash
# 启动自动调度守护进程
ai-memory-hub daemon --interval-ms 10000

# 查看守护进程状态
ai-memory-hub daemon status
```

#### 9. 健康检查

```bash
# 生成健康报告
ai-memory-hub health

# 诊断工具状态
ai-memory-hub doctor
```

### 🔧 CLI 命令参考

#### 核心命令

```bash
ai-memory-hub init              # 初始化 hub
ai-memory-hub status            # 显示状态
ai-memory-hub capabilities      # 查看工具能力注册表
ai-memory-hub sync              # 同步记忆
ai-memory-hub update --check    # 检查更新
ai-memory-hub update            # 更新到最新版本
```

#### 记忆管理

```bash
ai-memory-hub memory search <query> --project <name> --tag <tag>   # 搜索记忆
ai-memory-hub memory snapshot --project <name> --tags a,b --limit 40 # 过滤快照视图
ai-memory-hub resolve "@RTK.md" --from ~/.codex/AGENTS.md          # 解析缺失的 @include
```

#### 消息总线

```bash
ai-memory-hub radio send <text> --from <tool> --to <target> --type <type>
ai-memory-hub radio list [--project <name>]
ai-memory-hub radio mark-delivered --id <id>

# Memory lifecycle operations (append-only)
ai-memory-hub memory op create --action supersede --record <old-id> --superseded-by <new-id> --reason correction --by codex
ai-memory-hub memory op create --action revoke --record <record-id> --reason unsafe-fact --by codex
ai-memory-hub memory op list --record <record-id>
```

#### 任务管理

```bash
ai-memory-hub task add <title> --from <tool> --project <name> --priority <level>
ai-memory-hub task list --status <status>
ai-memory-hub task claim --id <id> --by <tool>
ai-memory-hub task done --id <id> --by <tool>
ai-memory-hub task note --id <id> <text> --by <tool>
ai-memory-hub task purge --id <id> --confirm <task-title>  # 物理删除已取消的任务
```

#### 工作流

```bash
ai-memory-hub workflow create --title <title> --planner <tool> --executor <tool>
ai-memory-hub workflow list
ai-memory-hub workflow start --id <id> --by <tool>
ai-memory-hub workflow done --id <id> --by <tool>
```

#### 项目注册表

```bash
ai-memory-hub project list --status visible
ai-memory-hub project add <id> --name <name> --status active
ai-memory-hub project update <id> --status paused
ai-memory-hub project alias <id> <alias>
ai-memory-hub project relate <id> --based-on <parent-id> --relation reskin
ai-memory-hub project archive <id> --by <tool>
```

See [docs/project-registry.md](docs/project-registry.md) for the data model, API endpoints, dashboard behavior, and AI tool guidance.

#### Session 管理

```bash
ai-memory-hub session create --title <title> --from <tool> --project <name>
ai-memory-hub session list
ai-memory-hub session update --id <id> --context <text>
```

#### RPC 调用

```bash
ai-memory-hub rpc send --to <tool> --method <name> --params <json>
ai-memory-hub rpc pending --to <tool>
ai-memory-hub rpc respond --id <id> --result <json>
```

#### 通知

```bash
ai-memory-hub notify send --severity <level> --message <text> --channels <list>
ai-memory-hub notify pending
ai-memory-hub notify deliver --id <id> --channels <list>
```

#### 上下文包

```bash
ai-memory-hub context create --task <id> --project <name>
ai-memory-hub context list
ai-memory-hub context show <id>
```

#### 调度队列

```bash
ai-memory-hub queue add --tool <tool> --task <id> --priority <level>
ai-memory-hub queue list
ai-memory-hub queue running
ai-memory-hub queue start <id>
ai-memory-hub queue complete <id>
```

#### 工作流模板

```bash
ai-memory-hub recipe list
ai-memory-hub recipe show <name>
ai-memory-hub recipe validate <name>
ai-memory-hub recipe create --recipe fullstack-feature --tools planner:claude,executor:codex,reviewer:gemini,observer:marvis
ai-memory-hub recipe create --recipe lights-out-local --tools planner:codex,executor:codex,reviewer:gemini,observer:codex
```

内置模板包括 `frontend-feature`、`backend-service`、`fullstack-feature`、`lights-out-local`；
用户可在 `~/.ai-memory/recipes/` 放置同名 JSON 模板覆盖内置版本。
Recipe 可声明机器可读 `qualityGate`，包括验证命令、review 要求、最大修复次数、
停止条件和允许/禁止动作；`recipe create` 会把这些字段保存在生成的 workflow/task
记录中。daemon 会按 `recipeStep.dependsOn` 顺序派发 recipe 任务，把 `qualityGate`
写入 runner prompt，并用 `maxRepairAttempts` 作为 retry 上限；dashboard 可展示这些字段。

#### 指标统计

```bash
ai-memory-hub metrics          # 显示所有指标
```

#### 调度与守护进程

```bash
ai-memory-hub dispatch --project <name>              # 派发待处理工作
ai-memory-hub dispatch --to <tool> --run              # 派发给指定工具并运行
ai-memory-hub dispatch --to <tool> --run --model <model>  # 指定模型派发
ai-memory-hub dispatch --to <tool> --run --isolate-worktree  # Worktree 隔离模式
ai-memory-hub dispatch status --recent 10 --project <name>   # 查看派发状态
ai-memory-hub dispatch progress --thread-key <key> --percent 40  # 更新进度
ai-memory-hub dispatch retry --project <name> --to <tool> --run  # 重试失败派发

#### 派发与人工审核边界

- 普通 AI 之间的任务派发默认自动放行，包括派发给 `antigravity`。
- 安装依赖、远程 `push`、删除和 `purge` 等高风险操作保留人工审核。
- 查看待审核门禁：`ai-memory-hub gate queue --reviewer human`

ai-memory-hub declare --tool <tool> --models "m1,m2" --strengths "前端,审查" --by <tool>  # 申报模型与擅长领域
ai-memory-hub declare list                        # 查看所有申报
ai-memory-hub models --to <tool> --refresh         # 从供应商刷新模型目录
ai-memory-hub capabilities --tool <tool>           # 查看某工具能力（含模型/领域）

ai-memory-hub daemon                              # 启动守护进程
ai-memory-hub daemon --project <name> --interval-ms 10000  # 自定义间隔
ai-memory-hub daemon --project <name> --isolate-worktree   # Worktree 隔离
ai-memory-hub daemon status                       # 查看守护进程状态

ai-memory-hub watch --interval-ms 30000           # 定时索引 inbox 事件
```

#### 备份与恢复

```bash
ai-memory-hub backup --reason manual              # 创建备份
ai-memory-hub backup list --limit 20              # 列出备份
ai-memory-hub backup prune --daily 7 --weekly 4 --apply  # 清理旧备份
ai-memory-hub backup status                       # 备份状态
ai-memory-hub backup run --no-push                # 运行备份（不推送）
```

#### 健康检查与诊断

```bash
ai-memory-hub health                              # 生成健康报告
ai-memory-hub doctor                              # 诊断工具状态
ai-memory-hub doctor --tool <name>                # 诊断指定工具
```

#### 工具连接与安装

```bash
ai-memory-hub connect                             # 检查工具连接
ai-memory-hub connect --apply                     # 应用连接
ai-memory-hub connect request --from <tool> --to <tool> --text "..."  # 发送请求

ai-memory-hub install --tool <name>               # 查看工具指令
ai-memory-hub install --tool <name> --apply       # 安装工具指令
ai-memory-hub install --local --apply             # 写入当前项目目录

ai-memory-hub pull                                # 从账本重建 MEMORY.md
```

#### Dashboard

```bash
ai-memory-hub app --port 38787                    # 启动本地仪表盘
ai-memory-hub app --host 0.0.0.0 --port 38787    # 监听所有接口
```

#### CDP Bridge

```bash
node src/cdp-bridge.js                            # 启动 CDP 桥接服务
```

#### Task-Spec

```bash
ai-memory-hub task-spec list                      # 列出项目任务命令
ai-memory-hub task-spec validate                  # 验证任务命令
ai-memory-hub task-spec run <name>                # 运行任务命令
```

完整命令文档请查看 [docs/CLI.md](docs/CLI.md)

### 🔌 支持的 AI 工具

#### 已验证支持
- ✅ **Hermes Agent** - 已适配：记忆写入、任务管理、Radio 通信、定时同步
- ✅ **Claude Code** - Anthropic 官方 CLI
- ✅ **Codex** - 代码生成工具
- ✅ **Gemini** - Google AI 工具
- ✅ **Antigravity CLI (`agy`)** - 官方终端 runner；桌面版 Antigravity 与 CLI 独立，AMH 通过 CLI 自动派发
- ✅ **QClaw / OpenClaw** - 开源 AI 工具
- ✅ **Marvis** - 腾讯 AI 助手
- ✅ **OpenCode** - 代码辅助工具
- ✅ **MiMo Code** - 小米 MiMo 团队基于 OpenCode 构建的终端编程 Agent
- ✅ **Coze** - Coze AI 平台集成

#### 预配置支持（待安装）
- 🔵 VS Code + Continue/Cline
- 🔵 Cursor
- 🔵 Windsurf
- 🔵 ChatGPT Desktop
- 🔵 Zed Editor
- 🔵 Ollama / LM Studio / Jan

### 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    AI 工具层                              │
│  Claude  Codex  Gemini  Antigravity/agy  Marvis  Coze   │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │  AI Memory Hub (本地)    │
        ├─────────────────────────┤
        │  • 记忆系统              │
        │  • 消息总线              │
        │  • 任务管理              │
        │  • 工作流引擎 + 节点系统  │
        │  • RPC 通信              │
        │  • 权限策略层            │
        │  • 审批门禁              │
        │  • 调度队列              │
        │  • 事件驱动守护进程       │
        │  • CDP Bridge           │
        │  • Dashboard Web UI     │
        │  • 备份系统              │
        └─────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │   本地文件系统           │
        │   ~/.ai-memory/          │
        └─────────────────────────┘
```

#### 核心组件

1. **Memory System** - 记忆持久化和检索（FTS5 全文搜索）
2. **Radio Bus** - 消息传递
3. **Task Queue** - 任务管理和调度
4. **Workflow Engine** - 多角色协作 + 节点级执行历史
5. **RPC Layer** - 同步通信
6. **Notification Bus** - 跨平台通知
7. **Context Packer** - 上下文打包
8. **Permission Policy** - 权限策略层和审批门禁
9. **Dispatch Scheduler** - 工作派发和 Worktree 隔离
10. **Daemon** - 事件驱动守护进程，心跳监控
11. **CDP Bridge** - Chrome DevTools Protocol 桥接
12. **Dashboard** - React + shadcn/ui Web UI 可视化管理
13. **Backup System** - 备份、自动剪枝、保留策略、恢复

### 📖 更多文档

- [更新指南](docs/UPDATE.md) - 如何更新到最新版本
- [记忆生命周期](docs/memory-lifecycle.md) - 记忆系统设计
- [Shared Skill Layer](docs/shared-skill-layer.md) - 跨工具 skill/adapter 边界与安装验证
- [Capability Registry](docs/capability-registry.md) - 工具能力、接入模式和权限边界
- [中继协议](docs/relay-protocol.md) - 工具间通信协议
- [CLI 命令参考](docs/CLI.md) - 完整命令文档
- [项目注册表](docs/project-registry.md) - 项目元数据和管理
- [Dashboard UI 设计](docs/dashboard-ui-redesign-plan.md) - 仪表盘界面设计
- [权限策略层设计](docs/permission-policy-layer-design.md) - 权限策略和审批门禁
- [审批门禁设计](docs/approval-gates-design.md) - 调度审批门禁
- [质量门禁规则](docs/quality-gate-rules.md) - minimalImplementation 和 dependencyBudget
- [执行策略集成](docs/execution-policy-workflow-integration.md) - 工作流角色与执行策略
- [CDP Bridge](docs/cdp-bridge-usage.md) - Chrome DevTools Protocol 桥接使用指南
- [安全检查报告](docs/SECURITY-CHECK.md) - 安全审计报告
- [功能清单](docs/FEATURE-LIST.md) - 完整功能清单

### 🤝 贡献指南

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md)（待创建）

#### 开发

```bash
# 克隆仓库
git clone https://github.com/<owner>/ai-memory-hub.git
cd ai-memory-hub

# 安装依赖
npm install

# 运行测试
npm test

# 本地开发
npm link
```

### 📝 许可证

Apache License 2.0 - 详见 [LICENSE](LICENSE)

如果觉得有用，请给个 Star！

---

## English

### 🌟 Overview

`ai-memory-hub` is a local collaboration layer for multiple AI tools. It allows Claude, Codex, Gemini, Antigravity, QClaw, OpenClaw, OpenCode, MiMo Code, Marvis and other tools to share memory, messages and tasks using a single local directory, while each tool continues to use its own model tokens, service providers and billing accounts.


### Current CLI Runners

- `antigravity` uses the official `agy --print` non-interactive CLI runner; it does not automate the desktop app.
- On Windows AMH searches `%LOCALAPPDATA%\\agy\\bin\\agy.exe`, then `agy.cmd` / `agy` on `PATH`.
- `antigravity-gemini` is a shared-memory adapter label, not a replacement agent.
- Gemini CLI authentication is independent; use an eligible account or `GEMINI_API_KEY`, or manually reassign work to `antigravity`.
**Key Features**:
- ✅ **No LLM proxying** - Tools connect directly to their APIs
- ✅ **No unified configuration** - Each tool maintains independence
- ✅ **No token access** - Never touches tool authentication
- ✅ **Purely local** - All data stored locally

### 🚀 Features

- **Shared Memory** - Persistent cross-tool memory with smart snapshots and FTS5 search
- **Message Bus** - Real-time inter-tool messaging (Radio)
- **Task Management** - Shared task queue with status tracking, purge, and archiving
- **Workflow Node System** - Node-level execution history, auto-create, auto-update, status derivation
- **Workflow System** - Multi-role collaboration templates
- **Shared Skill Layer** - Common startup, memory, task, workflow, and review instructions for native tool adapters
- **Capability Registry** - Tool capability, integration mode, automation readiness, and safety policy summaries
- **Permission Policy Layer** - Policy rules, approval gates, dispatch preflight enforcement
- **RPC Communication** - Synchronous request-response
- **Priority Scheduler** - Task scheduling and retry control
- **Dispatch** - Dispatch pending Radio/Task work to verified CLI runners (with Worktree isolation)
- **Event-Driven Daemon** - Background process with heartbeat monitoring and skill self-improvement
- **CDP Bridge** - Chrome DevTools Protocol bridge for non-CLI tools
- **Dashboard Web UI** - React + shadcn/ui + Tailwind v4 local dashboard
- **Backup** - Hub file backups, auto-pruning, retention management, GitHub data backup
- **Health & Doctor** - Health report generation and AI tool diagnostics
- **Connect** - Check tool connections, send requests/reviews/handoff to other tools
- **Install** - Apply per-tool instruction snippets (supports --local for project directory)
- **Task-Spec** - Project-declared task commands: list, validate, and run
- **Auto-Watch** - Periodically index pending inbox events
- **Pull** - Rebuild MEMORY.md from the local memory ledger
- **Metrics Dashboard** - Success rates, durations, failures
- **Prompt Templates** - Reusable prompt templates for common workflows
- **VS Code Extension** - Auto-generated editor integration
- **Auto-Update** - One-click updates

### 📦 Installation

```bash
npm install -g ai-memory-hub
ai-memory-hub init
```

### 🎯 Quick Start

#### Optional: install Antigravity CLI

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```
Verify with `agy --version`; AMH will discover the CLI automatically.

```bash
# Initialize
ai-memory-hub init

# Check status
ai-memory-hub status

# Send a message
ai-memory-hub radio send "Hello!" --from claude --to all

# Create a task
ai-memory-hub task add "Implement feature" --from claude --priority high

# Start dashboard
ai-memory-hub app --port 38787

# Start daemon for auto-dispatch
ai-memory-hub daemon --interval-ms 10000

# Run health check
ai-memory-hub health

# Backup hub data
ai-memory-hub backup --reason manual
```

### 📖 Documentation

- [Update Guide](docs/UPDATE.md)
- [Memory Lifecycle](docs/memory-lifecycle.md)
- [Shared Skill Layer](docs/shared-skill-layer.md)
- [Capability Registry](docs/capability-registry.md)
- [Relay Protocol](docs/relay-protocol.md)
- [CLI Reference](docs/CLI.md)
- [Project Registry](docs/project-registry.md)
- [Dashboard UI Plan](docs/dashboard-ui-redesign-plan.md)
- [Dashboard Console Standard](docs/dashboard-console-standard.md)
- [Permission Policy Design](docs/permission-policy-layer-design.md)
- [Approval Gates](docs/approval-gates-design.md)
- [Quality Gate Rules](docs/quality-gate-rules.md)
- [CDP Bridge](docs/cdp-bridge-usage.md)
- [Security Report](docs/SECURITY-CHECK.md)
- [Feature List](docs/FEATURE-LIST.md)

### 📝 License

Apache License 2.0

### Agent 间唤醒与 Session Supervisor

AMH 支持使用 `session:<tool>:<sessionId>` 定向发送消息。Claude runner 会使用 `--resume` 继续已有会话；Codex、Gemini、OpenCode、MiMo 等 direct CLI runner 在没有 resume 能力时使用 fresh-run，并保留 session/thread 关联；没有验证直连能力的工具进入 durable queue。

AMH 自己发起的 dispatch 会把 session lease 事件写入 `state/session-leases.jsonl`，用于生命周期、失败和 stale/dead 检查。该机制不等同于通用的 live terminal adapter，也不会注入任意交互终端。
