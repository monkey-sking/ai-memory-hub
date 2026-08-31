import { writeFileAtomic } from "../atomic-write.js";
import { createId, ensureDir, getOption, hasFlag } from "../lib/cli.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// merge command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function mergeCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const isAutoGit = hasFlag(argv, "--auto-git");
  const fromOption = getOption(argv, "--from");
  
  const defaultRepoDir = path.join(os.homedir(), ".ai-memory-github-backup");
  const backupRepoDir = config.backup?.repoDir || defaultRepoDir;
  const backupDataDir = path.join(backupRepoDir, "data");
  
  if (isAutoGit) {
    console.log("Scanning files in backup repository for Git conflict markers...");
    const targets = [
      path.join(backupDataDir, "memories", "ledger.jsonl"),
      path.join(backupDataDir, "tasks", "tasks.jsonl"),
      path.join(backupDataDir, "radio", "messages.jsonl")
    ];
    
    let resolvedAny = false;
    for (const target of targets) {
      if (deps.resolveGitConflictsInFile(target)) {
        resolvedAny = true;
      }
    }
    
    if (resolvedAny) {
      console.log(`\nConflicts resolved in backup repository. Copying resolved files to local memory directory: ${config.memoryDir}`);
      mergeFolders(config.memoryDir, backupDataDir, deps);
      const ledger = deps.readLedger(config.memoryDir);
      deps.rebuildMemoryOutputs(config, ledger);
      console.log("\nMerge complete! Run 'ai-memory-hub health' to verify.");
    } else {
      console.log("No Git conflict markers found to resolve.");
    }
    return;
  }

  const sourceDir = fromOption || backupDataDir;
  console.log(`Merging local memory (${config.memoryDir}) with source data (${sourceDir})...`);
  
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }
  
  return deps.withHubLock(config.memoryDir, "merge", () => {
    mergeFolders(config.memoryDir, sourceDir, deps);
    const ledger = deps.readLedger(config.memoryDir);
    deps.rebuildMemoryOutputs(config, ledger);
    console.log("\nMerge and index rebuild complete! Run 'ai-memory-hub health' to verify.");
  }, config.sync.lockStaleMs);
}

export function mergeFolders(localDir, sourceDir, deps) {
  const filesToMerge = [
    "memories/ledger.jsonl",
    "tasks/tasks.jsonl",
    "radio/messages.jsonl",
    "workflows/workflows.jsonl"
  ];
  
  for (const relPath of filesToMerge) {
    const localFile = path.join(localDir, relPath);
    const sourceFile = path.join(sourceDir, relPath);
    
    if (!fs.existsSync(localFile) && !fs.existsSync(sourceFile)) {
      continue;
    }
    
    console.log(`Merging ${relPath}...`);
    const records = {};
    
    for (const file of [localFile, sourceFile]) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("<<<<<<<") || trimmed.startsWith("=======") || trimmed.startsWith(">>>>>>>")) {
          continue;
        }
        try {
          const data = JSON.parse(trimmed);
          const id = data.id || data.localEventId || createId(data.text || JSON.stringify(data));
          records[id] = data;
        } catch {
          // Ignore
        }
      }
    }
    
    const sortedRecords = Object.values(records).sort((a, b) => {
      const tsA = a.ts || a.createdAt || a.indexedAt || "";
      const tsB = b.ts || b.createdAt || b.indexedAt || "";
      return String(tsA).localeCompare(String(tsB));
    });
    
    ensureDir(path.dirname(localFile));
    writeFileAtomic(localFile, sortedRecords.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
    console.log(`Successfully merged ${relPath}. Total unique records: ${sortedRecords.length}`);
  }
}
