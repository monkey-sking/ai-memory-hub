# AI Memory Hub 知识沉淀分层规范

## 目的

记忆用于保留事实和证据，不能无限承载所有长期规则。稳定、可复用、需要被 Agent 主动执行的内容，应从记忆候选中审核后发布为结构化知识资产。

## 分类与归属

| 类型 | 回答的问题 | 典型内容 | 归属 |
| --- | --- | --- | --- |
| Preference | 用户长期喜欢什么 | 文案语气、飞书固定原址更新、不要重复建文档 | 全局 Preference |
| Project Policy | 这个项目必须遵守什么 | UI 信息架构、审核边界、Agent 命名、提交安全 | 项目 Policy |
| UX Policy | 用户界面和操作应当怎样 | 列表/弹窗、筛选单多选、加载反馈、可读文案 | 项目 Policy 的 UX 子域 |
| Skill | Agent 如何完成一类专业工作 | 飞书文档编辑、逆向证据提取、后台页面验收 | 可复用 Skill Registry |
| Playbook | 一件事按什么步骤执行 | PRD 编写流程、发布前检查、调研到交付 | Skill 附带的可执行流程 |
| Quality Gate | 什么时候算通过 | 测试、人工审核、高风险操作、性能指标 | Policy / Workflow Gate |
| Memory | 最近发生了什么、依据是什么 | 用户纠错、项目事实、一次任务的证据 | 原始记忆与候选记录 |

## UI/UX 规则的落点

后台界面和用户操作规范统一归入 `Project Policy → UX Policy`。当前权威文件是 [`dashboard-console-standard.md`](./dashboard-console-standard.md)，涵盖：

- 页面信息架构与内容布局选择；
- 列表、弹窗、筛选、加载、错误和空状态；
- 面向人类的文案与内部字段隐藏；
- 普通 Agent 流转与高风险人工审核边界；
- 首屏加载、懒加载和列表/详情分离；
- UI 改动的验收清单。

其中反复跨项目出现、可以独立执行的内容，再提炼为 UX Skill 或 Playbook，例如“后台页面重构验收”“列表详情弹窗设计”“飞书 PRD 图文结构化编写”。不能把某个页面的临时布局决定直接升级为全局 Preference。

## 生命周期

```text
原始记忆/任务反馈 → 候选提炼 → 人工审核 → 归类与定范围 → 版本化发布 → Agent/项目启用
                                          ↓
                                  冲突、过期、撤销、回滚
```

候选必须保留来源、证据、适用范围、置信度和审核人。发布后的资产拥有版本和状态（draft、active、deprecated、rejected），原始记忆仍保留作为证据，不再承担每次启动都加载的全部规则。

## 当前项目盘点

- `docs/dashboard-console-standard.md`：当前 UI/UX 权威规范。
- `docs/policy-packs-execution-personas.md`：Agent 执行人格和权限策略，属于 Policy Pack，不是用户偏好。
- `docs/quality-gate-rules.md`：测试、审核和停止条件，属于 Quality Gate。
- `docs/approval-gates-design.md`、`docs/permission-policy-layer-design.md`：高风险操作治理规范。
- `docs/shared-skill-layer.md`：跨 Agent 的共享协作 Skill 合约。
- `docs/dashboard-ui-redesign-plan.md`：历史实施计划，只记录改造过程，不作为当前视觉规范；与权威规范冲突时以后者为准。

## 以后提炼规则

1. 个人偏好进入全局 Preference；项目交互规则进入项目 UX Policy。
2. 同一规则被两个以上项目复用，或需要 Agent 按步骤执行，才升级为共享 Skill/Playbook。
3. 仅一次性的意见、临时状态和未确认想法留在 Memory，不直接发布。
4. 规则发生冲突时按范围优先：会话临时规则 > 项目 Policy > 全局 Preference；同层按版本和人工决议处理。
5. 任何自动提炼都只能生成候选，不能绕过人工审核直接改变 Agent 行为。
