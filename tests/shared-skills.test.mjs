import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SKILL_REGISTRY_VERSION,
  hashSkillContent,
  importSharedSkill,
  listSharedSkillPackages,
  normalizeSkillId,
  readSkillPackage,
  validateSkillPackage
} from "../src/shared-skills.js";
import { listSkills, searchSkills } from "../src/skill-registry.js";

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-shared-skills-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("normalizes safe skill ids and rejects unsafe ids", () => {
  assert.equal(normalizeSkillId("systematic-debugging"), "systematic-debugging");
  assert.throws(() => normalizeSkillId("../secret"), /skill id/i);
  assert.throws(() => normalizeSkillId("Bad Skill"), /skill id/i);
});

test("hashSkillContent is a stable sha256 digest", () => {
  const expected = `sha256:${crypto.createHash("sha256").update("hello", "utf8").digest("hex")}`;
  assert.equal(hashSkillContent("hello"), expected);
  assert.equal(hashSkillContent("hello"), hashSkillContent("hello"));
});

test("validates and imports an immutable skill package", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "source", "browser");
    const memoryDir = path.join(dir, "memory");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), "# Browser\n\nUse the browser safely.\n", "utf8");

    const validation = await validateSkillPackage(source);
    assert.equal(validation.valid, true);
    assert.equal(validation.id, "browser");

    const imported = await importSharedSkill(memoryDir, source, { version: "1.2.0", source: { kind: "local", location: source } });
    assert.equal(imported.id, "browser");
    assert.equal(imported.version, "1.2.0");
    assert.equal(imported.registryVersion, SKILL_REGISTRY_VERSION);
    assert.match(imported.contentHash, /^sha256:/);
    assert.equal(await fs.readFile(path.join(imported.packagePath, "SKILL.md"), "utf8"), "# Browser\n\nUse the browser safely.\n");

    const listed = await listSharedSkillPackages(memoryDir);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, "browser");
    assert.deepEqual(await readSkillPackage(imported.packagePath), {
      id: "browser",
      version: "1.2.0",
      contentHash: imported.contentHash,
      packagePath: imported.packagePath
    });
  });
});

test("reimporting identical content is idempotent and conflicting content is retained", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "source", "browser");
    const memoryDir = path.join(dir, "memory");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), "# Browser\n", "utf8");
    const first = await importSharedSkill(memoryDir, source, { version: "1.0.0" });
    const second = await importSharedSkill(memoryDir, source, { version: "1.0.0" });
    assert.equal(second.packagePath, first.packagePath);
    await fs.writeFile(path.join(source, "SKILL.md"), "# Browser changed\n", "utf8");
    const conflict = await importSharedSkill(memoryDir, source, { version: "1.0.0" });
    assert.notEqual(conflict.contentHash, first.contentHash);
    assert.equal(conflict.conflict, true);
    assert.equal((await listSharedSkillPackages(memoryDir)).length, 2);
  });
});

test("canonical registry packages are visible to the skill registry and search", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "source", "browser");
    const memoryDir = path.join(dir, "memory");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), "# Browser\n\nSafe navigation.\n", "utf8");
    await importSharedSkill(memoryDir, source, { version: "1.0.0" });
    const listed = listSkills(memoryDir).filter((item) => item.source === "registry");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].version, "1.0.0");
    assert.equal(searchSkills(memoryDir, "navigation").length, 1);
  });
});
