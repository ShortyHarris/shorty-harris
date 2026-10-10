import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Plus, Info } from 'lucide-react';
import {
  useCampaigns, useAdminHotLeads, useClientsList,
  createCampaign, updateCampaign, getCampaignDeleteCounts, deleteCampaign,
  fetchScrapeSnapshots, fetchProspectCount,
} from '../../hooks/useAdminData';
import type { AdminHotLead, CampaignRow, CampaignDeleteCounts } from '../../hooks/useAdminData';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { SkeletonTable } from '../../components/Skeleton';
import { RowMenu } from '../../components/RowMenu';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { LocationAreaInput } from '../../components/LocationAreaInput';
import { TargetAreaChips } from '../../components/TargetAreaChips';
import { SuggestForMe } from '../client/Campaigns';
import { areasToLocationLabels, campaignAreas, joinedLocationsError, type TargetArea } from '../../lib/targetAreas';
import { getScrapeStatusDisplay } from '../../lib/scrapeFailures';
import { useCountrySendHolds } from '../../hooks/useCountrySendHolds';
import { CountryHoldBanner, EuBadge } from '../../components/CountryHoldBanner';
import { COUNTRY_OPTIONS, countryName, defaultCampaignCountry, findCountryHold, isEuCountry } from '../../lib/countries';

const HELP_CAMPAIGNS: HelpContent = {
  title: 'Campaigns',
  body: [
    { type: 'p', text: "Each campaign belongs to a client and controls who gets targeted and how. The search terms and target locations tell the scraper where to find new prospects." },
    { type: 'p', text: "A ⚠ Needs setup badge means the campaign is missing search terms or locations - it won't find new prospects until those are filled in." },
    { type: 'ul', items: [
      "Edit - update campaign settings, search terms, or locations",
      "Pause / Activate - stop or resume outreach for this campaign",
      "Scrape - trigger a fresh prospect search right now",
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
  pending_review: { bg: '#f0ecf8', text: '#6b4fa0' },
  draft:          { bg: '#f5f2ec', text: '#62655c', border: '1px solid #ece8df' },
  active:         { bg: '#edf4ef', text: '#3c7a5b' },
  paused:         { bg: '#f8efdb', text: '#b9831f' },
  completed:      { bg: '#f0f0f0', text: '#9a9d92' },
};

const CAMP_STATUS_LABEL: Record<string, string> = {
  pending_review: 'In review',
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
};

const LEAD_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  new:       { bg: '#edf4ef', text: '#3c7a5b' },
  viewed:    { bg: '#f5f2ec', text: '#62655c', border: '1px solid #ece8df' },
  contacted: { bg: '#f8efdb', text: '#b9831f' },
  won:       { bg: '#3c7a5b', text: '#fff' },
  lost:      { bg: 'transparent', text: '#9a9d92', border: '1px solid #ddd8cb' },
};

const PAGE_SIZE = 10;

const LANGUAGE_OPTIONS = [
  'English', 'Czech', 'French', 'Spanish', 'Portuguese', 'German', 'Italian',
  'Dutch', 'Polish', 'Slovak', 'Arabic', 'Chinese', 'Swahili', 'Bemba', 'Nyanja',
];

/* Text input + datalist (combobox) - not a Select, since the admin should be
   able to type any language, not just pick from the suggestion list. */
function LanguageField({ value, onChange, listId }: { value: string; onChange: (v: string) => void; listId: string }) {
  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
  const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';
  return (
    <div>
      <label className={fieldLbl}>Outreach Language</label>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="English"
        style={FONT}
        className={inputCls}
      />
      <datalist id={listId}>
        {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l} />)}
      </datalist>
      <p className="mt-1 text-[11px] text-[#9a9d92]">Messages and follow-ups will be written in this language.</p>
    </div>
  );
}

/* ── Ghost / primary button helpers ───────────────────────────────── */
const ghostCls = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50';

