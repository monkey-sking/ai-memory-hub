# AMH Dashboard · 3 缺口需求考古（Discovery）

> 目的：为 3 个功能缺口（Workflows / Tasks 看板 / 富图表）产出**可直接喂给原型师**的精确规格。
> 方法：所有结论均来自真实源文件，标注 `文件:行号`。**未做任何改动，未虚构数据。**
> 资料基准（2025-08-14 仓库状态）：
> - 原型：`ai-memory-hub-dashboard-redesign/proto-next/*.html`（Plan A 终版，16 路由），`.../pages/*.html`（早期批，含带看板结构的 `tasks.html`）
> - 落地：`dashboard-next/src/pages/*.tsx` + `src/lib/api.ts` + `src/components/ui/*`
> - 后端：`src/index.js`（路由 + 实体工厂）、`src/dashboard/{workflows,tasks,metrics,health,actions}.js`

---

## 缺口 1 · Workflows（工作流）

### 1.1 原型交互清单（proto-next/workflows.html）

| 元素 | 说明 | 出处 |
|---|---|---|
| `创建工作流` 主按钮 | 顶部 primary 按钮，打开新建表单 | `proto-next/workflows.html:672` |
| 工作流卡片网格 | 卡片显示 `wf__crew`（planner/executor/reviewer）、状态、进度 | `proto-next/workflows.html:699-774` |
| 详情抽屉（Drawer） | 右滑 Sheet，KV（进度/最近运行/角色/耗时）+ 执行步骤时间线 | `proto-next/workflows.html:788-842` |
| 执行步骤（关系图替身） | 竖向步骤轨：Planner(done)→Executor(running)→Reviewer(pending)→Observer(pending) | `proto-next/workflows.html:808-839` |
| 抽屉底部动作 | `重试` / `克隆` / `删除`（danger） | `proto-next/workflows.html:843-846` |

代表性片段（删除按钮 + 步骤时间线）：
```html
<!-- proto-next/workflows.html:808-846 -->
<div class="step__name">Planner <span class="step__role">已完成</span></div>
<div class="step__name">Executor <span class="step__role">进行中</span></div>
<div class="step__name">Reviewer <span class="step__role">待执行</span></div>
<div class="step__name">Observer <span class="step__role">待执行</span></div>
...
<button class="btn btn--danger" style="margin-left:auto"><svg class="icon"><use href="#i-trash"/></svg>删除</button>
```
> 注：原型里「关系图(graph)」以**节点/步骤时间线**呈现（Planner/Executor/Reviewer/Observer），**未出现带连线的真·有向图**。对照组 `GAP-AUDIT.md:78` 称其为「执行图谱 Dialog（/api/workflows/:id/nodes）」。

### 1.2 落地现状对照表（dashboard-next/src/pages/Workflows.tsx）

| 原型有 | 落地现状 | 出处 |
|---|---|---|
| 列表 + 状态/优先级徽章 + 筛选 + 搜索 | ✅ 已实现（StatTileGrid + Panel + StatusTabs + FilterBar） | `Workflows.tsx:248-414` |
| `start`(置 in_progress) | ✅ `setWorkflowStatus` | `Workflows.tsx:155-168, 369-374` |
| `result` / `review` / `signal` | ✅ 单 Dialog 覆盖 | `Workflows.tsx:170-218, 436-508` |
| **`创建工作流`（create）** | ❌ 省略（注释明确说明） | `Workflows.tsx:41-43` |
| **`编辑`（edit）** | ❌ 省略 | 同上 |
| **`删除`（delete）** | ❌ 省略 | 同上 |
| **关系图 / 节点（nodes）** | ❌ 省略（无 nodes 拉取，无图谱 Dialog） | 同上 |
| 详情抽屉 + 重试/克隆/删除 | ❌ 省略 | 同上 |

拉取：`GET /api/workflows` + `/api/projects`（`Workflows.tsx:97-98`）。无 `GET /api/workflows/:id/nodes` 调用。

### 1.3 后端真实字段与端点（`src/index.js` / `src/dashboard/workflows.js`）

