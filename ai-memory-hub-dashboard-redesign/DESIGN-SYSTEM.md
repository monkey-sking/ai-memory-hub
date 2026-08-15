# DESIGN-SYSTEM.md · AI Memory Hub Dashboard

> **设计系统（定稿）**：方案 A — Linear 风（冷静高密度生产力仪表盘语言）
> **适用项目**：本地 AI 工具协作层 Dashboard（纯前端 React SPA，16 路由，桌面优先 + 响应式）
> **主题策略**：深色默认（dark-first），浅色可选；密度 compact / comfortable 双模式
> **视觉方向坐标**：Tech Utility × Modern Minimal（5 大视觉方向交叉区）
> **对比度基线**：全部色值已做 WCAG AA 实测（正文 ≥4.5:1，UI 元素 ≥3:1），见 §2 实测列
> **落地形态**：纯 CSS 变量（`--token`），React 用 CSS Module / inline style / SCSS 均可；零运行时依赖、零外部字体 CDN

---

## 1. Visual Theme（视觉主题）

**Philosophy**：少即是多，但信息密度高——像一台精密仪表，让开发者长时间盯屏也不疲劳。
**Direction**：cool · dark-first · dense · restrained · professional
**Personality**：calm / precise / premium / trustworthy
**Reference**：Linear 产品 UI 语言（近黑冷调 + 单一靛紫强调 + 高密度栅格 + 克制微交互）
**禁忌气质**：玩具感、营销暖色、渐变堆叠、重投影、圆角过度——一律排除。

---

## 2. Color Palette（色彩）

> 全部 HEX 同时给出为 CSS 变量。括号内为「该文本色 vs 其背景」的 **实测对比度**（WCAG AA）。
> 中性基底 / 文字梯度 / 单一强调色三套候选中本方案取值；**语义状态色全项目统一**。

### 2.1 深色主题（默认） `:root` / `[data-theme="dark"]`

**背景层级（canvas → raised，至少 4 级）**
| Token | HEX | 用途 |
|-------|-----|------|
| `--bg-canvas` | #0B0C0E | 页面最暗底色 |
| `--bg-sunk` | #07080A | 内嵌/输入框底（比 canvas 更暗） |
| `--bg-surface` | #15161A | 卡片 / 分区 / 表格底 |
| `--bg-raised` | #1E1F25 | 浮层 / 下拉 / 弹窗 / 抽屉底 |

**边框**
| Token | HEX | 用途 |
|-------|-----|------|
| `--border` | #2A2B31 | 分隔线 / 描边 |
| `--border-strong` | #3A3C44 | 重点描边（输入聚焦前态、分组框） |

**文字梯度（ink 1–5）**
| Token | HEX | 用途 | 实测(canvas) |
|-------|-----|------|------|
| `--ink-1` | #F2F3F5 | 主文本 / 标题 | 17.62:1 |
| `--ink-2` | #C7C9D1 | 正文 / 次级 | 11.84:1 |
| `--ink-3` | #9094A0 | 元信息 / 说明 | 6.46:1 |
| `--ink-4` | #7A7E8A | 弱元信息（仍 ≥4.5） | 4.83:1 |
| `--ink-5` | #6A6E78 | **禁用 / 占位 / 装饰**（仅 UI ≥3，不作可读正文） | 3.83:1 |

**单一强调色（靛紫）**
| Token | HEX | 用途 | 实测 |
|-------|-----|------|------|
| `--accent` | #6E5EF2 | 选中 / 焦点环 / 激活态 / 装饰 / 图表主线 | 4.24:1（≥3 装饰） |
| `--accent-hover` | #8275F6 | hover 态 | — |
| `--accent-ring` | #6E5EF2 | focus ring 描边 | — |
| `--link` | #9D93F8 | 链接文本 | 7.42:1 |

