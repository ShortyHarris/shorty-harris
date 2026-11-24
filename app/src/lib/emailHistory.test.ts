import { describe, expect, it } from 'vitest';
import { emailHistory, historyState, type HistoryMessage } from './emailHistory';

const msg = (p: Partial<HistoryMessage> & { id: string }): HistoryMessage => ({
  message_type: 'initial', subject: null, approval_status: 'approved', send_status: 'not_sent', sent_at: null, open_count: 0, ...p,
});

describe('emailHistory', () => {
  // The Computer Superheroes case: one first email sent, three rejected first-touch drafts.
  const rows = [
    msg({ id: 'r1', approval_status: 'rejected' }),
    msg({ id: 'r2', approval_status: 'rejected' }),
    msg({ id: 'r3', approval_status: 'rejected' }),
    msg({ id: 'd14', message_type: 'follow_up_d14' }),
    msg({ id: 'first', send_status: 'sent', sent_at: '2026-11-17T15:00:00Z', open_count: 4 }),
    msg({ id: 'd7', message_type: 'follow_up_d7' }),
    msg({ id: 'd3', message_type: 'follow_up_d3', send_status: 'sent', sent_at: '2026-11-20T15:11:00Z', open_count: 1 }),
  ];

  it('leaves out rejected drafts', () => {
    expect(emailHistory(rows).map((m) => m.id)).toEqual(['first', 'd3', 'd7', 'd14']);
  });

  it('labels each email by what actually happened to it', () => {
    expect(historyState(msg({ id: 'a', send_status: 'sent', sent_at: '2026-11-17T15:00:00Z' }))).toBe('sent');
    expect(historyState(msg({ id: 'b' }))).toBe('scheduled');
    expect(historyState(msg({ id: 'c', send_status: 'queued' }))).toBe('scheduled');
    expect(historyState(msg({ id: 'd', approval_status: 'pending' }))).toBe('awaiting_approval');
    expect(historyState(msg({ id: 'e', send_status: 'failed' }))).toBe('failed');
  });
});
