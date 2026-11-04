import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildSkillUsageReport,
  getSkillUsageFile,
  listSkillUsageEvents,
  normalizeSkillUsageEvent,
  recordSkillUsage
} from "../src/skill-usage.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "index.js");

async function withMemoryDir(fn) {
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), "amh-skill-usage-"));
  try {
    await fn(memoryDir);
  } finally {
    await fs.rm(memoryDir, { recursive: true, force: true });
  }
}

async function writeSkill(memoryDir, id, body = `# ${id}\n`, frontmatter = "") {
  const root = path.join(memoryDir, "skills", id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "SKILL.md"), `${frontmatter}${body}`, "utf8");
}

test("normalizes Skill usage events and validates required fields", () => {
  const event = normalizeSkillUsageEvent({
    skill: "magpie-quota",
    agent: "codex",
    project: "ai-memory-hub",
    signal: "adopted",
    sessionId: "session-1",
    ts: "2026-11-03T08:00:00.000Z",
    evidence: "quota report; user confirmation"
  });

  assert.match(event.id, /^[a-f0-9]{16}$/);
  assert.equal(event.signal, "adopted");
  assert.equal(event.ts, "2026-11-03T08:00:00.000Z");
  assert.deepEqual(event.evidence, ["quota report", "user confirmation"]);
  assert.throws(() => normalizeSkillUsageEvent({ agent: "codex" }), /requires --skill/);
  assert.throws(() => normalizeSkillUsageEvent({ skill: "x", agent: "codex", signal: "guessed" }), /Invalid Skill usage signal/);
});

