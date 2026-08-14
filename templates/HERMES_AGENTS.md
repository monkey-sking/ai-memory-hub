# Hermes Agent Integration

Place this file at `~/.hermes/AGENTS.md` or merge into your existing one.

## ai-memory-hub 集成

### Memory 读写

写入持久记忆到共享收件箱：
```json
{"source":"hermes","text":"memory content","metadata":{"kind":"preference|project|workflow|correction"}}
```

追加到 `~/.ai-memory/inbox/events.jsonl`，由 30 分钟一次的 cron 自动同步。

### 任务管理

```bash
ai-memory-hub task list --status active
ai-memory-hub task add "title" --description "..." --from hermes --project <project> --priority normal
ai-memory-hub task claim --id <task-id> --by hermes
ai-memory-hub task done --id <task-id> --by hermes
ai-memory-hub task note --id <task-id> "handoff note" --by hermes
```

### 任务收尾自动归档（每次任务结束必须执行）

任务完成/失败/放弃时，收尾三件套（顺序执行，缺一不可）：

```bash
# 1. 任务状态落库（含交接说明）
ai-memory-hub task done --id <task-id> --by hermes
#   失败/放弃用 task note 写清原因和下一步，不要只标 done

# 2. 结论归档到共享记忆（含关键产物路径，让别人/别的 agent 能接续）
ai-memory-hub record "任务结论摘要（结论先行）" \
  --source hermes --kind workflow --project <project> \
  --task <task-id> --tags 产物路径

# 3. 需要其他 agent 关注时发 radio
#    {"source":"hermes","from":"hermes","to":"all","type":"note","text":"..."}
```

**归档内容要求**：结论 + 关键产物绝对路径（文件/DB/URL）+ 未完成事项。宁可多写一行产物路径，不要只写"已完成"。

### 并发任务隔离（Git worktree）

多个 agent 需要同时改同一个项目时，用 AMH 开隔离 worktree，改完再合并，互不干扰：

```bash
ai-memory-hub worktree add /path/to/repo --name <task-name> --branch feat/<task-name>
# → 返回隔离工作区路径，在那边改，不要碰主工作区
ai-memory-hub worktree rm /path/to/repo/.ai-worktrees/<task-name>  # 合并完清理
ai-memory-hub worktree list  # 查看当前所有隔离工作区
```

### 跨 Agent 通信 (Radio)

```json
{"source":"hermes","from":"hermes","to":"all","type":"note","text":"message"}
```

追加到 `~/.ai-memory/radio/messages.jsonl`。

### Cron 同步

建议添加定时同步：
```bash
hermes cron create --schedule "every 30m" \
  --script "~/.hermes/scripts/ai-memory-hub-sync.sh" \
  --no-agent \
  --deliver local \
  --name "ai-memory-hub 记忆同步"
```

同步脚本内容：
```bash
#!/bin/bash
cd /opt/homebrew/bin && ./ai-memory-hub sync 2>/dev/null
```

### 共享记忆快照

读取当前快照：
```bash
cat ~/.ai-memory/MEMORY.md
```

通过 ai-memory-hub 搜索：
```bash
ai-memory-hub search <query> --limit 10
```
