import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listRelatedEntities, readRelations, recordMemoryRelations, recordRelation, revokeRelation } from "../src/relations.js";

test("relations are append-only, deduplicated, and revocable", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-relations-"));
  try {
    const first = recordRelation(root, { from: { type: "skill", id: "lark-doc" }, to: { type: "project", id: "feishu" }, relation: "enabled-in", evidence: { source: "project-manifest" } });
    const reused = recordRelation(root, { from: { type: "skill", id: "lark-doc" }, to: { type: "project", id: "feishu" }, relation: "enabled-in" });
    assert.equal(first.reused, false);
    assert.equal(reused.reused, true);
    assert.equal(readRelations(root).length, 1);
    const revoked = revokeRelation(root, first.id, "disabled by user");
    assert.equal(revoked.status, "revoked");
    assert.equal(listRelatedEntities(root, { type: "skill", id: "lark-doc" }, { includeSuggestions: false }).explicit.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("relation suggestions connect existing project and skill fields without rewriting memories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-relations-"));
  try {
    await fs.mkdir(path.join(root, "memories"), { recursive: true });
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.writeFile(path.join(root, "memories", "index.json"), JSON.stringify({ records: [{ localEventId: "memory-1", project: "feishu", tags: ["lark-doc"], text: "lark-doc usage" }] }));
    await fs.writeFile(path.join(root, "tasks", "tasks.jsonl"), JSON.stringify({ id: "task-1", project: "feishu", skills: ["lark-doc"] }) + "\n");
    const project = listRelatedEntities(root, { type: "project", id: "feishu" });
    const skill = listRelatedEntities(root, { type: "skill", id: "lark-doc" });
    assert.equal(project.suggestions.length, 2);
    assert.equal(skill.suggestions.length, 2);
    assert.ok(skill.suggestions.some((item) => item.from.type === "task"));
    assert.ok(skill.suggestions.some((item) => item.from.type === "memory"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("memory writes create explicit high-confidence relations from declared metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "amh-memory-relations-"));
  try {
    const event = { id: "memory-1", metadata: { project: "feishu", skills: ["lark-doc"], refs: { taskId: "task-1", workflowId: "workflow-1" } } };
    const created = recordMemoryRelations(root, event);
    assert.equal(created.length, 4);
    assert.ok(created.every((item) => item.source === "memory-write" && item.confidence === 1));
    const relations = readRelations(root);
    assert.ok(relations.some((item) => item.to.type === "project" && item.to.id === "feishu"));
    assert.ok(relations.some((item) => item.to.type === "skill" && item.to.id === "lark-doc"));
    assert.ok(relations.some((item) => item.to.type === "task" && item.to.id === "task-1"));
    assert.ok(relations.some((item) => item.to.type === "workflow" && item.to.id === "workflow-1"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
