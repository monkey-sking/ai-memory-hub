import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createDashboardRealtimeApi } from "../src/dashboard/realtime.js";

class FakeSocket extends EventEmitter {
  writes = [];
  setNoDelay() {}
  setKeepAlive() {}
  write(value) { this.writes.push(String(value)); }
  end() {}
}

test("dashboard websocket handshake does not duplicate the initial full snapshot", () => {
  const empty = () => ({ });
  let snapshotReads = 0;
  const api = createDashboardRealtimeApi({
    dashboardBackups: { getDashboardBackups: empty },
    dashboardAgentSessions: { getDashboardAgentSessions: empty },
    dashboardCollaboration: { getDashboardCollaboration: empty },
    dashboardDispatch: { getDashboardDispatch: empty },
    dashboardMemory: { getDashboardMemory: empty },
    dashboardMetrics: { calculateMetrics: empty },
    dashboardProjects: { getDashboardProjects: empty },
    dashboardRadio: { getDashboardRadio: empty },
    dashboardSettings: { getDashboardSettings: empty },
    dashboardTasks: { getDashboardTasks: () => { snapshotReads += 1; return { tasks: [], messages: [] }; } },
    dashboardTools: { getDashboardTools: empty },
    dashboardWorktrees: { getDashboardWorktrees: empty },
    dashboardWorkflows: { getDashboardWorkflows: empty },
    getStatusObject: empty
  });
  const socket = new FakeSocket();
  api.createDashboardRealtime("memory").handleUpgrade({
    url: "/ws",
    headers: { upgrade: "websocket", "sec-websocket-key": "test-key" }
  }, socket, "127.0.0.1", 38787);
  assert.equal(socket.writes.length, 1);
  assert.match(socket.writes[0], /101 Switching Protocols/);
  assert.doesNotMatch(socket.writes.join(""), /snapshot/);
  assert.equal(snapshotReads, 0);
});
