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
