import { diffSkillExtensions, removeSkillExtension } from "../extension-sync.js";
import { renderSkillMarkdown } from "../external-integrations.js";
import { getOption, positionalArgs } from "../lib/cli.js";
import { doctorSkillProjections, syncSkillProjections } from "../shared-skill-materializer.js";
import { loadProjectSkillManifest, removeProjectSkill, selectProjectSkills, setProjectSkill } from "../shared-skill-project.js";
import { defaultSkillRoots, scanSkillRoots } from "../shared-skill-scan.js";
import { withPreparedSkillSource } from "../shared-skill-sources.js";
import { findSharedSkillPackage, importSharedSkill, listSharedSkillPackages } from "../shared-skills.js";
import { applySkillGarbageCollection, planSkillGarbageCollection, rollbackSkillGarbageCollection } from "../skill-gc.js";
import { applyCandidateDecision } from "../skill-mining.js";
import { listSkills, searchSkills } from "../skill-registry.js";

// skill command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function skillCandidateCommand(argv, deps) {
  const action = argv[0] || "list";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  switch (action) {
    case "list": {
      const status = getOption(argv, "--status") || "";
      const candidates = deps.readSkillCandidates(config.memoryDir).filter((candidate) => !status || candidate.status === status);
      console.log(JSON.stringify(candidates, null, 2));
      break;
    }
    case "approve":
    case "reject": {
      const id = getOption(argv, "--id") || positionalArgs(argv)[1] || "";
      const reviewer = getOption(argv, "--by") || "human";
      const note = getOption(argv, "--reason") || getOption(argv, "--note") || "";
      if (!id) throw new Error(`Usage: ai-memory-hub skill-candidate ${action} --id <id> [--by reviewer] [--note text]`);
      const candidate = deps.updateSkillCandidate(config.memoryDir, id, (current) => applyCandidateDecision(
        current,
        { status: action === "approve" ? "approved" : "rejected", reviewer, note }
      ));
      console.log(JSON.stringify(candidate, null, 2));
      break;
    }
    case "promote": {
      const id = getOption(argv, "--id") || positionalArgs(argv)[1] || "";
      const tool = getOption(argv, "--tool") || "";
      const section = getOption(argv, "--section") || "";
      const original = getOption(argv, "--original") || "";
      const proposed = getOption(argv, "--proposed") || "";
      if (!id || !tool || !original || !proposed) {
        throw new Error("Usage: ai-memory-hub skill-candidate promote --id <id> --tool <tool> --section <section> --original <text> --proposed <text>");
      }
      const candidate = deps.readSkillCandidates(config.memoryDir).find((item) => item.id === id || item.id.startsWith(id));
      if (!candidate) throw new Error(`Skill candidate not found: ${id}`);
      if (candidate.status !== "approved") throw new Error(`Skill candidate must be approved before promotion. Current status: ${candidate.status}`);
      const delta = deps.createSkillDelta({ tool, section, original, proposed, reason: candidate.text, createdBy: candidate.reviewedBy || "reviewer" });
      const deltas = deps.readSkillDeltas(config.memoryDir);
      deltas.push(delta);
      deps.writeSkillDeltas(config.memoryDir, deltas);
      const updated = deps.updateSkillCandidate(config.memoryDir, candidate.id, (current) => ({
        ...current,
        promotedDeltaId: delta.id,
        promotedAt: new Date().toISOString()
      }));
      console.log(JSON.stringify({ candidate: updated, delta }, null, 2));
      break;
    }
    default:
      throw new Error("Usage: ai-memory-hub skill-candidate list|approve|reject|promote");
  }
}

