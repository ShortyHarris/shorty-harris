import { describe, it, expect } from 'vitest';
import {
  heldRows, excludeHeldDrafts, adjustApprovalStats, pendingSinceOf, toScheduleMap, type ScheduleRow,
} from './approvalsView';

function row(message_id: string, approval_status: string, basis: string | null): ScheduleRow {
  return {
    message_id, prospect_id: 'p', message_type: 'initial', step_label: null, approval_status,
    pending_since: null, estimated_send_at: null, is_confirmed: false, basis,
  };
}

const schedule = toScheduleMap([
  row('h-pend', 'pending', 'held_by_send_rules'),
  row('h-app-s', 'approved', 'held_by_send_rules'),
  row('h-app-b', 'approved', 'held_by_send_rules'),
  row('h-app-gone', 'approved', 'held_by_send_rules'),
  row('ok-app', 'approved', 'queue_position_and_daily_cap'),
  row('ok-pend', 'pending', 'previous_email_sent'),
]);

describe('heldRows', () => {
  it('keeps only held_by_send_rules rows, whatever their approval status', () => {
    expect(heldRows(schedule).map((r) => r.message_id).sort()).toEqual(['h-app-b', 'h-app-gone', 'h-app-s', 'h-pend']);
  });
});

describe('excludeHeldDrafts', () => {
  const data = {
    sendable: [{ id: 'h-app-s' }, { id: 'ok-app' }],
    blocked: [{ id: 'h-app-b' }],
    counts: { sendable: 10, blocked: 4 },
  };

  it('removes held drafts from both lists and their counts', () => {
    const out = excludeHeldDrafts(data, heldRows(schedule));
    expect(out.sendable.map((m) => m.id)).toEqual(['ok-app']);
    expect(out.blocked).toEqual([]);
    // 1 held in sendable + 1 held that is in neither capped list (taken off sendable); 1 held in blocked.
    expect(out.counts).toEqual({ sendable: 8, blocked: 3 });
  });

  it('does not touch pending-only held rows or change anything when none are approved', () => {
    const onlyPending = heldRows(toScheduleMap([row('h-pend', 'pending', 'held_by_send_rules')]));
    expect(excludeHeldDrafts(data, onlyPending)).toBe(data);
  });

  it('never goes below zero', () => {
    const out = excludeHeldDrafts({ ...data, counts: { sendable: 1, blocked: 0 } }, heldRows(schedule));
    expect(out.counts).toEqual({ sendable: 0, blocked: 0 });
  });
});

describe('adjustApprovalStats', () => {
  const stats = { pending: 12, approvedToday: 5, sentToday: 7, rejected: 3 };

  it('takes held pending drafts and held approved-today drafts out of the tiles', () => {
    expect(adjustApprovalStats(stats, heldRows(schedule), 2)).toEqual({ pending: 11, approvedToday: 3, sentToday: 7, rejected: 3 });
  });

  it('is a no-op when nothing is held', () => {
    expect(adjustApprovalStats(stats, [], 0)).toEqual(stats);
  });

  it('never goes below zero', () => {
    expect(adjustApprovalStats({ ...stats, pending: 0, approvedToday: 1 }, heldRows(schedule), 4)).toMatchObject({ pending: 0, approvedToday: 0 });
  });
});

describe('pendingSinceOf', () => {
  const base = { id: 'a', prospect_id: 'p', message_type: 'initial', created_at: '2026-10-01T00:00:00Z' };
  const sched = toScheduleMap([{ ...row('a', 'pending', null), pending_since: '2026-10-06T00:00:00Z' }]);

  it('prefers the message pending_since column (messages_with_sender) over created_at', () => {
    expect(pendingSinceOf({ ...base, pending_since: '2026-10-09T00:00:00Z' })).toBe('2026-10-09T00:00:00Z');
    expect(pendingSinceOf({ ...base, pending_since: '2026-10-09T00:00:00Z' }, sched)).toBe('2026-10-09T00:00:00Z');
  });

  it('falls back to the schedule row, then created_at', () => {
    expect(pendingSinceOf(base, sched)).toBe('2026-10-06T00:00:00Z');
    expect(pendingSinceOf(base)).toBe('2026-10-01T00:00:00Z');
  });
});
