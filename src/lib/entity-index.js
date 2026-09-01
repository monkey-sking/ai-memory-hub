// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

export function policyActorMatches(rule, actor, actorRoles = []) {
  if (rule.actor === "*") return true;
  if (rule.actor === actor) return true;
  if (rule.actor.startsWith("role:") && actorRoles.includes(rule.actor)) return true;
  return false;
}

export function policyRuleSpecificity(rule) {
  let score = 0;
  if (rule.actor !== "*") score += 4;
  if (rule.project !== "*") score += 2;
  if (rule.scope !== "all") score += 1;
  return score;
}

export function isHiddenProjectId(id) {
  return String(id || "").toLowerCase().startsWith("test-");
}

export function findWorkflowIndex(workflows, id) {
  const exact = workflows.findIndex((workflow) => workflow.id === id);
  if (exact !== -1) {
    return exact;
  }
  const matches = workflows
    .map((workflow, index) => ({ workflow, index }))
    .filter((item) => item.workflow.id.startsWith(id));
  return matches.length === 1 ? matches[0].index : -1;
}

export function findTaskIndex(tasks, id) {
  const exact = tasks.findIndex((task) => task.id === id);
  if (exact !== -1) {
    return exact;
  }
  const matches = tasks
    .map((task, index) => ({ task, index }))
    .filter((item) => item.task.id.startsWith(id));
  return matches.length === 1 ? matches[0].index : -1;
}

export function createTaskNote(by, text) {
  return {
    ts: new Date().toISOString(),
    by: String(by || "unknown"),
    text: String(text || "").trim()
  };
}

export function getNotificationChannels(severity, userChannels = []) {
  // Default routing based on severity
  const defaultRouting = {
    info: ["console"],
    warning: ["console", "radio"],
    error: ["console", "radio", "telegram"],
    critical: ["console", "radio", "telegram", "wechat", "email"],
    need_input: ["console", "radio", "telegram", "wechat"]
  };

  const channels = userChannels.length > 0 ? userChannels : (defaultRouting[severity] || ["console"]);
  return [...new Set(channels)];
}
