# CDP Bridge Configuration

## Server Settings

```json
{
  "cdpBridge": {
    "enabled": true,
    "port": 9222,
    "host": "localhost",
    "auth": {
      "enabled": false,
      "tokens": []
    },
    "maxConnections": 10,
    "heartbeatInterval": 30000,
    "reconnectTimeout": 60000
  }
}
```

## Client Example (JavaScript)

```javascript
// Example client for browser extensions or web apps

class AMHClient {
  constructor(url = 'ws://localhost:9222') {
    this.url = url;
    this.ws = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.tool = 'my-tool';
    this.version = '1.0.0';
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[AMH Client] Connected');
        this.register().then(resolve).catch(reject);
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id);
          this.pendingRequests.delete(message.id);

          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }
        } else if (message.type) {
          this.handleEvent(message);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[AMH Client] Error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('[AMH Client] Disconnected');
      };
    });
  }

  async register() {
    return this.call('AMH.register', {
      tool: this.tool,
      version: this.version
    });
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;

      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  // Task operations
  async createTask(title, project, priority = 'normal') {
    return this.call('AMH.task.create', { title, project, priority });
  }

  async listTasks(status = null, project = null) {
    return this.call('AMH.task.list', { status, project });
  }

  async claimTask(taskId) {
    return this.call('AMH.task.update', { taskId, status: 'claimed' });
  }

  async completeTask(taskId) {
    return this.call('AMH.task.update', { taskId, status: 'done' });
  }

  async addTaskNote(taskId, note) {
    return this.call('AMH.task.update', { taskId, note });
  }

  // Memory operations
  async searchMemory(query, project = null, limit = 10) {
    return this.call('AMH.memory.read', { query, project, limit });
  }

  async writeMemory(text, kind = 'project', metadata = {}) {
    return this.call('AMH.memory.write', { text, kind, metadata });
  }

  // Radio operations
  async sendRadio(to, text, type = 'note', project = null) {
    return this.call('AMH.radio.send', { to, text, type, project });
  }

  async listRadio(limit = 10, from = null, to = null) {
    return this.call('AMH.radio.list', { limit, from, to });
  }

  // Dispatch
  async dispatch(to, project = null) {
    return this.call('AMH.dispatch', { to, project });
  }

  // Event handling
  handleEvent(event) {
    console.log('[AMH Client] Event:', event.type, event);

    switch (event.type) {
      case 'radio.message':
        this.onRadioMessage?.(event);
        break;
      case 'task.event':
        this.onTaskEvent?.(event);
        break;
      case 'workflow.event':
        this.onWorkflowEvent?.(event);
        break;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage example
const client = new AMHClient();

await client.connect();

// Create a task
const task = await client.createTask(
  'Implement feature X',
  'my-project',
  'high'
);
console.log('Task created:', task);

// Search memory
const memories = await client.searchMemory('authentication');
console.log('Found memories:', memories);

// Send radio message
await client.sendRadio('codex', 'Ready for review', 'note', 'my-project');

// Listen for events
client.onRadioMessage = (event) => {
  console.log('Radio message:', event);
};
```

## VS Code Extension Example

