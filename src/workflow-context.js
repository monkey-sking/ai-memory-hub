const ACTIVE_NODE_STATUSES = new Set(["queued", "running", "waiting"]);

function latestEntry(entries) {
  return [...(Array.isArray(entries) ? entries : [])]
    .sort((a, b) => String(b?.ts || "").localeCompare(String(a?.ts || "")))[0] || null;
}

export function buildWorkflowSharedState({
  workflow = {},
  nodes = [],
  tasks = [],
  radio = [],
  updatedAt = ""
} = {}) {
  const linkedTaskIds = new Set(Array.isArray(workflow.linkedTasks) ? workflow.linkedTasks : []);
  const workflowId = String(workflow.id || "");
  const project = String(workflow.project || "");

  return {
    version: 1,
    workflowId,
    project,
    workflowStatus: String(workflow.status || ""),
    updatedAt: String(updatedAt || workflow.updatedAt || ""),
    activeNodes: (Array.isArray(nodes) ? nodes : [])
      .filter((node) => ACTIVE_NODE_STATUSES.has(node.status))
      .map((node) => ({
        nodeId: node.nodeId,
        slug: node.slug,
        status: node.status,
        role: node.role
      })),
    linkedTasks: (Array.isArray(tasks) ? tasks : [])
      .filter((task) => linkedTaskIds.has(task.id))
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        assignee: task.assignee || ""
      })),
    recentRadio: (Array.isArray(radio) ? radio : [])
      .filter((message) => message.thread === workflowId)
      .sort((a, b) => String(a?.ts || "").localeCompare(String(b?.ts || ""))),
    latestResult: latestEntry(workflow.results),
    latestReview: latestEntry(workflow.reviews)
  };
}
