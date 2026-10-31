// Pure helpers for the approvals tables: timezone-aware dates, schedule text,
// and sort/filter. Kept free of React and Supabase so they can be unit-tested.
import { APPROVAL_STEP_ORDER } from './approvalLabels';

export type ScheduleBasis =
  | 'queue_position_and_daily_cap'
  | 'previous_email_sent'
  | 'depends_on_unsent_email'
  | 'held_by_send_rules'
  | 'prospect_stopped'
  | 'mailbox_paused'
  | 'previous_step_missing';

/** One row of the approvals_schedule(p_client_id) RPC. */
export interface ScheduleRow {
  message_id: string;
  prospect_id: string;
  message_type: string;
  step_label: string | null;
  approval_status: string;
  pending_since: string | null;
  estimated_send_at: string | null;
  is_confirmed: boolean;
  basis: ScheduleBasis | string | null;
}

export type ScheduleMap = Map<string, ScheduleRow>;

export function toScheduleMap(rows: ScheduleRow[]): ScheduleMap {
  return new Map(rows.map((r) => [r.message_id, r]));
}

export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

function safeTz(tz: string | null | undefined): string {
  if (!tz) return browserTimeZone();
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return browserTimeZone(); }
}

/** Calendar date (y, m 1-12, d) of an instant as seen in `tz`. */
export function zonedYmd(date: Date, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz), year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Whole calendar days between two instants, counted on dates in `tz` (never negative). */
export function calendarDaysBetween(from: Date, to: Date, tz: string): number {
  const a = zonedYmd(from, tz);
  const b = zonedYmd(to, tz);
  const diff = (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000;
  return Math.max(0, Math.round(diff));
}

/** "Oct 9, 2026 (4 days)" - "1 day", "0 days". */
export function formatPendingSince(iso: string | null | undefined, tz: string, now: Date = new Date()): string {
  if (!iso) return '-';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '-';
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz), month: 'short', day: 'numeric', year: 'numeric',
  }).format(when);
  const days = calendarDaysBetween(when, now, tz);
  return `${date} (${days} ${days === 1 ? 'day' : 'days'})`;
}

/** The instant at which the current calendar day began in `tz`. */
export function startOfDayInTz(tz: string, now: Date = new Date()): Date {
  const zone = safeTz(tz);
  const { y, m, d } = zonedYmd(now, zone);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetAt = (instantMs: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(new Date(instantMs));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return asUtc - Math.floor(instantMs / 1000) * 1000;
  };
  // Two passes so a DST change between the guess and midnight still lands on 00:00.
  let result = guess - offsetAt(guess);
  result = guess - offsetAt(result);
  return new Date(result);
}

export function isOverdue(estimatedSendAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!estimatedSendAt) return false;
  const t = new Date(estimatedSendAt).getTime();
  return !Number.isNaN(t) && t < now.getTime();
}

const NO_DATE_REASON: Record<string, string> = {
  held_by_send_rules: 'Held by send rules',
  prospect_stopped: 'Prospect stopped',
  mailbox_paused: 'Mailbox paused',
  previous_step_missing: 'Previous step missing',
  depends_on_unsent_email: 'Waiting on earlier email',
};

export interface ScheduledDisplay {
  /** Visible cell text. */
  text: string;
  /** Hover text (date and time in the business timezone), if there is a date. */
  title: string | null;
  estimated: boolean;
  overdue: boolean;
  hasDate: boolean;
}

export function scheduledDisplay(row: ScheduleRow | undefined, tz: string, now: Date = new Date()): ScheduledDisplay {
  if (!row) return { text: '-', title: null, estimated: false, overdue: false, hasDate: false };
  if (!row.estimated_send_at) {
    return {
      text: NO_DATE_REASON[row.basis ?? ''] ?? 'No date yet',
      title: null, estimated: false, overdue: false, hasDate: false,
    };
  }
  const when = new Date(row.estimated_send_at);
  const zone = safeTz(tz);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(when);
  const dateTime = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(when);
  const estimated = !row.is_confirmed;
  return {
    text: estimated ? `Est. ${date}` : date,
    title: estimated ? `Estimated: ${dateTime}` : dateTime,
    estimated,
    overdue: isOverdue(row.estimated_send_at, now),
    hasDate: true,
  };
}

