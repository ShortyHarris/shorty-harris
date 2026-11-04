// Plain-language wording for a prospect's sequence panel. Kept out of the component so
// the rules are testable: which status the header badge shows, and what the line under
// the sequence says about follow-ups that have not been written.

import type { SequenceStatus } from './pipelineStatus';

type StoppedBecause = 'they_replied_with_interest' | 'unsubscribed_or_bounced' | null | undefined;

// Pipeline outcomes that say more than "Replied, sequence stopped". A hot lead is the
// reason follow-ups stopped, so the badge should say that.
const OUTCOME_STATUSES = new Set(['hot_lead', 'won', 'lost', 'called']);
// Sequence statuses that must win even over an outcome: they are hard stops (or need a
// decision) and the client has to see them.
const OVERRIDING_SEQUENCE = new Set<SequenceStatus>(['unsubscribed', 'hard_bounce', 'needs_review']);

/** Which status the panel badge shows: a sequence status, or the pipeline status. */
export function panelBadgeSource(
  sequenceStatus: SequenceStatus | null,
  pipelineStatus: string,
): { kind: 'sequence'; status: SequenceStatus } | { kind: 'pipeline'; status: string } {
  if (sequenceStatus && OVERRIDING_SEQUENCE.has(sequenceStatus)) return { kind: 'sequence', status: sequenceStatus };
  if (OUTCOME_STATUSES.has(pipelineStatus)) return { kind: 'pipeline', status: pipelineStatus };
  if (sequenceStatus) return { kind: 'sequence', status: sequenceStatus };
  return { kind: 'pipeline', status: pipelineStatus };
}

/** The line under the sequence for follow-ups that do not exist yet. */
export function unwrittenFollowUpsText(
  count: number,
  opts: { stopped: boolean; stoppedBecause?: StoppedBecause; firstEmailSent: boolean },
): string {
  const s = count === 1 ? '' : 's';
  if (opts.stopped) {
    const why = opts.stoppedBecause === 'they_replied_with_interest'
      ? 'they replied with interest'
      : opts.stoppedBecause === 'unsubscribed_or_bounced'
        ? 'they unsubscribed or the email bounced'
        : 'follow-ups were stopped';
    return `No more follow-ups will be written, because ${why}.`;
  }
  if (opts.firstEmailSent) {
    return `${count} more follow-up${s} to come. Each is written a few business days after the email before it.`;
  }
  return `${count} follow-up${s} will be written after the first email sends.`;
}
