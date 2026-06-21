# AI Memory Hub - 使用和验证指南

**日期:** 2026-06-21  
**版本:** 0.1.0

## 快速开始

### 1. 安装

```bash
# 全局安装（推荐）
npm install -g ai-memory-hub

# 或本地安装
cd ai-memory-hub
npm install
npm link
```

### 2. 初始化

```bash
# 初始化 AI Memory Hub
ai-memory-hub init

# 检查状态
ai-memory-hub status
```

## 核心功能验证

### 功能 1: 任务管理

```bash
# 创建任务
ai-memory-hub task add "实现用户认证" \
  --from claude \
  --project demo-project \
  --priority high

# 列出任务
ai-memory-hub task list --status active

# 认领任务
ai-memory-hub task claim --id <task-id> --by claude

# 完成任务
ai-memory-hub task done --id <task-id> --by claude
```

**预期结果:**
- 任务创建成功，返回 task ID
- 任务列表显示新任务
- 认领后 assignee 更新
- 完成后 status 变为 done

### 功能 2: 共享内存

```bash
# 写入记忆（通过 inbox）
echo '{"source":"claude","text":"用户认证使用 JWT","metadata":{"kind":"project"}}' >> ~/.ai-memory/inbox/events.jsonl

# 同步记忆
ai-memory-hub sync

# 搜索记忆
ai-memory-hub search "认证" --limit 5

# 查看所有记忆
ai-memory-hub memory list
```

**预期结果:**
- 记忆写入 inbox
- sync 后记忆出现在 ledger
- 搜索返回相关记忆

### 功能 3: Radio 消息

```bash
# 发送消息
ai-memory-hub radio send \
  --from claude \
  --to codex \
  --text "请帮忙 review PR #123" \
  --type note

# 列出消息
ai-memory-hub radio list --limit 10

# 过滤消息
ai-memory-hub radio list --from claude --to codex
```

**预期结果:**
- 消息写入 radio/messages.jsonl
- list 显示消息历史
- 过滤正确工作

### 功能 4: 工作流

```bash
# 创建工作流
ai-memory-hub workflow create "Feature Implementation" \
  --from claude \
  --project demo-project \
  --planner claude \
  --executor codex \
  --reviewer gemini

# 列出工作流
ai-memory-hub workflow list --status active

# 启动工作流
ai-memory-hub workflow start --id <workflow-id> --by claude

# 提交结果
ai-memory-hub workflow result --id <workflow-id> \
  --role executor \
  "Implementation complete" \
  --by codex
```

**预期结果:**
- 工作流创建成功
- 状态正确跟踪
- 角色分配正确

### 功能 5: Dispatch 分发

```bash
# 分发任务
ai-memory-hub dispatch --to codex --project demo-project

# 检查分发状态
ai-memory-hub relay status
```

**预期结果:**
- dispatch 创建任务分发记录
- relay status 显示分发状态

### 功能 6: 工具检测

```bash
# 检测所有工具
ai-memory-hub detect

# 检测特定工具
ai-memory-hub detect | grep vscode
```

**预期结果:**
- 显示已安装的 AI 工具
- VS Code 显示增强信息（版本、扩展）

### 功能 7: Policy 权限

```bash
# 列出策略
ai-memory-hub policy list

# 显示策略详情
ai-memory-hub policy show --actor claude --operation modify-files

# 添加策略
ai-memory-hub policy add \
  --actor claude \
  --operation push \
  --decision ask \
  --reason "需要确认推送操作"
```

**预期结果:**
- 策略列表正确显示
- 策略决策按优先级生效

## 高级功能验证

### CDP Bridge（WebSocket 服务器）

**启动 CDP Bridge:**

```bash
# Terminal 1: 启动 CDP Bridge
npm run cdp-bridge
```

**测试客户端:**

```javascript
// test-client.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:9222');

ws.on('open', () => {
  console.log('Connected to CDP Bridge');

  // 注册
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'AMH.register',
    params: { tool: 'test-client', version: '1.0.0' }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('Received:', msg);

  if (msg.id === 1) {
    // 创建任务
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'AMH.task.create',
      params: {
        title: 'Test task from WebSocket',
        project: 'test',
        priority: 'normal'
      }
    }));
  } else if (msg.id === 2) {
    console.log('Task created:', msg.result);
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('Error:', error);
});
```

