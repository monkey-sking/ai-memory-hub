# PowerContext vs AMH — 能力版本对照表

> 用途：按"哪个版本落地了哪块能力"对齐 OceanBase **PowerContext**（开源，2026-07-06 init）与本项目 **AI Memory Hub / AMH**（2026-06-04 init）。
> 数据来源：AMH `CHANGELOG.md` + `git log`；PowerContext `README.md` + `openapi/powercontext.yaml` + 仓库 commit 时间线。
> 结论先行：**AMH 早动手约 1 个月、在编排/角色/Windows/可视化上领先；PowerContext 在边界化 recall、证据链、传输协议(MCP/OpenAPI)、基准评测上领先。**

---

## 一、时间轴对齐

| 日期 | AMH | PowerContext |
|---|---|---|
| 2026-06-04 | 首个 commit `Initial ai memory hub`（你起步） | — |
| 2026-06-09 | **0.1.0**：核心（Handoff / Context Packs / 3 runner / Recipes） | — |
| 2026-06-11 | **0.2.0**：Hermes Agent 集成 | — |
| 2026-07-06 | — | 仓库 init `feat: init powercontext`（核心能力即具备；商业前身 PowerMem 更早） |
| 2026-07-13 | **0.3.0**：Dashboard 重构 / 策略层 / 审批门 / FTS5 / 守护进程 | — |
| 2026-07 ~ 08 | — | 集成陆续补齐：openclaw / opencode / pi / pydantic-ai / langchain / langgraph |
| 2026-08 | **Unreleased（内部称 v2.x）**：SQLite 双写 / 角色团队 / CodeBuddy runner | 持续迭代 + 基准跑分公布 |
| 2026-08-28 | 双方均活跃（AMH 当天还在重构 v2.4） | 当天还在发 docs/集成修复 |

> 说明：AMH `package.json` 仍写 `0.1.0`，但 CHANGELOG 已到 0.3.0 + Unreleased 存储层 v2.4。**版本号未随能力推进 bump**——转发或对外引用时以 CHANGELOG 段落为准，勿用 package.json 的 0.1.0。

---

## 二、能力逐项对照

