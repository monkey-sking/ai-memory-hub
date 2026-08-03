import path from "node:path";

export function createDashboardMemoryApi(deps) {
  const {
    appendJsonl,
    buildMemoryIndex,
    createId,
    getMemoryIdentityKeys,
    getMemoryPrimaryKey,
    isPlainObject,
    loadConfig,
    normalizeMemoryMetadata,
    normalizeSupersedeToken,
    readEvents,
    readLedger,
    readTextIfExists
  } = deps;

  function getDashboardMemory(memoryDir) {
    const config = { ...loadConfig(), memoryDir };
    const index = buildMemoryIndex(readLedger(memoryDir), config);
    return {
      memory: readTextIfExists(path.join(memoryDir, "MEMORY.md")),
      profile: readTextIfExists(path.join(memoryDir, "profile.md")),
      pending: readEvents(path.join(memoryDir, "inbox", "events.jsonl")),
      records: index.records
        .filter((record) => !record.superseded && isDashboardMemoryVisible(record))
        .sort((a, b) => String(b.ts || b.indexedAt || "").localeCompare(String(a.ts || a.indexedAt || "")))
        .slice(0, 200)
        .map(formatDashboardMemoryRecord)
    };
  }

  function isDashboardMemoryVisible(record) {
    const state = record.lifecycle?.state || record.metadata?.lifecycle?.state || "active";
    if (["archived", "superseded", "revoked", "stale"].includes(state)) return false;
    const expiresAt = record.metadata?.expiresAt || record.lifecycle?.expiresAt;
    return !expiresAt || !Number.isFinite(Date.parse(expiresAt)) || new Date(expiresAt) >= new Date();
  }

  function formatDashboardMemoryRecord(record) {
    return {
      id: record.id || "",
      localEventId: record.localEventId || "",
      ts: record.ts || "",
      indexedAt: record.indexedAt || "",
      source: record.source || "unknown",
      text: record.text || "",
      kind: record.kind || record.metadata?.kind || "note",
      project: record.project || record.metadata?.project || "",
      tags: record.tags || record.metadata?.tags || [],
      scope: record.scope || record.metadata?.scope || "",
      layer: record.layer || "",
      importance: record.importance || 0,
      superseded: Boolean(record.superseded),
      supersededBy: record.supersededBy || record.metadata?.supersededBy || [],
      metadata: {
        kind: record.kind || record.metadata?.kind || "note",
        project: record.project || record.metadata?.project || "",
        scope: record.scope || record.metadata?.scope || "",
        supersedes: record.metadata?.supersedes || record.supersedes || "",
        refs: record.refs || record.metadata?.refs || {}
      }
    };
  }

  function createMemorySupersedeEvent(memoryDir, body) {
    const targetId = normalizeSupersedeToken(body.id);
    const config = { ...loadConfig(), memoryDir };
    const index = buildMemoryIndex(readLedger(memoryDir), config);
    const target = index.records.find((record) => getMemoryIdentityKeys(record).includes(targetId));
    if (!target) {
      throw new Error("memory record not found");
    }

    const text = String(body.text || "").trim();
    if (!text) {
      throw new Error("text is required");
    }
    const supersedes = getMemoryPrimaryKey(target) || targetId;
    const bodyRefs = isPlainObject(body.refs) ? body.refs : {};
    const metadata = normalizeMemoryMetadata({
      kind: body.kind || target.kind || target.metadata?.kind || "note",
      project: body.project || target.project || target.metadata?.project || "",
      tags: body.tags || target.tags || target.metadata?.tags || [],
      scope: body.scope || target.scope || target.metadata?.scope || "",
      confidence: body.confidence ?? target.confidence ?? target.metadata?.confidence,
      refs: {
        ...(target.refs || target.metadata?.refs || {}),
        ...bodyRefs,
        sourceId: target.localEventId || target.id || supersedes
      },
      supersedes,
      lifecycle: {
        ...(target.metadata?.lifecycle || {}),
        action: "supersede",
        supersedes
      }
    }, target);
    metadata.supersedes = supersedes;

    const event = {
      id: `supersede-${createId(`${supersedes}:${text}`)}`,
      ts: new Date().toISOString(),
      source: body.source || "dashboard",
      text,
      metadata
    };
    appendJsonl(path.join(memoryDir, "inbox", "events.jsonl"), event);
    return event;
  }

  return {
    createMemorySupersedeEvent,
    getDashboardMemory
  };
}
