// Shared plain-language labels for prospects.pipeline_status. The raw value
// ("message_pending") reads like an error when it's actually a normal queue
// state, so every screen that shows a status must go through this map.
export const PIPELINE_STATUS_LABEL: Record<string, string> = {
  new: 'Not contacted yet',
  message_pending: 'Email not written yet',
  generating: 'Writing their email',
  generation_failed: "We couldn't write their email",
  contacted: 'Emailed',
  replied: 'They replied',
  hot_lead: 'Hot lead',
  called: 'Called',
  won: 'Won',
  lost: 'Lost',
  bounced: 'Email bounced',
};

export const PIPELINE_STATUS_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  new:                { bg: '#edf4ef', text: '#3c7a5b' },
  message_pending:    { bg: '#f0ecf8', text: '#6b4fa0', border: '1px solid rgba(107,79,160,0.2)' },
  generating:         { bg: '#f0ecf8', text: '#6b4fa0' },
  generation_failed:  { bg: '#f6e8e2', text: '#a8533a', border: '1px solid rgba(168,83,58,0.2)' },
  contacted:          { bg: '#f8efdb', text: '#b9831f' },
  replied:            { bg: '#f8efdb', text: '#b9831f' },
  hot_lead:           { bg: '#3c7a5b', text: '#fff' },
  called:             { bg: '#f8efdb', text: '#b9831f' },
  won:                { bg: '#3c7a5b', text: '#fff' },
  lost:               { bg: 'transparent', text: '#9a9d92', border: '1px solid #ddd8cb' },
  bounced:            { bg: '#f6e8e2', text: '#a8533a', border: '1px solid rgba(168,83,58,0.2)' },
};

// Sequence status: what is happening to the outreach sequence, derived in the
// database (see migration 20261008120000). When present it replaces the plain
// pipeline status label. "Unsubscribed" and "Not interested" stay separate.
export type SequenceStatus = 'unsubscribed' | 'hard_bounce' | 'automated_reply' | 'human_reply';

export const SEQUENCE_STATUS_ORDER: SequenceStatus[] = ['human_reply', 'automated_reply', 'unsubscribed', 'hard_bounce'];

export const SEQUENCE_STATUS_LABEL: Record<SequenceStatus, string> = {
  unsubscribed: 'Unsubscribed, Outreach Suppressed',
  hard_bounce: 'Hard Bounce, Sending Stopped',
  automated_reply: 'Automated Reply, Sequence Continuing',
  human_reply: 'Human Reply, Sequence Stopped',
};

export const SEQUENCE_STATUS_PILL: Record<SequenceStatus, { bg: string; text: string; border?: string }> = {
  unsubscribed:    { bg: 'transparent', text: '#62655c', border: '1px solid #ddd8cb' },
  hard_bounce:     { bg: '#f6e8e2', text: '#a8533a', border: '1px solid rgba(168,83,58,0.2)' },
  automated_reply: { bg: '#f5f2ec', text: '#62655c' },
  human_reply:     { bg: '#edf4ef', text: '#3c7a5b' },
};

export function isSequenceStatus(v: unknown): v is SequenceStatus {
  return typeof v === 'string' && v in SEQUENCE_STATUS_LABEL;
}

// Filter-tab keys for sequence statuses are namespaced so they can share the
// single `status` filter with pipeline_status values (the RPC reads the prefix).
export const SEQUENCE_FILTER_PREFIX = 'seq:';

export function pipelineStatusLabel(status: string): string {
  return PIPELINE_STATUS_LABEL[status] ?? status;
}
