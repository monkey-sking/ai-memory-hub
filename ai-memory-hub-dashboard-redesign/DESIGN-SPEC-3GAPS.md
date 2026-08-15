# AMH Dashboard · 3 缺口组件级设计规范（DESIGN-SPEC-3GAPS）

> 目的：把 `DISCOVERY-3GAPS.md` 的考古结论落成为**原型师可直接照画、后续 `.tsx` 可原样复用**的组件级规范。
> 方法：所有类名、token、色值、端点、枚举均来自真实源文件，标注 `文件:行号`。**未做任何改动，未虚构数据。**
> 资料基准（2025-08-14 仓库状态），与 DISCOVERY 一致：
> - Plan A Token 真源：`dashboard-next/src/index.css` 的 `@theme` 块（`:22` 起）
> - 遗留类：`dashboard-next/src/pages/Dashboard.css`（`.workflow-*` / `.kanban-*` 等）
> - shell 组件：`dashboard-next/src/components/shell/{Panel,StatTile,StatusTabs,FilterBar,PageShell}.tsx`
> - shadcn/ui：`dashboard-next/src/components/ui/{button,dialog,input,textarea,label,badge,table}.tsx`（**无 select**）
> - 落地页面：`dashboard-next/src/pages/{Workflows,Tasks,Analytics,Overview,Health}.tsx`

---

## 0. 全局坐标（视觉严格对齐 Plan A）

| 维度 | Plan A 取值 | 出处 |
|---|---|---|
| 基线 | Dark，近黑冷中性 + 靛紫 accent `#6e5ef2` | `index.css:11` |
| 面板 L1 | `border border-line bg-surface`，`rounded-xl(14px)`，静止无阴影 | `Panel.tsx:73` |
| 弹窗 L3 | `bg-surface shadow-lg`，`rounded-2xl(18px)`，`max-h-[calc(100dvh-24px)]` | `dialog.tsx:97` |
| 主按钮 | `variant="primary"` → `bg-accent-base text-white` | `button.tsx:24` |
| 危险按钮 | `variant="danger"` → `bg-danger text-white` | `button.tsx:30` |
| 语义色板 | success `#3fb950` / warning `#d29922` / danger `#f85149` / info `#58a6ff` | `index.css:131/137/143/151` |
| 文字 | ink `#f2f3f5` / ink-2 `#c5c8cf` / ink-3 `#9ca1ac` / ink-5 `#6a6e78` | `index.css:90-94` |
| 状态徽章 | 用 `Badge` + `statusBadgeVariant()` 单真源映射 | `statusBadge.ts:13` |
| 字体 | `--font-sans`（中文 PingFang/微软雅黑回退） | `index.css:24` |
| 圆角阶梯 | 容器 `rounded-xl(14)` → 卡片内 `rounded-md(8)` → 芯片 `rounded-full` | `Panel.tsx:31-33` |

**继承约定（原型 HTML 与 .tsx 共用）**
1. 页面骨架用 `<PageShell>`（`PageShell.tsx:39`），区域顺序 header→tabs→toolbar→content→footer，间隔 24px。
2. 列表/表格/表单容器用 `<Panel>`（`Panel.tsx:47`），header 高度 56px，toolbar 48px。
3. 筛选条用 `<FilterBar>`，状态条用 `<StatusTabs>`，指标用 `<StatTileGrid>+<StatTile>`。
4. 所有真实数据/端点见 DISCOVERY；**不得编造**。

---

## 1. Token 别名表（图表专用变量 → Plan A `@theme`）

原型里出现的图表专用变量（`proto-next/analytics.html:283`、`:295`；`health.html:65`）**不在 `@theme` 中**，必须映射回既有 token。下表为原型师/落地的唯一映射真源：

