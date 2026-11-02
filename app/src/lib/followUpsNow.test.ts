import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { followUpBar, blockedBreakdown, writingEta, setFollowUpsNow } from './followUpsNow';

const base = { pendingFollowups: 0, approvedInitialsWaiting: 0, upfrontCampaigns: 0, activeCampaigns: 3 };

describe('followUpBar', () => {
  it('is hidden only when no campaign is live', () => {
    expect(followUpBar({ ...base, activeCampaigns: 0, approvedInitialsWaiting: 10 })).toBeNull();
  });

  it('is shown even with follow-ups already pending, offering to write the rest now (TUTEL)', () => {
    const b = followUpBar({ ...base, pendingFollowups: 105, approvedInitialsWaiting: 41 });
    expect(b).toMatchObject({ on: false, action: 'on', actionLabel: 'Write follow-ups now' });
    expect(b?.text).toContain('normally written a few business days after');
  });

  it('explains the wait when nothing is pending yet (PostKing: 231 approved, follow-ups off)', () => {
    const b = followUpBar({ ...base, approvedInitialsWaiting: 231 });
    expect(b?.action).toBe('on');
    expect(b?.text).toContain('231 approved first emails are still queued to send');
  });

  it('uses the singular for one email', () => {
    expect(followUpBar({ ...base, approvedInitialsWaiting: 1 })?.text).toContain('1 approved first email is still queued');
  });

  it('says how many campaigns have it on and offers to turn it on for all', () => {
    const b = followUpBar({ ...base, upfrontCampaigns: 1, approvedInitialsWaiting: 5 });
    expect(b?.actionLabel).toBe('Turn on for all');
    expect(b?.text).toContain("It's on for 1 of 3 campaigns.");
  });

  it('once every live campaign has it on, says so and offers to turn it off', () => {
    const b = followUpBar({ ...base, upfrontCampaigns: 3 });
    expect(b).toMatchObject({ on: true, action: 'off', actionLabel: 'Turn off' });
    expect(b?.text).toContain('being drafted');
    expect(followUpBar({ ...base, upfrontCampaigns: 3, pendingFollowups: 8 })?.text).toContain('send only after the email before them');
  });
});

describe('blockedBreakdown', () => {
  it('lists reasons largest first, in the badge wording, and drops zeros', () => {
    const lines = blockedBreakdown({ do_not_contact: 1, generic_mailbox: 99, country_hold: 0 });
    expect(lines.map((l) => [l.reason, l.count])).toEqual([['generic_mailbox', 99], ['do_not_contact', 1]]);
    expect(lines[0].text).toContain('shared address');
  });

  it('is empty when nothing is blocked', () => {
    expect(blockedBreakdown({})).toEqual([]);
  });
});

describe('writingEta', () => {
  it('scales the estimate to the writer rate of about 120 an hour', () => {
    expect(writingEta(60)).toContain('within the hour');
    expect(writingEta(708)).toContain('over the next 6 hours');
    expect(writingEta(3000)).toContain('over about 2 days');
  });

  it('explains when there is nothing to write yet', () => {
    expect(writingEta(0)).toContain('nothing to write yet');
  });
});

describe('setFollowUpsNow', () => {
  const rpcClient = (result: { data: unknown; error: { message: string } | null }) =>
    ({ rpc: vi.fn().mockResolvedValue(result) }) as unknown as SupabaseClient;

  it('calls the RPC and returns how many follow-ups will be written', async () => {
    const c = rpcClient({ data: { ok: true, upfront_sequence: true, follow_ups_to_write: 708 }, error: null });
    const res = await setFollowUpsNow(c, 'camp-1', true);
    expect(c.rpc).toHaveBeenCalledWith('set_campaign_upfront_sequence', { p_campaign_id: 'camp-1', p_on: true });
    expect(res).toEqual({ data: { followUpsToWrite: 708 }, error: null });
  });

  it('turns a refusal into a readable error', async () => {
    const res = await setFollowUpsNow(rpcClient({ data: { ok: false, error: 'not_permitted' }, error: null }), 'c', true);
    expect(res.data).toBeNull();
    expect(res.error).toContain("don't have permission");
  });

  it('passes a transport error through', async () => {
    const res = await setFollowUpsNow(rpcClient({ data: null, error: { message: 'network down' } }), 'c', false);
    expect(res.error).toBe('network down');
  });
});
