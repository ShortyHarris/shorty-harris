// Query building for the admin Prospects list. Kept pure (no supabase import)
// so escaping, paging and filters can be unit-tested against a fake builder.
export const PROSPECT_PAGE_SIZE = 50;

export const SEARCH_COLUMNS = ['business_name', 'email', 'contact_name'] as const;

export interface ProspectFilters {
  q: string;
  status: string;
  category: string;
}

/**
 * Makes user text literal inside an ilike pattern that sits in a PostgREST
 * `.or()` string. Two layers: LIKE-escape `\`, `%`, `_` so they are not
 * wildcards, then wrap in double quotes (escaping `\` and `"`) so commas and
 * parentheses cannot split or break the filter list.
 */
export function escapeSearchTerm(q: string): string {
  const like = q.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  return like.replace(/[\\"]/g, (c) => `\\${c}`);
}

/** The `.or()` expression for the search box, or null when it is empty. */
export function buildSearchOr(q: string): string | null {
  const term = escapeSearchTerm(q);
  if (!term) return null;
  return SEARCH_COLUMNS.map((c) => `${c}.ilike."%${term}%"`).join(',');
}

export function pageRange(page: number, size: number = PROSPECT_PAGE_SIZE): { from: number; to: number } {
  const p = Math.max(1, Math.floor(page) || 1);
  const from = (p - 1) * size;
  return { from, to: from + size - 1 };
}

export function totalPages(total: number, size: number = PROSPECT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Keeps a page number inside 1..last, e.g. after a delete empties the last page. */
export function clampPage(page: number, total: number, size: number = PROSPECT_PAGE_SIZE): number {
  return Math.min(Math.max(1, page), totalPages(total, size));
}

/** "Showing 51-100 of 230", or "Showing 0 of 0" when empty. */
export function rangeLabel(page: number, total: number, size: number = PROSPECT_PAGE_SIZE): string {
  if (total === 0) return 'Showing 0 of 0';
  const p = clampPage(page, total, size);
  const from = (p - 1) * size + 1;
  const to = Math.min(p * size, total);
  return `Showing ${from}-${to} of ${total}`;
}

interface FilterBuilder<T> {
  eq(column: string, value: string): T;
  or(filters: string): T;
}

export function applyProspectFilters<T extends FilterBuilder<T>>(query: T, f: ProspectFilters): T {
  let out = query;
  if (f.status !== 'all') out = out.eq('pipeline_status', f.status);
  if (f.category !== 'all') out = out.eq('category', f.category);
  const or = buildSearchOr(f.q);
  if (or) out = out.or(or);
  return out;
}

export interface ProspectCategory {
  category: string;
  n: number;
}

/** Maps admin_prospect_categories() rows; drops blank categories, coerces counts. */
export function mapCategoryRows(data: unknown): ProspectCategory[] {
  if (!Array.isArray(data)) return [];
  const out: ProspectCategory[] = [];
  for (const r of data as Array<{ category?: unknown; n?: unknown }>) {
    const category = typeof r.category === 'string' ? r.category.trim() : '';
    if (!category) continue;
    out.push({ category, n: Number(r.n) || 0 });
  }
  return out;
}
