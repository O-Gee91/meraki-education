import { useCallback, useState } from "react";

/** Next display limit after "Show older"; never exceeds the hard ceiling. */
export function nextPageLimit(current: number, step: number, ceiling = 1000) {
  return Math.min(ceiling, current + step);
}

/** A page is full (more may exist) only when it returned exactly the requested limit. */
export function hasMorePages(loaded: number, limit: number, ceiling = 1000) {
  return loaded >= limit && limit < ceiling;
}

/**
 * Display-only progressive loading. Never use for reads that feed counts,
 * averages or missing work — those load completely through fetchAll.
 */
export function usePagedLimit(step: number, ceiling = 1000) {
  const [limit, setLimit] = useState(step);
  const showMore = useCallback(() => setLimit((l) => nextPageLimit(l, step, ceiling)), [step, ceiling]);
  return { limit, showMore, hasMore: (loaded: number) => hasMorePages(loaded, limit, ceiling) };
}
