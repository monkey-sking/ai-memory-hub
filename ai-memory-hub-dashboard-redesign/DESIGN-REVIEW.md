# AI Memory Hub Dashboard 设计质量评审报告

> 设计原型专家团 · 质量审查官（严过审）出品
> 评审对象：`ai-memory-hub-dashboard-redesign/`（资产 A，静态高保真原型）+ `dashboard-next/`（资产 B，实际运行应用）
> 日期：2026-08-14

---

## 核心结论（先看这条）

**资产 A 与资产 B 不是同一套设计的"原型与实现"，而是两套互不相干的设计系统。**

- 资产 A：Tailwind slate 灰 + 蓝色 `#2563eb` + 56px 纯图标栏
- 资产 B：Radix sage 绿灰 + 青绿 `#0f766e` + 248px 带标签侧栏

两者唯一共同点只有"深色文字 + 白卡片 + 发丝边框 + 圆角"这种通用后台特征。这不是"视觉漂移"，是"各说各话"。

**更关键的发现是成熟度倒挂——实际应用（B）的设计系统质量明显高于所谓的高保真原型（A）。** 所以下一步不能以 A 为基准去"对齐" B，而应该反过来。

---

## 一、5 维评分

### 资产 A — 静态高保真原型（14/25，不通过）

| 维度 | 分数 | 一句话证据 |
|---|---|---|
| 哲学 Philosophy | 3/5 | 令牌体系自洽，但 `colors_and_type.css` 是死代码：6 个页面 0 个引用它，`amh-` 前缀在 pages 里出现 0 次 |
| 层次 Hierarchy | 3/5 | 字阶清晰，但 6 张指标卡结构不一致打乱行节奏，且三级文字 2.57:1 直接读不出来 |
| 执行 Execution | 2/5 | 6 个页面 `@media` 计数全为 0；`.metric-sparkline` 缺 `margin-top:auto` 导致基线错位；mono 700 字重未加载（假粗体） |
| 特异性 Specificity | 2/5 | `#f8fafc/#e2e8f0/#94a3b8/#0f172a` 全是 Tailwind slate 原色，`#2563eb` 是 blue-600 + Inter + 图标栏 = 任意一个 shadcn 后台模板 |
| 克制 Restraint | 4/5 | 真的克制：无渐变（仅 32px logo）、扁平徽章、1px 发丝边框、卡片不叠阴影、6px 滚动条 |

### 资产 B — 实际运行应用（21/25，通过·带整改项）

| 维度 | 分数 | 一句话证据 |
|---|---|---|
| 哲学 Philosophy | 5/5 | `index.css` 为每个令牌写了实测对比度和取舍理由——拒绝 11px 底线、论证 sage↔teal 配对、记录自己踩过的"step-11 文字放 step-3 底色低于 AA"坑 |
| 层次 Hierarchy | 4/5 | 字阶带逐级 line-height + letter-spacing，ink 1–5 文字梯度，canvas/surface/raised/sunk 四级面；扣分因 `Dashboard.css` 尾部注释自陈层次是事后反复补的 |
| 执行 Execution | 3/5 | 有真原语层（shell 13 + ui 7 + lib 10）、152 处 `aria-`、22 处 `@media`、仅 1 处 `!important`；但 `.workflow-card` 被定义 10 次、hover 改布局抖动、单行最长 2384 字符 |
| 特异性 Specificity | 5/5 | sage 中性 + teal 强调 + 零 webfont + 白面板浮深灰画布，确实不像模板 |
| 克制 Restraint | 4/5 | 令牌注释本身就在反装饰；扣分因 CSS 体量（52KB Dashboard.css）已成噪声，且趋势指示器同时渲染箭头字符和 lucide 图标 |

---

## 二、Anti-Slop 门控

| 检测项 | A | B |
|---|---|---|
| 紫色/彩虹渐变 | 通过（仅 logo 蓝色渐变） | ⚠️ `#8957e5` 紫 ×2（GitHub Primer 紫混进 sage/teal 系统） |
| Emoji 代替图标 | 通过（规范 lucide 风格 inline SVG） | 通过（lucide-react） |
| 手绘人物插图 / 左侧彩条套路 | 通过 | 通过 |
| 编造数据 | 占位数据（247 / 94.2% / 1,847）——原型可接受，但不得原样上线 | 通过（走 api.ts） |
| 对比度 | ❌ 3 处 AA 失败 | 通过（令牌注释逐条标了比值） |

---

## 三、Top 问题清单

### P0（必须修复，全部在资产 A）