| 原型变量（prototype） | 映射到 Plan A 变量 | 色值 / 定义 | 用途 | 出处 |
|---|---|---|---|---|
| `--chart-line` | `--color-accent-base` | `#6e5ef2` | 主折线 stroke、面积描边、Donut 主序列 | `index.css:101` |
| `--chart-line2` | `--color-ink-5` | `#6a6e78` | 第二序列（虚线）、网格线、去强调线 | `index.css:94` |
| `--chart-area` | `--color-accent-tint` | `rgb(110 94 242 / 0.12)` 起，渐变至透明 | 面积图填充 `linearGradient` 起点 | `index.css:105` |
| `--chart-grid` | `--color-line` | `#2a2b31` | 坐标轴 / 网格线 | `index.css:87` |
| `--chart-axis` | `--color-ink-3` | `#9ca1ac` | 轴标签、刻度文字 | `index.css:92` |
| `--chart-label` | `--color-ink-2` | `#c5c8cf` | 图例文字、条形标签 | `index.css:91` |
| `--chart-track` | `--color-surface-sunk` | `#0e0f12` | 条形/进度条轨道、Donut 底环 | `index.css:86` |
| `--chart-success` | `--color-success` | `#3fb950` | Donut 健康段 / 语义条 | `index.css:131` |
| `--chart-warning` | `--color-warning` | `#d29922` | Donut 降级段 | `index.css:137` |
| `--chart-danger` | `--color-danger` | `#f85149` | Donut 错误段 | `index.css:143` |
| `--chart-info` | `--color-info` | `#58a6ff` | Donut 空闲段 / 连通 | `index.css:151` |
| `--ease` | `--ease-out-quint` | `cubic-bezier(0.16,1,0.3,1)` | 图表/段过渡缓动 | `index.css:204` |
| `--dur-fast` | `:root --dur-fast` | `120ms` | 段切换、hover 过渡 | `index.css:266`（已在 `:root`） |
| `--dur-base` | `:root --dur-base` | `180ms` | 弹窗/面板过渡 | `index.css:267` |

> 注：原型里偶尔直接写 `--accent` / `--ink-5`（legacy 别名），其真值即 `--color-accent-base` / `--color-ink-5`（`Dashboard.css:212/232` 的 `:root` 映射）。**写新原型一律用 `--color-*` 真名，不要再引 `--accent`/`--ink-5` 别名。**

---

## 2. 新组件类命名约定

与遗留 `.workflow-*` / `.search-*` / `.tool-*` / `.radio-*` 同构，确保原型与后续 `.tsx` 共用：

| 缺口 | 推荐前缀 / 类 | 复用既有 | 新增？ | 同构说明 |
|---|---|---|---|---|
| **1 Workflows** | `.workflow-create-dialog` `.workflow-create-form` `.workflow-create-grid` | ✅ 已存在于 `Dashboard.css:1122-1126` | 否 | create/edit 表单直接复用，不新建 |
| | `.workflow-graph-dialog` `.workflow-graph-body` `.workflow-graph-list` `.workflow-graph-node` `.workflow-graph-node-marker` `.workflow-graph-node-content` `.workflow-graph-node-heading` `.workflow-graph-node-meta` | ✅ 已存在 `Dashboard.css:1098-1106` | 否 | 节点步骤轨（竖向时间线）直接复用 |
| | `.wf-field-roles` | — | 可选 | 角色逗号分隔输入的外层 wrapper（仅结构，样式可借 `.workflow-create-grid`） |
| **2 Tasks 看板** | `.kanban-board` | — | 是 | 7 列横向滚动容器；同构 `.panel-grid`/`.workflow-card-grid` |
| | `.kanban-column` `.kanban-column-header` `.kanban-col-dot` `.kanban-col-name` `.kanban-col-count` `.kanban-column-body` | 部分同构原型 `pages/tasks.html:533`（`.kanban-column`/`.column-header`/`.col-dot`/`.col-name`/`.col-count`） | 是 | 列容器；dot 用 `STATUS_DOT` 的 `bg-*` 类 |
| | `.kanban-card` `.kanban-card-top` `.kanban-card-prio` `.kanban-card-project` `.kanban-card-title` `.kanban-card-progress` `.kanban-card-meta` | 同构 `.workflow-card` / 原型 `pages/tasks.html` `.task-card`/`.priority-dot`/`.project-tag` | 是 | 卡片结构同遗留 `.workflow-card` 几何（border+radius-xl+padding16） |
| **3 富图表** | `.chart` `.chart__svg` `.chart__line1` `.chart__line2` `.chart__area` | ✅ 原型 `analytics.html:283-289` 已有 | 沿用原型 | 折线/面积图，原类名直接用 |
| | `.chart-bar` | 同构 `Analytics.tsx:53` `BarChart` 内联结构 | 是（wrapper） | 条形图包裹类；内部复用 `Analytics.tsx` 的 `flex flex-col gap-3` + `bg-surface-sunk` 轨道 + `bg-accent-base` 条 |
| | `.chart-donut` | 同构 `Overview.tsx:80` `StatusDonut`（`relative mx-auto my-2 h-36 w-36`） | 是（wrapper） | Donut 包裹类；svg 复用 `StatusDonut` 的 viewBox `0 0 140 140`、`r=54`、`-rotate-90` |

