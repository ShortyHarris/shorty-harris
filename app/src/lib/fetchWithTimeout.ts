// Every Supabase REST and auth request gets a deadline.
//
// Neither the browser nor supabase-js puts a time limit on fetch. When the database was
// saturated (13 Nov 2026: approved_queue / approvals_schedule hitting the statement timeout
// and PostgREST running out of pooled connections), mobile Safari left some requests pending
// with no answer at all. Anything awaiting one stayed stuck: the Reject modal on "Working…",
// and after a reload the auth bootstrap on the splash spinner. With a deadline the request
// fails like any other network error, and the caller shows an error and lets the user retry.
//
// Only /rest/v1/ and /auth/v1/ are limited. Storage uploads and edge functions can
// legitimately run for a long time, and Realtime uses a WebSocket, not fetch.

/** Long enough for an 8 s statement timeout plus PostgREST's 10 s wait for a pooled connection. */
export const REST_TIMEOUT_MS = 25_000;
export const AUTH_TIMEOUT_MS = 15_000;

export class RequestTimeoutError extends Error {
  readonly ms: number;
  constructor(ms: number) {
    super(`The server didn't answer within ${Math.round(ms / 1000)} seconds. Check your connection and try again.`);
    this.name = 'RequestTimeoutError';
    this.ms = ms;
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function timeoutFor(url: string): number | null {
  if (url.includes('/rest/v1/')) return REST_TIMEOUT_MS;
  if (url.includes('/auth/v1/')) return AUTH_TIMEOUT_MS;
  return null;
}

/**
 * Wraps a fetch so limited requests are aborted after their deadline. A caller's own
 * AbortSignal (react-query cancellation, `.abortSignal()`) still works and wins.
 */
export function withTimeout(baseFetch: typeof fetch, pick: (url: string) => number | null = timeoutFor): typeof fetch {
  return (input, init) => {
    const ms = pick(urlOf(input));
    if (ms === null) return baseFetch(input, init);

    const controller = new AbortController();
    const outer = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const onOuterAbort = () => controller.abort(outer?.reason);
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener('abort', onOuterAbort, { once: true });
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    // The deadline rejects on its own rather than waiting for the aborted fetch to reject:
    // WebKit does not always settle a pending fetch promise promptly on abort, and a deadline
    // that depends on it is no deadline.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new RequestTimeoutError(ms));
        controller.abort();
      }, ms);
    });

    return Promise.race([baseFetch(input, { ...init, signal: controller.signal }), deadline])
      .finally(() => {
        clearTimeout(timer);
        outer?.removeEventListener('abort', onOuterAbort);
      });
  };
}

/** Rejects with RequestTimeoutError if `promise` hasn't settled within `ms`. */
export function settleWithin<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestTimeoutError(ms)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
