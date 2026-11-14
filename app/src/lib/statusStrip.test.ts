import { describe, it, expect } from 'vitest';
import { parseSendPacing } from './sendPacing';
import { resolveStatusStrip, timeAgo, type StripInput } from './statusStrip';

// Wed Oct 28 2026, 12:00 in Chicago (17:00 UTC): a send day, 3 hours into a 09:00-17:00 window.
const NOW = new Date('2026-10-28T17:00:00Z');

function pacing(over: Record<string, unknown> = {}) {
  return parseSendPacing({
    ok: true,
    is_admin: false,
    time_zone: 'America/Chicago',
    window: { start: '09:00', end: '17:00', days: 'Mon-Fri' },
    mailbox_connected: true,
    paused_until: null,
    last_sent_at: '2026-10-28T16:20:00Z',
    warmup: { mode: 'warm', active: true, day: 3, ladder: [] },
    today: { cap: 5, sent: 3, remaining: 2, in_window_now: true },
    queue: { ready: 200, estimated_clear_date: null },
    follow_ups: {},
    ...over,
  });
}

function input(over: Partial<StripInput> = {}): StripInput {
  return {
    isSandbox: false,
    gmailConnected: true,
    awaitingProspects: 0,
    pacing: pacing(),
    basePath: '/app',
    pathname: '/app',
    settingsHref: '/app/settings',
    now: NOW,
    ...over,
  };
}

const resolve = (over: Partial<StripInput> = {}) => resolveStatusStrip(input(over));

describe('resolveStatusStrip: activity', () => {
  it('shows what went out today when all is well', () => {
    const s = resolve()!;
    expect(s.message.tone).toBe('good');
    expect(s.message.title).toBe('Sending is active.');
    expect(s.message.detail).toBe('3 of 5 sent today (warming up) · last one 40 min ago · more going out today');
    expect(s.message.short).toBe('3 sent today · last 40 min ago');
    expect(s.message.cta).toEqual({ label: 'Details', to: 'details' });
    expect(s.sandbox).toBeNull();
  });

  it('says when sending resumes once the daily limit is used', () => {
    const s = resolve({ pacing: pacing({ today: { cap: 5, sent: 5, remaining: 0, in_window_now: true } }) })!;
    expect(s.message.detail).toContain("today's limit reached, sending resumes tomorrow at 9:00 AM");
  });

  it('says when sending resumes outside sending hours', () => {
    const s = resolve({ pacing: pacing({ today: { cap: 5, sent: 5, remaining: 0, in_window_now: false } }), now: new Date('2026-10-30T23:00:00Z') })!;
    expect(s.message.detail).toContain('sending resumes Mon at 9:00 AM');
  });

  it('says everything approved has gone when the queue is empty', () => {
    const s = resolve({ pacing: pacing({ queue: { ready: 0 } }) })!;
    expect(s.message.title).toBe('All approved emails have been sent.');
    expect(s.message.detail).toContain('approve more prospects to keep sending');
  });

  it('announces the first emails before anything has ever been sent', () => {
    const s = resolve({ pacing: pacing({ last_sent_at: null, today: { cap: 5, sent: 0, remaining: 5, in_window_now: false } }), now: new Date('2026-10-28T12:00:00Z') })!;
    expect(s.message.title).toBe('Your first emails are queued.');
    expect(s.message.detail).toBe('200 approved emails ready, sending starts at 9:00 AM.');
  });

  it('shows no strip for a live client with nothing sent and nothing queued', () => {
    expect(resolve({ pacing: pacing({ last_sent_at: null, queue: { ready: 0 } }) })).toBeNull();
  });

  it('shows no strip while send_pacing is still loading', () => {
    expect(resolve({ pacing: null })).toBeNull();
  });
});

describe('resolveStatusStrip: priority', () => {
  it('puts Gmail first, over approvals and activity', () => {
    const s = resolve({ awaitingProspects: 4, pacing: pacing({ mailbox_connected: false }) })!;
    expect(s.message.tone).toBe('warning');
    expect(s.message.icon).toBe('gmail');
    expect(s.message.cta).toEqual({ label: 'Connect Gmail', to: '/app/settings' });
  });

  it('falls back to the Gmail hook before send_pacing loads', () => {
    expect(resolve({ pacing: null, gmailConnected: false })!.message.icon).toBe('gmail');
  });

  it('drops the Connect button on Settings itself and where Settings is unavailable', () => {
    const p = pacing({ mailbox_connected: false });
    expect(resolve({ pacing: p, pathname: '/app/settings' })!.message.cta).toBeNull();
    expect(resolve({ pacing: p, settingsHref: null })!.message.cta).toBeNull();
  });

  it('shows a pause before approvals', () => {
    const s = resolve({ awaitingProspects: 4, pacing: pacing({ paused_until: '2026-11-02' }) })!;
    expect(s.message.title).toBe('Sending is paused until Nov 2.');
  });

  it('shows approvals over activity, with the sent count alongside', () => {
    const s = resolve({ awaitingProspects: 12 })!;
    expect(s.message.tone).toBe('action');
    expect(s.message.title).toBe('12 prospects waiting for your approval.');
    expect(s.message.detail).toBe('Nothing sends until you approve. 3 sent today.');
    expect(s.message.cta).toEqual({ label: 'Review now', to: '/app/approvals' });
  });

  it('shows activity instead of approvals on the Approvals page', () => {
    expect(resolve({ awaitingProspects: 12, pathname: '/app/approvals' })!.message.tone).toBe('good');
  });
});