/* ── Pagination ────────────────────────────────────────────────────── */
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-[#ece8df] px-4 py-3 text-[12.5px] text-[#9a9d92]">
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40">Next</button>
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
  const toneCls = sr.tone === 'positive' ? 'bg-[#edf4ef] text-[#3c7a5b]' : 'bg-[#f5f2ec] text-[#62655c]';
  if (!hasDetail) {
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${toneCls}`}>{scrapeChipLabel(campaign)}</span>;
  }
  return (
    <button
      onClick={onOpenDetail}
      title="View full scrape breakdown"
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold transition-opacity hover:opacity-75 ${toneCls}`}
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
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[16px] font-bold text-[#20211c]">Scrape failed</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <p className="m-0 truncate text-[13px] text-[#9a9d92]" title={campaign.name}>{campaign.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="m-0 text-[15px] font-semibold text-[#a8533a]">{d.label}</p>
              {d.repeatedlyFailing && (
                <span
                  title={`Failed ${campaign.scrape_attempt_count} times in a row`}
                  className="inline-flex items-center rounded-full bg-[#a8533a] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.04em] text-white"
                >
                  Repeated
                </span>
              )}
            </div>
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-[#62655c]">{d.detail}</p>
          {d.fix && (
            <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] px-4 py-3.5">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Suggested fix</p>
              <p className="m-0 mt-1 text-[13px] leading-relaxed text-[#20211c]">{d.fix}</p>
            </div>
          )}
          {d.technical && (
            <div>
              <p className="m-0 text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Technical detail</p>
              <p className="m-0 mt-1 break-words text-[12px] leading-relaxed text-[#9a9d92]">{d.technical}</p>
            </div>
          )}
          <p className="m-0 text-[11px] text-[#9a9d92]">{lastScrapedLabel(campaign)}</p>
        </div>
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex gap-2.5">
          <button onClick={onClose} className={`${ghostCls} flex-1`}>Close</button>
          {d.retryable ? (
            <button onClick={() => { onScrape(); onClose(); }} className={`${primaryCls} flex-1`}>Retry scrape</button>
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
      <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
        <h2 className="m-0 text-[16px] font-bold text-[#20211c]">Scrape results</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div>
          <p className="m-0 truncate text-[13px] text-[#9a9d92]" title={campaign.name}>{campaign.name}</p>
          <p className={`m-0 mt-1 text-[15px] font-semibold ${sr.tone === 'positive' ? 'text-[#3c7a5b]' : 'text-[#20211c]'}`}>{sr.text}</p>
        </div>
        {rows.length > 0 && (
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-[#f0ede6] pt-4">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">{label}</dt>
                <dd className="m-0 mt-0.5 text-[17px] font-bold text-[#20211c]">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="m-0 text-[11px] text-[#9a9d92]">{lastScrapedLabel(campaign)}</p>
      </div>
      <div className="shrink-0 border-t border-[#ece8df] px-5 py-4">
        <button onClick={onClose} className="w-full cursor-pointer rounded-xl border-0 bg-[#3c7a5b] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d5e46]">
          Close
        </button>
      </div>
    </CampModalShell>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
// WF0 now responds immediately once the scrape is accepted (it can run for
// 15-30 minutes in the background) - this only confirms acceptance, it
// never waits on the scrape itself. Actual progress/completion is tracked
// via scrape_status on the campaigns row (see the polling effect below).
async function startDiscoverScrape(campaignId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('https://n8n.shortyharris.com/webhook/wf0-discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId }),
    });
    if (!res.ok) return { ok: false, message: `Scrape service returned ${res.status}` };
    const data = await res.json().catch(() => ({}));
    if (data.status === 'started' || data.status === 'limit_reached') return { ok: true };
    return { ok: false, message: data.message ?? 'Unexpected response from the scrape service' };
  } catch {
    return { ok: false, message: 'Could not reach the scrape service' };
  }
}

// How often to re-check scrape_status/last_scraped_at while any campaign is
// actively scraping - stops the moment none are, rather than polling forever.
const SCRAPE_POLL_MS = 17000;

export function Campaigns() {
  const { rows, loading, isFetching, dataUpdatedAt, error, reload, setStatus, patchCampaign } = useCampaigns();
  const { holds } = useCountrySendHolds();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh campaigns.');
  const [showNew, setShowNew]         = useState(false);
  const [editCampaign, setEditCampaign]     = useState<CampaignRow | null>(null);
  const [deleteCampaignTarget, setDeleteCampaignTarget] = useState<CampaignRow | null>(null);
  const [scrapeDetailCampaign, setScrapeDetailCampaign] = useState<CampaignRow | null>(null);
  const [page, setPage]               = useState(1);

  // Campaign IDs whose start-scrape request is still in flight. The poll
  // below must not touch these: it reads straight from the DB, and the
  // backend only writes scrape_status='running' once the request lands -
  // a poll landing in the gap between the optimistic patch (below) and that
  // write would read the stale pre-click row and stomp the optimistic
  // 'running' state right back to idle/complete, flickering the button back
  // and inviting a second click that fires a duplicate scrape.
  const pendingStartRef = useRef<Set<string>>(new Set());

  async function handleScrape(campaignId: string) {
    pendingStartRef.current.add(campaignId);
    // Optimistic: the backend writes scrape_status='running' synchronously
    // before it even responds, so reflect that immediately instead of
    // waiting on the (now-fast, but still real) round trip.
    patchCampaign(campaignId, {
      scrape_status: 'running',
      scrape_started_at: new Date().toISOString(),
      scrape_error: null,
      scrape_failure_reason: null,
    });
    try {
      const result = await startDiscoverScrape(campaignId);
      if (!result.ok) {
        // The request itself never got accepted - the backend never had a
        // chance to flip its own status, so this is the one case the frontend
        // has to report failure on its own rather than waiting for a poll.
        // No scrape_failure_reason code applies here (WF0 never ran), so
        // getScrapeStatusDisplay falls back to its generic 'unknown' copy.
        patchCampaign(campaignId, { scrape_status: 'failed', scrape_error: result.message ?? 'Failed to start scrape', scrape_failure_reason: null });
      }
      // On success, the poll below picks up real progress/completion.
    } finally {
      pendingStartRef.current.delete(campaignId);
    }
  }

  // Always-current view of rows for the interval callback below, so it never
  // closes over a stale list of "which campaigns are running".
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const anyRunning = rows.some((r) => r.scrape_status === 'running' && !isStaleRun(r.scrape_status, r.scrape_started_at));

  useEffect(() => {
    if (!anyRunning) return;

    async function tick() {
      const runningIds = rowsRef.current
        .filter((r) => r.scrape_status === 'running' && !isStaleRun(r.scrape_status, r.scrape_started_at) && !pendingStartRef.current.has(r.id))
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
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]"><img src="https://cdn-icons-png.flaticon.com/128/6745/6745021.png" alt="Campaigns" className="w-10 h-10" />Campaigns</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{rows.length} campaigns across all clients</p>
        </div>
        <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
          <HelpButton content={HELP_CAMPAIGNS} />
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
          <button onClick={() => setShowNew(true)} className={`${primaryCls} hidden md:inline-flex`}>+ New campaign</button>
        </div>
      </header>

      {heldGroups.map(({ hold, campaigns }) => (
        <CountryHoldBanner
          key={hold.country}
          reason={hold.reason}
          context={`${countryName(hold.country)}: ${campaigns.map((c) => c.name).join(', ')}`}
        />
      ))}

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={6} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No campaigns yet.</strong>
        </div>
      ) : (
        <>
          {/* Desktop table - hidden on mobile */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[20%]" />
                <col className="w-[16%]" />
                <col className="w-[11%]" />
                <col className="w-[13%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Campaign', 'Client', 'Prospects', 'Status', 'Scrape', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => {
                  const pill       = CAMP_PILL[c.status] ?? CAMP_PILL.draft;
                  const active     = c.status === 'active';
                  const paused     = c.status === 'paused';
                  const needsSetup = c.search_queries.length === 0 || c.target_locations.length === 0;
                  const draft      = c.status === 'draft' || c.status === 'pending_review';
                  return (
                    <tr key={c.id} onClick={() => setEditCampaign(c)} className="group cursor-pointer">
                      <td className="min-w-0">
                        <div className="line-clamp-2 font-bold leading-snug text-[#20211c] group-hover:underline" title={c.name}>{c.name}</div>
                        {isEuCountry(c.country) && <div className="mt-1"><EuBadge /></div>}
                        {c.needsReview && (
                          <span className="atbl-pill mt-1" style={{ background: '#f0ecf8', color: '#6b4fa0' }}>
                            🔔 Awaiting approval
                          </span>
                        )}
                        {needsSetup && (
                          <span className="atbl-pill mt-1" style={{ background: '#f8efdb', color: '#b9831f' }}>
                            ⚠ Needs setup
                          </span>
                        )}
                        <div className="mt-1 text-[11px] text-[#9a9d92]">{lastScrapedLabel(c)}</div>
                        {c.target_areas && (
                          <TargetAreaChips areas={c.target_areas} radiusOnly className="mt-1.5 flex flex-wrap gap-1" chipClassName="px-2 py-0.5 text-[11px]" />
                        )}
                      </td>
                      <td className="min-w-0 text-[#62655c]">
                        <div className="truncate" title={c.client?.business_name ?? undefined}>{c.client?.business_name ?? '-'}</div>
                      </td>
                      <td className="min-w-0">
                        <ScrapeResultChip campaign={c} onOpenDetail={() => setScrapeDetailCampaign(c)} />
                      </td>
                      <td>
                        <span className="atbl-pill" style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}>
                          {CAMP_STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <ScrapeCell
                          campaign={c}
                          onScrape={() => handleScrape(c.id)}
                          onOpenDetail={() => setScrapeDetailCampaign(c)}
                        />
                      </td>
                      <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {draft && (
                            <button
                              onClick={() => setEditCampaign(c)}
                              className="cursor-pointer whitespace-nowrap rounded-lg border border-[#ece8df] bg-white px-2 py-1 text-[11px] font-bold text-[#20211c] transition-colors hover:bg-[#f5f2ec]"
                            >
                              Edit
                            </button>
                          )}
                          {c.needsReview && (
                            <button
                              onClick={() => setStatus(c.id, 'active')}
                              className="cursor-pointer whitespace-nowrap rounded-lg border-0 bg-[#3c7a5b] px-2 py-1 text-[11px] font-bold text-white transition-colors hover:bg-[#2d5e46]"
                            >
                              Approve
                            </button>
                          )}
                          <RowMenu items={[
                            { type: 'action', label: 'Edit campaign',  onClick: () => setEditCampaign(c) },
                            ...(active || paused ? [{
                              type: 'action' as const,
                              label: active ? 'Pause campaign' : 'Activate campaign',
                              onClick: () => setStatus(c.id, active ? 'paused' : 'active'),
                            }] : []),
                            { type: 'separator' },
                            { type: 'action', label: 'Delete campaign', destructive: true, onClick: () => setDeleteCampaignTarget(c) },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards - shown below md */}
          <div className="md:hidden flex flex-col gap-3">
            {paged.map((c) => {
              const pill       = CAMP_PILL[c.status] ?? CAMP_PILL.draft;
              const active     = c.status === 'active';
              const paused     = c.status === 'paused';
              const needsSetup = c.search_queries.length === 0 || c.target_locations.length === 0;
              return (
                <div
                  key={c.id}
                  onClick={() => setEditCampaign(c)}
                  className="cursor-pointer rounded-xl border border-[#ece8df] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="line-clamp-2 block font-bold leading-snug text-[#20211c] text-[14px]" title={c.name}>{c.name}</span>
                      {isEuCountry(c.country) && <div className="mt-1"><EuBadge /></div>}
                      {c.needsReview && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#f0ecf8] px-2 py-0.5 text-[10.5px] font-bold text-[#6b4fa0]">
                            🔔 Awaiting approval
                          </span>
                        </div>
                      )}
                      {needsSetup && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#f8efdb] px-2 py-0.5 text-[10.5px] font-bold text-[#b9831f]">
                            ⚠ Needs setup
                          </span>
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-[#9a9d92]">{lastScrapedLabel(c)}</div>
                      {c.target_areas && (
                        <TargetAreaChips areas={c.target_areas} radiusOnly className="mt-1.5 flex flex-wrap gap-1" chipClassName="px-2 py-0.5 text-[11px]" />
                      )}
                    </div>
                    <span style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
                      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]">
                      {CAMP_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-[#62655c]">
                    {c.client?.business_name ?? '-'} · {c.channel} · {c.language}
                  </p>
                  <div className="mt-1.5">
                    <ScrapeResultChip campaign={c} onOpenDetail={() => setScrapeDetailCampaign(c)} />
                  </div>
                  <div className="border-t border-[#f5f2ec] pt-3 mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {c.needsReview && (
                      <button
                        onClick={() => setStatus(c.id, 'active')}
                        className="cursor-pointer rounded-lg border-0 bg-[#3c7a5b] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[#2d5e46]"
                      >
                        Approve
                      </button>
                    )}
                    {(active || paused) && (
                      <button
                        onClick={() => setStatus(c.id, active ? 'paused' : 'active')}
                        title={active ? 'Pause campaign' : 'Activate campaign'}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[.04em] transition-colors ${
                          active
                            ? 'border-[#3c7a5b] bg-[#3c7a5b] text-white hover:bg-[#2d5e46]'
                            : 'border-[#ddd8cb] bg-white text-[#62655c] hover:border-[#b9831f] hover:text-[#b9831f]'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${active ? 'bg-white' : 'bg-[#c4bfb5]'}`} />
                        {active ? 'Active' : 'Paused'}
                      </button>
                    )}
                    <ScrapeCell
                      campaign={c}
                      onScrape={() => handleScrape(c.id)}
                      onOpenDetail={() => setScrapeDetailCampaign(c)}
                    />
                    <button
                      onClick={() => setEditCampaign(c)}
                      className="cursor-pointer rounded-lg border border-[#ece8df] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteCampaignTarget(c)}
                      className="cursor-pointer rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[#c4bfb5] transition-colors hover:border-[#a8533a]/30 hover:bg-[#fdf0ec] hover:text-[#a8533a]"
                    >
                      Delete
                    </button>
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
      <button
        onClick={() => setShowNew(true)}
        className="fixed bottom-6 right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-[#3c7a5b] text-white shadow-[0_6px_24px_rgba(60,122,91,0.4)] transition-all hover:bg-[#2d5e46] active:scale-95"
        aria-label="New campaign"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {showNew && (
          <NewCampaignModal
            key="new-campaign-modal"
            onClose={() => setShowNew(false)}
            onCreated={() => { setShowNew(false); reload(); }}
          />
        )}
        {editCampaign && (
          <EditCampaignModal
            key={`edit-camp-${editCampaign.id}`}
            campaign={editCampaign}
            hold={findCountryHold(holds, editCampaign.country)}
            onClose={() => setEditCampaign(null)}
            onSaved={() => { setEditCampaign(null); reload(); }}
          />
        )}
        {deleteCampaignTarget && (
          <DeleteCampaignModal
            key={`del-camp-${deleteCampaignTarget.id}`}
            campaign={deleteCampaignTarget}
            onClose={() => setDeleteCampaignTarget(null)}
            onDeleted={() => { setDeleteCampaignTarget(null); reload(); }}
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
  onScrape,
  onOpenDetail,
}: {
  campaign: Pick<CampaignRow, 'scrape_status' | 'scrape_started_at' | 'scrape_error' | 'scrape_failure_reason' | 'scrape_attempt_count'>;
  onScrape: () => void;
  onOpenDetail: () => void;
}) {
  const stale = isStaleRun(campaign.scrape_status, campaign.scrape_started_at);

  if (campaign.scrape_status === 'running' && !stale) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#9a9d92]">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#ddd8cb] border-t-[#3c7a5b]" />
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
        className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-[#fdf0ec] px-2 py-0.5 text-[11.5px] font-semibold text-[#a8533a] transition-opacity hover:opacity-75"
      >
        {d.label}
        {d.repeatedlyFailing && <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#a8533a]" title={`Failed ${campaign.scrape_attempt_count} times in a row`} />}
        <Info size={11} strokeWidth={2.5} className="opacity-60" />
      </button>
    );
  }

  return (
    <button
      onClick={onScrape}
      className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-[#ece8df] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b] whitespace-nowrap"
    >
      ↻ Run scrape
    </button>
  );
}

/* ── New Campaign Modal ────────────────────────────────────────────── */
function NewCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const clients = useClientsList();
  const [clientId, setClientId]         = useState('');
  const [name, setName]                 = useState('');
  const [channel, setChannel]           = useState('email');
  const [language, setLanguage]         = useState('English');
  // '' until the admin picks one; until then the selected client's country is the default.
  const [pickedCountry, setPickedCountry] = useState('');
  const country = pickedCountry || defaultCampaignCountry(clients.find((c) => c.id === clientId)?.country);
  const [queries, setQueries]           = useState('');
  const [areas, setAreas]                 = useState<TargetArea[]>([]);
  const [maxResults, setMaxResults]     = useState(1000);
  const [scrapeEnabled, setScrapeEnabled] = useState(true);
  const [saveAsDraft, setSaveAsDraft]   = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState<string | null>(null);

  async function submit() {
    if (!clientId || !name.trim()) { setErr('Pick a client and enter a name.'); return; }
    if (!language.trim()) { setErr('Outreach language is required.'); return; }
    if (!country) { setErr('Target country is required.'); return; }
    const joinedError = joinedLocationsError(areas);
    if (joinedError) { setErr(joinedError); return; }
    setBusy(true); setErr(null);
    const { error } = await createCampaign({
      client_id: clientId, name: name.trim(), channel, language: language.trim(), country,
      search_queries: queries.split(',').map((s) => s.trim()).filter(Boolean),
      target_areas: areas,
      max_results: maxResults, scrape_enabled: scrapeEnabled,
      status: saveAsDraft ? 'draft' : 'active',
    });
    setBusy(false);
    if (error) setErr(error.message); else onCreated();
  }

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
  const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[540px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">New campaign</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <label className={fieldLbl}>Client</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]">
                <SelectValue placeholder="Select a client…" />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={fieldLbl}>Campaign name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Austin gyms - Q3" style={FONT} className={inputCls} />
          </div>

          <LanguageField value={language} onChange={setLanguage} listId="new-campaign-languages" />

          <div>
            <label className={fieldLbl}>Target country</label>
            <Select value={country} onValueChange={setPickedCountry}>
              <SelectTrigger style={FONT} aria-label="Target country" className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]">
                <SelectValue placeholder="Select a country…" />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                {COUNTRY_OPTIONS.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-[#9a9d92]">Can't be changed after the campaign is created. EU countries have extra outreach rules.</p>
          </div>

          <div>
            <label className={fieldLbl}>Channel</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-[#f0ede6] pt-3">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Prospect discovery (Apify)</p>
            <div className="flex flex-col gap-3">
              {clientId ? (
                <SuggestForMe
                  key={clientId}
                  clientId={clientId}
                  queries={queries.split(',').map((s) => s.trim()).filter(Boolean)}
                  locations={areasToLocationLabels(areas)}
                  onAddQuery={(term) => setQueries((q) => {
                    const parts = q.split(',').map((s) => s.trim()).filter(Boolean);
                    return parts.includes(term) ? q : [...parts, term].join(', ');
                  })}
                  onAddLocation={(loc) => setAreas((a) => (a.some((x) => x.label === loc) ? a : [...a, { mode: 'text', label: loc }]))}
                />
              ) : (
                <p className="m-0 text-[11px] text-[#9a9d92]">Pick a client above to see targeting suggestions from their profile.</p>
              )}
              <div>
                <label className={fieldLbl}>Search terms <span className="normal-case font-normal">(comma-separated)</span></label>
                <input value={queries} onChange={(e) => setQueries(e.target.value)} placeholder="hotels, lodges, guesthouses" style={FONT} className={inputCls} />
                <p className="mt-1 text-[11px] text-[#9a9d92]">Business types, not job titles - 3 to 5 terms works best.</p>
              </div>
              <LocationAreaInput
                label="Locations"
                helper="Add a city or area, or a radius around a point. Plain places and radius areas share one list (max 25)."
                values={areas}
                onChange={setAreas}
                maxItems={25}
                capLabel="location"
              />
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className={fieldLbl}>Max results per run</label>
                  <input type="number" min={1} max={1000} value={maxResults} onChange={(e) => setMaxResults(Math.min(1000, Number(e.target.value)))} style={FONT} className={inputCls} />
                  <p className="mt-1 text-[11px] text-[#9a9d92]">Higher counts tend to yield more replies. Capped at 1,000 per campaign.</p>
                </div>
                <label className="mb-2.5 flex cursor-pointer items-center gap-2 text-[13px] text-[#62655c]">
                  <input type="checkbox" checked={scrapeEnabled} onChange={(e) => setScrapeEnabled(e.target.checked)} className="accent-[#3c7a5b]" />
                  Enable scraping
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-[#f0ede6] pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#62655c]">
              <input type="checkbox" checked={saveAsDraft} onChange={(e) => setSaveAsDraft(e.target.checked)} className="accent-[#3c7a5b]" />
              Save as draft
            </label>
            <p className="mt-1 text-[11px] text-[#9a9d92]">Saved with status "Draft" instead of "Active" - switch its status here later when it's ready.</p>
          </div>

          {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryCls}>
            {busy ? 'Creating…' : saveAsDraft ? 'Save as draft' : 'Create campaign'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Modal shell ───────────────────────────────────────────────────── */
function CampModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[540px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

const campFieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
const campInputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

/* ── Edit Campaign Modal ───────────────────────────────────────────── */
function EditCampaignModal({
  campaign, hold = null, onClose, onSaved,
}: { campaign: CampaignRow; hold?: { country: string; reason: string } | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName]               = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [channel, setChannel]         = useState(campaign.channel);
  const [language, setLanguage]       = useState(campaign.language);
  const [queries, setQueries]         = useState(campaign.search_queries.join(', '));
  const [areas, setAreas]         = useState<TargetArea[]>(campaignAreas(campaign));
  const [maxResults, setMaxResults]   = useState(campaign.max_results);
  const [scrapeEnabled, setScrapeEnabled] = useState(campaign.scrape_enabled);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr('Campaign name is required.'); return; }
    if (!language.trim()) { setErr('Outreach language is required.'); return; }
    const joinedError = joinedLocationsError(areas);
    if (joinedError) { setErr(joinedError); return; }
    setBusy(true); setErr(null);
    const { error } = await updateCampaign(campaign.id, {
      name: name.trim(),
      description: description.trim(),
      channel,
      language: language.trim(),
      search_queries: queries.split(',').map((s) => s.trim()).filter(Boolean),
      target_areas: areas,
      max_results: maxResults,
      scrape_enabled: scrapeEnabled,
    });
    setBusy(false);
    if (error) setErr(error.message); else onSaved();
  }

  return (
    <CampModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
        <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Edit campaign</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        {hold && <CountryHoldBanner reason={hold.reason} />}
        <div>
          <label className={campFieldLbl}>Campaign name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={FONT} className={campInputCls} />
        </div>
        <div>
          <label className={campFieldLbl}>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" style={FONT} className={campInputCls} />
        </div>

        <LanguageField value={language} onChange={setLanguage} listId="edit-campaign-languages" />

        {/* Country is set on creation only - shown read-only here. */}
        <div>
          <label className={campFieldLbl}>Target country</label>
          <div className="flex items-center gap-2 rounded-lg border border-[#ece8df] bg-[#f5f2ec] px-3.5 py-2.5 text-[13px] text-[#62655c]">
            <span>{campaign.country ? countryName(campaign.country) : 'Not set'}</span>
            {isEuCountry(campaign.country) && <EuBadge />}
          </div>
          <p className="mt-1 text-[11px] text-[#9a9d92]">Set when the campaign is created and can't be changed.</p>
        </div>

        <div>
          <label className={campFieldLbl}>Channel</label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]"><SelectValue /></SelectTrigger>
            <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="border-t border-[#f0ede6] pt-3">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Prospect discovery (Apify)</p>
          <div className="flex flex-col gap-3">
            <SuggestForMe
              clientId={campaign.client_id}
              queries={queries.split(',').map((s) => s.trim()).filter(Boolean)}
              locations={areasToLocationLabels(areas)}
              onAddQuery={(term) => setQueries((q) => {
                const parts = q.split(',').map((s) => s.trim()).filter(Boolean);
                return parts.includes(term) ? q : [...parts, term].join(', ');
              })}
              onAddLocation={(loc) => setAreas((a) => (a.some((x) => x.label === loc) ? a : [...a, { mode: 'text', label: loc }]))}
            />
            <div>
              <label className={campFieldLbl}>Search terms <span className="normal-case font-normal">(comma-separated)</span></label>
              <input value={queries} onChange={(e) => setQueries(e.target.value)} placeholder="hotels, lodges, guesthouses" style={FONT} className={campInputCls} />
              <p className="mt-1 text-[11px] text-[#9a9d92]">Business types, not job titles - 3 to 5 terms works best.</p>
            </div>
            <LocationAreaInput
              label="Locations"
              helper="Add a city or area, or a radius around a point. Plain places and radius areas share one list (max 25)."
              values={areas}
              onChange={setAreas}
              maxItems={25}
              capLabel="location"
            />
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className={campFieldLbl}>Max results per run</label>
                <input type="number" min={1} max={1000} value={maxResults} onChange={(e) => setMaxResults(Math.min(1000, Number(e.target.value)))} style={FONT} className={campInputCls} />
                <p className="mt-1 text-[11px] text-[#9a9d92]">Higher counts tend to yield more replies. Capped at 1,000 per campaign.</p>
              </div>
              <label className="mb-2.5 flex cursor-pointer items-center gap-2 text-[13px] text-[#62655c]">
                <input type="checkbox" checked={scrapeEnabled} onChange={(e) => setScrapeEnabled(e.target.checked)} className="accent-[#3c7a5b]" />
                Enable scraping
              </label>
            </div>
          </div>
        </div>
        {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </CampModalShell>
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
      <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
        <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Delete campaign</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#fdf0ec] px-4 py-4">
          <p className="m-0 text-[14px] font-bold text-[#a8533a]">
            Permanently delete "{campaign.name}"?
          </p>
          <p className="m-0 mt-1.5 text-[13px] text-[#a8533a]/80">
            This cannot be undone. All prospects, messages, and replies tied to this campaign will be deleted.
          </p>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">This will permanently delete:</p>
          {!counts ? (
            <div className="flex items-center gap-2 text-[13px] text-[#9a9d92]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#ddd8cb] border-t-[#a8533a]" />
              Counting affected records…
            </div>
          ) : blastItems.length === 0 ? (
            <p className="text-[13px] text-[#62655c]">No associated records - the campaign row only.</p>
          ) : (
            <ul className="m-0 list-none p-0 flex flex-col gap-1">
              {blastItems.map((item) => (
                <li key={String(item)} className="flex items-center gap-2 text-[13px] text-[#62655c]">
                  <span className="text-[#a8533a]">✕</span>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
        {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
      </div>
      <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
        <button onClick={onClose} className={ghostCls}>Cancel</button>
        <button
          onClick={confirm}
          disabled={busy || !counts}
          className="cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#a8533a] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#8a3f2b] disabled:opacity-50"
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
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]">
            <img src="https://cdn-icons-png.flaticon.com/128/9679/9679459.png" className="w-10 h-10" alt="" />
            Hot leads
          </h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{rows.length} qualified opportunities, all clients</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP_HOT_LEADS} />
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={4} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No hot leads yet.</strong>
          <span className="text-[13px] text-[#62655c]">Leads appear here when prospects reply with buying intent.</span>
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
                        ? 'bg-[#edf4ef] border-transparent text-[#3c7a5b] font-bold'
                        : 'bg-white border-[#ddd8cb] text-[#62655c] font-semibold hover:border-[#3c7a5b]'
                    }`}
                  >
                    {tab.label}
                    {cnt > 0 && (
                      <span className={`inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10.5px] font-bold ${
                        active ? 'bg-[#3c7a5b]/10 text-[#3c7a5b]' : 'bg-[#f5f2ec] text-[#9a9d92]'
                      }`}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#9a9d92] rounded-xl border border-[#e8e3da] bg-white">
                No leads in this category.
              </div>
            ) : (
              <div className="rounded-xl border border-[#e8e3da] bg-white overflow-hidden">
                <div className="divide-y divide-[#f5f2ec]">
                  {paged.map((lead) => {
                    const pill = LEAD_PILL[lead.status] ?? LEAD_PILL.new;
                    const dotColor = lead.status === 'won' ? '#3c7a5b'
                      : lead.status === 'new' ? '#3c7a5b'
                      : lead.status === 'contacted' ? '#b9831f'
                      : '#c4bfb5';
                    return (
                      <button
                        key={lead.id}
                        onClick={() => setOpenId(lead.id)}
                        className="flex w-full cursor-pointer items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[#fbf9f5]"
                      >
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-[14px] text-[#20211c]">{lead.prospect?.business_name ?? 'Unknown'}</span>
                            <span style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
                              className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]">
                              {HL_STATUS_LABEL[lead.status] ?? lead.status}
                            </span>
                          </div>
                          {lead.prospect?.category && (
                            <p className="mt-0.5 text-[12px] text-[#9a9d92]">
                              {lead.prospect.category}{lead.prospect.location ? ` · ${lead.prospect.location}` : ''}
                            </p>
                          )}
                          {lead.client?.business_name && (
                            <p className="mt-0.5 text-[12px] text-[#62655c]">{lead.client.business_name}</p>
                          )}
                          {lead.ai_summary && (
                            <p className="mt-1.5 line-clamp-2 text-[13px] text-[#62655c]">{lead.ai_summary}</p>
                          )}
                        </div>
                        <ChevronRight size={15} className="mt-1.5 shrink-0 text-[#c4bfb5]" />
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
                      active ? 'border-[#3c7a5b] text-[#3c7a5b]' : 'border-transparent text-[#9a9d92] hover:text-[#62655c]'
                    }`}
                  >
                    {tab.label}
                    {cnt > 0 && (
                      <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${
                        active ? 'bg-[#edf4ef] text-[#3c7a5b]' : 'bg-[#f5f2ec] text-[#9a9d92]'
                      }`}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#9a9d92]">No leads in this category.</div>
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
                            <div className="font-semibold text-[#20211c]">{lead.prospect?.business_name ?? 'Unknown'}</div>
                            {lead.prospect?.category && (
                              <div className="mt-0.5 text-[12px] text-[#9a9d92]">
                                {lead.prospect.category}{lead.prospect.location ? ` · ${lead.prospect.location}` : ''}
                              </div>
                            )}
                          </td>
                          <td className="align-top text-[#62655c]">{lead.client?.business_name ?? '-'}</td>
                          <td className="max-w-[340px] align-top">
                            <p className="m-0 line-clamp-1 text-[#62655c]">{lead.ai_summary ?? '-'}</p>
                          </td>
                          <td className="align-top">
                            <span className="atbl-pill" style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}>
                              {HL_STATUS_LABEL[lead.status] ?? lead.status}
                            </span>
                          </td>
                          <td className="px-3 align-top text-right">
                            <ChevronRight size={15} className="text-[#c4bfb5]" />
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
            onStatus={(id, s) => { setStatus(id, s); setOpenId(null); }}
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
  const pill = LEAD_PILL[lead.status] ?? LEAD_PILL.new;
  const p    = lead.prospect;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[560px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <span
            style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]"
          >
            {HL_STATUS_LABEL[lead.status] ?? lead.status}
          </span>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          {/* Identity */}
          <div>
            <h2 className="m-0 text-[20px] font-extrabold leading-tight text-[#20211c]">
              {p?.business_name ?? 'Unknown business'}
            </h2>
            {p?.category && (
              <p className="m-0 mt-1 text-[13px] text-[#9a9d92]">
                {p.category}{p.location ? ` · ${p.location}` : ''}
              </p>
            )}
            {lead.client?.business_name && (
              <p className="m-0 mt-1.5 text-[12px] font-semibold text-[#62655c]">
                Client: {lead.client.business_name}
              </p>
            )}
          </div>

          {/* AI summary */}
          {lead.ai_summary && (
            <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] p-4">
              <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">What they want</div>
              <p className="m-0 text-[13.5px] leading-relaxed text-[#20211c]">{lead.ai_summary}</p>
              {lead.suggested_action && (
                <p className="m-0 mt-2 text-[12.5px] text-[#3c7a5b]">→ {lead.suggested_action}</p>
              )}
            </div>
          )}

          {/* Their reply */}
          {lead.reply?.body && (
            <div>
              <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">Their reply</div>
              <blockquote className="m-0 rounded-xl border-l-4 border-[#ddd8cb] bg-[#fbf9f5] px-4 py-3 text-[13px] italic leading-relaxed text-[#62655c]">
                {lead.reply.body}
              </blockquote>
            </div>
          )}
        </div>

        {/* Footer: status actions (only when not already closed) */}
        {lead.status !== 'won' && lead.status !== 'lost' && (
          <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex gap-2.5">
            <button
              onClick={() => onStatus(lead.id, 'won')}
              className="cursor-pointer flex-1 rounded-xl border-0 bg-[#3c7a5b] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46]"
            >
              Mark as Won ✓
            </button>
            <button
              onClick={() => onStatus(lead.id, 'lost')}
              className="cursor-pointer flex-1 rounded-xl border border-[#a8533a] bg-transparent px-4 py-2.5 text-[13px] font-bold text-[#a8533a] transition-colors hover:bg-[#f6e8e2]"
            >
              Not interested
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
