import { PILL, type StatusPillStyle } from '../components/StatusPill';

// Shared plain-language labels for prospects.pipeline_status. The raw value
// ("message_pending") reads like an error when it's actually a normal queue
// state, so every screen that shows a status must go through this map.
// PostgREST `in` list of statuses where a prospect's sequence is over, so a
// waiting draft no longer counts as "awaiting review". Same exclusions as the
// approve_sequences RPC.
export const TERMINAL_PIPELINE_STATUSES = '(replied,hot_lead,won,lost,called,bounced)';

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

export const PIPELINE_STATUS_PILL: Record<string, StatusPillStyle> = {
  new:                { ...PILL.ahead,   icon: 'circle' },
  message_pending:    { ...PILL.waiting, icon: 'clock' },
  generating:         { ...PILL.ahead,   icon: 'refresh' },
  generation_failed:  { ...PILL.problem, icon: 'alert' },
  contacted:          { ...PILL.sent,    icon: 'send' },
  replied:            { ...PILL.waiting, icon: 'reply' },
  hot_lead:           { ...PILL.hot,     icon: 'zap' },
  called:             { ...PILL.sent,    icon: 'phone' },
  won:                { ...PILL.waiting, icon: 'check' },
  lost:               { ...PILL.closed,  icon: 'minus' },
  bounced:            { ...PILL.problem, icon: 'alert' },
};

// Sequence status: what is happening to the outreach sequence, derived in the
// database (see migration 20261008120000). When present it replaces the plain
// pipeline status label. "Unsubscribed" and "Not interested" stay separate.
export type SequenceStatus = 'unsubscribed' | 'hard_bounce' | 'automated_reply' | 'human_reply' | 'needs_review';

export const SEQUENCE_STATUS_ORDER: SequenceStatus[] = ['needs_review', 'human_reply', 'automated_reply', 'unsubscribed', 'hard_bounce'];

export const SEQUENCE_STATUS_LABEL: Record<SequenceStatus, string> = {
  unsubscribed: 'Unsubscribed, Outreach Suppressed',
  hard_bounce: 'Hard Bounce, Sending Stopped',
  automated_reply: 'Automated Reply, Sequence Continuing',
  human_reply: 'Human Reply, Sequence Stopped',
  needs_review: 'Needs Your Review',
};

// Wording for the badge at the top of a prospect's sequence panel.
export const SEQUENCE_STATUS_PANEL_LABEL: Record<SequenceStatus, string> = {
  unsubscribed: 'Unsubscribed',
  hard_bounce: 'Bounced',
  automated_reply: 'Automated reply, sequence continues',
  human_reply: 'Replied, sequence stopped',
  needs_review: 'Needs your review',
};

export const SEQUENCE_STATUS_PILL: Record<SequenceStatus, StatusPillStyle> = {
  unsubscribed:    { ...PILL.closed,  icon: 'minus' },
  hard_bounce:     { ...PILL.problem, icon: 'alert' },
  automated_reply: { ...PILL.ahead,   icon: 'refresh' },
  human_reply:     { ...PILL.waiting, icon: 'reply' },
  needs_review:    { ...PILL.waiting, icon: 'clock' },
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
