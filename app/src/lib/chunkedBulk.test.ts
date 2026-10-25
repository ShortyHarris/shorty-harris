import { describe, it, expect, vi } from 'vitest';
import { runInChunks, partialFailureMessage, BULK_CHUNK_SIZE } from './chunkedBulk';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);
const ok = (chunk: string[]) => Promise.resolve({ data: chunk.map((id) => ({ id })), error: null });

describe('runInChunks', () => {
  it('uses batches of 200: 450 ids is 3 requests (200, 200, 50) and sums the affected rows', async () => {
    const run = vi.fn(ok);
    const res = await runInChunks(ids(450), run);
    expect(BULK_CHUNK_SIZE).toBe(200);
    expect(run.mock.calls.map(([c]) => c.length)).toEqual([200, 200, 50]);
    expect(res).toEqual({ affected: 450, total: 450, failedBatches: 0, error: null });
  });

  it('sends every id exactly once, in order', async () => {
    const seen: string[] = [];
    await runInChunks(ids(450), (c) => { seen.push(...c); return ok(c); });
    expect(seen).toEqual(ids(450));
  });

  it('counts only rows that actually changed (already-handled rows are not affected)', async () => {
    const res = await runInChunks(ids(300), (c) => Promise.resolve({ data: c.slice(0, 10).map((id) => ({ id })), error: null }));
    expect(res.affected).toBe(20);
    expect(res.failedBatches).toBe(0);
  });

  it('keeps going after a failed batch and reports the partial count honestly', async () => {
    const run = vi.fn((c: string[]) =>
      c[0] === 'id-200'
        ? Promise.resolve({ data: null, error: { message: 'boom' } })
        : ok(c));
    const res = await runInChunks(ids(450), run);
    expect(run).toHaveBeenCalledTimes(3);
    expect(res).toEqual({ affected: 250, total: 450, failedBatches: 1, error: 'boom' });
  });

  it('treats a thrown request as a failed batch, not a crash', async () => {
    const run = vi.fn((c: string[]) => (c[0] === 'id-0' ? Promise.reject(new Error('network down')) : ok(c)));
    const res = await runInChunks(ids(250), run);
    expect(res.failedBatches).toBe(1);
    expect(res.affected).toBe(50);
    expect(res.error).toBe('network down');
  });

  it('reports total failure with zero affected', async () => {
    const res = await runInChunks(ids(250), () => Promise.resolve({ data: null, error: { message: 'nope' } }));
    expect(res).toEqual({ affected: 0, total: 250, failedBatches: 2, error: 'nope' });
  });

  it('makes no requests for an empty list', async () => {
    const run = vi.fn(ok);
    expect(await runInChunks([], run)).toEqual({ affected: 0, total: 0, failedBatches: 0, error: null });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('partialFailureMessage', () => {
  it('states the partial count', () => {
    expect(partialFailureMessage({ affected: 120, total: 340 }, 'approved', 'approve'))
      .toBe('120 of 340 approved, some failed, try again.');
  });
  it('falls back to a plain failure when nothing went through', () => {
    expect(partialFailureMessage({ affected: 0, total: 340 }, 'approved', 'approve'))
      .toBe("Couldn't approve - please try again.");
  });
});
