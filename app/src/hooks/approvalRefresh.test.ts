import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: null }) }));

import { queryClient } from '../lib/queryClient';
import { invalidateApprovalQueries, settleWrite, APPROVAL_REFRESH_DEBOUNCE_MS, clientApprovalsKey } from './useClientApprovals';

// 13 Nov 2026: one tap per second on Approve fired five approvals refetches, the realtime
// listener fired five more for the same write, and each invalidation left the previous
// request running on the database. The pile-up timed out 294 calls in 12 minutes.

describe('invalidateApprovalQueries', () => {
  beforeEach(() => { vi.useFakeTimers(); queryClient.clear(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('a burst of ten writes becomes one refresh of each key', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    for (let i = 0; i < 10; i++) {
      invalidateApprovalQueries('c1');
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(APPROVAL_REFRESH_DEBOUNCE_MS);
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it('never cancels a request already running (the database would keep running it)', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    invalidateApprovalQueries('c1');
    await vi.advanceTimersByTimeAsync(APPROVAL_REFRESH_DEBOUNCE_MS);
    for (const call of spy.mock.calls) expect(call[1]).toEqual({ cancelRefetch: false });
  });

  it('waits while a previous refetch is still in flight, then refreshes once it lands', async () => {
    let finish!: (v: unknown) => void;
    const slow = queryClient.fetchQuery({ queryKey: clientApprovalsKey('c1'), queryFn: () => new Promise((r) => { finish = r; }) });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    invalidateApprovalQueries('c1');
    await vi.advanceTimersByTimeAsync(APPROVAL_REFRESH_DEBOUNCE_MS * 3);
    expect(spy).not.toHaveBeenCalled();
    finish([]);
    await slow;
    await vi.advanceTimersByTimeAsync(APPROVAL_REFRESH_DEBOUNCE_MS);
    expect(spy).toHaveBeenCalledTimes(5);
  });
});

describe('settleWrite (single approve / reject)', () => {
  beforeEach(() => { vi.useFakeTimers(); queryClient.clear(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('a thrown request becomes an error message, never an escaped rejection', async () => {
    const res = await settleWrite('c1', () => Promise.reject(new Error('TypeError: Load failed')));
    expect(res.error).toMatch(/no connection/);
  });

  it('a timed-out request says so in plain words', async () => {
    const res = await settleWrite('c1', async () => ({
      data: null, error: { message: "RequestTimeoutError: The server didn't answer within 25 seconds." },
    }));
    expect(res.error).toMatch(/didn't answer in time/);
  });

  it('zero rows changed means someone else already handled it', async () => {
    const res = await settleWrite('c1', async () => ({ data: [], error: null }));
    expect(res.error).toMatch(/already handled/);
  });

  it('refreshes the lists after success and after failure', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    await settleWrite('c1', async () => ({ data: [{ id: 'm1' }], error: null }));
    await settleWrite('c1', () => Promise.reject(new Error('x')));
    await vi.advanceTimersByTimeAsync(APPROVAL_REFRESH_DEBOUNCE_MS);
    expect(spy).toHaveBeenCalledTimes(5);
  });
});
