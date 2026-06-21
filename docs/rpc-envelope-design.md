# Generic RPC Envelope Design

**Author:** Claude  
**Date:** 2026-06-21  
**Status:** Design Specification

## Overview

This document defines a **generic RPC envelope** that wraps the existing dispatch system, enabling structured remote procedure calls between AI tools with request/response semantics, error handling, and timeout management.

## Problem Statement

Current dispatch system:
- ✅ Good: Task/workflow dispatch, radio messages, relay status
- ❌ Missing: Direct request/response pattern
- ❌ Missing: Structured error handling
- ❌ Missing: Timeout and retry semantics
- ❌ Missing: Typed method calls

Needed:
- RPC-style method invocation (`call(tool, method, params)`)
- Request/response correlation
- Error propagation
- Timeout handling
- Type safety (optional schema validation)

## RPC Envelope Structure

### Request Envelope

```json
{
  "jsonrpc": "2.0",
  "id": "req_abc123",
  "method": "task.create",
  "params": {
    "title": "Implement feature X",
    "project": "ai-memory-hub",
    "priority": "normal"
  },
  "meta": {
    "from": "claude",
    "to": "codex",
    "timeout": 30000,
    "retries": 3,
    "correlationId": "corr_xyz789",
    "timestamp": "2026-06-21T06:00:00.000Z"
  }
}
```

### Response Envelope

```json
{
  "jsonrpc": "2.0",
  "id": "req_abc123",
  "result": {
    "taskId": "task:def456",
    "status": "created",
    "assignee": "codex"
  },
  "meta": {
    "from": "codex",
    "to": "claude",
    "duration": 1234,
    "timestamp": "2026-06-21T06:00:05.000Z"
  }
}
```

### Error Envelope

```json
{
  "jsonrpc": "2.0",
  "id": "req_abc123",
  "error": {
    "code": -32603,
    "message": "Task creation failed",
    "data": {
      "reason": "Invalid project name",
      "details": "Project 'xyz' does not exist"
    }
  },
  "meta": {
    "from": "codex",
    "to": "claude",
    "duration": 567,
    "timestamp": "2026-06-21T06:00:02.000Z"
  }
}
```

## Standard Error Codes

Following JSON-RPC 2.0 convention:

| Code | Message | Meaning |
|------|---------|---------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Missing required fields |
| -32601 | Method not found | Unknown method |
| -32602 | Invalid params | Parameter validation failed |
| -32603 | Internal error | Tool execution error |
| -32000 | Timeout | Request timed out |
| -32001 | Permission denied | Policy violation |
| -32002 | Tool unavailable | Target tool not running |
| -32003 | Conflict | Resource already in use |

## Method Registry

### Built-in Methods

```javascript
const RPC_METHODS = {
  // Task operations
  'task.create': { params: TaskCreateSchema, returns: TaskSchema },
  'task.update': { params: TaskUpdateSchema, returns: TaskSchema },
  'task.claim': { params: TaskClaimSchema, returns: TaskSchema },
  'task.get': { params: { id: 'string' }, returns: TaskSchema },
  'task.list': { params: TaskListSchema, returns: 'Task[]' },
  
  // Workflow operations
  'workflow.create': { params: WorkflowCreateSchema, returns: WorkflowSchema },
  'workflow.start': { params: { id: 'string' }, returns: WorkflowSchema },
  'workflow.status': { params: { id: 'string' }, returns: WorkflowStatusSchema },
  
  // Memory operations
  'memory.read': { params: { query: 'string' }, returns: 'Memory[]' },
  'memory.write': { params: MemoryWriteSchema, returns: { id: 'string' } },
  'memory.search': { params: MemorySearchSchema, returns: 'Memory[]' },
  
  // Radio operations
  'radio.send': { params: RadioMessageSchema, returns: { id: 'string' } },
  'radio.list': { params: RadioListSchema, returns: 'RadioMessage[]' },
  
  // File operations
  'file.read': { params: { path: 'string' }, returns: 'string' },
  'file.write': { params: { path: 'string', content: 'string' }, returns: 'void' },
  
  // Handoff operations
  'handoff.start': { params: HandoffStartSchema, returns: SessionSchema },
  'handoff.transfer': { params: HandoffTransferSchema, returns: HandoffSchema },
  'handoff.status': { params: {}, returns: HandoffStatusSchema }
};
```

### Custom Method Registration

Tools can register custom methods:

```javascript
// Register a custom method
rpc.register('codex.analyze', {
  handler: async (params) => {
    const { code, language } = params;
    return await analyzeCode(code, language);
  },
  params: {
    code: 'string',
    language: 'string'
  },
  returns: 'AnalysisResult'
});
```