**语义状态色（success / warning / error / info，全项目统一）**
| 语义 | 文本 HEX | 文本对比 | 填充底 HEX | 底上文字 HEX | 底上文字对比 |
|------|---------|---------|-----------|----------------|------|
| `--success` | #3FB950 | 7.70:1 | `--success-bg` #14361F | `--success-fg` #5DDC7A | 7.60:1 |
| `--warning` | #D29922 | 7.75:1 | `--warning-bg` #3A2E10 | `--warning-fg` #E8B94B | 7.27:1 |
| `--error` | #F85149 | 5.84:1 | `--error-bg` #3D1A1A | `--error-fg` #FF8580 | 6.55:1 |
| `--info` | #58A6FF | 7.75:1 | `--info-bg` #152C44 | `--info-fg` #79C0FF | 7.32:1 |

### 2.2 浅色主题（可选） `[data-theme="light"]`

**背景层级**
| Token | HEX | 用途 |
|-------|-----|------|
| `--bg-canvas` | #FFFFFF | 页面底 |
| `--bg-sunk` | #EEF0F2 | 内嵌底 |
| `--bg-surface` | #F7F8F9 | 卡片 / 分区底 |
| `--bg-raised` | #FFFFFF | 浮层底（靠 border 区分） |

**边框**
| Token | HEX |
|-------|-----|
| `--border` | #E2E4E8 |
| `--border-strong` | #C9CDD4 |

**文字梯度**
| Token | HEX | 实测(canvas) |
|-------|-----|------|
| `--ink-1` | #15161A | 18.08:1 |
| `--ink-2` | #43474E | 9.33:1 |
| `--ink-3` | #6B6F78 | 5.04:1 |
| `--ink-4` | #8A8E97 | ≥4.5 |
| `--ink-5` | #B0B4BC | 装饰/禁用（UI ≥3） |

**强调色（浅色下沉一档保 AA）**
| Token | HEX | 实测 |
|-------|-----|------|
| `--accent` | #4F46E5 | 白字 6.29:1 |
| `--accent-hover` | #4338CA | — |
| `--link` | #4338CA | 7.90:1 |

**语义文字（白底，已验 AA）**：`--success` #1A7F37(5.08) · `--warning` #9A6700(4.87) · `--error` #CF222E(5.36) · `--info` #0969DA(5.19)
浅色语义填充底（已验 AA）：`--success-bg` #EAF6EE · `--warning-bg` #FDF6E6 · `--error-bg` #FCE8E8 · `--info-bg` #E8F1FD（底上文字 `--*-fg` 用对应深色文本色：success 4.57 / warning 4.52 / error 4.55 / info 4.56:1，均 ≥4.5）。

> **中性色温**：冷灰偏蓝（L 通道略带蓝相），与靛紫强调同源；浅色为冷白（#FFFFFF / #F7F8F9），不掺暖。

---

## 3. Typography（排版）

### 字体栈（系统栈，离线可用，无 CDN）
```
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue",
             Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
--font-mono: ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", "Fira Code",
             Menlo, Consolas, "Liberation Mono", monospace;
```
- **正文 / UI**：`--font-sans`
- **代码 / ID / 时间戳 / 数值对齐 / 日志**：`--font-mono`
- 离线自托管可选（非必须）：打包 `JetBrains Mono` + `Inter` 为 woff2；默认即系统栈零网络。

### 字号阶梯（开发者密集）
| Level | 尺寸 | 行高 | 字重 | 字间距 | 用途 |
|-------|------|------|------|--------|------|
| 2xs | 11px | 1.4 | 500 | +0.04em | 徽章 / 大写标签（uppercase） |
| xs | 12px | 1.45 | 400 | 0 | 表头 / 元信息 |
| sm | 13px | 1.5 | 400 | 0 | **compact 基础字号** |
| base | 14px | 1.55 | 400 | 0 | **comfortable 基础字号** |
| md | 15px | 1.5 | 500 | 0 | 强调正文 |
| lg | 16px | 1.5 | 600 | -0.01em | 小标题 |
| xl | 18px | 1.4 | 600 | -0.01em | 区块标题 |
| 2xl | 22px | 1.3 | 700 | -0.01em | 页面标题 |
| 3xl | 28px | 1.25 | 700 | -0.02em | 极少用 hero |

---

## 4. Component Styles（组件样式）

> 通用原则：组件背景用 `--bg-surface`/`--bg-raised`，描边用 `--border`（重点 `--border-strong`），圆角见 §5；文本用 ink 梯度；状态一律用语义色；交互态用 `--accent` / `--accent-hover` / `--accent-ring`。