**P0-1 · A：三级文字对比度 2.57:1，WCAG AA 硬失败**
- 现象：`--text-tertiary: #94a3b8` 在 `#ffffff` 上实测 2.57:1（AA 正文需 4.5:1，大字需 3:1，两条都不过）。它承载了表头（11px 大写）、时间戳（12px）、`.tool-kind`（11px）、`.metric-footer`（12px）、`.header-subtitle`（14px）——全是需要读的信息。
- 根因：直接取 Tailwind slate-400，按"视觉够淡"选的，没做对比度验证；`colors_and_type.css` 里没有任何对比度标注。
- 建议：文字角色提到 `#64748b`（slate-500，≈4.76:1）；`#94a3b8` 只保留给装饰性图标和分隔线。拆成两个令牌：`--text-tertiary`（文字，≥4.5）与 `--icon-decorative`（装饰，不承载语义）。

**P0-2 · A：状态徽章文字色对比度失败**
- 现象：`.badge-warning` 用 `#ca8a04` 文字（2.94:1）、`.badge-success` 用 `#16a34a`（3.30:1），底色是同色 8% 透明（近白），12px → 均低于 4.5:1。（`.badge-error #dc2626` 4.83:1、`.badge-info #2563eb` 5.17:1 通过）
- 根因：同一个 hue 同时当填充和文字色。**资产 B 的 `index.css` 第 180–194 行恰好详细记录了自己踩过并修好的这个完全相同的 bug**——原型却重新踩了一遍。
- 建议：照搬 B 的解法，为状态色增设更暗的文字变体：warning 文字用 `#854d0e`（≈5.9:1）、success 用 `#166534`（≈5.5:1），填充色不变。

**P0-3 · A：6 个页面完全没有响应式**
- 现象：`grep -c "@media"` 在 overview/memory/tasks/radio/tools/workflows 上全部返回 0。写死了 `.metrics-grid: repeat(3,1fr)`、`.tool-grid: repeat(5,1fr)`、`.two-col: 1.5fr 1fr`。5 列工具卡每格要放 32px 头像 + 名称 + 类型 + 状态点，窄屏必挤爆。
- 根因：原型按单一固定视口产出，`partials/project-shell.html` 有 1 处 `@media`，说明团队知道要做，只是页面没做。
- 建议：最少 3 个断点——<1280px 指标转 2 列 / 工具转 3 列；<1024px 双列纵向堆叠；<768px 侧栏改抽屉。**需截图确认**具体崩坏阈值。

**P0-4 · A：设计系统文件是死代码，令牌被复制 6 份**
- 现象：`colors_and_type.css` 定义了带 `amh-` 前缀的完整令牌集，但 6 个页面无一引用，而是各自内联一份 `<style id="theme-vars">`（约 40 个令牌），且把 `amh-` 前缀去掉了。唯一正确消费它的是 `partials/project-shell.html`（引用 1 次、`amh-` 用 239 次、有 `@media`、有 `prefers-reduced-motion`）。
- 根因：6 个页面是各自独立生成的单文件产物，shell 才是按规范写的那个。等于同一个资产里存在两套架构。
- 建议：改成单个 `<link>` 引用 + 恢复 `amh-` 前缀 + 删掉 6 份内联块。否则改一个主色要编辑 7 个文件，漂移是必然。

### P1（建议修复）

- **P1-1 · B：`.workflow-stage-item:hover` 重复定义，hover 时布局抖动** —— 两条规则后者覆盖前者成死代码，且 hover 改 display/flex/min-height/padding/border 导致尺寸变化抖动。建议 hover 只允许改 color/background/border-color/box-shadow，合并两条规则删死代码。
- **P1-2 · B：选择器重复定义，违反自己写的"单一真源"** —— `.workflow-card` 定义 10 次、`.health-action-row` 7 次、`.workflow-stage-dot`/`.dispatch-control-grid`/`.backup-row` 各 5 次。而 `index.css` 开头明令"Never redeclare outside this block"。建议按 section 拆分 CSS，每类只一处定义。
- **P1-3 · B：GitHub Primer 配色（含紫）硬编码混入** —— `#8957e5`（紫，×2）、`#d29922`（琥珀）、`#2ea44f`（绿）三个都是 Primer 值。建议补一组 `--color-cat-1..5` 分类色令牌，从 sage/teal 邻近色域取，替换硬编码值。
- **P1-4 · A：指标卡结构不统一 + 同行基线错位** —— 6 张卡三种解剖结构。建议定义固定插槽（badge+trend / value+label / 可选 sub-pills / 可视化区 / 可选 footer），可视化区加 `margin-top:auto`。
- **P1-5 · A：本地优先产品却依赖两个外部 CDN** —— 6 页面各自加载 `unpkg.com/@tailwindcss/browser@4` + Google Fonts。断网即掉字体掉样式，且 Tailwind 运行时基本白加载。建议字体改 B 的 system 栈、删 Tailwind CDN。
- **P1-6 · B：单文件体量已不可评审** —— `Dashboard.tsx` 2373 行 / 16 个 `section ===` 分支；`Dashboard.css` 1143 行、17 行超 500 字符、最长 2384 字符。建议按 section 拆独立页面组件 + CSS 同步拆分。

