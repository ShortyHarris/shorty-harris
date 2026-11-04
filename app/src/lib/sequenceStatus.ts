import type { SequenceStatus } from './pipelineStatus';

// Browser-side copy of the database function prospect_sequence_status(), for
// screens that read prospects directly instead of through an RPC (the admin
// Prospects list). Keep the two in step: same precedence, same intent groups.

export const UNSUBSCRIBE_REASONS = ['opt_out', 'stop_request'] as const;
const AUTOMATED_INTENTS = new Set(['automated', 'auto_reply', 'out_of_office']);
const NOT_HUMAN_INTENTS = new Set(['automated', 'auto_reply', 'out_of_office', 'bounced', 'uncertain']);

export interface ReplyIntentRow {
  prospect_id: string;
  intent: string | null;
  received_at: string | null;
  created_at: string | null;
}

/** Most recent first: received_at desc nulls last, then created_at desc. */
function byLatest(a: ReplyIntentRow, b: ReplyIntentRow): number {
  if (a.received_at !== b.received_at) {
    if (a.received_at === null) return 1;
    if (b.received_at === null) return -1;
    return a.received_at < b.received_at ? 1 : -1;
  }
  const ac = a.created_at ?? '';
  const bc = b.created_at ?? '';
  return ac === bc ? 0 : ac < bc ? 1 : -1;
}

/**
 * @param dncReasons reasons recorded on do_not_contact for this prospect's email
 * @param replies    this prospect's replies, any order
 */
export function deriveSequenceStatus(
  pipelineStatus: string,
  dncReasons: readonly string[],
  replies: readonly ReplyIntentRow[],
): SequenceStatus | null {
  if (dncReasons.some((r) => (UNSUBSCRIBE_REASONS as readonly string[]).includes(r))) return 'unsubscribed';
  if (pipelineStatus === 'bounced' || dncReasons.includes('bounce')) return 'hard_bounce';
  const latest = [...replies].sort(byLatest)[0]?.intent ?? null;
  if (latest === 'uncertain') return 'needs_review';
  if (latest !== null && AUTOMATED_INTENTS.has(latest)) return 'automated_reply';
  if (replies.some((r) => r.intent !== null && !NOT_HUMAN_INTENTS.has(r.intent))) return 'human_reply';
  return null;
}

/** Groups do_not_contact rows by lower-cased email. */
export function dncReasonsByEmail(rows: ReadonlyArray<{ email: string | null; reason: string | null }>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.email) continue;
    const k = r.email.toLowerCase();
    const list = out.get(k) ?? [];
    if (r.reason) list.push(r.reason);
    out.set(k, list);
  }
  return out;
}

// Plain-language names for messages.message_type.
export const MESSAGE_STEP_LABEL: Record<string, string> = {
  initial: 'First email',
  follow_up_d3: 'Follow-up 1',
  follow_up_d7: 'Follow-up 2',
  follow_up_d14: 'Follow-up 3',
};

export function messageStepLabel(type: string | null | undefined): string {
  return (type && MESSAGE_STEP_LABEL[type]) ?? type ?? 'Email';
}
