import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { extractSkillUsageEvents } from "../src/lib/skill-usage-extract.js";
import { getSkillUsageFile } from "../src/skill-usage.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");

async function withTempEnv(fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-capture-home-"));
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-capture-hub-"));
  try {
    await fn({ home, memoryDir });
  } finally {
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
}

function runCli({ home, memoryDir }, args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, HOME: home, AI_MEMORY_DIR: memoryDir }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("extracts Skill usage from Codex function calls", () => {
  const lines = [
    JSON.stringify({ timestamp: "2026-11-04T01:00:00.000Z", type: "session_meta", payload: { id: "session-1", cwd: "/tmp/alpha" } }),
    JSON.stringify({
      timestamp: "2026-11-04T01:01:00.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        arguments: JSON.stringify({ cmd: "cat /Users/example/.codex/skills/magpie-quota/SKILL.md" })
      }
    })
  ];

  const events = extractSkillUsageEvents("codex", lines, "/tmp/sessions/alpha/session-1.jsonl");
  assert.equal(events.length, 1);
  assert.equal(events[0].skill, "magpie-quota");
  assert.equal(events[0].agent, "codex");
  assert.equal(events[0].project, "alpha");
  assert.equal(events[0].signal, "loaded");
  assert.equal(events[0].sessionId, "session-1");
});

test("capture scan records Skill usage and skips unchanged files", async () => {
  await withTempEnv(async (env) => {
    const transcript = path.join(env.home, ".codex", "sessions", "alpha", "session-1.jsonl");
    await fs.mkdir(path.dirname(transcript), { recursive: true });
    await fs.writeFile(transcript, [
      JSON.stringify({ timestamp: "2026-11-04T01:00:00.000Z", type: "session_meta", payload: { id: "session-1", cwd: "/tmp/alpha" } }),
      JSON.stringify({
        timestamp: "2026-11-04T01:01:00.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          arguments: JSON.stringify({ cmd: "cat /Users/example/.codex/skills/magpie-quota/SKILL.md" })
        }
      }),
      ""
    ].join("\n"), "utf8");

    const dryRun = runCli(env, ["capture", "scan", "--tool", "codex", "--dry-run"]);
    assert.equal(dryRun.skillUsage.eventsFound, 1);
    assert.equal(dryRun.skillUsage.eventsRecorded, 0);
    await assert.rejects(() => fs.access(getSkillUsageFile(env.memoryDir)));

    const first = runCli(env, ["capture", "scan", "--tool", "codex"]);
    assert.equal(first.skillUsage.eventsFound, 1);
    assert.equal(first.skillUsage.eventsRecorded, 1);
    const stored = JSON.parse(await fs.readFile(getSkillUsageFile(env.memoryDir), "utf8"));
    assert.equal(stored.skill, "magpie-quota");
    assert.equal(stored.agent, "codex");
    assert.equal(stored.project, "alpha");

    const second = runCli(env, ["capture", "scan", "--tool", "codex"]);
    assert.equal(second.skillUsage.eventsFound, 0);
    assert.equal(second.skillUsage.eventsRecorded, 0);
    assert.equal(second.skillUsage.skippedUnchanged, 1);
    assert.equal((await fs.readFile(getSkillUsageFile(env.memoryDir), "utf8").then((text) => text.trim().split("\n").filter(Boolean).length)), 1);
  });
});
