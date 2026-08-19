import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const N24 = "D:/nodejs/node-v24.15.0-win-x64/node.exe";
const ROOT = "D:/Project/ai-memory-hub";

function run(args) {
  try {
    const out = execFileSync(N24, ["src/index.js", ...args], { encoding: "utf8", cwd: ROOT });
    return JSON.parse(out);
  } catch (e) {
    return [];
  }
}

const agents = (run(["agent", "list"]) || []).filter((a) => a && a.id && !String(a.id).startsWith("session:"));
const roles = run(["role", "list"]) || [];
const teams = run(["team", "list"]) || [];
const roleName = Object.fromEntries((roles || []).map((r) => [r.id, r.name]));

const statusColor = (s) => (s === "busy" ? "#e5484d" : s === "done" ? "#f5a623" : "#30a46c");

// 反向：role -> members
const roleMembers = {};
for (const a of agents) {
  for (const r of a.roles || []) {
    roleMembers[r] = roleMembers[r] || [];
    roleMembers[r].push(a.id);
  }
}

const agentCards = agents.map((a) => `
  <div class="card">
    <div class="card-head">
      <span class="dot" style="background:${statusColor(a.status)}"></span>
      <span class="name">${a.id}</span>
      <span class="badge">${a.status || "idle"}</span>
    </div>
    <div class="roles">${(a.roles || []).map((r) => `<span class="tag">${roleName[r] || r}</span>`).join("") || "<span class='muted'>通用 runner · 角色按需分配</span>"}</div>
  </div>`).join("");

const roleCards = roles.map((r) => `
  <div class="card">
    <div class="card-head"><span class="name">${r.name}</span><span class="badge">${(roleMembers[r.id] || []).length} 人</span></div>
    <div class="desc">${r.description || ""}</div>
    <div class="perms">${(r.permissions || []).map((p) => `<span class="tag perm">${p}</span>`).join("") || "<span class='muted'>无权限</span>"}</div>
    <div class="members">成员: ${(roleMembers[r.id] || []).map((m) => `<b>${m}</b>`).join("、") || "<span class='muted'>按需分配（agent role add）</span>"}</div>
  </div>`).join("");

const teamCards = teams.length
  ? teams.map((t) => `<div class="card"><div class="card-head"><span class="name">${t.id}</span></div><div class="desc">${t.description || ""}</div></div>`).join("")
  : `<div class="empty">P2 team 实体已就绪（relations 加 <code>team</code> + <code>member-of</code>），生产库尚未建具体团队。用 <code>ai-memory-hub team create --id &lt;team&gt;</code> 即可。</div>`;

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMH 团队 / Agent / 角色 关系仪表盘</title>
<style>
  :root{--bg:#f7f8fa;--card:#fff;--bd:#e6e8eb;--tx:#1a1a1a;--mut:#8b8f96}
  *{box-sizing:border-box} body{margin:0;font-family:-apple-system,Segoe UI,Roboto,system-ui,sans-serif;background:var(--bg);color:var(--tx);padding:24px}
  h1{font-size:20px;margin:0 0 4px} .sub{color:var(--mut);font-size:13px;margin-bottom:20px}
  h2{font-size:15px;margin:24px 0 12px;border-left:3px solid #4f7cff;padding-left:8px}
  .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px}
  .card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .dot{width:9px;height:9px;border-radius:50%}
  .name{font-weight:600}
  .badge{margin-left:auto;font-size:11px;background:#eef1f5;color:var(--mut);padding:2px 8px;border-radius:20px}
  .roles,.perms{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
  .tag{font-size:11px;background:#eaf0ff;color:#3a5bd9;padding:2px 8px;border-radius:6px}
  .tag.perm{background:#eafaf0;color:#1c8a4f}
  .desc{font-size:12px;color:var(--mut);margin:4px 0}
  .members{font-size:12px;margin-top:6px}
  .muted{color:var(--mut)} .empty{color:var(--mut);font-size:13px;background:var(--card);border:1px dashed var(--bd);border-radius:10px;padding:14px}
  code{background:#eef1f5;padding:1px 5px;border-radius:4px;font-size:12px}
</style></head>
<body>
  <h1>AMH 团队 / Agent / 角色 关系仪表盘</h1>
  <div class="sub">P0 协调层 + P1 agent/role 实体 + P2 team 实体 · 数据来自生产库 CLI 快照 · 生成于 ${new Date().toLocaleString("zh-CN")}</div>

  <h2>Agents（${agents.length}）</h2>
  <div class="grid">${agentCards}</div>

  <h2>Roles（${roles.length}）</h2>
  <div class="grid">${roleCards}</div>

  <h2>Teams（${teams.length}）</h2>
  <div class="grid">${teamCards}</div>
</body></html>`;

writeFileSync(`${ROOT}/agent-roster.html`, html);
console.log(`written: agents=${agents.length} roles=${roles.length} teams=${teams.length}`);