## Storage and Transport

### RPC Log

`<memoryDir>/rpc/calls.jsonl` - Append-only RPC call log:

```jsonl
{"type":"rpc.request","id":"req_1","method":"task.create","from":"claude","to":"codex","ts":"2026-06-21T06:00:00.000Z"}
{"type":"rpc.response","id":"req_1","result":{"taskId":"task:123"},"duration":1234,"ts":"2026-06-21T06:00:05.000Z"}
```

### Pending Requests

`<memoryDir>/rpc/pending.json` - In-flight requests (for timeout detection):

```json
{
  "req_abc123": {
    "method": "task.create",
    "from": "claude",
    "to": "codex",
    "sentAt": "2026-06-21T06:00:00.000Z",
    "timeout": 30000
  }
}
```

### Transport Layer

RPC messages use existing dispatch infrastructure:

1. **Request** → Radio message with `type: rpc.request`
2. **Response** → Radio message with `type: rpc.response`
3. **Dispatch** → Existing relay mechanism handles delivery

## CLI Commands

### Make RPC Call

```bash
# Synchronous call (wait for response)
ai-memory-hub rpc call \
  --to codex \
  --method task.create \
  --params '{"title":"Fix bug","project":"amh"}' \
  --timeout 30000

# Asynchronous call (fire and forget)
ai-memory-hub rpc call \
  --to codex \
  --method task.create \
  --params '{"title":"Fix bug"}' \
  --async

# Batch call (multiple requests)
ai-memory-hub rpc batch \
  --to codex \
  --calls '[
    {"method":"task.create","params":{...}},
    {"method":"task.list","params":{...}}
  ]'
```

### List Methods

```bash
# List all available methods
ai-memory-hub rpc methods

# List methods for specific tool
ai-memory-hub rpc methods --tool codex

# Show method details
ai-memory-hub rpc method --name task.create
```

### Monitor RPC Activity

```bash
# Show recent RPC calls
ai-memory-hub rpc history --limit 10

# Show pending requests
ai-memory-hub rpc pending

# Show RPC statistics
ai-memory-hub rpc stats --tool claude
```

## Integration with Dispatch

### RPC over Dispatch

RPC requests are dispatched as special radio messages:

```javascript
// Send RPC request
function rpcCall(to, method, params, options = {}) {
  const requestId = generateId('req_');
  
  const message = {
    type: 'rpc.request',
    id: requestId,
    method,
    params,
    meta: {
      from: getCurrentTool(),
      to,
      timeout: options.timeout || 30000,
      timestamp: new Date().toISOString()
    }
  };
  
  // Store pending request
  storePendingRequest(requestId, message);
  
  // Send via radio
  sendRadioMessage(message);
  
  // Wait for response (if synchronous)
  if (!options.async) {
    return waitForResponse(requestId, options.timeout);
  }
  
  return { requestId };
}
```

### Response Handling

Tools listen for RPC requests and respond:

```javascript
// Listen for RPC requests
onRadioMessage((message) => {
  if (message.type === 'rpc.request') {
    handleRpcRequest(message);
  }
});

async function handleRpcRequest(request) {
  try {
    // Check permissions
    const allowed = checkPermission(request.meta.from, request.method);
    if (!allowed) {
      return sendRpcError(request.id, -32001, 'Permission denied');
    }
    
    // Find handler
    const handler = RPC_METHODS[request.method];
    if (!handler) {
      return sendRpcError(request.id, -32601, 'Method not found');
    }
    
    // Validate params
    const valid = validateParams(request.params, handler.params);
    if (!valid) {
      return sendRpcError(request.id, -32602, 'Invalid params');
    }
    
    // Execute
    const result = await handler.handler(request.params);
    
    // Send response
    sendRpcResponse(request.id, result);
  } catch (error) {
    sendRpcError(request.id, -32603, error.message, { stack: error.stack });
  }
}
```

## Timeout and Retry

### Timeout Detection

```javascript
// Cleanup stale requests
setInterval(() => {
  const pending = loadPendingRequests();
  const now = Date.now();
  
  for (const [id, request] of Object.entries(pending)) {
    const elapsed = now - new Date(request.sentAt).getTime();
    
    if (elapsed > request.timeout) {
      // Timeout
      sendRpcError(id, -32000, 'Request timeout');
      removePendingRequest(id);
    }
  }
}, 5000); // Check every 5 seconds
```

### Retry Logic

```javascript
async function rpcCallWithRetry(to, method, params, options = {}) {
  const maxRetries = options.retries || 3;
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await rpcCall(to, method, params, options);
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors
      if (error.code >= -32602 && error.code <= -32600) {
        throw error;
      }
      
      // Exponential backoff
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  
  throw lastError;
}
```