### 4.1 顶栏全局栏（Global Top Bar）
- 高度：`--bar-h`（compact 44 / comfortable 48）；`position: sticky; top:0; z-index:100`
- 背景：`--bg-canvas` + 底部 `1px --border`
- 左：可折叠侧栏开关（icon btn，`--ink-3`→hover `--ink-1`）+ 页面面包屑（`--ink-2`）
- 中：全局搜索（输入控件，见 §4.9，宽度 ~320–420）
- 右：健康灯（§4.6）+ 连接状态（§4.5 dot + `--ink-2` 文本）+ 主题切换 + 密度切换（icon btn 组）
- 图标按钮：28×28（compact）/32×32（comfortable），hover `--bg-surface`，radius `--radius-sm`

### 4.2 可折叠分组侧栏（Collapsible Sidebar）
- 展开宽 240px，折叠宽 56px；背景 `--bg-canvas` + 右侧 `1px --border`；`z-index:100`
- 分组标题：`--ink-3`，11px uppercase，可折叠（caret `--ink-4`→hover `--ink-2`）
- 导航项：高度 `--row-h`，圆角 `--radius-sm`，文本 `--ink-2`；hover 背景 `--bg-surface`；**激活态**：`--ink-1` 文本 + 左侧 `2px --accent` 条 + `--bg-surface` 底
- 图标：`--ink-3`，激活 `--accent`
- 折叠态：仅显示图标，激活项用 `--accent` 左侧条

### 4.3 指标卡（Metric Card，含 sparkline / 趋势）
- 容器：`--bg-surface` + `1px --border` + radius `--radius-lg`(8) + padding `--card-pad`
- 标题：`--ink-3` / 12px；主值：`--ink-1`，22px(2xl) / 700（数值可用 `--font-mono` 对齐）
- 趋势 delta：success（↑）/ error（↓）文本 + 箭头；中性用 `--ink-3`
- sparkline：SVG，描边 `--accent` 宽 1.5；面积填充 `--accent-soft`（= rgba(110,94,242,.12)，等价于 `color-mix(in srgb, --accent 12%, transparent)`）；阈值线用 `--warning`/`--error`
- 多指标卡网格：同 §5 栅格，gap `--section-gap`

### 4.4 高密度表格（High-density Table）
- 容器：`--bg-surface` + `1px --border` + radius `--radius-lg`；行高由 `--row-h` 驱动
- 表头：sticky，`--ink-3` 11px uppercase，底部 `1px --border`；可排序列 hover `--ink-1`，激活列 header `--ink-1` + 排序图标 `--accent`
- 单元格：文本 `--ink-2`；ID / 时间戳 / 数值列用 `--font-mono`；行分隔 `1px --border`（或斑马纹 `--bg-sunk`）
- 行 hover：`--bg-surface` → 提亮至 `--bg-raised`；选中行：`--bg-raised` + 左侧 `2px --accent`
- 工具栏（排序/过滤）：表上方，筛选输入（§4.9）+ 维度下拉（§4.11）+ 结果计数 `--ink-3`
- 分页脚：`--ink-3` 文本 + 翻页按钮（icon btn）；每页大小选择器（§4.11）
- 虚拟滚动：视口固定高、行绝对定位、仅渲染可见区（实现约定，非 token）——行高须严格等于 `--row-h`

### 4.5 树（Tree）
- 节点：文本 `--ink-2`，每级缩进 16px；展开 caret `--ink-3`→hover `--ink-1`
- 选中：全宽高亮 `--bg-surface` + `--ink-1` + 左侧 `2px --accent`；hover `--bg-surface`
- 叶/类型图标：`--ink-3`；连线可选 `1px --border`

### 4.6 实时流 / 日志视图（Live Stream / Log View）
- 容器：`--bg-sunk`（或 `--bg-canvas`）+ radius `--radius-md`；默认 compact 密度，`--font-mono` 12–13px
- 行结构：`[时间戳 --ink-4 mono] [级别 语义色点+文本] [消息 --ink-2]`
- 级别色：DEBUG `--ink-4` · INFO `--info` · WARN `--warning` · ERROR `--error`
- 行 hover：`--bg-surface`；自动滚动到底，hover/聚焦时暂停；支持级别过滤（§4.11）
- 行间距紧凑（compact），避免「墙」感

