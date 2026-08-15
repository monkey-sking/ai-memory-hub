# Plan A 落地 · 原型 vs 真实项目 缺口清单（Gap Audit）

> 范围：`ai-memory-hub-dashboard-redesign/proto-next/*.html`（16 套高保真原型）
> 对照：`dashboard-next/src/pages/*.tsx`（13 个已落地的独立路由 + Skills/Extensions/Chat）
> 结论先行：**路由级缺口 = 0；唯一真实缺口在「可视化 / 图表」层。**

---

## 1. 路由级缺口 = 0（已闭环）

16 套原型页 ↔ `Layout.tsx` 的 16 个 `navGroups` 条目一一对应，无原型独有、项目缺失的路由：

| 原型页 | 项目路由 | 落地状态 |
|---|---|---|
| overview | `/dashboard` (Overview.tsx) | ✅ 已落地 |
| memory | `/memory` (Memory.tsx) | ✅ 已落地 |
| tasks | `/tasks` (Tasks.tsx) | ✅ 已落地 |
| radio | `/radio` (Radio.tsx) | ✅ 已落地 |
| dispatch | `/dispatch` (Dispatch.tsx) | ✅ 已落地 |
| workflows | `/workflows` (Workflows.tsx) | ⚠️ 简化落地（见 §4） |
| analytics | `/analytics` (Analytics.tsx) | ✅ 已落地 |
| backups | `/backups` (Backups.tsx) | ✅ 已落地 |
| search | `/search` (Search.tsx) | ✅ 已落地 |
| tools | `/tools` (Tools.tsx) | ✅ 已落地 |
| projects | `/projects` (Projects.tsx) | ✅ 已落地 |
| health | `/health` (Health.tsx) | ✅ 已落地 |
| settings | `/settings` (Settings.tsx) | ✅ 已落地 |
| skills | `/skills` (Skills.tsx) | ✅ 原已独立 |
| extensions | `/extensions` (Extensions.tsx) | ✅ 原已独立 |
| chat | `/chat` (Chat.tsx) | ✅ 原已独立 |

（第 17 个 `index.html` 是原型画廊入口，非业务路由。）

---

## 2. 功能 / 端点级：原型演示的能力，项目端点**都能支撑**

逐路由核对原型展示的核心能力 ↔ 真实 `apiGet` 端点，全部有对应数据源，无"原型有、后端无"的功能缺口：

- overview → `GET /api/dashboard/overview` ✅
- memory → `GET /api/memory` ✅
- tasks → `GET /api/tasks?includeCancelled=1` + `/api/projects` ✅
- radio → `GET /api/radio` ✅
- dispatch → `GET /api/dispatch`（+ `POST /api/dispatch/run`）✅
- workflows → `GET /api/workflows` + `/api/projects`（+ status/result/review/signal POST）✅
- analytics → `GET /api/metrics` ✅
- backups → `GET /api/backups`（+ create/restore/delete）✅
- search → `GET /api/search?...` ✅
- tools → `GET /api/tools` + `/api/detect` + `/api/capabilities` ✅
- projects → `GET /api/projects` ✅
- health → `GET /api/health` ✅
- settings → `GET /api/settings`（+ `POST /api/settings`）✅

**结论：功能与数据层无缺口。** 落地页全部走真实 `fetch`，未伪造任何数据。

---

## 3. 唯一真实缺口：可视化 / 图表层（已用简化视觉顶替，不伪造）

原型里出现、但项目**当前无法真实渲染**的图表元素：

| 可视化 | 原型位置 | 项目现状 | 落地处理 |
|---|---|---|---|
| 24h 时序折线 / 面积图 | overview、health 额外多 | 无 timeseries 端点，无图表库 | 省略，改用 StatTileGrid + 真实活动流 |
| 状态 donut（工具/健康占比） | overview、health | 无聚合占比端点 | 仅 overview 用内联 SVG 画"工具连通状态"真实占比，其余省略 |
| sparkline 趋势 | 多页卡片 | 无时序数据 | 省略 |
| 富图表（analytics 多图） | analytics | 无图表库 / 无多序列端点 | 改用 6 个内联 SVG 条形图 Panel（真实指标） |

**为什么不复刻**：项目无图表库（dashboard-next 未引入 recharts/visx 等），且无返回时序数组的端点。强行画 = 伪造数据，违反"真实数据唯一信源"红线。故落地采用 **StatTile + 简化内联 SVG** 顶替，富图表列为后续迭代。

---

## 4. Workflows 路由偏差（需用户知晓）

`Workflows.tsx` 终版为**简化落地**，与原 `WorkflowsPanel`（src/components/WorkflowsPanel.tsx，~700 行）相比：

- ✅ 保留：列表、状态/优先级徽章、状态筛选 + 搜索 + 项目筛选、核心动作 start / result / review / signal（内联按钮 + 单 Dialog）、StatTiles、加载/空/错误态。
- ❌ 省略：create（新建工作流）、edit（编辑）、delete（删除）、执行图谱 Dialog（`/api/workflows/:id/nodes`）、portal 溢出菜单。

其余 12 路由基本对齐原面板行为（Tasks 用 filterable list 替 kanban、Overview/Analytics 用简化可视化替富图表，均属 v1 简化范畴）。

**建议**：若工作流的新建/编辑/删除/图谱是高频刚需，下一步把 `WorkflowsPanel` 的上述能力补全进 `Workflows.tsx`（数据端点已具备）。

---

## 5. 集成层已修的坑（与缺口无关，但影响"能否跑起来"）

独立路由复用 `Dashboard.css` 里的遗留组件类（`panel-grid`、`tool-*`、`search-*`、`health-*`、`workflow-*`、`.dashboard-page`），而该 CSS 原只被 `Dashboard.tsx` 引入。已修：
- `src/main.tsx` 全局 `import './pages/Dashboard.css'`（Vite 去重，不双载）；
- `src/index.css` 旧令牌别名块已覆盖 `--text/--border/--bg-panel/--shadow/--danger/--success/...` → Plan A，仅补 `--accent-solid` 一个别名。
- 校验：`tsc -b` 通过、`vite build` 通过、13 个路由 chunk 全部产出、遗留类已进入打包 CSS。

---

## 结论

- **原型有、项目没有的"东西"**：仅"富图表 / 时序可视化"这一类，且根因是缺图表库 + 缺时序端点，不是缺路由或功能。
- **落地策略成立**：13 路由全部真实数据驱动、Plan A 视觉、类型干净、构建通过；富图表与 Workflows 高级动作列为后续。
