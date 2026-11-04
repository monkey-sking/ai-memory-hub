import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadProjectIndex,
  normalizeProjectLabel,
  resolveProject,
  resolveProjectRoot
} from "../src/lib/project-resolver.js";
import { setProjectSkill } from "../src/shared-skill-project.js";

async function makeMemoryDir() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-project-resolver-"));
  return root;
}

async function writeProjects(memoryDir, projects) {
  await fs.mkdir(path.join(memoryDir, "projects"), { recursive: true });
  await fs.writeFile(
    path.join(memoryDir, "projects", "projects.jsonl"),
    projects.map((project) => JSON.stringify(project)).join("\n") + "\n",
    "utf8"
  );
}

test("resolveProject maps id, alias, and path prefixes to registry ids", async () => {
  const memoryDir = await makeMemoryDir();
  const lifeosRoot = path.join(memoryDir, "roots", "LifeOS");
  const aionRoot = path.join(memoryDir, "roots", "aion");
  await fs.mkdir(lifeosRoot, { recursive: true });
  await fs.mkdir(aionRoot, { recursive: true });
  await writeProjects(memoryDir, [
    { id: "lifeos", name: "LifeOS", status: "active", aliases: ["one-jot"], resources: { path: lifeosRoot } },
    { id: "aion", name: "Aion", status: "active", resources: { path: aionRoot } }
  ]);

  try {
    const index = loadProjectIndex(memoryDir);
    assert.equal(resolveProject(memoryDir, "lifeos", index)?.id, "lifeos");
    assert.equal(resolveProject(memoryDir, "LifeOS", index)?.id, "lifeos");
    assert.equal(resolveProject(memoryDir, "one-jot", index)?.id, "lifeos");
    assert.equal(resolveProject(memoryDir, "AION", index)?.id, "aion");

    const child = path.join(aionRoot, "AionWebsite");
    assert.equal(resolveProject(memoryDir, child, index)?.match, "path");
    assert.equal(resolveProject(memoryDir, child, index)?.id, "aion");

    assert.equal(resolveProjectRoot(memoryDir, "lifeos", index), lifeosRoot);
    assert.equal(resolveProject(memoryDir, "not-a-project", index), null);
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
});

test("resolveProject prefers the longest registered root", async () => {
  const memoryDir = await makeMemoryDir();
  const parentRoot = path.join(memoryDir, "roots", "parent");
  const childRoot = path.join(parentRoot, "child");
  await fs.mkdir(childRoot, { recursive: true });
  await writeProjects(memoryDir, [
    { id: "parent", name: "Parent", status: "active", resources: { path: parentRoot } },
    { id: "child", name: "Child", status: "active", resources: { path: childRoot } }
  ]);

  try {
    const index = loadProjectIndex(memoryDir);
    assert.equal(resolveProject(memoryDir, parentRoot, index)?.id, "parent");
    assert.equal(resolveProject(memoryDir, childRoot, index)?.id, "child");
    assert.equal(resolveProject(memoryDir, path.join(childRoot, "src"), index)?.id, "child");
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
});

test("normalizeProjectLabel canonicalizes known ids and filters noise", async () => {
  const memoryDir = await makeMemoryDir();
  const lifeosRoot = path.join(memoryDir, "roots", "LifeOS");
  await fs.mkdir(lifeosRoot, { recursive: true });
  await writeProjects(memoryDir, [
    { id: "lifeos", name: "LifeOS", status: "active", aliases: ["one-jot"], resources: { path: lifeosRoot } },
    { id: "重回拾光", name: "重回拾光", status: "active" }
  ]);

  try {
    const index = loadProjectIndex(memoryDir);
    assert.equal(normalizeProjectLabel(memoryDir, "LifeOS", index), "lifeos");
    assert.equal(normalizeProjectLabel(memoryDir, "one-jot", index), "lifeos");
    assert.equal(normalizeProjectLabel(memoryDir, lifeosRoot, index), "lifeos");

    assert.equal(normalizeProjectLabel(memoryDir, "重回拾光", index), "重回拾光");
    assert.equal(normalizeProjectLabel(memoryDir, "Some Project", index), "some-project");

    assert.equal(normalizeProjectLabel(memoryDir, "/tmp/unregistered-app", index), "unregistered-app");
    for (const noise of ["new-chat-12", "https://example.com/foo", "workspace", "2026-11-04", "", "12345"]) {
      assert.equal(normalizeProjectLabel(memoryDir, noise, index), "");
    }
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
});

test("project Skill manifest records the resolved projectId", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-project-manifest-"));
  try {
    const manifest = await setProjectSkill(root, "frontend-design", "^1.0.0", "lifeos");
    assert.equal(manifest.projectId, "lifeos");
    assert.equal(manifest.skills["frontend-design"].constraint, "^1.0.0");

    const raw = JSON.parse(await fs.readFile(path.join(root, ".amh", "skills.json"), "utf8"));
    assert.equal(raw.projectId, "lifeos");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
