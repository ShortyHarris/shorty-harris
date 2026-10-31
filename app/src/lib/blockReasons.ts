// Why an approved draft won't go out, from the message_block_reasons view.
// Plain-language copy lives here so every screen words it the same way.

export type BlockReason =
  | 'generic_mailbox'
  | 'freemail_address'
  | 'country_hold'
  | 'do_not_contact'
  | 'sequence_paused'
  | 'followups_stopped'
  | 'campaign_inactive'
  | 'prospect_status'
  | 'unsubscribe_unhealthy'
  | 'waiting_followup_timing';

export type BlockTone = 'blocked' | 'paused' | 'scheduled';

export interface BlockInfo {
  badge: string;
  tone: BlockTone;
  text: string;
}

export const BLOCK_INFO: Record<BlockReason, BlockInfo> = {
  generic_mailbox: {
    badge: 'Blocked', tone: 'blocked',
    text: "Won't send: shared address (info@/office@) in an EU/Czech campaign",
  },
  freemail_address: {
    badge: 'Blocked', tone: 'blocked',
    text: "Won't send: personal email address (Gmail/Seznam etc.) in an EU/Czech campaign",
  },
  country_hold: {
    badge: 'Blocked', tone: 'blocked',
    text: "Won't send: sending to this country is on hold",
  },
  do_not_contact: {
    badge: 'Blocked', tone: 'blocked',
    text: "Won't send: opted out",
  },
  sequence_paused: {
    badge: 'Paused', tone: 'paused',
    text: 'Paused',
  },
  followups_stopped: {
    badge: 'Blocked', tone: 'blocked',
    text: "Won't send: follow-ups for this prospect were stopped",
  },
  // Fallback when the campaign status isn't known; blockInfo() splits it by status.
  campaign_inactive: {
    badge: 'Paused', tone: 'paused',
    text: 'Paused',
  },
  prospect_status: {
    badge: 'Blocked', tone: 'blocked',
    text: "Won't send: prospect already replied/closed",
  },
  unsubscribe_unhealthy: {
    badge: 'Blocked', tone: 'blocked',
    text: 'Sending paused platform-wide: our team is fixing a compliance check',
  },
  waiting_followup_timing: {
    badge: 'Scheduled', tone: 'scheduled',
    text: 'Scheduled: this follow-up is waiting for its send date',
  },
};

// Unknown codes (a newer view than this build) still read as blocked.
const FALLBACK: BlockInfo = { badge: 'Blocked', tone: 'blocked', text: "Won't send right now" };

// campaign_inactive covers three different situations, told apart by the campaign's status.
const CAMPAIGN_INACTIVE_INFO: Record<string, BlockInfo> = {
  draft:     { badge: 'Campaign not launched', tone: 'paused',  text: 'Campaign not launched' },
  paused:    { badge: 'Campaign paused',       tone: 'paused',  text: 'Campaign paused' },
  cancelled: { badge: 'Campaign cancelled',    tone: 'blocked', text: 'Campaign cancelled' },
};

export function blockInfo(reason: string, campaignStatus?: string | null): BlockInfo {
  if (reason === 'campaign_inactive' && campaignStatus && CAMPAIGN_INACTIVE_INFO[campaignStatus]) {
    return CAMPAIGN_INACTIVE_INFO[campaignStatus];
  }
  return BLOCK_INFO[reason as BlockReason] ?? FALLBACK;
}

/** Held by policy (EU/Czech recipient rules): hidden from the client's Blocked list and counts. */
export const POLICY_HELD_REASONS: readonly BlockReason[] = ['generic_mailbox', 'freemail_address'];

export function isPolicyHeld(reason: string | null | undefined): boolean {
  return !!reason && (POLICY_HELD_REASONS as readonly string[]).includes(reason);
}

/** Scheduled is a normal waiting state, not a block. */
export function isBlocking(reason: string | null | undefined): boolean {
  return !!reason && blockInfo(reason).tone !== 'scheduled';
}