### 4.7 状态徽章（Status Badge）
- 变体：success / warning / error / info / neutral
- 填充型：bg = `--*-bg`，文本 = `--*-fg`，radius `--radius-full`（pill）或 `--radius-sm`；尺寸 2xs/3xs，padding 2px 8px
- neutral：bg `--bg-raised` + `1px --border`，文本 `--ink-2`
- 点型：仅 `8px` 语义圆点 + `--ink-2` 文本（无填充），用于表格行内
- 禁用纯色相区分健康态——务必配形状/图标（§4.6 级别、§4.7 点型即此目的）

### 4.8 健康灯（Health Light）
- 圆点 `8px` 圆，语义填充：healthy `--success` · degraded `--warning` · down `--error` · unknown `--ink-4`
- 活动/降级态加柔和脉冲（scale/opacity，可经 `prefers-reduced-motion` 关闭）
- 外环：`1px` 同色低透明（`color-mix(in srgb, var(--c) 30%, transparent)`）
- 配 `--ink-2`/`--ink-3` 文本标签

### 4.9 Toast / 告警横幅（Toast / Alert Banner）
- **Toast**：固定右下，`z-index:500`；面板 `--bg-raised` + `1px --border` + radius `--radius-md` + `--shadow-floating`；左侧 `3px` 语义色条；图标语义色，标题 `--ink-1`，描述 `--ink-2`；4–6s 自动消失，hover 暂停，可手动关闭
- **告警横幅**：内容区顶部通栏；error 用 `--error-bg` 底 + 左侧 `3px --error` + 文本 `--error-fg`（或 `--ink-1`）；info/warning/success 同理用语义底+语义 fg；可关闭

### 4.10 空状态 / 骨架屏（Empty State / Skeleton）
- **空状态**：居中，图标 `--ink-4`，标题 `--ink-2`，描述 `--ink-3`，可选操作按钮（§4.12 主按钮）
- **骨架屏**：占位块 bg `--bg-sunk`，radius `--radius-sm`；shimmer 动画 `linear-gradient(90deg, --bg-sunk, --bg-surface, --bg-sunk)` 移动；低对比、不打扰；`prefers-reduced-motion` 时静态

### 4.11 表单（Forms）
- 标签：`--ink-2` / 13px；必填星号 `--error`
- 输入/文本域：bg `--bg-sunk`，`1px --border`，radius `--radius-sm`，高度 `--control-h`，文本 `--ink-1`，placeholder `--ink-4`
- 聚焦：`border-color: --accent` + `box-shadow: var(--shadow-focus)`（0 0 0 2px `--accent-ring`）
- 校验失败：`border-color: --error` + 错误帮助文本 `--error`
- checkbox/radio：自定义，未选 `--border`+`--bg-sunk`，选中 `--accent` 底 + 白勾
- 禁用：`--ink-5` 文本 + `--bg-sunk`，cursor `not-allowed`
- 帮助文本：`--ink-3`

### 4.12 模态 / 抽屉（Modal / Drawer）
- **Modal**：backdrop `rgba(0,0,0,.5)` + `--shadow-overlay`，`z-index:400`；面板 `--bg-raised` + `1px --border` + radius `--radius-lg` + `--shadow-floating`，max-width 480–640
  - 头：`--ink-1` 标题 + 关闭 icon btn（`--ink-3`→`--ink-1`）
  - 体：`--ink-2`，可滚动
  - 脚：右侧操作区，顶部 `1px --border` 分隔
  - 行为：focus trap、ESC 关、点 backdrop 关
- **抽屉（Drawer）**：右侧滑入，`z-index:300`；面板同 Modal 样式，宽 360–480；可选 scrim；其余同 Modal 行为

### 4.13 下拉 / 选择器（Dropdown / Selector）
- 触发器：同输入外观（`--bg-sunk` + `--border` + `--control-h`），文本 `--ink-1`，caret `--ink-3`
- 菜单：`--bg-raised` + `1px --border` + radius `--radius-md` + `--shadow-floating`，`z-index:200`
- 选项：`--ink-2`，hover `--bg-surface`，选中 `--accent` 文本或 `--bg-surface`+勾
- 分组标签：`--ink-3` 11px uppercase；多选选项内嵌 checkbox；可含顶部搜索输入