| # | 能力域 | AMH 能力 | AMH 落地版本（日期） | PowerContext 等价能力 | PowerContext 状态 | 差距判断 |
|---|---|---|---|---|---|---|
| 1 | 跨工具记忆中枢 | `events.jsonl` 记忆事件流 + `ledger` 生命周期 | 0.1.0（06-09） | Memory：`remember` / `revise` / `retire`，修订保留历史 | init 即具备（07-06） | **持平**（AMH 早 1 月） |
| 2 | 请求时边界化 recall | Context Packs（任务相关记忆包） | 0.1.0（06-09） | `PreparedContext`：schema 校验 + **8000B 字节预算**，失败不阻塞 | init 即具备 | **AMH 落后**（无字节预算/无 schema 校验 → 上下文膨胀风险） |
| 3 | 交接 / Handoff | Session Handoff → Handoff Bus 同步模型 | 0.1.0 / 0.3.0（07-13） | Handoff：`prepare`/`commit`/`continue`，含 objective/state/next_action/evidence | init 即具备 | **持平** |
| 4 | 证据链 / Source lineage | 无独立 Source 概念（radio/events 近似） | — | Source：内容寻址 `source_id`，Memory/Artifact 精确引用 | init 即具备 | **AMH 落后**（缺可追溯出处） |
| 5 | Skill / Experience 治理 | Approval Gates + Quality Gate + 守护进程自改 skill | 0.3.0（07-13） | Candidate→review→不可变修订；Skill 须显式导出，不能自批 | init 即具备 | **AMH 部分**（有审批门，但无 Candidate 评审流水线） |
| 6 | 多 agent 编排 | Workflow Recipes + Scheduler + 守护进程 + 6 runner | 0.1.0 / 0.3.0 | 无编排，仅 runtime + MCP | — | **AMH 领先** |
| 7 | 角色 / 团队系统 | roles / teams / agent persona + Dashboard `/roles` | Unreleased（08） | 无（聚焦记忆本身） | — | **AMH 领先** |
| 8 | Dashboard / 可视化 | React+TS SPA、工作流图、搜索分析 | 0.3.0（07-13） | 无独立 Dashboard（借 host UI） | — | **AMH 领先** |
| 9 | 存储后端 | JSONL 单写 + SQLite 双写（影子） | Unreleased（08，v2.x） | SQLite 本地 / **OceanBase 团队版** | init 即具备 | **持平**（PC 有团队级 OceanBase，AMH 无） |
| 10 | 传输 / 集成协议 | 文件锁 + RPC + Dashboard HTTP API | 0.1.0 起 | **Streamable HTTP MCP (`/mcp`)** + OpenAPI + OpenTelemetry | init 即具备 | **AMH 落后**（无 MCP / 无 OpenAPI 契约） |
| 11 | 官方集成覆盖 | codex/claude/gemini/antigravity/opencode/mimocode/workbuddy/hermes/codebuddy | 0.1.0 ~ Unreleased | codex/claude-code/dsh/hermes/openclaw/opencode/pi/workbuddy/Bub/PydanticAI/LangChain/LangGraph | 7–8 月补齐 | **持平**（各有侧重，重叠 4–5 个） |
| 12 | 基准评测 | 无 | — | LoCoMo 准确率 + SWE-bench Pro v2（82.35%→86.73%，+4.38pt） | 08 公布 | **AMH 落后**（无自证评测） |
| 13 | 平台 | Windows / Linux / macOS（Node ≥24） | 0.1.0 起 | **仅 macOS / Linux**（uv + Python 3.11+） | init 即具备 | **AMH 领先**（Windows 原生是护城河） |
| 14 | 安全 / 隐私 | `looksSensitive` 正则 + 隐私安全 GitHub 备份 | 0.3.0（07-13） | 可选 Bearer 鉴权，loopback 才接受明文 HTTP | init 即具备 | **持平** |

---

## 三、三句话结论

1. **你起步更早、路线独立**：AMH（06-04）比 PowerContext 开源（07-06）早约 1 个月；OceanBase 商业侧 PowerMem 更早，但两边是各自独立做出"本地跨 agent 记忆中枢"。
2. **AMH 的护城河**：Windows 原生、6-runner 多 agent 编排、角色/团队系统、Dashboard 可视化、已深度接你自己的 Feishu/日报——这些 PowerContext 现在都没有。
3. **该抄的作业（P0）**：① 带字节预算的边界化 recall（替代整段 `MEMORY.md` 注入）；② Source→Memory 内容寻址证据链；③ 暴露一层 **MCP / OpenAPI** 给 WorkBuddy 直接调；④ 给 Skill 加 Candidate 评审流水线（与你现有审批门习惯一致）。

---

## 四、附：AMH 版本能力速查

- **0.1.0（2026-06-09）** — 11 项核心：Session Handoff、Context Packs、RPC、通知总线、Workflow Recipes、异步状态机、调度队列、3 runner（Codex/Claude/Gemini）、35+ 工具预配置、FTS5 前的检索、自动更新。
- **0.2.0（2026-06-11）** — Hermes Agent 集成 + cron 同步。
- **0.3.0（2026-07-13）** — Dashboard 重构（React/TS）、工作流节点、策略层、审批门、质量门、守护进程、CDP 桥、FTS5 全文检索、Handoff Bus、备份归档、Coze/MiMo Code、安全扫描。
- **Unreleased / 内部 v2.x（2026-08）** — SQLite 双写（真相源）、`memory-store` / `event-writer` 单写收口、命令按功能抽出单体（v2.3/v2.4）、角色/团队/agent persona、Dashboard `/roles`、CodeBuddy runner。
