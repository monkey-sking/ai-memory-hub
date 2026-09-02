// app command（HTTP dashboard 服务）。v3.0 重构 P0-1 下沉。
// 从 src/index.js 迁出，保持路由表与处理器逻辑原样。
// 仅 node 内置 + lib/独立模块直连 import；index.js 内部符号（dashboard 实例、
// 助手函数、POLICY 常量）经 deps 注入，避免反向依赖 src/index.js。

import http from "node:http";
import os from "node:os";
import path from "node:path";

import { getOption } from "../lib/cli.js";
import { POLICY_OPERATIONS } from "../lib/constants.js";
import { ensureHub } from "../lib/entity-models.js";
import { readProjects, readTasks, readWorkflows } from "../lib/entity-repo.js";
import { sendErrorEnvelope, sendHtml, sendJson, sendPlain } from "../lib/http.js";
import { readAgentById, readAgents, readPolicyRules, readRoleById, readRoles, readTeamById, readTeams, withHubLock, writeAgent, writeRole, writeTeam } from "../lib/io.js";
import { getRoleRegistryFile, getTeamRegistryFile } from "../lib/registry-paths.js";
import { renderDashboard, sendStaticAsset, sendStaticFile } from "../lib/tools-detect.js";
import { findProject, getPageOptions, readRequestJson } from "../lib/util.js";
import { listCredentialProfiles, removeCredentialProfile, setCredentialProfile } from "../credentials.js";
import { exportMemoryBundle, importMemoryBundle } from "../data-port.js";
import { diffExtensions, diffSkillExtensions, importExtensions, listExtensions, removeExtensions, removeSkillExtension, statusExtensions, syncExtensions, syncSkillExtensions } from "../extension-sync.js";
import { buildExecutionAdapters } from "../execution-adapters.js";
import { buildNotificationPayload } from "../external-integrations.js";
import { getBackgroundQueue } from "../background-queue.js";
import { parseGithubWebhook } from "../github-lifecycle.js";
import { listRelatedEntities, readRelations, recordRelation, revokeRelation } from "../relations.js";
import { doctorSkillProjections, syncSkillProjections } from "../shared-skill-materializer.js";
import { readSkillPackManifest } from "../shared-skill-pack.js";
import { disableProjectSkill, getSkillLifecycleState, loadProjectSkillManifest, selectProjectSkillVersion, selectProjectSkills, setProjectSkill } from "../shared-skill-project.js";
import { aggregateSkillSources, defaultSkillRoots, scanSkillRoots } from "../shared-skill-scan.js";
import { withPreparedSkillSource } from "../shared-skill-sources.js";
import { importSharedPack, importSharedSkill, listSharedSkillPackages } from "../shared-skills.js";
import { writeFileAtomic } from "../atomic-write.js";

// app command cluster. index.js 内部符号（dashboard 实例 / 助手函数 / POLICY
// 常量）经 deps 注入，本模块绝不 import src/index.js（保持依赖图无环）。

