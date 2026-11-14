import { useEffect, useRef, useState } from 'react';
import { SandboxBadge } from './SandboxBadge';
import { StatusPill, PILL, type StatusPillStyle } from '../../components/StatusPill';
import { motion, AnimatePresence } from 'framer-motion';
import { describeReplyMatch, WEAK_MATCH_WARNING } from '../../lib/replyMatch';
import { ChevronRight, Info, X, Clock, MapPin, Building2, Sparkles, ArrowRight, MessageSquare, Trophy, XCircle, Bell, Check, RotateCw } from 'lucide-react';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import {
  useCampaigns, useAdminHotLeads, useClientsList,
  createCampaign, updateCampaign, getCampaignDeleteCounts, deleteCampaign,
  fetchScrapeSnapshots, fetchProspectCount, QK,
} from '../../hooks/useAdminData';
import type { AdminHotLead, CampaignRow, CampaignDeleteCounts } from '../../hooks/useAdminData';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { useToast, ToastHost } from '../../components/Toast';
import { MobileFab } from '../../components/MobileFab';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { SkeletonTable } from '../../components/Skeleton';
import { RowMenu, type MenuItem } from '../../components/RowMenu';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { LocationAreaInput } from '../../components/LocationAreaInput';
import { TargetingSummary } from '../../components/TargetingSummary';
import { WizardRolloutToggle } from '../../components/WizardRolloutToggle';
import { campaignStatusLabel } from '../../lib/campaignStatus';
import { SuggestForMe } from '../client/Campaigns';
import { TagInput } from '../../components/TagInput';
import { LimitCounter, LimitMessages } from '../../components/LimitCounter';
import { useCampaignLimits } from '../../hooks/useClientIcp';
import { getActiveCampaignLimits, validateCampaignLimits } from '../../lib/campaignLimits';
import { areasToLocationLabels, campaignAreas, joinedLocationsError, type TargetArea } from '../../lib/targetAreas';
import { getScrapeStatusDisplay } from '../../lib/scrapeFailures';
import { useCountrySendHolds } from '../../hooks/useCountrySendHolds';
import { CountryHoldBanner, EuBadge } from '../../components/CountryHoldBanner';
import { COUNTRY_OPTIONS, countryName, defaultCampaignCountry, findCountryHold, isEuCountry } from '../../lib/countries';
import { RequiredMark } from '../../components/RequiredMark';
import { FollowUpsNowToggle } from '../../components/FollowUpsNowToggle';
import { queryClient } from '../../lib/queryClient';
import { confirmDiscard } from '../../lib/confirmDiscard';
import { enqueueCampaign, queuedMessage } from '../../lib/scrapeEnqueue';
import { useDiscoveryQueue, markCampaignQueued, type ActiveQueueState } from '../../hooks/useDiscoveryQueue';

const HELP_CAMPAIGNS: HelpContent = {
  title: 'Campaigns',
  body: [
    { type: 'p', text: "Each campaign belongs to a client and controls who gets targeted and how. The search terms and target locations tell the scraper where to find new prospects." },
    { type: 'p', text: "A Needs setup badge means the campaign is missing search terms or locations - it won't find new prospects until those are filled in." },
    { type: 'ul', items: [
      "Edit - update campaign settings, search terms, or locations",
      "Pause / Activate - stop or resume outreach for this campaign",
      "Queue scrape - add a fresh prospect search to the queue. It starts within a few minutes and counts as a launch (5 free a month, then a credit); a failed scrape is refunded",
    ]},
  ],
};

const HELP_HOT_LEADS: HelpContent = {
  title: 'Hot Leads',
  body: [
    { type: 'p', text: "Prospects across all clients who replied to outreach with genuine buying interest. The AI reads their reply and routes serious ones here with a summary." },
    { type: 'p', text: "Each lead shows what the prospect said and a suggested next action. Update the status as the sales conversation progresses." },
  ],
};

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const CAMP_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  pending_review: { bg: 'var(--ad-purple-tint)', text: 'var(--ad-purple)' },
  draft:          { bg: 'var(--ad-fill)', text: 'var(--ad-ink-soft)', border: '1px solid var(--ad-line)' },
  active:         { bg: 'var(--ad-green-tint)', text: 'var(--ad-green)' },
  paused:         { bg: 'var(--ad-amber-tint)', text: 'var(--ad-amber)' },
  completed:      { bg: 'var(--ad-fill)', text: 'var(--ad-ink-faint)' },
  scheduled:      { bg: 'var(--ad-purple-tint)', text: 'var(--ad-purple)' },
  archived:       { bg: 'var(--ad-fill)', text: 'var(--ad-ink-faint)', border: '1px solid var(--ad-line)' },
};

const CAMP_STATUS_LABEL: Record<string, string> = {
  pending_review: 'In review',
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  scheduled: 'Scheduled',
  archived: 'Archived',
};

const LEAD_PILL: Record<string, StatusPillStyle> = {
  new:       { ...PILL.hot,     icon: 'zap' },
  viewed:    { ...PILL.ahead,   icon: 'circle' },
  contacted: { ...PILL.sent,    icon: 'send' },
  won:       { ...PILL.waiting, icon: 'check' },
  lost:      { ...PILL.closed,  icon: 'minus' },
};

const PAGE_SIZE = 10;

const LANGUAGE_OPTIONS = [
  'English', 'Czech', 'French', 'Spanish', 'Portuguese', 'German', 'Italian',
  'Dutch', 'Polish', 'Slovak', 'Arabic', 'Chinese', 'Swahili', 'Bemba', 'Nyanja',
];

/* Text input + datalist (combobox) - not a Select, since the admin should be
   able to type any language, not just pick from the suggestion list. */
function LanguageField({ value, onChange, listId }: { value: string; onChange: (v: string) => void; listId: string }) {
  return (
    <div>
      <label className="mb-2 block text-[14px] font-semibold text-(--ad-ink)" htmlFor={`${listId}-input`}>Outreach language<RequiredMark /></label>
      <input
        id={`${listId}-input`}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="English"
        style={FONT}
        className="h-12 w-full rounded-xl border border-(--ad-line) bg-(--ad-surface) px-4 text-[15px] text-(--ad-ink) outline-none transition-colors placeholder:text-(--ad-ink-ghost) focus:border-(--ad-green)"
      />
      <datalist id={listId}>
        {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l} />)}
      </datalist>
      <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-(--ad-ink-faint)">Messages and follow-ups are written in this language.</p>
    </div>
  );
}

/* ── Ghost / primary button helpers ───────────────────────────────── */
const ghostCls = 'cursor-pointer whitespace-nowrap rounded-xl border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-line-strong) hover:bg-(--ad-surface-2)';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-green) px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-(--ad-green-hover) disabled:opacity-50';

/* ── Pagination ────────────────────────────────────────────────────── */
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-(--ad-line) px-4 py-3 text-[12.5px] text-(--ad-ink-faint)">
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="cursor-pointer rounded-lg border border-(--ad-line-strong) bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-(--ad-ink) transition-colors hover:bg-(--ad-surface-2) disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="cursor-pointer rounded-lg border border-(--ad-line-strong) bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-(--ad-ink) transition-colors hover:bg-(--ad-surface-2) disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

// A scrape stuck in 'running' this long almost certainly means n8n crashed
// before it could write 'complete'/'failed' - treat it as failed in the UI
// (with a Retry) rather than showing "Scraping…" forever.
const STALE_RUN_MS = 45 * 60 * 1000;

function isStaleRun(scrapeStatus: string, scrapeStartedAt: string | null): boolean {
  return scrapeStatus === 'running' && !!scrapeStartedAt
    && Date.now() - new Date(scrapeStartedAt).getTime() > STALE_RUN_MS;
}

