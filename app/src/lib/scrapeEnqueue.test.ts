import { describe, it, expect, vi } from 'vitest';
import {
  ENQUEUE_URL, ALREADY_QUEUED_MESSAGE, parseEnqueueResponse, enqueueCampaign, queuedMessage,
} from './scrapeEnqueue';

const json = (o: unknown) => JSON.stringify(o);

describe('parseEnqueueResponse', () => {
  it('reads a queued answer with how many jobs are ahead', () => {
    expect(parseEnqueueResponse(200, json({ status: 'queued', queue_id: 'q1', position_ahead: 3 })))
      .toEqual({ kind: 'queued', positionAhead: 3, queueId: 'q1' });
  });

  it('treats position_ahead 0 as next in line, not as missing', () => {
    expect(parseEnqueueResponse(200, json({ status: 'queued', queue_id: 'q1', position_ahead: 0 })))
      .toMatchObject({ kind: 'queued', positionAhead: 0 });
  });

  it('still reports queued when the position is missing', () => {
    expect(parseEnqueueResponse(200, json({ status: 'queued' })))
      .toEqual({ kind: 'queued', positionAhead: null, queueId: null });
  });

  it('shows the monthly prospect limit message (HTTP 200)', () => {
    const msg = 'Monthly prospect limit reached for this client.';
    expect(parseEnqueueResponse(200, json({ status: 'limit_reached', message: msg, monthly_prospect_limit: 500 })))
      .toEqual({ kind: 'limit_reached', message: msg });
  });

  it('shows the launch limit message (HTTP 429) instead of a generic error', () => {
    const msg = 'You have used all 5 free launches and have no credits remaining. Your free launches reset on the 1st of next month.';
    expect(parseEnqueueResponse(429, json({ status: 'launch_limit_reached', message: msg, launches_used: 5 })))
      .toEqual({ kind: 'launch_limit_reached', message: msg });
  });

  it('treats a bare 429 as the launch limit even without a recognisable body', () => {
    expect(parseEnqueueResponse(429, 'Too Many Requests')).toMatchObject({ kind: 'launch_limit_reached' });
  });

  describe('already_queued (primary path: WF0a answers HTTP 409 with a status)', () => {
    it('reads the status and shows the server message', () => {
      expect(parseEnqueueResponse(409, json({ status: 'already_queued', message: 'This campaign is already in the scrape queue.' })))
        .toEqual({ kind: 'already_queued', message: 'This campaign is already in the scrape queue.' });
    });

    it('uses the default message when the server sends none', () => {
      expect(parseEnqueueResponse(409, json({ status: 'already_queued' })))
        .toEqual({ kind: 'already_queued', message: ALREADY_QUEUED_MESSAGE });
    });

    it('does not depend on the HTTP status', () => {
      for (const s of [200, 409, 500]) {
        expect(parseEnqueueResponse(s, json({ status: 'already_queued' })).kind).toBe('already_queued');
      }
    });

    it('is decided by the status field before any text matching', () => {
      // A body that also mentions a limit in its text must still be read as already queued.
      expect(parseEnqueueResponse(409, json({ status: 'already_queued', message: 'Monthly limit unaffected; already queued.' })).kind)
        .toBe('already_queued');
    });
  });

  describe('already_queued (fallback: raw Postgres text from an older workflow)', () => {
  it.each([
    ['postgres code', json({ message: 'duplicate key value violates unique constraint', code: '23505' })],
    ['plain message', json({ message: 'duplicate key value violates unique constraint "discovery_queue_one_active_per_campaign"' })],
    ['index name only', json({ message: 'discovery_queue_one_active_per_campaign' })],
    ['code only', json({ code: '23505' })],
    ['non-JSON text', 'ERROR: 23505 unique violation'],
  ])('maps a duplicate-key failure (%s) to "already queued", whatever the HTTP status', (_n, body) => {
    for (const status of [200, 409, 500]) {
      expect(parseEnqueueResponse(status, body)).toEqual({ kind: 'already_queued', message: ALREADY_QUEUED_MESSAGE });
    }
  });
  });

  it('does not mistake a limit message for a duplicate', () => {
    expect(parseEnqueueResponse(200, json({ status: 'limit_reached', message: 'Monthly prospect limit reached' })).kind)
      .toBe('limit_reached');
  });

  it('surfaces the server message for any other failure', () => {
    expect(parseEnqueueResponse(500, json({ message: 'Workflow execution failed' })))
      .toEqual({ kind: 'error', message: 'Workflow execution failed' });
  });

  it('falls back to the HTTP status when the body says nothing useful', () => {
    expect(parseEnqueueResponse(502, '<html>Bad gateway</html>')).toEqual({ kind: 'error', message: 'Scrape service returned 502' });
    expect(parseEnqueueResponse(500, '')).toEqual({ kind: 'error', message: 'Scrape service returned 500' });
  });

  it('does not treat the old worker answer ("started") as a launch', () => {
    expect(parseEnqueueResponse(200, json({ status: 'started' })).kind).toBe('error');
  });
});

describe('enqueueCampaign', () => {
  it('posts only the campaign id to the wf0-enqueue gate', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(json({ status: 'queued', position_ahead: 1 }), { status: 200 }));
    const out = await enqueueCampaign('c-1', fetchFn as unknown as typeof fetch);
    expect(out).toMatchObject({ kind: 'queued', positionAhead: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(ENQUEUE_URL);
    expect(url).toMatch(/\/webhook\/wf0-enqueue$/);
    expect(url).not.toContain('wf0-discover');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ campaign_id: 'c-1' });
  });

  it('reads the body of a 429 rather than reporting a generic failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(json({ status: 'launch_limit_reached', message: 'No free launches and no credits.' }), { status: 429 }));
    expect(await enqueueCampaign('c-1', fetchFn as unknown as typeof fetch))
      .toEqual({ kind: 'launch_limit_reached', message: 'No free launches and no credits.' });
  });

  it('reports an unreachable service', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await enqueueCampaign('c-1', fetchFn as unknown as typeof fetch))
      .toEqual({ kind: 'error', message: 'Could not reach the scrape service' });
  });
});

describe('queuedMessage', () => {
  it('says queued, never started, and shows the position', () => {
    expect(queuedMessage('Prague Cafes', 2)).toBe('"Prague Cafes" queued - 2 ahead of it. The scraper picks up jobs every few minutes.');
    expect(queuedMessage('Prague Cafes', 0)).toContain('next in line');
    expect(queuedMessage('Prague Cafes', null)).toBe('"Prague Cafes" queued. The scraper picks up jobs every few minutes.');
    for (const p of [0, 2, null]) expect(queuedMessage('x', p)).not.toMatch(/start/i);
  });
});

// The worker is only for the dispatcher. Calling it from the app skips the prospect limit, the
// free-launch limit and the credit charge, and never inserts the discovery_queue row that the
// launch-counting trigger listens to.
describe('no app code calls the worker directly', () => {
  const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('finds the app sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('has no reference to the wf0-discover webhook outside comments and tests', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.(ts|tsx)$/.test(path))
      .filter(([, src]) => /wf0-discover/.test(strip(src)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
