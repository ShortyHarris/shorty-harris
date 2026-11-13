import { describe, it, expect } from 'vitest';
import { formatSendTime, sendTimeText } from './sendQueueView';
import { skippedLine, parseSendQueue } from '../hooks/useSendQueue';

const TZ = 'Europe/Prague';
// Thursday 13 Nov 2026, 10:00 in Prague.
const NOW = new Date('2026-11-13T09:00:00Z');

describe('send queue time labels', () => {
  it('says Today / Tomorrow / the date, in the client time zone', () => {
    expect(formatSendTime('2026-11-13T13:20:00Z', TZ, NOW)).toBe('Today, 14:20');
    expect(formatSendTime('2026-11-14T08:00:00Z', TZ, NOW)).toBe('Tomorrow, 09:00');
    expect(formatSendTime('2026-11-17T08:00:00Z', TZ, NOW)).toMatch(/^Tue 17 Nov, 09:00$/);
  });

  it('treats an overdue estimate as today (it goes out on the next run)', () => {
    expect(formatSendTime('2026-11-12T08:00:00Z', TZ, NOW)).toBe('Today, 09:00');
  });

  it('shows Sending now once the sender has claimed it, whatever the estimate', () => {
    expect(sendTimeText({ sending: true, estimated_send_at: '2026-11-17T08:00:00Z', time_zone: TZ, basis: null, category: 'sendable' }, NOW))
      .toBe('Sending now');
  });

  it('explains a missing send time', () => {
    const base = { sending: false, estimated_send_at: null, time_zone: TZ, category: 'blocked' as const };
    expect(sendTimeText({ ...base, basis: 'held_by_send_rules' }, NOW)).toBe('Held by send rules');
    expect(sendTimeText({ ...base, basis: null }, NOW)).toBe('Not scheduled: blocked');
  });
});

describe('send queue results', () => {
  it('reports what was skipped and why', () => {
    expect(skippedLine({})).toBeNull();
    expect(skippedLine({ sending: 1, not_queued: 2 })).toBe('3 skipped: 1 being sent right now, 2 no longer waiting to send');
  });

  it('throws on a refused request instead of showing an empty queue', () => {
    expect(() => parseSendQueue({ ok: false, error: 'not_permitted' })).toThrow('not_permitted');
    expect(parseSendQueue({ ok: true, total: 0 }).windows).toEqual({ all: 0, today: 0, tomorrow: 0, later: 0, unscheduled: 0 });
  });
});
