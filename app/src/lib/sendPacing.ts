// Parsing and plain-language copy for the send_pacing(p_client_id) RPC. The function does all the
// maths (caps, warm-up ladder, queue estimate); nothing here recomputes any of it. This file only
// validates the response shape and turns it into the sentences the Sending panels show.

export interface SendPacing {
  is_admin: boolean;
  time_zone: string;
  window: { start: string; end: string; days: string };
  mailbox_connected: boolean;
  paused_until: string | null;
  warmup: {
    mode: string;
    active: boolean;
    day: number;
    next_step_cap: number | null;
    next_step_date: string | null;
    ladder: { cap: number; starts_on: string }[];
  };
  today: { cap: number; sent: number; remaining: number; in_window_now: boolean };
  queue: {
    ready: number;
    ready_first_emails: number;
    ready_follow_ups: number;
    waiting_for_date: number;
    estimated_clear_date: string | null;
  };
  follow_ups: { awaiting_approval: number; scheduled: number; next_due: string | null };
  /** Only ever set when the server says is_admin. A client never gets this. */
  admin: { held_by_send_rules: number; blocked_total: number } | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Turns the raw RPC body into a SendPacing, or throws when the server refused. */
export function parseSendPacing(body: unknown): SendPacing {
  const b = obj(body);
  if (b.ok !== true) throw new Error(str(b.error, 'not_permitted'));

  const isAdmin = b.is_admin === true;
  const win = obj(b.window);
  const warm = obj(b.warmup);
  const today = obj(b.today);
  const queue = obj(b.queue);
  const fu = obj(b.follow_ups);
  const admin = obj(b.admin);

  return {
    is_admin: isAdmin,
    time_zone: str(b.time_zone, 'America/Chicago'),
    window: { start: str(win.start, '09:00'), end: str(win.end, '17:00'), days: str(win.days, 'Mon-Fri') },
    mailbox_connected: b.mailbox_connected === true,
    paused_until: strOrNull(b.paused_until),
    warmup: {
      mode: str(warm.mode, 'warm'),
      active: warm.active === true,
      day: num(warm.day),
      next_step_cap: numOrNull(warm.next_step_cap),
      next_step_date: strOrNull(warm.next_step_date),
      ladder: (Array.isArray(warm.ladder) ? warm.ladder : []).map((s) => ({
        cap: num(obj(s).cap),
        starts_on: str(obj(s).starts_on),
      })),
    },
    today: {
      cap: num(today.cap),
      sent: num(today.sent),
      remaining: num(today.remaining),
      in_window_now: today.in_window_now === true,
    },
    queue: {
      ready: num(queue.ready),
      ready_first_emails: num(queue.ready_first_emails),
      ready_follow_ups: num(queue.ready_follow_ups),
      waiting_for_date: num(queue.waiting_for_date),
      estimated_clear_date: strOrNull(queue.estimated_clear_date),
    },
    follow_ups: {
      awaiting_approval: num(fu.awaiting_approval),
      scheduled: num(fu.scheduled),
      next_due: strOrNull(fu.next_due),
    },
    // Defence in depth: the server returns null for clients, and we also refuse to carry it unless
    // the same response says is_admin. The panels read this field, never profile.role.
    admin: isAdmin && b.admin
      ? { held_by_send_rules: num(admin.held_by_send_rules), blocked_total: num(admin.blocked_total) }
      : null,
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** '09:00' → '9:00 AM'. Anything that is not HH:MM is passed through. */
export function formatClock(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** 'Mon-Fri' → 'Mon to Fri'. */
export function formatDays(days: string): string {
  return days.replace(/\s*-\s*/g, ' to ');
}

/**
 * Short day label ("Oct 28"), with the year only when it is not the current year. A bare date
 * ('2026-10-28', how the RPC sends starts_on / estimated_clear_date) is formatted as that calendar
 * day with no timezone shift; a timestamp is shown as the day it falls on in the client's zone.
 */
export function formatDay(value: string, timeZone: string, now: Date = new Date()): string {
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = bare ? new Date(Date.UTC(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]))) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const tz = bare ? 'UTC' : timeZone;
  const sameYear = Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: tz }).format(date)) === now.getFullYear();
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: tz,
  }).format(date);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ── Copy ─────────────────────────────────────────────────────────────────────