## Type Safety (Optional)

### Schema Validation

```javascript
// Define schema
const TaskCreateSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', required: true },
    project: { type: 'string', required: true },
    priority: { type: 'string', enum: ['low', 'normal', 'high'] }
  }
};

// Validate params
function validateParams(params, schema) {
  // Use JSON Schema validator
  return ajv.validate(schema, params);
}
```

### TypeScript Support

```typescript
// Type definitions
interface RpcRequest<P = any> {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: P;
  meta: RpcMeta;
}

interface RpcResponse<R = any> {
  jsonrpc: '2.0';
  id: string;
  result: R;
  meta: RpcMeta;
}

// Type-safe client
class RpcClient {
  async call<P, R>(method: string, params: P): Promise<R> {
    // Implementation
  }
}

// Usage
const result = await rpc.call<TaskCreateParams, Task>('task.create', {
  title: 'Fix bug',
  project: 'amh'
});
```

## Dashboard Integration

### RPC Monitor Panel

```
┌─ RPC Activity ──────────────────────────────┐
│ In-flight: 3                                │
│ Success rate: 98.5% (last 100 calls)        │
│ Avg latency: 1.2s                           │
│                                              │
│ Recent Calls:                               │
│ task.create    claude → codex    1.2s  ✓    │
│ memory.search  codex → claude    0.8s  ✓    │
│ file.read      gemini → claude   0.5s  ✓    │
│ task.update    claude → codex    30s   ⏱    │
└──────────────────────────────────────────────┘
```

### Method Registry View

```
┌─ Available Methods ─────────────────────────┐
│ task.create                                  │
│ task.update                                  │
│ task.list                                    │
│ workflow.create                              │
│ memory.search                                │
│ [+ Register Custom Method]                   │
└──────────────────────────────────────────────┘
```

## Use Cases

### Use Case 1: Task Creation RPC

```javascript
// Claude creates task via RPC
const result = await rpc.call('codex', 'task.create', {
  title: 'Review PR #123',
  project: 'ai-memory-hub',
  priority: 'high'
});

console.log(`Task created: ${result.taskId}`);
```

### Use Case 2: Cross-Tool Query

```javascript
// Codex queries memory from Claude
const memories = await rpc.call('claude', 'memory.search', {
  query: 'authentication implementation',
  project: 'auth-service',
  limit: 10
});

console.log(`Found ${memories.length} memories`);
```

### Use Case 3: File Operation

```javascript
// Gemini reads file via Claude
const content = await rpc.call('claude', 'file.read', {
  path: '/path/to/config.json'
});

const config = JSON.parse(content);
```

### Use Case 4: Batch Operations

```javascript
// Multiple operations in one call
const results = await rpc.batch('codex', [
  { method: 'task.list', params: { status: 'open' } },
  { method: 'workflow.list', params: { status: 'active' } },
  { method: 'memory.search', params: { query: 'recent changes' } }
]);

const [tasks, workflows, memories] = results;
```

## Migration Path

### Phase 1: Core Infrastructure (Current)
- ✅ Dispatch system
- ✅ Radio messages
- ✅ Relay status tracking

### Phase 2: RPC Layer (Next)
- Add RPC envelope structure
- Implement request/response correlation
- Add timeout and retry logic

### Phase 3: Method Registry (Future)
- Define standard methods
- Add custom method registration
- Implement schema validation

### Phase 4: Advanced Features (Future)
- Streaming responses
- Bidirectional streaming
- WebSocket transport
- Load balancing

## Benefits

1. **Type Safety** - Schema validation prevents errors
2. **Error Handling** - Structured error responses
3. **Timeout Management** - Automatic timeout detection
4. **Retry Logic** - Configurable retry strategies
5. **Correlation** - Request/response tracking
6. **Extensibility** - Custom method registration

## Comparison with Alternatives

### vs Pure Radio Messages

| Feature | Radio | RPC |
|---------|-------|-----|
| Request/Response | Manual | Built-in |
| Error Handling | Manual | Structured |
| Timeout | Manual | Automatic |
| Schema | No | Optional |
| Correlation | Manual | Automatic |

### vs Direct Dispatch

| Feature | Dispatch | RPC |
|---------|----------|-----|
| Task Execution | ✓ | ✓ |
| Method Calls | ✗ | ✓ |
| Synchronous | ✗ | ✓ |
| Error Propagation | Limited | Full |

## See Also

- [Dispatch System](../src/index.js#dispatch)
- [Radio Messages](../src/index.js#radio)
- [Handoff Bus](./handoff-bus-sync-model.md)
- [JSON-RPC 2.0 Spec](https://www.jsonrpc.org/specification)
