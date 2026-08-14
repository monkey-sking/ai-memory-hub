import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applySkillGarbageCollection,
  planSkillGarbageCollection,
  rollbackSkillGarbageCollection
} from "../src/skill-gc.js";

async function makePackage(memoryDir, id, directory, version = "1.0.0") {
  const root = path.join(memoryDir, "skill-store", "packages", id, directory);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "SKILL.md"), `# ${id}\n`, "utf8");
  await fs.writeFile(path.join(root, "skill.json"), JSON.stringify({ id, version, packagePath: root }), "utf8");
  return root;
}

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-gc-"));
  const memoryDir = path.join(root, "memory");
  const projectRoot = path.join(root, "project");
  await fs.mkdir(path.join(projectRoot, ".amh"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, ".amh", "skills.json"), JSON.stringify({
    version: 1,
    skills: { keep: { constraint: "1.0.0", enabled: true } },
    targets: []
  }), "utf8");
  const selected = await makePackage(memoryDir, "keep", "1.0.0", "1.0.0");
  const old = await makePackage(memoryDir, "keep", "1.0.0-oldhash", "1.0.0");
  const orphan = await makePackage(memoryDir, "orphan", "1.0.0", "1.0.0");
  return { root, memoryDir, projectRoot, selected, old, orphan };
}

test("GC plan protects the package selected by the project manifest", async () => {
  const fixture = await makeFixture();
  const plan = await planSkillGarbageCollection(fixture.memoryDir, fixture.projectRoot);

  assert.deepEqual(plan.protected.map((item) => item.packagePath), [fixture.selected]);
  assert.deepEqual(plan.candidates.map((item) => item.packagePath).sort(), [fixture.old, fixture.orphan].sort());
  assert.equal(plan.apply, false);
  await assert.doesNotReject(() => fs.stat(fixture.old));
});

test("GC apply creates a backup and rollback restores removed packages", async () => {
  const fixture = await makeFixture();
  const applied = await applySkillGarbageCollection(fixture.memoryDir, fixture.projectRoot, { confirm: "GC" });

  assert.equal(applied.removed.length, 2);
  await assert.rejects(() => fs.stat(fixture.old), { code: "ENOENT" });
  await assert.rejects(() => fs.stat(fixture.orphan), { code: "ENOENT" });

  const restored = await rollbackSkillGarbageCollection(fixture.memoryDir, applied.operationId);
  assert.equal(restored.restored.length, 2);
  await assert.doesNotReject(() => fs.stat(fixture.old));
  await assert.doesNotReject(() => fs.stat(fixture.orphan));
});
