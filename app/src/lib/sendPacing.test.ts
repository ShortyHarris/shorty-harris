import { describe, it, expect } from 'vitest';
import {
  parseSendPacing, sendingCopy, compactSendingLine, formatClock, formatDays, formatDay,
  FOLLOW_UP_EXPLAINER, QUEUE_TOOLTIP,
} from './sendPacing';

const NOW = new Date('2026-10-28T12:00:00Z');

// A body shaped exactly like the live send_pacing() response: a client with a connected mailbox, full
// volume, inside the sending window, some queue and follow-ups. Tests override the parts they care about.
function body(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    is_admin: false,
    time_zone: 'America/Chicago',
    window: { start: '09:00', end: '17:00', days: 'Mon-Fri' },
    mailbox_connected: true,
    paused_until: null,
    warmup: {
      mode: 'warm', active: false, day: 40, next_step_cap: null, next_step_date: null,
      ladder: [
        { cap: 5, starts_on: '2026-09-18' }, { cap: 10, starts_on: '2026-09-25' }, { cap: 20, starts_on: '2026-10-02' },
        { cap: 30, starts_on: '2026-10-09' }, { cap: 40, starts_on: '2026-10-16' },
      ],
    },
    today: { cap: 40, sent: 12, remaining: 28, in_window_now: true },
    queue: { ready: 30, ready_first_emails: 22, ready_follow_ups: 8, waiting_for_date: 3, estimated_clear_date: '2026-10-30' },
    follow_ups: { awaiting_approval: 4, scheduled: 9, next_due: '2026-10-31T15:00:00Z' },
    admin: null,
    ...over,
  };
}

const copy = (over?: Record<string, unknown>) => sendingCopy(parseSendPacing(body(over)), NOW);

describe('parseSendPacing', () => {
  it('turns a refusal into an error, never into data', () => {
    expect(() => parseSendPacing({ ok: false, error: 'not_permitted' })).toThrow('not_permitted');
    expect(() => parseSendPacing({ ok: false, error: 'client_not_found' })).toThrow('client_not_found');
    expect(() => parseSendPacing(null)).toThrow('not_permitted');
    expect(() => parseSendPacing('nope')).toThrow('not_permitted');
  });

  it('keeps the server shape and reads counts as numbers', () => {
    const p = parseSendPacing(body());
    expect(p.today).toEqual({ cap: 40, sent: 12, remaining: 28, in_window_now: true });
    expect(p.queue.ready).toBe(30);
    expect(p.warmup.ladder).toHaveLength(5);
    expect(p.admin).toBeNull();
  });

  it('survives missing or malformed sections without throwing', () => {
    const p = parseSendPacing({ ok: true });
    expect(p.today.cap).toBe(0);
    expect(p.queue.estimated_clear_date).toBeNull();
    expect(p.warmup.ladder).toEqual([]);
    expect(p.mailbox_connected).toBe(false);
  });

  it('never carries admin data to a client, even if the body somehow includes it', () => {
    const p = parseSendPacing(body({ is_admin: false, admin: { held_by_send_rules: 5, blocked_total: 9 } }));
    expect(p.admin).toBeNull();
    expect(sendingCopy(p, NOW).admin).toEqual([]);
  });

  it('keeps admin data only when the same response says is_admin', () => {
    const p = parseSendPacing(body({ is_admin: true, admin: { held_by_send_rules: 5, blocked_total: 9 } }));
    expect(p.admin).toEqual({ held_by_send_rules: 5, blocked_total: 9 });
  });
});

