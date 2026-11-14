// One place for how an email step is named on the approvals screens (client
// Approvals and the admin queue). message_type values come from the database.
export const APPROVAL_STEP_ORDER = ['initial', 'follow_up_d3', 'follow_up_d7', 'follow_up_d14'] as const;

export const APPROVAL_TYPE_LABEL: Record<string, string> = {
  initial: 'First Touch',
  follow_up_d3: 'Follow-Up 1',
  follow_up_d7: 'Follow-Up 2',
  follow_up_d14: 'Follow-Up 3',
};

export function approvalTypeLabel(messageType: string): string {
  return APPROVAL_TYPE_LABEL[messageType] ?? messageType;
}

export const APPROVAL_EXPLAINER =
  'Approving schedules the send. Follow-ups go 3, 5 and 7 business days after the previous email, unless the prospect replies or unsubscribes.';

// messages.reject_reason values that mean a person turned the draft down. 'unknown' is a draft
// rejected before reasons were recorded that no rule could explain, so it is counted as a person's.
// Everything else (superseded, prospect_closed, followups_stopped, sequence_cancelled, system)
// left the queue on its own and is not a rejection.
export const REJECTED_BY_PERSON = ['manual', 'unknown'];

/** The sub-line on the "Rejected today" card. */
export function rejectedTotalsLine(t: { rejectedTotal: number; replacedTotal: number; autoCancelledTotal: number }): string {
  const parts = [`${t.rejectedTotal} rejected all time`];
  if (t.replacedTotal > 0) parts.push(`${t.replacedTotal} replaced by rewrites`);
  if (t.autoCancelledTotal > 0) parts.push(`${t.autoCancelledTotal} cancelled automatically`);
  return parts.join(' · ');
}

export const REJECTED_TOTALS_HINT =
  'Rejected counts drafts someone turned down. Older drafts replaced by a rewritten version, and follow-ups cancelled because the prospect replied or follow-ups were stopped, are shown separately.';

/**
 * Why "Approve" is disabled on the Pending tab, as a sentence shown under the button, or null when
 * it can be used. Shown as text rather than only a hover title: with Approve greyed out and Reject
 * still active beside it, a hidden reason is how a batch gets rejected instead of approved.
 */
export function bulkApproveBlockedReason(s: {
  selectedCount: number; gmailMissing: boolean; capped: boolean; loaded: number; totalPending: number;
}): { kind: 'gmail' | 'capped'; text: string } | null {
  if (s.gmailMissing) {
    return {
      kind: 'gmail',
      text: s.selectedCount > 0
        ? "Approve is off: connect Gmail first. It's what sends these emails. Rejecting won't approve them."
        : "Approve is off: connect Gmail first. It's what sends these emails.",
    };
  }
  if (s.selectedCount === 0 && s.capped) {
    return {
      kind: 'capped',
      text: `Only ${s.loaded} of ${s.totalPending} drafts are loaded, so "Approve all" is off. Tick the rows you want to approve.`,
    };
  }
  return null;
}

// A draft whose sign-off is missing the sender's first name (flagged by approved_queue when the
// client has a representative name). New drafts get the name added automatically; this catches any
// that still slip through, e.g. a draft cut off before its sign-off.
export const SIGN_OFF_MISSING_BADGE = 'No name in sign-off';
export const SIGN_OFF_MISSING_TITLE =
  "This draft doesn't end with your name. Edit it to add your name above the company name, or reject it.";

/** The note above the tabs, or null when every draft is signed with the name. */
export function signOffMissingLine(n: number): string | null {
  if (n <= 0) return null;
  return `${n} draft${n === 1 ? " doesn't" : "s don't"} end with your name in the sign-off. They're marked "${SIGN_OFF_MISSING_BADGE}" below: edit to add it, or reject.`;
}

/**
 * "Prague Restaurants (12), Berlin Cafes (3)" for a set of drafts. Returns '' when no draft's
 * campaign can be named (the campaign list hasn't loaded, or the drafts aren't loaded) so the
 * caller can leave the line out, rather than showing "Unknown campaign". Drafts whose campaign
 * isn't in the list are counted as "other campaigns" next to the ones that are.
 */
export function campaignBreakdownLabel(
  drafts: { campaign_id?: string | null }[],
  campaigns: { id: string; name: string }[],
): string {
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  const counts = new Map<string, number>();
  let unknown = 0;
  drafts.forEach((d) => {
    const name = d.campaign_id ? names.get(d.campaign_id) : undefined;
    if (name === undefined) { unknown += 1; return; }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  if (counts.size === 0) return '';
  const showCounts = counts.size > 1 || unknown > 0;
  const parts = Array.from(counts, ([name, n]) => (showCounts ? `${name} (${n})` : name));
  if (unknown > 0) parts.push(`other campaigns (${unknown})`);
  return parts.join(', ');
}