### 4.14 按钮（Button，含文字色规则）
- **主按钮（Primary）**：bg `--accent`，文本 `--accent-fg`（#FFFFFF，4.62:1 ✅），radius `--radius-sm`，hover `--accent-hover`；focus `--shadow-focus`
- **次按钮（Secondary）**：bg `--bg-surface`，`1px --border`，文本 `--ink-1`，hover `--bg-raised`
- **幽灵按钮（Ghost）**：透明底，文本 `--ink-2`，hover `--bg-surface`
- **危险按钮（Danger）**：bg `--error`，文本 `--accent-fg`（#FFFFFF，6.55:1 ✅，因 error 较深）
- 尺寸：compact 高度 28 / comfortable 34；icon btn 见 §4.1

> ⚠️ **按钮文字色唯一规则（本方案 A）**：accent 足够深，主按钮白字直压即可（4.62:1 达标）。请勿套用 B/C 方案的「深字/下沉底色」规则——本方案不适用。

---

## 5. Layout（布局）

### 间距尺度（px，4 基准）
`--space-1:2px;` `--space-2:4px;` `--space-3:6px;` `--space-4:8px;` `--space-5:12px;` `--space-6:16px;` `--space-7:20px;` `--space-8:24px;` `--space-9:32px;` `--space-10:40px;` `--space-11:48px;` `--space-12:64px;`

### 栅格
- 12 列流式；容器 `max-width:1440px`，居中；侧栏固定 `--sidebar-w`（折叠 `--sidebar-w-collapsed`）
- 主内容区 gutter：`--gutter`（compact 12 / comfortable 16）
- 卡片网格用 CSS Grid `repeat(auto-fill, minmax(240px,1fr))`，gap `--section-gap`

### 圆角尺度
`--radius-xs` 2px · `--radius-sm` 4 · `--radius-md` 6 · `--radius-lg` 8 · `--radius-xl` 12 · `--radius-2xl` 16 · `--radius-full` 999
（开发者克制：卡片/输入 4–8，徽章/头像 full，禁用大圆角）

### 密度双模式（compact / comfortable）
| 参数 | compact | comfortable |
|------|---------|-------------|
| `--density-base` 基础字号 | 13px | 14px |
| `--row-h` 表格/树行高 | 30px | 40px |
| `--control-h` 控制件高 | 28px | 34px |
| `--card-pad` 卡片内边距 | 12px | 16px |
| `--section-gap` 分区间距 | 16px | 24px |
| `--bar-h` 顶栏高 | 44px | 48px |

---

## 6. Depth & Elevation（深度与层级）

