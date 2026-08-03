import { buildAgentExecutionTimeline, buildAgentSessionProjection } from "./agent-sessions.js";

export function createDashboardAgentSessionsApi({ readSessions, readTasks, readWorkflows, readLatestRelayStatusByThread, readDispatchRuns }) {
  function getDashboardAgentSessions(memoryDir) {
    const sessions = readSessions(memoryDir);
    const tasks = readTasks(memoryDir);
    const workflows = readWorkflows(memoryDir);
    const relay = Object.values(readLatestRelayStatusByThread(memoryDir));
    const dispatchRuns = readDispatchRuns(memoryDir);
    return {
      agentSessions: buildAgentSessionProjection({
        sessions, tasks, workflows, relay, dispatchRuns
      }),
      timeline: buildAgentExecutionTimeline({ tasks, workflows, relay, dispatchRuns })
    };
  }

  return { getDashboardAgentSessions };
}
