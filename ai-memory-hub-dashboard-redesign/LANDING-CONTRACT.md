# AMH Dashboard — Plan A React 落地合同（LANDING CONTRACT）

**目标**：把 `dashboard-next` 里 13 个共用 `src/pages/Dashboard.tsx` 单体的路由，拆成各自独立的路由组件文件，套用**已就位**的 Plan A 设计令牌 + 现有 shell 组件 + 真实数据层。纯前端，无后端改动。

**已完成的基础（不要重复做、不要改）**：
- `src/index.css` — Plan A 令牌地基（暗色默认 + `[data-theme="light"]` 浅色覆盖，`#6e5ef2` 靛蓝主色）。所有路由全局换肤已生效。
- `src/components/Layout.tsx` — 暗/浅主题切换已接好。
- `src/pages/Skills.tsx`、`Extensions.tsx`、`Chat.tsx` — 已是独立组件，作为**标准范式**，无需重建。
- 数据层 `src/lib/api.ts`（`apiGet/apiPost/apiDelete/asArray/asRecord/textOf/numberOf/formatDate/formatRelativeTime`）、`src/lib/realtime.ts`（`createDashboardRealtimeClient`）、i18n `src/lib/dashboardCopy.ts`（`dashboardTitles/dashboardSubtitles/dashboardLabels`）、`src/lib/i18n.ts`（`AppOutletContext`）——只读，不要改。

---

## 每个 agent 的硬约束

1. **只新建一个文件**：`src/pages/<Route>.tsx`（组件名与文件名一致，如 `Overview`）。**严禁修改** `Dashboard.tsx` / `App.tsx` / `index.css` / `api.ts` / `realtime.ts` / `dashboardCopy.ts` / `src/components/**` / `src/components/shell/**`。需要的小工具函数写在自己文件内。
2. **范式对齐**：通读 `src/pages/Skills.tsx`，严格沿用其 import 风格、`PageShell` 用法、`useOutletContext<AppOutletContext>()` 取值、`apiGet/apiPost` 调用、`dashboardLabels` 取内联文案的方式。
3. **行为对齐**：在 `src/pages/Dashboard.tsx` 中 grep 你负责路由对应的 panel 函数（见下「路由→panel 映射」），读取其 JSX 与 handler，**忠实移植数据形状与核心动作**（刷新、筛选、主操作如 tasks 勾选 / memory 加载更多 / tools 执行 / settings 保存）。
4. **视觉对齐**：读取 `D:/Project/ai-memory-hub/ai-memory-hub-dashboard-redesign/proto-next/<route>.html` 作为 Plan A 版式目标，反映其结构（卡片/表格/图表区/事件流等）。不要求像素级，但要 Plan A 观感。
5. **TS 严格度（必须）**：
   - `noUnusedLocals` / `noUnusedParameters` → 无未使用变量/导入。
   - `verbatimModuleSyntax: true` → **所有仅类型导入必须用 `import type { ... }`**（如 `import type { AppOutletContext } from '../lib/i18n'`）。
   - `erasableSyntaxOnly` → 禁止 `enum` / 命名空间 / 参数属性。
   - 给 props、state、handler 全部标注类型。组件用 `export default`。
6. **设计令牌（全局已定义，直接用 Tailwind 工具类 + 令牌类）**：
   - 文字：`text-ink`（主）/ `text-ink-2` / `text-ink-3`（弱）
   - 面：`bg-surface` / `bg-surface-raised` / `bg-canvas-deep`
   - 边：`border-line` / `border-line-strong`
   - 主色：`text-accent-base` / `bg-accent-base` / `bg-accent-tint`
   - 语义：`text-success`·`bg-success-tint`、`text-warning`·`bg-warning-tint`、`text-danger`·`bg-danger-tint`、`text-info`
   - 暗色默认，浅色由全局 `[data-theme="light"]` 处理——**不要**在组件内加主题切换逻辑。
