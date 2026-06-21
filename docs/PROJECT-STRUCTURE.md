# AI Memory Hub - 完整项目结构

**更新日期:** 2026-06-21  
**版本:** 0.1.0

## 📁 项目目录结构

```
ai-memory-hub/
├── 📂 src/                          # 核心源代码
│   ├── index.js                     # 主 CLI 入口（~7000 行）
│   ├── cdp-bridge.js               # WebSocket 桥接服务器（新增）
│   ├── file-locks.js               # 文件锁系统（新增）
│   └── dashboard/                   # Dashboard 后端
│
├── 📂 scripts/                      # 实用脚本
│   ├── demo.js                     # 快速演示脚本（新增）
│   ├── generate-vscode-extension.js # VS Code 扩展生成器（新增）
│   └── review-overengineering.js   # 反过度工程检查（新增）
│
├── 📂 docs/                         # 完整文档（40+ 文档）
│   ├── usage-and-verification-guide.md  # 使用指南（新增）
│   ├── hands-on-demo-report.md     # 实操报告（新增）
│   ├── quality-gate-rules.md       # 质量门规则（新增）
│   ├── policy-packs-execution-personas.md  # Policy Packs（新增）
│   ├── cdp-bridge-usage.md         # CDP Bridge 指南（新增）
│   ├── rpc-envelope-design.md      # RPC 设计（新增）
│   ├── handoff-bus-sync-model.md   # Handoff Bus（新增）
│   ├── collaboration-graph-evaluation.md  # 协作图（新增）
│   ├── vscode-integration-improvements.md # VS Code 集成（新增）
│   ├── github-issue-1-implementation.md   # Issue #1（新增）
│   ├── github-issue-2-implementation.md   # Issue #2（新增）
│   ├── anti-overengineering-review-policy.md  # 反过度工程（新增）
│   ├── execution-policy-workflow-integration.md  # 执行策略（新增）
│   └── ... (30+ 其他文档)
│
├── 📂 recipes/                      # 工作流配方
│   ├── backend-service.json        # 后端服务配方
│   ├── frontend-feature.json       # 前端功能配方
│   ├── fullstack-feature.json      # 全栈功能配方
│   ├── lights-out-local.json       # 全自动工作流
│   └── minimal-backend-api.json    # 最小后端 API
│
├── 📂 templates/                    # 工具模板
│   ├── AGENTS.md                   # 通用 Agent 指令
│   ├── CLAUDE.md                   # Claude 指令
│   ├── GEMINI.md                   # Gemini 指令
│   ├── MARVIS_SKILL.md            # Marvis 技能模板
│   ├── MIMOCODE_SKILL.md          # Mimocode 技能模板
│   ├── dashboard.html              # Dashboard 模板
│   └── shared-skill-layer.md       # 共享技能层
│
├── 📂 dashboard-next/               # 新版 Dashboard（React + Vite）
│   ├── src/                        # React 组件
│   ├── public/                     # 静态资源
│   ├── dist/                       # 构建输出
│   └── package.json               # Dashboard 依赖
│
├── 📂 tests/                        # 测试文件
│   ├── core-commands.test.mjs     # 核心命令测试
│   ├── dashboard-api.test.mjs     # Dashboard API 测试
│   ├── dispatch-reliability.test.mjs  # 分发可靠性测试
│   └── ... (更多测试)
│
├── 📂 examples/                     # 使用示例
│   └── memory-event.jsonl         # 记忆事件示例
│
├── 📂 assets/                       # 资源文件
│   └── ... (图片、图标等)
│
├── 📂 .github/                      # GitHub 配置
│   └── workflows/                  # CI/CD 工作流
│
├── 📄 README.md                     # 项目说明（详细）
├── 📄 CONTRIBUTING.md              # 贡献指南
├── 📄 CHANGELOG.md                 # 变更日志
├── 📄 LICENSE                      # MIT 许可证
├── 📄 package.json                 # NPM 配置
└── 📄 config.example.json          # 配置示例
```

## 🎯 核心模块

### 1. 主 CLI（src/index.js）

**功能模块:**
- 任务管理（create, list, claim, done）
- 记忆管理（sync, search, read, write）
- Radio 消息（send, list）
- 工作流（create, start, result）
- 项目管理（add, show, list）
- Dispatch 分发（dispatch, relay）
- 工具检测（detect）
- 权限策略（policy）

**行数:** ~7000 行  
**语言:** JavaScript (ES modules)

### 2. CDP Bridge（src/cdp-bridge.js）✨ 新增

**功能:**
- WebSocket 服务器（端口 9222）
- JSON-RPC 2.0 协议
- 客户端注册管理
- 方法路由（task/memory/radio）
- 实时事件广播

**行数:** ~400 行  
**依赖:** ws@^8.18.0

### 3. 文件锁（src/file-locks.js）✨ 新增

**功能:**
- 并发访问控制
- 陈旧锁检测（30s 超时）
- 自动释放（withLock）
- PID + hostname 所有权

**行数:** ~150 行  
**用例:** 任务更新、记忆写入、工作流状态

## 🛠️ 工具脚本

### 1. 演示脚本（scripts/demo.js）✨ 新增

**功能:**
- 自动化功能演示
- 彩色输出
- 错误处理
- 步骤验证

**运行:** `npm run demo`

