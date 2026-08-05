import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { aggregateSkillSources, scanSkillRoots } from "../src/shared-skill-scan.js";
import { importSharedPack } from "../src/shared-skills.js";
import { disableProjectSkill, getSkillLifecycleState, selectProjectSkillVersion, setProjectSkill, loadProjectSkillManifest } from "../src/shared-skill-project.js";

async function makeSkillRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-lifecycle-"));
  const entries = [
    ["codex", "deep-discuss", "# Deep Discuss\nshared\n"],
    ["claude", "deep-discuss", "# Deep Discuss\nshared\n"],
    ["gemini", "deep-discuss", "# Deep Discuss\nchanged\n"],
    ["codex", "independent", "# Independent\n"]
  ];
  for (const [tool, id, content] of entries) {
    const directory = path.join(root, tool, id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "SKILL.md"), content, "utf8");
  }
  return root;
}

test("skill source aggregation folds identical copies and marks content conflicts", async () => {
  const root = await makeSkillRoot();
  try {
    const sources = await scanSkillRoots([
      { tool: "codex", path: path.join(root, "codex") },
      { tool: "claude", path: path.join(root, "claude") },
      { tool: "gemini", path: path.join(root, "gemini") }
    ]);
    const groups = aggregateSkillSources(sources);
    const deepDiscuss = groups.find((item) => item.id === "deep-discuss");
    assert.equal(deepDiscuss.sourceCount, 3);
    assert.equal(deepDiscuss.duplicateCount, 1);
    assert.equal(deepDiscuss.contentHashes.length, 2);
    assert.equal(deepDiscuss.status, "conflict");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("skill source aggregation returns one discovered group for a unique source", async () => {
  const root = await makeSkillRoot();
  try {
    const sources = await scanSkillRoots([{ tool: "codex", path: path.join(root, "codex") }]);
    const groups = aggregateSkillSources(sources);
    assert.deepEqual(groups.map((item) => item.id), ["deep-discuss", "independent"]);
    assert.equal(groups[1].status, "discovered");
    assert.equal(groups[1].sourceCount, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Skill pack import preserves members and auxiliary files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-pack-"));
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-memory-"));
  try {
    await fs.mkdir(path.join(root, "skills", "lark-doc"), { recursive: true });
    await fs.mkdir(path.join(root, "skills", "lark-drive"), { recursive: true });
    await fs.mkdir(path.join(root, "scripts"), { recursive: true });
    await fs.mkdir(path.join(root, "references"), { recursive: true });
    await fs.writeFile(path.join(root, "amh-pack.json"), JSON.stringify({
      id: "lark-toolkit",
      version: "1.0.0",
      skills: [
        { id: "lark-doc", path: "skills/lark-doc" },
        { id: "lark-drive", path: "skills/lark-drive" }
      ],
      dependencies: [{ id: "deep-discuss", constraint: "*" }],
      credentials: [{ id: "lark", envVar: "LARK_TOKEN" }],
      targets: ["codex", "claude"]
    }, null, 2));
    await fs.writeFile(path.join(root, "skills", "lark-doc", "SKILL.md"), "# Lark Docs\n");
    await fs.writeFile(path.join(root, "skills", "lark-drive", "SKILL.md"), "# Lark Drive\n");
    await fs.writeFile(path.join(root, "scripts", "check.mjs"), "export default true;\n");
    await fs.writeFile(path.join(root, "references", "guide.md"), "# Guide\n");

    const imported = await importSharedPack(memoryDir, root);
    assert.equal(imported.package, true);
    assert.equal(imported.skills.length, 2);
    assert.equal(imported.dependencies[0].id, "deep-discuss");
    assert.equal(await fs.readFile(path.join(imported.packagePath, "scripts", "check.mjs"), "utf8"), "export default true;\n");
    assert.equal(await fs.readFile(path.join(imported.packagePath, "skills", "lark-doc", "SKILL.md"), "utf8"), "# Lark Docs\n");

    const reused = await importSharedPack(memoryDir, root);
    assert.equal(reused.reused, true);
    const nestedImport = await importSharedPack(memoryDir, path.join(root, "skills", "lark-doc"));
    assert.equal(nestedImport.reused, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
});

test("project lifecycle can select, disable, and detect a newer immutable version", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-project-"));
  try {
    await setProjectSkill(projectRoot, "lark-doc", "~1.0.0");
    const versions = [
      { id: "lark-doc", version: "1.0.0", contentHash: "sha256:a" },
      { id: "lark-doc", version: "1.0.2", contentHash: "sha256:b" }
    ];
    let manifest = await loadProjectSkillManifest(projectRoot);
    let state = getSkillLifecycleState(manifest, versions, "lark-doc");
    assert.equal(state.selectedVersion, "1.0.2");
    assert.equal(state.updateAvailable, false);
    await selectProjectSkillVersion(projectRoot, "lark-doc", "1.0.0");
    manifest = await loadProjectSkillManifest(projectRoot);
    state = getSkillLifecycleState(manifest, versions, "lark-doc");
    assert.equal(state.selectedVersion, "1.0.0");
    assert.equal(state.updateAvailable, true);
    await disableProjectSkill(projectRoot, "lark-doc");
    manifest = await loadProjectSkillManifest(projectRoot);
    assert.equal(manifest.skills["lark-doc"].enabled, false);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
