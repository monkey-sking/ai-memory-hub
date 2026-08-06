import { readRegistry, upsertRecord, removeRecord, redactSecrets } from "./extension-registry.js";
import { createAdapter } from "./extension-adapters.js";
import { listSharedSkillPackages } from "./shared-skills.js";
import { loadProjectSkillManifest, removeProjectSkill, selectProjectSkills } from "./shared-skill-project.js";
import { doctorSkillProjections, syncSkillProjections } from "./shared-skill-materializer.js";

const DEFAULT_APPS = ["claude", "codex", "gemini", "opencode"];

export async function listExtensions(memoryDir, { kind = "mcp" } = {}) {
  const registry = await readRegistry(memoryDir);
  const bucket = kind === "skill" ? "skills" : "mcp";
  return Object.values(registry[bucket] || {});
}

export async function importExtensions(memoryDir, { apps = DEFAULT_APPS, homeDir } = {}) {
  const imported = [];
  for (const app of apps) {
    const adapter = createAdapter({ app, homeDir });
    const { records } = await adapter.readMcp();
    for (const record of records) {
      imported.push(
        await upsertRecord(memoryDir, {
          ...record,
          managed: true,
          source: "import",
        })
      );
    }
  }
  return { imported: imported.map(redactSecrets) };
}

export async function diffExtensions(memoryDir, { apps = DEFAULT_APPS, homeDir } = {}) {
  const registry = await readRegistry(memoryDir);
  const changes = [];
  for (const app of apps) {
    const live = await createAdapter({ app, homeDir }).readMcp();
    const registryMcp = Object.values(registry.mcp || {});
    const registryIds = new Set();

    for (const record of registryMcp) {
      if (record.kind !== "mcp") continue;
      if (record.apps?.[app] === false) continue;
      registryIds.add(record.id);
      const found = live.records.find((r) => r.id === record.id);
      const action = found
        ? JSON.stringify(found.server) === JSON.stringify(record.server)
          ? "current"
          : "conflict"
        : "add";
      changes.push({ app, id: record.id, action });
    }

    for (const liveRecord of live.records) {
      if (!registryIds.has(liveRecord.id)) {
        changes.push({ app, id: liveRecord.id, action: "add" });
      }
    }
  }
  return { changes };
}

export async function syncExtensions(memoryDir, options = {}) {
  const diff = await diffExtensions(memoryDir, options);
  const registry = await readRegistry(memoryDir);
  const result = { ...diff, applied: false, skipped: [] };
  if (!options.apply) return result;

  for (const app of options.apps || DEFAULT_APPS) {
    const registryMcp = Object.values(registry.mcp || {});
    const records = registryMcp.filter(
      (r) => r.kind === "mcp" && r.apps?.[app] !== false
    );
    const conflicts = diff.changes.filter(
      (c) => c.app === app && c.action === "conflict"
    );
    if (conflicts.length && options.force === false) {
      result.skipped.push(...conflicts);
      continue;
    }
    await createAdapter({ app, homeDir: options.homeDir }).writeMcp(records, {
      apply: true,
    });
  }
  result.applied = true;
  return result;
}

export async function diffSkillExtensions(memoryDir, { projectRoot, apps = DEFAULT_APPS } = {}) {
  const project = projectRoot || process.cwd();
  const manifest = await loadProjectSkillManifest(project);
  const packages = selectProjectSkills(manifest, await listSharedSkillPackages(memoryDir));
  return { project, packages: packages.map((item) => `${item.id}@${item.version}`), changes: await doctorSkillProjections(project, packages, apps) };
}

export async function syncSkillExtensions(memoryDir, { projectRoot, apps = DEFAULT_APPS, apply = false } = {}) {
  const project = projectRoot || process.cwd();
  const diff = await diffSkillExtensions(memoryDir, { projectRoot: project, apps });
  if (!apply) return { ...diff, applied: false };
  const manifest = await loadProjectSkillManifest(project);
  const packages = selectProjectSkills(manifest, await listSharedSkillPackages(memoryDir));
  return { ...diff, result: await syncSkillProjections(project, packages, apps), applied: true };
}

export async function removeSkillExtension(_memoryDir, { projectRoot, id } = {}) {
  if (!id) throw new Error("Skill id is required");
  return removeProjectSkill(projectRoot || process.cwd(), id);
}

export async function removeExtensions(memoryDir, id, { apps = DEFAULT_APPS, apply = false } = {}) {
  const registry = await readRegistry(memoryDir);
  const record = registry.mcp?.[id];
  if (!record) {
    return { removed: false, error: `Extension not found: ${id}` };
  }
  
  if (!apply) {
    return { removed: false, record: redactSecrets(record), apply: false };
  }
  
  await removeRecord(memoryDir, "mcp", id);
  
  const results = [];
  for (const app of apps) {
    if (record.apps?.[app]) {
      const adapter = createAdapter({ app, homeDir: process.env.HOME || process.env.USERPROFILE });
      const { records } = await adapter.readMcp();
      const filtered = records.filter(r => r.id !== id);
      await adapter.writeMcp(filtered, { apply: true });
      results.push({ app, removed: true });
    }
  }
  
  return { removed: true, record: redactSecrets(record), results };
}

export async function statusExtensions(memoryDir, { apps = DEFAULT_APPS, homeDir } = {}) {
  const registry = await readRegistry(memoryDir);
  const status = {
    registry: {
      mcp: Object.keys(registry.mcp || {}).length,
      skills: Object.keys(registry.skills || {}).length,
    },
    clients: {},
  };
  
  for (const app of apps) {
    const adapter = createAdapter({ app, homeDir });
    const { records: mcpRecords, diagnostics: mcpDiags } = await adapter.readMcp();
    const { records: skillRecords, diagnostics: skillDiags } = await adapter.readSkills();
    
    status.clients[app] = {
      mcp: mcpRecords.length,
      skills: skillRecords.length,
      diagnostics: [...mcpDiags, ...skillDiags],
      managed: {
        mcp: mcpRecords.filter(r => r.managed).length,
        skills: skillRecords.filter(r => r.managed).length,
      },
    };
  }
  
  return status;
}