7. **可用 shell 组件**（`import { ... } from '../components/shell'`）：`PageShell, Panel, SectionHeader, FilterBar, StatusTabs, StatTile, StatTileGrid, EmptyState, LoadingState, Skeleton, ErrorState, Callout, Sheet`（含 SheetContent 等）。
8. **可用 ui 原语**（`../components/ui/*`）：`Badge`（`badge.tsx`）、`Button`（`button.tsx`）、`Dialog`、`Input`、`Label`、`Table`、`Textarea`。`cn` 来自 `@/lib/utils` 或 `../lib/utils`。
9. **数据真实性**：绝不编造 mock。端点拿不到的字段用 `asArray/asRecord` 防御式渲染，能显示什么就显示什么。

## v1 范围

- **必须**：挂载即拉真实数据；Plan A 风格连贯版式；loading / empty / error(可重试) 三态；一个刷新动作；保留该路由核心动作。
- **可简化（省略请注释说明）**：看板拖拽、行内单元格编辑器、虚拟滚动、实时 diff-merge 等高级交互。用更稳的呈现替代（如 tasks 用分组卡片而非完整拖拽看板），但保留数据与动作。

## 路由 → panel 映射（在 Dashboard.tsx 中 grep 对应函数名读取）

| 路由文件 | section 字面量 | 数据端点 | Dashboard.tsx panel 函数（约行号） | proto html |
|---|---|---|---|---|
| `Overview.tsx` | `overview` | `GET /api/dashboard/overview`（可接 `createDashboardRealtimeClient` 做实时指标，简化也可仅 mounts + 刷新） | `CommandCenter` ~477–614 | `overview.html` |
| `Memory.tsx` | `memory` | `GET /api/memory`（分页，可只拉首页 + 加载更多） | `NewMemoryPanel`（grep `MemoryPanel`） | `memory.html` |
| `Tasks.tsx` | `tasks` | `GET /api/tasks?includeCancelled=1` + `GET /api/projects` | `NewTasksPanel`（grep `TasksPanel`） | `tasks.html` |
| `Radio.tsx` | `radio` | `GET /api/radio`（分页） | `NewRadioPanel`（grep `RadioPanel`） | `radio.html` |
| `Dispatch.tsx` | `dispatch` | `GET /api/dispatch` | `DispatchPanel` 615–673 | `dispatch.html` |
| `Workflows.tsx` | `workflows` | `GET /api/workflows` + `GET /api/projects` | `WorkflowsPanel`（grep `WorkflowsPanel`） | `workflows.html` |
| `Analytics.tsx` | `analytics` | `GET /api/metrics` | `AnalyticsPanel` 674–727 | `analytics.html` |
| `Backups.tsx` | `backups` | `GET /api/backups` | `BackupsPanel` 728–1156 | `backups.html` |
| `Search.tsx` | `search` | `GET /api/search?q=&type=&range=&sort=&limit=` | `SearchPanel` 1157–1238 | `search.html` |
| `Tools.tsx` | `tools` | `GET /api/tools` | `ToolsPanel` 1239–1748 | `tools.html` |
| `Projects.tsx` | `projects` | `GET /api/projects` | `ProjectsPanel`（grep `ProjectsPanel`） | `projects.html` |
| `Health.tsx` | `health` | `GET /api/health`（返回 status） | `HealthPanel` 1749–1920 | `health.html` |
| `Settings.tsx` | `settings` | `GET /api/settings` | `SettingsPanel` 1921–2373 | `settings.html` |

**标题/副标题来源**：`import { dashboardTitles, dashboardSubtitles } from '../lib/dashboardCopy'`，用 `dashboardTitles[language]['<section>']` 与 `dashboardSubtitles[language]['<section>']`。内联文案优先用 `dashboardLabels[language].<feature>` 已有键，没有就用中文/英文字面量（不要往 dashboardCopy 加键）。

## 整合（由主理人统一做，agent 不用管）

主理人改 `src/App.tsx`：把 13 条 `<Dashboard section="x" />` 替换为 `import X from './pages/X'` 后 `<X />`；`Dashboard.tsx` 保留作回退。然后跑 `npm run build`（如遇 `dist/` 清理的 `[safe-delete]` 报错，先 `rm -rf dist` 再 build），修类型/导入错误，对失败或明显回退的路由回退到 `<Dashboard section>`。
