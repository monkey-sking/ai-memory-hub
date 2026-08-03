import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addPack, listPacks, setPackEnabled, validatePack } from "../src/domain-packs.js";
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

