/** Smart random book picker supporting Factual/Fiction balance and series-order guards. */

export function getReadingBalance(books) {
  const reading = books.filter((b) => b.status === 'reading');
  const factualCount = reading.filter((b) => b.is_factual).length;
  const fictionCount = reading.filter((b) => !b.is_factual).length;
  let suggestedType = 'all';
  if (factualCount === 0 && fictionCount > 0) suggestedType = 'factual';
  else if (fictionCount === 0 && factualCount > 0) suggestedType = 'fiction';
  return { reading, factualCount, fictionCount, suggestedType };
}

export function getEligiblePool(books, options = {}) {
  const {
    type = 'all', // 'all' | 'factual' | 'fiction'
    ownership = 'owned', // 'owned' | 'not_owned' | 'all'
    includeBacklog = false,
    seriesOrderGuard = true,
    excludeIds = new Set(),
  } = options;

  // Build map of series -> lowest unread series_order (books not read/reading)
  const earliestUnreadBySeries = new Map();
  if (seriesOrderGuard) {
    for (const b of books) {
      if (!b.series_id || b.series_order === null || b.series_order === undefined) continue;
      if (b.status === 'read' || b.status === 'abandoned') continue;
      const cur = earliestUnreadBySeries.get(b.series_id);
      if (cur === undefined || b.series_order < cur) {
        earliestUnreadBySeries.set(b.series_id, b.series_order);
      }
    }
  }

  return books.filter((b) => {
    if (excludeIds.has(b.id)) return false;
    if (b.status !== 'unread' && b.status !== 'up_next') return false;
    if (!includeBacklog && b.list_scope === 'series_backlog') return false;
    if (type === 'factual' && !b.is_factual) return false;
    if (type === 'fiction' && b.is_factual) return false;
    if (ownership === 'owned' && b.ownership !== 'owned') return false;
    if (ownership === 'not_owned' && b.ownership !== 'not_owned') return false;

    if (seriesOrderGuard && b.series_id && b.series_order !== null && b.series_order !== undefined) {
      const earliest = earliestUnreadBySeries.get(b.series_id);
      if (earliest !== undefined && b.series_order > earliest) {
        return false;
      }
    }
    return true;
  });
}

export function pickRandomBook(books, options = {}) {
  const { preferUpNext = true } = options;
  const pool = getEligiblePool(books, options);
  if (pool.length === 0) return { pick: null, poolSize: 0 };

  if (!preferUpNext) {
    const idx = Math.floor(Math.random() * pool.length);
    return { pick: pool[idx], poolSize: pool.length };
  }

  // Weight up_next books 3x while preserving randomness across all eligible books
  const weighted = [];
  for (const b of pool) {
    const weight = b.status === 'up_next' ? 3 : 1;
    for (let i = 0; i < weight; i += 1) weighted.push(b);
  }
  const idx = Math.floor(Math.random() * weighted.length);
  return { pick: weighted[idx], poolSize: pool.length };
}
