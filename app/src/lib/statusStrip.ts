// The one status strip at the top of the client app. It replaces the separate sandbox, approvals and
// Gmail banners: instead of stacking, it shows the single most important thing right now, in this order:
//
//   1. Gmail not connected        (warning)  nothing can send at all
//   2. Sending paused             (warning)
//   3. Sending looks stuck        (warning)  approved emails ready, in sending hours, none sent today
//   4. Prospects awaiting approval (action)   nothing sends until they approve
//   5. Sending activity           (good)     "5 of 5 sent today, last one 40 min ago"
//
// A sandbox account adds a red SANDBOX tag and a "Sandbox controls" button to whatever is showing, and
// when there is nothing else to say the strip explains the sandbox itself.
// Pure: every input is passed in, so the order and wording are unit tested in statusStrip.test.ts.

import { formatClock, formatDay, minutesIntoWindow, nextSendStart, pacingNow, type SendPacing } from './sendPacing';

export type StripTone = 'warning' | 'action' | 'good' | 'sandbox';
export type StripIcon = 'gmail' | 'pause' | 'alert' | 'approve' | 'send' | 'check' | 'sandbox';

export interface StripCta {
  label: string;
  /** A route to go to, or 'details' to open the "How sending works" dialog. */
  to: string | 'details';
}

export interface StripMessage {
  tone: StripTone;
  icon: StripIcon;
  /** The bold headline. */
  title: string;
  /** Extra detail, shown on wider screens. */
  detail: string | null;
  /** The phone version: one short line, replaces title + detail. */
  short: string;
  cta: StripCta | null;
}

export interface StripInput {
  isSandbox: boolean;
  /** From the Gmail connection hook. Used only until send_pacing has loaded. */
  gmailConnected: boolean;
  awaitingProspects: number;
  pacing: SendPacing | null;
  basePath: string;
  pathname: string;
  /** null where the client can't reach Settings (admin view-as-client). */
  settingsHref: string | null;
  now?: Date;
}

export interface StripState {
  sandbox: { controlsHref: string } | null;
  message: StripMessage;
}

/** Hours into the send window with nothing sent before the strip calls sending stuck. Warm-up spaces
 *  sends up to ~75 minutes apart, so two hours with none at all is a real signal, not a slow day. */
