// "Write follow-ups now" (campaigns.upfront_sequence) and the copy that explains when follow-ups
// reach the Approvals queue. Same words on Campaigns, Approvals and the admin campaign editor.
//
// How follow-ups arrive:
//   off (default) - follow-up N is written only after the previous email has SENT plus 3 / 5 / 7
//                   business days, so a slow warm-up can leave Pending empty for days.
//   on            - all three follow-ups are written as soon as a prospect has a first-email draft,
//                   about 120 per hour, so the whole sequence can be approved up front.
// Either way nothing sends early: a follow-up only goes out once the previous email has been sent
// and the business-day gap has passed. Until then an approved follow-up shows as Scheduled.

import type { SupabaseClient } from '@supabase/supabase-js';
import { blockInfo } from './blockReasons';

export const FOLLOW_UPS_NOW_TITLE = 'Write follow-ups now';

export const FOLLOW_UPS_NOW_HELP =
  'Draft all three follow-ups for each prospect right away so you can review and approve the whole sequence now. ' +
  "Nothing sends early: each follow-up still waits until the email before it has gone out, plus 3, 5 or 7 business days.";

export const FOLLOW_UPS_OFF_HELP =
  'Off: each follow-up is written a few business days after the email before it is sent, and appears in Approvals then.';

/** Drafting rate of the writer (30 every 15 minutes). */
export const FOLLOW_UPS_PER_HOUR = 120;

export function writingEta(count: number): string {
  if (count <= 0) return 'There is nothing to write yet: follow-ups are drafted once a prospect has a first email.';
  const hours = count / FOLLOW_UPS_PER_HOUR;
  const when = hours <= 1 ? 'within the hour' : hours < 24 ? `over the next ${Math.ceil(hours)} hours` : `over about ${Math.ceil(hours / 24)} days`;
  return `${count} follow-up${count === 1 ? '' : 's'} will be drafted ${when}. They appear in Approvals as they are written.`;
}

export interface SetFollowUpsNowResult { followUpsToWrite: number }

/** Turns "write follow-ups now" on or off for one campaign. Works for the client and for an admin. */
export async function setFollowUpsNow(
  client: SupabaseClient, campaignId: string, on: boolean,
): Promise<{ data: SetFollowUpsNowResult | null; error: string | null }> {
  const { data, error } = await client.rpc('set_campaign_upfront_sequence', { p_campaign_id: campaignId, p_on: on });
  if (error) return { data: null, error: error.message };
  const body = (data ?? {}) as { ok?: boolean; error?: string; follow_ups_to_write?: number };
  if (body.ok !== true) return { data: null, error: body.error === 'not_permitted' ? "you don't have permission to change this campaign" : (body.error ?? 'could not update the campaign') };
  return { data: { followUpsToWrite: body.follow_ups_to_write ?? 0 }, error: null };
}

// ── Approvals: why Pending has no follow-ups ────────────────────────────────

export interface FollowUpQueueState {
  pendingFollowups: number;
  approvedInitialsWaiting: number;
  upfrontCampaigns: number;
  activeCampaigns: number;
}

export interface FollowUpBar {
  /** Whether every live campaign already drafts follow-ups up front. */
  on: boolean;
  text: string;
  /** What the button does: turn it on for the campaigns that don't have it, or off for all. */
  action: 'on' | 'off';
  actionLabel: string;
}

/**
 * The follow-ups bar at the top of the Pending tab. Always shown while a campaign is live, so the
 * switch lives where follow-ups are approved; null only when no campaign is live.
 */
export function followUpBar(s: FollowUpQueueState): FollowUpBar | null {
  if (s.activeCampaigns === 0) return null;
  if (s.upfrontCampaigns >= s.activeCampaigns) {
    return {
      on: true,
      action: 'off',
      actionLabel: 'Turn off',
      text: s.pendingFollowups > 0
        ? 'Write follow-ups now is on: follow-ups are drafted up front and appear on the Pending tab to approve. They still send only after the email before them, on schedule.'
        : 'Write follow-ups now is on: follow-ups are being drafted and will appear on the Pending tab to approve as they are written.',
    };
  }
  const some = s.upfrontCampaigns > 0 ? ` It's on for ${s.upfrontCampaigns} of ${s.activeCampaigns} campaigns.` : '';
  const n = s.approvedInitialsWaiting;
  const text = s.pendingFollowups === 0 && n > 0
    ? `No follow-ups to approve yet: ${n} approved first email${n === 1 ? ' is' : 's are'} still queued to send, and each follow-up is normally written a few business days after the email before it goes out. Turn on "Write follow-ups now" to draft and approve them now.${some}`
    : `Follow-ups are normally written a few business days after the email before them goes out. Turn on "Write follow-ups now" to draft all of them now and approve them on the Pending tab.${some}`;
  return { on: false, action: 'on', actionLabel: s.upfrontCampaigns > 0 ? 'Turn on for all' : 'Write follow-ups now', text };
}

// ── Approvals: what the Blocked tab holds ──────────────────────────────────

export interface BlockedLine { reason: string; count: number; text: string }

/** One line per block reason, largest first, in the same words as the row badges. */
export function blockedBreakdown(byReason: Record<string, number>): BlockedLine[] {
  return Object.entries(byReason)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, count, text: blockInfo(reason).text }));
}
