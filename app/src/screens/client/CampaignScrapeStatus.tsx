// The client Campaigns page's "Finding prospects" column and the window behind its chips.
// Same states and breakdown as the admin page (lib/campaignScrape.ts), minus the admin's
// actions: no Queue scrape, no Retry, no raw technical error.
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Check, Clock, Info, MapPin, Search } from 'lucide-react';
import { ModalClose } from '../../components/ModalClose';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { btn } from '../../lib/clientButtons';
import { getScrapeFailureCopy } from '../../lib/scrapeFailures';
import { scrapeSummaryLabel, sinceLabel, type ClientScrapeState, type ScrapeFields } from '../../lib/campaignScrape';
import { areaShortLabel, campaignAreas, type TargetArea } from '../../lib/targetAreas';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** The state line for one campaign. `onOpenFailure` opens the window that says what went wrong. */
export function ClientScrapeCell({ state, launched, onOpenFailure }: {
  state: ClientScrapeState;
  /** False for drafts, scheduled and in-review campaigns: nothing has been searched yet. */
  launched: boolean;
  onOpenFailure: () => void;
}) {
  switch (state.kind) {
    case 'queued':
      return (
        <Cell
          icon={<Clock size={12} strokeWidth={2.5} aria-hidden />}
          tone="text-(--ad-green)"
          label="Queued"
          sub={`${sinceLabel(state.since)} · ${state.ahead === null || state.ahead === 0 ? 'next in line' : `${state.ahead} ahead`}`}
          title="Waiting for the prospect finder. It takes one campaign at a time and usually starts within a few minutes."
        />
      );
    case 'delayed':
      return (
        <Cell
          icon={<AlertCircle size={12} strokeWidth={2.5} aria-hidden />}
          tone="text-(--ad-clay)"
          label="Taking longer than usual"
          sub={`Queued since ${shortDate(state.since)} · contact us if this continues`}
        />
      );
    case 'running':
      return (
        <Cell
          icon={<span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-(--ad-line) border-t-(--ad-green)" />}
          tone="text-(--ad-green)"
          label="Finding prospects"
          sub={state.since ? `Started ${sinceLabel(state.since)}` : undefined}
          title="Searching for businesses that match this campaign. Usually takes 10-15 minutes."
        />
      );
    case 'failed':
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenFailure(); }}
          title="What went wrong"
          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border-0 bg-(--ad-clay-tint) px-2 py-0.5 text-[11.5px] font-semibold text-(--ad-clay) transition-opacity hover:opacity-75"
        >
          Couldn't find prospects
          <Info size={11} strokeWidth={2.5} className="opacity-60" aria-hidden />
        </button>
      );
    case 'done':
      return <Cell icon={<Check size={12} strokeWidth={2.75} aria-hidden />} tone="text-(--ad-ink-soft)" label="Done" sub={`Last scraped ${shortDate(state.at)}`} />;
    case 'never':
      return <Cell tone="text-(--ad-ink-soft)" label={launched ? 'Not searched yet' : 'Not launched yet'} />;
  }
}