| 端点 | 方法 | 状态 | 出处 |
|---|---|---|---|
| `/api/workflows` | GET | ✅ 返回 `{ workflows: [...] }` | `index.js:8553-8555` |
| `/api/workflows` | POST | ✅ 创建，**仅 `title` 必填**；可选 `project/planner/executor/reviewer/observer/plan/acceptance/priority/risks/status/spawnTasks/notify` | `index.js:8606-8617`, `workflows.js:30-67` |
| `/api/workflows/:id` | PATCH | ✅ 改 `title/project/plan/acceptance/planner/executor/reviewer/observer/priority/status/risks` | `index.js:8625-8633`, `workflows.js:69-114` |
| `/api/workflows/:id` | DELETE | ✅ 软删除（写 event store） | `index.js:8634-8642`, `workflows.js:116-134` |
| `/api/workflows/:id/status` | POST | ✅ `{ status }` 必填 | `index.js:8643-8654` |
| `/api/workflows/:id/nodes` | GET | ✅ 返回 `{ nodes: [...] }` | `index.js:8622-8624`, `workflows.js:229-237` |
| `/api/workflows/:id/{result,review,note}` | POST | ✅ `{ text }` 必填 | `index.js:8655-8666` |
| `/api/workflows/:id/signal` | POST | ✅ `{ to, text }` 必填 | `index.js:8667-8681` |

**Workflow 真实字段结构**（`createWorkflow`，`index.js:12250-12277`）：
```
id, createdAt, updatedAt, completedAt, createdBy,
status,            // 枚举见下
priority,          // low | normal | high | urgent（normalizePriority）
project, title,
planner[], executor[], reviewer[], observer[],   // 均为字符串数组（角色可多人）
plan, acceptance, qualityGate,
risks[], results[], reviews[], linkedTasks[], linkedRadio[], notes[]
```
**Workflow 状态枚举**（`isWorkflowStatus`，`index.js:12647-12649`）：
`open | planned | in_progress | review | blocked | done | cancelled`（7 值）

**节点（nodes）结构**（`readWorkflowNodes`，`index.js:11491-11502` + 事件形状 `index.js:11533-11551`）：
```
{ workflowId, nodeId, slug, label, role, actor, status,
  ts, createdAt, startedAt, completedAt, input, output, error, isRequired }
```
> ⚠️ **无 edges 字段**：`GET /api/workflows/:id/nodes` 只回 `nodes`，后端任何地方都没有「边/连线」数据。真·有向图（带箭头连线）**无法用真实数据绘制**——最多只能画节点时间线/列表（数据真实 ✅），连线须 mock 或按 role 顺序推导（不可靠）。

### 1.4 依赖清单
- shadcn/ui `Dialog` ✅（`src/components/ui/dialog.tsx`）— create/edit 表单可直接复用。
- `Button`/`Input`/`Textarea`/`Label`/`Badge` ✅（`src/components/ui/*`）。
- **无 `Select` 组件**（目录无 `select.tsx`）→ 状态下拉用原生 `<select>`（落地 Tasks 已这么用，`Tasks.tsx:442-451`）。
- 图表库 ❌、拖拽库 ❌（本缺口不需要拖拽）。

### 1.5 给原型师的约束
- **能真做**：列表/筛选/搜索（已有）；`start/result/review/signal`（已有）；**create 表单**（POST `/api/workflows`，字段对齐 1.3）；**edit 表单**（PATCH `/api/workflows/:id`，同字段）；**delete 按钮**（DELETE）；**节点时间线/步骤图**（GET `/api/workflows/:id/nodes`，真实节点）。
- **受后端限制**：关系图若要做到「带连线的有向图」，**edges 后端无端点** → 只能画节点列表/竖向步骤轨，或自行用 role 顺序（planner→executor→reviewer→observer）推导占位连线，**不得声称数据真实**。
- create/edit 字段以 1.3 的 `POST/PATCH` body 为准，不要自创字段。

---

## 缺口 2 · Tasks 看板（拖拽）

### 2.1 原型交互清单（pages/tasks.html = 带看板结构的早期批）