// ── Sort + filter ────────────────────────────────────────────────────────────

export type ApprovalSort =
  | 'scheduled_asc' | 'scheduled_desc'
  | 'pending_asc' | 'pending_desc'
  | 'prospect_asc' | 'prospect_desc';

export const DEFAULT_APPROVAL_SORT: ApprovalSort = 'scheduled_asc';

export const APPROVAL_SORT_OPTIONS: { value: ApprovalSort; label: string }[] = [
  { value: 'scheduled_asc', label: 'Scheduled Send Date (earliest first)' },
  { value: 'scheduled_desc', label: 'Scheduled Send Date (latest first)' },
  { value: 'pending_asc', label: 'Pending Since (oldest first)' },
  { value: 'pending_desc', label: 'Pending Since (newest first)' },
  { value: 'prospect_asc', label: 'Prospect A-Z' },
  { value: 'prospect_desc', label: 'Prospect Z-A' },
];

export type ApprovalTypeFilter = 'all' | 'initial' | 'follow_up_d3' | 'follow_up_d7' | 'follow_up_d14';

export interface SortableApproval {
  id: string;
  prospect_id: string;
  message_type: string;
  created_at: string;
  pending_since?: string | null;
  prospect?: { business_name: string | null } | null;
}

/** The real "pending since" instant for a draft: the message's own column, then the schedule row, then created_at. */
export function pendingSinceOf(item: SortableApproval, schedule?: ScheduleMap): string {
  return item.pending_since ?? schedule?.get(item.id)?.pending_since ?? item.created_at;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function stepIndex(messageType: string): number {
  const i = (APPROVAL_STEP_ORDER as readonly string[]).indexOf(messageType);
  return i === -1 ? APPROVAL_STEP_ORDER.length : i;
}

function time(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function filterApprovals<T extends SortableApproval>(items: T[], type: ApprovalTypeFilter): T[] {
  return type === 'all' ? items : items.filter((i) => i.message_type === type);
}

export function sortApprovals<T extends SortableApproval>(items: T[], sort: ApprovalSort, schedule?: ScheduleMap): T[] {
  const dir = sort.endsWith('_desc') ? -1 : 1;
  const tie = (a: T, b: T) => time(a.created_at) - time(b.created_at) || a.id.localeCompare(b.id);

  const cmp = (a: T, b: T): number => {
    if (sort.startsWith('scheduled')) {
      const at = schedule?.get(a.id)?.estimated_send_at;
      const bt = schedule?.get(b.id)?.estimated_send_at;
      // Drafts without a date always sit at the end, whichever way the dates run.
      if (!at && !bt) return tie(a, b);
      if (!at) return 1;
      if (!bt) return -1;
      return (time(at) - time(bt)) * dir || tie(a, b);
    }
    if (sort.startsWith('pending')) {
      return (time(pendingSinceOf(a, schedule)) - time(pendingSinceOf(b, schedule))) * dir || tie(a, b);
    }
    // Prospect: name, then prospect id so same-named prospects stay apart,
    // then the sequence order so a prospect's emails sit together.
    const byName = collator.compare(a.prospect?.business_name ?? '', b.prospect?.business_name ?? '') * dir;
    if (byName) return byName;
    if (a.prospect_id !== b.prospect_id) return a.prospect_id.localeCompare(b.prospect_id);
    return stepIndex(a.message_type) - stepIndex(b.message_type) || tie(a, b);
  };

  return items.slice().sort(cmp);
}

export function applyApprovalView<T extends SortableApproval>(
  items: T[], opts: { sort: ApprovalSort; type: ApprovalTypeFilter; schedule?: ScheduleMap },
): T[] {
  return sortApprovals(filterApprovals(items, opts.type), opts.sort, opts.schedule);
}
