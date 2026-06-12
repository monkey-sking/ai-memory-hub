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
