// PostgREST silently truncates any select to its server max-rows (1000), so a
// plain `.select()` on a big queue returns a partial list with no error. This
// pages with `.range()` until a short page comes back or `max` rows are loaded.
const PAGE = 1000;

export const MAX_LOADED_ROWS = 5000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export interface FetchAllResult<T> {
  rows: T[];
  /** Hit the ceiling with a full last page - there may be more rows than loaded. */
  truncated: boolean;
}

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  max: number = MAX_LOADED_ROWS,
): Promise<FetchAllResult<T>> {
  const rows: T[] = [];
  let lastPageFull = false;
  while (rows.length < max) {
    const from = rows.length;
    const size = Math.min(PAGE, max - from);
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    lastPageFull = batch.length === size;
    if (!lastPageFull) break;
  }
  return { rows, truncated: rows.length >= max && lastPageFull };
}
