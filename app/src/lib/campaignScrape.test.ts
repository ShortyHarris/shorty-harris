import { describe, expect, it } from 'vitest';
import {
  QUEUE_DELAY_MS, STALE_RUN_MS, clientScrapeState, isInFlight, scrapeChipLabel, sinceLabel,
  type QueueEntry,
} from './campaignScrape';

const NOW = Date.parse('2026-11-28T17:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;

const idle = { scrape_status: 'idle', scrape_started_at: null, last_scraped_at: null };
const queued = (requestedAgo: number, ahead: number | null = 0): QueueEntry =>
  ({ status: 'queued', requested_at: ago(requestedAgo), started_at: null, ahead });

describe('clientScrapeState', () => {
  it('shows a launched campaign as queued, with its place in line', () => {
    expect(clientScrapeState(idle, queued(3 * MIN, 2), NOW)).toEqual({ kind: 'queued', since: ago(3 * MIN), ahead: 2 });
  });

  it('says it is taking longer than usual once queued for over an hour (the Nov 2026 outage)', () => {
    expect(clientScrapeState(idle, queued(QUEUE_DELAY_MS + MIN), NOW)).toEqual({ kind: 'delayed', since: ago(QUEUE_DELAY_MS + MIN) });
  });

  it('shows searching when the queue has started it, before WF0 marks the campaign running', () => {
    const entry: QueueEntry = { status: 'running', requested_at: ago(20 * MIN), started_at: ago(4 * MIN), ahead: null };
    expect(clientScrapeState(idle, entry, NOW)).toEqual({ kind: 'running', since: ago(4 * MIN) });
  });

  it('shows searching from the campaign itself when there is no queue entry', () => {
    const c = { scrape_status: 'running', scrape_started_at: ago(5 * MIN), last_scraped_at: null };
    expect(clientScrapeState(c, undefined, NOW)).toEqual({ kind: 'running', since: ago(5 * MIN) });
  });

  it('treats a search stuck running past the stale limit as failed', () => {
    const c = { scrape_status: 'running', scrape_started_at: ago(STALE_RUN_MS + MIN), last_scraped_at: null };
    expect(clientScrapeState(c, undefined, NOW)).toEqual({ kind: 'failed' });
  });

  it('a queued re-launch wins over an earlier failure', () => {
    const c = { scrape_status: 'failed', scrape_started_at: ago(2 * 24 * 60 * MIN), last_scraped_at: null };
    expect(clientScrapeState(c, queued(MIN), NOW).kind).toBe('queued');
    expect(clientScrapeState(c, undefined, NOW)).toEqual({ kind: 'failed' });
  });

  it('shows done with the date once scraped, and never-searched otherwise', () => {
    const done = { scrape_status: 'complete', scrape_started_at: ago(30 * MIN), last_scraped_at: ago(20 * MIN) };
    expect(clientScrapeState(done, undefined, NOW)).toEqual({ kind: 'done', at: ago(20 * MIN) });
    expect(clientScrapeState(idle, undefined, NOW)).toEqual({ kind: 'never' });
  });
});

describe('isInFlight', () => {
  it('keeps the page refreshing only while something is waiting or searching', () => {
    expect(isInFlight({ kind: 'queued', since: ago(MIN), ahead: 0 })).toBe(true);
    expect(isInFlight({ kind: 'delayed', since: ago(2 * QUEUE_DELAY_MS) })).toBe(true);
    expect(isInFlight({ kind: 'running', since: null })).toBe(true);
    expect(isInFlight({ kind: 'done', at: ago(MIN) })).toBe(false);
    expect(isInFlight({ kind: 'failed' })).toBe(false);
    expect(isInFlight({ kind: 'never' })).toBe(false);
  });
});

describe('sinceLabel', () => {
  it('reads as minutes, then hours, then a date', () => {
    expect(sinceLabel(ago(10 * 1000), NOW)).toBe('just now');
    expect(sinceLabel(ago(3 * MIN), NOW)).toBe('3 min ago');
    expect(sinceLabel(ago(150 * MIN), NOW)).toBe('3 h ago');
    expect(sinceLabel('2026-11-22T16:52:00Z', NOW)).toBe('on Nov 22');
  });
});

describe('scrapeChipLabel', () => {
  const summary = { total_scraped: 376, total_with_email: 197, skipped_dnc: 1, skipped_duplicate: 34, new_prospects: 147 };
  it('shows what the last search added', () => {
    expect(scrapeChipLabel({ scrape_status: 'complete', last_scrape_summary: summary, prospectCount: 147 })).toBe('+147 new');
  });
  it('falls back to the prospect count before any search has finished', () => {
    expect(scrapeChipLabel({ scrape_status: 'idle', last_scrape_summary: null, prospectCount: 0 })).toBe('0 prospects');
  });
});