export async function skillCommand(argv, deps) {
  const action = argv[0] || "list";
  if (action === "--help" || action === "-h") {
    console.log("Usage: ai-memory-hub skill list|scan|import|install|show|update|rollback|enable|disable|sync|doctor|diff|remove|gc|gc-rollback|search|attach|render [--app <client>] [--all] [--apply] [--force]");
    return;
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const app = getOption(argv.slice(1), "--app");
  const allApps = argv.includes("--all");
  const apps = allApps ? ["claude", "codex", "gemini", "opencode"] : (app ? [app] : ["claude", "codex", "gemini", "opencode"]);
  if (action === "list") {
    console.log(JSON.stringify(listSkills(config.memoryDir), null, 2)); return;
  }
  if (action === "scan") {
    const root = getOption(argv.slice(1), "--root");
    const roots = root ? [{ tool: getOption(argv.slice(1), "--tool") || "custom", path: root }] : defaultSkillRoots();
    console.log(JSON.stringify(await scanSkillRoots(roots), null, 2)); return;
  }
  if (action === "import" || action === "install") {
    const source = getOption(argv.slice(1), "--path") || argv[1] || "";
    if (!source) throw new Error("Usage: ai-memory-hub skill import|install --path <skill-directory> [--version <version>] [--project <path>]");
    const imported = await withPreparedSkillSource(config.memoryDir, source, { ref: getOption(argv.slice(1), "--ref") }, (prepared) => importSharedSkill(config.memoryDir, prepared.path, { id: getOption(argv.slice(1), "--id"), version: getOption(argv.slice(1), "--version") || "1.0.0", source: prepared.source }));
    const project = getOption(argv.slice(1), "--project");
    let synced = [];
    let manifest = null;
    if (project) {
      manifest = await setProjectSkill(project, imported.id, getOption(argv.slice(1), "--version") || imported.version);
      const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
      synced = await syncSkillProjections(project, packages, getOption(argv.slice(1), "--tool") ? [getOption(argv.slice(1), "--tool")] : (manifest.targets.length ? manifest.targets : ["codex", "claude", "gemini", "opencode", "antigravity"]));
    }
    console.log(JSON.stringify({ imported, project: project || "", manifest, synced }, null, 2)); return;
  }
  if (action === "update") {
    const source = getOption(argv.slice(1), "--path");
    if (!source) throw new Error("Usage: ai-memory-hub skill update --path <skill-directory> --version <version> [--project <path>]");
    const imported = await withPreparedSkillSource(config.memoryDir, source, { ref: getOption(argv.slice(1), "--ref") }, (prepared) => importSharedSkill(config.memoryDir, prepared.path, { id: getOption(argv.slice(1), "--id"), version: getOption(argv.slice(1), "--version"), source: prepared.source }));
    const project = getOption(argv.slice(1), "--project");
    const manifest = project ? await setProjectSkill(project, imported.id, imported.version) : null;
    const packages = project ? selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir)) : [];
    const synced = project ? await syncSkillProjections(project, packages, getOption(argv.slice(1), "--tool") ? [getOption(argv.slice(1), "--tool")] : ["codex", "claude", "gemini", "opencode", "antigravity"]) : [];
    console.log(JSON.stringify({ imported, manifest, synced }, null, 2)); return;
  }
  if (action === "rollback") {
    const id = getOption(argv.slice(1), "--id") || argv[1] || "";
    const version = getOption(argv.slice(1), "--version");
    const project = getOption(argv.slice(1), "--project") || process.cwd();
    if (!id || !version) throw new Error("Usage: ai-memory-hub skill rollback <id> --version <version> --project <path>");
    const packageRecord = await findSharedSkillPackage(config.memoryDir, id, version);
    if (!packageRecord) throw new Error(`Skill package not found: ${id}@${version}`);
    const manifest = await setProjectSkill(project, id, version);
    const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
    const synced = await syncSkillProjections(project, packages, getOption(argv.slice(1), "--tool") ? [getOption(argv.slice(1), "--tool")] : ["codex", "claude", "gemini", "opencode", "antigravity"]);
    console.log(JSON.stringify({ package: packageRecord, manifest, synced }, null, 2)); return;
  }
  if (action === "show") {
    const id = getOption(argv.slice(1), "--id") || argv[1] || "";
    if (!id) throw new Error("Usage: ai-memory-hub skill show <id> [--version <version>]");
    console.log(JSON.stringify(await findSharedSkillPackage(config.memoryDir, id, getOption(argv.slice(1), "--version")), null, 2)); return;
  }
  if (action === "enable" || action === "disable") {
    const project = getOption(argv.slice(1), "--project") || process.cwd();
    const id = getOption(argv.slice(1), "--id") || argv[1] || "";
    if (!id) throw new Error(`Usage: ai-memory-hub skill ${action} <id> --project <path>`);
    const manifest = action === "enable" ? await setProjectSkill(project, id, getOption(argv.slice(1), "--version") || "*") : await removeProjectSkill(project, id);
    console.log(JSON.stringify(manifest, null, 2)); return;
  }
  if (action === "sync" || action === "doctor") {
    const project = getOption(argv.slice(1), "--project") || process.cwd();
    const apply = argv.includes("--apply");
    const force = argv.includes("--force");
    const manifest = await loadProjectSkillManifest(project);
    const packages = selectProjectSkills(manifest, await listSharedSkillPackages(config.memoryDir));
    const targets = apps;
    const result = action === "sync" ? await syncSkillProjections(project, packages, targets) : await doctorSkillProjections(project, packages, targets);
    console.log(JSON.stringify({ project, packages: packages.map((item) => `${item.id}@${item.version}`), targets, result, applied: apply, force }, null, 2)); return;
  }
  if (action === "diff") {
    const project = getOption(argv.slice(1), "--project") || process.cwd();
    console.log(JSON.stringify(await diffSkillExtensions(config.memoryDir, { projectRoot: project, apps }), null, 2)); return;
  }
  if (action === "gc") {
    const project = getOption(argv.slice(1), "--project") || process.cwd();
    const result = argv.includes("--apply")
      ? await applySkillGarbageCollection(config.memoryDir, project, { confirm: getOption(argv.slice(1), "--confirm") })
      : await planSkillGarbageCollection(config.memoryDir, project);
    console.log(JSON.stringify(result, null, 2)); return;
  }
  if (action === "gc-rollback") {
    const operationId = getOption(argv.slice(1), "--id") || argv[1] || "";
    if (!operationId) throw new Error("Usage: ai-memory-hub skill gc-rollback <operation-id>");
    console.log(JSON.stringify(await rollbackSkillGarbageCollection(config.memoryDir, operationId), null, 2)); return;
  }
  if (action === "remove") {
    const id = getOption(argv.slice(1), "--id") || argv[1] || "";
    const project = getOption(argv.slice(1), "--project") || process.cwd();
    console.log(JSON.stringify(await removeSkillExtension(config.memoryDir, { projectRoot: project, id }), null, 2)); return;
  }
  if (action === "search") { console.log(JSON.stringify(searchSkills(config.memoryDir, argv.slice(1).join(" "),), null, 2)); return; }
  if (action === "attach") {
    const skillId = getOption(argv.slice(1), "--skill") || argv[1] || "";
    const taskId = getOption(argv.slice(1), "--task") || "";
    if (!skillId || !taskId) throw new Error("Usage: ai-memory-hub skill attach --skill <skill-id> --task <task-id>");
    const skill = listSkills(config.memoryDir).find((item) => item.id === skillId || item.id.startsWith(skillId));
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    const task = deps.withHubLock(config.memoryDir, "skill-attach", () => deps.updateTask(config.memoryDir, taskId, (current) => ({ ...current, skills: [...new Set([...(current.skills || []), skill.id])], updatedAt: new Date().toISOString() })), config.sync.lockStaleMs);
    console.log(JSON.stringify({ task, skill }, null, 2)); return;
  }
  if (action === "render") {
    const title = getOption(argv.slice(1), "--title") || "Generated skill";
    const text = getOption(argv.slice(1), "--text") || positionalArgs(argv.slice(1)).join(" ");
    if (!text) throw new Error("Usage: ai-memory-hub skill render --title <title> --text <rule> [--task <task-id>] [--evidence <item;item>]");
    console.log(renderSkillMarkdown({ title, text, sourceTaskId: getOption(argv.slice(1), "--task") || "unknown", evidence: (getOption(argv.slice(1), "--evidence") || "").split(";").map((item) => item.trim()).filter(Boolean) }));
    return;
  }
  throw new Error("Usage: ai-memory-hub skill list|scan|import|install|show|update|rollback|enable|disable|sync|doctor|diff|remove|gc|gc-rollback|search|attach|render");
}