describe('resolveStatusStrip: stuck sending', () => {
  const stuck = pacing({ today: { cap: 5, sent: 0, remaining: 5, in_window_now: true }, last_sent_at: '2026-10-27T21:00:00Z' });

  it('warns when nothing has sent two hours into sending hours with emails ready', () => {
    const s = resolve({ pacing: stuck, awaitingProspects: 3 })!;
    expect(s.message.tone).toBe('warning');
    expect(s.message.title).toBe('No emails have gone out yet today.');
    expect(s.message.detail).toContain('200 approved emails are ready to send. The last one went out 20 hours ago.');
  });

  it('does not cry wolf early in the window', () => {
    // 10:00 Chicago: only one hour in.
    expect(resolve({ pacing: stuck, now: new Date('2026-10-28T15:00:00Z') })!.message.tone).toBe('good');
  });

  it('does not warn with nothing queued, or in sandbox fast mode', () => {
    expect(resolve({ pacing: pacing({ ...{ today: { cap: 5, sent: 0, remaining: 5, in_window_now: true } }, queue: { ready: 0 } }) })!.message.tone).toBe('good');
    expect(resolve({ pacing: pacing({ today: { cap: 5, sent: 0, remaining: 5, in_window_now: true }, window_applies: false }) })!.message.tone).toBe('good');
  });
});

describe('resolveStatusStrip: sandbox', () => {
  it('tags every message and always offers the sandbox controls', () => {
    const s = resolve({ isSandbox: true, awaitingProspects: 2, basePath: '/admin/impersonate/c1', pathname: '/admin/impersonate/c1' })!;
    expect(s.sandbox).toEqual({ controlsHref: '/admin/impersonate/c1/sandbox' });
    expect(s.message.tone).toBe('action');
    expect(s.message.cta?.to).toBe('/admin/impersonate/c1/approvals');
  });

  it('explains the sandbox when there is nothing else to say', () => {
    const s = resolve({ isSandbox: true, pacing: null })!;
    expect(s.message.tone).toBe('sandbox');
    expect(s.message.detail).toBe('Emails only go to your own connected mailbox.');
  });
});

describe('timeAgo', () => {
  it('reads naturally', () => {
    const t = (min: number) => timeAgo(new Date(NOW.getTime() - min * 60_000).toISOString(), NOW);
    expect(t(0)).toBe('just now');
    expect(t(25)).toBe('25 min ago');
    expect(t(60)).toBe('1 hour ago');
    expect(t(5 * 60)).toBe('5 hours ago');
    expect(t(30 * 60)).toBe('yesterday');
    expect(t(4 * 24 * 60)).toBe('4 days ago');
  });
});

describe('resolveStatusStrip: warm-up thermometer', () => {
  const ladder = [
    { cap: 5, starts_on: '2026-10-28' }, { cap: 10, starts_on: '2026-11-04' }, { cap: 20, starts_on: '2026-11-11' },
    { cap: 30, starts_on: '2026-11-18' }, { cap: 40, starts_on: '2026-11-25' },
  ];
  const warming = pacing({ warmup: { mode: 'ramp', active: true, day: 0, ladder } });

  it('adds the thermometer to the activity line and keeps it to one line', () => {
    const m = resolve({ pacing: warming })!.message;
    expect(m.warmup).toEqual({ title: 'Warming up your mailbox', detail: 'Full speed (40 a day) by Nov 25', short: 'Full speed Nov 25', stage: 1, stages: 5, finished: false });
    expect(m.detail).toBe('3 of 5 sent today · last one 40 min ago');
    expect(m.short).toBe('3 of 5 sent today');
  });

  it('keeps useful timing next to the thermometer', () => {
    const full = pacing({ warmup: { mode: 'ramp', active: true, day: 0, ladder }, today: { cap: 5, sent: 5, remaining: 0, in_window_now: true } });
    expect(resolve({ pacing: full })!.message.detail).toContain("today's limit reached, sending resumes tomorrow at 9:00 AM");
  });

  it('has no thermometer on warnings or approvals, nor for a mailbox that never warms up', () => {
    expect(resolve({ pacing: warming, awaitingProspects: 2 })!.message.warmup).toBeUndefined();
    expect(resolve()!.message.warmup).toBeNull();
  });
});
