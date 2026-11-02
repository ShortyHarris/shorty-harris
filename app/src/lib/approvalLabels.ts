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