export function skillDeltaCommand(argv, deps) {
  const action = argv[0] || "list";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  switch (action) {
    case "create": {
      const tool = getOption(argv, "--tool") || "";
      const section = getOption(argv, "--section") || "";
      const original = getOption(argv, "--original") || "";
      const proposed = getOption(argv, "--proposed") || "";
      const reason = getOption(argv, "--reason") || "";
      const createdBy = getOption(argv, "--from") || "observer";
      if (!tool || !original || !proposed) {
        throw new Error('Usage: ai-memory-hub skill-delta create --tool <name> --section <section> --original "old text" --proposed "new text" --reason "why"');
      }
      const delta = deps.createSkillDelta({ tool, section, original, proposed, reason, createdBy });
      const deltas = deps.readSkillDeltas(config.memoryDir);
      deltas.push(delta);
      deps.writeSkillDeltas(config.memoryDir, deltas);
      console.log(JSON.stringify(delta, null, 2));
      break;
    }
    case "list": {
      const tool = getOption(argv, "--tool") || "";
      const status = getOption(argv, "--status") || "";
      let deltas = deps.readSkillDeltas(config.memoryDir);
      if (tool) deltas = deltas.filter((d) => d.tool === tool);
      if (status) deltas = deltas.filter((d) => d.status === status);
      console.log(JSON.stringify(deltas, null, 2));
      break;
    }
    case "approve": {
      const id = positionalArgs(argv).slice(1)[0] || getOption(argv, "--id") || "";
      const reviewer = getOption(argv, "--by") || "human";
      if (!id) throw new Error("Usage: ai-memory-hub skill-delta approve <id> [--by reviewer]");
      const delta = deps.approveSkillDelta(config.memoryDir, id, reviewer);
      console.log(JSON.stringify(delta, null, 2));
      break;
    }
    case "reject": {
      const id = positionalArgs(argv).slice(1)[0] || getOption(argv, "--id") || "";
      const reviewer = getOption(argv, "--by") || "human";
      const reason = getOption(argv, "--reason") || "";
      if (!id) throw new Error("Usage: ai-memory-hub skill-delta reject <id> [--by reviewer] [--reason text]");
      const delta = deps.rejectSkillDelta(config.memoryDir, id, reviewer, reason);
      console.log(JSON.stringify(delta, null, 2));
      break;
    }
    case "merge": {
      const id = positionalArgs(argv).slice(1)[0] || getOption(argv, "--id") || "";
      if (!id) throw new Error("Usage: ai-memory-hub skill-delta merge <id>");
      const delta = deps.mergeSkillDelta(config.memoryDir, id);
      console.log(JSON.stringify(delta, null, 2));
      break;
    }
    default:
      throw new Error("Usage: ai-memory-hub skill-delta <create|list|approve|reject|merge>");
  }
}
