export function createDashboardSearchApi({
  buildMemoryIndex,
  countBy,
  extractSearchTerms,
  loadConfig,
  normalizeList,
  normalizeSearchText,
  readLedger,
  readRadioMessages,
  readTasks,
  readWorkflows,
  sanitizeInlineText,
  titleCase,
  truncateText
}) {
  function getDashboardSearch(memoryDir, { query = "", type = "all", tag = "", range = "all", sort = "relevance", limit = 50 } = {}) {
    const startedAt = Date.now();
    const cleanQuery = String(query || "").trim();
    const cleanType = normalizeDashboardSearchOption(type, ["all", "memory", "task", "radio", "workflow"], "all");
    const cleanTag = sanitizeInlineText(tag);
    const cleanRange = normalizeDashboardSearchOption(range, ["all", "24h", "7d", "30d", "90d"], "all");
    const cleanSort = normalizeDashboardSearchOption(sort, ["relevance", "newest", "oldest"], "relevance");
    const maxResults = Math.max(0, Math.min(200, Number.isFinite(Number(limit)) ? Number(limit) : 50));
    const corpus = buildDashboardSearchCorpus(memoryDir);
    const facets = buildDashboardSearchFacets(corpus);
    const hasActiveSearch = Boolean(cleanQuery || cleanTag || cleanType !== "all" || cleanRange !== "all");
    const highlightQuery = cleanQuery || cleanTag;

    const results = hasActiveSearch
      ? corpus
        .filter((item) => cleanType === "all" || item.kind === cleanType)
        .filter((item) => !cleanTag || dashboardSearchItemHasTag(item, cleanTag))
        .filter((item) => isDashboardSearchItemInRange(item, cleanRange))
        .map((item) => {
          const score = cleanQuery
            ? scoreDashboardSearchText(item.searchText || item.text, cleanQuery)
            : 1;
          return { ...item, score };
        })
        .filter((item) => !cleanQuery || item.score > 0)
      : [];

    return {
      query: cleanQuery,
      type: cleanType,
      tag: cleanTag,
      range: cleanRange,
      sort: cleanSort,
      count: results.length,
      elapsedMs: Date.now() - startedAt,
      facets,
      results: sortDashboardSearchResults(results, cleanSort)
        .slice(0, maxResults)
        .map((item) => ({
          kind: item.kind,
          title: item.title,
          text: item.text,
          score: item.score,
          ts: item.ts,
          tags: item.tags,
          meta: item.meta,
          preview: makeDashboardSearchPreview(item.text, highlightQuery)
        }))
    };
  }

  function buildDashboardSearchCorpus(memoryDir) {
    const config = { ...loadConfig(), memoryDir };
    const index = buildMemoryIndex(readLedger(memoryDir), config);
    const memoryItems = index.records
      .filter((record) => !record.superseded)
      .map((record) => {
        const tags = uniqueDashboardSearchTags([
          record.kind || record.metadata?.kind,
          record.project,
          ...(record.tags || []),
          ...(record.topics || [])
        ]);
        const title = `${record.source || "unknown"}/${record.kind || record.metadata?.kind || "note"}`;
        const text = record.text || "";
        return {
          kind: "memory",
          title,
          text,
          searchText: [title, text, record.project, tags.join(" ")].filter(Boolean).join(" "),
          ts: record.ts || record.indexedAt || "",
          tags,
          meta: {
            project: record.project || "",
            tags: record.tags || [],
            id: record.localEventId || record.id || "",
            source: record.source || "unknown"
          }
        };
      });

    const taskItems = readTasks(memoryDir).map((task) => {
      const tags = uniqueDashboardSearchTags([
        task.project,
        task.status,
        task.priority,
        task.assignee
      ]);
      const text = [
        task.title,
        task.description,
        task.handoff,
        task.project,
        task.assignee,
        task.status,
        task.priority,
        ...(task.notes || []).map((note) => note.text)
      ].filter(Boolean).join(" ");
      return {
        kind: "task",
        title: task.title,
        text,
        searchText: [task.title, text, tags.join(" ")].filter(Boolean).join(" "),
        ts: task.updatedAt || task.createdAt || "",
        tags,
        meta: {
          id: task.id,
          project: task.project,
          status: task.status,
          priority: task.priority,
          assignee: task.assignee
        }
      };
    });

    const radioItems = readRadioMessages(memoryDir).map((message) => {
      const tags = uniqueDashboardSearchTags([
        message.project,
        message.type,
        message.from,
        message.to,
        message.thread
      ]);
      const title = `${message.from || "?"} -> ${message.to || "?"}`;
      const text = [message.from, message.to, message.type, message.project, message.thread, message.text].filter(Boolean).join(" ");
      return {
        kind: "radio",
        title,
        text,
        searchText: [title, text, tags.join(" ")].filter(Boolean).join(" "),
        ts: message.ts || "",
        tags,
        meta: {
          id: message.id,
          project: message.project,
          type: message.type,
          thread: message.thread,
          from: message.from,
          to: message.to
        }
      };
    });

    const workflowItems = readWorkflows(memoryDir).map((workflow) => {
      const roleTags = [
        ...(workflow.planner || []),
        ...(workflow.executor || []),
        ...(workflow.reviewer || []),
        ...(workflow.observer || [])
      ];
      const tags = uniqueDashboardSearchTags([
        workflow.project,
        workflow.status,
        workflow.priority,
        ...roleTags
      ]);
      const text = [
        workflow.title,
        workflow.plan,
        workflow.acceptance,
        workflow.project,
        workflow.status,
        workflow.priority,
        ...roleTags,
        ...(workflow.risks || []),
        ...(workflow.results || []).map((item) => item.text),
        ...(workflow.reviews || []).map((item) => item.text),
        ...(workflow.notes || []).map((item) => item.text)
      ].filter(Boolean).join(" ");
      return {
        kind: "workflow",
        title: workflow.title,
        text,
        searchText: [workflow.title, text, tags.join(" ")].filter(Boolean).join(" "),
        ts: workflow.updatedAt || workflow.createdAt || "",
        tags,
        meta: {
          id: workflow.id,
          project: workflow.project,
          status: workflow.status,
          priority: workflow.priority
        }
      };
    });

    return [...memoryItems, ...taskItems, ...radioItems, ...workflowItems];
  }

  function buildDashboardSearchFacets(items) {
    return {
      types: countBy(items.map((item) => item.kind)).map((item) => ({
        ...item,
        label: titleCase(item.key)
      })),
      tags: countBy(items.flatMap((item) => item.tags || [])).slice(0, 40),
      projects: countBy(items.map((item) => item.meta?.project).filter(Boolean)).slice(0, 20)
    };
  }

  function normalizeDashboardSearchOption(value, allowed, fallback) {
    const normalized = String(value || fallback).trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
  }

  function uniqueDashboardSearchTags(values) {
    const seen = new Set();
    const tags = [];
    for (const value of values.flatMap((item) => normalizeList(item))) {
      const tag = sanitizeInlineText(value);
      const key = normalizeSearchText(tag);
      if (!tag || !key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      tags.push(tag);
    }
    return tags.slice(0, 30);
  }

  function dashboardSearchItemHasTag(item, tag) {
    const normalizedTag = normalizeSearchText(tag);
    return (item.tags || []).some((itemTag) => normalizeSearchText(itemTag) === normalizedTag);
  }

  function isDashboardSearchItemInRange(item, range) {
    if (range === "all") {
      return true;
    }
    const time = Date.parse(item.ts || "");
    if (!Number.isFinite(time)) {
      return false;
    }
    const ranges = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      "90d": 90 * 24 * 60 * 60 * 1000
    };
    return time >= Date.now() - ranges[range];
  }

  function sortDashboardSearchResults(results, sort) {
    const byRelevance = (a, b) =>
      Number(b.score || 0) - Number(a.score || 0) ||
      getDashboardSearchTime(b) - getDashboardSearchTime(a) ||
      String(a.title || "").localeCompare(String(b.title || ""));
    if (sort === "newest") {
      return [...results].sort((a, b) => getDashboardSearchTime(b) - getDashboardSearchTime(a) || byRelevance(a, b));
    }
    if (sort === "oldest") {
      return [...results].sort((a, b) => getDashboardSearchTime(a) - getDashboardSearchTime(b) || byRelevance(a, b));
    }
    return [...results].sort(byRelevance);
  }

  function getDashboardSearchTime(item) {
    const time = Date.parse(item.ts || "");
    return Number.isFinite(time) ? time : 0;
  }

  function scoreDashboardSearchText(text, query) {
    const normalizedText = normalizeSearchText(text);
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery || !normalizedText) {
      return 0;
    }
    let score = normalizedText.includes(normalizedQuery) ? 8 : 0;
    for (const term of extractSearchTerms(normalizedQuery)) {
      if (term && normalizedText.includes(term)) {
        score += term.length >= 4 ? 3 : 1;
      }
    }
    return score;
  }

  function makeDashboardSearchPreview(text, query, radius = 120) {
    const source = sanitizeInlineText(text);
    const normalizedSource = normalizeSearchText(source);
    const normalizedQuery = normalizeSearchText(query);
    const index = normalizedQuery ? normalizedSource.indexOf(normalizedQuery) : -1;
    if (index === -1) {
      return truncateText(source, radius * 2);
    }
    const start = Math.max(0, index - radius);
    const end = Math.min(source.length, index + normalizedQuery.length + radius);
    return `${start > 0 ? "..." : ""}${source.slice(start, end)}${end < source.length ? "..." : ""}`;
  }

  return {
    getDashboardSearch
  };
}
