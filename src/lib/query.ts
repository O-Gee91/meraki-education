/**
 * Shared list loading. The Data API returns at most 1000 rows per request, so
 * any list that feeds counts, averages or missing-work must page through with
 * `fetchAll`; UI lists that show a slice use `fetchPage`.
 */
export const PAGE_SIZE = 1000;

type RangeResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;

/** Loads every row by requesting consecutive ranges. The builder must apply a stable order. */
export async function fetchAll<T>(build: (from: number, to: number) => RangeResult<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

export type Page<T> = { rows: T[]; total: number | null; nextPage: number | null };

/** One page (1-based). Pass a builder created with `select(cols, { count: "exact" })` to get totals. */
export async function fetchPage<T>(
  build: (from: number, to: number) => RangeResult<T>,
  page = 1,
  limit = 50,
): Promise<Page<T>> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(PAGE_SIZE, Math.max(1, Math.floor(limit)));
  const from = (safePage - 1) * safeLimit;
  const { data, error, count } = await build(from, from + safeLimit - 1);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const total = count ?? null;
  const more = total !== null ? from + rows.length < total : rows.length === safeLimit;
  return { rows, total, nextPage: more ? safePage + 1 : null };
}

/** Splits a long id list so `.in()` filters stay well under URL length limits. */
export function chunk<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
