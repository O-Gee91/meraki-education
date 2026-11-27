type ScopedQuery<T> = {
  in: (column: "class_id", values: string[]) => ScopedQuery<T>;
  limit: (count: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

/**
 * Teacher mode narrows upcoming work to that teacher's classes before the
 * row cap. A null scope is the whole school (admin mode). An empty set is
 * an empty list, not a school-wide page that later filters down to nothing.
 */
export function applyClassScope<T>(
  query: ScopedQuery<T>,
  classIds: ReadonlySet<string> | null | undefined,
  limit: number,
): PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  if (classIds == null) return query.limit(limit);
  const ids = [...classIds];
  if (ids.length === 0) return Promise.resolve({ data: [], error: null });
  return query.in("class_id", ids).limit(limit);
}
