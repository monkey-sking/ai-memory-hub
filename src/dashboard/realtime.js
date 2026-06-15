import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function createDashboardRealtimeApi({
  dashboardBackups,
  dashboardDispatch,
  dashboardMemory,
  dashboardMetrics,
  dashboardProjects,
  dashboardRadio,
  dashboardSettings,
  dashboardTasks,
  dashboardTools,
  dashboardWorkflows,
  getStatusObject
}) {
  function getDashboardSnapshot(memoryDir) {
    return {
      type: "snapshot",
      ts: new Date().toISOString(),
      status: getStatusObject(),
      memory: dashboardMemory.getDashboardMemory(memoryDir),
      radio: dashboardRadio.getDashboardRadio(memoryDir),
      tasks: dashboardTasks.getDashboardTasks(memoryDir),
      workflows: dashboardWorkflows.getDashboardWorkflows(memoryDir),
      projects: dashboardProjects.getDashboardProjects(memoryDir),
      dispatch: dashboardDispatch.getDashboardDispatch(memoryDir),
      metrics: dashboardMetrics.calculateMetrics(memoryDir),
      tools: dashboardTools.getDashboardTools(memoryDir),
      backups: dashboardBackups.getDashboardBackups(memoryDir),
      settings: dashboardSettings.getDashboardSettings()
    };
  }

  function createDashboardRealtime(memoryDir) {
    const clients = new Set();
    let sequence = 0;
    const heartbeat = setInterval(() => {
      for (const client of clients) {
        sendWebSocketFrame(client.socket, 0x9, Buffer.from(new Date().toISOString(), "utf8"));
      }
    }, 30000);
    heartbeat.unref?.();

    function handleUpgrade(req, socket, host, port) {
      let url;
      try {
        const hostPort = `${host}:${port}`;
        url = new URL(req.url || "/", `${"http:"}//${hostPort}`);
      } catch {
        socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      if (url.pathname !== "/ws") {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      const key = req.headers["sec-websocket-key"];
      const upgrade = String(req.headers.upgrade || "").toLowerCase();
      if (upgrade !== "websocket" || !key || Array.isArray(key)) {
        socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      const accept = crypto.createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");
      socket.write([
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        ""
      ].join("\r\n"));

      const client = { socket };
      clients.add(client);
      socket.setNoDelay(true);
      socket.setKeepAlive(true);
      socket.on("data", (chunk) => handleIncomingWebSocketData(client, chunk));
      socket.on("close", () => clients.delete(client));
      socket.on("error", () => clients.delete(client));

      sendWebSocketJson(client, {
        type: "hello",
        sequence: ++sequence,
        heartbeatMs: 30000,
        snapshot: getDashboardSnapshot(memoryDir)
      });
    }

    function broadcastSnapshot(reason = "change") {
      if (clients.size === 0) {
        return;
      }
      const message = {
        type: "snapshot",
        sequence: ++sequence,
        reason,
        snapshot: getDashboardSnapshot(memoryDir)
      };
      for (const client of [...clients]) {
        sendWebSocketJson(client, message);
      }
    }

    function close() {
      clearInterval(heartbeat);
      for (const client of [...clients]) {
        try {
          sendWebSocketFrame(client.socket, 0x8);
          client.socket.end();
        } catch {
          client.socket.destroy();
        }
      }
      clients.clear();
    }

    return { handleUpgrade, broadcastSnapshot, close };
  }

  function handleIncomingWebSocketData(client, chunk) {
    let offset = 0;
    while (offset + 2 <= chunk.length) {
      const first = chunk[offset++];
      const second = chunk[offset++];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;

      if (length === 126) {
        if (offset + 2 > chunk.length) return;
        length = chunk.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (offset + 8 > chunk.length) return;
        const bigLength = chunk.readBigUInt64BE(offset);
        offset += 8;
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) return;
        length = Number(bigLength);
      }

      let mask = null;
      if (masked) {
        if (offset + 4 > chunk.length) return;
        mask = chunk.subarray(offset, offset + 4);
        offset += 4;
      }

      if (offset + length > chunk.length) return;
      const payload = Buffer.from(chunk.subarray(offset, offset + length));
      offset += length;
      if (mask) {
        for (let index = 0; index < payload.length; index++) {
          payload[index] ^= mask[index % 4];
        }
      }

      if (opcode === 0x8) {
        sendWebSocketFrame(client.socket, 0x8, payload);
        client.socket.end();
        return;
      }
      if (opcode === 0x9) {
        sendWebSocketFrame(client.socket, 0xA, payload);
      }
    }
  }

  function sendWebSocketJson(client, value) {
    try {
      sendWebSocketFrame(client.socket, 0x1, Buffer.from(JSON.stringify(value), "utf8"));
    } catch {
      client.socket.destroy();
    }
  }

  function sendWebSocketFrame(socket, opcode, payload = Buffer.alloc(0)) {
    if (!socket.writable) {
      return;
    }
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
    let header;
    if (body.length < 126) {
      header = Buffer.alloc(2);
      header[1] = body.length;
    } else if (body.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(body.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(body.length), 2);
    }
    header[0] = 0x80 | (opcode & 0x0f);
    socket.write(Buffer.concat([header, body]));
  }

  function watchDashboardState(memoryDir, onChange) {
    const watchedFiles = new Set([
      "MEMORY.md",
      "profile.md",
      "config.json",
      "events.jsonl",
      "messages.jsonl",
      "tasks.jsonl",
      "workflows.jsonl",
      "dispatch-log.jsonl",
      "dispatch-runs.jsonl",
      "relay-status.jsonl"
    ]);
    const dirs = [
      memoryDir,
      path.join(memoryDir, "inbox"),
      path.join(memoryDir, "radio"),
      path.join(memoryDir, "tasks"),
      path.join(memoryDir, "workflows"),
      path.join(memoryDir, "state")
    ];
    const watchers = [];
    let timer = null;
    let pendingReason = "";

    const schedule = (reason) => {
      pendingReason = reason || pendingReason || "file-change";
      clearTimeout(timer);
      timer = setTimeout(() => {
        const reasonToSend = pendingReason || "file-change";
        pendingReason = "";
        onChange(reasonToSend);
      }, 150);
      timer.unref?.();
    };

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        continue;
      }
      try {
        const watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
          const name = filename ? String(filename) : "";
          if (!name || watchedFiles.has(path.basename(name))) {
            schedule(name ? `file:${name}` : `file:${path.basename(dir)}`);
          }
        });
        watcher.on("error", () => {});
        watcher.unref?.();
        watchers.push(watcher);
      } catch {
        // The dashboard can still use explicit API broadcasts if fs.watch is unavailable.
      }
    }

    return () => {
      clearTimeout(timer);
      for (const watcher of watchers) {
        try {
          watcher.close();
        } catch {
          // Ignore shutdown races.
        }
      }
    };
  }

  return {
    createDashboardRealtime,
    getDashboardSnapshot,
    watchDashboardState
  };
}
