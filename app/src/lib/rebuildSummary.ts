// What a "Rebuild from my website" actually changed, worked out by comparing the
// targeting profile before and after. The edge function only returns ok/limited_data.
export interface IcpLike {
  edited_fields: string[];
}

export interface RebuildSummary {
  /** Fields that now hold different, non-empty values. */
  filled: string[];
  /** Fields left alone because the client had edited them before the rebuild. */
  skippedEdited: string[];
  /** Fields that are still empty and were not protected by an edit. */
  stillEmpty: string[];
}

function isEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  return v === null || v === undefined || v === '';
}

export function summarizeRebuild(before: IcpLike, after: IcpLike, keys: readonly string[]): RebuildSummary {
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;
  const lockedBefore = new Set(before.edited_fields ?? []);
  const summary: RebuildSummary = { filled: [], skippedEdited: [], stillEmpty: [] };
  for (const key of keys) {
    if (lockedBefore.has(key)) { summary.skippedEdited.push(key); continue; }
    if (isEmpty(a[key])) { summary.stillEmpty.push(key); continue; }
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) summary.filled.push(key);
  }
  return summary;
}