test("recordSkillUsage deduplicates the same signal within one session", async () => {
  await withMemoryDir(async (memoryDir) => {
    const input = {
      skill: "openai-docs",
      agent: "codex",
      project: "ai-memory-hub",
      signal: "loaded",
      sessionId: "session-1",
      ts: "2026-11-03T08:00:00.000Z"
    };
    const first = recordSkillUsage(memoryDir, input);
    const duplicate = recordSkillUsage(memoryDir, input);
    const adopted = recordSkillUsage(memoryDir, { ...input, signal: "adopted" });

    assert.equal(first.recorded, true);
    assert.equal(duplicate.recorded, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(adopted.recorded, true);
    assert.equal(listSkillUsageEvents(memoryDir).length, 2);
    assert.deepEqual(listSkillUsageEvents(memoryDir).map((event) => event.signal).sort(), ["adopted", "loaded"]);
    assert.match(await fs.readFile(getSkillUsageFile(memoryDir), "utf8"), /"schemaVersion":1/);
  });
});

test("report scopes usage by agent and project and applies recency decay", async () => {
  await withMemoryDir(async (memoryDir) => {
    await writeSkill(memoryDir, "fresh");
    await writeSkill(memoryDir, "stale");
    await writeSkill(memoryDir, "other-agent", "# other-agent\n", "---\ntargets: claude\n---\n");

    for (const sessionId of ["fresh-1", "fresh-2"]) {
      recordSkillUsage(memoryDir, {
        skill: "fresh",
        agent: "codex",
        project: "alpha",
        signal: "adopted",
        sessionId,
        ts: "2026-11-03T08:00:00.000Z"
      });
    }
    for (const sessionId of ["stale-1", "stale-2"]) {
      recordSkillUsage(memoryDir, {
        skill: "stale",
        agent: "codex",
        project: "alpha",
        signal: "adopted",
        sessionId,
        ts: "2024-01-01T08:00:00.000Z"
      });
    }
    for (const sessionId of ["other-1", "other-2"]) {
      recordSkillUsage(memoryDir, {
        skill: "other-agent",
        agent: "claude",
        project: "alpha",
        signal: "adopted",
        sessionId,
        ts: "2026-11-03T08:00:00.000Z"
      });
    }
    recordSkillUsage(memoryDir, {
      skill: "fresh",
      agent: "codex",
      project: "beta",
      signal: "loaded",
      sessionId: "beta-1",
      ts: "2026-11-03T08:00:00.000Z"
    });

    const report = buildSkillUsageReport(memoryDir, {
      agent: "codex",
      project: "alpha",
      now: "2026-11-03T12:00:00.000Z",
      limit: 10
    });
    const fresh = report.core.find((item) => item.id === "fresh");
    const stale = [...report.recent, ...report.searchable].find((item) => item.id === "stale");

    assert.ok(fresh);
    assert.equal(fresh.sessions, 2);
    assert.deepEqual(Object.keys(fresh.projects), ["alpha"]);
    assert.ok(stale);
    assert.ok(fresh.score > stale.score);
    assert.equal(report.core.some((item) => item.id === "other-agent"), false);
    assert.equal(report.core.some((item) => item.id === "stale"), false);
  });
});

test("pinned Skills stay in the core bucket until unpinned", async () => {
  await withMemoryDir(async (memoryDir) => {
    await writeSkill(memoryDir, "mcp-meta");
    recordSkillUsage(memoryDir, {
      skill: "mcp-meta",
      agent: "codex",
      project: "alpha",
      signal: "pinned",
      sessionId: "pin-1",
      ts: "2026-11-03T08:00:00.000Z"
    });

    const pinned = buildSkillUsageReport(memoryDir, {
      agent: "codex",
      project: "alpha",
      now: "2026-11-03T12:00:00.000Z"
    });
    assert.equal(pinned.core[0].id, "mcp-meta");
    assert.equal(pinned.core[0].pinned, true);
    assert.equal(pinned.core[0].reason, "pinned");

    recordSkillUsage(memoryDir, {
      skill: "mcp-meta",
      agent: "codex",
      project: "alpha",
      signal: "unpinned",
      sessionId: "pin-2",
      ts: "2026-11-03T09:00:00.000Z"
    });
    const unpinned = buildSkillUsageReport(memoryDir, {
      agent: "codex",
      project: "alpha",
      now: "2026-11-03T12:00:00.000Z"
    });
    assert.equal(unpinned.core.some((item) => item.id === "mcp-meta"), false);
    assert.equal(unpinned.searchable.find((item) => item.id === "mcp-meta").pinned, false);
  });
});

test("report reserves core Skills and fills other buckets within the character budget", async () => {
  await withMemoryDir(async (memoryDir) => {
    await writeSkill(memoryDir, "core", "# core\n");
    await writeSkill(memoryDir, "available-a", "# available-a\n");
    await writeSkill(memoryDir, "available-b", "# available-b\n");
    for (const sessionId of ["core-1", "core-2"]) {
      recordSkillUsage(memoryDir, {
        skill: "core",
        agent: "codex",
        project: "alpha",
        signal: "adopted",
        sessionId,
        ts: "2026-11-03T08:00:00.000Z"
      });
    }

    const report = buildSkillUsageReport(memoryDir, {
      agent: "codex",
      project: "alpha",
      now: "2026-11-03T12:00:00.000Z",
      limit: 10,
      budget: 10
    });
    assert.deepEqual(report.core.map((item) => item.id), ["core"]);
    assert.equal(report.recent.length, 0);
    assert.equal(report.searchable.length, 0);
    assert.equal(report.budget.usedChars, 7);
    assert.equal(report.budget.exceeded, false);
  });
});

test("CLI records and reports Skill usage without touching the real hub", async () => {
  await withMemoryDir(async (memoryDir) => {
    const run = (args) => spawnSync(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, AI_MEMORY_DIR: memoryDir },
      encoding: "utf8",
      windowsHide: true
    });
    const record = run([
      "skill", "usage", "record",
      "--skill", "magpie-quota",
      "--agent", "codex",
      "--project", "ai-memory-hub",
      "--signal", "adopted",
      "--session", "cli-1",
      "--ts", "2026-11-03T08:00:00.000Z"
    ]);
    assert.equal(record.status, 0, record.stderr || record.stdout);
    assert.equal(JSON.parse(record.stdout).recorded, true);

    const reportResult = run([
      "skill", "usage", "report",
      "--agent", "codex",
      "--project", "ai-memory-hub",
      "--as-of", "2026-11-03T12:00:00.000Z"
    ]);
    assert.equal(reportResult.status, 0, reportResult.stderr || reportResult.stdout);
    const report = JSON.parse(reportResult.stdout);
    assert.match(report.generatedAt, /^2026-11-03T12:00:00/);
    assert.ok(report.recent.some((item) => item.id === "magpie-quota"));
  });
});
