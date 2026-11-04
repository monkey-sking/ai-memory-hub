import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  disableProjectSkill,
  loadProjectSkillManifest,
  removeProjectSkillGroup,
  selectProjectSkills,
  selectProjectSkillsForTargets,
  setProjectSkill,
  setProjectSkillGroup,
  setProjectSkillGroupEnabled
} from "../src/shared-skill-project.js";

const packages = [
  { id: "release", version: "1.0.0", contentHash: "sha256:a" },
  { id: "release", version: "1.2.0", contentHash: "sha256:b" },
  { id: "review", version: "2.0.0", contentHash: "sha256:c" }
];

test("Skill groups support mixed member declarations and target filtering", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-group-"));
  try {
    await setProjectSkill(root, "release", "1.0.0");
    await setProjectSkillGroup(root, "delivery", [
      "release@^1.0.0",
      { id: "review", constraint: "2.0.0" }
    ], { description: "Delivery workflow", targets: ["Codex", "claude"] });

    const manifest = await loadProjectSkillManifest(root);
    assert.equal(manifest.version, 2);
    assert.deepEqual(manifest.groups.delivery.targets, ["codex", "claude"]);
    assert.deepEqual(selectProjectSkills(manifest, packages, "codex").map(ids), ["release@1.0.0", "review@2.0.0"]);
    assert.deepEqual(selectProjectSkills(manifest, packages, "gemini").map(ids), ["release@1.0.0"]);

    const selected = selectProjectSkillsForTargets(manifest, packages, ["codex", "gemini"]);
    assert.deepEqual(selected.codex.map(ids), ["release@1.0.0", "review@2.0.0"]);
    assert.deepEqual(selected.gemini.map(ids), ["release@1.0.0"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Skill groups can be disabled, overridden, and removed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-group-"));
  try {
    await setProjectSkillGroup(root, "review", [{ id: "review" }]);
    let manifest = await loadProjectSkillManifest(root);
    assert.deepEqual(selectProjectSkills(manifest, packages).map(ids), ["review@2.0.0"]);

    manifest = await setProjectSkillGroupEnabled(root, "review", false);
    assert.equal(manifest.groups.review.enabled, false);
    assert.deepEqual(selectProjectSkills(manifest, packages), []);

    manifest = await setProjectSkillGroupEnabled(root, "review", true);
    manifest = await disableProjectSkill(root, "review");
    assert.deepEqual(selectProjectSkills(manifest, packages), []);

    manifest = await setProjectSkill(root, "review", "2.0.0");
    assert.deepEqual(selectProjectSkills(manifest, packages).map(ids), ["review@2.0.0"]);

    manifest = await removeProjectSkillGroup(root, "review");
    assert.deepEqual(manifest.groups, {});
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function ids(item) {
  return `${item.id}@${item.version}`;
}
