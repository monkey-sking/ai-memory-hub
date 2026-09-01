import { writeFileAtomic } from "../atomic-write.js";
import { appendJsonl } from "../event-writer.js";
import {
  createId,
  ensureDir,
  getOption,
  hasFlag,
  parsePositiveIntegerOption,
  positionalArgs,
} from "../lib/cli.js";
import { readEvents } from "../lib/io.js";
import { auditMemories } from "../memory-audit.js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// memory command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function memoryVersionCommand(argv, deps) {
  const action = argv[0] || "status";
  const rest = argv.slice(1);
  if (action === "status") return memoryVersionStatusCommand(rest, deps);
  if (action === "commit") return memoryVersionCommitCommand(rest, deps);
  if (action === "rollback") return memoryVersionRollbackCommand(rest, deps);
  if (action === "log") return memoryVersionLogCommand(rest, deps);
  throw new Error("Usage: ai-memory-hub memory version <status|commit|rollback|log> [options]");
}


export function memoryVersionStatusCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  try {

    const dir = config.memoryDir;
    const isRepo = execSync("git rev-parse --is-inside-work-tree", { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (isRepo !== "true") {
      console.log(JSON.stringify({ gitRepo: false, message: "Memory dir is not a Git repo. Run: git init in " + dir }));
      return;
    }
    const head = execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const status = execSync("git status --porcelain", { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    console.log(JSON.stringify({ gitRepo: true, head, hasChanges: status.length > 0, changedFiles: status.split("\n").filter(Boolean).length }));
  } catch (e) {
    console.log(JSON.stringify({ gitRepo: false, error: e.message }));
  }
}


export function memoryVersionCommitCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const message = getOption(argv, "--message") || positionalArgs(argv).join(" ") || "AMH memory snapshot";
  try {

    const dir = config.memoryDir;
    execSync("git add -A", { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const result = execSync("git commit -m " + JSON.stringify(message), { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const head = execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    console.log(JSON.stringify({ ok: true, commit: head, message }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
  }
}


export function memoryVersionRollbackCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const target = getOption(argv, "--to") || positionalArgs(argv)[0] || "";
  if (!target) {
    throw new Error("Usage: ai-memory-hub memory version rollback --to <commit-hash>");
  }
  try {

    const dir = config.memoryDir;
    execSync("git stash", { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    execSync("git checkout " + target + " -- .", { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    console.log(JSON.stringify({ ok: true, rolledBackTo: target, message: "Memory rolled back. Stashed changes can be recovered." }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
  }
}


export function memoryVersionLogCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const limit = getOption(argv, "--limit") || "10";
  try {

    const dir = config.memoryDir;
    const log = execSync("git log --oneline -" + limit, { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const lines = log.split("\n").map(line => {
      const [hash, ...msgParts] = line.split(" ");
      return { commit: hash, message: msgParts.join(" ") };
    });
    console.log(JSON.stringify(lines, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  }
}

// ─── OPC v1.1 P0: task fail --type (6-class failure routing) ───

export function memoryCommand(argv, deps) {
  const subcommand = argv[0] || "help";
  const rest = argv.slice(1);
  if (subcommand === "search") {
    return deps.searchCommand(rest, deps.searchCommandDeps);
  }
  if (subcommand === "snapshot") {
    return deps.snapshotCommand(rest);
  }
  if (subcommand === "archive") {
    return memoryArchiveCommand(rest, deps);
  }
  if (subcommand === "op") {
    return memoryOperationCommand(rest, deps);
  }
  if (subcommand === "hook") {
    return memoryHookCommand(rest, deps);
  }
  if (subcommand === "version") {
    return memoryVersionCommand(rest, deps);
  }
  if (subcommand === "audit") {
    return memoryAuditCommand(rest, deps);
  }
  throw new Error("Usage: ai-memory-hub memory <search|snapshot|archive|audit|op|hook|version> [options]");
}


export function memoryAuditCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const apply = hasFlag(argv, "--apply");
  const limit = getOption(argv, "--limit") ? parsePositiveIntegerOption(getOption(argv, "--limit"), "--limit") : 50;
  const run = () => {
    const audit = auditMemories(deps.readLedger(config.memoryDir));
    const operationsFile = path.join(config.memoryDir, "memories", "operations.jsonl");
    const operations = readEvents(operationsFile);
    const existingArchives = new Set(operations
      .filter((item) => item.action === "archive" && item.reason === "audit-semantic-duplicate")
      .map((item) => deps.normalizeSupersedeToken(item.target?.recordId)));
    const candidates = audit.autoArchiveCandidates.filter((item) => !existingArchives.has(deps.normalizeSupersedeToken(item.id)));
    let archived = 0;
    if (apply) {
      deps.runAutomaticBackupStrategy(config, { trigger: "memory-audit" });
      for (const candidate of candidates) {
        appendJsonl(operationsFile, {
          id: createId(`audit-archive:${candidate.id}`),
          ts: new Date().toISOString(),
          source: "codex",
          action: "archive",
          target: { recordId: candidate.id },
          reason: "audit-semantic-duplicate",
          refs: { duplicateOf: audit.duplicateGroups.find((group) => group.archive.some((item) => item.id === candidate.id))?.keep.id || "" }
        });
        archived += 1;
      }
      deps.rebuildMemoryOutputs(config, deps.readLedger(config.memoryDir));
    }
    return {
      ok: true,
      apply,
      records: audit.records,
      duplicateGroups: audit.duplicateGroups.length,
      duplicateRecords: audit.duplicateRecords,
      archiveCandidates: candidates.length,
      archived,
      duplicates: audit.duplicateGroups.slice(0, limit),
      reviewCandidates: audit.reviewCandidates.slice(0, limit)
    };
  };
  const result = apply
    ? deps.withHubLock(config.memoryDir, "memory-audit", run, config.sync.lockStaleMs)
    : run();
  console.log(JSON.stringify(result, null, 2));
}


export function memoryOperationCommand(argv, deps) {
  const action = argv[0] || "list";
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const file = path.join(config.memoryDir, "memories", "operations.jsonl");
  if (action === "list") {
    const record = deps.normalizeSupersedeToken(getOption(argv, "--record"));
    const operations = readEvents(file);
    console.log(JSON.stringify(record ? operations.filter((item) => deps.normalizeSupersedeToken(item.target?.recordId) === record) : operations, null, 2));
    return;
  }
  if (action === "apply") {
    const dryRun = hasFlag(argv, "--dry-run");
    const ledger = deps.readLedger(config.memoryDir);
    const index = deps.buildMemoryIndex(ledger, config);
    const hidden = index.records.filter((item) => !deps.isMemoryLifecycleVisible(item)).length;
    if (!dryRun) deps.rebuildMemoryOutputs(config, ledger);
    console.log(JSON.stringify({ dryRun, records: index.records.length, hidden, rebuilt: !dryRun }, null, 2));
    return;
  }
  if (action !== "create") throw new Error("Usage: ai-memory-hub memory op <create|list> [options]");
  const lifecycleAction = String(getOption(argv, "--action") || "").trim().toLowerCase();
  const record = getOption(argv, "--record") || "";
  const reason = getOption(argv, "--reason") || "";
  if (!["annotate", "archive", "pin", "revoke", "review", "supersede"].includes(lifecycleAction)) throw new Error("Unsupported memory lifecycle action");
  if (!record || !reason) throw new Error("memory op create requires --record and --reason");
  const supersededBy = getOption(argv, "--superseded-by") || "";
  if (lifecycleAction === "supersede" && !supersededBy) throw new Error("supersede requires --superseded-by");
  const operation = {
    id: createId(`${lifecycleAction}:${record}:${Date.now()}`),
    ts: new Date().toISOString(),
    source: getOption(argv, "--by") || "manual",
    action: lifecycleAction,
    target: { recordId: record },
    reason,
    refs: supersededBy ? { supersededBy: [supersededBy] } : {}
  };
  appendJsonl(file, operation);
  console.log(JSON.stringify(operation, null, 2));
}

// ─── OPC v1.1 P1: Memory decay - archive expired/low-priority memories ───

export function memoryArchiveCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const dryRun = hasFlag(argv, "--dry-run");
  const byPriority = getOption(argv, "--priority") || "";
  const expiredOnly = hasFlag(argv, "--expired-only");

  const ledger = deps.readLedger(config.memoryDir);
  const now = new Date();
  const toArchive = [];

  for (const record of ledger) {
    const meta = record.metadata || {};
    const expiresAt = meta.expiresAt || "";
    const priority = meta.priority || "normal";
    let shouldArchive = false;

    if (expiredOnly && expiresAt) {
      if (new Date(expiresAt) < now) shouldArchive = true;
    } else if (byPriority && priority === byPriority) {
      shouldArchive = true;
    } else if (!expiredOnly && !byPriority) {
      if (expiresAt && new Date(expiresAt) < now) {
        shouldArchive = true;
      } else if (priority === "low") {
        const age = record.ts ? (now - new Date(record.ts)) / 86400000 : 0;
        if (age > 30) shouldArchive = true;
      }
    }

    if (shouldArchive && record.kind !== "correction") {
      toArchive.push(record);
    }
  }

  if (toArchive.length === 0) {
    console.log("No memories to archive.");
    return;
  }

  console.log("Archiving " + toArchive.length + " memory record(s)..." + (dryRun ? " (dry-run)" : ""));

  if (dryRun) {
    for (const r of toArchive) {
      const reason = r.metadata?.expiresAt ? "expired" : "low-priority";
      console.log("  [" + reason + "] " + r.id + " ts=" + r.ts);
    }
    return;
  }

  const operationsFile = path.join(config.memoryDir, "memories", "operations.jsonl");
  ensureDir(path.dirname(operationsFile));
  const operations = toArchive.map((record) => ({
    id: createId("archive:" + (record.id || record.localEventId || record.ts) + ":" + Date.now()),
    ts: new Date().toISOString(),
    source: "memory-archive",
    action: "archive",
    target: { recordId: record.id || record.localEventId || "" },
    reason: record.metadata?.expiresAt ? "expired" : "low-priority",
    patch: { lifecycle: { state: "archived" } }
  }));
  for (const operation of operations) appendJsonl(operationsFile, operation);
  deps.rebuildMemoryOutputs(config, deps.readLedger(config.memoryDir));
  console.log("Archived " + operations.length + " record(s) through lifecycle operations; source ledger unchanged.");
}

// ─── OPC v1.1 P1: Lifecycle hooks - auto-capture memory events ───

export function memoryHookCommand(argv, deps) {
  const action = argv[0] || "list";
  const rest = argv.slice(1);
  if (action === "register") return memoryHookRegisterCommand(rest, deps);
  if (action === "list") return memoryHookListCommand(rest, deps);
  if (action === "emit") return memoryHookEmitCommand(rest, deps);
  if (action === "remove") return memoryHookRemoveCommand(rest, deps);
  throw new Error("Usage: ai-memory-hub memory hook <register|list|emit|remove> [options]");
}


export function memoryHookRegisterCommand(argv, deps) {
  const event = getOption(argv, "--event") || "";
  const tool = getOption(argv, "--tool") || "";
  const template = getOption(argv, "--template") || "";
  if (!event || !tool) {
    throw new Error("Usage: ai-memory-hub memory hook register --event <session_start|session_end|tool_call|prompt> --tool <name> [--template text]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const hooksFile = path.join(config.memoryDir, "hooks", "hooks.jsonl");
  ensureDir(path.dirname(hooksFile));
  const hook = {
    id: createId("hook:" + event + ":" + tool + ":" + Date.now()),
    event, tool,
    template: template || "Auto-captured: {event} from {tool} at {ts}",
    active: true,
    createdAt: new Date().toISOString()
  };
  appendJsonl(hooksFile, hook);
  console.log(JSON.stringify(hook, null, 2));
}


export function memoryHookListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const hooksFile = path.join(config.memoryDir, "hooks", "hooks.jsonl");
  if (!fs.existsSync(hooksFile)) { console.log("[]"); return; }
  const hooks = readEvents(hooksFile).filter(h => h.active !== false);
  console.log(JSON.stringify(hooks, null, 2));
}


export function memoryHookEmitCommand(argv, deps) {
  const event = getOption(argv, "--event") || "";
  const tool = getOption(argv, "--tool") || getOption(argv, "--source") || "manual";
  const data = getOption(argv, "--data") || "";
  if (!event) {
    throw new Error("Usage: ai-memory-hub memory hook emit --event <event> [--tool name] [--data text]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const hooksFile = path.join(config.memoryDir, "hooks", "hooks.jsonl");
  let hooks = [];
  if (fs.existsSync(hooksFile)) {
    hooks = readEvents(hooksFile).filter(h => h.active !== false && h.event === event && (!h.tool || h.tool === tool));
  }
  if (hooks.length === 0) {
    console.log(JSON.stringify({ event, tool, hooksMatched: 0 }));
    return;
  }
  const ts = new Date().toISOString();
  for (const hook of hooks) {
    const text = hook.template.replace("{event}", event).replace("{tool}", tool).replace("{ts}", ts).replace("{data}", data || "");
    const memoryEvent = {
      id: createId("hook:" + hook.id + ":" + ts),
      ts, device: os.hostname(), source: tool, text,
      metadata: deps.normalizeMemoryMetadata({ kind: "workflow", project: "", tags: ["opc", "lifecycle-hook", event], scope: "", confidence: "" })
    };
    appendJsonl(path.join(config.memoryDir, "inbox", "events.jsonl"), memoryEvent);
  }
  console.log(JSON.stringify({ event, tool, hooksMatched: hooks.length, emitted: hooks.length }));
}


export function memoryHookRemoveCommand(argv, deps) {
  const id = getOption(argv, "--id") || "";
  if (!id) throw new Error("Usage: ai-memory-hub memory hook remove --id <hook-id>");
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const hooksFile = path.join(config.memoryDir, "hooks", "hooks.jsonl");
  if (!fs.existsSync(hooksFile)) { console.log("No hooks found."); return; }
  const hooks = readEvents(hooksFile);
  const updated = hooks.map(h => h.id === id ? { ...h, active: false, removedAt: new Date().toISOString() } : h);
  writeFileAtomic(hooksFile, updated.map(h => JSON.stringify(h)).join("\n") + "\n", "utf8");
  console.log(JSON.stringify({ ok: true, removed: id }));
}

// ─── OPC v1.1 P1: TF-IDF semantic search (zero external dependencies) ───