| 元素 | 说明 | 出处 |
|---|---|---|
| 视图切换 | `看板视图`（默认激活）/ `列表视图` 双 toggle | `pages/tasks.html:520-527` |
| 看板 4 列 | `待处理(5) / 进行中(4) / 待审核(3) / 已阻塞(2)` | `pages/tasks.html:533-776` |
| 任务卡 | 优先级点、项目标签、标题、进度条(in_progress)、负责人头像、截止日 | `pages/tasks.html:542-815` |
| 过滤器 | 项目/优先级/状态下拉 + 搜索框 | `pages/tasks.html:504-519` |
| 新建任务 | `新建任务` 按钮 | `pages/tasks.html:670` |

代表性片段（看板列头 + 卡片）：
```html
<!-- pages/tasks.html:533-547 -->
<div class="kanban-column">
  <div class="column-header">
    <span class="col-dot" style="background: var(--state-info);"></span>
    <span class="col-name">待处理</span><span class="col-count">5</span>
  </div>
  <div class="column-body">
    <div class="task-card">
      <span class="priority-dot" style="background: var(--state-error);"></span>
      <span class="project-tag">ai-memory-hub</span>
      <div class="task-title">分析代码结构并生成文档</div>
```
> 注：早期批 `pages/tasks.html` 是**真·看板（4 列）**；Plan A 终版 `proto-next/tasks.html` 改为 **chips(全部/待办/进行中/阻塞/已完成) + 表格**，且 chips 用 `todo/doing/blocked/done` 取值。两版列名/取值都不等于后端枚举，见 2.3。

### 2.2 落地现状对照表（dashboard-next/src/pages/Tasks.tsx）

| 原型有 | 落地现状 | 出处 |
|---|---|---|
| 拉取任务 + 项目 | ✅ `GET /api/tasks?includeCancelled=1` + `/api/projects` | `Tasks.tsx:127-128` |
| **拉取 `kanban` 分组** | ✅ 已 fetch 并存（`setKanban`） | `Tasks.tsx:131` |
| 过滤器（状态/项目/优先级/搜索） | ✅ 多选用 FilterBar | `Tasks.tsx:297-333` |
| 新建任务（create） | ✅ Dialog + `POST /api/task/add` | `Tasks.tsx:221, 225-233, 412-480` |
| 生命周期动作（claim/start/complete/verify/reopen/review） | ✅ | `Tasks.tsx:221-223, 371-399` |
| **看板多列展示** | ❌ 用 `<ul>` 过滤列表代替（`comment` 明确） | `Tasks.tsx:9-15, 338-404` |
| **卡片跨列拖拽** | ❌ 未实现（无拖拽库、无 DnD 逻辑） | `Tasks.tsx:9-15` |
| 状态更新写回 | ✅ `POST /api/task/status`（`runStatus`）已接好 | `Tasks.tsx:222` |

> 关键：落地**已经同时拿到了 `kanban` 分组数据和 `POST /api/task/status` 写回端点**，只是 UI 没渲染成列、没绑拖拽。补看板 = 把 `kanban` 渲染成列 + 把拖放结果发给已有端点。

### 2.3 后端真实字段与端点

| 端点 | 方法 | 状态 | 出处 |
|---|---|---|---|
| `/api/tasks?status=&includeCancelled=` | GET | ✅ 返回 `{ tasks, total, offset, limit, hasMore, kanban }` | `index.js:8548-8552`, `tasks.js:15-30` |
| `/api/task/add` | POST | ✅ `{ title }` 必填；可选 `description/handoff/project/priority` | `index.js:8919-8927`, `actions.js:68-84` |
| `/api/task/claim` | POST | ✅ `{ id }` | `index.js:8928-8936` |
| `/api/task/status` | POST | ✅ `{ id, status }` 必填 → **任意合法枚举值** | `index.js:8937-8948`, `actions.js:104-129` |
| `/api/task/review` | POST | ✅ `{ id, decision: approved|rejected }` | `index.js:8949+`, `actions.js:131-203` |

**Task 真实字段**（`createTask`，`index.js:12484-12503`）：
`id, createdAt, updatedAt, completedAt, createdBy, assignee, status, priority, project, title, description, handoff, qualityGate, notes[]`

**Task 真实状态枚举**（`isTaskStatus`，`index.js:12643-12645`）：
`open | claimed | in_progress | blocked | needs_verification | done | cancelled`（7 值）