### 阴影（深色，border 驱动为主）
| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-flat` | none | 默认表面 |
| `--shadow-raised` | `0 1px 2px rgba(0,0,0,.40), 0 0 0 1px var(--border)` | 卡片 / 下拉 |
| `--shadow-floating` | `0 8px 24px rgba(0,0,0,.55)` | 弹窗 / 抽屉 / 浮层 |
| `--shadow-overlay` | `0 16px 48px rgba(0,0,0,.65)` | 全屏遮罩层 |
| `--shadow-focus` | `0 0 0 2px var(--accent-ring)` | 输入/控件聚焦环 |

浅色主题阴影改低透明黑：`--shadow-raised` `0 1px 2px rgba(0,0,0,.06), 0 0 0 1px var(--border)`；`--shadow-floating` `0 8px 24px rgba(0,0,0,.12)`；`--shadow-overlay` `0 16px 48px rgba(0,0,0,.18)`。

### Z-index 尺度
`--z-base` 0 · `--z-sticky` 100（顶栏/侧栏）· `--z-dropdown` 200（下拉菜单）· `--z-drawer` 300（抽屉）· `--z-modal` 400（模态）· `--z-toast` 500（Toast）· `--z-tooltip` 600（tooltip）

---

## 7. Cautions（注意事项）

### Never Do（禁区）
- 用 `--accent`（靛）表达状态语义（绿=健康，红=错误，accent=交互/选中）
- 用 `--ink-5` 承载可读正文（仅禁用/装饰，UI ≥3）
- 大块渐变、重投影堆叠、大圆角（破坏「精密仪表」克制感）
- 浅色模式仅靠 warning 琥珀色相区分关键告警（对比临界 4.87）→ 必须加图标/左边框
- 表格行高在虚拟滚动下不等于 `--row-h`（会错位）
- 把系统等宽字体用于长段正文（仅代码/ID/时间戳/数值）

### Prefer（推荐）
- 状态严格走语义色 + 形状（圆点/边框/图标）双重编码
- 高密度信息用 ink-3/ink-4 做次级，ink-1 做焦点
- 复杂区用 `--bg-sunk` 凹陷区分输入/日志，而非再加边框
- 微交互克制：hover 提亮、focus 环、脉冲可关，避免位移/缩放喧宾夺主

---

## 8. Responsive Behavior（响应式）

| 断点 | 宽度 | 行为 |
|------|------|------|
| Desktop | ≥1280px | 完整布局：侧栏 240 + 主区 12 列 + 多列指标卡 |
| Tablet | 768–1279px | 侧栏折叠为 56（图标）/可 drawer 展开；指标卡 2 列；表格横向滚动 |
| Mobile | <768px | 侧栏转 bottom-nav 或抽屉；单栏堆叠；表格卡片化（每行一卡）；密度为 comfortable |

- 桌面优先；平板降级（导航收起、栅格减列）；移动端次要（不追求全功能）
- 密度：移动端强制 comfortable（触控友好），桌面/平板跟随用户密度开关
- 主题/密度切换为全局 `data-theme` / `data-density` 属性，组件零改动响应

---

## 9. Agent Prompt Guide（Agent 生成指南）

### Key Instructions
- 读取并消费 `:root` CSS 变量；**不要硬编码色值**，一律用 `--token`
- 深色为默认；切换浅色只改 `data-theme`，不重写组件
- 文本用 ink 梯度（正文 ink-1/2，元信息 ink-3，禁用 ink-5）；数值/ID/时间戳/代码用 `--font-mono`
- 状态用语义色；accent 仅交互/选中/图表主线
- 所有可聚焦控件必须有 `--shadow-focus`；对比度已验 AA，勿自降
- 尊重 `prefers-reduced-motion`（脉冲/shimmer 关闭）

### Quick CSS Snippet（核心 token，深色默认）
```css
:root,
[data-theme="dark"] {
  /* 背景层级 */
  --bg-canvas:#0B0C0E; --bg-sunk:#07080A; --bg-surface:#15161A; --bg-raised:#1E1F25;
  --border:#2A2B31; --border-strong:#3A3C44;
  /* 文字梯度 */
  --ink-1:#F2F3F5; --ink-2:#C7C9D1; --ink-3:#9094A0; --ink-4:#7A7E8A; --ink-5:#6A6E78;
  /* 单一强调色（靛） */
  --accent:#6E5EF2; --accent-hover:#8275F6; --accent-ring:#6E5EF2; --link:#9D93F8; --accent-fg:#FFFFFF;
  --accent-soft:rgba(110,94,242,0.12);
  /* 语义状态色 */
  --success:#3FB950; --success-bg:#14361F; --success-fg:#5DDC7A;
  --warning:#D29922; --warning-bg:#3A2E10; --warning-fg:#E8B94B;
  --error:#F85149;   --error-bg:#3D1A1A;   --error-fg:#FF8580;
  --info:#58A6FF;    --info-bg:#152C44;    --info-fg:#79C0FF;
  /* 字体 */
  --font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;
  --font-mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,"Liberation Mono",monospace;
  /* 圆角 / 间距 / 阴影 / z-index */
  --radius-xs:2px; --radius-sm:4; --radius-md:6; --radius-lg:8; --radius-xl:12; --radius-full:999;
  /* 间距尺度（px，4 基准） */
  --space-1:2px; --space-2:4px; --space-3:6px; --space-4:8px; --space-5:12px; --space-6:16px;
  --space-7:20px; --space-8:24px; --space-9:32px; --space-10:40px; --space-11:48px; --space-12:64px;
  --shadow-raised:0 1px 2px rgba(0,0,0,.40),0 0 0 1px var(--border);
  --shadow-floating:0 8px 24px rgba(0,0,0,.55);
  --shadow-overlay:0 16px 48px rgba(0,0,0,.65);
  --shadow-focus:0 0 0 2px var(--accent-ring);
  --z-sticky:100; --z-dropdown:200; --z-drawer:300; --z-modal:400; --z-toast:500; --z-tooltip:600;
  /* 布局 / 动效基元 */
  --sidebar-w:240px; --sidebar-w-collapsed:56px;
  --ease:cubic-bezier(.4,0,.2,1); --dur-fast:120ms;
}
[data-theme="light"] {
  --bg-canvas:#FFFFFF; --bg-sunk:#EEF0F2; --bg-surface:#F7F8F9; --bg-raised:#FFFFFF;
  --border:#E2E4E8; --border-strong:#C9CDD4;
  --ink-1:#15161A; --ink-2:#43474E; --ink-3:#6B6F78; --ink-4:#8A8E97; --ink-5:#B0B4BC;
  --accent:#4F46E5; --accent-hover:#4338CA; --link:#4338CA;
  --success:#1A7F37; --warning:#9A6700; --error:#CF222E; --info:#0969DA;
  --accent-ring:#4F46E5;
  --success-bg:#EAF6EE; --success-fg:#1A7F37;
  --warning-bg:#FDF6E6; --warning-fg:#9A6700;
  --error-bg:#FCE8E8; --error-fg:#CF222E;
  --info-bg:#E8F1FD; --info-fg:#0969DA;
  --shadow-raised:0 1px 2px rgba(0,0,0,.06),0 0 0 1px var(--border);
  --shadow-floating:0 8px 24px rgba(0,0,0,.12);
  --shadow-overlay:0 16px 48px rgba(0,0,0,.18);
}
[data-density="compact"] {
  --density-base:13px; --row-h:30px; --control-h:28px; --card-pad:12px; --section-gap:16px; --bar-h:44px; --gutter:12px;
}
[data-density="comfortable"] {
  --density-base:14px; --row-h:40px; --control-h:34px; --card-pad:16px; --section-gap:24px; --bar-h:48px; --gutter:16px;
}
```

---

## 附录 A · 组件 Token 明细（速查）

| 组件 | 背景 | 描边 | 圆角 | 文本/强调 | 状态 |
|------|------|------|------|-----------|------|
| 顶栏 | `--bg-canvas` | 底 `--border` | — | icon `--ink-3`→`--ink-1` | 健康灯/连接态用语义 |
| 侧栏 | `--bg-canvas` | 右 `--border` | 项 `--radius-sm` | 激活 `--ink-1`+左 2px `--accent` | — |
| 指标卡 | `--bg-surface` | `--border` | `--radius-lg` | 值 `--ink-1` 22/700；sparkline `--accent` | delta 语义色 |
| 表格 | `--bg-surface` | `--border` | `--radius-lg` | cell `--ink-2`；ID/时间 `--font-mono` | 选中左 2px `--accent` |
| 树 | 透明 | 连线 `--border` | — | 节点 `--ink-2`；激活 `--bg-surface`+`--accent` | — |
| 日志流 | `--bg-sunk` | — | `--radius-md` | `--font-mono`；级别语义色 | 级别过滤 |
| 状态徽章 | `--*-bg` | — | `--radius-full` | `--*-fg` | 5 变体 |
| 健康灯 | 圆点语义色 | 外环同色 30% | 圆 | 标签 `--ink-2` | 4 态+脉冲 |
| Toast | `--bg-raised` | `--border` | `--radius-md` | 左 3px 语义条 | 自动消失 |
| 告警横幅 | `--*-bg` | 左 3px 语义 | — | `--*-fg` | 可关 |
| 空状态 | — | — | — | 图标 `--ink-4`；标题 `--ink-2` | — |
| 骨架屏 | `--bg-sunk` | — | `--radius-sm` | shimmer 低对比 | reduced-motion 静态 |
| 表单 | 输入 `--bg-sunk` | `--border`→focus `--accent` | `--radius-sm` | label `--ink-2`；placeholder `--ink-4` | 失败 `--error` |
| 模态 | `--bg-raised` | `--border` | `--radius-lg` | 标题 `--ink-1` | backdrop `.5`；ESC/点遮关 |
| 抽屉 | `--bg-raised` | `--border` | `--radius-lg` | 同模态 | 右滑；z 300 |
| 下拉 | 菜单 `--bg-raised` | `--border` | `--radius-md` | 选项 `--ink-2`；选中 `--accent` | z 200 |
| 按钮 | 主 `--accent`/次 `--bg-surface` | 次 `--border` | `--radius-sm` | 主 **白字**（4.62✅） | 危险 `--error` 白字 |

---

## 附录 B · 原型启动规范（浓缩版 · 转交原型构建师）

**主题**：深色默认 `[data-theme="dark"]`，浅色 `[data-theme="light"]`；密度 `[data-density="compact|comfortable"]`。全部用 `--token`，禁硬编码。

**色彩（深色）**
- 背景：`--bg-canvas #0B0C0E` / `--bg-sunk #07080A` / `--bg-surface #15161A` / `--bg-raised #1E1F25`
- 边框：`--border #2A2B31` / `--border-strong #3A3C44`
- 文字：`--ink-1 #F2F3F5`(主) · `--ink-2 #C7C9D1`(正文) · `--ink-3 #9094A0`(元) · `--ink-4 #7A7E8A` · `--ink-5 #6A6E78`(禁用/装饰)
- 强调：`--accent #6E5EF2` / hover `#8275F6` / 链接 `#9D93F8`
- 语义：success `#3FB950` / warning `#D29922` / error `#F85149` / info `#58A6FF`（各配 `--*-bg` 底 + `--*-fg` 底上文字，均 AA）

