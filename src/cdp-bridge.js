#!/usr/bin/env node
// CDP Bridge Server - WebSocket bridge for non-CLI tools

import { WebSocketServer } from 'ws';
import { appendFileSync, existsSync, mkdirSync, watch, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import os from 'os';

const CDP_PORT = process.env.AMH_CDP_PORT || 9222;
const MEMORY_DIR = process.env.AMH_MEMORY_DIR || join(os.homedir(), '.ai-memory');

class CDPBridge {
  constructor(port = CDP_PORT, memoryDir = MEMORY_DIR) {
    this.port = port;
    this.memoryDir = memoryDir;
    this.clients = new Map();
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.fileWatchers = [];
    this.fileChangeTimers = new Map();
    this.fileEventSequence = 0;
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      console.log(`[CDP Bridge] Client connected: ${clientId}`);

      this.clients.set(clientId, {
        ws,
        id: clientId,
        tool: null,
        connectedAt: new Date().toISOString()
      });

      ws.on('message', (data) => {
        this.handleMessage(clientId, data);
      });

      ws.on('close', () => {
        console.log(`[CDP Bridge] Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error(`[CDP Bridge] Client error:`, error);
      });
    });

    this.startFileWatchers();
    console.log(`[CDP Bridge] Listening on ws://localhost:${this.port}`);
  }

  getWatchedFiles() {
    return [
      'radio/messages.jsonl',
      'tasks/events.jsonl',
      'inbox/events.jsonl'
    ];
  }

  getWatchedFileKind(relativePath) {
    if (relativePath === 'radio/messages.jsonl') return 'radio';
    if (relativePath === 'tasks/events.jsonl') return 'task';
    if (relativePath === 'inbox/events.jsonl') return 'memory';
    return null;
  }

  createFileChangeEvent(relativePath, eventType, ts = new Date().toISOString()) {
    return {
      type: 'amh.file-change',
      kind: this.getWatchedFileKind(relativePath),
      source: relativePath,
      eventType,
      sequence: ++this.fileEventSequence,
      ts
    };
  }

  startFileWatchers() {
    for (const relativePath of this.getWatchedFiles()) {
      const filePath = join(this.memoryDir, relativePath);
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        if (!existsSync(filePath)) writeFileSync(filePath, '', 'utf8');
        const watcher = watch(filePath, { persistent: false }, (eventType) => {
          if (eventType !== 'change' && eventType !== 'rename') return;
          clearTimeout(this.fileChangeTimers.get(relativePath));
          const timer = setTimeout(() => {
            this.fileChangeTimers.delete(relativePath);
            this.broadcast(this.createFileChangeEvent(relativePath, eventType));
          }, 100);
          timer.unref?.();
          this.fileChangeTimers.set(relativePath, timer);
        });
        watcher.on('error', () => {});
        this.fileWatchers.push(watcher);
      } catch (error) {
        console.warn(`[CDP Bridge] Cannot watch ${relativePath}: ${error.message}`);
      }
    }
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[CDP Bridge] Message from ${clientId}:`, message.method || message.type);

      if (message.method) {
        this.handleCDPMethod(clientId, message);
      } else if (message.type) {
        this.handleAMHMessage(clientId, message);
      } else if (message.id && this.pendingRequests.has(message.id)) {
        this.handleResponse(message);
      } else {
        this.sendError(clientId, message.id, -32600, 'Invalid Request');
      }
    } catch (error) {
      console.error('[CDP Bridge] Parse error:', error);
      this.sendError(clientId, null, -32700, 'Parse error');
    }
  }

  handleCDPMethod(clientId, message) {
    const { method, params, id } = message;

    switch (method) {
      case 'AMH.register':
        this.handleRegister(clientId, params, id);
        break;
      case 'AMH.task.create':
        this.handleTaskCreate(clientId, params, id);
        break;
      case 'AMH.task.list':
        this.handleTaskList(clientId, params, id);
        break;
      case 'AMH.task.update':
        this.handleTaskUpdate(clientId, params, id);
        break;
      case 'AMH.memory.read':
        this.handleMemoryRead(clientId, params, id);
        break;
      case 'AMH.memory.write':
        this.handleMemoryWrite(clientId, params, id);
        break;
      case 'AMH.radio.send':
        this.handleRadioSend(clientId, params, id);
        break;
      case 'AMH.radio.list':
        this.handleRadioList(clientId, params, id);
        break;
      case 'AMH.dispatch':
        this.handleDispatch(clientId, params, id);
        break;
      default:
        this.sendError(clientId, id, -32601, `Method not found: ${method}`);
    }
  }

  handleAMHMessage(clientId, message) {
    const { type, ...data } = message;

    switch (type) {
      case 'radio.message':
        this.broadcastRadioMessage(clientId, data);
        break;
      case 'task.event':
        this.broadcastTaskEvent(clientId, data);
        break;
      case 'workflow.event':
        this.broadcastWorkflowEvent(clientId, data);
        break;
      default:
        console.warn(`[CDP Bridge] Unknown message type: ${type}`);
    }
  }

  handleRegister(clientId, params, id) {
    const { tool, version } = params;
    const client = this.clients.get(clientId);

    if (client) {
      client.tool = tool;
      client.version = version;
      console.log(`[CDP Bridge] Registered tool: ${tool} (${version})`);
    }

    this.sendResponse(clientId, id, {
      registered: true,
      clientId,
      tool,
      memoryDir: MEMORY_DIR
    });
  }

  handleTaskCreate(clientId, params, id) {
    const { title, project, priority, description } = params;
    const client = this.clients.get(clientId);

    const result = this.execAMH('task', 'add', title,
      '--from', client.tool || 'unknown',
      '--project', project || '',
      '--priority', priority || 'normal'
    );

    if (result.success) {
      this.sendResponse(clientId, id, result.data);
    } else {
      this.sendError(clientId, id, -32603, 'Task creation failed', result.error);
    }
  }

  handleTaskList(clientId, params, id) {
    const { status, project } = params || {};

    const args = ['task', 'list'];
    if (status) args.push('--status', status);
    if (project) args.push('--project', project);

    const result = this.execAMH(...args);

    if (result.success) {
      this.sendResponse(clientId, id, result.data);
    } else {
      this.sendError(clientId, id, -32603, 'Task list failed', result.error);
    }
  }

  handleTaskUpdate(clientId, params, id) {
    const { taskId, status, note } = params;
    const client = this.clients.get(clientId);

    const args = ['task'];

    if (status === 'done') {
      args.push('done', '--id', taskId, '--by', client.tool || 'unknown');
    } else if (status === 'claimed') {
      args.push('claim', '--id', taskId, '--by', client.tool || 'unknown');
    } else if (note) {
      args.push('note', '--id', taskId, '--by', client.tool || 'unknown', note);
    }

    const result = this.execAMH(...args);

    if (result.success) {
      this.sendResponse(clientId, id, result.data);
    } else {
      this.sendError(clientId, id, -32603, 'Task update failed', result.error);
    }
  }

  handleMemoryRead(clientId, params, id) {
    const { query, project, limit } = params || {};

    const args = ['search'];
    if (query) args.push(query);
    if (project) args.push('--project', project);
    if (limit) args.push('--limit', String(limit));

    const result = this.execAMH(...args);

    if (result.success) {
      this.sendResponse(clientId, id, result.data);
    } else {
      this.sendError(clientId, id, -32603, 'Memory read failed', result.error);
    }
  }

  handleMemoryWrite(clientId, params, id) {
    const { text, kind, metadata } = params;

    const event = {
      source: this.clients.get(clientId)?.tool || 'unknown',
      text,
      metadata: { kind, ...metadata }
    };

    const inboxPath = join(MEMORY_DIR, 'inbox', 'events.jsonl');
    const line = JSON.stringify(event) + '\n';

    try {
      appendFileSync(inboxPath, line);
      this.execAMH('sync');
      this.sendResponse(clientId, id, { written: true });
    } catch (error) {
      this.sendError(clientId, id, -32603, 'Memory write failed', error.message);
    }
  }

  handleRadioSend(clientId, params, id) {
    const { to, text, type, project } = params;
    const client = this.clients.get(clientId);

    const args = ['radio', 'send',
      '--from', client.tool || 'unknown',
      '--to', to,
      '--text', text
    ];

    if (type) args.push('--type', type);
    if (project) args.push('--project', project);

    const result = this.execAMH(...args);

    if (result.success) {
      this.sendResponse(clientId, id, result.data);
    } else {
      this.sendError(clientId, id, -32603, 'Radio send failed', result.error);
    }
  }

  handleRadioList(clientId, params, id) {
    const { limit, from, to, consumer, ack } = params || {};

    const args = ['radio', 'list'];
    if (limit) args.push('--limit', String(limit));
    if (from) args.push('--from', from);
    if (to) args.push('--to', to);
    if (consumer) args.push('--consumer', consumer);
    if (ack) args.push('--ack');

    const result = this.execAMH(...args);

    if (result.success) {
      this.sendResponse(clientId, id, result.data);
    } else {
      this.sendError(clientId, id, -32603, 'Radio list failed', result.error);
    }
  }

  handleDispatch(clientId, params, id) {
    const { to, project } = params;

    const args = ['dispatch', '--to', to];
    if (project) args.push('--project', project);

    const result = this.execAMH(...args);

    if (result.success) {
      this.sendResponse(clientId, id, result.data);
    } else {
      this.sendError(clientId, id, -32603, 'Dispatch failed', result.error);
    }
  }

  execAMH(...args) {
    try {
      const command = `ai-memory-hub ${args.join(' ')}`;

      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let data;
      try {
        data = JSON.parse(output);
      } catch {
        data = output.trim();
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message, stderr: error.stderr?.toString() };
    }
  }

  sendResponse(clientId, requestId, result) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const response = {
      jsonrpc: '2.0',
      id: requestId,
      result
    };

    client.ws.send(JSON.stringify(response));
  }

  sendError(clientId, requestId, code, message, data = null) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const response = {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code,
        message,
        data
      }
    };

    client.ws.send(JSON.stringify(response));
  }

  broadcastRadioMessage(fromClientId, message) {
    const broadcast = {
      type: 'radio.message',
      ...message,
      ts: new Date().toISOString()
    };

    this.broadcast(broadcast, fromClientId);
  }

  broadcastTaskEvent(fromClientId, event) {
    const broadcast = {
      type: 'task.event',
      ...event,
      ts: new Date().toISOString()
    };

    this.broadcast(broadcast, fromClientId);
  }

  broadcastWorkflowEvent(fromClientId, event) {
    const broadcast = {
      type: 'workflow.event',
      ...event,
      ts: new Date().toISOString()
    };

    this.broadcast(broadcast, fromClientId);
  }

  broadcast(message, excludeClientId = null) {
    const payload = JSON.stringify(message);

    for (const [clientId, client] of this.clients) {
      if (clientId !== excludeClientId && client.ws.readyState === 1) {
        client.ws.send(payload);
      }
    }
  }

  stop() {
    for (const timer of this.fileChangeTimers.values()) clearTimeout(timer);
    this.fileChangeTimers.clear();
    for (const watcher of this.fileWatchers) watcher.close();
    this.fileWatchers = [];
    this.wss.close();
    console.log('[CDP Bridge] Server stopped');
  }
}

// Main
if (import.meta.url === `file://${process.argv[1]}`) {
  const bridge = new CDPBridge();
  bridge.start();

  process.on('SIGINT', () => {
    console.log('\n[CDP Bridge] Shutting down...');
    bridge.stop();
    process.exit(0);
  });
}

export default CDPBridge;
