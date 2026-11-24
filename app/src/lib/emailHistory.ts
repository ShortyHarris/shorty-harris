// The email history on a warm lead's panel: what went out, then what is still to come.
// Rejected drafts are left out. They never went anywhere, and the AI often writes several
// before one is approved, so listing them made one email look like three "scheduled" first
// touches.

export interface HistoryMessage {
  id: string;
  message_type: string;
  subject: string | null;
  approval_status: string;
  send_status: string;
  sent_at: string | null;
  open_count: number;
}

export type HistoryState = 'sent' | 'scheduled' | 'awaiting_approval' | 'failed';

const STEP_ORDER: Record<string, number> = { initial: 0, follow_up_d3: 1, follow_up_d7: 2, follow_up_d14: 3 };

export function historyState(m: HistoryMessage): HistoryState {
  if (m.sent_at || m.send_status === 'sent') return 'sent';
  if (m.approval_status === 'pending') return 'awaiting_approval';
  if (m.send_status === 'failed') return 'failed';
  return 'scheduled';
}

/** Emails that went out (oldest first), then the ones still to go, in sequence order. */
export function emailHistory<T extends HistoryMessage>(messages: T[]): T[] {
  const live = messages.filter((m) => m.approval_status !== 'rejected');
  const sent = live.filter((m) => historyState(m) === 'sent')
    .sort((a, b) => (a.sent_at ?? '').localeCompare(b.sent_at ?? ''));
  const later = live.filter((m) => historyState(m) !== 'sent')
    .sort((a, b) => (STEP_ORDER[a.message_type] ?? 9) - (STEP_ORDER[b.message_type] ?? 9));
  return [...sent, ...later];
}