**`kanban` 真实分组键**（`buildTaskKanban`，`tasks.js:43-59`）：
`open | claimed | in_progress | needs_verification | blocked | done | cancelled`（与枚举一一对应，7 列）

**`setDashboardTaskStatus` 行为**（`actions.js:104-129`）：把任务置为请求的状态（除 `cancelled` 不可被改出）；会写 `completedAt`、追加 note。**即拖拽落列 = 发 `POST /api/task/status {id, status}`。**

> ⚠️ **列名/取值对齐陷阱**：
> 1. 后端枚举是 7 值（含 `claimed`、`needs_verification`），原型看板只画 4 列（待处理/进行中/待审核/已阻塞），且 `proto-next` 用 `todo/doing/blocked/done`。**原型师必须映射到后端 7 枚举**，不能照搬原型中文列名；建议复用落地已有的 `dashboardCopy.statusLabels` 国际化标签。
> 2. 落地 `Tasks.tsx:53-62` 的 `TASK_STATUS_ORDER` 含 **`failed`**，但后端枚举**没有 `failed`**（`assertTaskStatus` 会拒）。**不要为 `failed` 设计列/动作**，那是死状态。

### 2.4 依赖清单
- **拖拽库 ❌**：`package.json` 无 `@dnd-kit/*`、`react-dnd`。需新增（推荐 `@dnd-kit/core` + `@dnd-kit/sortable`）或用原生 HTML5 DnD（零依赖，但体验/无障碍弱）。
- shadcn/ui：`Dialog`✅（新建任务已用）、`Button`✅、`Badge`✅、原生 `<select>`✅（`Tasks.tsx:442`）。无 `Select` 组件。
- 数据层已就绪：**无需后端改动**。

### 2.5 给原型师的约束
- **能真做**：7 列看板（用 `GET /api/tasks` 的 `kanban` 分组）；卡片跨列拖拽 → 落点发 `POST /api/task/status`；新建/claim/start/complete/verify/reopen/review 全部已有端点。
- **受依赖限制**：拖拽交互需先装拖拽库（或接受原生 DnD）。这是**前端依赖缺口，不是数据缺口**——数据/端点 100% 具备。
- 列定义必须 = 后端 7 枚举（`tasks.js:43-59`），不要照搬原型 4 列中文名，也不要用 `failed`。

---

## 缺口 3 · 富图表（Overview / Analytics / Health）

### 3.1 原型交互清单（proto-next/*.html）

| 页面 | 图表类型 | 出处 |
|---|---|---|
| Analytics | **折线 + 面积图**（双序列：`line1` 实线 accent、`line2` 虚线 ink-5、area 渐变填充）+ y/x 轴 + 峰值标记 | `proto-next/analytics.html:281-289` |
| Analytics | **环形图 Donut**（stroke-dash 分段 + 中心数） | `proto-next/analytics.html:294-301` |
| Analytics | **条形图**（落地已用内联 SVG 条形，见 3.2） | `GAP-AUDIT.md:67` |
| Health | 同款 **折线/面积 + Donut**（`.chart`/`.donut` 样式复用） | `proto-next/health.html:280-300` |
| Overview | 每指标卡 **sparkline 折线**（polyline）+ 工具连通 **Donut** + 24h 趋势 | `pages/overview.html:615-688`, `GAP-AUDIT.md:64` |

代表性片段（Analytics 折线/面积 + Donut）：
```css
/* proto-next/analytics.html:283-289, 295-300 */
.chart__svg .line1{fill:none; stroke:var(--accent); stroke-width:2; ...}
.chart__svg .line2{fill:none; stroke:var(--ink-5); stroke-width:1.5; stroke-dasharray:4 4; ...}
.chart__svg .area{fill:url(#areaGrad);}
.donut{position:relative; width:160px; height:160px;}
.donut .seg{transition:stroke-dashoffset var(--dur-fast) var(--ease);}
```
> 图表专用 token（`--chart-line`、`--chart-line2`、`--ease`、`--dur-fast`）定义在原型里（`analytics.html:66-67`、`health.html:65-66`），**不在项目 `@theme` 中**，需用 Plan A 既有变量映射（见 §原型师须知）。

### 3.2 落地现状对照表