> 命名纪律：**优先复用已有类**（`.workflow-create-*` / `.workflow-graph-*` / shell 组件），仅在没有对应遗留类时才新增 `.kanban-*` / `.chart-*`。新前缀一律小写中划线，与 Plan A 全局一致。

---

## 3. 缺口 1 · Workflows（create / edit / delete + 节点步骤轨）

### 3.1 复用资产
- 弹窗：`shadcn Dialog`（`dialog.tsx`）+ `DialogContent/Header/Body/Footer`；create 表单类 `.workflow-create-dialog/.workflow-create-form/.workflow-create-grid`（`Dashboard.css:1122-1126`）。
- 删除确认：`Dialog` + `Button variant="danger"`。
- 节点轨：`.workflow-graph-dialog/.workflow-graph-*`（`Dashboard.css:1098-1106`，含竖向 `i` 连接线，仅结构线无箭头）。
- 字段控件：`Input`/`Textarea`/`Label`/`Badge`；状态/优先级用**原生 `<select>`**（无 shadcn Select，参照 `Tasks.tsx:442`）。

### 3.2 DOM 骨架 A — create / edit 弹窗（复用 `.workflow-create-dialog`）

```html
<Dialog open onOpenChange>
  <DialogContent className="workflow-create-dialog">      <!-- 已存在：width min(620px), grid-rows auto/1fr/auto -->
    <DialogHeader>
      <DialogTitle>{copy.createWorkflow || copy.editWorkflow}</DialogTitle>
      <DialogDescription>{copy.workflowCreateHint}</DialogDescription>
    </DialogHeader>

    <div className="workflow-create-form">                <!-- 已存在：grid gap-4, 唯一滚动区 -->
      <div className="grid gap-4">
        <!-- title 必填 -->
        <div className="grid gap-2">
          <Label htmlFor="wf-title">{copy.title}</Label>
          <Input id="wf-title" required value={title} />   <!-- POST/PATCH body.title -->
        </div>

        <!-- 可选字段 3 列网格：复用 .workflow-create-grid -->
        <div className="workflow-create-grid">
          <div className="grid gap-2">
            <Label htmlFor="wf-project">{copy.project}</Label>
            <Input id="wf-project" value={project} />       <!-- body.project -->
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wf-priority">{copy.priority}</Label>
            <select id="wf-priority" className={cn(fieldBaseStyles,'h-9 px-3 py-0')}>  <!-- 原生 select -->
              <option>low</option><option>normal</option><option>high</option><option>urgent</option>
            </select>                                       <!-- body.priority -->
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wf-status">{copy.status}</Label>
            <select id="wf-status" className={cn(fieldBaseStyles,'h-9 px-3 py-0')}>  <!-- 原生 select -->
              <option>open</option><option>planned</option><option>in_progress</option>
              <option>review</option><option>blocked</option><option>done</option><option>cancelled</option>
            </select>                                       <!-- body.status -->
          </div>
        </div>

        <!-- 角色字段：字符串数组（多人）→ 逗号分隔 <input>，不引入新依赖 -->
        <div className="wf-field-roles grid gap-2">
          <Label htmlFor="wf-planner">{copy.planner}</Label>
          <Input id="wf-planner" placeholder="alice, bob" value={planner.join(', ')} />  <!-- body.planner[] -->
        </div>
        <!-- executor / reviewer / observer 同构，各自一个逗号分隔 Input（body.executor[]/reviewer[]/observer[]） -->

        <!-- 长文本可选字段 -->
        <div className="grid gap-2">
          <Label htmlFor="wf-plan">{copy.plan}</Label>
          <Textarea id="wf-plan" rows={3} value={plan} />   <!-- body.plan -->
        </div>
        <div className="grid gap-2">
          <Label htmlFor="wf-acceptance">{copy.acceptance}</Label>
          <Textarea id="wf-acceptance" rows={2} value={acceptance} />  <!-- body.acceptance -->
        </div>
        <div className="grid gap-2">
          <Label htmlFor="wf-risks">{copy.risks}</Label>
          <Input id="wf-risks" value={risks.join(', ')} />  <!-- body.risks[] 逗号分隔 -->
        </div>
      </div>
    </div>

    <DialogFooter>
      <DialogClose asChild><Button variant="outline">{copy.cancel}</Button></DialogClose>
      <Button onClick={submit}>{copy.save}</Button>          <!-- create: POST /api/workflows；edit: PATCH /api/workflows/:id -->
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**字段 ↔ 端点对齐（DISCOVERY 1.3）**：`title` 必填；可选 `project/planner/executor/reviewer/observer/plan/acceptance/priority/risks/status`。角色/risks 是**字符串数组（多人）**→ 一个逗号分隔 `<input>`，提交时 `split(',')` 即可，**不要新建组件/依赖**。`spawnTasks/notify` 仅 create body 有，原型可不画。

### 3.3 DOM 骨架 B — delete 确认（danger + 确认）

```html
<Button variant="danger" size="sm" onClick={()=>setDeleteOpen(true)}>
  <TrashIcon className="h-4 w-4"/>{copy.delete}
