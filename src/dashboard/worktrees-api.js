import { buildWorktreeProjection } from "./worktrees.js";

export function createDashboardWorktreesApi({ readTasks, readWorkflows, readLatestRelayStatusByThread, readDispatchRuns, inspect, snapshot = (value) => value, buildAdapters = () => ({}) }) {
  function getDashboardWorktrees(memoryDir) {
    return {
      worktrees: buildWorktreeProjection({
        tasks: readTasks(memoryDir),
        workflows: readWorkflows(memoryDir),
        relay: Object.values(readLatestRelayStatusByThread(memoryDir)),
        dispatchRuns: readDispatchRuns(memoryDir),
        inspect
      }).map((worktree) => {
        const next = snapshot(worktree);
        return { ...worktree, ...next, adapters: buildAdapters({ worktree: { ...worktree, ...next }, remote: next.remote || worktree.remote || {} }) };
      })
    };
  }

  return { getDashboardWorktrees };
}

