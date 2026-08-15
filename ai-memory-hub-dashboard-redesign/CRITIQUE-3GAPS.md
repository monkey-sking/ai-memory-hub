# AMH Dashboard · 3 缺口原型质量审查（CRITIQUE-3GAPS）

> 审查员：critique-reviewer-3 ｜ 基准：2025-08-14（与 DISCOVERY-3GAPS.md / DESIGN-SPEC-3GAPS.md 一致）
> 审查对象：`proto-gap-workflows.html` · `proto-gap-tasks-kanban.html` · `proto-gap-charts.html` · `proto-gap.css`
> 真源对照：`dashboard-next/src/index.css` `@theme` · `src/components/shell/*` · `DISCOVERY-3GAPS.md` · `DESIGN-SPEC-3GAPS.md` · `src/index.js`（后端实体）
> 性质：READ + WRITE-REPORT，未修改任何 .tsx / .html 源文件。

---

## 一、总体结论

三个原型**全部通过「后端诚实度」硬门槛**：没有伪造数据、没有画带箭头的 edges、占位区明确标注「无后端端点」。

- **P0 = 0**（无必须修复的阻断项）。
- **P1 = 1**（Tasks 看板卡片「截止日」隐含了后端不存在的 `due` 字段）—— 落地时删除该展示即可，不强制阻塞发布。
- **P2 = 若干**（i18n 标签、字段改名、a11y、组件映射、个别 token 对齐），均为落地打磨项。

| 缺口 | 裁决 | 5 维度总分 | 说明 |
|---|---|---|---|
| **1. Workflows** | ✅ **READY TO LAND** | 24 / 25 | 无 P0/P1；节点轨严格无箭头、字段对齐后端、枚举正确 |
| **2. Tasks 看板** | 🟡 **LAND WITH FIXES** | 21 / 25 | 1 个 P1（due 字段不存在）；其余 P2 |
| **3. 富图表** | ✅ **READY TO LAND** | 23 / 25 | 无 P0/P1；占位诚实、零图表库 |

---

## 二、5 维度评分（逐缺口）

| 维度 | Workflows | Tasks 看板 | 富图表 | 说明 |
|---|---|---|---|---|
| 设计哲学 (Philosophy) | 5 | 4 | 5 | Tasks 因 due 字段小瑕疵扣 1；其余方向清晰、克制有据 |
| 视觉层次 (Hierarchy) | 5 | 5 | 5 | 页面→卡片/列→弹窗/图表面板层次清晰 |
| 执行质量 (Execution) | 5 | 4 | 4 | Tasks 列表视图徽章 bug + 原生 DnD 无键盘；Charts 区块标题内联样式 |
| 特异性 (Specificity) | 4 | 4 | 4 | 强 Plan A 对齐；原型为 bespoke HTML（落地将映射 shell，预期内） |
| 克制 (Restraint) | 5 | 4 | 5 | Tasks 的 due 属轻微越界；Charts 零库、占位不伪造 |
| **合计** | **24** | **21** | **23** | 各维度均 ≥ 3，通过门控 |

---

## 三、问题清单（优先级表）

### P0（必须修复 · 阻断发布）— 无

### P1（建议修复 · 影响品质 / 会强制分歧）

| # | 文件:行 | 问题 | 精确修复 |
|---|---|---|---|
| P1-1 | `proto-gap-tasks-kanban.html:99,100-111,133` | 卡片渲染 `截止 ${t.due}`，示例数据带 `due` 字段；但后端 `createTask`（`src/index.js:12484-12503`）与全仓 grep（dueAt/due_date/dueDate/deadline 均无匹配）证明 `/api/tasks` 任务对象**不含任何截止日字段**。原型「暗示」了后端不存在的数据，落地若照搬即伪造。 | 落地从 kanban 卡片**移除「截止日」展示**，不引入该字段。注意 DESIGN-SPEC §4.3 的 `task.dueAt` / `formatDue(task.dueAt)` 引用本身不准确，落地前须与后端确认；如确需截止日，应由后端新增字段，而非前端编造。 |

### P2（可选优化 · 落地打磨）