</Button>

<Dialog open={deleteOpen}>
  <DialogContent className="max-w-md">           <!-- 复用 Dialog，小宽度 -->
    <DialogHeader><DialogTitle>{copy.confirmDeleteWorkflow}</DialogTitle></DialogHeader>
    <p className="text-sm text-ink-3">{copy.deleteWorkflowWarning}</p>  <!-- 软删除提示 -->
    <DialogFooter>
      <DialogClose asChild><Button variant="outline">{copy.cancel}</Button></DialogClose>
      <Button variant="danger" onClick={()=>mutate('DELETE',`/api/workflows/${id}`)}>{copy.delete}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
> 也可用原生 `window.confirm`，但推荐 shadcn Dialog 以与全站一致、可承载警告文案。

### 3.4 DOM 骨架 C — 节点步骤轨（竖向时间线，真实节点）

```html
<Dialog open={nodeOpen}>
  <DialogContent className="workflow-graph-dialog">     <!-- 已存在：width min(760px), grid-rows auto/1fr/auto -->
    <DialogHeader>
      <DialogTitle>{copy.executionGraph}</DialogTitle>
      <DialogDescription className="workflow-graph-subtitle">{copy.executionGraphHint}</DialogDescription>
    </DialogHeader>

    <div className="workflow-graph-body">             <!-- 已存在：唯一滚动区 -->
      <div className="workflow-graph-list">
        <!-- nodes 按 role 顺序 planner→executor→reviewer→observer 排，真实数据 GET /api/workflows/:id/nodes -->
        {nodesSortedByRole.map((node, i) => (
          <div className="workflow-graph-node" key={node.nodeId}>
            <div className="workflow-graph-node-marker">
              <span>{i + 1}</span>
              <i></i>                                   <!-- 竖向结构连接线（无箭头，仅占位） -->
            </div>
            <div className="workflow-graph-node-content">
              <div className="workflow-graph-node-heading">
                <strong>{node.label}</strong>
                <Badge variant={statusBadgeVariant(node.status)}>{statusLabel(node.status)}</Badge>
              </div>
              <p>{node.role} · {node.actor}</p>          <!-- role/actor 真实字段 -->
              <div className="workflow-graph-node-meta">
                {formatRelativeTime(node.ts)} · {node.status}   <!-- label/status/ts 真实字段 -->
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

    <DialogFooter>  <!-- 重试/克隆/删除 动作区，删除用 danger -->
      <Button variant="secondary" onClick={retry}>{copy.retry}</Button>
      <Button variant="secondary" onClick={clone}>{copy.clone}</Button>
      <Button variant="danger" onClick={()=>setDeleteOpen(true)}>{copy.delete}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**关键红线**：后端 `GET /api/workflows/:id/nodes` 只回 `nodes`，**无 `edges`**（`DISCOVERY 1.3:82`）。`.workflow-graph-node-marker i` 只是竖向结构线，**不得画带箭头的有向连线、不得伪装真实依赖**。连线若需示意顺序，只能按 role 顺序（planner→executor→reviewer→observer）推导占位，并标注「顺序为 role 推导，非真实 edges」。

### 3.5 状态枚举（以后端为唯一真源）
`open | planned | in_progress | review | blocked | done | cancelled`（`index.js:12647`）。create/edit 的 status `<select>` 只允许这 7 值。

### 3.6 缺口 1 红线
- ✅ create/edit/delete 与节点时间线均有真实端点（POST/PATCH/DELETE `/api/workflows` + `GET /api/workflows/:id/nodes`）。
- ❌ **不画带箭头连线**（无 edges 端点）。
- ❌ 角色字段**不要**引入新组件，逗号分隔 `<input>` 即可。
- ❌ 状态/优先级禁用 shadcn Select（不存在），用原生 `<select>`。

---

## 4. 缺口 2 · Tasks 看板（拖拽）

### 4.1 复用资产
- 列数据：`GET /api/tasks` 返回的 `kanban` 分组（`Tasks.tsx:131` `setKanban`），键 = 7 状态枚举。
- 拖放写回：`POST /api/task/status {id,status}`（`Tasks.tsx:222` `runStatus`，已接好）。
- 列头 label：`copy.statusLabels[status]`（`Tasks.tsx:143` + `dashboardCopy.ts:182-197`）。
- 状态点色：`STATUS_DOT`（Tasks.tsx:64）/ 徽章 `statusBadgeVariant()`（`statusBadge.ts:13`）。
- 卡片结构同 `Tasks.tsx:351-401` 的行结构（状态点 + 标题 + 副标题 + 状态徽章 + 优先级徽章 + 进度条）。

### 4.2 7 列定义（后端枚举为唯一真源）

列顺序与分组键严格取自 `tasks.js:43-59`（7 值）。**禁止**原型中文 4 列（`待处理/进行中/待审核/已阻塞`），**禁止** `failed`（`Tasks.tsx:53-62` 的 `TASK_STATUS_ORDER` 含死状态 `failed`，后端枚举没有，落点会被 `assertTaskStatus` 拒）。

| 列（data-status） | 列头 label（`copy.statusLabels`） | 列点 class（`STATUS_DOT`） | zh / en |
|---|---|---|---|
| `open` | `statusLabels.open` | `bg-ink-3` | 待处理 / Open |
| `claimed` | `statusLabels.claimed` | `bg-info` | 已认领 / Claimed |
| `in_progress` | `statusLabels.in_progress` | `bg-accent-base` | 进行中 / In progress |
| `blocked` | `statusLabels.blocked` | `bg-danger` | 阻塞 / Blocked |
| `needs_verification` | `statusLabels.needs_verification` | `bg-warning` | 待验证 / Needs verification |
| `done` | `statusLabels.done` | `bg-success` | 已完成 / Done |
| `cancelled` | `statusLabels.cancelled` | `bg-line-strong` | 已取消 / Cancelled |

### 4.3 DOM 骨架

```html
<div className="kanban-board">          <!-- 新增：横向滚动 7 列网格，gap 12-16px -->
  {TASK_KANBAN_COLUMNS.map(col => (       <!-- 7 列，顺序见 4.2 -->
    <section
      className="kanban-column"
      data-status={col.value}
      onDragOver={e => e.preventDefault()}            <!-- 允许 drop -->
      onDrop={e => {                                  <!-- 落列发写回 -->
        const id = e.dataTransfer.getData('text/plain')
        runStatus(id, col.value)                     <!-- POST /api/task/status {id,status} -->
      }}
    >
      <header className="kanban-column-header">
        <span className={cn('kanban-col-dot', col.dot)} aria-hidden="true"></span>
        <span className="kanban-col-name">{copy.statusLabels[col.value]}</span>
        <span className="kanban-col-count">{kanban[col.value]?.length ?? 0}</span>
      </header>

      <div className="kanban-column-body">            <!-- 纵向滚动列表 -->
        {kanban[col.value]?.map(task => (
          <article
            className="kanban-card"
            draggable="true"                           <!-- 原生 HTML5 DnD -->
            data-id={task.id}
            onDragStart={e => e.dataTransfer.setData('text/plain', task.id)}
          >
            <div className="kanban-card-top">
              <span className={cn('kanban-card-prio', priorityDot(task.priority))} aria-hidden="true"></span>
              <span className="kanban-card-project">{task.project}</span>
            </div>
            <div className="kanban-card-title">{task.title}</div>

            {task.status === 'in_progress' && task.progressPercent != null ? (
              <div className="kanban-card-progress">
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
                  <span className="block h-full rounded-full bg-accent-base" style={{ width: `${task.progressPercent}%` }} />
                </span>
              </div>
            ) : null}

            <div className="kanban-card-meta">
              <span>{task.assignee || task.createdBy}</span>
              <time dateTime={task.dueAt}>{formatDue(task.dueAt)}</time>
            </div>
          </article>
        ))}
      </div>
    </section>
  ))}