运行测试：
```bash
node test-client.js
```

**预期结果:**
- 连接成功
- 注册成功
- 任务创建成功
- 收到响应

### 文件锁测试

```javascript
// test-locks.js
const { withLock } = require('./src/file-locks.js');

async function test() {
  console.log('Testing file locks...');

  // 测试 1: 基本锁
  await withLock('test-resource', async () => {
    console.log('✓ Lock acquired');
    await new Promise(r => setTimeout(r, 100));
    console.log('✓ Lock will be released');
  });

  // 测试 2: 并发锁（应该等待）
  console.log('Testing concurrent locks...');
  
  const promise1 = withLock('concurrent-test', async () => {
    console.log('✓ Lock 1 acquired');
    await new Promise(r => setTimeout(r, 2000));
    console.log('✓ Lock 1 released');
  });

  // 稍后尝试获取同一个锁
  await new Promise(r => setTimeout(r, 500));
  
  const promise2 = withLock('concurrent-test', async () => {
    console.log('✓ Lock 2 acquired (after waiting)');
  });

  await Promise.all([promise1, promise2]);
  console.log('✓ All tests passed');
}

test().catch(console.error);
```

运行：
```bash
node test-locks.js
```

**预期结果:**
- Lock 1 先获取
- Lock 2 等待 Lock 1 释放
- 最终都成功

### VS Code 扩展生成器测试

```bash
# 生成扩展
node scripts/generate-vscode-extension.js \
  --name test-amh-ext \
  --display-name "Test AMH Extension" \
  --publisher test-publisher \
  --output ./test-extensions

# 进入生成的扩展目录
cd test-extensions/test-amh-ext

# 安装依赖
npm install

# 打开 VS Code
code .

# 按 F5 启动 Extension Development Host
```

**预期结果:**
- 扩展目录生成成功
- package.json 正确
- extension.js 语法正确
- VS Code 可以加载扩展
- 命令出现在 Command Palette

### 反过度工程检查测试

```bash
# 检查当前项目
npm run review:overengineering

# 检查特定路径
node scripts/review-overengineering.js --path src/ --verbose
```

**预期结果:**
- 报告文件大小和复杂度
- 标记潜在的过度工程
- 提供优化建议

### Policy Packs 测试

```bash
# 查看可用的 policy packs
ls ~/.ai-memory/policy/packs/

# 查看 conservative-reviewer pack
cat ~/.ai-memory/policy/packs/conservative-reviewer.json

# 验证 policy pack 结构
node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME + '/.ai-memory/policy/packs/conservative-reviewer.json', 'utf-8')))"
```

**预期结果:**
- 显示 4 个内置 packs
- JSON 结构正确
- 策略定义完整

## 集成测试场景

### 场景 1: 完整工作流

```bash
# 1. 启动 CDP Bridge
npm run cdp-bridge &

# 2. 创建任务
TASK_ID=$(ai-memory-hub task add "Implement login API" \
  --from claude \
  --project auth-service \
  --priority high \
  | grep '"id"' | cut -d'"' -f4)

echo "Created task: $TASK_ID"

# 3. 认领任务
ai-memory-hub task claim --id $TASK_ID --by claude

# 4. 发送 radio 通知
ai-memory-hub radio send \
  --from claude \
  --to all \
  --text "Started working on $TASK_ID"

# 5. 写入记忆
echo "{\"source\":\"claude\",\"text\":\"Login API uses JWT with 1h expiry\",\"metadata\":{\"kind\":\"project\",\"project\":\"auth-service\"}}" >> ~/.ai-memory/inbox/events.jsonl

# 6. 同步记忆
ai-memory-hub sync

# 7. 完成任务
ai-memory-hub task done --id $TASK_ID --by claude

# 8. 验证
ai-memory-hub task list --status done | grep $TASK_ID
ai-memory-hub search "JWT" | grep "Login API"
```

**预期结果:**
- 所有步骤成功执行
- 任务状态正确更新
- 记忆可搜索到
- Radio 消息已记录

