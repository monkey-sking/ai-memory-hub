// record command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function recordCheckpointJob(checkpoint, jobId, status, tool, project, deps) {
  checkpoint.jobs[jobId] = {
    status,
    tool,
    project,
    recordedAt: new Date().toISOString()
  };
  return checkpoint;
}
