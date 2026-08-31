import { createSearchDb, getIndexStats, rebuildIndex, searchIndex } from "../fts5-search.js";
import { getOption, hasFlag, positionalArgs } from "../lib/cli.js";

// search command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function searchCommand(argv, deps) {
  const action = argv[0] || "";
  // Subcommands: rebuild, status
  if (action === "rebuild") {
    return searchRebuildCommand(argv.slice(1), deps);
  }
  if (action === "status") {
    return searchStatusCommand(argv.slice(1), deps);
  }

  const query = positionalArgs(argv).join(" ").trim();
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const limit = Number(getOption(argv, "--limit") || 10);
  const useFts = !hasFlag(argv, "--legacy");
  const entityType = getOption(argv, "--type") || "";
  const filters = deps.parseMemoryFilters(argv);
  const hasFilter = deps.hasMemoryFilters(filters);
  const trackAccess = !hasFlag(argv, "--no-track") && !hasFlag(argv, "--no-access-track");
  // OPC v1.1 P1: semantic search mode
  const mode = getOption(argv, "--mode") || "fts";
  // Emit a strict JSON array instead of human-readable text (consistent with `task list`).
  const asJson = hasFlag(argv, "--json");
  if (!query && !hasFilter) {
    throw new Error("Usage: ai-memory-hub search [query] [--limit 10] [--type memory|task|radio|workflow|prompt] [--legacy] [--no-track] [--mode fts|semantic]");
  }

  // Try FTS5 search first
  if (query && useFts) {
    try {
      const db = createSearchDb(config.memoryDir);
      const stats = getIndexStats(db);
      if (stats.total > 0) {
        const rawResults = searchIndex(db, query, { limit, entityType });
        const visibleMemoryIds = new Set(deps.buildMemoryIndex(deps.readLedger(config.memoryDir), config).records
          .filter(deps.isMemoryLifecycleVisible)
          .flatMap((record) => deps.getMemoryIdentityKeys(record).map(deps.normalizeSupersedeToken)));
        const results = rawResults.filter((item) => item.entityType !== "memory" || visibleMemoryIds.has(deps.normalizeSupersedeToken(item.entityId)));
        db.close();
        if (asJson) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }
        for (const item of results) {
          const preview = item.content ? item.content.slice(0, 120) : "";
          console.log(`[${item.score.toFixed(2)}] [${item.entityType}] ${item.entityId} ${item.title ? `(${item.title}) ` : ""}${item.project ? `project=${item.project} ` : ""}${preview}`);
        }
        return;
      }
      db.close();
    } catch { /* fallback to legacy */ }
  }

  // OPC v1.1 P1: Semantic search (TF-IDF cosine similarity, no external deps)
  if (query && mode === "semantic") {
    try {
      const ledger = deps.readLedger(config.memoryDir);
      if (ledger.length > 0) {
        const visible = deps.buildMemoryIndex(ledger, config).records.filter(deps.isMemoryLifecycleVisible);
        const visibleIds = new Set(visible.flatMap((record) => deps.getMemoryIdentityKeys(record).map(deps.normalizeSupersedeToken)));
        const results = deps.semanticSearch(ledger, query, limit).filter((item) => visibleIds.has(deps.normalizeSupersedeToken(item.id)));
          if (results.length > 0) {
          if (trackAccess) {
            const updated = deps.recordMemoryAccess(ledger, results);
            if (updated.updated > 0) deps.writeLedger(config.memoryDir, updated.ledger);
          }
          if (asJson) {
            console.log(JSON.stringify(results, null, 2));
            return;
          }
          for (const item of results) {
            const preview = item.text ? item.text.slice(0, 120) : "";
            console.log("[" + item.score.toFixed(3) + "] [semantic] " + item.id + " " + (item.metadata?.project ? "project=" + item.metadata.project + " " : "") + preview);
          }
          return;
        }
      }
    } catch (e) { /* fallback to FTS */ }
  }

  // Legacy search fallback
  const runSearch = () => {
    const ledger = deps.readLedger(config.memoryDir);
    const index = deps.buildMemoryIndex(ledger, config);
    const records = deps.filterMemoryRecords(index.records, filters);
    const results = (query
      ? deps.searchMemories(records, query, deps)
      : [...records]
        .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
        .map((record) => ({ ...record, score: Number(record.importance || 0) / 100 }))
    ).slice(0, limit);

    if (trackAccess && results.length > 0) {
      const updated = deps.recordMemoryAccess(ledger, results);
      if (updated.updated > 0) {
        deps.writeLedger(config.memoryDir, updated.ledger);
        deps.rebuildMemoryOutputs(config, updated.ledger);
      }
    }

    deps.printMemorySearchResults(results, asJson);
  };

  if (trackAccess) {
    return deps.withHubLock(config.memoryDir, "search-access", runSearch, config.sync.lockStaleMs);
  }
  return runSearch();
}

export function searchRebuildCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  console.log("Rebuilding FTS5 search index...");
  const db = createSearchDb(config.memoryDir);
  const indexed = rebuildIndex(db, config.memoryDir);
  db.close();
  console.log(`Indexed ${indexed} records.`);
}

export function searchStatusCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  try {
    const db = createSearchDb(config.memoryDir);
    const stats = getIndexStats(db);
    db.close();
    console.log(JSON.stringify(stats, null, 2));
  } catch {
    console.log(JSON.stringify({ total: 0, byType: {}, lastRebuilt: "never", schemaVersion: "unknown" }, null, 2));
  }
}
