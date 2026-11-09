// The warm-up "thermometer": where a new mailbox is on its ramp to full sending speed, worded for
// clients. Everything comes from send_pacing's warmup block (day index and the 5-step ladder);
// nothing here recomputes the ladder. Shown in the status strip and the "How sending works" dialog.

import { formatDay, pacingNow, type SendPacing } from './sendPacing';

/** How long the "Fully warmed up" thermometer stays in the strip after warm-up ends. */
export const SHOW_FINISHED_DAYS = 7;
/** Matches the server: 5 steps of 7 days, full speed from day 28. */
const DAYS_PER_STEP = 7;

export interface WarmupStep {
  cap: number;
  /** "This week" for the current step, otherwise "From Nov 4". */
  when: string;
  state: 'done' | 'now' | 'next';
}

export interface WarmupView {
  finished: boolean;
  /** 1-based step the mailbox is on; equals `stages` once finished. */
  stage: number;
  stages: number;
  /** Today's limit. */
  cap: number;
  fullSpeedCap: number;
  /** "Nov 25", or null when the ladder has no dates. */
  fullSpeedOn: string | null;
  steps: WarmupStep[];
  /** Strip pill. */
  pill: { title: string; detail: string; short: string };
  /** Dialog section. */
  heading: string;
  explainer: string;
}

export const WARMUP_EXPLAINER =
  "Your mailbox is new, so we start slowly and send a few more each week. This builds trust with Gmail and Outlook, so your emails land in inboxes instead of spam. It happens automatically. There's nothing you need to do.";

/**
 * The thermometer for this client, or null when there is none to show: no mailbox, a mailbox that
 * never needed warming up (mode 'warm'), or one that finished warming up over a week ago.
 */
export function warmupView(p: SendPacing, nowIn: Date = new Date()): WarmupView | null {
  if (!p.mailbox_connected || p.warmup.mode === 'warm') return null;
  const ladder = p.warmup.ladder;
  if (ladder.length === 0) return null;

  const stages = ladder.length;
  const finished = !p.warmup.active;
  // Full speed starts on the last step's first day (day 28 for 5 steps).
  if (finished && p.warmup.day >= (stages - 1) * DAYS_PER_STEP + SHOW_FINISHED_DAYS) return null;

  const now = pacingNow(p, nowIn);
  const stage = finished ? stages : Math.min(stages, Math.floor(p.warmup.day / DAYS_PER_STEP) + 1);
  const last = ladder[stages - 1];
  const fullSpeedCap = last.cap;
  const fullSpeedOn = last.starts_on ? formatDay(last.starts_on, p.time_zone, now) : null;

  const steps: WarmupStep[] = ladder.map((s, i) => {
    const state = i + 1 < stage ? 'done' : i + 1 === stage ? 'now' : 'next';
    const when = state === 'now' && !finished ? 'This week' : s.starts_on ? `From ${formatDay(s.starts_on, p.time_zone, now)}` : '';
    return { cap: s.cap, when, state };
  });

  const pill = finished
    ? { title: 'Fully warmed up', detail: `Up to ${fullSpeedCap} a day`, short: '🔥 Full speed' }
    : {
        title: 'Warming up your mailbox',
        detail: fullSpeedOn ? `Full speed (${fullSpeedCap} a day) by ${fullSpeedOn}` : `Full speed is ${fullSpeedCap} a day`,
        short: fullSpeedOn ? `🌡 Full speed ${fullSpeedOn}` : '🌡 Warming up',
      };

  return {
    finished,
    stage,
    stages,
    cap: p.today.cap,
    fullSpeedCap,
    fullSpeedOn,
    steps,
    pill,
    heading: finished ? 'Your mailbox is fully warmed up' : `Why only ${p.today.cap} emails a day?`,
    explainer: finished
      ? `It now sends up to ${fullSpeedCap} emails a day. Starting slowly built trust with Gmail and Outlook, so your emails land in inboxes instead of spam.`
      : WARMUP_EXPLAINER,
  };
}

/** "200 approved emails are waiting to go out. At this pace, ... by about Dec 3." null without an estimate. */
export function queueEta(p: SendPacing, nowIn: Date = new Date()): { count: number; date: string; text: string } | null {
  const { ready, estimated_clear_date: eta } = p.queue;
  if (ready <= 0 || !eta || !p.mailbox_connected) return null;
  const date = formatDay(eta, p.time_zone, pacingNow(p, nowIn));
  const pace = p.warmup.active ? 'At this pace, including the weekly speed-ups,' : 'At this pace,';
  const what = `${ready} approved email${ready === 1 ? '' : 's'}`;
  const verb = ready === 1 ? 'is' : 'are';
  const subject = ready === 1 ? 'it should be sent' : 'they should all be sent';
  return { count: ready, date, text: `${what} ${verb} waiting to go out. ${pace} ${subject} by about ${date}.` };
}
