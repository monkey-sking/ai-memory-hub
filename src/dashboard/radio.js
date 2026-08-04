export function createDashboardRadioApi({ readRadioMessages }) {
  function getDashboardRadio(memoryDir, options = {}) {
    const offset = normalizePageValue(options.offset, 0);
    const limit = normalizePageValue(options.limit, 50, 500);
    const orderedMessages = readRadioMessages(memoryDir);
    const pageEnd = Math.max(orderedMessages.length - offset, 0);
    const pageStart = Math.max(pageEnd - limit, 0);
    return {
      messages: orderedMessages.slice(pageStart, pageEnd),
      total: orderedMessages.length,
      offset,
      limit,
      hasMore: offset + limit < orderedMessages.length
    };
  }

  function normalizePageValue(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.min(maximum, Math.floor(parsed));
  }

  return {
    getDashboardRadio
  };
}