```javascript
// For VS Code extension

import * as vscode from 'vscode';

class AMHExtension {
  constructor(context) {
    this.context = context;
    this.client = null;
  }

  async activate() {
    // Connect to CDP bridge
    this.client = new AMHClient('ws://localhost:9222');
    this.client.tool = 'vscode-extension';
    this.client.version = '1.0.0';

    try {
      await this.client.connect();
      vscode.window.showInformationMessage('Connected to AI Memory Hub');
    } catch (error) {
      vscode.window.showErrorMessage('Failed to connect to AI Memory Hub');
    }

    // Register commands
    this.context.subscriptions.push(
      vscode.commands.registerCommand('amh.createTask', this.createTaskCommand.bind(this)),
      vscode.commands.registerCommand('amh.listTasks', this.listTasksCommand.bind(this)),
      vscode.commands.registerCommand('amh.searchMemory', this.searchMemoryCommand.bind(this))
    );

    // Listen for radio messages
    this.client.onRadioMessage = (event) => {
      vscode.window.showInformationMessage(`Radio: ${event.from} → ${event.text}`);
    };
  }

  async createTaskCommand() {
    const title = await vscode.window.showInputBox({
      prompt: 'Task title'
    });

    if (title) {
      const project = vscode.workspace.name || 'default';
      const task = await this.client.createTask(title, project);
      vscode.window.showInformationMessage(`Task created: ${task.id}`);
    }
  }

  async listTasksCommand() {
    const tasks = await this.client.listTasks('active');
    
    const items = tasks.map(t => ({
      label: t.title,
      description: t.project,
      detail: `${t.status} - ${t.priority}`,
      task: t
    }));

    const selected = await vscode.window.showQuickPick(items);
    
    if (selected) {
      // Open task details
      vscode.window.showInformationMessage(JSON.stringify(selected.task, null, 2));
    }
  }

  async searchMemoryCommand() {
    const query = await vscode.window.showInputBox({
      prompt: 'Search query'
    });

    if (query) {
      const memories = await this.client.searchMemory(query);
      
      // Show results in webview
      const panel = vscode.window.createWebviewPanel(
        'amhMemories',
        'Memory Search Results',
        vscode.ViewColumn.One,
        {}
      );

      panel.webview.html = this.getMemoriesHtml(memories);
    }
  }

  getMemoriesHtml(memories) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          .memory { border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; }
          .memory-text { font-weight: bold; }
          .memory-meta { color: #666; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <h1>Memory Search Results</h1>
        ${memories.map(m => `
          <div class="memory">
            <div class="memory-text">${m.text}</div>
            <div class="memory-meta">${m.kind} - ${m.project}</div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
  }

  deactivate() {
    if (this.client) {
      this.client.disconnect();
    }
  }
}

export function activate(context) {
  const extension = new AMHExtension(context);
  extension.activate();
}

export function deactivate() {
  // Cleanup
}
```

## Chrome Extension Example

```javascript
// For Chrome extension (background script)

let amhClient = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('AMH Extension installed');
  connectToAMH();
});

async function connectToAMH() {
  amhClient = new AMHClient('ws://localhost:9222');
  amhClient.tool = 'chrome-extension';
  amhClient.version = '1.0.0';

  try {
    await amhClient.connect();
    console.log('Connected to AMH');

    // Listen for events
    amhClient.onRadioMessage = (event) => {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'AMH Radio Message',
        message: `${event.from}: ${event.text}`
      });
    };
  } catch (error) {
    console.error('Failed to connect to AMH:', error);
  }
}

// Context menu for creating tasks
chrome.contextMenus.create({
  id: 'amh-create-task',
  title: 'Create AMH Task',
  contexts: ['selection']
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'amh-create-task') {
    const task = await amhClient.createTask(
      info.selectionText,
      tab.url,
      'normal'
    );
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Task Created',
      message: `Task ${task.id} created`
    });
  }
});
```

## Running the Bridge

```bash
# Start the CDP bridge server
node src/cdp-bridge.js

# Or with npm script
npm run cdp-bridge

# With custom port
AMH_CDP_PORT=8080 node src/cdp-bridge.js
```

## Security Considerations

1. **Local only by default** - Bridge listens on localhost
2. **No authentication** - Assumes local trusted environment
3. **Optional token auth** - Can be enabled for remote access
4. **Rate limiting** - Prevent abuse
5. **Input validation** - All params validated before execution

## Future Enhancements

1. **Authentication** - Token-based auth for remote access
2. **TLS/SSL** - Secure WebSocket (wss://)
3. **Rate limiting** - Per-client request limits
4. **Event subscriptions** - Selective event filtering
5. **Compression** - WebSocket compression for large payloads
