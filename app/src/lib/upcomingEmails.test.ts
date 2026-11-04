import { describe, it, expect } from 'vitest';
import { summarizeUpcoming, localDay } from './upcomingEmails';
import type { ScheduleRow } from './approvalsView';

const row = (over: Partial<ScheduleRow>): ScheduleRow => ({
  message_id: Math.random().toString(36), prospect_id: 'p', message_type: 'initial', step_label: 'First Touch',
  approval_status: 'approved', pending_since: null, estimated_send_at: null, is_confirmed: false,
  basis: 'queue_position_and_daily_cap', ...over,
});

// Tue 4 Nov 2026, 10:00 in Denver (17:00 UTC).
const NOW = new Date('2026-11-04T17:00:00Z');
const TZ = 'America/Denver';

describe('summarizeUpcoming', () => {
  it('buckets approved emails by local day in the client time zone', () => {
    const s = summarizeUpcoming([
      row({ estimated_send_at: '2026-11-04T20:00:00Z' }),          // today 13:00 Denver
      row({ estimated_send_at: '2026-11-05T05:30:00Z' }),          // still 4 Nov in Denver (22:30)
      row({ estimated_send_at: '2026-11-05T16:00:00Z' }),          // tomorrow
      row({ estimated_send_at: '2026-11-09T16:00:00Z' }),          // later this week
      row({ estimated_send_at: '2026-11-20T16:00:00Z' }),          // later
    ], NOW, TZ);
    expect([s.today, s.tomorrow, s.laterThisWeek, s.later]).toEqual([2, 1, 1, 1]);
    expect(s.nextSendAt).toBe('2026-11-04T20:00:00Z');
  });

  it('counts pending as awaiting approval, held and undated as held, and skips stopped prospects', () => {
    const s = summarizeUpcoming([
      row({ approval_status: 'pending', estimated_send_at: '2026-11-05T16:00:00Z' }),
      row({ approval_status: 'edited' }),
      row({ basis: 'held_by_send_rules' }),
      row({ basis: 'mailbox_paused' }),
      row({ basis: 'depends_on_unsent_email', estimated_send_at: null }),
      row({ basis: 'prospect_stopped', approval_status: 'pending' }),
    ], NOW, TZ);
    expect(s.awaitingApproval).toBe(2);
    expect(s.held).toBe(3);
    expect(s.today + s.tomorrow + s.laterThisWeek + s.later).toBe(0);
    expect(s.nextSendAt).toBeNull();
  });
});

describe('localDay', () => {
  it('formats in the zone and falls back to UTC on a bad zone', () => {
    expect(localDay(NOW, 'Asia/Tokyo')).toBe('2026-11-05');
    expect(localDay(NOW, 'Not/AZone')).toBe('2026-11-04');
  });
});
