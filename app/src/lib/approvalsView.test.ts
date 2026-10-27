import { describe, it, expect } from 'vitest';
import {
  formatPendingSince, startOfDayInTz, isOverdue, scheduledDisplay, sortApprovals, filterApprovals, applyApprovalView,
  toScheduleMap, pendingSinceOf, type ScheduleRow, type SortableApproval,
} from './approvalsView';

const d = (iso: string) => new Date(iso);

describe('formatPendingSince', () => {
  it('formats "Oct 9, 2026 (4 days)"', () => {
    expect(formatPendingSince('2026-10-09T10:00:00Z', 'UTC', d('2026-10-13T10:00:00Z'))).toBe('Oct 9, 2026 (4 days)');
  });

  it('uses 0 days and singular 1 day', () => {
    expect(formatPendingSince('2026-10-09T08:00:00Z', 'UTC', d('2026-10-09T20:00:00Z'))).toBe('Oct 9, 2026 (0 days)');
    expect(formatPendingSince('2026-10-09T23:00:00Z', 'UTC', d('2026-10-10T01:00:00Z'))).toBe('Oct 9, 2026 (1 day)');
  });

  it('counts calendar days in the business timezone, not UTC', () => {
    const pending = '2026-10-13T21:30:00Z'; // 23:30 on Oct 13 in Prague (CEST)
    const now = d('2026-10-13T22:30:00Z'); // 00:30 on Oct 14 in Prague
    expect(formatPendingSince(pending, 'Europe/Prague', now)).toBe('Oct 13, 2026 (1 day)');
    expect(formatPendingSince(pending, 'UTC', now)).toBe('Oct 13, 2026 (0 days)');
  });

  it('shows the date in the business timezone', () => {
    expect(formatPendingSince('2026-10-13T23:30:00Z', 'Europe/Prague', d('2026-10-14T10:00:00Z'))).toBe('Oct 14, 2026 (0 days)');
  });

  it('never goes negative and handles missing values', () => {
    expect(formatPendingSince('2026-10-20T10:00:00Z', 'UTC', d('2026-10-13T10:00:00Z'))).toBe('Oct 20, 2026 (0 days)');
    expect(formatPendingSince(null, 'UTC')).toBe('-');
    expect(formatPendingSince('not a date', 'UTC')).toBe('-');
  });
});

