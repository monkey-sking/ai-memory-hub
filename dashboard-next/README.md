# AI Memory Hub 控制台（dashboard-next）

AI Memory Hub（AMH）的 Web 仪表盘。把多 agent 协作、工具 / 技能 / 扩展管理、任务 / 会话 / 评审查看等，集中到一个暗色、高效的操作台。

## 技术栈
- React 19 + Vite 8 + react-router 7
- TypeScript（strict 模式）
- Tailwind v4（设计 token 集中在 `src/index.css` 的 `@theme` 块）

## 架构（"骨子"）
页面不各自造轮子，统一套一套组合语法——对齐 `../ai-memory-hub-dashboard-redesign/proto-next/` 的高保真原型。

### 1. 共享壳 `Layout` / `Sidebar`
- 侧栏：3 组导航 + 2px accent 激活条
- 顶栏：全局搜索（⌘K）、健康灯脉冲、密度切换
- 双密度 token：紧凑 / 舒适，由顶栏按钮切换并持久化（`hub-density`）

### 2. 组件层 `src/components/ds/`
统一从 `@/components/ds` 导出：
- 结构：`PageHead`、`Card`、`AlertBanner`（3px 左缘 + 图标双编码）
- 指标：`MetricGrid` + `MetricCard`（含 SVG `Sparkline` 迷你折线）
- 图表：`ChartRow`（2.2fr 折线 + 1fr 环形 `Donut`）
- 流：`SplitRow`（`EventStream` 事件流 + `ToolConnectionList` 工具连接）
- 其它：`SectionTabs`、`SummaryStrip`、`ToolCard`

### 3. 页面组合顺序（骨子语法）
```
PageHead
  → AlertBanner（仅在有问题态时）
  → MetricGrid（5× MetricCard，部分带 sparkline）
  → ChartRow（折线 + 环形）
  → SplitRow（事件流 + 工具连接）
  → Card / Panel 表格
```

## 路由（共 19 个）
`memory` · `tasks` · `tools` · `skills` · `extensions` · `backups` · `projects` · `radio` · `dispatch` · `chat` · `search` · `analytics` · `health` · `settings` · `sessions` · `reviews` · `runners` · `workflows` · `overview`

`overview` 为落地页。

## 数据层约定（重要）
- 每页独立请求真实端点，封装在 `src/lib/api.ts` 的 `apiGet` / `apiPost`。
- 开发期由 `vite.config.ts` 把 `/api` 代理到 `http://127.0.0.1:38787`（AMH API）；可用环境变量 `VITE_HUB_API_TARGET` 覆盖。
- **KPI 只由已加载的真实数据派生，禁止编造数字。**
- 无 mock 数据；加载 / 错误 / 空态都有对应 UI。

## 本地运行
```bash
npm install
npm run dev        # 默认 5173，需先启动 AMH API（本机 38787）
npm run build      # tsc -b && vite build
```
指定代理目标：
```bash
VITE_HUB_API_TARGET=http://127.0.0.1:38787 npm run dev
```

## 设计来源
`../ai-memory-hub-dashboard-redesign/` 是本次 redesign 的设计规格与原型：
- `proto-next/*.html` —— 各页高保真原型，是前端"骨子"的准绳
- `DESIGN-SYSTEM.md` / `REDESIGN-INDEX.md` 等 —— 设计决策记录

## 提交约定
- 以下已在 `.gitignore` 忽略，**不进仓库**：`.workbuddy/`（WorkBuddy 项目数据）、构建产物（`dist*`、`.build-verify/`）、`.env*`
- 勿提交密钥、本地配置（`config.json` 已忽略）
