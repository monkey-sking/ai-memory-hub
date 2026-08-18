# AMH 后端「全面进化」研判结论

> 会议形式：DesignEngineTeam 主理人统筹，三个视角并行研判（架构/API、数据层/持久化、性能/可观测/daemon），结论先行，所有痛点均已在真实代码中核对。

## 结论先行

**现在就该开始，但"全面进化"必须分阶段、以真实痛点为锚，不是推倒重写。**

前端刚收拾干净（19 路由对齐 proto-next 骨子），后端是下一处瓶颈。而且后端现在有三处会咬人的 **P0**，应先止血再进化：

1. `/api/detect` 实测 **17.8s** 全量同步阻塞 HTTP 主线程；
2. 整文件 `writeFileSync(JSON)` **非原子覆盖写**（index.js 至少 10 处），崩溃即损坏；
3. `credentials.js`/`domain-packs.js`/`agent-wake-service.js` 三条裸写**绕过 `hub.lock`**，多写者（CLI/daemon/HTTP/前端）并发会撕裂数据。

---

## 三视角研判（已核对真实代码）

### 视角一：架构与 API 框架
- **现状**：`src/index.js` 第 8355 行起 `http.createServer` 手搓服务，端口 38787、仅绑 127.0.0.1 回环；路由是 ~600 行 `if/else` + `url.pathname` 手撕；无中间件、无统一错误包、无请求日志。API 模块虽已拆到 `src/dashboard/*.js`（`createDashboardXxxApi(config)`），但请求处理仍在巨石内。
- **痛点**：P0 巨石不可测、P0 无统一错误信封、P1 handler 与领域逻辑耦合、P1 无可观测性。
- **建议**：继续手搓、**零新依赖**，抽极薄路由表 `routes=[{method,pattern,handler}]` + `sendEnvelope({ok,data,error,code})` + 3 个中间件（日志 / readJson / try-wrap）。只搬家不改逻辑。

### 视角二：数据层与持久化
- **现状**：真相源全为 JSON/JSONL（`ledger.jsonl`、`tasks.jsonl`、`radio/messages.jsonl`、`credentials/profiles.json`、`config.json` 等）；SQLite 仅用于 `search-index.db`（派生索引）和只读 `cc-switch.db`。写入靠 `withHubLock`（单一全局锁）串行化，但 `file-locks.js` 的 `FileLock` **是死代码从未被引用**，且三条裸写绕过 `hub.lock`。
- **痛点**：P0 整文件 JSON 非原子写、P0 裸写绕过锁并发撕裂、P1 JSONL 全量重放线性退化、P1 无事务。
- **建议**：两阶段、**不为统一而统一**。A（零 schema）整文件 JSON 改 `tmp→fsync→rename` 原子写，裸写复用 `hub.lock`；B（按需）仅把频繁更新且有 merge 的实体（tasks/projects/workflows/tool-declarations）升 SQLite 真相源，追加日志型（ledger/radio/wake/registry）保留 JSONL 作审计。

### 视角三：性能、可观测与 daemon
- **现状**：`/api/detect` 走 `getDashboardDetection→refreshDetectedTools→detectTools`，强制每次全量刷新，不命中已有的 `getCachedDetectedTools`；`getInstallTargets()` 在无缓存情况下被重复执行 ~58 次（每次 `fs.readFileSync` 读模板），`getToolRunner` 又对每个工具 `spawnSync('where.exe')` 串行探测 PATH。daemon 有单实例锁/健康/监督骨架，但无统一后台任务队列。可观测：313 处 `console.log`、无结构化日志、无请求日志、无 tracing。
- **痛点**：P0 detect 17.8s 阻塞、P0 慢操作（sync/prune/backup）无后台模型、P1 无可观测性。
- **建议**：detect 改缓存 + 增量 + 后台任务 + 进度回报；sync/prune/backup 复用同一任务队列；可观测最小闭环（HTTP 请求日志 + 结构化日志 + 复用现有 `/api/metrics` 加 HTTP 延迟直方图）。

---

## 分阶段路线图

### Phase 0 — 止血（P0，低风险，数天内可上）
1. **detect 17.8s → 秒级**：默认走 `getCachedDetectedTools()`（代码已在 `index.js:9411`，且 `:1407` 已用），加 `?refresh=1` 才全量；把 `getInstallTargets()` 提到 ~58 次循环外只调一次。零新依赖。
2. **写盘原子化 + 锁收敛**：新增 `writeFileAtomic`（tmp→fsync→rename，0o600）替换 `index.js` 内 10 处整文件覆盖写；三条裸写用 `hub.lock` 包裹；删除死代码 `file-locks.js` 的 `FileLock`。

### Phase 1 — 骨子升级（P1，让后端可进化）
3. **路由表 + 错误信封 + 3 中间件**：把 600 行 if 链搬家成 `routes` 表，handler 统一 `(ctx)=>data`。零新依赖，不改任何 handler 逻辑。
4. **可观测闭环**：HTTP 请求日志（方法/路径/耗时/状态）+ 结构化日志替裸 `console.log` + 现有 `/api/metrics` 加 HTTP 延迟直方图。
5. **后台任务队列**：detect/sync/prune/backup 统一进一个轻量任务模型，带进度回报（前端已有 SplitRow 事件流可接）。

### Phase 2 — 持久化演进（P2，按需、不为统一而统一）
6. 仅把频繁更新且有 merge 的实体（tasks/projects/workflows/tool-declarations）升 SQLite 真相源；追加日志型（ledger/radio/wake/registry）保留 JSONL 审计；fts5 已有先例，索引改增量。其余 JSONL 不动。

---

## 明确的「不做」（避免过度设计）
- **不引 Express/Fastify** —— 继续手搓，零新依赖，路由表已够。
- **不做多租户 / 远端鉴权** —— 当前仅回环（127.0.0.1），非痛点；等真要远程再议。
- **不重写 index.js 全部逻辑** —— 只抽路由层，领域逻辑原地保留，降低回归风险。

## 是否现在开始
**建议现在就从 Phase 0 第 1 项（detect 17.8s）动手** —— 它风险最低、收益最显、且代码路径已验证存在（缓存函数与 `?refresh` 机制都在）。打完这一针，再依次推进原子写与路由层。

## 验证基线（本次会议已实测）
- `tsc -b` / `vite build` 绿；19 页主 GET 端点后端实测全 200。
- `/api/detect` 17.8s、`/api/capabilities` 0.49s、其余秒级。
- `getCachedDetectedTools` / `refreshDetectedTools` / `getInstallTargets` / `enrichToolConnection` 均在真实代码中。
- `file-locks.js` 的 `FileLock` 全仓无引用 = 死代码。
- 整文件 `writeFileSync(JSON)` 非原子覆盖写在 index.js 内 ≥10 处。