### 场景 2: 多工具协作

```bash
# Terminal 1: Claude 创建任务
ai-memory-hub task add "Review security policy" \
  --from claude \
  --project security \
  --priority high

# Terminal 2: Codex 认领任务
TASK_ID=$(ai-memory-hub task list --status active | grep '"id"' | head -1 | cut -d'"' -f4)
ai-memory-hub task claim --id $TASK_ID --by codex

# Terminal 1: Claude 发送消息
ai-memory-hub radio send \
  --from claude \
  --to codex \
  --text "请优先处理安全相关的任务"

# Terminal 2: Codex 完成任务
ai-memory-hub task done --id $TASK_ID --by codex

# Terminal 2: Codex 回复
ai-memory-hub radio send \
  --from codex \
  --to claude \
  --text "安全策略已 review 完成"
```

**预期结果:**
- 跨终端任务协作成功
- Radio 消息双向通信
- 任务状态同步更新

## 性能测试

### 大量任务测试

```bash
# 创建 100 个任务
for i in {1..100}; do
  ai-memory-hub task add "Task $i" \
    --from claude \
    --project perf-test \
    --priority normal
done

# 列出所有任务（测试查询性能）
time ai-memory-hub task list --status active --project perf-test

# 批量完成任务
ai-memory-hub task list --status active --project perf-test \
  | grep '"id"' \
  | cut -d'"' -f4 \
  | while read task_id; do
      ai-memory-hub task done --id $task_id --by claude
    done
```

**预期结果:**
- 任务创建成功
- 查询速度合理（< 1s）
- 批量操作正常

### 内存搜索性能

```bash
# 创建 1000 条记忆
for i in {1..1000}; do
  echo "{\"source\":\"claude\",\"text\":\"Memory entry $i for performance testing\",\"metadata\":{\"kind\":\"project\"}}" >> ~/.ai-memory/inbox/events.jsonl
done

# 同步
time ai-memory-hub sync

# 搜索
time ai-memory-hub search "performance" --limit 10
```

**预期结果:**
- sync 完成（时间取决于数量）
- 搜索快速（< 500ms）

## 故障排查

### 常见问题

**1. CDP Bridge 连接失败**

```bash
# 检查端口占用
netstat -ano | findstr :9222

# 检查 Bridge 是否运行
ps aux | grep cdp-bridge

# 重启 Bridge
pkill -f cdp-bridge
npm run cdp-bridge
```

**2. 文件锁超时**

```bash
# 清理陈旧锁
rm ~/.ai-memory/locks/*.lock

# 检查锁文件
ls -la ~/.ai-memory/locks/
```

**3. 任务列表为空**

```bash
# 检查任务文件
cat ~/.ai-memory/tasks/tasks.jsonl | tail -5

# 检查项目名称
ai-memory-hub task list --project "*"
```

## 验证清单

### ✅ 基础功能
- [ ] 任务创建和管理
- [ ] 记忆写入和搜索
- [ ] Radio 消息发送
- [ ] 工作流创建
- [ ] 工具检测

### ✅ 高级功能
- [ ] CDP Bridge 启动和连接
- [ ] 文件锁获取和释放
- [ ] Policy 策略生效
- [ ] VS Code 扩展生成

### ✅ 集成功能
- [ ] 多工具协作
- [ ] 实时通知
- [ ] 跨系统同步

### ✅ 性能
- [ ] 大量任务处理
- [ ] 内存搜索速度
- [ ] 并发访问控制

## 下一步

1. **发布到 npm**
   ```bash
   npm login
   npm publish
   ```

2. **创建 GitHub Release**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. **更新文档**
   - 添加实际使用案例
   - 录制演示视频
   - 编写 API 文档

4. **社区反馈**
   - 创建 Discord/Slack 频道
   - 收集使用反馈
   - 迭代改进

## 总结

AI Memory Hub 现在是一个功能完整的系统，包含：
- 任务管理
- 共享内存
- Radio 通信
- 工作流协调
- CDP Bridge 集成
- VS Code 扩展支持
- 质量控制
- 权限管理

所有功能都可以通过上述方法验证！🎉
