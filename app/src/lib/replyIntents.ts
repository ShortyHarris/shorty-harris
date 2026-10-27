// Reply-intent grouping for the admin Analytics reply breakdown.
// "automated", "auto_reply" and "out_of_office" are the same thing to a reader
// (a machine answered), and "bounced" is a delivery failure, not a reply from
// a person - so only the HUMAN_INTENTS are shown as "real replies".
// "uncertain" is its own bucket, and any value we do not know lands in "other"
// so a reply is never silently dropped.

export const AUTOMATED_INTENTS = ['automated', 'auto_reply', 'out_of_office'] as const;
export const BOUNCED_INTENT = 'bounced';
export const UNCERTAIN_INTENT = 'uncertain';
export const HUMAN_INTENTS = [
  'interested', 'question', 'resend_request', 'referred', 'maybe', 'not_interested', 'wrong_person', 'stop',
] as const;

// Intents that are not a person's real reply: left out of reply rates and trends.
const NON_REPLY_INTENTS: readonly string[] = [...AUTOMATED_INTENTS, BOUNCED_INTENT, UNCERTAIN_INTENT];
export function isNonReplyIntent(intent: string | null): boolean {
  return !!intent && NON_REPLY_INTENTS.includes(intent);
}

export type HumanIntent = (typeof HUMAN_INTENTS)[number];
export type ReplyGroup = HumanIntent | 'automated' | 'bounced' | 'uncertain' | 'other';

export const HUMAN_INTENT_LABEL: Record<HumanIntent, string> = {
  interested: 'Interested',
  question: 'Question',
  resend_request: 'Resend request',
  referred: 'Referred',
  maybe: 'Maybe',
  not_interested: 'Not interested',
  wrong_person: 'Wrong person',
  stop: 'Stop',
};

// Fixed order, one colour per intent (never repainted when a slice is empty).
// The original five were checked with the dataviz palette validator; amber is
// under 3:1 against white, so every slice also carries a visible text label.
export const HUMAN_INTENT_COLOR: Record<HumanIntent, string> = {
  interested: '#168a5c',
  question: '#0f8b9d',
  resend_request: '#6b4fc9',
  referred: '#6f8f1f',
  maybe: '#d99a00',
  not_interested: '#2f6fd0',
  wrong_person: '#c2418f',
  stop: '#d9532b',
};

const OTHER_STYLE = { label: 'Other', color: '#6b7280' };
const NON_HUMAN_STYLE: Record<string, { label: string; color: string }> = {
  automated: { label: 'Automated', color: '#6b7280' },
  auto_reply: { label: 'Auto reply', color: '#6b7280' },
  out_of_office: { label: 'Out of office', color: '#6b7280' },
  bounced: { label: 'Bounced', color: '#b42318' },
  uncertain: { label: 'Uncertain', color: '#8a6d1d' },
};

/** Label and colour for any intent value; unknown or empty values read as a neutral "Other". */
export function intentStyle(intent: string | null): { label: string; color: string } {
  if (!intent) return OTHER_STYLE;
  if ((HUMAN_INTENTS as readonly string[]).includes(intent)) {
    return { label: HUMAN_INTENT_LABEL[intent as HumanIntent], color: HUMAN_INTENT_COLOR[intent as HumanIntent] };
  }
  return NON_HUMAN_STYLE[intent] ?? OTHER_STYLE;
}

export interface ReplyRecord {
  id: string;
  intent: string | null;
  body: string | null;
  at: string | null;
  prospectName: string;
}

// null only when there is no intent at all (not yet classified).
export function replyGroup(intent: string | null): ReplyGroup | null {
  if (!intent) return null;
  if ((AUTOMATED_INTENTS as readonly string[]).includes(intent)) return 'automated';
  if (intent === BOUNCED_INTENT) return 'bounced';
  if (intent === UNCERTAIN_INTENT) return 'uncertain';
  if ((HUMAN_INTENTS as readonly string[]).includes(intent)) return intent as HumanIntent;
  return 'other';
}

export interface ReplySummary {
  total: number;
  human: number;
  automated: number;
  bounced: number;
  uncertain: number;
  other: number;
  byIntent: { intent: HumanIntent; count: number }[];
}

export function summarizeReplies(replies: ReplyRecord[]): ReplySummary {
  const counts: Record<ReplyGroup, number> = {
    interested: 0, question: 0, resend_request: 0, referred: 0, maybe: 0, not_interested: 0, wrong_person: 0,
    stop: 0, automated: 0, bounced: 0, uncertain: 0, other: 0,
  };
  for (const r of replies) {
    const g = replyGroup(r.intent);
    if (g) counts[g] += 1;
  }
  const byIntent = HUMAN_INTENTS.map((intent) => ({ intent, count: counts[intent] }));
  const human = byIntent.reduce((a, b) => a + b.count, 0);
  return {
    total: replies.length,
    human,
    automated: counts.automated,
    bounced: counts.bounced,
    uncertain: counts.uncertain,
    other: counts.other,
    byIntent,
  };
}

export function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

export function snippet(body: string | null, max = 120): string {
  const flat = (body ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// Which replies a pie slice / stat block selects. null = every real reply.
export function filterReplies(replies: ReplyRecord[], selected: ReplyGroup | null): ReplyRecord[] {
  return replies.filter((r) => {
    const g = replyGroup(r.intent);
    if (selected === null) return g !== null && !['automated', 'bounced', 'uncertain', 'other'].includes(g);
    return g === selected;
  });
}
