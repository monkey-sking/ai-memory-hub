import { buildWorktreeProjection } from "./worktrees.js";

export function createDashboardWorktreesApi({ readTasks, readWorkflows, readLatestRelayStatusByThread, readDispatchRuns, inspect }) {
  function getDashboardWorktrees(memoryDir) {
    return {
      worktrees: buildWorktreeProjection({
        tasks: readTasks(memoryDir),
        workflows: readWorkflows(memoryDir),
        relay: Object.values(readLatestRelayStatusByThread(memoryDir)),
        dispatchRuns: readDispatchRuns(memoryDir),
        inspect
      })
    };
  }

  return { getDashboardWorktrees };
}