export const QUEUE_TOOLTIP = 'An estimate. Follow-ups share the same daily limit.';
export const FOLLOW_UP_EXPLAINER =
  "After a first email is sent, up to 3 follow-ups are written for people who haven't replied: 3, then 5, then 7 business days after the previous email. Each appears in Approvals for you to approve.";

export interface SendingCopy {
  /** Shown prominently, before everything else. */
  warnings: string[];
  today: string | null;
  warmup: { text: string; ladder: string[] } | null;
  queue: { text: string; tooltip: string | null } | null;
  followUps: string | null;
  /** Empty for a client. Lines come from the response's is_admin, not the signed-in profile. */
  admin: string[];
}

export function sendingWarnings(p: SendPacing, now?: Date): string[] {
  const out: string[] = [];
  if (!p.mailbox_connected) out.push('Connect Gmail, nothing can send until you do.');
  if (p.paused_until) out.push(`Sending is paused until ${formatDay(p.paused_until, p.time_zone, now)}.`);
  return out;
}

function todayLine(p: SendPacing): string {
  const base = `${p.today.sent} of ${p.today.cap} emails sent today.`;
  if (p.today.in_window_now) return base;
  const w = p.window;
  return `${base} Sends ${formatDays(w.days)}, ${formatClock(w.start)} to ${formatClock(w.end)} (${p.time_zone}).`;
}

function queueLine(p: SendPacing, now?: Date): SendingCopy['queue'] {
  const { ready, estimated_clear_date: eta } = p.queue;
  if (ready <= 0) return null;
  const queued = `${ready} approved ${plural(ready, 'email is', 'emails are')} queued.`;
  if (!eta) return { text: queued, tooltip: null };
  return {
    text: `${queued} At this pace they should all be sent by about ${formatDay(eta, p.time_zone, now)}.`,
    tooltip: QUEUE_TOOLTIP,
  };
}

function followUpLine(p: SendPacing, now?: Date): string | null {
  const { awaiting_approval: waiting, scheduled, next_due: next } = p.follow_ups;
  const parts: string[] = [];
  if (waiting > 0) parts.push(`${waiting} waiting for your approval.`);
  if (scheduled > 0) {
    const due = next ? `, the next due ${formatDay(next, p.time_zone, now)}` : '';
    parts.push(`${scheduled} ${waiting > 0 ? 'more are' : plural(scheduled, 'is', 'are')} scheduled${due}.`);
  }
  return parts.length ? parts.join(' ') : null;
}

function adminLines(p: SendPacing): string[] {
  if (!p.is_admin || !p.admin) return [];
  const out = [`Warm-up mode: ${p.warmup.mode}.`, `Warm-up day: ${p.warmup.day}.`];
  if (p.admin.held_by_send_rules > 0) out.push(`${p.admin.held_by_send_rules} held by send rules.`);
  if (p.admin.blocked_total > 0) out.push(`${p.admin.blocked_total} blocked from sending.`);
  return out;
}

export function sendingCopy(p: SendPacing, now?: Date): SendingCopy {
  const noMailbox = !p.mailbox_connected;
  return {
    warnings: sendingWarnings(p, now),
    // With no mailbox nothing can send, so a "0 of 40 sent" line and a warm-up plan would mislead.
    today: noMailbox ? null : todayLine(p),
    warmup: noMailbox
      ? null
      : p.warmup.active
        ? {
            text: `Your mailbox is warming up. New mailboxes send gradually to protect deliverability. Today's limit is ${p.today.cap} a day.`,
            ladder: p.warmup.ladder.map((s) => `${s.cap} a day from ${formatDay(s.starts_on, p.time_zone, now)}`),
          }
        : { text: 'Full sending volume.', ladder: [] },
    queue: queueLine(p, now),
    followUps: followUpLine(p, now),
    admin: adminLines(p),
  };
}

/** The one-line version shown above the Approvals list. */
export function compactSendingLine(p: SendPacing, now?: Date): { text: string; warning: boolean } {
  const warnings = sendingWarnings(p, now);
  if (warnings.length) return { text: warnings.join(' '), warning: true };
  const parts = [todayLine(p)];
  if (p.warmup.active) parts.push(`Warming up, today's limit is ${p.today.cap} a day.`);
  const q = queueLine(p, now);
  if (q) parts.push(q.text);
  return { text: parts.join(' '), warning: false };
}