function lastScrapedLabel(c: Pick<CampaignRow, 'last_scraped_at' | 'scrape_status' | 'scrape_started_at'>): string {
  if (c.scrape_status === 'running' && !isStaleRun(c.scrape_status, c.scrape_started_at)) {
    return c.scrape_started_at
      ? `Scraping since ${new Date(c.scrape_started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : 'Scraping…';
  }
  return c.last_scraped_at
    ? `Last scraped ${new Date(c.last_scraped_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Never scraped';
}

// Turns the last scrape's result breakdown into a one-line summary, so
// "nothing new because it was all duplicates" reads differently from
// "nothing new because the scrape came up empty" - both are successful
// outcomes (tone: 'neutral'), distinct from an actual scrape failure, which
// ScrapeCell already renders separately in red with a retry affordance.
function scrapeSummaryLabel(
  c: Pick<CampaignRow, 'scrape_status' | 'last_scrape_summary' | 'prospectCount'>,
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
// scrapeSummaryLabel goes in ScrapeSummaryModal instead of being truncated.
function scrapeChipLabel(c: Pick<CampaignRow, 'scrape_status' | 'last_scrape_summary' | 'prospectCount'>): string {
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

// Compact chip shown in the table/card - tappable when there's a full
// breakdown behind it, so the one-line summary never has to be truncated
// to fit a narrow column; the detail lives in ScrapeSummaryModal instead.
function ScrapeResultChip({ campaign, onOpenDetail }: { campaign: CampaignRow; onOpenDetail: () => void }) {
  const sr = scrapeSummaryLabel(campaign);
  const hasDetail = campaign.scrape_status === 'complete' && !!campaign.last_scrape_summary;
  const toneCls = sr.tone === 'positive' ? 'bg-(--ad-green-tint) text-(--ad-green)' : 'bg-(--ad-fill) text-(--ad-ink-soft)';
  if (!hasDetail) {
    return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${toneCls}`}>{scrapeChipLabel(campaign)}</span>;
  }
  return (
    <button
      // Rows/cards open Edit campaign on click - don't let this bubble up
      // and stack that modal under the scrape breakdown.
      onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
      title="View full scrape breakdown"
      className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold transition-opacity hover:opacity-75 ${toneCls}`}
    >
      {scrapeChipLabel(campaign)}
      <Info size={11} strokeWidth={2.5} className="opacity-60" />
    </button>
  );
}

/* ── Scrape result detail modal ───────────────────────────────────────
   Handles both outcomes behind one click target: a completed scrape's
   result breakdown, and a failed/stalled scrape's full failure detail
   (message, suggested fix, raw technical error) plus its action -
   everything the table-row cells only hint at via a compact badge. */
function ScrapeSummaryModal({
  campaign, onClose, onScrape, onEditCampaign,
}: {
  campaign: CampaignRow; onClose: () => void; onScrape: () => void; onEditCampaign: () => void;
}) {
  const stale = isStaleRun(campaign.scrape_status, campaign.scrape_started_at);
  const failed = campaign.scrape_status === 'failed' || stale;

  if (failed) {
    const display = getScrapeStatusDisplay({
      scrape_status: 'failed',
      scrape_failure_reason: stale ? 'stalled' : campaign.scrape_failure_reason,
      scrape_error: stale ? null : campaign.scrape_error,
      scrape_attempt_count: campaign.scrape_attempt_count,
    });
    const d = display as Extract<ReturnType<typeof getScrapeStatusDisplay>, { technical?: unknown }>;

    return (
      <CampModalShell onClose={onClose}>
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <h2 className="m-0 text-[16px] font-semibold text-(--ad-ink)">Scrape failed</h2>
          <button onClick={onClose} aria-label="Close" className="flex cursor-pointer items-center border-0 bg-transparent p-1 text-(--ad-ink-faint) hover:text-(--ad-ink)"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <p className="m-0 truncate text-[13px] text-(--ad-ink-faint)" title={campaign.name}>{campaign.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="m-0 text-[15px] font-semibold text-(--ad-clay)">{d.label}</p>
              {d.repeatedlyFailing && (
                <span
                  title={`Failed ${campaign.scrape_attempt_count} times in a row`}
                  className="inline-flex items-center rounded-full bg-(--ad-clay) px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[.04em] text-(--ad-surface)"
                >
                  Repeated
                </span>
              )}
            </div>
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-(--ad-ink-soft)">{d.detail}</p>
          {d.fix && (
            <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface-2) px-4 py-3.5">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">Suggested fix</p>
              <p className="m-0 mt-1 text-[13px] leading-relaxed text-(--ad-ink)">{d.fix}</p>
            </div>
          )}
          {d.technical && (
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">Technical detail</p>
              <p className="m-0 mt-1 break-words text-[12px] leading-relaxed text-(--ad-ink-faint)">{d.technical}</p>
            </div>
          )}
          <p className="m-0 text-[11px] text-(--ad-ink-faint)">{lastScrapedLabel(campaign)}</p>
        </div>
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex gap-2.5">
          <button onClick={onClose} className={`${ghostCls} flex-1`}>Close</button>
          {d.retryable ? (
            <button onClick={() => { onScrape(); onClose(); }} className={`${primaryCls} flex-1`}>Queue a retry</button>
          ) : (
            <button onClick={() => { onEditCampaign(); onClose(); }} className={`${primaryCls} flex-1`}>Edit campaign</button>
          )}
        </div>
      </CampModalShell>
    );
  }

  const sr = scrapeSummaryLabel(campaign);
  const s  = campaign.last_scrape_summary;
  const rows = s ? [
    ['Businesses scraped', s.total_scraped],
    ['With a usable email', s.total_with_email],
    ['Already in your database', s.skipped_duplicate],
    ['On do-not-contact list', s.skipped_dnc],
    ['New prospects added', s.new_prospects],
  ] as const : [];

  return (
    <CampModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
        <h2 className="m-0 text-[16px] font-semibold text-(--ad-ink)">Scrape results</h2>
        <button onClick={onClose} aria-label="Close" className="flex cursor-pointer items-center border-0 bg-transparent p-1 text-(--ad-ink-faint) hover:text-(--ad-ink)"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div>
          <p className="m-0 truncate text-[13px] text-(--ad-ink-faint)" title={campaign.name}>{campaign.name}</p>
          <p className={`m-0 mt-1 text-[15px] font-semibold ${sr.tone === 'positive' ? 'text-(--ad-green)' : 'text-(--ad-ink)'}`}>{sr.text}</p>
        </div>
        {rows.length > 0 && (
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-(--ad-fill) pt-4">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">{label}</dt>
                <dd className="m-0 mt-0.5 text-[17px] font-semibold text-(--ad-ink)">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="m-0 text-[11px] text-(--ad-ink-faint)">{lastScrapedLabel(campaign)}</p>
      </div>
      <div className="shrink-0 border-t border-(--ad-line) px-5 py-4">
        <button onClick={onClose} className="w-full cursor-pointer rounded-xl border-0 bg-(--ad-green) px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-(--ad-green-hover)">
          Close
        </button>
      </div>
    </CampModalShell>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
// A scrape is launched by queueing it through the wf0-enqueue gate (see lib/scrapeEnqueue.ts), which
// enforces the prospect limit, the free-launch limit and the credit charge. The worker (wf0-discover)
// is only ever called by the dispatcher, never from here. Whether a campaign is queued is read from
// discovery_queue (useDiscoveryQueue); progress and completion come from scrape_status on the
// campaigns row (see the polling effect below).

// How often to re-check scrape_status/last_scraped_at while any campaign is
// actively scraping - stops the moment none are, rather than polling forever.
const SCRAPE_POLL_MS = 17000;

export function Campaigns() {
  const { rows, loading, isFetching, dataUpdatedAt, error, reload, setStatus, patchCampaign } = useCampaigns();
  const { holds } = useCountrySendHolds();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh campaigns.');
  async function changeStatus(c: CampaignRow, status: 'active' | 'paused') {
    const wasReview = c.needsReview;
    const { error: err } = await setStatus(c.id, status);
    if (err) { toast(`Couldn't update "${c.name}": ${err}`, 'error'); return; }
    toast(wasReview ? `"${c.name}" approved and activated.` : status === 'paused' ? `"${c.name}" paused.` : `"${c.name}" activated.`);
  }
  // Everything a row can do besides its one inline action (Approve / Queue
  // scrape) - the same list on desktop and mobile.
  function campaignMenu(c: CampaignRow): MenuItem[] {
    const active = c.status === 'active';
    const paused = c.status === 'paused';
    return [
      { type: 'action', label: 'Edit campaign', onClick: () => setEditCampaign(c) },
      ...(c.needsReview ? [{ type: 'action' as const, label: 'Approve and activate', onClick: () => changeStatus(c, 'active') }] : []),
      ...(active || paused ? [{
        type: 'action' as const,
        label: active ? 'Pause campaign' : 'Activate campaign',
        onClick: () => changeStatus(c, active ? 'paused' : 'active'),
      }] : []),
      { type: 'separator' },
      { type: 'action', label: 'Delete campaign', destructive: true, onClick: () => setDeleteCampaignTarget(c) },
    ];
  }
  const [showNew, setShowNew]         = useState(false);
  const [editCampaign, setEditCampaign]     = useState<CampaignRow | null>(null);
  const [deleteCampaignTarget, setDeleteCampaignTarget] = useState<CampaignRow | null>(null);
  const [scrapeDetailCampaign, setScrapeDetailCampaign] = useState<CampaignRow | null>(null);
  const [page, setPage]               = useState(1);

  // Campaigns with a scrape job waiting or running, read from discovery_queue so a page refresh
  // does not turn a queued campaign back into an idle one.
  const { queue, ahead, error: queueError } = useDiscoveryQueue();
  // Campaign IDs whose enqueue request is in flight. UX only (stops a double click); the real guard
  // is the one-active-job-per-campaign unique index, which rejects a second launch server-side.
  const [submitting, setSubmitting] = useState<ReadonlySet<string>>(new Set());

  async function handleScrape(campaignId: string) {
    if (submitting.has(campaignId) || queue[campaignId]) return;
    const name = rows.find((r) => r.id === campaignId)?.name ?? 'Campaign';
    setSubmitting((s) => new Set(s).add(campaignId));
    try {
      const result = await enqueueCampaign(campaignId);
      switch (result.kind) {
        case 'queued':
          markCampaignQueued(campaignId);
          toast(queuedMessage(name, result.positionAhead));
          break;
        case 'already_queued':
          markCampaignQueued(campaignId); // the refetch shows whether it is queued or already running
          toast(`"${name}": ${result.message}`, 'warning');
          break;
        case 'limit_reached':
        case 'launch_limit_reached':
          toast(`"${name}": ${result.message}`, 'warning');
          break;
        case 'error':
          toast(`Couldn't queue "${name}": ${result.message}`, 'error');
          break;
      }
      // A refused or failed enqueue is not a failed scrape, so the campaign's own scrape_status is left alone.
    } finally {
      setSubmitting((s) => { const next = new Set(s); next.delete(campaignId); return next; });
    }
  }

  // Always-current view of rows and the queue for the interval callback below, so it never
  // closes over a stale list of "which campaigns are in flight".
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const queueRef = useRef<ActiveQueueState>(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // In flight = scraping now, or waiting in the queue (it will start without any click).
  const isInFlight = (r: CampaignRow, q: ActiveQueueState) =>
    (r.scrape_status === 'running' && !isStaleRun(r.scrape_status, r.scrape_started_at)) || !!q[r.id];
  const anyRunning = rows.some((r) => isInFlight(r, queue));

  useEffect(() => {
    if (!anyRunning) return;

    async function tick() {
      const runningIds = rowsRef.current
        .filter((r) => isInFlight(r, queueRef.current))
        .map((r) => r.id);
      if (runningIds.length === 0) return;

      let snapshots;
      try {
        snapshots = await fetchScrapeSnapshots(runningIds);
      } catch {
        return; // transient fetch error - just try again on the next tick
      }

      for (const snap of snapshots) {
        if (snap.scrape_status === rowsRef.current.find((r) => r.id === snap.id)?.scrape_status
          && snap.last_scraped_at === rowsRef.current.find((r) => r.id === snap.id)?.last_scraped_at) {
          continue; // nothing changed for this row - skip the render
        }
        patchCampaign(snap.id, {
          scrape_status: snap.scrape_status,
          scrape_started_at: snap.scrape_started_at,
          scrape_error: snap.scrape_error,
          scrape_failure_reason: snap.scrape_failure_reason,
          scrape_attempt_count: snap.scrape_attempt_count,
          scrape_finished_at: snap.scrape_finished_at,
          last_scraped_at: snap.last_scraped_at,
          last_scrape_summary: snap.last_scrape_summary,
        });
        if (snap.scrape_status === 'complete') {
          fetchProspectCount(snap.id).then((prospectCount) => patchCampaign(snap.id, { prospectCount }));
        }
      }
    }

    tick(); // don't wait a full interval for the first check
    const id = setInterval(tick, SCRAPE_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyRunning]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // One banner per held country that at least one campaign targets.
  const heldGroups = holds
    .map((h) => ({ hold: h, campaigns: rows.filter((c) => findCountryHold([h], c.country)) }))
    .filter((g) => g.campaigns.length > 0);

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="page-header flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-(--ad-ink)"><img src="https://cdn-icons-png.flaticon.com/128/6745/6745021.png" alt="Campaigns" className="w-10 h-10" />Campaigns</h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">{rows.length} campaigns across all clients</p>
          {queueError && (
            <p className="m-0 mt-1 text-[12px] text-(--ad-clay)">
              Couldn't read the scrape queue ({queueError}); queued scrapes may show as idle. Don't re-queue a campaign you just queued.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
          <HelpButton content={HELP_CAMPAIGNS} />
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
          <button onClick={() => setShowNew(true)} className={`${primaryCls} hidden md:inline-flex`}>+ New campaign</button>
        </div>
      </header>

      <WizardRolloutToggle onChanged={(message, tone) => toast(message, tone)} />

      {heldGroups.map(({ hold, campaigns }) => (
        <CountryHoldBanner
          key={hold.country}
          reason={hold.reason}
          context={`${countryName(hold.country)}: ${campaigns.map((c) => c.name).join(', ')}`}
        />
      ))}

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={6} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-semibold text-(--ad-ink)">No campaigns yet.</strong>
        </div>
      ) : (
        <>
          {/* Desktop table - hidden on mobile. Every row is the same height
              however many search terms or areas a campaign has: targeting is a
              two-line summary (full list in a popover), each row has at most
              one inline action, and the rest live in the row menu. */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              {/* Prospects / Status / Scrape hold pills and a button, so they get
                  fixed widths that never wrap; Campaign and Client share the rest.
                  Below xl the Client column folds into the Campaign cell. */}
              <colgroup>
                <col className="w-[60%]" />
                <col className="hidden w-[40%] xl:table-column" />
                <col className="w-[130px]" />
                <col className="w-[156px]" />
                <col className="w-[164px]" />
                <col className="w-[52px]" />
              </colgroup>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th className="hidden xl:table-cell">Client</th>
                  <th>Prospects</th>
                  <th>Status</th>
                  <th>Scrape</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => (
                  <tr key={c.id} onClick={() => setEditCampaign(c)} className="group cursor-pointer">
                    <td className="min-w-0">
                      <div className="truncate font-semibold leading-snug text-(--ad-ink) group-hover:underline" title={c.name}>{c.name}</div>
                      <div className="truncate text-[12px] text-(--ad-ink-soft) xl:hidden">{c.client?.business_name ?? '-'}</div>
                      <CampaignBadges campaign={c} />
                      <div className="mt-1.5">
                        <TargetingSummary terms={c.search_queries} areas={campaignAreas(c)} />
                      </div>
                    </td>
                    <td className="hidden min-w-0 text-(--ad-ink-soft) xl:table-cell">
                      <div className="truncate" title={c.client?.business_name ?? undefined}>{c.client?.business_name ?? '-'}</div>
                    </td>
                    <td className="min-w-0">
                      <ScrapeResultChip campaign={c} onOpenDetail={() => setScrapeDetailCampaign(c)} />
                    </td>
                    <td onClick={c.needsReview ? (e) => e.stopPropagation() : undefined}>
                      {c.needsReview ? (
                        <ApproveButton onClick={() => changeStatus(c, 'active')} />
                      ) : (
                        <StatusPill pill={CAMP_PILL[c.status] ?? CAMP_PILL.draft}>
                          {campaignStatusLabel(c.status, c.prospectCount, CAMP_STATUS_LABEL)}
                        </StatusPill>
                      )}
                    </td>
                    <td className="min-w-0" onClick={(e) => e.stopPropagation()}>
                      <ScrapeCell
                        campaign={c}
                        queueState={queue[c.id]}
                        ahead={ahead[c.id]}
                        busy={submitting.has(c.id)}
                        onScrape={() => handleScrape(c.id)}
                        onOpenDetail={() => setScrapeDetailCampaign(c)}
                      />
                      <div className="mt-1 truncate text-[11px] text-(--ad-ink-faint)">{lastScrapedLabel(c)}</div>
                    </td>
                    <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <RowMenu items={campaignMenu(c)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards - shown below md */}
          <div className="md:hidden flex flex-col gap-3">
            {paged.map((c) => {
              const pill = CAMP_PILL[c.status] ?? CAMP_PILL.draft;
              return (
                <div
                  key={c.id}
                  onClick={() => setEditCampaign(c)}
                  className="cursor-pointer rounded-xl border border-(--ad-line) bg-(--ad-surface) p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 min-w-0 font-semibold leading-snug text-(--ad-ink) text-[14px]" title={c.name}>{c.name}</span>
                    <StatusPill pill={pill} className="shrink-0">
                      {campaignStatusLabel(c.status, c.prospectCount, CAMP_STATUS_LABEL)}
                    </StatusPill>
                  </div>
                  <CampaignBadges campaign={c} />
                  <p className="m-0 mt-1.5 truncate text-[12px] text-(--ad-ink-soft)">
                    {c.client?.business_name ?? '-'} · {c.channel} · {c.language}
                  </p>
                  <div className="mt-2">
                    <TargetingSummary terms={c.search_queries} areas={campaignAreas(c)} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <ScrapeResultChip campaign={c} onOpenDetail={() => setScrapeDetailCampaign(c)} />
                    <span className="truncate text-[11px] text-(--ad-ink-faint)">{lastScrapedLabel(c)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-(--ad-fill) pt-3" onClick={(e) => e.stopPropagation()}>
                    {c.needsReview && <ApproveButton onClick={() => changeStatus(c, 'active')} />}
                    <ScrapeCell
                      campaign={c}
                      queueState={queue[c.id]}
                      ahead={ahead[c.id]}
                      busy={submitting.has(c.id)}
                      onScrape={() => handleScrape(c.id)}
                      onOpenDetail={() => setScrapeDetailCampaign(c)}
                    />
                    <div className="ml-auto">
                      <RowMenu items={campaignMenu(c)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination - below both desktop table and mobile cards */}
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {/* Mobile FAB - replaces the header button on small screens */}
      <MobileFab onClick={() => setShowNew(true)} label="New campaign" />

      <AnimatePresence>
        {showNew && (
          <NewCampaignModal
            key="new-campaign-modal"
            onClose={() => setShowNew(false)}
            onCreated={() => { setShowNew(false); toast('Campaign created.'); reload(); }}
          />
        )}
        {editCampaign && (
          <EditCampaignModal
            key={`edit-camp-${editCampaign.id}`}
            campaign={editCampaign}
            hold={findCountryHold(holds, editCampaign.country)}
            onClose={() => setEditCampaign(null)}
            onSaved={() => { setEditCampaign(null); toast('Campaign updated.'); reload(); }}
          />
        )}
        {deleteCampaignTarget && (
          <DeleteCampaignModal
            key={`del-camp-${deleteCampaignTarget.id}`}
            campaign={deleteCampaignTarget}
            onClose={() => setDeleteCampaignTarget(null)}
            onDeleted={() => { setDeleteCampaignTarget(null); toast('Campaign deleted.'); reload(); }}
          />
        )}
        {scrapeDetailCampaign && (
          <ScrapeSummaryModal
            key={`scrape-detail-${scrapeDetailCampaign.id}`}
            campaign={scrapeDetailCampaign}
            onClose={() => setScrapeDetailCampaign(null)}
            onScrape={() => handleScrape(scrapeDetailCampaign.id)}
            onEditCampaign={() => setEditCampaign(scrapeDetailCampaign)}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/* ── Row badges ────────────────────────────────────────────────────── */
// EU / awaiting approval / needs setup on one wrapping line under the name,
// instead of one stacked line each.
function CampaignBadges({ campaign: c }: { campaign: CampaignRow }) {
  const needsSetup = c.search_queries.length === 0 || c.target_locations.length === 0;
  if (!isEuCountry(c.country) && !c.needsReview && !needsSetup) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {isEuCountry(c.country) && <EuBadge />}
      {c.needsReview && (
        <span className="inline-flex items-center gap-1 rounded-full bg-(--ad-purple-tint) px-2 py-0.5 text-[11px] font-semibold text-(--ad-purple)">
          <Bell size={11} strokeWidth={2.5} />
          Awaiting approval
        </span>
      )}
      {needsSetup && <StatusPill pill={{ ...PILL.waiting, icon: 'alert' }}>Needs setup</StatusPill>}
    </div>
  );
}

function ApproveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border-0 bg-(--ad-green) px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-(--ad-green-hover)"
    >
      <Check size={12} strokeWidth={2.75} />
      Approve
    </button>
  );
}

/* ── Scrape cell ───────────────────────────────────────────────────── */
// States map directly to the campaigns.scrape_status column - there's no
// client-only "just triggered" state anymore beyond the optimistic patch in
// handleScrape, and no local "just completed" result payload either (WF0
// no longer returns scrape counts synchronously - see startDiscoverScrape).
// 'idle' and 'complete' render identically: a plain Run-scrape affordance,
// since prospect counts already show in their own table column.
//
// A stale 'running' row (isStaleRun) is folded into the 'stalled' failure
// reason here rather than invented as a new local string, so
// getScrapeStatusDisplay stays the single source of truth for scrape-status
// copy - see scrapeFailures.ts.
//
// Failure detail (message, fix, raw technical error, repeated-failure flag)
// lives behind a click into ScrapeSummaryModal, not inline - this cell is
// just a compact badge so the row stays scannable; Retry/Edit campaign are
// the modal's actions, not duplicated here.
function ScrapeCell({
  campaign,
  queueState,
  ahead,
  busy = false,
  onScrape,
  onOpenDetail,
}: {
  campaign: Pick<CampaignRow, 'scrape_status' | 'scrape_started_at' | 'scrape_error' | 'scrape_failure_reason' | 'scrape_attempt_count'>;
  /** From discovery_queue: a job is waiting ('queued') or being worked ('running'). */
  queueState?: 'queued' | 'running';
  /** Queued jobs requested before this one; undefined until the queue has been read. */
  ahead?: number;
  /** The enqueue request is in flight. */
  busy?: boolean;
  onScrape: () => void;
  onOpenDetail: () => void;
}) {
  const stale = isStaleRun(campaign.scrape_status, campaign.scrape_started_at);

  if (queueState === 'queued' && campaign.scrape_status !== 'running') {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-(--ad-ink-soft)"
        title="Waiting in the queue. The scraper picks up one job at a time, every few minutes."
      >
        <Clock size={12} strokeWidth={2.5} />
        Queued{ahead === undefined ? '' : ahead === 0 ? ' · next' : ` · ${ahead} ahead`}
      </span>
    );
  }

  if ((campaign.scrape_status === 'running' && !stale) || queueState === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-(--ad-ink-faint)">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-(--ad-line-strong) border-t-(--ad-green)" />
        Searching
      </span>
    );
  }

  if (campaign.scrape_status === 'failed' || stale) {
    const display = getScrapeStatusDisplay({
      scrape_status: 'failed',
      scrape_failure_reason: stale ? 'stalled' : campaign.scrape_failure_reason,
      scrape_error: stale ? null : campaign.scrape_error,
      scrape_attempt_count: campaign.scrape_attempt_count,
    });
    const d = display as Extract<ReturnType<typeof getScrapeStatusDisplay>, { technical?: unknown }>;

    return (
      <button
        onClick={onOpenDetail}
        title="View failure details"
        className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-(--ad-clay-tint) px-2 py-0.5 text-[11.5px] font-semibold text-(--ad-clay) transition-opacity hover:opacity-75"
      >
        {d.label}
        {d.repeatedlyFailing && <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--ad-clay)" title={`Failed ${campaign.scrape_attempt_count} times in a row`} />}
        <Info size={11} strokeWidth={2.5} className="opacity-60" />
      </button>
    );
  }

  return (
    <button
      onClick={onScrape}
      disabled={busy}
      title="Adds this campaign to the scrape queue. Counts as a launch: 5 free a month, then a credit."
      className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-(--ad-line) bg-(--ad-surface) px-2.5 py-1 text-[11px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-green) hover:text-(--ad-green) whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RotateCw size={11} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} />
      {busy ? 'Queuing…' : 'Queue scrape'}
    </button>
  );
}

/* ── Campaign window ───────────────────────────────────────────────────
   The admin's New / Edit campaign windows share the client Campaign
   window's layout: a calm centred card (full screen on a phone), a status
   line, the campaign name as the title, one sentence on what to do next,
   underline tabs, and a footer that says whether anything is unsaved. */
type WinTab = 'who' | 'settings';

const winLabel = 'mb-2 block text-[14px] font-semibold text-(--ad-ink)';
const winHelp = 'm-0 mt-1.5 text-[12.5px] leading-relaxed text-(--ad-ink-faint)';
const winInput = 'h-12 w-full rounded-xl border border-(--ad-line) bg-(--ad-surface) px-4 text-[15px] text-(--ad-ink) outline-none transition-colors placeholder:text-(--ad-ink-ghost) focus:border-(--ad-green)';
const winSelect = 'h-12 rounded-xl border-(--ad-line) bg-(--ad-surface) px-4 text-[15px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)';
const winGhost = 'h-11 cursor-pointer rounded-xl border-0 bg-transparent px-4 text-[14px] font-semibold text-(--ad-ink-soft) transition-colors hover:bg-(--ad-surface-2) hover:text-(--ad-ink) disabled:opacity-50';
const winPrimary = 'h-11 cursor-pointer rounded-xl border-0 bg-(--ad-green) px-6 text-[14px] font-semibold text-white transition-colors hover:bg-(--ad-green-hover) disabled:cursor-not-allowed disabled:opacity-50';

function CampaignWindow({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-[rgba(14,8,34,0.45)] md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.div
        style={FONT} role="dialog" aria-modal="true" aria-label={label}
        className="flex h-full w-full flex-col overflow-hidden bg-(--ad-surface) text-(--ad-ink) md:h-[min(880px,calc(100vh-48px))] md:max-w-[760px] md:rounded-2xl md:border md:border-(--ad-line)"
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function WindowHeader({
  eyebrow, title, hint, tab, onTab, dots, onClose,
}: {
  eyebrow: React.ReactNode; title: string; hint: string; tab: WinTab; onTab: (t: WinTab) => void;
  dots: Partial<Record<WinTab, boolean>>; onClose: () => void;
}) {
  const tabs: [WinTab, string][] = [['who', 'Who & where'], ['settings', 'Settings']];
  return (
    <div className="shrink-0 px-6 pt-5 md:px-10 md:pt-7">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-(--ad-ink-faint)">{eyebrow}</span>
        <button
          type="button" onClick={onClose} aria-label="Close"
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-(--ad-surface-2) text-(--ad-ink-soft) transition-colors hover:bg-(--ad-line) hover:text-(--ad-ink)"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <h2 className="m-0 mt-2 text-[24px] font-semibold leading-tight tracking-tight text-balance md:text-[28px]">{title}</h2>
      <p className="m-0 mt-2 text-[15px] leading-relaxed text-(--ad-ink-soft)">{hint}</p>
      <div role="tablist" className="mt-5 flex gap-7 border-b border-(--ad-line)">
        {tabs.map(([value, label]) => {
          const active = tab === value;
          return (
            <button
              key={value} type="button" role="tab" aria-selected={active} onClick={() => onTab(value)}
              className={`relative -mb-px flex h-11 cursor-pointer items-center border-0 border-b-2 bg-transparent px-0 text-[14px] font-semibold transition-colors ${
                active ? 'border-(--ad-ink) text-(--ad-ink)' : 'border-transparent text-(--ad-ink-faint) hover:text-(--ad-ink)'
              }`}
            >
              {label}
              {dots[value] && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-(--ad-clay)" aria-label="needs attention" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WindowFooter({ status, children }: { status: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-(--ad-line) px-6 py-4 max-md:pb-[calc(16px+env(safe-area-inset-bottom,0px))] md:px-10">
      <span className="text-[13px] text-(--ad-ink-faint)" aria-live="polite">{status}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function WinSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6 border-t border-(--ad-line) pt-6 first:border-t-0 first:pt-0">
      <h3 className="m-0 text-[16px] font-semibold tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

function ChannelField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={winLabel}>Channel</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger style={FONT} className={winSelect}><SelectValue /></SelectTrigger>
        <SelectContent style={FONT} className="bg-(--ad-surface) text-[14px] text-(--ad-ink)">
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="sms">SMS</SelectItem>
          <SelectItem value="whatsapp">WhatsApp</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ScrapeSizeFields({
  maxResults, setMaxResults, scrapeEnabled, setScrapeEnabled, cap, errors,
}: {
  maxResults: number; setMaxResults: (n: number) => void; scrapeEnabled: boolean; setScrapeEnabled: (b: boolean) => void;
  cap: number; errors: ReturnType<typeof validateCampaignLimits>['errors'];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
      <div>
        <label className={winLabel} htmlFor="camp-max">Max results per run</label>
        <input id="camp-max" type="number" min={1} max={cap} value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} style={FONT} className={winInput} />
        <p className={winHelp}>Higher counts tend to yield more replies. Capped at {cap.toLocaleString()}.</p>
        <LimitMessages errors={errors} fields={['max_results']} />
      </div>
      <label className="flex h-12 cursor-pointer items-center gap-2.5 text-[14px] text-(--ad-ink) sm:mt-[30px]">
        <input type="checkbox" checked={scrapeEnabled} onChange={(e) => setScrapeEnabled(e.target.checked)} className="h-4 w-4 accent-(--ad-green)" />
        Scraping enabled
      </label>
    </div>
  );
}

const TARGET_FIELDS = ['search_queries', 'target_locations', 'pairs', 'max_results'];

/* ── New Campaign window ───────────────────────────────────────────── */
function NewCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const clients = useClientsList();
  const [tab, setTab] = useState<WinTab>('who');
  const [clientId, setClientId]         = useState('');
  const [name, setName]                 = useState('');
  const [channel, setChannel]           = useState('email');
  const [language, setLanguage]         = useState('English');
  // '' until the admin picks one; until then the selected client's country is the default.
  const [pickedCountry, setPickedCountry] = useState('');
  const country = pickedCountry || defaultCampaignCountry(clients.find((c) => c.id === clientId)?.country);
  const [queries, setQueries]           = useState<string[]>([]);
  const [areas, setAreas]                 = useState<TargetArea[]>([]);
  const [maxResults, setMaxResults]     = useState(() => getActiveCampaignLimits().maxResults);
  const [scrapeEnabled, setScrapeEnabled] = useState(true);
  const [saveAsDraft, setSaveAsDraft]   = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState<string | null>(null);
  const limits = useCampaignLimits(clientId);
  const check = validateCampaignLimits(
    { searchQueries: queries, locationCount: areas.length, maxResults, allowEmpty: saveAsDraft }, limits,
  );
  const dirty = !!(clientId || name || queries.length || areas.length);
  const close = () => { if (confirmDiscard(dirty)) onClose(); };

  async function submit() {
    if (!clientId || !name.trim()) { setTab('who'); setErr('Pick a client and enter a name.'); return; }
    if (!language.trim()) { setTab('settings'); setErr('Outreach language is required.'); return; }
    if (!country) { setTab('who'); setErr('Target country is required.'); return; }
    if (!check.valid) { setTab('who'); setErr(check.errors.map((e) => e.message).join(' ')); return; }
    const joinedError = joinedLocationsError(areas);
    if (joinedError) { setTab('who'); setErr(joinedError); return; }
    setBusy(true); setErr(null);
    const { error } = await createCampaign({
      client_id: clientId, name: name.trim(), channel, language: language.trim(), country,
      search_queries: queries,
      target_areas: areas,
      max_results: maxResults, scrape_enabled: scrapeEnabled,
      status: saveAsDraft ? 'draft' : 'active',
    });
    setBusy(false);
    if (error) setErr(error.message); else onCreated();
  }

  const clientName = clients.find((c) => c.id === clientId)?.business_name;
  const targetingOver = check.errors.some((e) => e.over && TARGET_FIELDS.includes(e.field));

  return (
    <CampaignWindow label="New campaign" onClose={close}>
      <WindowHeader
        eyebrow={<>New campaign{clientName && <> · <span className="truncate">{clientName}</span></>}</>}
        title={name.trim() || 'Untitled campaign'}
        hint={clientId ? 'Add what to search for and where, then create it.' : 'Pick the client first: their profile drives the suggestions and limits.'}
        tab={tab} onTab={setTab} dots={{ who: targetingOver }} onClose={close}
      />
      <div className="modal-scroll min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-10">
        {tab === 'who' ? (
          <div className="flex flex-col gap-8">
            <WinSection title="Campaign">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={winLabel}>Client<RequiredMark /></label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger style={FONT} className={winSelect}><SelectValue placeholder="Select a client…" /></SelectTrigger>
                    <SelectContent style={FONT} className="bg-(--ad-surface) text-[14px] text-(--ad-ink)">
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={winLabel}>Target country<RequiredMark /></label>
                  <Select value={country} onValueChange={setPickedCountry}>
                    <SelectTrigger style={FONT} aria-label="Target country" className={winSelect}><SelectValue placeholder="Select a country…" /></SelectTrigger>
                    <SelectContent style={FONT} className="bg-(--ad-surface) text-[14px] text-(--ad-ink)">
                      {COUNTRY_OPTIONS.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className={winHelp}>Can't be changed later. EU countries have extra outreach rules.</p>
                </div>
              </div>
              <div>
                <label className={winLabel} htmlFor="new-camp-name">Campaign name<RequiredMark /></label>
                <input id="new-camp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Austin gyms - Q3" style={FONT} className={winInput} />
              </div>
            </WinSection>
            <WinSection title="Who to find">
              {clientId ? (
                <SuggestForMe
                  key={clientId}
                  clientId={clientId}
                  queries={queries}
                  locations={areasToLocationLabels(areas)}
                  onAddQuery={(term) => setQueries((q) => (q.includes(term) ? q : [...q, term]))}
                  onAddLocation={(loc) => setAreas((a) => (a.some((x) => x.label === loc) ? a : [...a, { mode: 'text', label: loc }]))}
                />
              ) : (
                <p className="m-0 rounded-2xl bg-(--ad-surface-2) px-5 py-4 text-[14px] leading-relaxed text-(--ad-ink-soft)">Pick a client above to get search term and location suggestions from their profile.</p>
              )}
              <div>
                <TagInput
                  sentenceLabel label="Search terms"
                  placeholder="Type a search term and press Enter (e.g. hotels, lodges, guesthouses)"
                  helper="Business types, not job titles - 3 to 5 terms works best. Separate several with commas."
                  values={queries} onChange={setQueries} maxItems={limits.maxSearchTerms} capLabel="search term"
                />
                <LimitCounter count={queries.length} max={limits.maxSearchTerms} noun="search terms" />
              </div>
              <div>
                <LocationAreaInput
                  sentenceLabel label="Locations"
                  helper="Add a city or area, or a radius around a point. Plain places and radius areas share one list."
                  values={areas} onChange={setAreas} maxItems={limits.maxLocations} capLabel="location"
                />
                <LimitCounter count={areas.length} max={limits.maxLocations} noun="locations" />
                <LimitMessages errors={check.errors} fields={['pairs']} />
              </div>
            </WinSection>
            <WinSection title="Scraping">
              <ScrapeSizeFields maxResults={maxResults} setMaxResults={setMaxResults} scrapeEnabled={scrapeEnabled} setScrapeEnabled={setScrapeEnabled} cap={limits.maxResults} errors={check.errors} />
            </WinSection>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <WinSection title="Outreach">
              <div className="grid gap-4 sm:grid-cols-2">
                <LanguageField value={language} onChange={setLanguage} listId="new-campaign-languages" />
                <ChannelField value={channel} onChange={setChannel} />
              </div>
            </WinSection>
            <WinSection title="Status when created">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-(--ad-line) px-5 py-4">
                <input type="checkbox" checked={saveAsDraft} onChange={(e) => setSaveAsDraft(e.target.checked)} className="mt-0.5 h-4 w-4 accent-(--ad-green)" />
                <span>
                  <span className="block text-[15px] font-semibold">Save as draft</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-(--ad-ink-faint)">It's created with status "Draft" instead of "Active". Activate it from the campaign list when it's ready.</span>
                </span>
              </label>
            </WinSection>
          </div>
        )}
        {err && <div className="mt-6 rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
      </div>
      <WindowFooter status={saveAsDraft ? 'Will be created as a draft' : 'Goes live when created'}>
        <button onClick={onClose} className={winGhost}>Cancel</button>
        <button onClick={submit} disabled={busy || !check.valid} className={winPrimary}>
          {busy ? 'Creating…' : saveAsDraft ? 'Save as draft' : 'Create campaign'}
        </button>
      </WindowFooter>
    </CampaignWindow>
  );
}

/* ── Small modal shell (scrape results, delete) ────────────────────── */
function CampModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-[rgba(14,8,34,0.45)] md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[540px] md:rounded-2xl md:border md:border-(--ad-line)"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ── Edit Campaign window ──────────────────────────────────────────── */
function EditCampaignModal({
  campaign, hold = null, onClose, onSaved,
}: { campaign: CampaignRow; hold?: { country: string; reason: string } | null; onClose: () => void; onSaved: () => void }) {
  const initial = {
    name: campaign.name,
    description: campaign.description ?? '',
    channel: campaign.channel,
    language: campaign.language,
    queries: campaign.search_queries,
    areas: campaignAreas(campaign),
    maxResults: campaign.max_results,
    scrapeEnabled: campaign.scrape_enabled,
  };
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<typeof initial>) => setForm((f) => ({ ...f, ...patch }));
  const [tab, setTab] = useState<WinTab>('who');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const limits = useCampaignLimits(campaign.client_id);
  // WF0 applies the caps to any campaign it runs, so an existing campaign that
  // is already over a cap can't be saved until it is brought under it.
  const allowEmpty = campaign.status === 'draft';
  const check = validateCampaignLimits(
    { searchQueries: form.queries, locationCount: form.areas.length, maxResults: form.maxResults, allowEmpty }, limits,
  );
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const close = () => { if (confirmDiscard(dirty)) onClose(); };

  async function submit() {
    if (!form.name.trim()) { setTab('who'); setErr('Campaign name is required.'); return; }
    if (!form.language.trim()) { setTab('settings'); setErr('Outreach language is required.'); return; }
    if (!check.valid) { setTab('who'); setErr(check.errors.map((e) => e.message).join(' ')); return; }
    const joinedError = joinedLocationsError(form.areas);
    if (joinedError) { setTab('who'); setErr(joinedError); return; }
    setBusy(true); setErr(null);
    const { error } = await updateCampaign(campaign.id, {
      name: form.name.trim(),
      description: form.description.trim(),
      channel: form.channel,
      language: form.language.trim(),
      search_queries: form.queries,
      target_areas: form.areas,
      max_results: form.maxResults,
      scrape_enabled: form.scrapeEnabled,
      allow_empty: allowEmpty,
    });
    setBusy(false);
    if (error) setErr(error.message); else onSaved();
  }

  const overCount = check.errors.filter((e) => e.over).length;
  const empty = form.queries.length === 0 || form.areas.length === 0;
  const hint = overCount > 0
    ? `${overCount} limit${overCount === 1 ? ' needs' : 's need'} fixing before this can be saved.`
    : empty
      ? 'Add search terms and locations so the scraper can find prospects.'
      : 'Changes apply from the next scrape and to emails drafted after you save.';
  const statusLabel = campaignStatusLabel(campaign.status, campaign.prospectCount, CAMP_STATUS_LABEL);

  return (
    <CampaignWindow label={`Edit ${campaign.name}`} onClose={close}>
      <WindowHeader
        eyebrow={<>
          <span className="shrink-0">{statusLabel}</span>
          {campaign.client?.business_name && <><span aria-hidden>·</span><span className="truncate">{campaign.client.business_name}</span></>}
          {campaign.country && <><span aria-hidden>·</span><span className="shrink-0">{countryName(campaign.country)}</span></>}
          {isEuCountry(campaign.country) && <EuBadge />}
        </>}
        title={form.name.trim() || campaign.name}
        hint={hint}
        tab={tab} onTab={setTab}
        dots={{ who: check.errors.some((e) => e.over && TARGET_FIELDS.includes(e.field)), settings: !form.language.trim() }}
        onClose={close}
      />
      <div className="modal-scroll min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-10">
        {hold && <div className="mb-6"><CountryHoldBanner reason={hold.reason} /></div>}
        {tab === 'who' ? (
          <div className="flex flex-col gap-8">
            <div>
              <label className={winLabel} htmlFor="edit-camp-name">Campaign name<RequiredMark /></label>
              <input id="edit-camp-name" value={form.name} onChange={(e) => set({ name: e.target.value })} style={FONT} className={winInput} />
            </div>
            <WinSection title="Who to find">
              <SuggestForMe
                clientId={campaign.client_id}
                queries={form.queries}
                locations={areasToLocationLabels(form.areas)}
                onAddQuery={(term) => setForm((f) => (f.queries.includes(term) ? f : { ...f, queries: [...f.queries, term] }))}
                onAddLocation={(loc) => setForm((f) => (f.areas.some((x) => x.label === loc) ? f : { ...f, areas: [...f.areas, { mode: 'text', label: loc }] }))}
              />
              <div>
                <TagInput
                  sentenceLabel label="Search terms"
                  placeholder="Type a search term and press Enter (e.g. hotels, lodges, guesthouses)"
                  helper="Business types, not job titles - 3 to 5 terms works best. Separate several with commas."
                  values={form.queries} onChange={(v) => set({ queries: v })} maxItems={limits.maxSearchTerms} capLabel="search term"
                />
                <LimitCounter count={form.queries.length} max={limits.maxSearchTerms} noun="search terms" />
              </div>
              <div>
                <LocationAreaInput
                  sentenceLabel label="Locations"
                  helper="Add a city or area, or a radius around a point. Plain places and radius areas share one list."
                  values={form.areas} onChange={(v) => set({ areas: v })} maxItems={limits.maxLocations} capLabel="location"
                />
                <LimitCounter count={form.areas.length} max={limits.maxLocations} noun="locations" />
                <LimitMessages errors={check.errors} fields={['pairs']} />
              </div>
            </WinSection>
            <WinSection title="Scraping">
              <ScrapeSizeFields
                maxResults={form.maxResults} setMaxResults={(n) => set({ maxResults: n })}
                scrapeEnabled={form.scrapeEnabled} setScrapeEnabled={(b) => set({ scrapeEnabled: b })}
                cap={limits.maxResults} errors={check.errors}
              />
            </WinSection>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <WinSection title="Outreach">
              <div className="grid gap-4 sm:grid-cols-2">
                <LanguageField value={form.language} onChange={(v) => set({ language: v })} listId="edit-campaign-languages" />
                <ChannelField value={form.channel} onChange={(v) => set({ channel: v })} />
              </div>
              {/* Saves on its own, separately from the form. */}
              <FollowUpsNowToggle
                campaignId={campaign.id}
                clientId={campaign.client_id}
                on={campaign.upfront_sequence}
                campaignActive={campaign.status === 'active'}
                onChanged={() => queryClient.invalidateQueries({ queryKey: QK.campaigns })}
              />
            </WinSection>
            <WinSection title="Details">
              <div>
                <label className={winLabel} htmlFor="edit-camp-notes">Notes <span className="font-normal text-(--ad-ink-faint)">Optional</span></label>
                <input id="edit-camp-notes" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Anything worth remembering about this campaign" style={FONT} className={winInput} />
              </div>
              <div>
                <span className={winLabel}>Target country</span>
                <div className="flex h-12 items-center gap-2 rounded-xl bg-(--ad-surface-2) px-4 text-[15px] text-(--ad-ink-soft)">
                  <span>{campaign.country ? countryName(campaign.country) : 'Not set'}</span>
                  {isEuCountry(campaign.country) && <EuBadge />}
                </div>
                <p className={winHelp}>Set when the campaign is created and can't be changed.</p>
              </div>
            </WinSection>
          </div>
        )}
        {err && <div className="mt-6 rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
      </div>
      <WindowFooter status={dirty ? 'Unsaved changes' : 'No changes yet'}>
        {dirty && <button onClick={() => { setForm(initial); setErr(null); }} disabled={busy} className={winGhost}>Discard</button>}
        {!dirty && <button onClick={onClose} className={winGhost}>Close</button>}
        <button onClick={submit} disabled={busy || !dirty || !check.valid} className={winPrimary}>{busy ? 'Saving…' : 'Save changes'}</button>
      </WindowFooter>
    </CampaignWindow>
  );
}

/* ── Delete Campaign Modal ─────────────────────────────────────────── */
function DeleteCampaignModal({
  campaign, onClose, onDeleted,
}: { campaign: CampaignRow; onClose: () => void; onDeleted: () => void }) {
  const [counts, setCounts] = useState<CampaignDeleteCounts | null>(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  useEffect(() => {
    getCampaignDeleteCounts(campaign.id).then(setCounts);
  }, [campaign.id]);

  async function confirm() {
    setBusy(true); setErr(null);
    const { error } = await deleteCampaign(campaign.id);
    setBusy(false);
    if (error) setErr(error); else onDeleted();
  }

  const blastItems = counts
    ? [
        counts.prospects > 0 && `${counts.prospects} prospect${counts.prospects !== 1 ? 's' : ''}`,
        counts.messages  > 0 && `${counts.messages} message${counts.messages !== 1 ? 's' : ''}`,
      ].filter(Boolean)
    : [];

  return (
    <CampModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
        <h2 className="m-0 text-[18px] font-semibold text-(--ad-ink)">Delete campaign</h2>
        <button onClick={onClose} aria-label="Close" className="flex cursor-pointer items-center border-0 bg-transparent p-1 text-(--ad-ink-faint) hover:text-(--ad-ink)"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-4">
          <p className="m-0 text-[14px] font-semibold text-(--ad-clay)">
            Permanently delete "{campaign.name}"?
          </p>
          <p className="m-0 mt-1.5 text-[13px] text-(--ad-clay)/80">
            This cannot be undone. All prospects, messages, and replies tied to this campaign will be deleted.
          </p>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">This will permanently delete:</p>
          {!counts ? (
            <div className="flex items-center gap-2 text-[13px] text-(--ad-ink-faint)">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-(--ad-line-strong) border-t-(--ad-clay)" />
              Counting affected records…
            </div>
          ) : blastItems.length === 0 ? (
            <p className="text-[13px] text-(--ad-ink-soft)">No associated records - the campaign row only.</p>
          ) : (
            <ul className="m-0 list-none p-0 flex flex-col gap-1">
              {blastItems.map((item) => (
                <li key={String(item)} className="flex items-center gap-2 text-[13px] text-(--ad-ink-soft)">
                  <X size={12} strokeWidth={2} className="shrink-0 text-(--ad-ink)" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
        {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button
          onClick={confirm}
          disabled={busy || !counts}
          className="cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-clay) px-4 py-2 text-[13px] font-semibold text-(--ad-surface) transition-colors hover:bg-(--ad-clay-hover) disabled:opacity-50"
        >
          {busy ? 'Deleting…' : `Delete campaign and all prospects`}
        </button>
      </div>
    </CampModalShell>
  );
}

/* ── Hot Leads filter helpers ──────────────────────────────────────── */
type LeadFilter = 'new' | 'active' | 'all' | 'closed';

const HL_TABS: { key: LeadFilter; label: string }[] = [
  { key: 'new',    label: 'New' },
  { key: 'active', label: 'In Progress' },
  { key: 'all',    label: 'All' },
  { key: 'closed', label: 'Closed' },
];

const HL_STATUS_LABEL: Record<string, string> = {
  new: 'New', viewed: 'Seen', contacted: 'In progress', won: 'Won', lost: 'Lost',
};

function matchesHL(lead: AdminHotLead, f: LeadFilter) {
  if (f === 'new')    return lead.status === 'new';
  if (f === 'active') return lead.status === 'viewed' || lead.status === 'contacted';
  if (f === 'closed') return lead.status === 'won' || lead.status === 'lost';
  return true;
}

/* ══════════════════════════════════════════════════════════════════ */
export function HotLeads() {
  const { rows, loading, isFetching, dataUpdatedAt, error, reload, setStatus } = useAdminHotLeads();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh hot leads.');
  const [filter, setFilter] = useState<LeadFilter>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage]     = useState(1);

  const openLead   = rows.find((r) => r.id === openId) ?? null;
  const filtered   = rows.filter((r) => matchesHL(r, filter));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function selectFilter(f: LeadFilter) { setFilter(f); setPage(1); }

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-(--ad-ink)">
            <img src="https://cdn-icons-png.flaticon.com/128/9679/9679459.png" className="w-10 h-10" alt="" />
            Hot leads
          </h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">{rows.length} qualified opportunities, all clients</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP_HOT_LEADS} />
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={4} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-semibold text-(--ad-ink)">No hot leads yet.</strong>
          <span className="text-[13px] text-(--ad-ink-soft)">Leads appear here when prospects reply with buying intent.</span>
        </div>
      ) : (
        <>
          {/* ── MOBILE ─────────────────────────────────────────────── */}
          <div className="md:hidden flex flex-col gap-3">
            {/* Pill filter tabs - horizontally scrollable */}
            <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {HL_TABS.map((tab) => {
                const cnt    = rows.filter((r) => matchesHL(r, tab.key)).length;
                const active = filter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => selectFilter(tab.key)}
                    className={`shrink-0 cursor-pointer inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-all ${
                      active
                        ? 'bg-(--ad-green-tint) border-transparent text-(--ad-green) font-semibold'
                        : 'bg-(--ad-surface) border-(--ad-line-strong) text-(--ad-ink-soft) font-semibold hover:border-(--ad-green)'
                    }`}
                  >
                    {tab.label}
                    {cnt > 0 && (
                      <span className={`inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10.5px] font-semibold ${
                        active ? 'bg-(--ad-green)/10 text-(--ad-green)' : 'bg-(--ad-fill) text-(--ad-ink-faint)'
                      }`}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-(--ad-ink-faint) rounded-xl border border-(--ad-line) bg-(--ad-surface)">
                No leads in this category.
              </div>
            ) : (
              <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface) overflow-hidden">
                <div className="divide-y divide-(--ad-fill)">
                  {paged.map((lead) => {
                    const pill = LEAD_PILL[lead.status] ?? LEAD_PILL.new;
                    const dotColor = lead.status === 'won' ? 'var(--ad-green)'
                      : lead.status === 'new' ? 'var(--ad-green)'
                      : lead.status === 'contacted' ? 'var(--ad-amber)'
                      : 'var(--ad-ink-ghost)';
                    return (
                      <button
                        key={lead.id}
                        onClick={() => setOpenId(lead.id)}
                        className="flex w-full cursor-pointer items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-(--ad-surface-2)"
                      >
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-[14px] text-(--ad-ink)">{lead.prospect?.business_name ?? 'Unknown'}</span>
                            <span style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
                              className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.04em]">
                              {HL_STATUS_LABEL[lead.status] ?? lead.status}
                            </span>
                          </div>
                          {lead.prospect?.category && (
                            <p className="mt-0.5 text-[12px] text-(--ad-ink-faint)">
                              {lead.prospect.category}{lead.prospect.location ? ` · ${lead.prospect.location}` : ''}
                            </p>
                          )}
                          {lead.client?.business_name && (
                            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-(--ad-ink-soft)">
                              {lead.client.business_name}{lead.client.is_sandbox && <SandboxBadge />}
                            </p>
                          )}
                          {lead.ai_summary && (
                            <p className="mt-1.5 line-clamp-2 text-[13px] text-(--ad-ink-soft)">{lead.ai_summary}</p>
                          )}
                        </div>
                        <ChevronRight size={15} className="mt-1.5 shrink-0 text-(--ad-ink-ghost)" />
                      </button>
                    );
                  })}
                </div>
                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
              </div>
            )}
          </div>

          {/* ── DESKTOP ────────────────────────────────────────────── */}
          <div className="atbl hidden md:block">
            {/* Underline filter tabs */}
            <div className="atbl-tabs">
              {HL_TABS.map((tab) => {
                const cnt    = rows.filter((r) => matchesHL(r, tab.key)).length;
                const active = filter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => selectFilter(tab.key)}
                    className={`-mb-px cursor-pointer border-b-2 px-4 py-3 text-[13px] font-semibold transition-colors ${
                      active ? 'border-(--ad-green) text-(--ad-green)' : 'border-transparent text-(--ad-ink-faint) hover:text-(--ad-ink-soft)'
                    }`}
                  >
                    {tab.label}
                    {cnt > 0 && (
                      <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${
                        active ? 'bg-(--ad-green-tint) text-(--ad-green)' : 'bg-(--ad-fill) text-(--ad-ink-faint)'
                      }`}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-(--ad-ink-faint)">No leads in this category.</div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      {['Business', 'Client', 'Summary', 'Status', ''].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((lead) => {
                      const pill = LEAD_PILL[lead.status] ?? LEAD_PILL.new;
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => setOpenId(lead.id)}
                          className="cursor-pointer"
                        >
                          <td className="align-top">
                            <div className="font-semibold text-(--ad-ink)">{lead.prospect?.business_name ?? 'Unknown'}</div>
                            {lead.prospect?.category && (
                              <div className="mt-0.5 text-[12px] text-(--ad-ink-faint)">
                                {lead.prospect.category}{lead.prospect.location ? ` · ${lead.prospect.location}` : ''}
                              </div>
                            )}
                          </td>
                          <td className="align-top text-(--ad-ink-soft)">
                            <span className="inline-flex items-center gap-1.5">
                              {lead.client?.business_name ?? '-'}{lead.client?.is_sandbox && <SandboxBadge />}
                            </span>
                          </td>
                          <td className="max-w-[340px] align-top">
                            <p className="m-0 line-clamp-1 text-(--ad-ink-soft)">{lead.ai_summary ?? '-'}</p>
                          </td>
                          <td className="align-top">
                            <StatusPill pill={pill}>
                              {HL_STATUS_LABEL[lead.status] ?? lead.status}
                            </StatusPill>
                          </td>
                          <td className="px-3 align-top text-right">
                            <ChevronRight size={15} className="text-(--ad-ink-ghost)" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
              </>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {openLead && (
          <LeadDetailModal
            key="lead-detail"
            lead={openLead}
            onClose={() => setOpenId(null)}
            onStatus={(id, s) => {
              setOpenId(null);
              setStatus(id, s).then(({ error: err }) => {
                if (err) toast(`Couldn't update lead: ${err}`, 'error');
                else toast(`Lead marked ${s}.`);
              });
            }}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/* ── Lead detail modal ────────────────────────────────────────────── */
function LeadDetailModal({
  lead,
  onClose,
  onStatus,
}: {
  lead: AdminHotLead;
  onClose: () => void;
  onStatus: (id: string, status: string) => void;
}) {
  const pill   = LEAD_PILL[lead.status] ?? LEAD_PILL.new;
  const p      = lead.prospect;
  const match  = describeReplyMatch(lead.reply_match, lead.client?.send_timezone);
  const closed = lead.status === 'won' || lead.status === 'lost';
  const eyebrow = 'mb-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/50 md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hl-title"
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[640px] md:rounded-md md:border md:border-(--ad-line) md:border md:border-(--ad-line)"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header: status, who, for whom ─── */}
        <div className="shrink-0 border-b border-(--ad-line) px-6 pt-5 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.04em]"
              >
                {HL_STATUS_LABEL[lead.status] ?? lead.status}
              </span>
              {lead.routed_at && (
                <span className="inline-flex items-center gap-1 rounded-full bg-(--ad-fill) px-2.5 py-1 text-[11.5px] font-medium text-(--ad-ink-soft)">
                  <Clock size={12} strokeWidth={2.2} /> Routed {formatRelativeTime(new Date(lead.routed_at).getTime())}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-(--ad-fill) text-(--ad-ink-soft) transition-colors hover:bg-(--ad-line) hover:text-(--ad-ink)"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </div>

          <h2 id="hl-title" className="m-0 mt-4 text-[24px] font-extrabold leading-[1.15] tracking-[-0.02em] text-(--ad-ink)">
            {p?.business_name ?? 'Unknown business'}
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] text-(--ad-ink-soft)">
            {(p?.category || p?.location) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} strokeWidth={2} className="text-(--ad-ink-faint)" />
                {[p?.category, p?.location].filter(Boolean).join(' · ')}
              </span>
            )}
            {lead.client?.business_name && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={14} strokeWidth={2} className="text-(--ad-ink-faint)" />
                For <span className="font-semibold text-(--ad-ink)">{lead.client.business_name}</span>
              </span>
            )}
          </div>
        </div>

        {/* ─── Body ─── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-7">
          <section>
            <div className={eyebrow}><Sparkles size={13} strokeWidth={2.2} /> What they want</div>
            <p className="m-0 text-[15.5px] leading-[1.6] text-(--ad-ink)">
              {lead.ai_summary ?? 'They replied expressing interest.'}
            </p>
            {lead.suggested_action && (
              <div className="mt-4 flex items-start gap-3 rounded-lg bg-(--ad-green-tint) px-4 py-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--ad-green) text-white">
                  <ArrowRight size={15} strokeWidth={2.4} />
                </span>
                <div>
                  <div className="text-[12px] font-semibold text-(--ad-green)">Suggested next step</div>
                  <p className="m-0 mt-0.5 text-[14px] font-medium leading-[1.5] text-(--ad-ink)">{lead.suggested_action}</p>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className={eyebrow}><MessageSquare size={13} strokeWidth={2.2} /> Their reply</div>
            {lead.reply?.body ? (
              <blockquote className="m-0 whitespace-pre-line rounded-lg bg-(--ad-surface-2) border border-(--ad-line) px-4 py-3.5 text-[14px] leading-[1.6] text-(--ad-ink)">
                {lead.reply.body}
              </blockquote>
            ) : (
              <div className="rounded-lg border border-dashed border-(--ad-line-strong) px-4 py-3.5 text-[13.5px] text-(--ad-ink-faint)">
                The original reply isn't on record for this lead.
              </div>
            )}
            {match && (
              <div className="mt-3 flex flex-col gap-0.5 text-[12.5px] leading-[1.5] text-(--ad-ink-faint)">
                {(match.subject || match.sentOn) && (
                  <p className="m-0">
                    Replying to: {match.subject ?? 'our email'}
                    {match.sentOn && ` (sent ${match.sentOn})`}
                  </p>
                )}
                <p className={`m-0 ${match.weak ? 'font-semibold text-[var(--ad-amber-ink)]' : ''}`}>Matched by: {match.method}</p>
                {match.weak && <p className="m-0 font-semibold text-[var(--ad-amber-ink)]">{WEAK_MATCH_WARNING}</p>}
              </div>
            )}
          </section>
        </div>

        {/* ─── Footer: outcome ─── */}
        {closed ? (
          <div className="shrink-0 flex items-center gap-2.5 border-t border-(--ad-line) bg-(--ad-surface-2) px-6 py-4 text-[13.5px] text-(--ad-ink-soft)">
            {lead.status === 'won'
              ? <><Trophy size={16} strokeWidth={2} className="text-(--ad-green)" /> Closed as <span className="font-semibold text-(--ad-ink)">won</span></>
              : <><XCircle size={16} strokeWidth={2} className="text-(--ad-ink-faint)" /> Closed as <span className="font-semibold text-(--ad-ink)">not interested</span></>}
          </div>
        ) : (
          <div className="shrink-0 flex flex-col-reverse gap-2.5 border-t border-(--ad-line) px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              onClick={() => onStatus(lead.id, 'lost')}
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-(--ad-line-strong) bg-(--ad-surface) px-5 text-[14px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-clay) hover:text-(--ad-clay)"
            >
              <XCircle size={16} strokeWidth={2} /> Not interested
            </button>
            <button
              onClick={() => onStatus(lead.id, 'won')}
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-(--ad-green) px-5 text-[14px] font-semibold text-white transition-colors hover:bg-(--ad-green-hover)"
            >
              <Trophy size={16} strokeWidth={2} /> Mark as won
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