| 页面 | 当前渲染 | 端点 | 出处 |
|---|---|---|---|
| Overview | StatTileGrid + **真实 Donut**（工具连通）+ 活动流；**无 sparkline/24h 趋势** | `GET /api/dashboard/overview` | `Overview.tsx:93,136,232,395` |
| Analytics | StatTileGrid + **内联 SVG 横向条形图**（真实指标 `byStatus/byTool/...`） | `GET /api/metrics` | `Analytics.tsx:53,88,181` |
| Health | StatTileGrid + 存储 Panel；**未渲染 `growthTrend` 图表**（数据已拿到但没画图） | `GET /api/health` | `Health.tsx:76,154-242` |

> 落地**没有占位假数据**，只是把富图表降级为「StatTile + 简化内联 SVG」。Overview 的 Donut 与 Analytics 的条形图已是**真实数据驱动**。

### 3.3 后端真实字段与端点

| 端点 | 方法 | 返回的数据形状 | 时间序? | 出处 |
|---|---|---|---|---|
| `/api/metrics` | GET | `tasks{total,byStatus,byTool,avgDurationMs,...}`、`workflows{total,byStatus,avgDurationMs}`、`radio`、`projects{byActivity}`、`relay{byStatus,successRate}`、`queue`、`recentFailures` | ❌ 仅聚合计数 | `metrics.js:110-149` |
| `/api/health` | GET | `analysis{ score,status,totalRecords,duplicateRate,storage{items[]}, growthTrend, issues[], ... }` | ✅ **`growthTrend`** | `health.js:25-84`, `index.js:8879-8888` |
| `/api/dashboard/overview` | GET | 标量/数组聚合（memory.total、tasks[]、tools[]、agentsOnline、workflowTotal、healthScore） | ❌ 无时序数组 | `index.js:8374-8375` |

**关键发现 — Health 有真实时序**：
`analysis.growthTrend = getMemoryGrowthTrend(records, 14)`（`index.js:14906, 15421-15434`）返回
```js
[{ date: "YYYY-MM-DD", count: number }, ...]  // 最近 14 天每日记忆增量
```
→ **Health 的折线/面积图可用真实数据绘制**（落地目前没画，数据已随 `/api/health` 返回）。

**Overview 无真实时序**：`/api/dashboard/overview` 无时序数组 → 原型的「每卡 sparkline / 24h 趋势线」**无端点支撑**，只能占位或省略（落地已省略）。

**Analytics 无真实时序/多序列**：`/api/metrics` 只有聚合计数（byStatus/byTool 等）→ 折线(双序列)/面积/Donut 的「序列」无端点；但**条形图可用 `byStatus`/`byTool` 等真实聚合绘制**（落地已做）。

### 3.4 依赖清单
- **图表库 ❌**：`dashboard-next/package.json` 无 `recharts`/`echarts`/`chart.js`/`d3`/`visx`。
- 现状方案：落地用**手绘内联 SVG**（`Analytics.tsx:BarChart`、`Overview.tsx:StatusDonut`）规避依赖。
- shadcn/ui 无图表组件；`lucide-react` 图标 ✅。

### 3.5 给原型师的约束
- **能真做（真实数据）**：
  - Health：**折线/面积图** = `analysis.growthTrend`（14 天真实序列）；Donut = 存储占比 `storage.items`（真实）。
  - Analytics：**条形图** = `metrics.*.byStatus` / `byTool` / `projects.byActivity`（真实，落地已示范）。
  - Overview：**Donut** = 工具连通（真实，已落地）。
- **受后端限制（只能占位/省略，不得伪造）**：
  - Overview 的**每卡 sparkline / 24h 趋势线**：`/api/dashboard/overview` 无时序 → ❌ 无端点。
  - Analytics 的**双序列折线/面积**：`/api/metrics` 无时序数组 → ❌ 无端点（除非新增后端聚合）。
  - 任何「按天/按工具统计的记忆量时序」「runner 活跃度时序」：后端**暂无对应端点**（metrics 只给当前快照计数）。
- **无图表库**：若要画折线/面积/Donut，要么 (a) 继续用手绘内联 SVG（与落地一致、零依赖），要么 (b) 引入图表库（需改 `package.json` + 构建）。推荐 (a) 以保持「真实数据 + 零依赖」红线。

