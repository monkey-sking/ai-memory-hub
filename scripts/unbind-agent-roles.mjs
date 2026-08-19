import { readFileSync, writeFileSync } from "node:fs";

const MEM = "<user-home>/.ai-memory";
const now = new Date().toISOString();

// 1) agents: 清空写死的角色绑定——角色是按需分配的职能，不是钉死在 agent 上的静态属性
const agents = readFileSync(`${MEM}/agents/agents.jsonl`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
for (const a of agents) {
  a.roles = [];
  a.updatedAt = now;
}
writeFileSync(`${MEM}/agents/agents.jsonl`, agents.map((a) => JSON.stringify(a)).join("\n") + "\n");

// 2) relations: 删掉所有 plays-role——agent 演什么角色应在任务上下文里动态挂，不预先种子
const lines = readFileSync(`${MEM}/relations/events.jsonl`, "utf8").trim().split("\n").filter(Boolean);
const kept = lines.filter((l) => {
  try {
    return JSON.parse(l).relation !== "plays-role";
  } catch {
    return true;
  }
});
writeFileSync(`${MEM}/relations/events.jsonl`, kept.map((o) => JSON.stringify(o)).join("\n") + "\n");

console.log(`agents=${agents.length} (roles cleared) keptRelations=${kept.length}`);