export function appCommand(argv, deps) {
  const {
    POLICY_DECISIONS,
    POLICY_SCOPES,
    dashboardActions,
    dashboardAgentSessions,
    dashboardBackups,
    dashboardCollaboration,
    dashboardCostSessions,
    dashboardDispatch,
    dashboardHealth,
    dashboardMemory,
    dashboardMetrics,
    dashboardProjects,
    dashboardRadio,
    dashboardRealtime,
    dashboardSearch,
    dashboardSettings,
    dashboardTasks,
    dashboardTools,
    dashboardWorkflows,
    dashboardWorktrees,
    getDispatchPoolSnapshot,
    getRequestMetricsSnapshot,
    getStatusObject,
    loadConfig,
    recordRequestMetric,
    refreshDetectedTools,
    runMemoryHealthRepair
  } = deps;

  const host = getOption(argv, "--host") || "127.0.0.1";
  const port = Number(getOption(argv, "--port") || 38787);
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const realtime = dashboardRealtime.createDashboardRealtime(config.memoryDir);
  const broadcastDashboardUpdate = (reason) => realtime.broadcastSnapshot(reason);
  const backgroundQueue = getBackgroundQueue({
    onProgress: (task) => {
      try {
        broadcastDashboardUpdate(`task:${task.status}`);
        // 进度推送也走 snapshot 的附带字段由前端按需读取；此处仅触发刷新
      } catch {
        // ignore
      }
    }
  });

  const server = http.createServer(async (req, res) => {
    const requestStartedAt = Date.now();
    const requestMethod = req.method || "GET";
    const requestRawPath = String(req.url || "/").split(/[?#]/, 1)[0] || "/";
    let requestCapturedStatus = 200;
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = (status, ...rest) => {
      requestCapturedStatus = status;
      return originalWriteHead(status, ...rest);
    };
    res.on("finish", () => {
      const ms = Date.now() - requestStartedAt;
      const isError = requestCapturedStatus >= 400;
      recordRequestMetric(requestMethod, requestRawPath, requestCapturedStatus, ms, isError);
      if (process.env.AMH_LOG_REQUESTS === "1") {
        console.log(`[req] ${requestMethod} ${requestRawPath} -> ${requestCapturedStatus} (${ms}ms)`);
      }
    });
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      const rawPathname = String(req.url || "/").split(/[?#]/, 1)[0] || "/";
      if ((req.method === "GET" || req.method === "HEAD") && rawPathname.startsWith("/assets/")) {
        return sendStaticAsset(res, rawPathname);
      }
      if ((req.method === "GET" || req.method === "HEAD") && (rawPathname.startsWith("/css/") || rawPathname.startsWith("/js/") || rawPathname.startsWith("/assets/") || /\.(svg|png|jpg|jpeg|gif|ico|webp|woff2?)$/i.test(rawPathname))) {
        return sendStaticFile(res, rawPathname);
      }
      if (req.method === "GET" && url.pathname === "/api/dashboard") {
        return sendJson(res, dashboardRealtime.getDashboardSnapshot(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/dashboard/overview") {
        return sendJson(res, dashboardRealtime.getDashboardOverview(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/credentials") {
        return sendJson(res, { profiles: listCredentialProfiles(config.memoryDir) });
      }
      if (req.method === "POST" && url.pathname === "/api/credentials") {
        const body = await readRequestJson(req);
        const profile = withHubLock(config.memoryDir, "credentials:set", () => setCredentialProfile(config.memoryDir, body));
        return sendJson(res, { ok: true, profile });
      }
      if (req.method === "DELETE" && url.pathname === "/api/credentials") {
        const body = await readRequestJson(req);
        return sendJson(res, { ok: true, profiles: withHubLock(config.memoryDir, "credentials:remove", () => removeCredentialProfile(config.memoryDir, body.id)) });
      }
      if (url.pathname === "/api/extensions") {
        const app = url.searchParams.get("app") || "";
        const kind = url.searchParams.get("kind") || "mcp";
        const apps = app ? [app] : ["claude", "codex", "gemini", "opencode"];
        if (req.method === "GET") {
          const [records, status, diff] = await Promise.all([
            listExtensions(config.memoryDir, { kind }),
            statusExtensions(config.memoryDir, { apps, homeDir: os.homedir() }),
            diffExtensions(config.memoryDir, { apps, homeDir: os.homedir() })
          ]);
          return sendJson(res, { records, extensions: records, status, diff });
        }
        if (req.method === "POST") {
          const body = await readRequestJson(req);
          const options = { apps, homeDir: os.homedir(), apply: body.apply === true, force: body.force === true };
          if (body.action === "sync") return sendJson(res, await syncExtensions(config.memoryDir, options));
          return sendJson(res, await diffExtensions(config.memoryDir, options));
        }
      }      if (req.method === "GET" && url.pathname === "/api/skills") {
        const packages = await listSharedSkillPackages(config.memoryDir);
        const project = url.searchParams.get("project") || process.cwd();
        const manifest = await loadProjectSkillManifest(project);
        const ids = [...new Set(packages.map((item) => item.id))];
        const lifecycle = Object.fromEntries(ids.map((id) => [id, getSkillLifecycleState(manifest, packages, id)]));
        return sendJson(res, { packages, manifest, selected: selectProjectSkills(manifest, packages), lifecycle });
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/skills/") && url.pathname !== "/api/skills/scan" && url.pathname !== "/api/skills/install" && url.pathname !== "/api/skills/sync" && url.pathname !== "/api/skills/doctor") {
        const id = decodeURIComponent(url.pathname.slice("/api/skills/".length));
        const packages = (await listSharedSkillPackages(config.memoryDir)).filter((item) => item.id === id);
        if (!packages.length) return sendJson(res, { error: `Skill not found: ${id}` }, 404);
        const project = url.searchParams.get("project") || process.cwd();
        const manifest = await loadProjectSkillManifest(project);
        return sendJson(res, { id, packages, manifest: manifest.skills[id] || null, lifecycle: getSkillLifecycleState(manifest, packages, id) });
      }
      if (req.method === "GET" && url.pathname === "/api/skills/scan") {
        const skills = await scanSkillRoots(defaultSkillRoots());
        return sendJson(res, { skills, groups: aggregateSkillSources(skills) });
      }
      if (req.method === "POST" && url.pathname === "/api/skills/install") {
        const body = await readRequestJson(req);
        if ((!body.path || typeof body.path !== "string") && (!body.source || typeof body.source !== "string")) return sendJson(res, { error: "path or source is required" }, 400);
        const imported = await withPreparedSkillSource(config.memoryDir, body.source || body.path, { ref: body.ref || "" }, async (prepared) => {
          const pack = await readSkillPackManifest(prepared.path);
          return pack
            ? importSharedPack(config.memoryDir, prepared.path, { source: prepared.source })
            : importSharedSkill(config.memoryDir, prepared.path, { id: body.id, version: body.version || "1.0.0", source: prepared.source });
        });
        let manifest = null;
        let synced = [];
        if (body.project) {
          const enabledSkills = imported.package ? imported.skills : [imported];
          for (const skill of enabledSkills) manifest = await setProjectSkill(body.project, skill.id, body.version || skill.version);
          const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
          synced = await syncSkillProjections(body.project, packages, Array.isArray(body.targets) && body.targets.length ? body.targets : ["codex", "claude", "gemini", "opencode", "antigravity"]);
        }
        broadcastDashboardUpdate("skills:install");
        return sendJson(res, { ok: true, imported, manifest, synced });
      }
      if (req.method === "POST" && url.pathname === "/api/skills/sync") {
        const body = await readRequestJson(req);
        const project = body.project || process.cwd();
        const manifest = await loadProjectSkillManifest(project);
        const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
        const result = await syncSkillProjections(project, packages, Array.isArray(body.targets) && body.targets.length ? body.targets : (manifest.targets.length ? manifest.targets : ["codex", "claude", "gemini", "opencode", "antigravity"]));
        broadcastDashboardUpdate("skills:sync");
        return sendJson(res, { ok: true, project, result });
      }
      if (req.method === "POST" && url.pathname === "/api/skills/select") {
        const body = await readRequestJson(req);
        const project = body.project || process.cwd();
        if (typeof body.id !== "string" || !body.id) return sendJson(res, { error: "id is required" }, 400);
        const manifest = body.enabled === false
          ? await disableProjectSkill(project, body.id)
          : await selectProjectSkillVersion(project, body.id, body.version || "*");
        const packages = await listSharedSkillPackages(config.memoryDir);
        broadcastDashboardUpdate("skills:select");
        return sendJson(res, { ok: true, project, manifest, selected: selectProjectSkills(manifest, packages) });
      }
      if (req.method === "GET" && url.pathname === "/api/relations") {
        const type = url.searchParams.get("entityType") || "";
        const id = url.searchParams.get("entityId") || "";
        return sendJson(res, listRelatedEntities(config.memoryDir, { type, id }, { includeSuggestions: url.searchParams.get("suggestions") !== "0" }));
      }
      if (req.method === "POST" && url.pathname === "/api/relations") {
        const body = await readRequestJson(req);
        return sendJson(res, { ok: true, relation: recordRelation(config.memoryDir, body) });
      }
      if (req.method === "POST" && url.pathname === "/api/relations/revoke") {
        const body = await readRequestJson(req);
        return sendJson(res, { ok: true, relation: revokeRelation(config.memoryDir, body.id, body.reason || "") });
      }
      // ── Agent / Role / Team registry endpoints ──
      if (req.method === "GET" && url.pathname === "/api/agents") {
        const agents = readAgents(config.memoryDir);
        const roles = readRoles(config.memoryDir);
        const rels = readRelations(config.memoryDir);
        const enriched = agents.map((a) => {
          const roleBindings = rels.filter((r) => r.relation === "plays-role" && r.from === `agent:${a.id}`);
          return { ...a, roleBindings: roleBindings.map((r) => r.to) };
        });
        return sendJson(res, { agents: enriched, roles });
      }
      if (req.method === "GET" && url.pathname === "/api/roles") {
        return sendJson(res, { roles: readRoles(config.memoryDir) });
      }
      if (req.method === "GET" && url.pathname === "/api/teams") {
        const teams = readTeams(config.memoryDir);
        const agents = readAgents(config.memoryDir);
        const rels = readRelations(config.memoryDir);
        const enriched = teams.map((t) => {
          const memberRels = rels.filter((r) => r.relation === "member-of" && r.status === "active" && r.to?.type === "team" && String(r.to?.id).toLowerCase() === String(t.id).toLowerCase());
          return { ...t, memberCount: memberRels.length, memberIds: memberRels.map((r) => r.from?.id || "") };
        });
        return sendJson(res, { teams: enriched, agents: agents.map((a) => ({ id: a.id, name: a.name, status: a.status })) });
      }
      // ── Role CRUD ──
      if (req.method === "POST" && url.pathname === "/api/roles") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const existing = readRoleById(config.memoryDir, body.id) || {};
        const role = writeRole(config.memoryDir, {
          ...existing,
          id: existing.id || body.id,
          name: body.name || existing.name || body.id,
          description: body.description ?? existing.description ?? "",
          permissions: Array.isArray(body.permissions) ? body.permissions : (existing.permissions || []),
          createdAt: existing.createdAt || new Date().toISOString(),
        });
        return sendJson(res, { ok: true, role });
      }
      if (req.method === "DELETE" && url.pathname === "/api/roles") {
        const id = (url.searchParams.get("id") || "").trim();
        if (!id) return sendJson(res, { error: "id is required" }, 400);
        const roles = readRoles(config.memoryDir);
        const next = roles.filter((r) => String(r.id).toLowerCase() !== id.toLowerCase());
        if (next.length === roles.length) return sendJson(res, { error: "role not found" }, 404);
        writeFileAtomic(getRoleRegistryFile(config.memoryDir), next.map((r) => JSON.stringify(r)).join("\n") + (next.length ? "\n" : ""), "utf8");
        return sendJson(res, { ok: true, deleted: id });
      }
      // ── Team CRUD ──
      if (req.method === "POST" && url.pathname === "/api/teams") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const existing = readTeamById(config.memoryDir, body.id) || {};
        const team = writeTeam(config.memoryDir, {
          ...existing,
          id: existing.id || body.id,
          name: body.name || existing.name || body.id,
          description: body.description ?? existing.description ?? "",
          createdAt: existing.createdAt || new Date().toISOString(),
        });
        return sendJson(res, { ok: true, team });
      }
      if (req.method === "DELETE" && url.pathname === "/api/teams") {
        const id = (url.searchParams.get("id") || "").trim();
        if (!id) return sendJson(res, { error: "id is required" }, 400);
        const teams = readTeams(config.memoryDir);
        const next = teams.filter((t) => String(t.id).toLowerCase() !== id.toLowerCase());
        if (next.length === teams.length) return sendJson(res, { error: "team not found" }, 404);
        writeFileAtomic(getTeamRegistryFile(config.memoryDir), next.map((t) => JSON.stringify(t)).join("\n") + (next.length ? "\n" : ""), "utf8");
        return sendJson(res, { ok: true, deleted: id });
      }
      if (req.method === "POST" && url.pathname === "/api/teams/member") {
        const body = await readRequestJson(req);
        if (!body.teamId || !body.agentId) return sendJson(res, { error: "teamId and agentId are required" }, 400);
        const rel = recordRelation(config.memoryDir, {
          from: { type: "agent", id: body.agentId },
          to: { type: "team", id: body.teamId },
          relation: "member-of",
          source: "dashboard",
          evidence: { note: `agent ${body.agentId} joined team ${body.teamId} via dashboard` },
        });
        return sendJson(res, { ok: true, relation: rel });
      }
      if (req.method === "DELETE" && url.pathname === "/api/teams/member") {
        const teamId = (url.searchParams.get("teamId") || "").trim();
        const agentId = (url.searchParams.get("agentId") || "").trim();
        if (!teamId || !agentId) return sendJson(res, { error: "teamId and agentId are required" }, 400);
        const rel = readRelations(config.memoryDir).find((r) => r.status === "active" && r.relation === "member-of" && r.from?.type === "agent" && String(r.from?.id).toLowerCase() === agentId.toLowerCase() && r.to?.type === "team" && String(r.to?.id).toLowerCase() === teamId.toLowerCase());
        if (!rel) return sendJson(res, { error: "no active member-of relation found" }, 404);
        revokeRelation(config.memoryDir, rel.id, "removed via dashboard");
        return sendJson(res, { ok: true, removed: { agentId, teamId } });
      }
      // ── Agent persona/bio update ──
      if (req.method === "POST" && url.pathname === "/api/agents") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const existing = readAgentById(config.memoryDir, body.id) || { id: body.id, name: body.id, createdAt: new Date().toISOString() };
        const agent = writeAgent(config.memoryDir, {
          ...existing,
          id: existing.id || body.id,
          name: body.name || existing.name || body.id,
          persona: body.persona ?? existing.persona ?? "",
          bio: body.bio ?? existing.bio ?? "",
          status: existing.status || "idle",
        });
        return sendJson(res, { ok: true, agent });
      }
      if (req.method === "GET" && url.pathname === "/api/skills/doctor") {
        const project = url.searchParams.get("project") || process.cwd();
        const manifest = await loadProjectSkillManifest(project);
        const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
        return sendJson(res, { project, result: await doctorSkillProjections(project, packages, manifest.targets.length ? manifest.targets : ["codex", "claude", "gemini", "opencode", "antigravity"]) });
      }
      if (req.method === "GET" && url.pathname === "/api/extensions") {
        const kind = url.searchParams.get("kind") || "mcp";
        return sendJson(res, { extensions: await listExtensions(config.memoryDir, { kind }) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/import") {
        const body = await readRequestJson(req);
        const apps = Array.isArray(body.apps) && body.apps.length ? body.apps : undefined;
        const homeDir = body.homeDir || undefined;
        return sendJson(res, { ok: true, ...(await importExtensions(config.memoryDir, { apps, homeDir })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/diff") {
        const body = await readRequestJson(req);
        const apps = Array.isArray(body.apps) && body.apps.length ? body.apps : undefined;
        const homeDir = body.homeDir || undefined;
        return sendJson(res, { ok: true, ...(await diffExtensions(config.memoryDir, { apps, homeDir })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/sync") {
        const body = await readRequestJson(req);
        const apps = Array.isArray(body.apps) && body.apps.length ? body.apps : undefined;
        const homeDir = body.homeDir || undefined;
        const apply = body.apply === true;
        const force = body.force === true;
        return sendJson(res, { ok: true, ...(await syncExtensions(config.memoryDir, { apps, homeDir, apply, force })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/remove") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const apps = Array.isArray(body.apps) && body.apps.length ? body.apps : undefined;
        const apply = body.apply === true;
        return sendJson(res, { ok: true, ...(await removeExtensions(config.memoryDir, body.id, { apps, apply })) });
      }
      if (req.method === "GET" && url.pathname === "/api/extensions/status") {
        const homeDir = url.searchParams.get("homeDir") || os.homedir();
        return sendJson(res, { ok: true, ...(await statusExtensions(config.memoryDir, { homeDir })) });
      }
      if (req.method === "GET" && url.pathname === "/api/metrics") {
        return sendJson(res, { ...dashboardMetrics.calculateMetrics(config.memoryDir), requests: getRequestMetricsSnapshot() });
      }
      // ── Phase 1.1: 后台任务队列查询/取消（独立命名空间，避免与看板任务 /api/tasks 冲突） ──
      if (req.method === "GET" && url.pathname === "/api/background-tasks") {
        return sendJson(res, { ok: true, tasks: backgroundQueue.list({ limit: Number(url.searchParams.get("limit")) || 50 }) });
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/background-tasks/")) {
        const id = url.pathname.slice("/api/background-tasks/".length);
        const task = backgroundQueue.get(id);
        if (!task) return sendJson(res, { ok: false, error: "task not found" }, 404);
        return sendJson(res, { ok: true, task });
      }
      if (req.method === "POST" && url.pathname.startsWith("/api/background-tasks/") && url.pathname.endsWith("/cancel")) {
        const id = url.pathname.slice("/api/background-tasks/".length, -"/cancel".length);
        return sendJson(res, { ok: true, ...backgroundQueue.cancel(id) });
      }
      // ── feature ③: 数据导入/导出与迁移 ──────────────────────────────
      if (req.method === "GET" && url.pathname === "/api/data/export") {
        return sendJson(res, exportMemoryBundle(config.memoryDir));
      }
      if (req.method === "POST" && url.pathname === "/api/data/import") {
        const body = await readRequestJson(req, 128 * 1024 * 1024);
        const apply = body.apply === true;
        if (url.searchParams.get("background") === "1" && apply) {
          const enqueued = backgroundQueue.enqueue({
            type: "data-import",
            label: "导入数据迁移包",
            run: async (ctx) => {
              ctx.report(0.1, "taking safety backup");
              const result = withHubLock(
                config.memoryDir,
                "data-import",
                () => importMemoryBundle(config.memoryDir, body.bundle, { apply: true }),
                config.sync.lockStaleMs
              );
              ctx.report(0.9, "imported");
              return result;
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = apply
          ? withHubLock(
              config.memoryDir,
              "data-import",
              () => importMemoryBundle(config.memoryDir, body.bundle, { apply: true }),
              config.sync.lockStaleMs
            )
          : importMemoryBundle(config.memoryDir, body.bundle, { apply: false });
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return sendJson(res, getStatusObject());
      }
      if (req.method === "GET" && url.pathname === "/api/memory") {
        return sendJson(res, dashboardMemory.getDashboardMemory(config.memoryDir, getPageOptions(url)));
      }
      if (req.method === "POST" && url.pathname === "/api/memory/supersede") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        let event;
        withHubLock(config.memoryDir, "memory-supersede", () => {
          event = dashboardMemory.createMemorySupersedeEvent(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("memory:supersede");
        return sendJson(res, { ok: true, event, status: getStatusObject() });
      }
      if (req.method === "GET" && url.pathname === "/api/radio") {
        return sendJson(res, dashboardRadio.getDashboardRadio(config.memoryDir, getPageOptions(url)));
      }
      if (req.method === "GET" && url.pathname === "/api/tasks") {
        const status = url.searchParams.get("status") || "all";
        const includeCancelled = url.searchParams.get("includeCancelled") === "1";
        return sendJson(res, dashboardTasks.getDashboardTasks(config.memoryDir, status, { includeCancelled, ...getPageOptions(url) }));
      }
      if (req.method === "GET" && url.pathname === "/api/workflows") {
        return sendJson(res, dashboardWorkflows.getDashboardWorkflows(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/projects") {
        return sendJson(res, dashboardProjects.getDashboardProjects(config.memoryDir, {
          status: url.searchParams.get("status") || "all",
          includeHidden: url.searchParams.get("includeHidden") === "1"
        }));
      }
      if (req.method === "POST" && url.pathname === "/api/projects") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.name || typeof body.name !== "string") {
          return sendJson(res, { error: "name is required" }, 400);
        }
        let project;
        withHubLock(config.memoryDir, "project-create", () => {
          project = dashboardProjects.createDashboardProject(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("project:create");
        return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
      }
      const projectApiMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectApiMatch) {
        const projectId = decodeURIComponent(projectApiMatch[1]);
        if (req.method === "GET") {
          const project = findProject(readProjects(config.memoryDir), projectId);
          if (!project) {
            return sendJson(res, { error: "project not found" }, 404);
          }
          return sendJson(res, { project });
        }
        if (req.method === "PATCH") {
          const body = await readRequestJson(req);
          let project;
          withHubLock(config.memoryDir, "project-update", () => {
            project = dashboardProjects.updateDashboardProject(config.memoryDir, projectId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("project:update");
          return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
        }
        if (req.method === "DELETE") {
          const body = await readRequestJson(req);
          let project;
          withHubLock(config.memoryDir, "project-archive", () => {
            project = dashboardProjects.archiveDashboardProject(config.memoryDir, projectId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("project:archive");
          return sendJson(res, { ok: true, project, projects: dashboardProjects.getDashboardProjects(config.memoryDir), status: getStatusObject() });
        }
      }
      if (req.method === "POST" && url.pathname === "/api/workflows") {
        const body = await readRequestJson(req);
        if (!body.title || typeof body.title !== "string") {
          return sendJson(res, { error: "title is required" }, 400);
        }
        let workflow;
        withHubLock(config.memoryDir, "workflow-create", () => {
          workflow = dashboardWorkflows.createDashboardWorkflow(config.memoryDir, body);
        }, config.sync.lockStaleMs);
        broadcastDashboardUpdate("workflow:create");
        return sendJson(res, { ok: true, workflow, status: getStatusObject() });
      }
      const workflowApiMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)(?:\/([^/]+))?$/);
      if (workflowApiMatch) {
        const workflowId = decodeURIComponent(workflowApiMatch[1]);
        const workflowAction = workflowApiMatch[2] ? decodeURIComponent(workflowApiMatch[2]) : "";
        if (req.method === "GET" && workflowAction === "nodes") {
          return sendJson(res, dashboardWorkflows.getDashboardWorkflowNodes(config.memoryDir, workflowId));
        }
        if (req.method === "PATCH" && !workflowAction) {
          const body = await readRequestJson(req);
          let workflow;
          withHubLock(config.memoryDir, "workflow-update", () => {
            workflow = dashboardWorkflows.updateDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:update");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "DELETE" && !workflowAction) {
          const body = await readRequestJson(req);
          let workflow;
          withHubLock(config.memoryDir, "workflow-delete", () => {
            workflow = dashboardWorkflows.deleteDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:delete");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && workflowAction === "status") {
          const body = await readRequestJson(req);
          if (!body.status || typeof body.status !== "string") {
            return sendJson(res, { error: "status is required" }, 400);
          }
          let workflow;
          withHubLock(config.memoryDir, "workflow-status", () => {
            workflow = dashboardWorkflows.setDashboardWorkflowStatus(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:status");
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && ["result", "review", "note"].includes(workflowAction)) {
          const body = await readRequestJson(req);
          if (!body.text || typeof body.text !== "string") {
            return sendJson(res, { error: "text is required" }, 400);
          }
          let workflow;
          withHubLock(config.memoryDir, `workflow-${workflowAction}`, () => {
            workflow = dashboardWorkflows.appendDashboardWorkflowEntry(config.memoryDir, workflowId, workflowAction, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate(`workflow:${workflowAction}`);
          return sendJson(res, { ok: true, workflow, status: getStatusObject() });
        }
        if (req.method === "POST" && workflowAction === "signal") {
          const body = await readRequestJson(req);
          if (!body.to || typeof body.to !== "string") {
            return sendJson(res, { error: "to is required" }, 400);
          }
          if (!body.text || typeof body.text !== "string") {
            return sendJson(res, { error: "text is required" }, 400);
          }
          let result;
          withHubLock(config.memoryDir, "workflow-signal", () => {
            result = dashboardWorkflows.signalDashboardWorkflow(config.memoryDir, workflowId, body);
          }, config.sync.lockStaleMs);
          broadcastDashboardUpdate("workflow:signal");
          return sendJson(res, { ok: true, ...result, status: getStatusObject() });
        }
      }
      if (req.method === "GET" && url.pathname === "/api/dispatch") {
        return sendJson(res, dashboardDispatch.getDashboardDispatch(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/agent-sessions") {
        return sendJson(res, dashboardAgentSessions.getDashboardAgentSessions(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/cost-sessions") {
        return sendJson(res, dashboardCostSessions.getCostSessions());
      }
      if (req.method === "GET" && url.pathname === "/api/worktrees") {
        return sendJson(res, dashboardWorktrees.getDashboardWorktrees(config.memoryDir));
      }
      if (req.method === "GET" && url.pathname === "/api/collaboration") {
        return sendJson(res, dashboardCollaboration.getDashboardCollaboration(config.memoryDir, url.searchParams.get("actor") || "all"));
      }
      if (req.method === "GET" && url.pathname === "/api/reviews") {
        return sendJson(res, { reviews: dashboardCollaboration.getDashboardCollaboration(config.memoryDir).reviews });
      }
      if (req.method === "POST" && url.pathname === "/api/unread/read") {
        const body = await readRequestJson(req);
        const result = withHubLock(config.memoryDir, "unread-read", () => dashboardCollaboration.markRead(config.memoryDir, body), config.sync.lockStaleMs);
        broadcastDashboardUpdate("unread:read");
        return sendJson(res, { ok: true, ...result });
      }
      if (req.method === "POST" && ["/api/agent/follow-up", "/api/session/follow-up"].includes(url.pathname)) {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") return sendJson(res, { error: "text is required" }, 400);
        const result = withHubLock(config.memoryDir, "agent-follow-up", () => dashboardCollaboration.sendFollowUp(config.memoryDir, body), config.sync.lockStaleMs);
        broadcastDashboardUpdate("agent:follow-up");
        return sendJson(res, { ok: true, ...result });
      }
      if (req.method === "POST" && url.pathname === "/api/reviews/request") {
        const body = await readRequestJson(req);
        if (!body.taskId && !body.workflowId && !body.sessionId) return sendJson(res, { error: "taskId, workflowId, or sessionId is required" }, 400);
        const result = withHubLock(config.memoryDir, "review-request", () => dashboardCollaboration.requestReview(config.memoryDir, body), config.sync.lockStaleMs);
        broadcastDashboardUpdate("review:request");
        return sendJson(res, { ok: true, ...result });
      }
      if (req.method === "POST" && url.pathname === "/api/reviews/result") {
        const body = await readRequestJson(req);
        const taskId = body.taskId || body.id || "";
        const decision = String(body.decision || "").toLowerCase();
        if (!taskId || !["approved", "rejected"].includes(decision)) return sendJson(res, { error: "taskId and decision approved|rejected are required" }, 400);
        const result = dashboardActions.reviewDashboardTask(config, { ...body, id: taskId, decision });
        broadcastDashboardUpdate("review:result");
        return sendJson(res, { ok: true, ...result });
      }
      if (req.method === "GET" && url.pathname === "/api/execution-adapters") {
        const taskId = url.searchParams.get("task") || "";
        const workflowId = url.searchParams.get("workflow") || "";
        const task = readTasks(config.memoryDir).find((item) => item.id === taskId || item.id.startsWith(taskId)) || {};
        const workflow = readWorkflows(config.memoryDir).find((item) => item.id === workflowId || item.id.startsWith(workflowId)) || {};
        return sendJson(res, { adapters: buildExecutionAdapters({ task, workflow, worktree: task.worktree || workflow.worktree || {} }) });
      }
      if (req.method === "POST" && url.pathname === "/api/notifications/payload") {
        const body = await readRequestJson(req);
        if (!body.message || typeof body.message !== "string") return sendJson(res, { error: "message is required" }, 400);
        return sendJson(res, { ok: true, dryRun: true, ...buildNotificationPayload(body) });
      }
      if (req.method === "POST" && url.pathname === "/api/github/webhook") {
        const body = await readRequestJson(req);
        return sendJson(res, { ...parseGithubWebhook(body), apply: false, hint: "Use amh gh webhook --data <file> --apply for explicit task updates." });
      }
      if (req.method === "GET" && url.pathname === "/api/detect") {
        // ?background=1 把全量重扫（冷启动 ~12s）收口到后台队列，立即返回 task id
        if (url.searchParams.get("background") === "1") {
          const enqueued = backgroundQueue.enqueue({
            type: "detect",
            label: "重新扫描已安装工具",
            run: async (ctx) => {
              ctx.report(0.1, "scanning install targets");
              const tools = refreshDetectedTools(config.memoryDir);
              ctx.report(0.9, "enriching connections");
              return { tools };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        return sendJson(res, dashboardTools.getDashboardDetection(config.memoryDir, { refresh: url.searchParams.get("refresh") === "1" }));
      }
      if (req.method === "GET" && url.pathname === "/api/tools") {
        return sendJson(res, dashboardTools.getDashboardTools(config.memoryDir, {
          refresh: url.searchParams.get("refresh") === "1"
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/capabilities") {
        return sendJson(res, dashboardTools.buildCapabilityRegistry(config.memoryDir, {
          refresh: url.searchParams.get("refresh") === "1"
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/extensions") {
        const kind = url.searchParams.get("kind") || "mcp";
        return sendJson(res, { ok: true, records: await listExtensions(config.memoryDir, { kind }) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/import") {
        const body = await readRequestJson(req);
        const appParam = body.app || "";
        const apps = appParam ? [appParam] : ["claude", "codex", "gemini", "opencode"];
        return sendJson(res, { ok: true, ...(await importExtensions(config.memoryDir, { apps, homeDir: os.homedir() })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/diff") {
        const body = await readRequestJson(req);
        const appParam = body.app || "";
        const apps = appParam ? [appParam] : ["claude", "codex", "gemini", "opencode"];
        const kind = body.kind || "mcp";
        if (kind === "skill") {
          return sendJson(res, { ok: true, ...(await diffSkillExtensions(config.memoryDir, { projectRoot: body.project || process.cwd(), apps })) });
        }
        return sendJson(res, { ok: true, ...(await diffExtensions(config.memoryDir, { apps, homeDir: os.homedir() })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/sync") {
        const body = await readRequestJson(req);
        const appParam = body.app || "";
        const apps = appParam ? [appParam] : ["claude", "codex", "gemini", "opencode"];
        const kind = body.kind || "mcp";
        if (kind === "skill") {
          return sendJson(res, { ok: true, ...(await syncSkillExtensions(config.memoryDir, { projectRoot: body.project || process.cwd(), apps, apply: body.apply === true })) });
        }
        return sendJson(res, { ok: true, ...(await syncExtensions(config.memoryDir, { apps, homeDir: os.homedir(), apply: body.apply === true, force: body.force === true })) });
      }
      if (req.method === "POST" && url.pathname === "/api/extensions/remove") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") return sendJson(res, { error: "id is required" }, 400);
        const kind = body.kind || "mcp";
        if (kind === "skill") {
          return sendJson(res, { ok: true, ...(await removeSkillExtension(config.memoryDir, { projectRoot: body.project || process.cwd(), id: body.id })) });
        }
        return sendJson(res, { ok: true, ...(await removeExtensions(config.memoryDir, body.id, { apps: body.apps || ["claude", "codex", "gemini", "opencode"], apply: body.apply === true })) });
      }
      if (req.method === "GET" && url.pathname === "/api/extensions/status") {
        return sendJson(res, { ok: true, ...(await statusExtensions(config.memoryDir, { apps: ["claude", "codex", "gemini", "opencode"], homeDir: os.homedir() })) });
      }
      if (req.method === "GET" && url.pathname === "/api/policy") {
        const rules = readPolicyRules(config.memoryDir);
        return sendJson(res, {
          ok: true,
          count: rules.length,
          rules,
          operations: POLICY_OPERATIONS,
          decisions: POLICY_DECISIONS,
          scopes: POLICY_SCOPES
        });
      }
      if (req.method === "GET" && url.pathname === "/api/backups") {
        return sendJson(res, dashboardBackups.getDashboardBackups(config));
      }
      if (req.method === "GET" && url.pathname === "/api/backups/github/status") {
        return sendJson(res, dashboardBackups.getDashboardGitHubBackupStatus());
      }
      if (req.method === "POST" && url.pathname === "/api/backups/github/configure") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.configureDashboardGitHubBackup(body);
        broadcastDashboardUpdate("backup:github-configure");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/github/run") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.runDashboardGitHubBackup(body);
        broadcastDashboardUpdate("backup:github-run");
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/backups/detail") {
        return sendJson(res, dashboardBackups.getDashboardBackupDetail(config, url.searchParams.get("name") || ""));
      }
      if (req.method === "POST" && url.pathname === "/api/backups/create") {
        const body = await readRequestJson(req);
        if (url.searchParams.get("background") === "1") {
          const enqueued = backgroundQueue.enqueue({
            type: "backup-create",
            label: "创建备份",
            run: async (ctx) => {
              ctx.report(0.05, "preparing backup");
              const result = dashboardBackups.createDashboardBackup(config, body);
              broadcastDashboardUpdate("backup:create");
              ctx.report(1, "backup created");
              return { result };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = dashboardBackups.createDashboardBackup(config, body);
        broadcastDashboardUpdate("backup:create");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/prune") {
        const body = await readRequestJson(req);
        if (url.searchParams.get("background") === "1") {
          const enqueued = backgroundQueue.enqueue({
            type: "backup-prune",
            label: "按策略清理备份",
            run: async (ctx) => {
              ctx.report(0.05, "scanning retention policy");
              const result = dashboardBackups.pruneDashboardBackups(config, body);
              if (Boolean(body.apply)) broadcastDashboardUpdate("backup:prune");
              ctx.report(1, "prune done");
              return { result };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = dashboardBackups.pruneDashboardBackups(config, body);
        if (Boolean(body.apply)) {
          broadcastDashboardUpdate("backup:prune");
        }
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/delete") {
        const body = await readRequestJson(req);
        const result = dashboardBackups.deleteDashboardBackups(config, body);
        if (Boolean(body.apply)) {
          broadcastDashboardUpdate("backup:delete");
        }
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/backups/restore") {
        const body = await readRequestJson(req);
        if (url.searchParams.get("background") === "1" && Boolean(body.apply)) {
          const enqueued = backgroundQueue.enqueue({
            type: "backup-restore",
            label: `恢复备份 ${String(body.name || "")}`.trim(),
            run: async (ctx) => {
              ctx.report(0.05, "preparing restore");
              const result = dashboardBackups.restoreDashboardBackup(config, body);
              if (Boolean(body.apply)) broadcastDashboardUpdate("backup:restore");
              ctx.report(1, "restore done");
              return { result };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = dashboardBackups.restoreDashboardBackup(config, body);
        if (Boolean(body.apply)) {
          broadcastDashboardUpdate("backup:restore");
        }
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/search") {
        return sendJson(res, dashboardSearch.getDashboardSearch(config.memoryDir, {
          query: url.searchParams.get("q") || url.searchParams.get("query") || "",
          type: url.searchParams.get("type") || "all",
          tag: url.searchParams.get("tag") || "",
          range: url.searchParams.get("range") || "all",
          sort: url.searchParams.get("sort") || "relevance",
          limit: Number(url.searchParams.get("limit") || 50)
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/settings") {
        return sendJson(res, dashboardSettings.getDashboardSettings());
      }
      if (req.method === "POST" && url.pathname === "/api/settings") {
        const body = await readRequestJson(req);
        const settings = dashboardSettings.updateDashboardSettings(body);
        broadcastDashboardUpdate("settings:update");
        return sendJson(res, { ok: true, settings });
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        const diagnostic = dashboardHealth.buildMemoryHealthDiagnostic(config, { issueLimit: 10 });
        return sendJson(res, {
          ok: true,
          stdout: diagnostic.markdown,
          report: diagnostic.markdown,
          analysis: dashboardHealth.formatHealthAnalysisForDashboard(diagnostic.analysis),
          exitCode: 0
        });
      }
      if (req.method === "POST" && url.pathname === "/api/health/repair") {
        const body = await readRequestJson(req);
        if (url.searchParams.get("background") === "1") {
          const enqueued = backgroundQueue.enqueue({
            type: "health-repair",
            label: "修复记忆健康问题",
            run: async (ctx) => {
              const apply = body.apply !== false;
              ctx.report(0.05, "scanning issues");
              const result = withHubLock(config.memoryDir, "health-repair", () => runMemoryHealthRepair(config, {
                apply,
                issueLimit: Number(body.limit || 10)
              }), config.sync.lockStaleMs);
              if (apply && result.applied.ledgerRecordsUpdated > 0) broadcastDashboardUpdate("health:repair");
              ctx.report(1, "repair done");
              return { result };
            }
          });
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const apply = body.apply !== false;
        const result = withHubLock(config.memoryDir, "health-repair", () => runMemoryHealthRepair(config, {
          apply,
          issueLimit: Number(body.limit || 10)
        }), config.sync.lockStaleMs);
        if (apply && result.applied.ledgerRecordsUpdated > 0) {
          broadcastDashboardUpdate("health:repair");
        }
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/record") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.recordDashboardMemory(body);
        broadcastDashboardUpdate("record");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/radio/send") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.sendDashboardRadio(config, body);
        broadcastDashboardUpdate("radio:send");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/add") {
        const body = await readRequestJson(req);
        if (!body.title || typeof body.title !== "string") {
          return sendJson(res, { error: "title is required" }, 400);
        }
        const result = dashboardActions.addDashboardTask(config, body);
        broadcastDashboardUpdate("task:add");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/claim") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const result = dashboardActions.claimDashboardTask(config, body);
        broadcastDashboardUpdate("task:claim");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/status") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.status || typeof body.status !== "string") {
          return sendJson(res, { error: "status is required" }, 400);
        }
        const result = dashboardActions.setDashboardTaskStatus(config, body);
        broadcastDashboardUpdate("task:status");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/review") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const decision = String(body.decision || "").toLowerCase();
        if (!["approved", "rejected"].includes(decision)) {
          return sendJson(res, { error: "decision must be approved or rejected" }, 400);
        }
        const result = dashboardActions.reviewDashboardTask(config, body);
        broadcastDashboardUpdate("task:review");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/task/purge") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        if (!body.confirm || typeof body.confirm !== "string") {
          return sendJson(res, { error: "confirm is required" }, 400);
        }
        const result = dashboardActions.purgeDashboardTask(config, body);
        broadcastDashboardUpdate("task:purge");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch/run") {
        const body = await readRequestJson(req);
        const concurrency = Math.max(1, Math.min(Number(body.concurrency || 1), 6));
        if (url.searchParams.get("background") === "1" && concurrency > 1) {
          const enqueued = backgroundQueue.enqueue({
            type: "dispatch-run",
            label: `并发 Dispatch (concurrency=${concurrency})`,
            run: async (ctx) => {
              ctx.report(0.05, "dispatching jobs");
              const result = await dashboardActions.runDashboardDispatch(config, body);
              ctx.report(0.95, "dispatch completed");
              return result;
            }
          });
          broadcastDashboardUpdate("dispatch:run");
          return sendJson(res, { ok: true, background: true, task: enqueued });
        }
        const result = await dashboardActions.runDashboardDispatch(config, body);
        broadcastDashboardUpdate("dispatch:run");
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/dispatch/pool") {
        return sendJson(res, getDispatchPoolSnapshot());
      }
      if (req.method === "POST" && url.pathname === "/api/dispatch/marvis") {
        const body = await readRequestJson(req);
        if (!body.text || typeof body.text !== "string") {
          return sendJson(res, { error: "text is required" }, 400);
        }
        const result = dashboardActions.dispatchDashboardMarvis(config, body);
        broadcastDashboardUpdate("dispatch:marvis");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/radio/promote") {
        const body = await readRequestJson(req);
        if (!body.id || typeof body.id !== "string") {
          return sendJson(res, { error: "id is required" }, 400);
        }
        const result = dashboardActions.promoteDashboardRadio(body);
        broadcastDashboardUpdate("radio:promote");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/sync") {
        const result = dashboardActions.syncDashboardMemory();
        broadcastDashboardUpdate("sync");
        return sendJson(res, result);
      }
      if (req.method === "POST" && url.pathname === "/api/pull") {
        const result = dashboardActions.pullDashboardMemory();
        broadcastDashboardUpdate("pull");
        return sendJson(res, result);
      }
      if (req.method === "GET" && url.pathname === "/api/install/preview") {
        const toolName = url.searchParams.get("tool");
        const isLocal = url.searchParams.get("scope") === "local";
        try {
          return sendJson(res, dashboardActions.getDashboardInstallPreview(config, { toolName, isLocal }));
        } catch (error) {
          return sendJson(res, { error: error.message || String(error) }, 404);
        }
      }
      if (req.method === "POST" && url.pathname === "/api/install/apply") {
        const body = await readRequestJson(req);
        const toolName = body.tool;
        if (!toolName) {
          return sendJson(res, { error: "tool is required" }, 400);
        }
        let result;
        try {
          result = dashboardActions.applyDashboardInstall(config, body);
        } catch (error) {
          return sendJson(res, { error: error.message || String(error) }, 404);
        }
        broadcastDashboardUpdate("install:apply");
        return sendJson(res, result);
      }
      // SPA fallback: serve Dashboard HTML for all other GET requests
      // This allows React Router to handle client-side routing for paths like /tasks, /workflows, etc.
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && path.extname(url.pathname)) {
        return sendPlain(res, "Not Found", 404);
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        return sendHtml(res, renderDashboard());
      }
      return sendJson(res, { error: "not found" }, 404);
    } catch (error) {
      console.error(`[req-error] ${requestMethod} ${requestRawPath}:`, error);
      return sendErrorEnvelope(res, 500, error?.message || String(error), process.env.AMH_DEBUG === "1" ? String(error?.stack || "") : undefined);
    }
  });

  server.on("upgrade", (req, socket) => {
    realtime.handleUpgrade(req, socket, host, port);
  });

  const stopDashboardWatcher = dashboardRealtime.watchDashboardState(config.memoryDir, broadcastDashboardUpdate);
  server.on("close", () => {
    stopDashboardWatcher();
    realtime.close();
  });

  server.listen(port, host, () => {
    console.log(`AI Memory Hub app: http://${host}:${port}`);
  });
}