### 2. VS Code 扩展生成器（scripts/generate-vscode-extension.js）✨ 新增

**功能:**
- 完整扩展脚手架
- AMHClient WebSocket 类
- 命令面板集成
- 状态栏小部件
- 实时通知

**运行:** `node scripts/generate-vscode-extension.js`  
**输出:** 完整的 VS Code 扩展项目

### 3. 反过度工程检查（scripts/review-overengineering.js）✨ 新增

**功能:**
- 文件大小分析
- 复杂度检测
- 过度抽象警告
- 优化建议

**运行:** `npm run review:overengineering`

## 📚 文档体系

### 新增文档（13 个）✨

1. **usage-and-verification-guide.md** - 完整使用指南
2. **hands-on-demo-report.md** - 实操演示报告
3. **quality-gate-rules.md** - 质量门规则
4. **policy-packs-execution-personas.md** - Policy Packs
5. **cdp-bridge-usage.md** - CDP Bridge 使用
6. **rpc-envelope-design.md** - RPC 封装设计
7. **handoff-bus-sync-model.md** - Handoff Bus 模型
8. **collaboration-graph-evaluation.md** - 协作图评估
9. **vscode-integration-improvements.md** - VS Code 集成
10. **github-issue-1-implementation.md** - Issue #1 实现
11. **github-issue-2-implementation.md** - Issue #2 实现
12. **anti-overengineering-review-policy.md** - 反过度工程
13. **execution-policy-workflow-integration.md** - 执行策略

### 原有文档（30+ 个）

- CLI.md - 命令行接口文档
- README.md - 项目介绍
- CONTRIBUTING.md - 贡献指南
- relay-protocol.md - 中继协议
- project-registry.md - 项目注册表
- workflow-node-history-design.md - 工作流历史
- ... (更多)

## 🎨 Dashboard

### Dashboard Next（React + Vite）

**技术栈:**
- React 18
- Vite
- Tailwind CSS
- Shadcn/ui

**功能:**
- 任务仪表板
- 记忆浏览
- Radio 消息流
- 工作流可视化
- 项目概览

**运行:**
```bash
cd dashboard-next
npm install
npm run dev
```

## 🧪 测试

### 测试文件

- `core-commands.test.mjs` - 核心命令测试
- `dashboard-api.test.mjs` - API 测试
- `dispatch-reliability.test.mjs` - 可靠性测试
- `module-structure.test.mjs` - 模块结构测试

**运行测试:**
```bash
npm test
```

## 📦 工作流配方

### 5 个内置配方

1. **backend-service.json** - 后端服务开发流程
2. **frontend-feature.json** - 前端功能开发
3. **fullstack-feature.json** - 全栈功能实现
4. **lights-out-local.json** - 全自动无人值守
5. **minimal-backend-api.json** - 最小 API 实现

**使用:**
```bash
ai-memory-hub workflow create "My Feature" \
  --recipe recipes/fullstack-feature.json \
  --project my-project
```

## 🔧 配置文件

### Policy Packs（4 个）✨ 新增

位置: `~/.ai-memory/policy/packs/`

1. **conservative-reviewer.json** - 保守审查者
2. **trusted-executor.json** - 可信执行者
3. **junior-developer.json** - 初级开发者
4. **planner-persona.json** - 规划者人格

## 📊 项目统计

### 代码量

- **总文件数:** 100+
- **核心代码:** ~7500 行
- **文档:** ~10000 行
- **测试:** ~1000 行
- **配置:** ~500 行

### 提交历史

- **总提交数:** 200+
- **本次会话提交:** 16 次
- **贡献者:** Claude, Codex, 人类用户

### 依赖

**生产依赖:**
- ws@^8.18.0 (WebSocket)

**开发依赖:**
- playwright@^1.61.0 (测试)

## 🎯 功能完整度

### 核心功能 ✅ 100%
- 任务管理
- 共享记忆
- Radio 消息
- 工作流
- 项目管理
- Dispatch 分发

### 高级功能 ✅ 100%
- CDP Bridge
- 文件锁
- Policy Packs
- VS Code 生成器
- 质量门

### 工具支持 ✅
- Claude ✓
- Codex ✓
- Gemini ✓
- VS Code ✓
- 浏览器扩展（通过 CDP Bridge）

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/monkey-sking/ai-memory-hub.git
cd ai-memory-hub

# 安装依赖
npm install

# 运行演示
npm run demo

# 启动 CDP Bridge
npm run cdp-bridge

# 生成 VS Code 扩展
node scripts/generate-vscode-extension.js
```

## 📖 学习路径

1. **基础:** 阅读 README.md
2. **使用:** 阅读 usage-and-verification-guide.md
3. **实操:** 运行 `npm run demo`
4. **进阶:** 阅读设计文档（RPC, Handoff Bus, Policy）
5. **扩展:** 生成 VS Code 扩展，编写自定义配方

## 🎁 项目亮点

1. **完整性** - 从基础到高级，一应俱全
2. **文档齐全** - 40+ 文档，覆盖所有功能
3. **可扩展** - CDP Bridge 让任何工具接入
4. **工程化** - 质量控制、权限管理、自动化
5. **实用性** - 演示脚本、生成器、开箱即用
6. **社区友好** - 模板、配方、贡献指南

---

**AI Memory Hub** - 一个功能完整、文档齐全、架构清晰的多 AI 协作系统！🎉