export const STUCK_AFTER_MINUTES = 120;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "just now", "12 min ago", "3 hours ago", "yesterday", "4 days ago". */
export function timeAgo(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${plural(h, 'hour', 'hours')} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function gmailMessage(settingsHref: string | null): StripMessage {
  return {
    tone: 'warning',
    icon: 'gmail',
    title: 'Connect your Gmail to start sending.',
    detail: 'Nothing can go out until it is connected.',
    short: 'Connect Gmail to start sending',
    cta: settingsHref ? { label: 'Connect Gmail', to: settingsHref } : null,
  };
}

function pausedMessage(p: SendPacing, now: Date): StripMessage {
  const until = formatDay(p.paused_until as string, p.time_zone, now);
  return {
    tone: 'warning',
    icon: 'pause',
    title: `Sending is paused until ${until}.`,
    detail: 'Approved emails wait and go out after that.',
    short: `Sending paused until ${until}`,
    cta: { label: 'Details', to: 'details' },
  };
}

/** Approved emails ready, inside sending hours for a while, today's limit not used, and still nothing
 *  sent today. Sandbox fast mode has no send hours, so it never counts as stuck. */
function isStuck(p: SendPacing, now: Date): boolean {
  if (!p.window_applies || !p.today.in_window_now) return false;
  if (p.queue.ready <= 0 || p.today.remaining <= 0 || p.today.sent > 0) return false;
  const into = minutesIntoWindow(p, now);
  return into !== null && into >= STUCK_AFTER_MINUTES;
}

function stuckMessage(p: SendPacing, now: Date): StripMessage {
  const since = p.last_sent_at ? ` The last one went out ${timeAgo(p.last_sent_at, now)}.` : '';
  return {
    tone: 'warning',
    icon: 'alert',
    title: 'No emails have gone out yet today.',
    detail: `${plural(p.queue.ready, 'approved email is', 'approved emails are')} ready to send.${since} If this doesn't change soon, let us know.`,
    short: 'No emails sent yet today',
    cta: { label: 'Details', to: 'details' },
  };
}

/** "5 sent today", for the end of the approvals message. null until anything has ever been sent. */
function sentTodayNote(p: SendPacing | null): string | null {
  if (!p || !p.mailbox_connected || !p.last_sent_at) return null;
  return `${p.today.sent} sent today`;
}

function approvalsMessage(n: number, p: SendPacing | null, approvalsHref: string): StripMessage {
  const note = sentTodayNote(p);
  return {
    tone: 'action',
    icon: 'approve',
    title: `${plural(n, 'prospect', 'prospects')} waiting for your approval.`,
    detail: `Nothing sends until you approve.${note ? ` ${note[0].toUpperCase()}${note.slice(1)}.` : ''}`,
    short: `${n} to approve`,
    cta: { label: 'Review now', to: approvalsHref },
  };
}

/** When more emails will go out, or null when nothing approved is left. */
function nextLine(p: SendPacing, now: Date): string | null {
  if (p.queue.ready <= 0) return null;
  const start = nextSendStart(p, now) ?? `more from ${formatClock(p.window.start)} on the next sending day`;
  if (p.today.remaining <= 0) return `today's limit reached, ${p.window_applies ? start : 'more tomorrow'}`;
  if (p.window_applies && !p.today.in_window_now) return start;
  return 'more going out today';
}

function activityMessage(p: SendPacing, now: Date): StripMessage | null {
  const { sent, cap } = p.today;
  const last = p.last_sent_at;
  const ready = p.queue.ready;

  // Nothing has ever gone out yet.
  if (!last) {
    if (ready <= 0) return null;
    const when = p.window_applies && !p.today.in_window_now
      ? (nextSendStart(p, now) ?? 'sending starts on the next sending day')
      : 'the first ones go out shortly';
    return {
      tone: 'good',
      icon: 'send',
      title: 'Your first emails are queued.',
      detail: `${plural(ready, 'approved email', 'approved emails')} ready, ${when}.`,
      short: `${ready} queued, ${when.replace(/^sending /, '')}`,
      cta: { label: 'Details', to: 'details' },
    };
  }

  const warm = p.warmup.active ? ' (warming up)' : '';
  const counts = `${sent} of ${cap} sent today${warm}`;
  const ago = timeAgo(last, now);
  const next = nextLine(p, now);
  const detailParts = [counts, `last one ${ago}`, next ?? 'approve more prospects to keep sending'];

  return {
    tone: 'good',
    icon: ready > 0 ? 'send' : 'check',
    title: ready > 0 ? 'Sending is active.' : 'All approved emails have been sent.',
    detail: detailParts.join(' · '),
    short: `${sent} sent today · last ${ago}`,
    cta: { label: 'Details', to: 'details' },
  };
}

function sandboxMessage(): StripMessage {
  return {
    tone: 'sandbox',
    icon: 'sandbox',
    title: 'Test account.',
    detail: 'Emails only go to your own connected mailbox.',
    short: 'Emails only reach you',
    cta: null,
  };
}

/** Picks what the strip shows. null means no strip at all. */
export function resolveStatusStrip(input: StripInput): StripState | null {
  const { isSandbox, pacing: p, basePath, pathname, settingsHref } = input;
  const now = p ? pacingNow(p, input.now ?? new Date()) : (input.now ?? new Date());
  const approvalsHref = `${basePath}/approvals`;
  const onPage = (href: string | null) => !!href && (pathname === href || pathname.startsWith(`${href}/`));

  let message: StripMessage | null = null;
  const gmailMissing = p ? !p.mailbox_connected : !input.gmailConnected;

  if (gmailMissing) {
    // On Settings itself the message stays (it is still true) but the button would go nowhere new.
    message = gmailMessage(onPage(settingsHref) ? null : settingsHref);
  } else if (p?.paused_until) {
    message = pausedMessage(p, now);
  } else if (p && isStuck(p, now)) {
    message = stuckMessage(p, now);
  } else if (input.awaitingProspects > 0 && !onPage(approvalsHref)) {
    // Approvals has its own list and Sending line, so the strip falls through to activity there.
    message = approvalsMessage(input.awaitingProspects, p, approvalsHref);
  } else if (p) {
    message = activityMessage(p, now);
  }

  if (!message && isSandbox) message = sandboxMessage();
  if (!message) return null;

  const controlsHref = `${basePath}/sandbox`;
  return {
    sandbox: isSandbox ? { controlsHref } : null,
    message,
  };
}
