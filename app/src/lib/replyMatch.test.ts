import { describe, expect, it } from 'vitest';
import { describeReplyMatch, toReplyMatch } from './replyMatch';

const msg = { subject: 'Quick question', sent_at: '2026-10-09T23:30:00Z' };

describe('describeReplyMatch', () => {
  it('describes each match method; only domain is weak', () => {
    expect(describeReplyMatch({ match_method: 'thread', message: msg }, 'UTC')).toMatchObject({ method: 'our email thread', weak: false });
    expect(describeReplyMatch({ match_method: 'email', message: msg }, 'UTC')).toMatchObject({ method: 'the exact address we wrote to', weak: false });
    expect(describeReplyMatch({ match_method: 'domain', message: msg }, 'UTC')).toMatchObject({ method: 'company domain only', weak: true });
  });

  it('formats the send date in the client timezone', () => {
    expect(describeReplyMatch({ match_method: 'thread', message: msg }, 'UTC')?.sentOn).toBe('Oct 9, 2026');
    expect(describeReplyMatch({ match_method: 'thread', message: msg }, 'Africa/Lusaka')?.sentOn).toBe('Oct 10, 2026');
  });

  it('shows nothing for older replies or when the message is not found', () => {
    expect(describeReplyMatch({ match_method: null, message: msg }, 'UTC')).toBeNull();
    expect(describeReplyMatch({ match_method: 'thread', message: null }, 'UTC')).toBeNull();
    expect(describeReplyMatch(null, 'UTC')).toBeNull();
  });

  it('renders no subject or date when those values are null', () => {
    expect(describeReplyMatch({ match_method: 'email', message: { subject: null, sent_at: null } }, 'UTC'))
      .toMatchObject({ subject: null, sentOn: null });
  });

  it('normalises array embeds', () => {
    expect(toReplyMatch([{ match_method: 'thread', message: [msg] }])).toEqual({ match_method: 'thread', message: msg });
  });
});
