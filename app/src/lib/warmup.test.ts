import { describe, it, expect } from 'vitest';
import { parseSendPacing } from './sendPacing';
import { warmupView, queueEta, WARMUP_EXPLAINER } from './warmup';

const NOW = new Date('2026-10-28T17:00:00Z');
const LADDER = [
  { cap: 5, starts_on: '2026-10-28' }, { cap: 10, starts_on: '2026-11-04' }, { cap: 20, starts_on: '2026-11-11' },
  { cap: 30, starts_on: '2026-11-18' }, { cap: 40, starts_on: '2026-11-25' },
];

function pacing(day: number, over: Record<string, unknown> = {}) {
  const caps = [5, 10, 20, 30, 40];
  return parseSendPacing({
    ok: true,
    time_zone: 'America/Chicago',
    mailbox_connected: true,
    warmup: { mode: 'ramp', active: day < 28, day, ladder: LADDER },
    today: { cap: caps[Math.min(4, Math.floor(day / 7))], sent: 3, remaining: 2, in_window_now: true },
    queue: { ready: 200, estimated_clear_date: '2026-12-03' },
    ...over,
  });
}

describe('warmupView', () => {
  it('first week: step 1 of 5, with the full-speed date in plain words', () => {
    const v = warmupView(pacing(0), NOW)!;
    expect(v.stage).toBe(1);
    expect(v.stages).toBe(5);
    expect(v.finished).toBe(false);
    expect(v.pill).toEqual({
      title: 'Warming up your mailbox',
      detail: 'Full speed (40 a day) by Nov 25',
      short: '🌡 Full speed Nov 25',
    });
    expect(v.heading).toBe('Why only 5 emails a day?');
    expect(v.explainer).toBe(WARMUP_EXPLAINER);
    expect(v.steps.map((s) => [s.cap, s.when, s.state])).toEqual([
      [5, 'This week', 'now'], [10, 'From Nov 4', 'next'], [20, 'From Nov 11', 'next'],
      [30, 'From Nov 18', 'next'], [40, 'From Nov 25', 'next'],
    ]);
  });

  it('moves up a step every 7 days and says the current limit', () => {
    expect(warmupView(pacing(6), NOW)!.stage).toBe(1);
    expect(warmupView(pacing(7), NOW)!.stage).toBe(2);
    const third = warmupView(pacing(15), NOW)!;
    expect(third.stage).toBe(3);
    expect(third.heading).toBe('Why only 20 emails a day?');
    expect(third.steps.map((s) => s.state)).toEqual(['done', 'done', 'now', 'next', 'next']);
    expect(warmupView(pacing(27), NOW)!.stage).toBe(4);
  });

  it('shows "Fully warmed up" for a week after warm-up ends, then nothing', () => {
    const done = warmupView(pacing(28), NOW)!;
    expect(done.finished).toBe(true);
    expect(done.stage).toBe(5);
    expect(done.pill).toEqual({ title: 'Fully warmed up', detail: 'Up to 40 a day', short: '🔥 Full speed' });
    expect(done.heading).toBe('Your mailbox is fully warmed up');
    expect(done.steps.every((s) => s.state !== 'next')).toBe(true);
    expect(warmupView(pacing(34), NOW)).not.toBeNull();
    expect(warmupView(pacing(35), NOW)).toBeNull();
  });

  it('shows nothing for a mailbox that never warms up, or with no Gmail', () => {
    expect(warmupView(pacing(3, { warmup: { mode: 'warm', active: false, day: 3, ladder: LADDER } }), NOW)).toBeNull();
    expect(warmupView(pacing(3, { mailbox_connected: false }), NOW)).toBeNull();
    expect(warmupView(pacing(3, { warmup: { mode: 'ramp', active: true, day: 3, ladder: [] } }), NOW)).toBeNull();
  });
});

describe('queueEta', () => {
  it('gives the finish date, mentioning the speed-ups while warming up', () => {
    expect(queueEta(pacing(0), NOW)!.text).toBe(
      '200 approved emails are waiting to go out. At this pace, including the weekly speed-ups, they should all be sent by about Dec 3.',
    );
    expect(queueEta(pacing(40), NOW)!.text).toBe(
      '200 approved emails are waiting to go out. At this pace, they should all be sent by about Dec 3.',
    );
  });

  it('reads right for one email', () => {
    expect(queueEta(pacing(40, { queue: { ready: 1, estimated_clear_date: '2026-10-28' } }), NOW)!.text).toBe(
      '1 approved email is waiting to go out. At this pace, it should be sent by about Oct 28.',
    );
  });

  it('is absent with nothing queued, no estimate, or no Gmail', () => {
    expect(queueEta(pacing(0, { queue: { ready: 0, estimated_clear_date: null } }), NOW)).toBeNull();
    expect(queueEta(pacing(0, { queue: { ready: 5, estimated_clear_date: null } }), NOW)).toBeNull();
    expect(queueEta(pacing(0, { mailbox_connected: false }), NOW)).toBeNull();
  });
});