### P2（可选优化）

- **A**：`.metric-value` 用 700 + JetBrains Mono，但 Google Fonts 只请了 `400;500` → 30px 主数字是合成假粗体，边缘发糊。改 500 或补 700。
- **A**：`--bg-hover: #e2e8f0` 与 `--border: #e2e8f0` 同值，hover 时边框消失在背景里。hover 用 `#eef2f6` 之类中间值。
- **A**：6 页面均无 `prefers-reduced-motion`（shell 有），应与 shell 一致。
- **A**：5 套废弃配色变体（约 240KB）仍留交付目录且无决策说明，易被误当可选主题。移入 `explorations/` 或删除。
- **B**：`OverviewComponents.tsx` 三处小问题——`tone.success` 映射到 `text-primary` 而非 success 令牌（语义错配）；`trend` 同时渲染箭头字符和 lucide 图标（重复指示）；`MetricCardProps` 缩进 2 空格而 `PanelProps` 缩进 0（同文件风格不一）。

---

## 四、资产 A / B 一致性对比

| 维度 | 资产 A（原型） | 资产 B（实际应用） | 判定 |
|---|---|---|---|
| 强调色 | `#2563eb` 蓝（Tailwind blue-600） | `#0f766e` / `#12a594` 青绿（Radix teal） | 完全不同色相 |
| 中性色 | Tailwind slate（冷、偏蓝） | Radix sage（偏绿，为配 teal） | 色温相反 |
| 字体 | Inter webfont（Google CDN） | system-ui 栈，零 webfont，含中文 fallback | 完全不同 |
| 基准/最小字号 | 13px / 底线 11px | 14px / 底线 12px（明确禁用 11px） | 直接冲突 |
| 侧栏 | 56px 纯图标固定栏 | 248px 带标签 + 68px 折叠态，分组可收起 | 信息架构不同 |
| `--radius-lg` | 14px | 10px（14px 在 B 里叫 `xl`） | **同名不同值，最危险** |
| 画布 | `#f8fafc` 单层 | `#eef1f0` + `canvas-deep #e9edec` 内嵌浮起 | 立体策略不同 |
| 令牌命名 | `--bg-*` / `--text-*` / `--primary`，内联 ×6 | `@theme --color-*` 单一真源 + 兼容别名层 | 不可互换 |
| 图标 | 手写 inline SVG | lucide-react | 不一致但可接受 |
| 响应式 | 0 处 `@media` | 22 处 `@media` | A 缺失 |
| 国际化 | 中文硬编码 | i18n + 语言切换 | A 缺失 |
| 页面数 | 6 个 HTML | 16 条路由 | A 覆盖不到 40% |

**结论**：资产 A 不能作为资产 B 的设计依据。`--radius-lg` 同名不同值（14 vs 10）是最隐蔽的陷阱——任何人把 A 的样式搬到 B，圆角会静默错 4px。

**需截图确认的部分**（不从代码臆断）：两者实际渲染的信息密度差异、A 的 5 列网格在真实窗口宽度是否溢出、B 的 hover 抖动幅度、B 的 sage 中性色在真实屏幕是否读得出绿调。

---

## 五、最该先改的 5 件事（按投入产出排序）

1. **先定唯一视觉真源：以资产 B 为准，资产 A 要么按 B 的令牌重皮、要么退役归档。** 这是所有其他工作的前置——不定这件事，后面每条改进都要做两遍，而 B 的令牌层质量（有实测对比度、有取舍论证）明显值得当基准。
2. **修掉资产 A 的 3 处 WCAG AA 失败**（tertiary 2.57:1、warning 2.94:1、success 3.30:1）。这是唯一的 P0 级发布阻断项，且 B 的 `index.css` 已经写好了标准答案，直接抄。
3. **资产 A 接上 `colors_and_type.css` + 补 3 个断点。** 消除 6 份令牌副本，把"设计系统"从摆设变成真正生效的东西。
4. **拆分 `Dashboard.css` / `Dashboard.tsx`，清掉 `.workflow-card` ×10 与 hover 抖动。** B 的令牌层已经很严，短板全在组件层；不拆分，重复定义会持续再生。
5. **清掉 B 的 Primer 紫 `#8957e5` 等 3 个硬编码色，补一组分类色令牌。** 唯一的 anti-slop 命中项，改动小、收益直接。

---

## 附：门控判定

- **资产 A**：14/25，执行 2 分、特异性 2 分（均 <3），P0 = 4 → **不通过，需修正**
- **资产 B**：21/25，五维全 ≥3，P0 = 0、P1 = 3 → **通过（带整改项）**
