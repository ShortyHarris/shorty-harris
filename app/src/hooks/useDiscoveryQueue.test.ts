import { describe, it, expect } from 'vitest';
import { computeQueue, type QueueRow } from './useDiscoveryQueue';

const q = (campaign_id: string, status: QueueRow['status'], requested_at: string | null): QueueRow =>
  ({ campaign_id, status, requested_at });

describe('computeQueue', () => {
  it('maps each active campaign to its queue status', () => {
    const out = computeQueue([q('a', 'queued', '2026-10-31T10:00:00Z'), q('b', 'running', '2026-10-31T09:00:00Z')]);
    expect(out.state).toEqual({ a: 'queued', b: 'running' });
  });

  it('counts queued jobs requested earlier as "ahead"', () => {
    const out = computeQueue([
      q('third', 'queued', '2026-10-31T10:03:00Z'),
      q('first', 'queued', '2026-10-31T10:01:00Z'),
      q('second', 'queued', '2026-10-31T10:02:00Z'),
    ]);
    expect(out.ahead).toEqual({ first: 0, second: 1, third: 2 });
  });

  it('does not count a running job as ahead, and gives it no position', () => {
    const out = computeQueue([q('run', 'running', '2026-10-31T09:00:00Z'), q('wait', 'queued', '2026-10-31T10:00:00Z')]);
    expect(out.ahead).toEqual({ wait: 0 });
    expect('run' in out.ahead).toBe(false);
  });

  it('leaves the position unknown for a queued row without a timestamp', () => {
    const out = computeQueue([q('a', 'queued', null), q('b', 'queued', '2026-10-31T10:00:00Z')]);
    expect(out.state.a).toBe('queued');
    expect('a' in out.ahead).toBe(false);
    expect(out.ahead.b).toBe(0);
  });

  it('is empty for an empty queue', () => {
    expect(computeQueue([])).toEqual({ state: {}, ahead: {} });
  });
});
