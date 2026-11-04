// Groups the approvals_schedule rows into what a client wants at a glance (Oct 7
// feedback item 11): approved emails due today, tomorrow and later this week,
// emails waiting for approval, and emails held back. Pure, so it can be tested.
import type { ScheduleRow } from './approvalsView';

export interface UpcomingSummary {
  today: number;
  tomorrow: number;
  laterThisWeek: number;
  later: number;
  awaitingApproval: number;
  held: number;
  nextSendAt: string | null;
}

const HELD_BASES = new Set(['held_by_send_rules', 'mailbox_paused']);

/** YYYY-MM-DD of an instant in a time zone (falls back to UTC on a bad zone). */
export function localDay(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function summarizeUpcoming(rows: readonly ScheduleRow[], now: Date, timeZone: string): UpcomingSummary {
  const today = localDay(now, timeZone);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const out: UpcomingSummary = { today: 0, tomorrow: 0, laterThisWeek: 0, later: 0, awaitingApproval: 0, held: 0, nextSendAt: null };

  for (const r of rows) {
    if (r.basis === 'prospect_stopped') continue;
    if (r.approval_status !== 'approved') { out.awaitingApproval++; continue; }
    if (HELD_BASES.has(r.basis ?? '') || !r.estimated_send_at) { out.held++; continue; }
    const day = localDay(new Date(r.estimated_send_at), timeZone);
    if (day <= today) out.today++;
    else if (day === tomorrow) out.tomorrow++;
    else if (day <= weekEnd) out.laterThisWeek++;
    else out.later++;
    if (!out.nextSendAt || r.estimated_send_at < out.nextSendAt) out.nextSendAt = r.estimated_send_at;
  }
  return out;
}
