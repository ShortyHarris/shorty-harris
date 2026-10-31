import { describe, it, expect } from 'vitest';
import { BLOCK_INFO, POLICY_HELD_REASONS, blockInfo, isBlocking, isPolicyHeld } from './blockReasons';

// The database currently holds no campaign_inactive, followups_stopped, country_hold or
// freemail_address rows, so none of this copy can be checked by looking at a screen.
describe('blockInfo: campaign_inactive is split by the campaign status', () => {
  it('says "Campaign not launched" for a draft campaign', () => {
    expect(blockInfo('campaign_inactive', 'draft')).toEqual({
      badge: 'Campaign not launched', tone: 'paused', text: 'Campaign not launched',
    });
  });

  it('says "Campaign paused" for a paused campaign', () => {
    expect(blockInfo('campaign_inactive', 'paused')).toEqual({
      badge: 'Campaign paused', tone: 'paused', text: 'Campaign paused',
    });
  });

  it('says "Campaign cancelled" for a cancelled campaign, as a hard block', () => {
    expect(blockInfo('campaign_inactive', 'cancelled')).toEqual({
      badge: 'Campaign cancelled', tone: 'blocked', text: 'Campaign cancelled',
    });
  });

  it('falls back to the generic "Paused" copy for an unknown, empty or missing status', () => {
    for (const status of ['archived', '', null, undefined]) {
      expect(blockInfo('campaign_inactive', status)).toEqual(BLOCK_INFO.campaign_inactive);
    }
    expect(blockInfo('campaign_inactive')).toEqual(BLOCK_INFO.campaign_inactive);
    expect(blockInfo('campaign_inactive').badge).toBe('Paused');
  });

  it('does not let a campaign status change the copy for any other reason', () => {
    for (const reason of Object.keys(BLOCK_INFO).filter((r) => r !== 'campaign_inactive')) {
      expect(blockInfo(reason, 'draft')).toEqual(blockInfo(reason));
    }
  });

  it('treats every campaign_inactive wording as blocking, not as a normal wait', () => {
    for (const status of ['draft', 'paused', 'cancelled', 'archived']) {
      expect(blockInfo('campaign_inactive', status).tone).not.toBe('scheduled');
    }
    expect(isBlocking('campaign_inactive')).toBe(true);
  });
});

describe('blockInfo: followups_stopped', () => {
  it('has its own copy and reads as a block', () => {
    expect(blockInfo('followups_stopped')).toEqual({
      badge: 'Blocked', tone: 'blocked', text: "Won't send: follow-ups for this prospect were stopped",
    });
    expect(blockInfo('followups_stopped')).not.toEqual(blockInfo('some_future_reason'));
    expect(isBlocking('followups_stopped')).toBe(true);
  });
});

describe('blockInfo: reasons with no live data yet', () => {
  it('keeps the existing copy for country_hold and freemail_address', () => {
    expect(blockInfo('country_hold').text).toBe("Won't send: sending to this country is on hold");
    expect(blockInfo('freemail_address').text).toBe("Won't send: personal email address (Gmail/Seznam etc.) in an EU/Czech campaign");
  });

  it('shows an unknown code as blocked rather than hiding it', () => {
    expect(blockInfo('some_future_reason')).toEqual({ badge: 'Blocked', tone: 'blocked', text: "Won't send right now" });
  });
});

describe('isPolicyHeld', () => {
  it('holds generic mailboxes and freemail addresses', () => {
    expect(isPolicyHeld('generic_mailbox')).toBe(true);
    expect(isPolicyHeld('freemail_address')).toBe(true);
  });

  it('keeps every other block reason visible', () => {
    const others = Object.keys(BLOCK_INFO).filter((r) => r !== 'generic_mailbox' && r !== 'freemail_address');
    for (const reason of others) expect(isPolicyHeld(reason)).toBe(false);
    expect(isPolicyHeld('followups_stopped')).toBe(false);
    expect(isPolicyHeld('some_future_reason')).toBe(false);
  });

  it('is false for empty values', () => {
    expect(isPolicyHeld(null)).toBe(false);
    expect(isPolicyHeld(undefined)).toBe(false);
    expect(isPolicyHeld('')).toBe(false);
  });

  it('lists exactly the two held reasons', () => {
    expect([...POLICY_HELD_REASONS].sort()).toEqual(['freemail_address', 'generic_mailbox']);
  });
});
