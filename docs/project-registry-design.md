# AI Memory Hub - 项目注册表设计方案

## 一、问题分析

### 当前痛点
1. **无项目元数据** - 无法记录项目状态、描述、关系
2. **无法表达项目关系** - sample-media 是 sample-backend 的换皮，但系统不知道
3. **无状态管理** - 无法标记项目已暂停/归档/活跃
4. **无别名支持** - 项目改名后历史数据难以追溯
5. **无外部关联** - 无法链接飞书文件夹、代码仓库、文档
6. **下拉框混乱** - 包含大量测试项目，无法过滤

### 数据分布
- ai-memory-hub: 571 条
- sample-game: 26 条
- workspace: 18 条
- base-project: 16 条
- test-*系列: 16 条
- sample-media: 待整理（目前在飞书但未在系统中）

## 二、设计方案

### 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **A. 独立 projects.jsonl** | 结构清晰，易扩展，支持完整元数据 | 需要新增 API 和 UI | ⭐⭐⭐⭐⭐ |
| B. 扩展 memory 类型 | 复用现有基础设施 | 混入记忆数据，语义不纯 | ⭐⭐ |
| C. config.json 静态配置 | 简单快速 | 不支持动态添加，无历史记录 | ⭐⭐⭐ |

**推荐：方案 A - 独立 projects.jsonl**

### 数据结构

```jsonl
{
  "id": "sample-media",
  "name": "sample-project",
  "displayName": "sample-project",
  "status": "active",
  "type": "game",
  "description": "《sample-project》的西游主题换皮版本，麻将堆叠二消玩法",
  "metadata": {
    "basedOn": "sample-backend",
    "relation": "reskin",
    "target": "55+ 银发用户",
    "tech": ["Unity", "Luban", "YooAsset", "HybridCLR"]
  },
  "aliases": ["sample-media", "sample-project"],
  "resources": {
    "feishu": "<feishu-folder-url>",
    "repo": "<local-repo-path>",
    "docs": []
  },
  "createdAt": "2026-06-03T00:00:00Z",
  "updatedAt": "2026-06-11T12:00:00Z"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 唯一标识，kebab-case |
| `name` | string | ✓ | 项目全称 |
| `displayName` | string | ✓ | 显示名称（用于下拉框） |
| `status` | enum | ✓ | active/paused/archived/planning |
| `type` | string |  | game/tool/document/research 等 |
| `description` | string |  | 项目描述 |
| `metadata` | object |  | 自定义元数据 |
| `metadata.basedOn` | string |  | 基于哪个项目（换皮） |
| `metadata.relation` | string |  | reskin/fork/sequel 等 |
| `aliases` | string[] |  | 别名列表 |
| `resources` | object |  | 外部资源链接 |
| `createdAt` | ISO8601 | ✓ | 创建时间 |
| `updatedAt` | ISO8601 | ✓ | 更新时间 |

### 状态定义

| 状态 | 说明 | 下拉框显示 |
|------|------|-----------|
| `active` | 活跃开发中 | ✅ 显示 |
| `paused` | 暂停 | ⏸️ 显示（标注） |
| `archived` | 已归档 | ❌ 不显示 |
| `planning` | 规划中 | 💡 显示（标注） |

## 三、实现计划

### 文件结构
```
%USERPROFILE%\.ai-memory\
├── projects\
│   ├── projects.jsonl       # 项目注册表
│   └── README.md            # 说明文档
```

### CLI 命令

```bash
# 列出所有项目
ai-memory-hub project list [--status active]

# 添加项目
ai-memory-hub project add <id> --name <name> --status <status>

# 更新项目
ai-memory-hub project update <id> --status paused

# 查看项目详情
ai-memory-hub project show <id>

# 设置别名
ai-memory-hub project alias <id> <alias>