describe('formatting', () => {
  it('formats clock times and day ranges', () => {
    expect(formatClock('09:00')).toBe('9:00 AM');
    expect(formatClock('17:00')).toBe('5:00 PM');
    expect(formatClock('00:30')).toBe('12:30 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
    expect(formatDays('Mon-Fri')).toBe('Mon to Fri');
  });

  it('shows a bare date as that calendar day, with no timezone shift', () => {
    expect(formatDay('2026-10-30', 'Pacific/Auckland', NOW)).toBe('Oct 30');
    expect(formatDay('2026-10-30', 'America/Los_Angeles', NOW)).toBe('Oct 30');
  });

  it('shows a timestamp as the day it falls on in the client zone', () => {
    // 01:00 UTC on Oct 31 is still Oct 30 in Chicago.
    expect(formatDay('2026-10-31T01:00:00Z', 'America/Chicago', NOW)).toBe('Oct 30');
  });

  it('adds the year only when it is not the current year', () => {
    expect(formatDay('2027-01-04', 'America/Chicago', NOW)).toBe('Jan 4, 2027');
  });
});

describe('Today and the sending window', () => {
  it('in the window: says how many were sent, with no window note', () => {
    expect(copy().today).toBe('12 of 40 emails sent today.');
  });

  it('outside the window: adds when sending happens, in the client zone', () => {
    const c = copy({ today: { cap: 40, sent: 12, remaining: 28, in_window_now: false } });
    expect(c.today).toBe('12 of 40 emails sent today. Sends Mon to Fri, 9:00 AM to 5:00 PM (America/Chicago).');
  });
});

describe('warm-up', () => {
  it('full volume when the mailbox is not warming up, with no ladder', () => {
    expect(copy().warmup).toEqual({ text: 'Full sending volume.', ladder: [] });
  });

  it('warming up: explains it, states today\'s limit and lists the ladder', () => {
    const c = copy({
      warmup: {
        mode: 'ramp', active: true, day: 9, next_step_cap: 20, next_step_date: '2026-11-04',
        ladder: [
          { cap: 5, starts_on: '2026-10-19' }, { cap: 10, starts_on: '2026-10-26' }, { cap: 20, starts_on: '2026-11-02' },
          { cap: 30, starts_on: '2026-11-09' }, { cap: 40, starts_on: '2026-11-16' },
        ],
      },
      today: { cap: 10, sent: 3, remaining: 7, in_window_now: true },
    });
    expect(c.warmup?.text).toBe(
      "Your mailbox is warming up. New mailboxes send gradually to protect deliverability. Today's limit is 10 a day.",
    );
    expect(c.warmup?.ladder).toEqual([
      '5 a day from Oct 19', '10 a day from Oct 26', '20 a day from Nov 2', '30 a day from Nov 9', '40 a day from Nov 16',
    ]);
  });
});

describe('warnings', () => {
  it('no warnings when connected and not paused', () => {
    expect(copy().warnings).toEqual([]);
  });

  it('no mailbox: says to connect Gmail, and drops the today and warm-up lines that would mislead', () => {
    const c = copy({ mailbox_connected: false, queue: { ready: 6, ready_first_emails: 6, ready_follow_ups: 0, waiting_for_date: 0, estimated_clear_date: null } });
    expect(c.warnings).toEqual(['Connect Gmail, nothing can send until you do.']);
    expect(c.today).toBeNull();
    expect(c.warmup).toBeNull();
    // Still tells them what is waiting, but promises no date.
    expect(c.queue).toEqual({ text: '6 approved emails are queued.', tooltip: null });
  });

  it('paused: says until when', () => {
    const c = copy({ paused_until: '2026-11-03T14:00:00Z' });
    expect(c.warnings).toEqual(['Sending is paused until Nov 3.']);
  });

  it('shows both warnings together when there is no mailbox and a pause', () => {
    const c = copy({ mailbox_connected: false, paused_until: '2026-11-03T14:00:00Z' });
    expect(c.warnings).toHaveLength(2);
  });
});

describe('queue', () => {
  it('states the count and the estimate, with the estimate tooltip', () => {
    expect(copy().queue).toEqual({
      text: '30 approved emails are queued. At this pace they should all be sent by about Oct 30.',
      tooltip: QUEUE_TOOLTIP,
    });
    expect(QUEUE_TOOLTIP).toBe('An estimate. Follow-ups share the same daily limit.');
  });

  it('uses the singular for one email', () => {
    const c = copy({ queue: { ready: 1, ready_first_emails: 1, ready_follow_ups: 0, waiting_for_date: 0, estimated_clear_date: '2026-10-28' } });
    expect(c.queue?.text).toBe('1 approved email is queued. At this pace they should all be sent by about Oct 28.');
  });

  it('hides the line when nothing is queued instead of printing 0', () => {
    const c = copy({ queue: { ready: 0, ready_first_emails: 0, ready_follow_ups: 0, waiting_for_date: 0, estimated_clear_date: null } });
    expect(c.queue).toBeNull();
  });
});

describe('follow-ups', () => {
  it('waiting and scheduled, with the next due date', () => {
    expect(copy().followUps).toBe('4 waiting for your approval. 9 more are scheduled, the next due Oct 31.');
  });

  it('only waiting: no "more", no scheduled sentence', () => {
    const c = copy({ follow_ups: { awaiting_approval: 2, scheduled: 0, next_due: null } });
    expect(c.followUps).toBe('2 waiting for your approval.');
  });

  it('only scheduled: drops the zero-count waiting line and the word "more"', () => {
    const c = copy({ follow_ups: { awaiting_approval: 0, scheduled: 5, next_due: '2026-11-02T15:00:00Z' } });
    expect(c.followUps).toBe('5 are scheduled, the next due Nov 2.');
  });

  it('no follow-ups at all: nothing to show, never "0 waiting"', () => {
    const c = copy({ follow_ups: { awaiting_approval: 0, scheduled: 0, next_due: null } });
    expect(c.followUps).toBeNull();
  });

  it('has a fixed explainer of the 3, 5 and 7 business-day cadence', () => {
    expect(FOLLOW_UP_EXPLAINER).toContain('3, then 5, then 7 business days');
    expect(FOLLOW_UP_EXPLAINER).toContain('appears in Approvals');
  });
});

describe('admin additions', () => {
  const adminBody = (held: number, blocked: number) =>
    ({ is_admin: true, warmup: { mode: 'ramp', active: true, day: 9, next_step_cap: 20, next_step_date: '2026-11-04', ladder: [] }, admin: { held_by_send_rules: held, blocked_total: blocked } });

  it('lists warm-up mode, day, held and blocked', () => {
    expect(copy(adminBody(5, 9)).admin).toEqual([
      'Warm-up mode: ramp.', 'Warm-up day: 9.', '5 held by send rules.', '9 blocked from sending.',
    ]);
  });

  it('hides zero held and zero blocked, keeps mode and day', () => {
    expect(copy(adminBody(0, 0)).admin).toEqual(['Warm-up mode: ramp.', 'Warm-up day: 9.']);
  });

  it('shows nothing for a client', () => {
    expect(copy().admin).toEqual([]);
  });
});

describe('compact one-line version', () => {
  const line = (over?: Record<string, unknown>) => compactSendingLine(parseSendPacing(body(over)), NOW);

  it('full volume: today and the queue estimate', () => {
    expect(line()).toEqual({
      warning: false,
      text: '12 of 40 emails sent today. 30 approved emails are queued. At this pace they should all be sent by about Oct 30.',
    });
  });

  it('warming up: adds the limit', () => {
    const l = line({ warmup: { mode: 'ramp', active: true, day: 3, next_step_cap: 10, next_step_date: '2026-11-02', ladder: [] }, today: { cap: 5, sent: 1, remaining: 4, in_window_now: true } });
    expect(l.text).toContain("Warming up, today's limit is 5 a day.");
  });

  it('outside the window: says when sending happens', () => {
    expect(line({ today: { cap: 40, sent: 0, remaining: 40, in_window_now: false } }).text)
      .toContain('Sends Mon to Fri, 9:00 AM to 5:00 PM (America/Chicago).');
  });

  it('a warning replaces the rest and is flagged', () => {
    expect(line({ mailbox_connected: false })).toEqual({ warning: true, text: 'Connect Gmail, nothing can send until you do.' });
    expect(line({ paused_until: '2026-11-03T14:00:00Z' })).toEqual({ warning: true, text: 'Sending is paused until Nov 3.' });
  });

  it('nothing queued: just today', () => {
    const l = line({ queue: { ready: 0, ready_first_emails: 0, ready_follow_ups: 0, waiting_for_date: 0, estimated_clear_date: null } });
    expect(l.text).toBe('12 of 40 emails sent today.');
  });
});
