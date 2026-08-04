import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addPack, discoverPacks, getEnabledPacks, listPacks, setPackEnabled, validatePack } from "../src/domain-packs.js";
import { listSkills, searchSkills } from "../src/skill-registry.js";

test("domain pack registry validates, registers, enables, and rejects traversal", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-pack-"));
  try {
    await fs.mkdir(path.join(root, "skills"), { recursive: true });
    await fs.writeFile(path.join(root, "skills", "reverse.md"), "# Reverse skill\n", "utf8");
    const valid = validatePack(root, { id: "reverse-skill", name: "Reverse", version: "1.0.0", root, entry: { skills: "skills" } });
    assert.equal(valid.valid, true);
    const record = addPack(root, { id: "reverse-skill", name: "Reverse", version: "1.0.0", root, entry: { skills: "skills" } });
    assert.equal(record.enabled, false);
    const enabled = setPackEnabled(root, "reverse-skill", true);
    assert.equal(enabled.enabled, true);
    assert.equal(listPacks(root)[0].id, "reverse-skill");
    const invalid = validatePack(root, { id: "bad", root, entry: { skills: "../outside" } });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some((item) => /outside|traversal/i.test(item)));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("skill registry discovers local markdown and searches by title/content", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skills-"));
  try {
    await fs.mkdir(path.join(root, "skills", "reverse"), { recursive: true });
    await fs.writeFile(path.join(root, "skills", "reverse", "SKILL.md"), "# Reverse Engineering\nUse evidence before conclusions.\n", "utf8");
    const skills = listSkills(root);
    assert.equal(skills.length, 1);
    assert.equal(searchSkills(root, "evidence")[0].id, "reverse");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("registry loads generic manifests and keeps resolved entry paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-generic-pack-"));
  const memoryDir = path.join(root, "memory");
  const packRoot = path.join(root, "pack");
  try {
    for (const entry of ["skills", "recipes", "capabilities", "schemas"]) await fs.mkdir(path.join(packRoot, entry), { recursive: true });
    await fs.writeFile(path.join(packRoot, "amh-pack.json"), JSON.stringify({
      id: "generic-domain-pack",
      name: "Generic Domain Pack",
      version: "1.2.3",
      type: "domain-pack",
      source: "external",
      root: packRoot,
      entry: { skills: "skills", recipes: "recipes", capabilities: "capabilities", schemas: "schemas" }
    }), "utf8");

    const record = addPack(memoryDir, packRoot);
    assert.equal(record.type, "domain-pack");
    assert.equal(record.source, "external");
    assert.equal(record.manifest.id, "generic-domain-pack");
    assert.equal(record.paths.recipes, path.join(packRoot, "recipes"));
    assert.equal(record.enabled, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("registry discovers manifests from explicit roots and the data pack directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-discover-pack-"));
  const memoryDir = path.join(root, "memory");
  const explicitRoot = path.join(root, "explicit");
  const dataPackRoot = path.join(memoryDir, "packs", "data-pack");
  try {
    await fs.mkdir(explicitRoot, { recursive: true });
    await fs.mkdir(dataPackRoot, { recursive: true });
    await fs.writeFile(path.join(explicitRoot, "amh-pack.json"), JSON.stringify({ id: "explicit-pack", root: explicitRoot }), "utf8");
    await fs.writeFile(path.join(dataPackRoot, "amh-pack.json"), JSON.stringify({ id: "data-pack", root: dataPackRoot }), "utf8");
    const discovered = discoverPacks(memoryDir, [explicitRoot]);
    assert.deepEqual(discovered.map((item) => item.manifest.id).sort(), ["data-pack", "explicit-pack"]);
    assert.equal(discovered.every((item) => item.valid), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("enabled pack projection excludes packs that are no longer valid", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-enabled-pack-"));
  const memoryDir = path.join(root, "memory");
  const packRoot = path.join(root, "pack");
  try {
    await fs.mkdir(path.join(packRoot, "skills"), { recursive: true });
    const manifest = { id: "enabled-pack", root: packRoot, entry: { skills: "skills" } };
    addPack(memoryDir, manifest);
    setPackEnabled(memoryDir, "enabled-pack", true);
    assert.equal(getEnabledPacks(memoryDir).length, 1);
    await fs.rm(path.join(packRoot, "skills"), { recursive: true });
    assert.equal(getEnabledPacks(memoryDir).length, 0);
    assert.equal(listPacks(memoryDir)[0].enabled, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