describe('startOfDayInTz', () => {
  it('is local midnight in the given timezone', () => {
    expect(startOfDayInTz('Europe/Prague', d('2026-10-13T22:30:00Z')).toISOString()).toBe('2026-10-13T22:00:00.000Z');
    expect(startOfDayInTz('America/New_York', d('2026-10-13T02:00:00Z')).toISOString()).toBe('2026-10-12T04:00:00.000Z');
    expect(startOfDayInTz('UTC', d('2026-10-13T15:00:00Z')).toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });

  it('survives a DST change day', () => {
    // Prague leaves summer time on 2026-10-25 at 01:00 UTC; midnight that day was still CEST (UTC+2).
    expect(startOfDayInTz('Europe/Prague', d('2026-10-25T12:00:00Z')).toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });
});

describe('isOverdue', () => {
  const now = d('2026-10-13T12:00:00Z');
  it('is true only when the estimate is in the past', () => {
    expect(isOverdue('2026-10-13T11:59:00Z', now)).toBe(true);
    expect(isOverdue('2026-10-13T12:01:00Z', now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
});

function row(over: Partial<ScheduleRow>): ScheduleRow {
  return {
    message_id: 'm1', prospect_id: 'p1', message_type: 'initial', step_label: null, approval_status: 'pending',
    pending_since: null, estimated_send_at: null, is_confirmed: false, basis: null, ...over,
  };
}

describe('scheduledDisplay', () => {
  const now = d('2026-10-13T12:00:00Z');

  it('prefixes estimates with "Est." and flags overdue', () => {
    const out = scheduledDisplay(row({ estimated_send_at: '2026-10-12T08:00:00Z' }), 'UTC', now);
    expect(out.text).toBe('Est. Oct 12, 2026');
    expect(out.estimated).toBe(true);
    expect(out.overdue).toBe(true);
    expect(out.title).toContain('Estimated');
  });

  it('shows a confirmed date without the prefix, not overdue when in the future', () => {
    const out = scheduledDisplay(row({ estimated_send_at: '2026-10-14T08:00:00Z', is_confirmed: true }), 'UTC', now);
    expect(out.text).toBe('Oct 14, 2026');
    expect(out.estimated).toBe(false);
    expect(out.overdue).toBe(false);
  });

  it('uses the business timezone for the date', () => {
    const out = scheduledDisplay(row({ estimated_send_at: '2026-10-14T23:30:00Z', is_confirmed: true }), 'Europe/Prague', now);
    expect(out.text).toBe('Oct 15, 2026');
  });

  it.each([
    ['held_by_send_rules', 'Held by send rules'],
    ['prospect_stopped', 'Prospect stopped'],
    ['mailbox_paused', 'Mailbox paused'],
    ['previous_step_missing', 'Previous step missing'],
  ])('explains a null estimate by basis %s', (basis, text) => {
    const out = scheduledDisplay(row({ basis }), 'UTC', now);
    expect(out.text).toBe(text);
    expect(out.hasDate).toBe(false);
    expect(out.overdue).toBe(false);
  });

  it('shows a dash when there is no schedule row', () => {
    expect(scheduledDisplay(undefined, 'UTC', now).text).toBe('-');
  });
});

function item(id: string, prospect_id: string, name: string, message_type: string, created_at: string): SortableApproval {
  return { id, prospect_id, message_type, created_at, prospect: { business_name: name } };
}

const items = [
  item('a2', 'pA', 'Alpha Cafe', 'follow_up_d7', '2026-10-03T00:00:00Z'),
  item('b1', 'pB', 'Bravo Bakery', 'initial', '2026-10-01T00:00:00Z'),
  item('a1', 'pA', 'Alpha Cafe', 'initial', '2026-10-05T00:00:00Z'),
  item('c1', 'pC', 'Čapek Shop', 'initial', '2026-10-02T00:00:00Z'),
  item('a3', 'pA', 'Alpha Cafe', 'follow_up_d3', '2026-10-04T00:00:00Z'),
];

const schedule = toScheduleMap([
  row({ message_id: 'a1', estimated_send_at: '2026-10-10T00:00:00Z', pending_since: '2026-10-06T00:00:00Z' }),
  row({ message_id: 'b1', estimated_send_at: '2026-10-08T00:00:00Z' }),
  row({ message_id: 'c1', estimated_send_at: null, basis: 'held_by_send_rules' }),
  row({ message_id: 'a3', estimated_send_at: '2026-10-12T00:00:00Z' }),
  // a2 has no schedule row at all
]);

const ids = (xs: SortableApproval[]) => xs.map((x) => x.id);

describe('sortApprovals', () => {
  it('sorts by scheduled date ascending with undated drafts last', () => {
    // dated in date order, then undated by created_at (c1 Oct 2, a2 Oct 3)
    expect(ids(sortApprovals(items, 'scheduled_asc', schedule))).toEqual(['b1', 'a1', 'a3', 'c1', 'a2']);
  });

  it('keeps undated drafts last when sorting descending', () => {
    expect(ids(sortApprovals(items, 'scheduled_desc', schedule))).toEqual(['a3', 'a1', 'b1', 'c1', 'a2']);
  });

  it('sorts by the real pending-since timestamp (schedule, then column, then created_at)', () => {
    expect(pendingSinceOf(items[2], schedule)).toBe('2026-10-06T00:00:00Z');
    expect(ids(sortApprovals(items, 'pending_asc', schedule))).toEqual(['b1', 'c1', 'a2', 'a3', 'a1']);
    expect(ids(sortApprovals(items, 'pending_desc', schedule))).toEqual(['a1', 'a3', 'a2', 'c1', 'b1']);
  });

  it('sorts prospects A-Z and groups a prospect in sequence order', () => {
    expect(ids(sortApprovals(items, 'prospect_asc', schedule))).toEqual(['a1', 'a3', 'a2', 'b1', 'c1']);
  });

  it('sorts prospects Z-A but keeps each prospect in sequence order', () => {
    expect(ids(sortApprovals(items, 'prospect_desc', schedule))).toEqual(['c1', 'b1', 'a1', 'a3', 'a2']);
  });

  it('does not mutate its input', () => {
    const copy = ids(items);
    sortApprovals(items, 'prospect_asc', schedule);
    expect(ids(items)).toEqual(copy);
  });
});

describe('filter and sort together', () => {
  it('filters by type then sorts the remaining drafts', () => {
    const out = applyApprovalView(items, { sort: 'scheduled_asc', type: 'initial', schedule });
    expect(ids(out)).toEqual(['b1', 'a1', 'c1']);
  });

  it('returns every draft for "all" and an empty list for a type with none', () => {
    expect(applyApprovalView(items, { sort: 'prospect_asc', type: 'all', schedule })).toHaveLength(5);
    expect(filterApprovals(items, 'follow_up_d14')).toEqual([]);
  });

  it('filters then sorts follow-ups by prospect', () => {
    const out = applyApprovalView(items, { sort: 'prospect_desc', type: 'follow_up_d3', schedule });
    expect(ids(out)).toEqual(['a3']);
  });
});