| # | 文件:行 | 问题 | 精确修复 |
|---|---|---|---|
| P2-1 | `proto-gap-tasks-kanban.html:88-94` | 7 列 `label` 硬编码英文（Open/Claimed/In progress/…），未用 `copy.statusLabels[value]`。DISCOVERY 2.3 与 DESIGN-SPEC §4.2 均要求复用 `dashboardCopy.statusLabels`。 | 列定义改为 `{ value, dot, label: copy.statusLabels[value] }`；落地读 `dashboardLabels[language].statusLabels`。 |
| P2-2 | `proto-gap-tasks-kanban.html:99,121` | 示例数据键 `progress` 应映射真实字段 `progressPercent`（落地 `Tasks.tsx:350` 读 `task.progressPercent`）。 | 落地数据映射用 `progressPercent`（值即百分比，字段真实存在）。 |
| P2-3 | `proto-gap-tasks-kanban.html:179-211` | 原生 HTML5 DnD（`dragstart`/`dragover`/`drop`）仅鼠标路径，无键盘可达性。 | 落地按 DESIGN-SPEC §4.4 引 `@dnd-kit/core`+`@dnd-kit/sortable`（含 `KeyboardSensor`）；并给卡片加一个状态 `<select>` 作为非拖拽兜底移动方式。 |
| P2-4 | `proto-gap-tasks-kanban.html:72-76,133` | `<table>` 表头缺 `scope="col"`；`<time>` 缺 `datetime` 属性。 | `<th scope="col">`；`<time dateTime=...>`（若保留 dueAt，否则移除 `<time>`）。 |
| P2-5 | `proto-gap-tasks-kanban.html:162` | 列表视图优先级徽章 `class="badge badge--plain prio-${t.priority}"` 把圆点色类（`.prio-urgent`=实心 danger 红）套在 badge 上，导致实心色块 + 低对比浅色文字。 | 改用落地 `priorityBadgeVariant(priority)` 渲染（同 `Tasks.tsx:359-361`）。 |
| P2-6 | `proto-gap-workflows.html:401-405,382-397` | 节点 `status` 示例值 `done/running/pending` 为示意；DISCOVERY 1.3 未枚举 `node.status` 取值。 | 落地前确认后端 `node.status` 真值（可能同 workflow 7 枚举或 node 专属枚举），用 `statusBadgeVariant(node.status)` 渲染，必要时调整 `nodeBadge()` 映射。 |
| P2-7 | `proto-gap-charts.html:66,83,114` | 区块标题用内联样式 `<div class="panel__header" style="border:…;border-radius:…;background:…">` 手写，未复用 shell 的 `SectionHeader`。 | 落地用 `<SectionHeader title subtitle />`（`components/shell/SectionHeader.tsx`）。 |
| P2-8 | `proto-gap-charts.html:228-234` + `proto-gap.css:549-554` | `.stat-tile` 为扁平卡片（无渐变/无阴影），与 shell `StatTile`（`from-accent-tint/60 to-surface` 渐变 + `shadow-xs`）几何不一致。 | 用 `<StatTile>` / `<StatTileGrid columns={4}>` 渲染 Overview 指标卡。 |
| P2-9 | `proto-gap-charts.html:198-203` | Health Donut 分段（索引 chunks/原始记忆/缓存/碎片）与 Overview 工具段为示意分类名；DISCOVERY 3.3 仅说 `storage.items[]` / `tools[]` 真实，未细化分类形状。 | 落地前核对 `analysis.storage.items` 与 `tools[]` 真实形状再决定分组；若 items 为扁平列表，Donut 按 type 聚合，勿直接搬示意分类。 |
| P2-10 | `proto-gap.css:137` | `--sidebar-width: 240px` 与 Plan A `index.css:246` 的 `248px` 差 8px。 | 落地用 shell 自带侧栏（248px）即可；若原型自查需对齐，改为 `248px`。 |
| P2-11 | `proto-gap.css:334` | 弹窗遮罩 `background: rgb(242 243 245 / 0.45)` 是浅色 scrim 用在暗色主题上，会泛白。属原型私有（落地用 Radix Dialog 遮罩）。 | 若保留自定义遮罩，改为暗色 scrim `rgb(7 8 10 / 0.6)`；落地直接复用 shadcn Dialog 遮罩无需改。 |

---

## 四、Anti-Slop 检测（附加）

- **P0 清单全过**：无紫色/彩虹渐变、无虚假统计（示例数据均标注）、无 emoji 替代图标、无「圆角卡+左侧彩色边框」套路、无手绘 SVG 人物、无破碎布局、对比度达标（文字用 `--color-ink`/`ink-3` 对 `--color-surface` 满足 AA）、响应式完整（栅格断点 + 横向滚动）。
- **P1 命中 1 项**：即 P1-1（due 字段不存在）。
- **P2 命中**：① 原生 DnD 无 `prefers-reduced-motion` 降级（原型已全局 `reduce` 降级动画，OK）；② 图标按钮均有 `aria-label`（关闭按钮等，✅）；③ 表单控件均有 `<label for>`（✅）；④ 图表 SVG `aria-hidden` + 图例/轴文字兜底（✅）。无新增 P2 级 anti-slop 问题。

---

## 五、落地交接（Landing Handoff）

### 缺口 1 · Workflows

- **复用 shell**：`<PageShell>`（title=工作流 / description / actions=「创建工作流」primary 按钮）+ 列表区用 `<Panel>` 网格或复用遗留 `Dashboard.css` `.workflow-card`；create/edit/delete/节点弹窗用 shadcn `<Dialog>`（复用落地既有模式）。
- **端点**：
  - 列表：`GET /api/workflows` + `GET /api/projects`
  - 创建：`POST /api/workflows`（title 必填；project/planner/executor/reviewer/observer/plan/acceptance/priority/risks/status 可选）
  - 编辑：`PATCH /api/workflows/:id`（同字段）
  - 删除：`DELETE /api/workflows/:id`（软删除，写事件存储）
  - 节点：`GET /api/workflows/:id/nodes`
