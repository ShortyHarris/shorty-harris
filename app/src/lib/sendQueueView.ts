import type { QueuedMessage } from '../hooks/useSendQueue';

// ── Send time ────────────────────────────────────────────────────────────────────────────────
function ymd(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "Today, 14:20", "Tomorrow, 09:00" or "Tue 18 Nov, 09:00", in the client's send time zone. */
export function formatSendTime(iso: string, tz: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
  const day = ymd(d, tz);
  const today = ymd(now, tz);
  const tomorrow = ymd(new Date(now.getTime() + 86_400_000), tz);
  if (day <= today) return `Today, ${time}`;
  if (day === tomorrow) return `Tomorrow, ${time}`;
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return `${date}, ${time}`;
}

/** A past moment: "12 Nov, 14:20". */
export function formatPastTime(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

const NO_TIME_TEXT: Record<string, string> = {
  prospect_stopped: "Won't send: the prospect's sequence has ended",
  held_by_send_rules: 'Held by send rules',
  mailbox_paused: 'Waiting: sending is paused for this mailbox',
  previous_step_missing: 'Waits for the previous email to send',
};

export function sendTimeText(item: Pick<QueuedMessage, 'sending' | 'estimated_send_at' | 'time_zone' | 'basis' | 'category'>, now = new Date()): string {
  if (item.sending) return 'Sending now';
  if (item.estimated_send_at) return formatSendTime(item.estimated_send_at, item.time_zone, now);
  if (item.basis && NO_TIME_TEXT[item.basis]) return NO_TIME_TEXT[item.basis];
  return item.category === 'blocked' ? 'Not scheduled: blocked' : 'Not scheduled';
}

