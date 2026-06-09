# AI Memory Hub - 当前问题清单

## 处理进展（2026-06-09）

- 已修复 P0：`dispatch retry --run` 和 `daemon` 会扫描最新 relay 状态，发现 `dispatched` / `acked` / `retrying` 超过 `ackTimeout` 后写入 `failed` 或 `abandoned`，并同步任务诊断 note。
- 已修复 P1：任务型 dispatch 成功完成后会自动标记任务 `done`，失败或超时不会误标完成。
- 已修复 P1：Agent 响应会写入任务 notes；调研/分析/报告类响应会额外保存到 `research-reports/`。
- 已改善 P2：Gemini 已知 warning（skill conflict、true-color、ripgrep fallback）会从主要 `stderr` 错误流中归类为 warnings。
- 已改善 P1：新增 Runner Profile 与 `doctor` 检测，Windows 优先使用 `.cmd` / `.exe`，拒绝只解析到 `.ps1` 的直接 dispatch，并统一用 stdin 传 prompt，避免 PowerShell here-string / `@file` / argv quoting 问题。
- 已改善 P3：daemon 统一使用 dispatch lifecycle 路径，写入 `state/daemon.pid` / `state/daemon-status.json`，支持 `daemon status`、重复启动保护，以及 `Ctrl+C` / `SIGTERM` 优雅退出。
- 已改善 P2：新增 `dispatch progress` / `heartbeat`，长任务可写入进度并通过 `progressAt` 延长超时窗口。
- 已补测试：`npm.cmd test` / `node --test` 覆盖 dispatch 超时标记、relay metrics、progress heartbeat、runner doctor 和 daemon status。
- 仍需后续：更完整架构文档和 Dashboard 视觉验证。

## 🔴 严重问题

### 1. Dispatch 超时检测机制不工作
**问题描述：**
- Codex 调度了 44 分钟，状态还是 "dispatched"
- relay-status.jsonl 只记录状态，没有后台进程检查超时
- `ackTimeout: 300000` (5分钟) 设置了但不生效

**影响：**
- 调度任务卡死后无法自动恢复
- 用户无法知道任务是在执行还是卡死了

**根本原因：**
- `runDispatchJob` 有 `timeout: 10 * 60 * 1000` (10分钟 Node.js 超时)
- 但这个超时是进程级别的，只在 spawnSync 内部生效
- relay-status 只是记录，没有定时检查机制

**需要的修复：**
1. 添加后台超时检测任务（每分钟检查一次 relay-status.jsonl）
2. 如果 `dispatchedAt + ackTimeout < now` 且 state 还是 "dispatched"，标记为 failed
3. 或者在 daemon 中集成超时检测

**建议方案：**
```javascript
// 在 daemon 循环中添加
function checkTimeouts(memoryDir) {
  const statuses = readRelayStatus(memoryDir);
  const now = Date.now();
  
  statuses.forEach(status => {
    if (status.state === 'dispatched') {
      const dispatchTime = new Date(status.dispatchedAt).getTime();
      const timeout = status.ackTimeout || 300000;
      
      if (now - dispatchTime > timeout) {
        // 标记为超时失败
        updateRelayStatus(memoryDir, {
          ...status,
          state: 'failed',
          lastError: 'Timeout: no response within ackTimeout'
        });
      }
    }
  });
}
```

---

## 🟡 中等问题

### 2. Codex 长时间任务无进度反馈
**问题描述：**
- Codex 执行复杂任务时（如调研），可能需要 10+ 分钟
- 用户完全看不到进度，不知道是在执行还是卡死

**建议：**
- 添加心跳机制：Agent 每 30 秒发送一次进度消息
- 或者在 dispatch 时设置更短的超时（2-3分钟），要求 Agent 返回中间结果

### 3. Gemini 警告信息过多
**问题描述：**
- Gemini 每次执行都有大量 "Skill conflict" 警告
- 填充 stderr，影响真正的错误诊断

**建议：**
- 配置 Gemini 忽略 skill conflict 警告
- 或者在 dispatch 时过滤这些已知警告

---

## 🟢 小问题

### 4. 没有调研结果的持久化
**问题描述：**
- Codex 和 Gemini 的调研报告只在 radio 中
- 没有保存到文件或任务的 notes 中

**建议：**
- 在任务完成时，自动将 response 写入任务 notes
- 或者创建调研报告文件（research-reports/）

### 5. 任务状态更新不完整
**问题描述：**
- Codex 和 Gemini 的任务状态还是 "claimed"，没有自动更新为 "completed"
- 需要手动更新

**建议：**
- dispatch 完成后自动更新对应任务状态为 completed
- 或者在 response 中检测任务完成标记

---

## 📋 功能增强建议

### 6. 添加 Web Dashboard
**当前状态：** 
- 只有 CLI 查看状态
- 没有可视化界面

**建议：**
- 实现 `ai-memory-hub app` 启动 Web UI
- 显示实时任务状态、调度进度、工具健康状态

### 7. 添加调研报告模板
**当前状态：**
- 每次调研格式不统一
- 没有结构化输出

**建议：**
- 定义调研报告 JSON Schema
- 使用 structured output 强制格式

---

## 🔧 技术债务

### 8. daemon 没有优雅退出
**问题：**
- daemon 运行时无法优雅停止
- 没有 PID 文件管理

### 9. 缺少单元测试
**问题：**
- 核心功能没有测试
- 重构时容易引入 bug

### 10. 文档不完整
**问题：**
- 没有架构文档
- 没有 troubleshooting 指南

---

## 🎯 优先级排序

**立即修复：**
1. Dispatch 超时检测机制（P0）

**尽快修复：**
2. 任务状态自动更新（P1）
3. 调研结果持久化（P1）

**可以延后：**
4. Web Dashboard（P2）
5. 心跳机制（P2）
6. 其他优化（P3）

---

## 📝 备注

- 今日已完成 20 个功能，21 个 commits
- 多工具协作已验证成功
- Gemini 和 Codex 都能正常响应（修复后）
- 项目核心功能已完整，主要是可靠性和用户体验需要提升
