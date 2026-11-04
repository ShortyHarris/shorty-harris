import { describe, expect, it } from 'vitest';
import { panelBadgeSource, unwrittenFollowUpsText } from './sequenceCopy';

describe('panelBadgeSource', () => {
  it('shows Hot lead instead of "Replied, sequence stopped"', () => {
    expect(panelBadgeSource('human_reply', 'hot_lead')).toEqual({ kind: 'pipeline', status: 'hot_lead' });
  });

  it('still shows hard stops and reviews over an outcome', () => {
    expect(panelBadgeSource('unsubscribed', 'hot_lead')).toEqual({ kind: 'sequence', status: 'unsubscribed' });
    expect(panelBadgeSource('hard_bounce', 'won')).toEqual({ kind: 'sequence', status: 'hard_bounce' });
    expect(panelBadgeSource('needs_review', 'hot_lead')).toEqual({ kind: 'sequence', status: 'needs_review' });
  });

  it('uses the sequence status when there is no outcome, and the pipeline status otherwise', () => {
    expect(panelBadgeSource('automated_reply', 'contacted')).toEqual({ kind: 'sequence', status: 'automated_reply' });
    expect(panelBadgeSource(null, 'contacted')).toEqual({ kind: 'pipeline', status: 'contacted' });
    expect(panelBadgeSource(null, 'hot_lead')).toEqual({ kind: 'pipeline', status: 'hot_lead' });
  });
});

describe('unwrittenFollowUpsText', () => {
  it('says why nothing more is coming once follow-ups stop', () => {
    expect(unwrittenFollowUpsText(2, { stopped: true, stoppedBecause: 'they_replied_with_interest', firstEmailSent: true }))
      .toBe('No more follow-ups will be written, because they replied with interest.');
    expect(unwrittenFollowUpsText(2, { stopped: true, stoppedBecause: 'unsubscribed_or_bounced', firstEmailSent: true }))
      .toBe('No more follow-ups will be written, because they unsubscribed or the email bounced.');
    expect(unwrittenFollowUpsText(1, { stopped: true, stoppedBecause: null, firstEmailSent: true }))
      .toBe('No more follow-ups will be written, because follow-ups were stopped.');
  });

  it('no longer says "after the first email sends" once it has been sent', () => {
    expect(unwrittenFollowUpsText(2, { stopped: false, firstEmailSent: true }))
      .toBe('2 more follow-ups to come. Each is written a few business days after the email before it.');
    expect(unwrittenFollowUpsText(1, { stopped: false, firstEmailSent: true }))
      .toBe('1 more follow-up to come. Each is written a few business days after the email before it.');
  });

  it('keeps the original line before the first email goes out', () => {
    expect(unwrittenFollowUpsText(3, { stopped: false, firstEmailSent: false }))
      .toBe('3 follow-ups will be written after the first email sends.');
  });
});