</div>
```

> `.kanban-card` 几何同遗留 `.workflow-card`：`border border-line rounded-xl bg-surface`，padding 16px（见 `Dashboard.css:123/260`）。列头同 `.panel` header：`h-14` 节奏、左对齐。

### 4.4 拖拽（原型用原生 HTML5 DnD）
- 卡片 `draggable="true"` + `onDragStart` 写 `dataTransfer`；列 `onDragOver={preventDefault}` + `onDrop` 读 id → `runStatus(id, col.value)`。
- **这是前端依赖缺口，不是数据缺口**：数据/端点 100% 具备（`DISCOVERY 2.5`）。
- 原型阶段用原生 DnD 演示交互；**落地建议引 `@dnd-kit/core` + `@dnd-kit/sortable`**（无障碍/重排更强），但原型不引。

### 4.5 卡片结构（沿用 `tasks.html` 原型 + 落地行结构）
优先级点（`.kanban-card-prio`，色取 `priorityDot`/`priorityBadgeVariant`）→ 项目标签（`.kanban-card-project`，chip 样式同 `.workflow-project-chip`）→ 标题（`.kanban-card-title`）→ 进度条（`in_progress` 时，同 `Tasks.tsx:362-368`）→ 负责人 + 截止日（`.kanban-card-meta`）。

### 4.6 缺口 2 红线
- ✅ 7 列 = 后端枚举；列头用 `copy.statusLabels`。
- ❌ 不准用原型 4 列中文名、不准用 `failed`、不准用 `todo/doing`。
- ❌ 不引拖拽库（原型）；只原生 DnD。

---

## 5. 缺口 3 · 富图表（手绘内联 SVG，零依赖）

### 5.1 复用资产
- 折线/面积：`proto-next/analytics.html:283-289` 的 `.chart__svg .line1/.line2/.area` 类（直接用）。
- 条形：`Analytics.tsx:53` `BarChart`（内联 `flex flex-col gap-3` + `bg-surface-sunk` 轨道 + `bg-accent-base` 条）。
- Donut：`Overview.tsx:80` `StatusDonut`（`viewBox 0 0 140 140`、`r=54`、`-rotate-90`、底环 `stroke="var(--color-line)"`、`strokeWidth=14`、中心数值）。
- 全站**无图表库**（`DISCOVERY 3.4`），延续手绘内联 SVG。

### 5.2 折线 / 面积图（Health `growthTrend` 14 天真实时序 ✅）

```html
<div className="chart">
  <svg className="chart__svg" viewBox="0 0 560 200" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="var(--color-accent-base)" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="var(--color-accent-base)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <!-- 网格线：stroke var(--chart-grid) = --color-line -->
    <line x1="0" y1="50"  x2="560" y2="50"  stroke="var(--color-line)" stroke-width="1"/>
    <line x1="0" y1="100" x2="560" y2="100" stroke="var(--color-line)" stroke-width="1"/>
    <line x1="0" y1="150" x2="560" y2="150" stroke="var(--color-line)" stroke-width="1"/>
    <!-- 面积填充：url(#areaGrad) -->
    <path className="chart__area" d="M0,160 L40,120 L80,140 ... L560,40 Z" fill="url(#areaGrad)"/>
    <!-- 主折线：stroke var(--chart-line) = --color-accent-base #6e5ef2 -->
    <polyline className="chart__line1" points="0,160 40,120 80,140 ... 560,40"
              fill="none" stroke="var(--color-accent-base)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
  </svg>
  <!-- x 轴日期标签：color var(--chart-axis) = --color-ink-3 -->
  <div className="chart__axis flex justify-between text-xs text-ink-3">…14 天日期…</div>
</div>
```
- 数据源：`GET /api/health` → `analysis.growthTrend`（14 天 `{date,count}`，`DISCOVERY 3.3:215-223`）。**真实可画**。
- `.chart__line1`：`stroke:var(--color-accent-base)`；`.chart__area`：`fill:url(#areaGrad)`；网格：`stroke:var(--color-line)`（对齐 `analytics.html:283-289` 的 `--accent`/`--ink-5` 改用真名）。

### 5.3 条形图（Analytics `byStatus`/`byTool`/`projects.byActivity` 真实聚合 ✅）

复用 `Analytics.tsx:53` `BarChart` 内联结构（新增 `.chart-bar` wrapper 仅为语义分组）：

```html
<div className="chart-bar">
  {barData.map(item => (                 <!-- item: {key, count}，来自 countEntries() -->
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="min-w-0 truncate text-ink-2">{item.key}</span>
        <span className="shrink-0 font-medium tabular-nums text-ink">{item.count}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunk">
        <div className="h-full rounded-full bg-accent-base"
             style={{ width: `${Math.max(3, Math.round((item.count / max) * 100))}%` }} />
      </div>
    </div>
  ))}
</div>
```
- 数据源：`GET /api/metrics` → `tasks.byStatus` / `tasks.byTool` / `workflows.byStatus` / `projects.byActivity`（`Analytics.tsx:107-115`）。**真实可画**，落地已示范。

### 5.4 Donut（Health `storage.items` / Overview 工具连通 ✅）

复用 `Overview.tsx:80` `StatusDonut`（新增 `.chart-donut` wrapper）：

```html
<div className="chart-donut relative mx-auto my-2 h-36 w-36">
  <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
    <circle cx="70" cy="70" r="54" fill="none" stroke="var(--color-line)" stroke-width="14"/>  <!-- 底环 -->
    {segments.map((seg, i) => {        <!-- seg: {value,label,color} -->
      const len = (seg.value / total) * CIRCUMFERENCE
      return <circle key={i} cx="70" cy="70" r="54" fill="none"
                     stroke={seg.color} stroke-width="14"
                     stroke-dasharray={`${len} ${CIRCUMFERENCE - len}`}
                     stroke-dashoffset={-offset} stroke-linecap="butt"/>
    })}
  </svg>
  <div className="absolute inset-0 flex flex-col items-center justify-center">
    <span className="text-2xl font-semibold tabular-nums text-ink">{centerValue}</span>
    <span className="text-xs uppercase tracking-wide text-ink-3">{centerLabel}</span>
  </div>
</div>
```
- 段色用语义 token：`var(--color-success)` / `var(--color-warning)` / `var(--color-danger)` / `var(--color-info)`（`Overview.tsx:234-237`）。
- Health 数据源：`analysis.storage.items`（存储占比，真实）；Overview 数据源：`tools` 状态聚合（工具连通，真实，`Overview.tsx:222-240`）。

### 5.5 占位 / 省略（无后端端点，不得伪造）

| 图表 | 端点现状 | 原型处理 |
|---|---|---|
| Overview 每卡 sparkline / 24h 趋势线 | `/api/dashboard/overview` 无时序数组（`DISCOVERY 3.3:216`） | ❌ 省略或静态占位，标注「无后端端点」，不得编造 |
| Analytics 双序列折线 / 面积 | `/api/metrics` 仅聚合计数，无时序（`DISCOVERY 3.3:227`） | ❌ 只用单序列 area（若有）或省略，标注「无后端端点」 |
| 任何「按天/按工具记忆量时序」「runner 活跃度时序」 | metrics 只给当前快照（`DISCOVERY 3.3:242`） | ❌ 不画，标注「无端点」 |

### 5.6 缺口 3 红线
- ✅ 手绘内联 SVG（与落地一致，零依赖）；Health 折线 / Analytics·Overview 条形·Donut 真实可画。
- ❌ **不引图表库**（recharts/echarts/chart.js/d3/visx）。
- ❌ **不伪造数据**；无端点处只能占位/省略并标注。

---

## 6. Do / Don't 红线汇总

**DO**
- 视觉严格对齐 Plan A token（`index.css` `@theme`），新原型一律用 `--color-*` 真名。
- 复用 shell 组件（`Panel/StatTile/StatusTabs/FilterBar/PageShell`）与遗留类（`.workflow-create-*`/`.workflow-graph-*`/`.kanban-*`/`.chart-*`）。
- 状态/优先级下拉用原生 `<select>`（无 shadcn Select）。
- 角色/risks 多人字段用逗号分隔 `<input>`，不引依赖。
- 状态枚举以后端为唯一真源（Task 7 值 / Workflow 7 值）。
- 所有列表/表单/图表接真实端点；原型用原生 HTML5 DnD 演示拖拽。

**DON'T**
- ❌ 不引图表库（缺口 3 全站无，延续手绘 SVG）。
- ❌ 不引拖拽库（原型缺口 2 用原生 DnD；落地才建议 `@dnd-kit`）。
- ❌ 不伪造数据；无端点处只占位/省略并标注「无后端端点」。
- ❌ 不画带箭头连线（缺口 1 无 edges 端点，节点轨仅竖向结构线）。
- ❌ 不用 `failed` 死状态、不用原型中文 4 列名 / `todo/doing`（缺口 2 列定义 = 后端 7 枚举）。
- ❌ 不新建 select/角色组件；不引 `--accent`/`--ink-5` legacy 别名。

---

## 7. 原型师交接清单

| 原型文件 | 必须覆盖的交互点 |
|---|---|
| `proto-gap-workflows.html` | ① 顶部「创建工作流」主按钮开 create 弹窗（`workflow-create-dialog`）；② create 表单字段对齐 1.3（title 必填 + project/priority/status 原生 select + planner/executor/reviewer/observer/risks 逗号 `<input>` + plan/acceptance Textarea），提交 POST `/api/workflows`；③ edit 弹窗（同结构、预填、PATCH `/api/workflows/:id`）；④ delete danger 按钮 + 确认 Dialog（DELETE）；⑤ 节点步骤轨 Dialog（`workflow-graph-dialog`，真实 nodes 按 role 顺序 planner→executor→reviewer→observer，竖向 `i` 结构线、**无箭头连线**） |
| `proto-gap-tasks-kanban.html` | ① 7 列（后端枚举，列头用 `copy.statusLabels`，点色用 `STATUS_DOT`，**无 failed/无中文 4 列**）；② 每列卡片（优先级点 + 项目标签 + 标题 + in_progress 进度条 + 负责人 + 截止日）；③ 原生 HTML5 DnD（`draggable` + `dragover`/`drop`），落列调 `POST /api/task/status {id,status}`；④ 列计数来自 `kanban[col]` |
| `proto-gap-charts.html` | ① Health 折线/面积图（真实 `growthTrend` 14 天，`.chart__svg` `.line1`/`.area`，渐变 `areaGrad`）；② Analytics 条形图（真实 `byStatus/byTool/projects.byActivity`，复用 `BarChart` 结构）；③ Donut（Health `storage.items` / Overview 工具连通，复用 `StatusDonut`，段色用语义 token）；④ 明确标注 Overview sparkline、Analytics 双序列折线「无后端端点」占位/省略，**不伪造** |

---

## 8. 一句话总结（3 缺口「推荐原型形态 + 最大限制」）

- **Workflows**：🟢 推荐形态 = shadcn `Dialog` 写 create/edit/delete + 复用遗留 `.workflow-graph-*` 画**竖向节点步骤轨**；最大限制 = 后端**无 edges 端点**，只能画节点时间线、不得伪装带箭头有向连线。
- **Tasks 看板**：🟢 推荐形态 = 7 列 `.kanban-*`（后端枚举为列定义）+ **原生 HTML5 DnD** 拖拽落列写回 `POST /api/task/status`；最大限制 = 全站**无拖拽库**（依赖缺口，非数据缺口），原型用原生 DnD 演示、落地再引 `@dnd-kit`。
- **富图表**：🟡 推荐形态 = **手绘内联 SVG**（折线/面积/条形/Donut）零依赖，真实数据驱动 Health 折线、Analytics/Overview 条形与 Donut；最大限制 = 全站**无图表库**，且 Overview sparkline、Analytics 双序列折线**无时序端点**，只能占位/省略、不得伪造。