- **数据形状红线**：节点只含 `nodes`、**无 `edges`**；节点轨按 role 顺序 `planner→executor→reviewer→observer` 竖向排列，连接线仅为结构竖线、**无箭头、无方向**，文案须标注「顺序为 role 推导，非真实 edges」。
- **枚举**：status 7 值 `open|planned|in_progress|review|blocked|done|cancelled`；priority 4 值 `low|normal|high|urgent`；状态下拉用**原生 `<select>`**（无 shadcn Select）；角色/risks 为字符串数组 → 逗号分隔 `<input>`，提交时 `split(',')`，不引新依赖。

### 缺口 2 · Tasks 看板

- **复用 shell**：`<PageShell>`（title=任务 / actions=视图切换+新建）+ 看板区为新增 `.kanban-board`（7 列、横向滚动 `overflow-x:auto`）；列头点色用 `STATUS_DOT`（落地 `Tasks.tsx:64`）；卡片结构同 DESIGN-SPEC §4.3（优先级点 + 项目标签 + 标题 + `in_progress` 进度条 + 负责人）。
- **端点**：
  - 列表/分组：`GET /api/tasks`（含 `kanban` 分组，键 = 7 状态枚举）
  - 拖拽落列写回：`POST /api/task/status {id,status}`（落地已接 `runStatus`）
  - 新建：`POST /api/task/add`；claim：`POST /api/task/claim`；review：`POST /api/task/review`
- **数据形状红线**：列定义严格 = 后端 7 枚举 `open|claimed|in_progress|blocked|needs_verification|done|cancelled`；**禁止 `failed`、禁止中文 4 列名、禁止 `todo/doing`**。列点色：`open→bg-ink-3`、`claimed→bg-info`、`in_progress→bg-accent-base`、`blocked→bg-danger`、`needs_verification→bg-warning`、`done→bg-success`、`cancelled→bg-line-strong`（与落地 `STATUS_DOT` 一致）。
- **⚠️ 字段坑（来自 P1-1 / P2-2）**：任务对象**无 due/截止日字段**（删除该展示）；进度用 `progressPercent`（真实，百分比）。
- **拖拽**：原型用原生 DnD 演示；落地建议 `@dnd-kit/core`+`@dnd-kit/sortable`（含键盘可达），并保留状态 `<select>` 兜底。

### 缺口 3 · 富图表

- **复用 shell**：`<PageShell>` + 每图 `<Panel>`（title/subtitle）；Overview 指标卡用 `<StatTile>`/`<StatTileGrid columns={4}>`；区块标题用 `<SectionHeader>`。
- **图表**：全部手绘内联 SVG（零依赖），复用落地既有 `Analytics.tsx` `BarChart`、`Overview.tsx` `StatusDonut` 结构与 proto 的 `.chart*` 类。
- **端点 / 真实数据源**：
  - Health 折线/面积 = `GET /api/health` → `analysis.growthTrend`（14 天 `{date,count}`，真实时序）✅
  - Health Donut = `analysis.storage.items`（真实；先核对分类形状，见 P2-9）
  - Analytics 条形 = `GET /api/metrics` → `tasks.byStatus` / `tasks.byTool` / `projects.byActivity`（真实聚合）✅
  - Overview Donut = `/api/dashboard/overview` → `tools` 连通（真实）✅
- **⚠️ 占位红线（不得伪造）**：Overview 每卡 sparkline、Analytics 双序列折线/面积 = **无后端时序端点** → 仅占位/省略并标注「无后端端点」（原型已正确标注）。
- **颜色**：折线 `stroke = --color-accent-base #6e5ef2`；面积渐变 `areaGrad`（accent 0.28→0）；网格/轴用 `--color-line` / `--color-ink-3`；Donut 段色用语义 token（`--color-success`/`--color-warning`/`--color-danger`/`--color-info`）；SVG 内联属性因不解析 CSS var，直接写 Plan A 具体 hex（与 `proto-gap-charts.html:132-135` 的 `TOK` 一致即可）。

---

## 六、一句话总结（回团队负责人）

三个原型均通过后端诚实度硬门槛、P0=0；仅 Tasks 看板有 1 个 P1（卡片「截止日」依赖后端不存在的 `due` 字段，落地删除即可），其余为 P2 打磨项。裁决：Workflows 与 富图表 **READY TO LAND**，Tasks 看板 **LAND WITH FIXES**（修 P1-1 后无阻塞）。落地须严格复用 shell 组件（PageShell/Panel/StatTile/StatusTabs/SectionHeader + shadcn Dialog），列/枚举以后端 7 值为唯一真源，图表零库、占位不伪造。
