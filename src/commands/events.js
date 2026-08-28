// events — UNIFIED READ API for the raw memory-event log (single-writer truth).
// Every subcommand reads through memory-store (SQLite memory_events + FTS5),
// never the raw JSONL directly. This is the read counterpart to the
// appendJsonl write chokepoint: one module owns the event log's read surface.
//
// Extracted from the index.js monolith (v2.3) as the first "split-by-function"
// slice. Helpers are injected via `deps` so this module stays free of index.js
// internals and the giant file's function-hoisting collisions.

/**
 * @param {string[]} argv  subcommand + flags, e.g. ["search", "红包版", "--limit", "10"]
 * @param {object} deps     { loadConfig, ensureHub, hasFlag, getOption, positionalArgs, memoryStore, fs }
 */
export function eventsCommand(argv, deps) {
  const { loadConfig, ensureHub, hasFlag, getOption, positionalArgs, memoryStore, fs } = deps;
  const action = argv[0] || "list";
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const dir = config.memoryDir;
  const asJson = hasFlag(argv, "--json");

  if (action === "search") {
    const query = positionalArgs(argv.slice(1)).join(" ").trim();
    const limit = Number(getOption(argv, "--limit") || 20);
    if (!query) throw new Error("Usage: ai-memory-hub events search <query> [--limit 20]");
    const hits = memoryStore.searchMemoryEvents(dir, query, { limit });
    if (asJson) { console.log(JSON.stringify(hits, null, 2)); return; }
    if (hits.length === 0) { console.log("(无匹配)"); return; }
    for (const h of hits) {
      console.log(`[${h.source}] ${h.project ? `project=${h.project} ` : ""}${h.text?.slice(0, 120)}`);
    }
    return;
  }

  if (action === "list") {
    const limit = Number(getOption(argv, "--limit") || 20);
    const source = getOption(argv, "--source") || null;
    const project = getOption(argv, "--project") || null;
    const kind = getOption(argv, "--kind") || null;
    const events = memoryStore.readMemoryEvents(dir, { limit, source, project, kind });
    if (asJson) { console.log(JSON.stringify(events, null, 2)); return; }
    if (events.length === 0) { console.log("(无记忆事件)"); return; }
    for (const e of events) {
      console.log(`[${e.ts}] [${e.source}] ${e.project ? `project=${e.project} ` : ""}${e.text?.slice(0, 100)}`);
    }
    return;
  }

  if (action === "export") {
    const events = memoryStore.readMemoryEvents(dir, { limit: 1000000 });
    const out = events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
    const file = getOption(argv, "--out");
    if (file) {
      fs.writeFileSync(file, out, "utf8");
      console.log(`Exported ${events.length} events to ${file}`);
    } else {
      process.stdout.write(out);
    }
    return;
  }

  if (action === "verify") {
    const v = memoryStore.verifyMemory(dir);
    console.log(`events: sqlite=${v.sqlite} jsonl(${(v.files || []).join("+")})=${v.jsonl} drift=${v.drift}`);
    console.log(`verdict: ${v.consistent ? "consistent" : "DRIFT DETECTED"}`);
    process.exitCode = v.consistent ? 0 : 2;
    return;
  }

  throw new Error(`Unknown events action: ${action}\nTry: ai-memory-hub events list|search|export|verify`);
}
