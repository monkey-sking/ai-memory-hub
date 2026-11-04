import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { memoryNativeScanCommand } from "../src/commands/memory.js";
import { scanNativeMemorySources } from "../src/lib/native-memory-scan.js";

test("native memory scan indexes sources without reading them into memory records", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "amh-native-memory-"));
  try {
    const codexFile = path.join(home, ".codex", "memories_v2", "memory_summary.md");
    const workbuddyFile = path.join(home, ".workbuddy", "memory", "session_memory.md");
    await fs.mkdir(path.dirname(codexFile), { recursive: true });
    await fs.mkdir(path.dirname(workbuddyFile), { recursive: true });
    await fs.writeFile(codexFile, "summary\n", "utf8");
    await fs.writeFile(workbuddyFile, "memory\n", "utf8");

    const result = scanNativeMemorySources({ home });
    assert.equal(result.readOnly, true);
    assert.equal(result.mergePolicy, "manual-selective");
    assert.deepEqual(result.sources.map((item) => item.source), ["codex", "workbuddy"]);
    assert.equal(result.sources[0].sha256, crypto.createHash("sha256").update("summary\n").digest("hex"));
    assert.equal(result.sources[0].empty, false);
    assert.match(result.sources[0].disposition, /never auto-merge/);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].source, "codex");
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("native memory scan handles empty sources and command aliases", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "amh-native-memory-"));
  try {
    const empty = path.join(home, ".workbuddy", "memory", "empty_memory.md");
    await fs.mkdir(path.dirname(empty), { recursive: true });
    await fs.writeFile(empty, "", "utf8");
    const result = scanNativeMemorySources({ home });
    assert.equal(result.sources[0].empty, true);
    assert.equal(result.sources[0].disposition, "empty; no content to merge");

    const commandResult = memoryNativeScanCommand(["--home", home], {
      loadConfig: () => ({ memoryDir: path.join(home, ".ai-memory") }),
      ensureHub: () => {}
    });
    assert.equal(commandResult.ok, true);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});
