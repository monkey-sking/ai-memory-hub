# AI Memory Hub

**Language**: [中文](#中文说明) | [English](#english)

---

## 中文说明

### 🌟 项目简介

`ai-memory-hub` 是一个给多个 AI 工具共用的本地协作层。它让 Claude、Codex、Gemini、Antigravity、QClaw、OpenClaw、OpenCode、Marvis 等工具使用同一个本地目录共享记忆、消息和任务，同时每个工具继续使用自己的模型 Token、服务商和计费账户。

**核心特点**：
- ✅ **不代理 LLM 请求** - 各工具直连自己的 API
- ✅ **不统一配置** - 每个工具保持独立配置
- ✅ **不读取 Token** - 完全不接触各工具的认证信息
- ✅ **纯本地协作** - 所有数据存储在本地

### 🚀 核心功能

#### 1. 共享记忆系统
- **持久化记忆** - 跨工具共享的长期记忆
- **智能快照** - 自动维护核心/工作/归档分层
- **快速搜索** - 基于关键词的记忆检索
- **上下文打包** - 为任务生成专用上下文包

#### 2. 多工具协作
- **消息总线 (Radio)** - 工具间实时消息传递
- **任务管理** - 共享任务队列和状态追踪
- **工作流系统** - 多角色协作工作流模板
- **Session 切换** - 跨工具上下文传递

#### 3. 通信机制
- **RPC 调用** - 同步请求-响应模式
- **异步状态机** - 7种状态管理（pending/dispatched/acked/retrying/failed/completed/abandoned）
- **通知总线** - 跨平台通知路由
- **优先级队列** - 任务调度和重试控制

#### 4. 工作流自动化
- **Recipe 模板** - JSON 驱动的协作模板
  - `docs-cleanup` - 文档审查和改进
  - `implement-and-review` - 实现+代码审查
  - `multi-tool-review` - 多工具并行审查
- **Scheduler 队列** - 优先级调度和自动重试
- **Metrics 统计** - 成功率、持续时间、失败原因

#### 5. 开发者工具
- **VS Code 扩展** - 编辑器集成（状态栏、命令面板）
- **CLI 工具** - 完整的命令行接口
- **自动更新** - 一键更新到最新版本
- **文件锁** - 防止并发写入冲突

### 📁 本地目录结构

```text
~/.ai-memory/
  ├── profile.md              # 用户配置文件
  ├── MEMORY.md              # AI 工具读取的快照
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
  │   └── tasks.jsonl
  ├── workflows/             # 工作流
  │   └── workflows.jsonl
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

```bash
# 创建任务
ai-memory-hub task add "Implement feature X" --from claude --project my-project --priority high

# 认领任务
ai-memory-hub task claim --id <task-id> --by claude

# 完成任务
ai-memory-hub task done --id <task-id> --by claude
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

### 🔧 CLI 命令参考

#### 核心命令

```bash
ai-memory-hub init              # 初始化 hub
ai-memory-hub status            # 显示状态
ai-memory-hub sync              # 同步记忆
ai-memory-hub update --check    # 检查更新
ai-memory-hub update            # 更新到最新版本
```

#### 记忆管理

```bash
ai-memory-hub memory search <query> --project <name> --tag <tag>   # 搜索记忆
ai-memory-hub memory snapshot --project <name> --tags a,b --limit 40 # 过滤快照视图
```

#### 消息总线

```bash
ai-memory-hub radio send <text> --from <tool> --to <target> --type <type>
ai-memory-hub radio list [--project <name>]
ai-memory-hub radio mark-delivered --id <id>
```

#### 任务管理

```bash
ai-memory-hub task add <title> --from <tool> --project <name> --priority <level>
ai-memory-hub task list --status <status>
ai-memory-hub task claim --id <id> --by <tool>
ai-memory-hub task done --id <id> --by <tool>
ai-memory-hub task note --id <id> <text> --by <tool>
```

#### 工作流

```bash
ai-memory-hub workflow create --title <title> --planner <tool> --executor <tool>
ai-memory-hub workflow list
ai-memory-hub workflow start --id <id> --by <tool>
ai-memory-hub workflow done --id <id> --by <tool>
```

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
记录中，供 daemon 和 dashboard 后续自动推进或展示。

#### 指标统计

```bash
ai-memory-hub metrics          # 显示所有指标
```

完整命令文档请查看 [docs/CLI.md](docs/CLI.md)

### 🔌 支持的 AI 工具

#### 已验证支持
- ✅ **Claude Code** - Anthropic 官方 CLI
- ✅ **Codex** - 代码生成工具
- ✅ **Gemini** - Google AI 工具
- ✅ **Antigravity** - 多功能 AI 助手
- ✅ **QClaw / OpenClaw** - 开源 AI 工具
- ✅ **Marvis** - 腾讯 AI 助手
- ✅ **OpenCode** - 代码辅助工具

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
│  Claude  Codex  Gemini  Marvis  QClaw  VS Code  ...     │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │  AI Memory Hub (本地)    │
        ├─────────────────────────┤
        │  • 记忆系统              │
        │  • 消息总线              │
        │  • 任务管理              │
        │  • 工作流引擎            │
        │  • RPC 通信              │
        │  • 调度队列              │
        └─────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │   本地文件系统           │
        │   ~/.ai-memory/          │
        └─────────────────────────┘
```

#### 核心组件

1. **Memory System** - 记忆持久化和检索
2. **Radio Bus** - 消息传递
3. **Task Queue** - 任务管理和调度
4. **Workflow Engine** - 多角色协作
5. **RPC Layer** - 同步通信
6. **Notification Bus** - 跨平台通知
7. **Context Packer** - 上下文打包

### 📖 更多文档

- [更新指南](docs/UPDATE.md) - 如何更新到最新版本
- [记忆生命周期](docs/memory-lifecycle.md) - 记忆系统设计
- [中继协议](docs/relay-protocol.md) - 工具间通信协议
- [CLI 命令参考](docs/CLI.md) - 完整命令文档（待创建）
- [工作流模板指南](docs/RECIPES.md) - 如何编写模板（待创建）

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

MIT License - 详见 [LICENSE](LICENSE)

### 🌟 Star History

如果觉得有用，请给个 Star！

---

## English

### 🌟 Overview

`ai-memory-hub` is a local collaboration layer for multiple AI tools. It allows Claude, Codex, Gemini, Antigravity, QClaw, OpenClaw, OpenCode, Marvis and other tools to share memory, messages and tasks using a single local directory, while each tool continues to use its own model tokens, service providers and billing accounts.

**Key Features**:
- ✅ **No LLM proxying** - Tools connect directly to their APIs
- ✅ **No unified configuration** - Each tool maintains independence
- ✅ **No token access** - Never touches tool authentication
- ✅ **Purely local** - All data stored locally

### 🚀 Features

- **Shared Memory** - Persistent cross-tool memory with smart snapshots
- **Message Bus** - Real-time inter-tool messaging (Radio)
- **Task Management** - Shared task queue and status tracking
- **Workflow System** - Multi-role collaboration templates
- **RPC Communication** - Synchronous request-response
- **Priority Scheduler** - Task scheduling and retry control
- **Metrics Dashboard** - Success rates, durations, failures
- **Auto-Update** - One-click updates
- **VS Code Extension** - Editor integration

### 📦 Installation

```bash
npm install -g ai-memory-hub
ai-memory-hub init
```

### 🎯 Quick Start

```bash
# Initialize
ai-memory-hub init

# Check status
ai-memory-hub status

# Send a message
ai-memory-hub radio send "Hello!" --from claude --to all

# Create a task
ai-memory-hub task add "Implement feature" --from claude --priority high

# Use workflow template
ai-memory-hub recipe create \
  --recipe implement-and-review \
  --tools planner:claude,executor:codex,reviewer:gemini
```

### 📖 Documentation

- [Update Guide](docs/UPDATE.md)
- [Memory Lifecycle](docs/memory-lifecycle.md)
- [Relay Protocol](docs/relay-protocol.md)
- [CLI Reference](docs/CLI.md) (coming soon)

### 📝 License

MIT License