function Cell({ icon, tone, label, sub, title }: { icon?: React.ReactNode; tone: string; label: string; sub?: string; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${tone}`}>{icon}{label}</span>
      {sub && <div className="mt-1 truncate text-[11px] text-(--ad-ink-faint)">{sub}</div>}
    </div>
  );
}

type DetailCampaign = ScrapeFields & {
  name: string;
  search_queries: string[];
  target_locations: string[];
  target_areas: TargetArea[] | null;
  scrape_failure_reason: string | null;
};

/**
 * What the last search found (behind the "+147 new" chip), or what went wrong (behind
 * "Couldn't find prospects"). Failure copy is the client-language text in scrapeFailures.ts;
 * a problem only we can fix says so instead of showing the technical error.
 */
export function ClientScrapeDetailModal({ campaign, failed, awaiting, approvalsPath, onEditCampaign, onClose }: {
  campaign: DetailCampaign;
  failed: boolean;
  /** Prospects from this campaign waiting for approval. */
  awaiting: number;
  approvalsPath: string;
  /** Opens the campaign to fix its search, for failures the client can fix. Absent when read-only. */
  onEditCampaign?: () => void;
  onClose: () => void;
}) {
  const copy = failed ? getScrapeFailureCopy(campaign.scrape_failure_reason) : null;
  const sr = scrapeSummaryLabel(campaign);
  const s = campaign.last_scrape_summary;
  const stats = s && !failed ? [
    ['Businesses found', s.total_scraped],
    ['With an email address', s.total_with_email],
    ['Already in your list', s.skipped_duplicate],
    ['On your do-not-contact list', s.skipped_dnc],
  ] as const : [];
  const areas = campaignAreas(campaign);

  return (
    <motion.div
      className="fixed inset-0 z-60 flex flex-col md:items-center md:justify-center md:bg-[rgba(14,8,34,0.45)] md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.div
        style={FONT}
        role="dialog"
        aria-modal="true"
        aria-label={failed ? "Couldn't find prospects" : 'Last search'}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[460px] md:rounded-md md:border md:border-(--ad-line)"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--ad-line) px-5 py-4">
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">{failed ? "Couldn't find prospects" : 'Last search'}</p>
            <h2 className="m-0 mt-0.5 truncate text-[17px] font-semibold text-(--ad-ink)" title={campaign.name}>{campaign.name}</h2>
            {campaign.last_scraped_at && !failed && (
              <p className="m-0 mt-0.5 text-[11.5px] text-(--ad-ink-faint)">Last scraped {shortDate(campaign.last_scraped_at)}</p>
            )}
          </div>
          <ModalClose onClick={onClose} />
        </div>

        <div className="modal-scroll flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {copy ? (
            <>
              <p className="m-0 text-[14px] leading-relaxed text-(--ad-ink)">{copy.message}</p>
              {copy.userFixable && copy.fix ? (
                <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface-2) px-4 py-3.5">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">How to fix it</p>
                  <p className="m-0 mt-1 text-[13px] leading-relaxed text-(--ad-ink)">{copy.fix}</p>
                </div>
              ) : (
                <p className="m-0 text-[13px] leading-relaxed text-(--ad-ink-soft)">
                  This went wrong on our side, not in your campaign. Contact us if it isn't sorted out within a day.
                </p>
              )}
            </>
          ) : (
            <>
              <p className={`m-0 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold ${sr.tone === 'positive' ? 'bg-(--ad-green-tint) text-(--ad-green)' : 'bg-(--ad-surface-2) text-(--ad-ink)'}`}>{sr.text}</p>
              {stats.length > 0 && (
                <dl className="m-0 grid grid-cols-2 gap-2.5">
                  {stats.map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-(--ad-line) px-3.5 py-2.5">
                      <dt className="text-[11.5px] text-(--ad-ink-soft)">{label}</dt>
                      <dd className="m-0 mt-0.5 text-[18px] font-semibold text-(--ad-ink)">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}

          <div className="flex flex-col gap-2 border-t border-(--ad-fill) pt-4">
            <p className="m-0 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-(--ad-ink-faint)">
              <Search size={11} strokeWidth={2.5} aria-hidden /> Searched for
            </p>
            {campaign.search_queries.length === 0 ? (
              <p className="m-0 text-[12.5px] text-(--ad-ink-soft)">No search terms yet</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {campaign.search_queries.map((t, i) => (
                  <span key={`${t}-${i}`} className="rounded-full bg-(--ad-green-tint) px-2 py-0.5 text-[11.5px] font-semibold text-(--ad-green)">{t}</span>
                ))}
              </div>
            )}
            <p className="m-0 flex items-center gap-1.5 text-[12.5px] text-(--ad-ink-soft)">
              <MapPin size={12} strokeWidth={2.5} aria-hidden />
              {areas.length === 0 ? 'No locations yet' : areas.map(areaShortLabel).join(', ')}
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex gap-2.5">
          <button type="button" onClick={onClose} className={`${btn('secondary', 'lg')} flex-1`}>Close</button>
          {copy?.userFixable && onEditCampaign ? (
            <button type="button" onClick={() => { onEditCampaign(); onClose(); }} className={`${btn('primary', 'lg')} flex-1`}>Edit campaign</button>
          ) : !failed && awaiting > 0 ? (
            <Link to={approvalsPath} className={`${btn('primary', 'lg')} flex-1 justify-center no-underline`}>
              Review {awaiting} prospect{awaiting === 1 ? '' : 's'}
            </Link>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
