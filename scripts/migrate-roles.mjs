import { readFileSync, writeFileSync } from "node:fs";

const MEM = "<user-home>/.ai-memory";
const now = new Date().toISOString();

// 新角色目录：岗位/职能（id 英文 slug，name 中文）
const NEW_ROLES = [
  { id: "product-manager", name: "产品经理", description: "拆解目标、写需求/方案、排任务与多 agent 工作流", permissions: ["task.create", "task.plan", "workflow.create", "spec.write"] },
  { id: "programmer", name: "程序员", description: "实际写代码、出文档、交付任务", permissions: ["task.claim", "task.done", "code.write", "doc.write"] },
  { id: "ui-designer", name: "UI设计师", description: "线框/原型/视觉规范与界面评审", permissions: ["ui.mockup", "ui.review", "asset.write", "doc.write"] },
  { id: "qa", name: "测试QA", description: "评审质量、跑测试、报 bug", permissions: ["task.review", "test.run", "bug.report"] },
  { id: "operations", name: "运营", description: "协同广播、发布通告与文档运营", permissions: ["radio.write", "doc.write", "release.announce"] },
  { id: "data", name: "数据", description: "数据查询、报表与跨 agent 状态观察", permissions: ["data.query", "report.write", "radio.read"] },
].map((r) => ({ ...r, createdAt: now, updatedAt: now }));

// 6 runner 的默认岗位分工（让每个岗位都看得到人；可后续调整）
const AGENT_ROLES = {
  codex: ["product-manager", "programmer"],
  claude: ["programmer", "qa"],
  gemini: ["programmer"],
  antigravity: ["ui-designer", "operations"],
  opencode: ["programmer"],
  mimocode: ["programmer", "data"],
};

// 1) roles/roles.jsonl —— 整体替换为岗位角色
writeFileSync(`${MEM}/roles/roles.jsonl`, NEW_ROLES.map((r) => JSON.stringify(r)).join("\n") + "\n");

// 2) agents/agents.jsonl —— 只改 roles[] 与 updatedAt，保留其它字段
const agents = readFileSync(`${MEM}/agents/agents.jsonl`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
for (const a of agents) {
  if (AGENT_ROLES[a.id]) a.roles = AGENT_ROLES[a.id];
  a.updatedAt = now;
}
writeFileSync(`${MEM}/agents/agents.jsonl`, agents.map((a) => JSON.stringify(a)).join("\n") + "\n");

// 3) relations/events.jsonl —— 删掉旧协作角色的 plays-role，写新岗位绑定
const OLD = new Set(["planner", "executor", "reviewer", "observer"]);
const lines = readFileSync(`${MEM}/relations/events.jsonl`, "utf8").trim().split("\n").filter(Boolean);
const kept = lines.filter((l) => {
  try {
    const o = JSON.parse(l);
    if (o.relation === "plays-role" && OLD.has(o.to.id)) return false;
  } catch {}
  return true;
});
const newRels = [];
for (const [agentId, roles] of Object.entries(AGENT_ROLES)) {
  for (const roleId of roles) {
    newRels.push({
      id: crypto.randomUUID(),
      ts: now,
      from: { type: "agent", id: agentId },
      to: { type: "role", id: roleId },
      relation: "plays-role",
      source: "agent-cli",
      confidence: 1,
      evidence: { kind: "explicit" },
      status: "active",
    });
  }
}
writeFileSync(`${MEM}/relations/events.jsonl`, [...kept, ...newRels].map((o) => JSON.stringify(o)).join("\n") + "\n");

console.log(`roles=${NEW_ROLES.length} agents=${agents.length} newPlaysRole=${newRels.length} keptRelations=${kept.length}`);
