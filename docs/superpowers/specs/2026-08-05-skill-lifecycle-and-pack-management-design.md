# AMH Skill 生命周期与 Skill 包管理设计

日期：2026-08-05

## 目标

把本机多个 Agent 目录中的 Skill 实例收敛为可去重、可版本化、可同步、可回滚的 AMH Registry，同时支持包含多个 Skill、脚本、参考资料、模板、凭据声明和目标 Agent 的 Skill 包。用户不需要手工复制文件，也不能因为同步而覆盖未受 AMH 管理的用户文件。

## 核心模型

### Skill 单元

一个包含 `SKILL.md` 的目录是一个 Skill 单元。其身份由 `id` 及不可变 `contentHash` 组成；导入新内容时创建新版本，不覆盖旧版本。

### Skill 包

Skill 包由 `amh-pack.json` 描述，包含：

- `id`、`version`、`skills`：包身份、语义版本和包内 Skill 列表；
- `dependencies`：其他 Skill 或外部运行时依赖；
- `credentials`：仅声明凭据 ID/环境变量，不保存密钥；
- `targets`：支持的 Agent 投影目标；
- `files`：脚本、references、templates、assets 等随包保留的文件。

没有包清单的目录仍按单个 Skill 导入；不能根据 `lark-*` 等名称前缀猜测包边界。飞书等集合可以通过显式包清单整体安装，也可以启用包内部分 Skill。

## 状态与操作

| 层级 | 状态 | 允许操作 |
| --- | --- | --- |
| 来源 | 已发现 | 查看、预览、导入 |
| 来源 | 完全重复 | 自动合并、查看来源 |
| 来源 | 同名冲突 | 对比、选择版本、导入；禁止静默覆盖 |
| 来源 | 有更新 | 查看 diff、导入新版本 |
| 来源 | 源失效 | 查看 Registry 副本、重新定位来源 |
| Registry | 已导入 | 查看、启用、同步、归档 |
| Registry | 待升级 | 查看变更、升级、保留旧版 |
| 项目 | 已启用 | 停用、改版本约束、同步 |
| 项目 | 已停用 | 启用、删除项目引用 |
| 项目 | 依赖缺失 | 查看依赖、安装依赖、暂不启用 |
| Agent 投影 | 已同步 | 查看来源、重新同步 |
| Agent 投影 | 漂移 | 对比、重新同步、保留本地版本 |
| Agent 投影 | 同步失败 | 查看错误、重试、切换目标 |

完全相同内容按 `(id, contentHash)` 自动去重；同名不同内容都保留为不可变版本，并显示冲突。删除操作只删除项目引用或归档 Registry 版本，不物理删除仍被其他项目使用的包。

## 用户流程

1. 扫描：按 `id` 聚合来源，显示来源 Agent、路径、版本、内容哈希和冲突数。
2. 选择：用户选择单个 Skill 或显式 Skill 包；完全重复项无需选择。
3. 导入：复制整个目录/包内容到 AMH Registry，生成 provenance 和内容哈希。
4. 启用：为项目写入 `.amh/skills.json`，允许 Skill 级选择和版本约束。
5. 同步：根据目标 Agent 生成受 AMH 管理的投影；用户文件不覆盖。
6. 更新：扫描源或远端新版本，导入为新不可变版本，项目确认后切换。
7. 回滚：项目切回已存在版本并重新同步。

## Dashboard 设计

Skills 页面按“全部、需要处理、Registry、项目启用、Agent 同步”分区。每个分组只显示去重后的逻辑 Skill；重复来源折叠为来源数，冲突显示对比入口。包显示包级状态和包内 Skill 数量，并允许展开后部分启用。

顶部提供扫描、导入、同步、更新检查和问题数量。危险操作需要二次确认：选择冲突版本、停用仍被任务引用的 Skill、覆盖漂移文件和切换包版本。

## API 方向

- `/api/skills/scan` 返回聚合后的 Skill/包视图，而不是每个 Agent 目录的原始实例；保留 `sources` 供详情使用。
- `/api/skills` 返回 Registry 版本、项目选择、依赖解析和同步摘要。
- 增加包详情、更新检查、版本选择、投影差异和同步结果接口。
- 导入响应必须包含 `id`、`version`、`contentHash`、`source`、`package`、`reused` 和依赖检查结果。

## 关联层

Skill、记忆、项目、任务、工作流和 Agent 之间的关联写入独立的 `relations/events.jsonl`，不改写 `memories/ledger.jsonl`。关系边使用统一结构：

```json
{
  "from": { "type": "memory", "id": "..." },
  "to": { "type": "skill", "id": "..." },
  "relation": "supports",
  "source": "explicit|inferred",
  "confidence": 0.85,
  "evidence": { "field": "metadata.tags" },
  "status": "active|revoked|suggested"
}
```

旧记录从 `metadata.project`、任务 `skills`、工作流/任务项目字段、标签和 refs 生成推断关系；推断关系展示为建议，用户确认后才写入显式关系。Context Pack 按任务项目、项目启用 Skill、Skill 关联记忆和任务/工作流关系组装上下文。

## 安全与兼容

- 凭据只保存凭据 ID/环境变量映射，Skill 文件和 API 响应不返回密钥。
- 只允许导入包含合法 `SKILL.md` 或合法 `amh-pack.json` 的目录；拒绝路径穿越。
- 未被 AMH 标记的 Agent 文件只读扫描，不删除、不覆盖。
- 现有单 Skill Registry、`.amh/skills.json`、domain pack 和 Agent 投影保持兼容；没有包清单的现有 Skill 按单元处理。

## 验收标准

- 271 个扫描实例能显示为去重后的逻辑 Skill，并保留来源数量。
- 完全重复内容不重复导入；同名不同内容可比较并共存。
- 导入包时脚本、参考资料、模板和资源完整保留。
- Skill 包可整体启用，也可按包内 Skill 启用。
- 更新、停用、同步、漂移检测和回滚都有明确结果。
- 不覆盖用户-owned 文件，不把密钥写入 Registry 或投影。