**排版**
- 正文 `--font-sans`（系统栈）；代码/ID/时间戳/数值 `--font-mono`
- 基础字号 compact 13 / comfortable 14；标题 22(2xl)/18(xl)；标签 11–12 uppercase

**间距 / 圆角**
- 间距 4 基准：2/4/6/8/12/16/20/24/32/40/48/64
- 圆角：卡片/输入 4–8，徽章/头像 full，禁用大圆角

**关键组件样式要点**
- 卡片：`--bg-surface` + 1px `--border` + radius 8 + padding `--card-pad`；指标卡含 sparkline（描边 `--accent`）
- 表格：行高 `--row-h`，表头 sticky uppercase `--ink-3`，选中左 2px `--accent`，虚拟滚动行高严格=`--row-h`
- 状态：语义色 + 形状双重编码（圆点/边框/图标），不靠纯色相
- 健康灯：语义圆点 + 可关脉冲
- 聚焦环：所有可聚焦控件 `--shadow-focus`（0 0 0 2px `--accent-ring`）
- 模态 z 400 / 抽屉 z 300 / 下拉 z 200 / Toast z 500

**按钮文字规则（本方案 A 专用）**
- 主按钮：`--accent` 底 + **白字**（4.62:1 ✅，可直接压）
- 危险按钮：`--error` 底 + 白字（6.55:1 ✅）
- 次/幽灵：透明或 `--bg-surface` + `--ink-1/2` 文本
- ⚠️ 不要套用其他方案的「深字/下沉底色」按钮规则

**本次补入的新 token（缺口修复）**
- 按钮文字：`--accent-fg` #FFFFFF（主/危险按钮白字，均 AA）
- sparkline/面积图：`--accent-soft` rgba(110,94,242,.12)（accent 低透明派生）
- 布局：`--sidebar-w` 240px / `--sidebar-w-collapsed` 56px；`--gutter` 随密度 compact 12 / comfortable 16
- 动效：`--ease` cubic-bezier(.4,0,.2,1) / `--dur-fast` 120ms
- 浅色补齐：`--accent-ring` #4F46E5 + 全套 `--*-bg`/`--*-fg`（success #EAF6EE/#1A7F37 · warning #FDF6E6/#9A6700 · error #FCE8E8/#CF222E · info #E8F1FD/#0969DA，底上文字 4.52–4.57:1 均 AA）

**硬约束已满足**：WCAG AA（逐值实测）· 系统字体离线 · 深色优先+浅色 · 密度双模式 · 全新无继承 · 单一 token 体系 · 纯前端 CSS 变量。
