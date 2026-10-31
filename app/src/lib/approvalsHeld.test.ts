import { describe, it, expect } from 'vitest';
import { pendingSinceOf, toScheduleMap, type ScheduleRow } from './approvalsView';

// The held-draft filtering that used to be tested here (heldRows, excludeHeldDrafts,
// adjustApprovalStats) moved into the approved_queue RPC. What the client does with the RPC's
// answer, including the TUTEL regression, is covered in hooks/useClientApprovals.test.ts, and the
// cross-client denial case in hooks/approvedQueue.auth.test.ts.

function row(message_id: string, approval_status: string, basis: string | null): ScheduleRow {
  return {
    message_id, prospect_id: 'p', message_type: 'initial', step_label: null, approval_status,
    pending_since: null, estimated_send_at: null, is_confirmed: false, basis,
  };
}

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