# 设置关系
ai-memory-hub project relate <id> --based-on <parent-id> --relation reskin
```

### API 端点

```javascript
// GET /api/projects - 列出所有项目
// GET /api/projects/:id - 获取项目详情
// POST /api/projects - 创建项目
// PATCH /api/projects/:id - 更新项目
// DELETE /api/projects/:id - 删除项目（软删除 -> archived）
```

### Dashboard 改动

1. **下拉框过滤** - 只显示 active/paused/planning 项目
2. **项目管理面板** - 新增 Projects 标签页
3. **可视化关系图** - 显示项目关系（换皮、续作等）
4. **项目卡片** - 显示状态、描述、关联资源

### 集成点

1. **populateFilterOptions()** - 从 projects.jsonl 读取，替代动态收集
2. **任务创建/编辑** - 项目下拉框改为从注册表读取
3. **Radio 消息** - 验证项目 ID 是否存在
4. **Workflow** - 项目选择器使用注册表
5. **搜索** - 支持按项目别名搜索

## 四、初始数据迁移

```jsonl
{"id":"base-project","name":"base-project","displayName":"base-project","status":"active","type":"game","description":"sample-project主题游戏","aliases":["sample-project","base-project(sample-project)"],"createdAt":"2026-05-01T00:00:00Z","updatedAt":"2026-06-11T12:00:00Z"}
{"id":"sample-backend","name":"sample-project","displayName":"sample-project","status":"active","type":"game","description":"面向55+银发用户的麻将堆叠二消游戏","metadata":{"target":"55+ 银发用户","tech":["Unity","Luban","YooAsset","HybridCLR"]},"resources":{"feishu":"<feishu-folder-url>"},"createdAt":"2026-05-18T00:00:00Z","updatedAt":"2026-06-11T12:00:00Z"}
{"id":"sample-media","name":"sample-project","displayName":"sample-project","status":"active","type":"game","description":"《sample-project》的西游主题换皮版本","metadata":{"basedOn":"sample-backend","relation":"reskin"},"aliases":["sample-project"],"resources":{"feishu":"<feishu-folder-url>","repo":"<local-repo-path>"},"createdAt":"2026-06-03T00:00:00Z","updatedAt":"2026-06-11T12:00:00Z"}
{"id":"sample-game","name":"sample-game：九九归一","displayName":"sample-game","status":"paused","type":"game","description":"81关线性卷轴地图，6种核心玩法综合游戏","aliases":["sample-game","xy_puzzle_collection"],"createdAt":"2026-04-01T00:00:00Z","updatedAt":"2026-06-11T12:00:00Z"}
{"id":"ai-memory-hub","name":"AI Memory Hub","displayName":"AI Memory Hub","status":"active","type":"tool","description":"本地优先的多AI工具共享记忆中心","resources":{"repo":"https://github.com/<owner>/<repo>"},"createdAt":"2026-06-01T00:00:00Z","updatedAt":"2026-06-11T12:00:00Z"}
```

## 五、实施步骤

### Phase 1: 基础设施（1-2天）
- [ ] 创建 `projects/` 目录和数据结构
- [ ] 实现 CLI 基础命令（list/add/update/show）
- [ ] 实现 API 端点
- [ ] 编写初始数据迁移脚本

### Phase 2: Dashboard 集成（1天）
- [ ] 下拉框改为从注册表读取
- [ ] 添加状态过滤（排除 archived 和 test-* 前缀）
- [ ] 项目管理面板 UI

### Phase 3: 高级特性（1-2天）
- [ ] 项目关系可视化
- [ ] 别名搜索支持
- [ ] 资源链接跳转
- [ ] 批量迁移历史数据

### Phase 4: 文档和测试（0.5天）
- [ ] 更新 README
- [ ] 编写使用文档
- [ ] 测试验证

**总计：3.5-5.5 天**

## 六、向后兼容

- 现有 tasks/radio/workflows 中的 `project` 字段继续工作
- 下拉框自动匹配别名到规范 ID
- 未注册项目显示时带 ⚠️ 标记，提示注册
- 提供迁移工具：`ai-memory-hub project migrate`

## 七、未来扩展

- 项目归档自动备份
- 项目模板（快速创建新项目）
- 项目标签（可跨项目搜索）
- 项目统计报表（任务完成率、活跃度）
- 项目协作者管理