---

## 原型师须知（全局约束）

1. **视觉必须对齐 Plan A token，禁止自创一套。**
   令牌真源 = `dashboard-next/src/index.css` 的 `@theme` 块（起始 `index.css:22`）。原型里出现的图表专用变量须映射回既有 token：
   - `--chart-line` → `--color-accent-base`（`#6e5ef2`，`index.css:101`）
   - `--chart-line2` → `--color-ink-5`（`#6a6e78`，`index.css:94`）
   - 底色/面板：`--color-canvas #0b0c0e`(`82`)、`--color-surface #15161a`(`84`)、`--color-surface-raised #1e1f25`(`85`)、`--color-surface-sunk #0e0f12`(`86`)
   - 边框：`--color-line #2a2b31`(`87`)、`--color-line-strong #3a3c44`(`88`)
   - 文字：`--color-ink #f2f3f5`(`90`) … `--color-ink-5 #6a6e78`(`94`)
   - 语义：`--color-success #3fb950`(`131`)、`--color-danger`(`120-121`)、`--color-warning`、`--color-info`、`--color-focus #6e5ef2`(`116`)
   - 字体：`--font-sans`(`24`)、`--font-mono`(`27`)；圆角 `--radius-*`；阴影 `--shadow-focus`(`118`)
   - 间距/层级沿用 `@theme` 中的 `--space-*` / `--z-*`（与原型 `--section-gap`/`--z-drawer` 等对应）。

2. **复用既有组件与遗留类，不重写。**
   - shadcn/ui（`src/components/ui/`）：`button` `dialog` `input` `textarea` `label` `badge` `table` 已可用；**无 `select`** → 状态下拉用原生 `<select>`（参照 `Tasks.tsx:442`）。
   - 遗留 `Dashboard.css` 类仍全局生效，可复用：`.dashboard-page`(`5`)、`.panel-grid`(`53`)、`.workflow-*`(`255+`)、`.search-*`、`.tool-*`、`.radio-*`、`.dispatch-card`、`.backup-row`、`.memory-record-card`。新组件优先用 `components/shell` 的 `Panel`/`StatTile`/`StatusTabs`/`FilterBar`/`PageShell`（落地页面已统一采用）。

3. **真实数据红线（来自 LANDING-CONTRACT / GAP-AUDIT）。**
   - 所有图表/列表/表单必须接真实端点（见各缺口 1.3/2.3/3.3），**不得编造数据**。
   - 仅当端点确实不存在（Overview sparkline、Analytics 双序列折线、图谱 edges）时，才允许**占位/省略**，并明确标注「无后端端点」，不得伪装成真实数据。

4. **状态枚举以后端为唯一真源**（不要照搬原型中文列名）：
   - Task：`open | claimed | in_progress | blocked | needs_verification | done | cancelled`（`index.js:12643`）
   - Workflow：`open | planned | in_progress | review | blocked | done | cancelled`（`index.js:12647`）
   - 切勿使用原型里的 `todo/doing/待处理/待审核` 或落地死状态 `failed` 作为数据键。

---

## 一句话总览（3 缺口「能真做 / 受后端限制」）

- **Workflows**：🟢 **基本能真做**——create/edit/delete 与节点时间线均有完整真实端点（`POST/PATCH/DELETE /api/workflows` + `GET /api/workflows/:id/nodes`），仅「带连线的关系图」受限于**后端无 edges 端点**（只能画节点列表/步骤轨，连线须占位）。
- **Tasks 看板**：🟢 **数据/端点 100% 具备**（`kanban` 分组已随 `/api/tasks` 返回，`POST /api/task/status` 已接好）——唯一缺口是**前端无拖拽库**，属依赖限制而非后端限制，补看板几乎零后端改动。
- **富图表**：🟡 **部分能真做、部分受后端限制**——Health 折线图（真实 `growthTrend` 14 天时序）与 Analytics/Overview 的条形/Donut（真实聚合）可真实绘制；但 Overview 的 sparkline/24h 趋势、Analytics 的双序列折线/面积**无对应时序端点**，只能占位/省略，且全站**无图表库**需延续手绘内联 SVG。
