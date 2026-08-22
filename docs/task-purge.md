# Task Purge 功能文档

## 概述

`task purge` 命令用于物理删除任务记录，主要用于清理敏感信息或测试数据污染的场景。这是一个危险操作，需要多重安全确认。

## 使用场景

- **敏感信息泄露**：任务描述或笔记中意外包含了密码、密钥等敏感信息
- **测试数据污染**：开发测试时创建的大量无效任务需要清理
- **误创建任务**：错误创建的任务需要彻底删除而非仅标记为取消

## 命令格式

```bash
ai-memory-hub task purge --id <task-id> --confirm <task-title>
```

### 参数说明

- `--id <task-id>`：要删除的任务 ID（必需）
- `--confirm <task-title>`：任务标题的完整文本，用于二次确认（必需）
- `--force`：强制删除非 cancelled 状态的任务（不推荐，慎用）

## 安全机制

### 1. 状态检查

默认情况下，只能删除状态为 `cancelled` 的任务。如果尝试删除其他状态的任务，会收到错误提示：

```bash
Cannot purge task with status 'open'. Only 'cancelled' tasks can be purged.
Use --force to override (not recommended).
```

### 2. 标题确认

必须在 `--confirm` 参数中输入完整的任务标题。如果标题不匹配，命令会失败并显示提示：

```json
{
  "error": true,
  "message": "Confirmation failed. You must type the exact task title to confirm deletion.",
  "taskId": "d599e0e5db8b3ed0",
  "taskTitle": "Test task for purge feature",
  "hint": "Run: ai-memory-hub task purge --id d599e0e5db8b3ed0 --confirm \"Test task for purge feature\""
}
```

### 3. 自动备份

删除前会自动创建带时间戳的备份文件：

- `events.jsonl.backup.<timestamp>`：事件存储的备份
- `tasks.jsonl.backup.<timestamp>`：投影文件的备份

如果删除操作失败，备份会自动恢复。

### 4. 删除日志

所有删除操作都会记录到 `~/.ai-memory/tasks/purge.log`：

```json
{
  "ts": "2026-06-15T04:45:55.851Z",
  "action": "purge",
  "taskId": "d599e0e5db8b3ed0",
  "taskTitle": "Test task for purge feature",
  "taskStatus": "cancelled",
  "eventsBackup": "events.jsonl.backup.2026-06-15T04-45-55-810Z",
  "projectionBackup": "tasks.jsonl.backup.2026-06-15T04-45-55-810Z",
  "eventCountBefore": 485,
  "eventCountAfter": 483,
  "removedEvents": 2
}
```

### 5. 原子性写入

使用临时文件 + rename 的方式确保写入操作的原子性，避免文件损坏。

## 使用示例

### 正常流程

```bash
# 1. 创建任务
ai-memory-hub task add "Sensitive data cleanup" --from claude --priority high

# 2. 任务包含敏感信息，需要彻底删除 - 先取消
ai-memory-hub task update --id abc123 --status cancelled

# 3. 物理删除（需要输入完整标题确认）
ai-memory-hub task purge --id abc123 --confirm "Sensitive data cleanup"
```

### 成功输出

```json
{
  "success": true,
  "message": "Task purged successfully",
  "taskId": "d599e0e5db8b3ed0",
  "taskTitle": "Test task for purge feature",
  "backups": {
    "events": "<user-home>/.ai-memory/tasks/events.jsonl.backup.<timestamp>",
    "projection": "<user-home>/.ai-memory/tasks/tasks.jsonl.backup.<timestamp>"
  },
  "purgeLog": "<user-home>/.ai-memory/tasks/purge.log"
}
```

## 恢复删除的任务

如果误删除，可以从备份文件恢复：

```bash
# 找到最新的备份文件
cd ~/.ai-memory/tasks
ls -lt *.backup.*

# 恢复事件存储
cp events.jsonl.backup.2026-06-15T04-45-55-810Z events.jsonl

# 恢复投影文件（可选，会从 events.jsonl 自动重建）
cp tasks.jsonl.backup.2026-06-15T04-45-55-810Z tasks.jsonl
```

## 注意事项

1. **删除是永久性的**：虽然有备份，但不要依赖备份恢复，删除前请仔细确认
2. **仅删除 cancelled 任务**：这是设计上的安全限制，强制使用 `--force` 会绕过此限制但不推荐
3. **备份文件管理**：备份文件不会自动清理，需要定期手动清理旧备份
4. **并发安全**：使用文件锁机制保证并发安全，但仍建议避免并发执行 purge 操作
5. **仅删除任务记录**：purge 只删除任务本身，不会删除相关的 radio 消息、workflow 等关联数据

## 实现细节

### 数据结构

任务数据存储在两个地方：

1. **事件存储** (`~/.ai-memory/tasks/events.jsonl`)：所有任务变更事件的 append-only 日志
2. **投影文件** (`~/.ai-memory/tasks/tasks.jsonl`)：从事件存储物化的当前任务状态快照

### 删除流程

1. 读取所有事件
2. 过滤掉目标任务的所有事件
3. 原子性写入新的事件文件
4. 重新物化投影文件
5. 记录删除日志

### 文件锁

使用 `withHubLock` 函数在 `~/.ai-memory/locks/` 目录创建文件锁，防止并发写入冲突。

## 与其他命令的区别

| 命令 | 效果 | 可恢复性 | 用途 |
|------|------|----------|------|
| `task update --status cancelled` | 标记任务为取消状态 | 完全可逆 | 正常取消任务 |
| `task purge` | 物理删除任务记录 | 需要从备份恢复 | 清理敏感数据或测试污染 |

## 未来改进

- [ ] 自动清理超过 N 天的备份文件
- [ ] 批量 purge 支持（按项目、按状态）
- [ ] purge 预览模式（dry-run）
- [ ] 关联数据清理（可选删除相关 radio 消息、workflow）
