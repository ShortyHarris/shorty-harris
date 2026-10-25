// `.in('id', ids)` puts every id in the request URL (~37 bytes each), so a few
// thousand ids blow past URL limits. Bulk writes go through here instead: ids
// are sent in batches, run one after another, and the affected rows are summed.
export const BULK_CHUNK_SIZE = 200;

export interface ChunkedResult {
  /** Rows actually changed across all batches that succeeded. */
  affected: number;
  /** Ids submitted. */
  total: number;
  failedBatches: number;
  /** First failure message, or null when every batch succeeded. */
  error: string | null;
}

type BatchResult = PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;

export async function runInChunks(
  ids: string[],
  run: (chunk: string[]) => BatchResult,
  size: number = BULK_CHUNK_SIZE,
): Promise<ChunkedResult> {
  const result: ChunkedResult = { affected: 0, total: ids.length, failedBatches: 0, error: null };
  // A failed batch doesn't stop the rest: later batches may still succeed, and
  // the caller reports the honest partial count.
  for (let i = 0; i < ids.length; i += size) {
    try {
      const { data, error } = await run(ids.slice(i, i + size));
      if (error) throw new Error(error.message);
      result.affected += data?.length ?? 0;
    } catch (e) {
      result.failedBatches += 1;
      result.error ??= e instanceof Error ? e.message : 'Request failed';
    }
  }
  return result;
}

/** Toast copy for a bulk run that had failed batches. */
export function partialFailureMessage(
  r: Pick<ChunkedResult, 'affected' | 'total'>, verbPast: string, verbBase: string,
): string {
  return r.affected > 0
    ? `${r.affected} of ${r.total} ${verbPast}, some failed, try again.`
    : `Couldn't ${verbBase} - please try again.`;
}
