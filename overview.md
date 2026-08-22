# AMH 后端进化 — 总览

## 已完成（全部实测通过）

| 阶段 | 内容 | 关键产物 |
|------|------|---------|
| Phase 0.1 | detect 缓存（17.8s → 2ms） | `detectCache` 单例 |
| Phase 0.2 | 原子写 + 锁收敛 + 删死代码 | `writeFileAtomic` / `withHubLock` |
| Phase 1.0 | 错误信封 + 请求日志 + 延迟直方图 | `wrapHandler` 外层包裹，`/api/metrics` |
| Phase 1.1 | 后台任务队列 | `backgroundQueue` 单例，`/api/background-tasks*` |
| feature ① | 后台任务/进度中心（前端） | `TasksCenter.tsx`，`/tasks-center` |
| feature ② | 可观测面板（前端） | `Observability.tsx`，`/observability` |
| feature ③ | 数据导入/导出与迁移 | `data-port.js`，`DataPort.tsx`，`/api/data/export|import` |
| feature ④ | 多 runner 并发 dispatch | `runDispatchPool`，`/api/dispatch/pool`，concurrency 控制 |
| Phase 2-a | SQLite schema + 迁移 + 验证 | `sqlite-store.js`，360 tasks / 15 projects / 10 workflows，238ms |
| Phase 2-b | **双写影子模式（已上线运行）** | `sqlite-dualwrite.js`，`sqlite status\|migrate\|resync` CLI |

## Phase 2-b 双写说明（2026-08-19）

- **开启方式**：hub 以 `AMH_SQLITE_DUALWRITE=1 node --experimental-sqlite src/index.js app` 启动即开；不带则完全 no-op（零影响，已验证）。
- **覆盖路径**：实体写/单条 upsert/单条删除 + dashboard purge（直接重写文件的旁路也补了钩子）。
- **收敛语义**：`mirrorSync` 全量收敛——每次全量写会 upsert 全部行并删除 JSONL 侧已消失的行（实测自愈了探针漏删的脏行）。
- **实测**：create / status 更新 / cancel / purge 全生命周期即时镜像，SQLite 与 JSONL 收敛到 360 行一致，零报错。
- **失败语义**：镜像失败只记 stderr，绝不影响 JSONL 主路径。


## 评估后不实施

| 阶段 | 原因 |
|------|------|
| Phase 1.2（路由表抽取） | 中间件已由 Phase 1.0 覆盖；80+ if/else → routes 表是纯代码重组，无功能收益，高风险 |

## 后续（需用户确认）

- **读切换**：双写影子运行稳定后（建议 1–2 周），dashboard 读路径改走 SQLite，JSONL 仍是真相源。
- **停写 JSONL**：读切换稳定后再评估。
- **注意**：工作区现有另一 agent 的角色系统改动（agent/role 注册表 + 若干 .mjs 脚本，未提交），提交时需区分归属。

## 约束

- 全部改动 **未 commit / push**（等用户授权）。
- 所有新增模块均通过 `node --check` 语法闸门。
- 前端均通过 `tsc -b` 类型检查（0 错误）。
