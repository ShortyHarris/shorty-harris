// Scrape status for a campaign row, shared by the admin and client Campaigns pages so both
// describe a campaign's search the same way. Pure functions only; the chip and the client's
// breakdown window live in components/.

export interface ScrapeSummary {
  total_scraped: number;
  total_with_email: number;
  skipped_dnc: number;
  skipped_duplicate: number;
  new_prospects: number;
}

export interface ScrapeFields {
  scrape_status: string | null;
  scrape_started_at: string | null;
  last_scraped_at: string | null;
  last_scrape_summary: ScrapeSummary | null;
  prospectCount: number;
}

// A scrape stuck in 'running' this long almost certainly means n8n crashed
// before it could write 'complete'/'failed' - treat it as failed in the UI
// (with a Retry) rather than showing "Scraping…" forever.
export const STALE_RUN_MS = 45 * 60 * 1000;

/** Queued for longer than this, a client is told it is taking longer than usual. */
export const QUEUE_DELAY_MS = 60 * 60 * 1000;

export function isStaleRun(scrapeStatus: string | null, scrapeStartedAt: string | null, now = Date.now()): boolean {
  return scrapeStatus === 'running' && !!scrapeStartedAt
    && now - new Date(scrapeStartedAt).getTime() > STALE_RUN_MS;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function lastScrapedLabel(c: Pick<ScrapeFields, 'last_scraped_at' | 'scrape_status' | 'scrape_started_at'>): string {
  if (c.scrape_status === 'running' && !isStaleRun(c.scrape_status, c.scrape_started_at)) {
    return c.scrape_started_at
      ? `Scraping since ${new Date(c.scrape_started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : 'Scraping…';
  }
  return c.last_scraped_at ? `Last scraped ${shortDate(c.last_scraped_at)}` : 'Never scraped';
}

// Turns the last scrape's result breakdown into a one-line summary, so
// "nothing new because it was all duplicates" reads differently from
// "nothing new because the scrape came up empty" - both are successful
// outcomes (tone: 'neutral'), distinct from an actual scrape failure.
export function scrapeSummaryLabel(
  c: Pick<ScrapeFields, 'scrape_status' | 'last_scrape_summary' | 'prospectCount'>,
): { text: string; tone: 'positive' | 'neutral' } {
  const s = c.last_scrape_summary;
  if (c.scrape_status !== 'complete' || !s) {
    return { text: `${c.prospectCount} prospect${c.prospectCount === 1 ? '' : 's'}`, tone: 'neutral' };
  }
  if (s.new_prospects > 0) {
    return { text: `${s.new_prospects} new prospect${s.new_prospects === 1 ? '' : 's'} added`, tone: 'positive' };
  }
  if (s.total_with_email === 0) {
    return { text: 'No results found for this search', tone: 'neutral' };
  }
  if (s.skipped_duplicate === s.total_with_email) {
    return { text: `0 new - all ${s.skipped_duplicate} already in your database`, tone: 'neutral' };
  }
  if (s.skipped_dnc === s.total_with_email) {
    return { text: '0 new - all matched your do-not-contact list', tone: 'neutral' };
  }
  return { text: `0 new - ${s.skipped_duplicate} already known, ${s.skipped_dnc} on do-not-contact list`, tone: 'neutral' };
}

// Short version for tight table/card space - the full sentence from
// scrapeSummaryLabel goes in the breakdown window instead of being truncated.
export function scrapeChipLabel(c: Pick<ScrapeFields, 'scrape_status' | 'last_scrape_summary' | 'prospectCount'>): string {
  const s = c.last_scrape_summary;
  if (c.scrape_status !== 'complete' || !s) {
    return `${c.prospectCount} prospect${c.prospectCount === 1 ? '' : 's'}`;
  }
  if (s.new_prospects > 0) return `+${s.new_prospects} new`;
  if (s.total_with_email === 0) return 'No results';
  if (s.skipped_duplicate === s.total_with_email) return '0 new · dupes';
  if (s.skipped_dnc === s.total_with_email) return '0 new · DNC';
  return '0 new · skipped';
}

/** One campaign's entry in the scrape queue, from client_campaign_queue_state. */
export interface QueueEntry {
  status: 'queued' | 'running';
  requested_at: string;
  started_at: string | null;
  /** Queued jobs requested before this one. Null while running. */
  ahead: number | null;
}

export type ClientScrapeState =
  | { kind: 'queued'; since: string; ahead: number | null }
  /** Queued for over an hour: something is holding the queue up. */
  | { kind: 'delayed'; since: string }
  | { kind: 'running'; since: string | null }
  | { kind: 'failed' }
  | { kind: 'done'; at: string }
  /** Launched but never searched, and not in the queue. */
  | { kind: 'never' };

/**
 * What a client's Campaigns page says about a campaign's search. The queue entry wins over
 * the campaign's own columns: a launched campaign is queued long before WF0 marks it running.
 */
export function clientScrapeState(
  c: Pick<ScrapeFields, 'scrape_status' | 'scrape_started_at' | 'last_scraped_at'>,
  queue: QueueEntry | undefined,
  now = Date.now(),
): ClientScrapeState {
  const stale = isStaleRun(c.scrape_status, c.scrape_started_at, now);
  if (queue?.status === 'running' || (c.scrape_status === 'running' && !stale)) {
    return { kind: 'running', since: queue?.started_at ?? c.scrape_started_at };
  }
  if (queue?.status === 'queued') {
    return now - new Date(queue.requested_at).getTime() > QUEUE_DELAY_MS
      ? { kind: 'delayed', since: queue.requested_at }
      : { kind: 'queued', since: queue.requested_at, ahead: queue.ahead };
  }
  if (c.scrape_status === 'failed' || stale) return { kind: 'failed' };
  if (c.last_scraped_at) return { kind: 'done', at: c.last_scraped_at };
  return { kind: 'never' };
}

/** Whether the page should keep checking for changes: something is waiting or searching. */
export function isInFlight(state: ClientScrapeState): boolean {
  return state.kind === 'queued' || state.kind === 'delayed' || state.kind === 'running';
}

/** "3 min ago", "2 h ago", or the date once it is more than a day old. */
export function sinceLabel(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `on ${shortDate(iso)}`;
}
