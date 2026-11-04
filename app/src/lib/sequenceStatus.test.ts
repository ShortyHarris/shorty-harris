import { describe, it, expect } from 'vitest';
import { deriveSequenceStatus, dncReasonsByEmail, messageStepLabel, type ReplyIntentRow } from './sequenceStatus';

const reply = (intent: string | null, received_at: string | null, created_at = '2026-01-01T00:00:00Z'): ReplyIntentRow =>
  ({ prospect_id: 'p', intent, received_at, created_at });

describe('deriveSequenceStatus', () => {
  it('returns null with no signal', () => {
    expect(deriveSequenceStatus('contacted', [], [])).toBeNull();
  });

  it('opt-out and stop request both mean unsubscribed, and win over everything', () => {
    expect(deriveSequenceStatus('bounced', ['opt_out'], [reply('interested', '2026-10-01')])).toBe('unsubscribed');
    expect(deriveSequenceStatus('called', ['stop_request'], [])).toBe('unsubscribed');
  });

  it('bounce from pipeline status or from the do-not-contact reason', () => {
    expect(deriveSequenceStatus('bounced', [], [])).toBe('hard_bounce');
    expect(deriveSequenceStatus('contacted', ['bounce'], [])).toBe('hard_bounce');
  });

  it('latest reply decides needs_review and automated_reply', () => {
    expect(deriveSequenceStatus('contacted', [], [reply('out_of_office', '2026-10-02'), reply('interested', '2026-10-01')]))
      .toBe('automated_reply');
    expect(deriveSequenceStatus('contacted', [], [reply('uncertain', '2026-10-03'), reply('automated', '2026-10-01')]))
      .toBe('needs_review');
  });

  it('a human reply anywhere counts when the latest one is not automated', () => {
    expect(deriveSequenceStatus('replied', [], [reply('automated', '2026-10-01'), reply('not_interested', '2026-10-02')]))
      .toBe('human_reply');
  });

  it('bounced and unclassified replies are not human replies', () => {
    expect(deriveSequenceStatus('contacted', [], [reply('bounced', '2026-10-01'), reply(null, '2026-10-02')])).toBeNull();
  });

  it('a reply with no received_at sorts last, like nulls last in SQL', () => {
    expect(deriveSequenceStatus('contacted', [], [reply('uncertain', null), reply('out_of_office', '2026-10-01')]))
      .toBe('automated_reply');
  });
});

describe('dncReasonsByEmail', () => {
  it('groups by lower-cased email and skips blanks', () => {
    const m = dncReasonsByEmail([
      { email: 'A@x.com', reason: 'opt_out' },
      { email: 'a@x.com', reason: 'bounce' },
      { email: null, reason: 'opt_out' },
    ]);
    expect(m.get('a@x.com')).toEqual(['opt_out', 'bounce']);
    expect(m.size).toBe(1);
  });
});

describe('messageStepLabel', () => {
  it('names the four steps and falls back to the raw type', () => {
    expect(messageStepLabel('initial')).toBe('First email');
    expect(messageStepLabel('follow_up_d14')).toBe('Follow-up 3');
    expect(messageStepLabel('other')).toBe('other');
    expect(messageStepLabel(null)).toBe('Email');
  });
});
