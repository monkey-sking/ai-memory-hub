import { createSearchDb, getIndexStats, rebuildIndex, searchIndex } from "../fts5-search.js";
import { getOption, hasFlag, positionalArgs } from "../lib/cli.js";

// search command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

/**
 * 索引落后守卫。
 *
 * 只要 FTS5 非空，上面的分支就会直接 `return`，永远走不到那个能搜全账本的
 * legacy 分支 —— 也就是说索引一旦落后，搜索会**静默少搜**，不报任何错。
 * 真实踩过：FTS5 只有 117 条而账本 772 条（85% 记忆搜不到），
 * 因为 `sync` 当初不重建 FTS5，只有 `amh record` 会增量写它。
 *
 * 只在明显落后（< 一半）时喊一声，避免正常抖动也刷屏。
 */
function warnIfIndexBehind(stats, config, deps) {
  try {
    const indexed = Number(stats.byType?.memory || 0);
    const ledger = deps.readLedger(config.memoryDir).length;
    if (ledger > 0 && indexed < ledger * 0.5) {
      console.error(
        `[search] FTS5 index looks stale: ${indexed} memory record(s) indexed vs ${ledger} in the ledger. ` +
        "Run \"ai-memory-hub search rebuild\" to repair."
      );
    }
  } catch {
    // 守卫本身不该影响搜索。
  }
}

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
        warnIfIndexBehind(stats, config, deps);
        const rawResults = searchIndex(db, query, { limit, entityType });
        const ledger = deps.readLedger(config.memoryDir);
        // 过滤器与可见性都必须在这条路径上生效 —— FTS5 是**默认**分支，
        // 而 `filters` 原本只传给 legacy 分支，等于 `--project/--thread/--tags`
        // 在这里被静默忽略（真实踩过：`--project X` 仍返回别的 project 的记录）。
        const visibleRecords = deps.filterMemoryRecords(
          deps.buildMemoryIndex(ledger, config).records,
          filters
        );
        const recordsByKey = new Map();
        for (const record of visibleRecords) {
          for (const key of deps.getMemoryIdentityKeys(record)) {
            const token = deps.normalizeSupersedeToken(key);
            if (token && !recordsByKey.has(token)) recordsByKey.set(token, record);
          }
        }
        // FTS5 返回的是**索引行**（entityId/score/content），不是记忆记录。
        // 必须映射回账本记录再渲染，否则 `--thread/--task/--workflow/--radio` 的 ref
        // 不会出现在输出里（看着像过滤器失效），`--json` 出来的形状也与 legacy
        // 分支不一致。非 memory 命中（task 等）legacy 分支本就不支持，原样保留。
        const results = [];
        const memoryHits = [];
        for (const item of rawResults) {
          if (item.entityType !== "memory") {
            results.push(item);
            continue;
          }
          const record = recordsByKey.get(deps.normalizeSupersedeToken(item.entityId));
          if (!record) continue;
          // 保留 FTS5 的排序与得分，其余字段用账本记录，渲染即与 legacy 分支一致。
          memoryHits.push({ ...record, score: item.score });
          results.push({ ...record, score: item.score });
        }
        db.close();

        const emit = () => {
          if (asJson) {
            console.log(JSON.stringify(results, null, 2));
            return;
          }
          for (const item of results) {
            if (item.entityType) {
              const preview = item.content ? item.content.slice(0, 120) : "";
              console.log(`[${item.score.toFixed(2)}] [${item.entityType}] ${item.entityId} ${item.title ? `(${item.title}) ` : ""}${item.project ? `project=${item.project} ` : ""}${preview}`);
              continue;
            }
            console.log(deps.formatMemorySearchLine(item));
          }
        };

        // 访问热度追踪也必须在这个分支做：默认走的就是这里，漏掉它
        // access heat 永远不会更新（只有 legacy 分支会写）。
        const trackAndEmit = () => {
          if (trackAccess && memoryHits.length > 0) {
            const updated = deps.recordMemoryAccess(ledger, memoryHits);
            if (updated.updated > 0) {
              deps.writeLedger(config.memoryDir, updated.ledger);
              deps.rebuildMemoryOutputs(config, updated.ledger);
            }
          }
          emit();
        };
        if (trackAccess) {
          return deps.withHubLock(config.memoryDir, "search-access", trackAndEmit, config.sync.lockStaleMs);
        }
        return trackAndEmit();
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
