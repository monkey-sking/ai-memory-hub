# Dashboard UI 改造工作计划

## 📋 项目概述

将 ai-memory-hub Dashboard 从传统手写 CSS 迁移到现代化的 shadcn/ui + Tailwind CSS 设计系统。

**目标：**
- 统一设计语言和视觉风格
- 提升用户体验和可维护性
- 保持所有现有功能完整性
- 减少 CSS 代码量，提升性能

## ✅ 已完成工作

### 1. 基础设施搭建
- ✅ 安装 Tailwind CSS v4 + Vite 插件
- ✅ 配置主题变量（深色主题 #0b1020 背景，#3fb7a3 主色）
- ✅ 配置路径别名 `@/*` 指向 `./src/*`
- ✅ 创建 `cn()` 工具函数（class-variance-authority）

### 2. shadcn/ui 组件库
- ✅ Button（6 种变体：default/destructive/outline/secondary/ghost/link）
- ✅ Badge（4 种变体）
- ✅ Input、Label、Textarea
- ✅ Dialog（完整对话框组件）
- ✅ Table（表格组件）
- ✅ Card（卡片组件系列）

### 3. 主界面框架
- ✅ 安装 lucide-react 图标库
- ✅ 重新设计 Sidebar（14 个专业图标，流畅折叠动画）
- ✅ 重新设计 Layout（Flexbox 响应式布局）
- ✅ 创建 DashboardHeader 组件（带图标的操作按钮）
- ✅ 创建 ToastStack 组件（优雅的通知提示）

### 4. 首个业务面板
- ✅ 重新设计 ProjectsPanel（表格、对话框、徽章）
- ✅ 所有功能保持完整（编辑、归档、JSON 编辑）

**构建结果：**
```
✓ Dashboard-qFz4ecIX.js   161.28 KB
✓ index-CciWrXIf.css       35.22 KB (Tailwind)
✓ 构建时间: 614ms
```

## 🎯 待完成任务（按优先级）

### Priority: HIGH

#### Task 1: 改造 Overview 面板
**ID:** `0d3320da4675ffab`

**目标组件：**
- `MetricCard` → 使用 Card + 数字展示
- `Panel` → 使用 Card
- `TaskList` → 使用 Table
- `ToolList` → 使用 Table 或 List
- `RadioList` → 使用时间轴样式列表

**设计要点：**
- 6 个指标卡片采用网格布局（`grid grid-cols-2 md:grid-cols-3 gap-4`）
- 数字大号展示 + 趋势图标
- 列表项悬停效果
- 统一卡片圆角和阴影

#### Task 2: 改造 Tasks 面板
**ID:** `c122d7c92d0aeabb`

**目标组件：**
- 任务列表 → Table 组件
- 状态徽章 → Badge 组件
- 操作按钮 → Button 组件
- 筛选器 → Select + Input

**设计要点：**
- 紧凑表格行高
- 优先级颜色编码（high=红色，normal=蓝色，low=灰色）
- 行内编辑或对话框编辑
- 多选和批量操作

### Priority: NORMAL

#### Task 3: 改造 Memory 面板
**ID:** `3083dc86505620b8`

**目标组件：**
- 记忆列表 → Card 列表或 Table
- 添加记忆 → Dialog + Form
- Supersede 操作 → Dialog
- 分页控件 → 自定义 Pagination

**设计要点：**
- 时间线风格展示
- kind 字段用不同颜色徽章
- score 权重可视化（进度条或星级）
- 富文本编辑器（Textarea + Markdown 预览）

#### Task 4: 改造 Radio 面板
**ID:** `306542bd10b1cd27`

**目标组件：**
- 消息流 → 聊天气泡样式
- 发送表单 → Input + Button
- 消息类型 → Badge

**设计要点：**
- 左右对齐（from/to 区分）
- 时间戳淡化显示
- 新消息自动滚动
- 支持 Markdown 渲染

#### Task 5: 改造 Workflows 面板
**ID:** `42f90d1ddf7059cc`

**目标组件：**
- 工作流卡片 → Card
- 状态展示 → Badge + 进度条
- 节点状态 → 步骤条（Stepper）

**设计要点：**
- 卡片网格布局
- 执行进度可视化
- planner/executor/reviewer 角色图标
- 展开查看详细节点

### Priority: LOW

#### Task 6: 改造其他面板
**ID:** `dfae2be691d2bed1`

**包含：**
- Tools 面板（工具状态表格 + 图标）
- Health 面板（健康指标仪表盘）
- Settings 面板（设置表单）
- Analytics 面板（图表展示）

## 📐 设计规范

### 间距系统
```
容器边距：p-6
卡片间距：gap-4 或 gap-6
表单字段：space-y-4
按钮组：gap-2
```

### 颜色语义
```
主色调：primary (#3fb7a3 青绿色)
成功：primary
警告：yellow/amber
错误：destructive (#f07178 红色)
中性：muted-foreground
```

### 字体大小
```
页面标题：text-2xl font-bold
卡片标题：text-lg font-semibold
正文：text-sm
辅助文本：text-xs text-muted-foreground
```

### 圆角
```
卡片：rounded-lg
按钮：rounded-md
输入框：rounded-md
```

## 🔧 技术栈

- **React 19.2.6**
- **TypeScript 6.0.2**
- **Vite 8.0.12**
- **Tailwind CSS v4**
- **shadcn/ui**（New York 风格）
- **lucide-react**（图标）
- **Radix UI**（无头组件）

## 📦 组件复用原则

1. **优先使用 shadcn/ui 组件**：不要手写样式
2. **保持功能完整性**：确保所有交互都能工作
3. **类型安全**：使用 TypeScript 严格模式
4. **响应式设计**：支持桌面和平板（暂不考虑手机）
5. **可访问性**：遵循 ARIA 规范

## 🚀 执行流程

每个面板改造遵循：

1. **阅读现有代码**：理解功能和交互
2. **设计新组件**：用 shadcn/ui 替换旧组件
3. **保持数据流**：props 和 state 保持不变
4. **测试功能**：确保所有按钮、表单、对话框正常
5. **构建部署**：`npm run build` + 部署到 public/
6. **验证上线**：浏览器测试 + 清除缓存

## 📝 注意事项

- ⚠️ **不要删除旧 CSS**：在所有面板改造完成前保留 Dashboard.css
- ⚠️ **增量迁移**：一次改造一个面板，避免大规模破坏
- ⚠️ **保持 API 不变**：只改 UI，不改后端接口
- ⚠️ **浏览器兼容**：测试 Chrome/Edge（主要用户）
- ⚠️ **性能监控**：注意 bundle 大小不要超过 200KB

## 🎯 成功标准

- ✅ 所有现有功能正常工作
- ✅ UI 风格统一（shadcn/ui + Tailwind）
- ✅ 无 TypeScript 错误
- ✅ 构建时间 < 1 秒
- ✅ CSS bundle < 50KB
- ✅ 用户反馈正面

## 📅 时间估算

- Overview: 2-3 小时
- Tasks: 2-3 小时
- Memory: 3-4 小时
- Radio: 1-2 小时
- Workflows: 2-3 小时
- 其他面板: 4-6 小时

**总计：约 14-21 小时**

---

**当前状态：** 已完成主框架 + Projects 面板，可以开始 Overview 面板改造。

**建议下一步：** 改造 Overview 面板，因为它是首页，用户最先看到的页面。
