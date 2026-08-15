# AMH Dashboard 重设计 · 交付总览

> 方向：**Plan A · Linear（靛紫 `#6E5EF2`）**｜范围：**全部 16 路由重做，仅前端，不碰后端**
> 成果：设计系统真源 + 两套可预览高保真原型 + 两轮质量门审查

---

## 一、交付物清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `DESIGN-SYSTEM.md` | 设计系统真源 | Plan A 完整令牌（色彩 / 边框 / 文字 / 语义 / 间距 / 层级 / 字体 / 动效 / 暗明双主题 / 双密度），§5+§9 一致 |
| `proto-next/index.html` | **原型套件入口** | 16 路由画廊，单页可跳转全部原型 + 一致性核验结论 |
| `proto-next/{overview,memory,analytics,backups,search,tools,tasks,radio,workflows,dispatch,projects,health,skills,extensions,chat,settings}.html` | 高保真原型 | **16 路由全部补齐并统一**：同一份 `<style>` + 内联 SVG 雪碧图；侧栏为统一 16 路由结构、跨页真实互链、单一激活项；SVG 全部 `style="fill:var(--x)"` 规避黑块 |
| `REDESIGN-REVIEW-R1.md` | 审查报告 | Round 1：FAIL 18/25，P0-1 间距塌缩 + P1-1 z-index + P1-2 SVG 黑块 |
| `REDESIGN-REVIEW-R2.md` | 审查报告 | Round 2：PASS 20/25，P0/P1 全闭环，组件 100% 覆盖 |
| `DESIGN-REVIEW.md` | 旧设计评审 | 对既有 A（原型）/ B（React 应用）两套不相关设计系统的对比诊断（存档参考） |

### 16 原型路由映射（与 `dashboard-next/src/components/Layout.tsx` 的 `navGroups` 严格对齐）

| 分组 | 路由 | 原型文件 | 路由 | 原型文件 |
|------|------|----------|------|----------|
| 协作 | `/dashboard` Overview | `overview.html` | `/memory` Memory | `memory.html` |
| 协作 | `/tasks` Tasks | `tasks.html` | `/workflows` Workflows | `workflows.html` |
| 数据 | `/radio` Radio | `radio.html` | `/dispatch` Dispatch | `dispatch.html` |
| 数据 | `/tools` Tools | `tools.html` | `/skills` Skills | `skills.html` |
| 数据 | `/extensions` Extensions | `extensions.html` | `/chat` Chat | `chat.html` |
| 系统 | `/analytics` Analytics | `analytics.html` | `/search` Search | `search.html` |
| 系统 | `/backups` Backups | `backups.html` | `/projects` Projects | `projects.html` |
| 系统 | `/health` Health | `health.html` | `/settings` Settings | `settings.html` |

---

## 二、设计系统要点（Plan A · Linear）

- **底色**：`--bg-canvas #0B0C0E` / `--bg-sunk #07080A` / `--bg-surface #15161A` / `--bg-raised #1E1F25`
- **边框**：`--border #2A2B31` / `--border-strong #3A3C44`
- **文字**：`--ink-1 #F2F3F5` … `--ink-5 #6A6E78`
- **主色**：`--accent #6E5EF2` / `--accent-hover #8275F6` / `--link #9D93F8` / `--accent-soft rgba(110,94,242,0.12)`
- **语义**：success/warning/error/info 各含 `--*-bg` + `--*-fg`，浅色模式全部 ≥4.5:1（AA）
- **间距**：`--space-1:2px … --space-12:64px`（12 级）
- **层级**：`--z-sticky:100 … --z-tooltip:600`（6 级）
- **密度**：暗色默认 + 明色可切换；compact（13px）/ comfortable（14px）双密度
- **约束**：零 CDN 字体（系统栈），WCAG AA，本地可独立预览

---

## 三、质量门结论

- Round 1 → **FAIL 18/25**（P0 阻断）
- Round 2 → **PASS 20/25**（P0/P1 全闭环，无回归，组件 100% 覆盖）
- 已达放行标准，可进入 React 落地阶段。

---

## 四、下一步（待确认）

1. **原型套件一致性已收口**：16 路由全部补齐并通过一致性核验（侧栏零死链、单一激活项、SVG 零黑块、共享同一套 token 与雪碧图）。缺失的 skills/extensions/chat/settings 已补齐，并补充 6 个图标与 banner 四类语义变体。
2. **React 落地已有基础**：`dashboard-next/src/index.css` 已重写为 Plan A 暗色默认 + 浅色覆盖的 token 基座，`src/components/Layout.tsx` 已加暗/亮主题切换；这是全局基座，16 路由的主题已统一换肤。
3. **逐路由组件级重构**：在基座之上拆分 `Dashboard.tsx` 单体，按原型实现各路由组件（建议先 overview + memory 作为参照，再铺其余 14 路由）。全程仅前端、保持既有数据层契约（`src/lib/api.ts` + `realtime.ts`，无 mock）。

> 是否继续进入 React 逐路由落地？确认后我将排定 16 路由实现计划（仍仅前端）。
