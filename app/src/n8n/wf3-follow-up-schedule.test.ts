import { describe, it, expect } from 'vitest';
import { loadNodeCode, runNode } from './runNode';

// WF3 > Schedule Next Follow-up: after an email is sent, when is the next follow-up due?
// The database recomputes due_at on insert with holidays (follow_up_schedules trigger, see
// supabase/migrations/20261105070000_follow_up_due_matches_send_gate.sql); these tests pin the
// cadence WF3 proposes so the two cannot silently drift apart.
const code = loadNodeCode('wf3-schedule-next-follow-up.js');

function schedule(messageType: string, sentAtIso: string) {
  const [out] = runNode(code, {
    'Get Message': [{ message_type: messageType, prospect_id: 'p1' }],
    'Get Prospect For Send': [{ client_id: 'c1' }],
  }, { now: sentAtIso });
  return out.json as { should_schedule: boolean; follow_up_day?: number; due_at?: string };
}
const day = (iso?: string) => iso?.slice(0, 10);

describe('follow-up cadence: 3, then 5, then 7 business days after the previous send', () => {
  it('first email -> follow-up 1 due 3 business days later', () => {
    const r = schedule('initial', '2026-11-02T15:00:00Z'); // Monday
    expect(r).toMatchObject({ should_schedule: true, follow_up_day: 3 });
    expect(day(r.due_at)).toBe('2026-11-05'); // Thursday
  });

  it('follow-up 1 -> follow-up 2 due 5 business days later', () => {
    const r = schedule('follow_up_d3', '2026-11-02T15:00:00Z');
    expect(r.follow_up_day).toBe(7);
    expect(day(r.due_at)).toBe('2026-11-09'); // next Monday
  });

  it('follow-up 2 -> follow-up 3 due 7 business days later', () => {
    const r = schedule('follow_up_d7', '2026-11-02T15:00:00Z');
    expect(r.follow_up_day).toBe(14);
    expect(day(r.due_at)).toBe('2026-11-11'); // Wednesday the week after
  });

  it('nothing after the third follow-up', () => {
    expect(schedule('follow_up_d14', '2026-11-02T15:00:00Z')).toEqual({ should_schedule: false });
  });

  it('skips weekends: a Friday send is followed up on Wednesday', () => {
    expect(day(schedule('initial', '2026-11-06T15:00:00Z').due_at)).toBe('2026-11-11');
  });

  it('counts from the actual send time, not from when the email was approved or first planned', () => {
    // An email approved 30 days late and sent today gets its follow-up 3 business days from today.
    expect(day(schedule('initial', '2026-12-07T15:00:00Z').due_at)).toBe('2026-12-10');
  });

  it('does not know about public holidays (the database corrects this on insert)', () => {
    // Mon 23 Nov 2026 + 3 business days lands on Thanksgiving (Thu 26 Nov) here; the database
    // moves it to Fri 27 Nov, the same day the send gate allows.
    expect(day(schedule('initial', '2026-11-23T15:00:00Z').due_at)).toBe('2026-11-26');
  });
});
