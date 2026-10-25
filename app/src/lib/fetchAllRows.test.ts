import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows, MAX_LOADED_ROWS } from './fetchAllRows';

// A fake table of `n` rows served through .range()-style (from, to) pages.
function table(n: number) {
  const page = vi.fn((from: number, to: number) => {
    const rows = Array.from({ length: Math.max(0, Math.min(to + 1, n) - from) }, (_, i) => ({ id: from + i }));
    return Promise.resolve({ data: rows, error: null });
  });
  return page;
}

describe('fetchAllRows', () => {
  it('stops on a short page and is not truncated', async () => {
    const page = table(2300);
    const res = await fetchAllRows(page);
    expect(res.rows).toHaveLength(2300);
    expect(res.truncated).toBe(false);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it('is not truncated when there are no rows', async () => {
    const res = await fetchAllRows(table(0));
    expect(res).toEqual({ rows: [], truncated: false });
  });

  it('flags truncated when the 5000 ceiling is hit with a full last page, and stops there', async () => {
    const page = table(12000);
    const res = await fetchAllRows(page);
    expect(MAX_LOADED_ROWS).toBe(5000);
    expect(res.rows).toHaveLength(5000);
    expect(res.truncated).toBe(true);
    expect(page).toHaveBeenCalledTimes(5);
    expect(page).toHaveBeenLastCalledWith(4000, 4999);
  });

  it('never requests past the ceiling for a custom max that is not a multiple of the page size', async () => {
    const page = table(5000);
    const res = await fetchAllRows(page, 2500);
    expect(res.rows).toHaveLength(2500);
    expect(res.truncated).toBe(true);
    expect(page).toHaveBeenLastCalledWith(2000, 2499);
  });

  it('throws on a page error instead of returning a partial list', async () => {
    const page = vi.fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'page 2 failed' } });
    await expect(fetchAllRows(page)).rejects.toThrow('page 2 failed');
  });
});
