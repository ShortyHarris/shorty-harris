/**
 * Display mapping for campaigns.scrape_failure_reason.
 *
 * WF0 and WF13 write only the codes below. Keep all user-facing copy here so it
 * can change without a migration or a workflow edit. campaigns.scrape_error holds
 * the specific detail (including the scrape provider's own message) and should be
 * shown underneath as the technical line, not instead of this.
 */

export type ScrapeFailureReason =
  | 'apify_start_failed'
  | 'apify_run_failed'
  | 'apify_poll_timeout'
  | 'apify_fetch_failed'
  | 'import_failed'
  | 'stalled'
  | 'no_search_terms'
  | 'no_locations'
  | 'limits_exceeded'
  | 'unknown';

export interface ScrapeFailureCopy {
  /** Short status label, for the badge or table cell. */
  label: string;
  /** One sentence: what happened, in the client's language. */
  message: string;
  /** What to do about it. Null when there is nothing the user can do. */
  fix: string | null;
  /** Whether retrying unchanged has any chance of a different outcome. */
  retryable: boolean;
  /** true = the user can fix this; false = ours to fix. Drives whether we surface a support link. */
  userFixable: boolean;
}

export const SCRAPE_FAILURE_COPY: Record<ScrapeFailureReason, ScrapeFailureCopy> = {
  no_search_terms: {
    label: 'Missing search terms',
    message: 'This campaign has no search terms, so there was nothing to look for.',
    fix: 'Add 3 to 5 business types you want to reach, such as "dentist" or "law firm". Use business types, not job titles.',
    retryable: false,
    userFixable: true,
  },
  no_locations: {
    label: 'Missing locations',
    message: 'This campaign has no locations set.',
    fix: 'Add at least one city or area to search in.',
    retryable: false,
    userFixable: true,
  },
  limits_exceeded: {
    label: 'Campaign too large',
    message: 'This campaign asks for more than one run can cover.',
    fix: 'Use at most 5 search terms and 3 locations, and keep terms multiplied by locations at 10 or below. Every combination is scraped separately, so splitting into two campaigns is faster than one large one.',
    retryable: false,
    userFixable: true,
  },
  apify_poll_timeout: {
    label: 'Timed out',
    message: 'The search ran for 30 minutes without finishing, so it was stopped.',
    fix: 'Reduce the number of search terms or locations, then run it again. Anything already found has been kept and will not be scraped twice.',
    retryable: true,
    userFixable: true,
  },
  apify_run_failed: {
    label: 'Search failed',
    message: 'The business directory we search ended the run early.',
    fix: 'Try again. If it keeps failing, check the search terms for typos or unusual characters.',
    retryable: true,
    userFixable: true,
  },
  apify_start_failed: {
    label: 'Could not start',
    message: 'The search could not be started.',
    fix: 'Try again in a few minutes. This is usually a temporary problem on our side.',
    retryable: true,
    userFixable: false,
  },
  apify_fetch_failed: {
    label: 'Results unavailable',
    message: 'The search finished but the results could not be downloaded.',
    fix: 'Run it again. The results already found are reused, so the retry is quick.',
    retryable: true,
    userFixable: false,
  },
  import_failed: {
    label: 'Import failed',
    message: 'Businesses were found but could not be saved to your prospect list.',
    fix: 'Run it again. The scraped results are kept, so nothing is searched twice.',
    retryable: true,
    userFixable: false,
  },
  stalled: {
    label: 'Interrupted',
    message: 'The search stopped unexpectedly before it finished.',
    fix: 'Run it again. Anything already found has been saved and will be reused.',
    retryable: true,
    userFixable: false,
  },
  unknown: {
    label: 'Failed',
    message: 'The search failed for an unexpected reason.',
    fix: 'Try again. If it keeps happening, contact support and mention this campaign.',
    retryable: true,
    userFixable: false,
  },
};

/** Safe lookup: an unrecognised code from the database falls back to `unknown`. */
export function getScrapeFailureCopy(reason: string | null | undefined): ScrapeFailureCopy {
  if (!reason) return SCRAPE_FAILURE_COPY.unknown;
  return SCRAPE_FAILURE_COPY[reason as ScrapeFailureReason] ?? SCRAPE_FAILURE_COPY.unknown;
}

/**
 * Status text for a campaign row. Reads scrape_status first so a campaign that
 * failed once and later succeeded never shows a stale error: WF0 clears
 * scrape_failure_reason on both the start and the success paths.
 */
export function getScrapeStatusDisplay(campaign: {
  scrape_status: 'idle' | 'running' | 'complete' | 'failed';
  scrape_failure_reason?: string | null;
  scrape_error?: string | null;
  scrape_started_at?: string | null;
  scrape_attempt_count?: number | null;
}) {
  switch (campaign.scrape_status) {
    case 'running':
      return { tone: 'info' as const, label: 'Searching', detail: null, fix: null, retryable: false };
    case 'complete':
      return { tone: 'success' as const, label: 'Complete', detail: null, fix: null, retryable: false };
    case 'failed': {
      const copy = getScrapeFailureCopy(campaign.scrape_failure_reason);
      return {
        tone: 'error' as const,
        label: copy.label,
        detail: copy.message,
        // The raw provider message, for the expandable row or tooltip.
        technical: campaign.scrape_error ?? null,
        fix: copy.fix,
        retryable: copy.retryable,
        userFixable: copy.userFixable,
        // Three or more attempts means the suggested fix is not working.
        repeatedlyFailing: (campaign.scrape_attempt_count ?? 0) >= 3,
      };
    }
    default:
      return { tone: 'neutral' as const, label: 'Not started', detail: null, fix: null, retryable: false };
  }
}
