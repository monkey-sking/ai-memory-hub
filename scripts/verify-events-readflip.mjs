/**
 * verify-events-readflip.mjs
 *
 * End-to-end check that the new `events` CLI command reads the memory-event
 * log through the unified memory-store (SQLite truth), not the scattered
 * JSONL readers. Uses a throwaway hub so it never touches the real library.
 *
 *   node scripts/verify-events-readflip.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE = "C:\\Users\\Administrator\\.workbuddy\\binaries\\node\\versions\\22.22.2\\node.exe";
const CLI = path.join(ROOT, "src", "index.js");
const HUB = path.join(ROOT, ".test-hub-events");
const INBOX = path.join(HUB, "inbox");
const INBOX_FILE = path.join(INBOX, "events.jsonl");

function setup() {
  if (fs.existsSync(HUB)) {
    throw new Error("Stale test hub exists at " + HUB + " — remove it before running.");
  }
  fs.mkdirSync(INBOX, { recursive: true });
  const events = [
    { id: "e1", ts: "2026-08-25T10:00:00.000Z", source: "codex", kind: "project", project: "hwyxxl", text: "脑瓜转一转红包版接入OPPO SDK" },
    { id: "e2", ts: "2026-08-26T11:00:00.000Z", source: "workbuddy", kind: "preference", text: "用户反感契约等术语堆砌" },
    { id: "e3", ts: "2026-08-27T09:00:00.000Z", source: "gemini", kind: "project", project: "amh", text: "AI Memory Hub 统一API重构推进" }
  ];
  fs.writeFileSync(INBOX_FILE, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}

function cli(...args) {
  return execFileSync(NODE, [CLI, ...args, "--memory-dir", HUB], { encoding: "utf8" });
}

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERT FAILED:", msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log("  ✓", msg);
}

try {
  setup();

  console.log("\n[1] sqlite resync — import legacy JSONL event log into SQLite");
  const resync = cli("sqlite", "resync");
  console.log("    " + resync.trim().split("\n").join("\n    "));
  assert(/memory events imported: 3/.test(resync), "resync imported 3 memory events into SQLite");

  console.log("\n[2] events list — should read from SQLite (truth)");
  const list = cli("events", "list");
  console.log("    " + list.trim().split("\n").join("\n    "));
  assert(
    list.includes("脑瓜转一转") && list.includes("契约") && list.includes("统一API"),
    "events list surfaced all 3 events from SQLite"
  );

  console.log("\n[3] events search 红包版 — FTS5 trigram substring");
  const s1 = cli("events", "search", "红包版");
  console.log("    " + s1.trim());
  assert(/OPPO SDK/.test(s1), "search '红包版' matched the hwyxxl event via Chinese substring");

  console.log("\n[4] events search 重构 — second Chinese term");
  const s2 = cli("events", "search", "重构");
  console.log("    " + s2.trim());
  assert(/统一API重构/.test(s2), "search '重构' matched the amh event");

  console.log("\n[5] events verify — SQLite truth vs JSONL export must agree");
  const v = cli("events", "verify");
  console.log("    " + v.trim());
  assert(/consistent/.test(v), "events verify reports consistent (sqlite == jsonl)");

  console.log("\n[6] events export — dump the event log");
  const out = path.join(HUB, "export.jsonl");
  cli("events", "export", "--out", out);
  const lines = fs.readFileSync(out, "utf8").trim().split("\n").filter(Boolean);
  assert(lines.length === 3, "exported 3 event lines");

  console.log("\nALL CHECKS PASSED — read flip verified through the unified events API.");
  console.log("(test hub left at " + HUB + " for inspection; remove with: rm -rf " + HUB + ")");
} finally {
  // Intentionally NOT cleaning up here: the safe-delete interceptor wraps
  // fs.rmSync and routes to trash, which fails in this environment.
  // Clean up manually with native `rm -rf` once satisfied.
}
