# AMH Dashboard 重设计 · 第一轮审查报告（Round 1）

- **审查对象**：`proto-next/overview.html` + `proto-next/memory.html`（Plan A · Linear 靛紫方向）
- **审查标准**：5 维评审（哲学 / 层次 / 执行 / 特异性 / 克制）+ Anti-Slop 质量门
- **结论**：❌ **FAIL — 18 / 25**
- **关键判定**：存在 P0 阻断项，必须修复后进入第二轮。

---

## 一、五维评分（合计 18 / 25）

| 维度 | 分值 | 说明 |
|------|------|------|
| 哲学（与 Linear 方向一致性） | 4 / 5 | 近黑冷调 + 靛紫 `#6E5EF2` 方向正确，整体气质贴合 Linear |
| 层次（信息层级 / 对比） | 4 / 5 | 卡片 / 表面 / 边框三级划分清晰，语义色明确 |
| 执行（还原度 / 细节） | 3 / 5 | 因 `--space-*` 缺失导致间距塌缩，拉低还原度 |
| 特异性（AMH 业务贴合） | 4 / 5 | 指标卡、事件流、命名空间树贴合 AMH 实际数据结构 |
| 克制（Anti-Slop / 无冗余） | 3 / 5 | SVG 出现黑块假图，属典型 slop 信号，需剔除 |

---

## 二、阻断项（P0 — 必须修）

### P0-1 · 间距尺度缺失，布局塌缩为 0
- **现象**：`overview.html` / `memory.html` 的 `:root` 中 **0 条** `--space-*` 被定义，但页面内 **26 处** 引用了 `var(--space-*)`
- **后果**：`padding / gap / margin` 全部解析为 `0` → 侧边栏、顶栏、表格文字贴边，卡片内部无呼吸感，密度失控
- **根因**：初版 `DESIGN-SYSTEM.md` §9 速查片段遗漏了 §5 的间距尺度，原型复制了残缺片段
- **修复要求**：在两份 HTML 的 `:root` 补入完整尺度
  ```css
  --space-1:2px; --space-2:4px; --space-3:6px; --space-4:8px;
  --space-5:12px; --space-6:16px; --space-7:20px; --space-8:24px;
  --space-9:32px; --space-10:40px; --space-11:48px; --space-12:64px;
  ```
  同时回填 `DESIGN-SYSTEM.md` 源文档 `:root` 与 §9 片段。

---

## 三、重要项（P1 — 应修）

### P1-1 · z-index 层级令牌缺失
- **现象**：`z-index: var(--z-*)` 全部解析为 `auto`
- **后果**：抽屉、下拉、tooltip 层级不可控，可能互相遮挡
- **修复**：补入 `--z-sticky:100; --z-dropdown:200; --z-drawer:300; --z-modal:400; --z-toast:500; --z-tooltip:600;`

### P1-2 · SVG 表现属性里用了 `var()`（黑块假图）
- **现象**：14–16 处 `fill="var(--accent-soft)"` / `stroke="var(--accent)"` 等写在 SVG **表现属性**上
- **根因**：CSS 自定义属性在 SVG 表现属性中**不解析**，只在 `style=""` 或 CSS class 里解析
- **后果**：sparkline 折线图、状态 donut 渲染成**黑块/断图**
- **修复**：全部改为 `style="fill:var(--accent-soft)"` 或给 `<path>` 加 class 走 CSS

---

## 四、提示项（P2 — 跟进）

- **浅色模式语义色 AA 临界**：初版浅色 warning 文本对比度踩线（≈4.4:1）。已要求设计系统专家改用更浅底色，使浅色语义文字全部 ≥4.5:1（实际 4.52–4.57:1），保留 AA 合规版本。
- **响应式**：第一轮未覆盖窄屏断点，第二轮需补 `@media` 或 `clamp()` 基础处理。

---

## 五、处置

- 向 prototype-builder 回发 P0/P1 修正指令（附具体 token 与 16 处 SVG 编辑清单）
- 同步补 `DESIGN-SYSTEM.md` 源文档 `:root` / §5 / §9 三处一致
- 修复后进入 **Round 2** 复核（质量门上限 2 轮修订）
