import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout, timeoutFor, settleWithin, RequestTimeoutError, REST_TIMEOUT_MS, AUTH_TIMEOUT_MS } from './fetchWithTimeout';

const REST = 'https://x.supabase.co/rest/v1/messages?id=eq.1';

/** A fetch that never answers, but rejects like the browser does when its signal aborts. */
function hangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
}

afterEach(() => { vi.useRealTimers(); });

describe('timeoutFor', () => {
  it('limits REST and auth calls only', () => {
    expect(timeoutFor(REST)).toBe(REST_TIMEOUT_MS);
    expect(timeoutFor('https://x.supabase.co/auth/v1/token?grant_type=refresh_token')).toBe(AUTH_TIMEOUT_MS);
    expect(timeoutFor('https://x.supabase.co/storage/v1/object/a.png')).toBeNull();
    expect(timeoutFor('https://x.supabase.co/functions/v1/start-impersonation')).toBeNull();
  });
});

describe('withTimeout', () => {
  it('a request that never answers fails with RequestTimeoutError instead of hanging (13 Nov reject stuck on "Working…")', async () => {
    vi.useFakeTimers();
    const f = withTimeout(hangingFetch() as unknown as typeof fetch, () => 1000);
    const p = f(REST, { method: 'PATCH' });
    const assertion = expect(p).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('a fast response passes straight through', async () => {
    const ok = new Response('[]', { status: 200 });
    const f = withTimeout(vi.fn().mockResolvedValue(ok) as unknown as typeof fetch);
    await expect(f(REST)).resolves.toBe(ok);
  });

  it("the caller's own abort still cancels, and is not reported as a timeout", async () => {
    const f = withTimeout(hangingFetch() as unknown as typeof fetch, () => 60_000);
    const caller = new AbortController();
    const p = f(REST, { signal: caller.signal });
    caller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('leaves unlimited URLs alone (no signal added)', async () => {
    const base = vi.fn().mockResolvedValue(new Response('ok'));
    const f = withTimeout(base as unknown as typeof fetch);
    await f('https://x.supabase.co/storage/v1/object/a.png', { method: 'POST' });
    expect(base.mock.calls[0][1]).toEqual({ method: 'POST' });
  });
});

describe('settleWithin', () => {
  it('rejects a promise that never settles', async () => {
    vi.useFakeTimers();
    const p = settleWithin(new Promise(() => {}), 500);
    const assertion = expect(p).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });
  it('passes a value through', async () => {
    await expect(settleWithin(Promise.resolve(3), 500)).resolves.toBe(3);
  });
});
