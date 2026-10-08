// Reply-intent grouping for the admin Analytics reply breakdown.
// "automated", "auto_reply" and "out_of_office" are the same thing to a reader
// (a machine answered), and "bounced" is a delivery failure, not a reply from
// a person - so only the HUMAN_INTENTS are shown as "real replies".

export const AUTOMATED_INTENTS = ['automated', 'auto_reply', 'out_of_office'] as const;
export const BOUNCED_INTENT = 'bounced';
export const HUMAN_INTENTS = ['interested', 'maybe', 'not_interested', 'wrong_person', 'stop'] as const;

export type HumanIntent = (typeof HUMAN_INTENTS)[number];
export type ReplyGroup = HumanIntent | 'automated' | 'bounced';

export const HUMAN_INTENT_LABEL: Record<HumanIntent, string> = {
  interested: 'Interested',
  maybe: 'Maybe',
  not_interested: 'Not interested',
  wrong_person: 'Wrong person',
  stop: 'Stop',
};

// Fixed order, one colour per intent (never repainted when a slice is empty).
// Checked with the dataviz palette validator: lightness band, chroma floor,
// colour-blind and normal-vision separation all pass. Amber is under 3:1
// against white, so every slice also carries a visible text label.
export const HUMAN_INTENT_COLOR: Record<HumanIntent, string> = {
  interested: '#168a5c',
  maybe: '#d99a00',
  not_interested: '#2f6fd0',
  wrong_person: '#c2418f',
  stop: '#d9532b',
};

export interface ReplyRecord {
  id: string;
  intent: string | null;
  body: string | null;
  at: string | null;
  prospectName: string;
}

export function replyGroup(intent: string | null): ReplyGroup | null {
  if (!intent) return null;
  if ((AUTOMATED_INTENTS as readonly string[]).includes(intent)) return 'automated';
  if (intent === BOUNCED_INTENT) return 'bounced';
  if ((HUMAN_INTENTS as readonly string[]).includes(intent)) return intent as HumanIntent;
  return null;
}

export interface ReplySummary {
  total: number;
  human: number;
  automated: number;
  bounced: number;
  byIntent: { intent: HumanIntent; count: number }[];
}

export function summarizeReplies(replies: ReplyRecord[]): ReplySummary {
  const counts: Record<ReplyGroup, number> = {
    interested: 0, maybe: 0, not_interested: 0, wrong_person: 0, stop: 0, automated: 0, bounced: 0,
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
    if (selected === null) return g !== null && g !== 'automated' && g !== 'bounced';
    return g === selected;
  });
}
