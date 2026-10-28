// "How we matched this" on a hot lead: which of our emails the reply was tied to, and how.

export type ReplyMatchMethod = 'thread' | 'email' | 'domain';

export interface ReplyMatch {
  match_method: ReplyMatchMethod | null;
  message: { subject: string | null; sent_at: string | null } | null;
}

const METHOD_TEXT: Record<ReplyMatchMethod, string> = {
  thread: 'our email thread',
  email: 'the exact address we wrote to',
  domain: 'company domain only',
};

export const WEAK_MATCH_WARNING = 'Weak match. Check this is really a reply to our outreach.';

export interface ReplyMatchView {
  subject: string | null;
  sentOn: string | null;
  method: string | null;
  weak: boolean;
}

function formatSent(iso: string | null | undefined, timeZone: string | null | undefined): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, ...(timeZone ? { timeZone } : {}) }).format(when);
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(when);
  }
}

/** What to show under "Their reply"; null when there is nothing to show (older replies, message not found). */
export function describeReplyMatch(
  match: ReplyMatch | null | undefined,
  timeZone: string | null | undefined,
): ReplyMatchView | null {
  if (!match || !match.match_method) return null;
  const method = METHOD_TEXT[match.match_method] ?? null;
  if (!method) return null;
  const subject = match.message?.subject?.trim() || null;
  const sentOn = formatSent(match.message?.sent_at, timeZone);
  // Message not found: nothing to say about what it replied to, so show nothing.
  if (!match.message) return null;
  return { subject, sentOn, method, weak: match.match_method === 'domain' };
}

/** PostgREST returns a to-one embed as an object, but guard against an array. */
export function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

/** Normalises the raw `replies(match_method, message:messages(subject, sent_at))` embed. */
export function toReplyMatch(raw: unknown): ReplyMatch | null {
  const r = firstOf(raw as Record<string, unknown> | Record<string, unknown>[] | null);
  if (!r) return null;
  const message = firstOf(r.message as ReplyMatch['message'] | ReplyMatch['message'][] | null);
  return { match_method: (r.match_method as ReplyMatchMethod | null) ?? null, message };
}
