import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveVaultRoot, searchVault, validateVaultSources, vaultStatus } from "../src/vault-context.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixture(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amh-vault-"));
  const root = path.join(directory, "vault");
  const memoryDir = path.join(directory, "hub");
  fs.mkdirSync(path.join(root, "projects"), { recursive: true });
  const file = path.join(root, "projects", "alpha.md");
  const content = "# Alpha\n\n## Architecture\nUse a shared ledger for agent memory.\n\n## Operations\nRun bounded checks.\n";
  fs.writeFileSync(file, content);
  const run = (args, env = {}) => {
    const result = spawnSync(process.execPath, [path.join(repoRoot, "src", "index.js"), ...args], {
      cwd: repoRoot,
      env: { ...process.env, AI_MEMORY_DIR: memoryDir, AMH_VAULT_ROOT: "", ...env },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };
  try { fn({ directory, root, memoryDir, file, content, run }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test("vault search returns ranked, portable section citations with exact line and file hash", () => fixture(({ root, file, content }) => {
  const report = searchVault(root, "shared ledger");
  assert.equal(report.status, "available");
  assert.equal(report.scannedFiles, 1);
  assert.equal(report.sources.length, 1);
  assert.deepEqual(report.sources[0], {
    kind: "vault", path: "projects/alpha.md", title: "Alpha", heading: "Alpha > Architecture",
    lineStart: 4, lineEnd: 4, excerpt: "Use a shared ledger for agent memory.",
    contentHash: crypto.createHash("sha256").update(content).digest("hex"),
    modifiedAt: fs.statSync(file).mtime.toISOString(), score: 2
  });
  assert.deepEqual(searchVault(root, "nonexistent").sources, []);
}));

test("vault references detect changed and missing files without rewriting the source", () => fixture(({ root, file }) => {
  const sources = searchVault(root, "ledger").sources;
  const before = fs.statSync(file);
  assert.equal(validateVaultSources(root, sources)[0].status, "current");
  assert.equal(fs.statSync(file).mtimeMs, before.mtimeMs);
  fs.appendFileSync(file, "Updated.\n");
  assert.equal(validateVaultSources(root, sources)[0].status, "changed");
  fs.unlinkSync(file);
  assert.equal(validateVaultSources(root, sources)[0].status, "missing");
}));

test("vault excludes hidden content and symlinks and rejects escaping stored paths", () => fixture(({ directory, root, file }) => {
  fs.mkdirSync(path.join(root, ".obsidian"));
  fs.writeFileSync(path.join(root, ".obsidian", "private.md"), "secret ledger");
  fs.writeFileSync(path.join(directory, "outside.md"), "secret ledger");
  fs.symlinkSync(path.join(directory, "outside.md"), path.join(root, "linked.md"));
  fs.symlinkSync(directory, path.join(root, "loop"), "dir");
  const report = searchVault(root, "ledger");
  assert.equal(report.scannedFiles, 1);
  for (const invalidPath of ["../outside.md", "/etc/passwd", "linked.md", "loop/outside.md", "projects/../../outside.md", ".obsidian/private.md"]) {
    assert.equal(validateVaultSources(root, [{ path: invalidPath }])[0].status, "invalid");
  }
  const sources = report.sources;
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(directory, "outside.md"), file);
  assert.equal(validateVaultSources(root, sources)[0].status, "invalid");
}));

test("vault supports Chinese retrieval and ignores headings inside fenced examples", () => fixture(({ root }) => {
  fs.writeFileSync(path.join(root, "guide.md"), "# Guide\n## Retrieval\n```md\n# fake heading\n```\nShared memory guide.\n");
  const result = searchVault(root, "fake").sources[0];
  assert.equal(result.heading, "Guide > Retrieval");
  assert.equal(result.lineStart, 4);
  const chinese = "\u77e5\u8bc6\u5e93\u53ea\u8bfb\u68c0\u7d22";
  fs.writeFileSync(path.join(root, "chinese.md"), `# Guide\n${chinese}\n`);
  assert.equal(searchVault(root, "\u53ea\u8bfb\u68c0\u7d22").sources[0].path, "chinese.md");
}));

test("vault bounds excerpts and file sizes and reports skipped files", () => fixture(({ root }) => {
  fs.writeFileSync(path.join(root, "large.md"), "ledger ".repeat(160000));
  fs.writeFileSync(path.join(root, "long.md"), "ledger ".repeat(100));
  const result = searchVault(root, "ledger", { limit: 1 });
  assert.equal(result.skippedFiles, 1);
  assert.equal(result.sources.length, 1);
  assert.ok(result.sources[0].excerpt.length <= 320);
}));

test("vault status and root precedence remain explicit", () => fixture(({ directory, root }) => {
  assert.equal(vaultStatus("").status, "unconfigured");
  assert.equal(vaultStatus(path.join(directory, "missing")).status, "missing");
  assert.equal(searchVault("", "ledger").sources.length, 0);
  const saved = process.env.AMH_VAULT_ROOT;
  try {
    process.env.AMH_VAULT_ROOT = root;
    assert.equal(resolveVaultRoot({ vault: { root: directory } }), root);
    assert.equal(resolveVaultRoot({}, directory), directory);
    delete process.env.AMH_VAULT_ROOT;
    assert.equal(resolveVaultRoot({ vault: { root: directory } }), directory);
    assert.equal(resolveVaultRoot({ vault: { root: "~/vault" } }), path.join(os.homedir(), "vault"));
    assert.equal(resolveVaultRoot(), "");
  } finally {
    if (saved === undefined) delete process.env.AMH_VAULT_ROOT;
    else process.env.AMH_VAULT_ROOT = saved;
  }
}));

test("vault reports truncation after the scan limit", () => fixture(({ root }) => {
  for (let index = 0; index < 2000; index++) fs.writeFileSync(path.join(root, `note-${index}.md`), "ledger");
  const result = searchVault(root, "ledger", { limit: 3 });
  assert.equal(result.truncated, true);
  assert.equal(result.scannedFiles, 2000);
  assert.equal(result.sources.length, 3);
}));

test("CLI context packs include citations, validate changes and preserve vault and saved pack", () => fixture(({ root, memoryDir, file, content, run }) => {
  const before = fs.statSync(file);
  const initialEntries = fs.readdirSync(root, { recursive: true });
  const result = run(["vault", "search", "--query", "shared ledger", "--vault-root", root]);
  assert.equal(result.sources.length, 1);
  const pack = run(["context", "create", "--query", "ledger", "--project", "alpha", "--vault-root", root]);
  assert.equal(pack.knowledgeSourceStatus.status, "available");
  assert.equal(pack.knowledgeSources.length, 1);
  assert.deepEqual(pack.relevantMemories, []);
  const packFile = path.join(memoryDir, "context", "packs", `${pack.id}.json`);
  const savedPack = fs.readFileSync(packFile, "utf8");
  const checked = run(["context", "show", pack.id, "--check-sources", "--vault-root", root]);
  assert.equal(checked.knowledgeSourceChecks[0].status, "current");
  assert.equal(fs.readFileSync(file, "utf8"), content);
  assert.equal(fs.statSync(file).mtimeMs, before.mtimeMs);
  assert.deepEqual(fs.readdirSync(root, { recursive: true }), initialEntries);
  fs.appendFileSync(file, "Changed.\n");
  assert.equal(run(["context", "show", pack.id, "--check-sources", "--vault-root", root]).knowledgeSourceChecks[0].status, "changed");
  fs.unlinkSync(file);
  assert.equal(run(["context", "show", pack.id, "--check-sources", "--vault-root", root]).knowledgeSourceChecks[0].status, "missing");
  assert.equal(fs.readFileSync(packFile, "utf8"), savedPack);
}));

test("CLI supports config and environment roots and leaves unconfigured and old packs usable", () => fixture(({ root, memoryDir, run }) => {
  assert.equal(run(["vault", "status"]).status, "unconfigured");
  const configFile = path.join(memoryDir, "config.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  config.vault = { root };
  fs.writeFileSync(configFile, JSON.stringify(config));
  assert.equal(run(["vault", "status"]).root, root);
  config.vault = { root: "" };
  fs.writeFileSync(configFile, JSON.stringify(config));
  assert.equal(run(["vault", "status"], { AMH_VAULT_ROOT: root }).root, root);
  const empty = run(["context", "create", "--query", "ledger"]);
  assert.deepEqual(empty.knowledgeSources, []);
  assert.equal(empty.knowledgeSourceStatus.status, "unconfigured");
  const oldPack = { id: "old", createdAt: "2026-01-01T00:00:00Z", relevantMemories: [] };
  fs.writeFileSync(path.join(memoryDir, "context", "packs", "old.json"), JSON.stringify(oldPack));
  assert.deepEqual(run(["context", "show", "old"]), oldPack);
  assert.deepEqual(run(["context", "show", "old", "--check-sources"]).knowledgeSourceChecks, []);
}));
