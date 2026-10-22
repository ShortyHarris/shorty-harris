import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useClientDashboard } from '../../hooks/useClientDashboard';
import { useClientApprovals } from '../../hooks/useClientApprovals';
import { useWarmProspects, useProspectMessages, type WarmProspect, type CallOutcome } from '../../hooks/useWarmProspects';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import type { HotLead, HotLeadStatus, CallOutcomeValue } from '../../types';
import { RefreshCw, ChevronRight, Zap, MessageSquare, Trophy, XCircle, TrendingUp, Minus, ClipboardCheck, Flame, Phone, PhoneCall, Mail, PauseCircle, X, Sparkles, ArrowRight, BellRing, Search, ChevronLeft } from 'lucide-react';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import './Dashboard.css';

const HELP: HelpContent = {
  title: 'Hot Leads',
  body: [
    { type: 'p', text: "Here you'll find every business that replied to your outreach with genuine interest. We contact them on your behalf - when one sounds serious, they appear here as a Hot Lead." },
    { type: 'p', text: "Tap any lead to read what they said and see our suggested next step. Update the status as your conversation progresses." },
    { type: 'ul', items: [
      "Open - new or seen, call or email them first",
      "Contacted - you're already in conversation",
      "Won - deal closed",
      "Lost - didn't work out this time",
    ]},
    { type: 'p', text: "Credits are only deducted when a Hot Lead is confirmed - not for every email we send on your behalf." },
  ],
};

const PAGE_SIZE = 8;

// Mirrors the hot_leads.status CHECK constraint: new | viewed | contacted | won | lost.
// hot_lead_queue returns every status, so all filtering happens here.
type Filter = 'all' | 'open' | 'contacted' | 'won' | 'lost';

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

const STATUS_LABEL: Record<HotLeadStatus, string> = {
  new: 'New',
  viewed: 'Seen',
  contacted: 'Contacted',
  won: 'Won',
  lost: 'Lost',
};

function isOpen(lead: HotLead): boolean {
  return lead.status === 'new' || lead.status === 'viewed';
}

function matchesFilter(lead: HotLead, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return isOpen(lead);
  return lead.status === filter;
}

function isClosed(lead: HotLead): boolean {
  return lead.status === 'won' || lead.status === 'lost';
}

// Unactioned leads first (longest-waiting first within that group), closed
// leads last (most recently closed first) - surfacing urgency is the whole
// point here, since nothing previously conveyed how long a lead had been
// sitting untouched.
function sortLeads(a: HotLead, b: HotLead): number {
  const aOpen = !isClosed(a);
  const bOpen = !isClosed(b);
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  if (aOpen) {
    const aw = a.hours_waiting ?? -1;
    const bw = b.hours_waiting ?? -1;
    if (aw !== bw) return bw - aw;
    return new Date(a.routed_at).getTime() - new Date(b.routed_at).getTime();
  }
  return new Date(b.closed_at ?? b.routed_at).getTime() - new Date(a.closed_at ?? a.routed_at).getTime();
}

type WaitingTone = 'neutral' | 'warning' | 'urgent';

function waitingInfo(lead: HotLead): { text: string; tone: WaitingTone } | null {
  if (lead.hours_waiting == null) return null;
  const h = lead.hours_waiting;
  if (h < 24) return { text: h <= 1 ? 'New - just now' : `New - ${h} hours ago`, tone: 'neutral' };
  const days = Math.max(1, Math.round(h / 24));
  if (h < 72) return { text: `Waiting ${days} day${days === 1 ? '' : 's'}`, tone: 'warning' };
  return { text: `Waiting ${days} day${days === 1 ? '' : 's'}`, tone: 'urgent' };
}

function formatClosedDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Dashboard({
  clientId, client = supabase, readOnly = false, basePath = '/app',
}: { clientId: string; client?: SupabaseClient; readOnly?: boolean; basePath?: string }) {
  const { leads, loading, error, setOutcome: setOutcomeRaw, reload, isFetching, dataUpdatedAt } = useClientDashboard(clientId, client);
  const { awaitingProspects = 0 } = useClientApprovals(clientId, client);
  const { prospects: warmProspects, loading: warmLoading, logCallOutcome: logCallOutcomeRaw } = useWarmProspects(clientId, client);
  const { toasts, toast, dismiss } = useToast();
  // Toast every real action. The automatic new -> viewed flip on open stays
  // silent on success (it isn't something the user did on purpose).
  const OUTCOME_TOAST: Partial<Record<HotLeadStatus, string>> = {
    contacted: 'Lead marked as in progress.',
    won: 'Lead marked as won.',
    lost: 'Lead marked as lost.',
  };
  const setOutcome: typeof setOutcomeRaw = readOnly
    ? async () => ({ error: null })
    : async (...args) => {
        const [, status] = args;
        const res = await setOutcomeRaw(...args);
        if (res.error) toast(res.error, 'error');
        else if (status && OUTCOME_TOAST[status]) toast(OUTCOME_TOAST[status]!);
        return res;
      };
  const logCallOutcome = readOnly
    ? async () => {}
    : async (prospectId: string, outcome: Parameters<typeof logCallOutcomeRaw>[1]) => {
        const res = await logCallOutcomeRaw(prospectId, outcome);
        if (res.error) toast(res.error, 'error'); else toast('Call outcome logged.');
      };
  const [historyProspect, setHistoryProspect] = useState<WarmProspect | null>(null);
  const [openId, setOpenId] = useState<string | null>(clientId === '__preview__' ? 'mock-0' : null);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkId = searchParams.get('lead');

  const openLead = leads.find((l) => l.hot_lead_id === openId) ?? null;
  const filtered = leads
    .filter((l) => matchesFilter(l, filter))
    .slice()
    .sort(sortLeads);

  const newCount = leads.filter((l) => l.status === 'new').length;
  const openCount = leads.filter(isOpen).length;
  const contactedCount = leads.filter((l) => l.status === 'contacted').length;
  const wonCount = leads.filter((l) => l.status === 'won').length;
  const lostCount = leads.filter((l) => l.status === 'lost').length;
  const closedTotal = wonCount + lostCount;
  const closeRate = closedTotal > 0 ? Math.round((wonCount / closedTotal) * 100) : null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function selectFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  function openLead_(lead: HotLead) {
    setOpenId(lead.hot_lead_id);
    // Only flip new -> viewed on an actual open, not on list render - marking
    // everything viewed on page load is what made four leads look
    // attended-to when nobody had read them.
    if (lead.status === 'new') setOutcome(lead.hot_lead_id, 'viewed');
  }

  // ?lead=<hot_lead_id> (from a notification click) opens that lead once the
  // queue has loaded, then drops the param so closing the panel sticks.
  useEffect(() => {
    if (!deepLinkId || loading) return;
    const lead = leads.find((l) => l.hot_lead_id === deepLinkId);
    if (lead) openLead_(lead);
    setSearchParams((prev) => { prev.delete('lead'); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, loading, leads]);

  async function handleRefresh() {
    try {
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to refresh leads.', 'error');
    }
  }

  return (
    <>
      {/* ─── Header ─── */}
      <div className="dash-head">
        <div className="dash-head-row">
          <div>
            <h1 className="dash-title">
              
              Hot Leads
            </h1>
            <p className="dash-sub">
              {newCount > 0
                ? `${newCount} ${newCount === 1 ? 'business' : 'businesses'} replied - ready for your call`
                : 'We\'re doing outreach on your behalf. New leads appear here when businesses reply.'}
            </p>
          </div>
          <HelpButton content={HELP} />
        </div>
      </div>

      {/* ─── Pending approvals banner ─── */}
      {awaitingProspects > 0 && (
        <Link to={`${basePath}/approvals`} className="appr-nudge">
          <span className="appr-nudge-icon"><ClipboardCheck size={16} strokeWidth={2} /></span>
          <span className="appr-nudge-text">
            <strong>{awaitingProspects} prospect{awaitingProspects === 1 ? '' : 's'}</strong> awaiting approval
          </span>
          <ChevronRight size={16} className="appr-nudge-arrow" />
        </Link>
      )}

      {/* ─── Warm prospects: opened but never replied ─── */}
      <div>
        {!warmLoading && warmProspects.length > 0 && (
          <WarmProspectsPanel prospects={warmProspects} onSelect={setHistoryProspect} />
        )}
      </div>

      {/* ─── Stat cards ─── */}
      <StatGrid
        openCount={openCount}
        contactedCount={contactedCount}
        wonCount={wonCount}
        lostCount={lostCount}
        closeRate={closeRate}
        onFilter={selectFilter}
      />

      {/* ─── Leads section ─── */}
      <div className="dash-leads">
        <div className="filter-bar" data-tour="lead-filters">
          {FILTER_TABS.map((tab) => {
            const count = leads.filter((l) => matchesFilter(l, tab.key)).length;
            return (
              <button
                key={tab.key}
                className={`filter-tab${filter === tab.key ? ' active' : ''}`}
                onClick={() => selectFilter(tab.key)}
              >
                {tab.label}
                {count > 0 && <span className="filter-badge">{count}</span>}
              </button>
            );
          })}
          <button
            className="filter-refresh"
            onClick={handleRefresh}
            disabled={isFetching}
            aria-label="Refresh leads"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
          {dataUpdatedAt > 0 && (
            <span className="filter-refresh-ts">
              {isFetching ? 'Updating…' : `Updated ${formatRelativeTime(dataUpdatedAt)}`}
            </span>
          )}
        </div>

        {error && <div className="lead-error-msg">{error}</div>}

        {loading ? (
          <LeadsSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyLeads filter={filter} leads={leads} onSwitchFilter={selectFilter} />
        ) : (
          <>
            {/* Mobile card list */}
            <div className="lead-list md:hidden">
              {paged.map((lead) => (
                <LeadRow key={lead.hot_lead_id} lead={lead} onOpen={() => openLead_(lead)} />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <LeadsTable leads={paged} onOpen={openLead_} />
            </div>

            {/* Shared by both layouts - phones were stuck on the first page. */}
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>

      <AnimatePresence>
        {openLead && (
          <LeadPanel
            key={openLead.hot_lead_id}
            lead={openLead}
            onClose={() => setOpenId(null)}
            onOutcome={setOutcome}
          />
        )}
        {historyProspect && (
          <WarmProspectHistoryModal
            key={historyProspect.prospect_id}
            prospect={historyProspect}
            client={client}
            onClose={() => setHistoryProspect(null)}
            onLogOutcome={(outcome) => { logCallOutcome(historyProspect.prospect_id, outcome); setHistoryProspect(null); }}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

/* ───── desktop leads table ───── */
function LeadsTable({ leads, onOpen }: { leads: HotLead[]; onOpen: (lead: HotLead) => void }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Business</th>
          <th>Summary</th>
          <th>Status</th>
          <th>Waiting</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => {
          const closed = isClosed(lead);
          const waiting = waitingInfo(lead);
          return (
            <tr key={lead.hot_lead_id} onClick={() => onOpen(lead)} style={{ cursor: 'pointer', opacity: closed ? 0.7 : 1 }}>
              <td className="align-top">
                <div className="font-semibold text-[14px] text-(--ink)">{lead.business_name}</div>
              </td>
              <td className="align-top max-w-105">
                <p className="m-0 text-[13px] text-(--ink-soft) line-clamp-1">
                  {closed ? (lead.outcome_note || '-') : (lead.ai_summary ?? '-')}
                </p>
              </td>
              <td className="align-top">
                <span className={`status-pill pill-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
              </td>
              <td className="align-top">
                {closed ? (
                  <span className="text-[12px] text-(--ink-faint)">{formatClosedDate(lead.closed_at)}</span>
                ) : waiting ? (
                  <span className={`waiting-pill waiting-${waiting.tone}`}>{waiting.text}</span>
                ) : (
                  <span className="text-[12px] text-(--ink-faint)">-</span>
                )}
              </td>
              <td className="align-top px-3 text-right">
                <ChevronRight size={15} className="text-(--line-strong)" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ───── pagination controls ───── */
function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="dash-pagination">
      <span className="text-[12.5px] text-(--ink-faint)">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button className="dash-page-btn" onClick={() => onChange(page - 1)} disabled={page <= 1}>Previous</button>
        <button className="dash-page-btn" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>Next</button>
      </div>
    </div>
  );
}

function EmptyLeads({
  filter,
  leads,
  onSwitchFilter,
}: {
  filter: Filter;
  leads: HotLead[];
  onSwitchFilter: (f: Filter) => void;
}) {
  const closedCount = leads.filter(isClosed).length;
  const allNudge = leads.length > 0 && (
    <button className="empty-nudge-btn" onClick={() => onSwitchFilter('all')}>
      See all {leads.length} lead{leads.length !== 1 ? 's' : ''} →
    </button>
  );

  if (filter === 'open') {
    return (
      <div className="leads-empty">
        <strong>No open leads right now - we're on it</strong>
        <span>
          We're reaching out to businesses on your behalf right now.
          As soon as one replies with interest, they'll show up here.
        </span>
        {closedCount > 0 && (
          <span className="leads-empty-note">
            You've closed {closedCount} lead{closedCount !== 1 ? 's' : ''} so far - great work!
          </span>
        )}
        {allNudge}
      </div>
    );
  }

  if (filter === 'contacted') {
    return (
      <div className="leads-empty">
        <strong>No contacted leads</strong>
        <span>
          Leads move here once you reply, call or log a call outcome.
        </span>
        {allNudge}
      </div>
    );
  }

  if (filter === 'won' || filter === 'lost') {
    return (
      <div className="leads-empty">
        <strong>No {filter} leads yet</strong>
        <span>
          After you contact a business, open them here and tap{' '}
          <strong>"Mark as Won"</strong> or <strong>"Not a fit"</strong>{' '}
          to keep everything organised.
        </span>
        {allNudge}
      </div>
    );
  }

  return (
    <div className="leads-empty">
      <strong>No leads yet</strong>
      <span>We're doing outreach on your behalf. Check back soon.</span>
    </div>
  );
}

function LeadRow({ lead, onOpen }: { lead: HotLead; onOpen: () => void }) {
  const closed = isClosed(lead);
  const waiting = waitingInfo(lead);
  return (
    <button className={`lead-row status-${lead.status}`} onClick={onOpen} style={closed ? { opacity: 0.7 } : undefined}>
      <div className={`lead-dot dot-${lead.status}`} />
      <div className="lead-row-body">
        <div className="lead-row-top">
          <span className="lead-row-name">{lead.business_name}</span>
          <span className={`status-pill pill-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
        </div>
        {closed ? (
          <div className="lead-row-meta">
            {formatClosedDate(lead.closed_at)}{lead.outcome_note ? ` · ${lead.outcome_note}` : ''}
          </div>
        ) : (
          <>
            {waiting && <div className={`waiting-pill waiting-${waiting.tone}`} style={{ marginTop: 4 }}>{waiting.text}</div>}
            {lead.ai_summary && (
              <p className="lead-row-excerpt">{lead.ai_summary}</p>
            )}
          </>
        )}
      </div>
      <svg className="lead-row-arrow" width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
        <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

type OutcomeFn = (
  id: string, status: HotLeadStatus | null, note?: string, callOutcome?: CallOutcomeValue,
) => Promise<{ error: string | null }>;

/* Collapses anything over ~6 lines behind "show more" - the single most
   useful thing on the card (what the prospect actually said), so it
   shouldn't dominate the panel on long replies. */
function ReplyQuote({ body, receivedAt }: { body: string; receivedAt: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = body.length > 320 || body.split('\n').length > 6;
  return (
    <>
      <blockquote
        className="lp-quote"
        style={!expanded && isLong ? { display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}
      >
        {body}
      </blockquote>
      <div className="lp-quote-meta">
        {receivedAt && (
          <span>Received {new Date(receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        )}
        {isLong && (
          <button onClick={() => setExpanded((v) => !v)} className="lp-link">
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </>
  );
}

const CALL_OUTCOME_LABEL: Record<CallOutcomeValue, string> = {
  meeting_agreed: "We're meeting",
  call_later: 'Maybe later - call again',
  rejected: 'Not interested',
};

function LeadPanel({
  lead,
  onClose,
  onOutcome,
}: {
  lead: HotLead;
  onClose: () => void;
  onOutcome: OutcomeFn;
}) {
  const [showCallOutcomes, setShowCallOutcomes] = useState(false);
  const [showNotAFit, setShowNotAFit] = useState(false);
  const [notAFitNote, setNotAFitNote] = useState('');
  const [confirmWon, setConfirmWon] = useState(false);
  const [busy, setBusy] = useState(false);

  const closed = isClosed(lead);
  const waiting = waitingInfo(lead);
  const reply = lead.reply ?? lead.latest_reply;
  const replyIsFallback = !lead.reply && !!lead.latest_reply;
  const followUpsPaused = lead.status === 'new' || lead.status === 'viewed' || lead.status === 'contacted';

  async function replyNow() {
    if (lead.email) window.location.href = `mailto:${lead.email}`;
    if (lead.status === 'new' || lead.status === 'viewed') {
      setBusy(true);
      await onOutcome(lead.hot_lead_id, 'contacted');
      setBusy(false);
    }
  }

  async function logCallOutcome(outcome: CallOutcomeValue) {
    if (outcome === 'meeting_agreed') { setConfirmWon(true); return; }
    setBusy(true);
    const status: HotLeadStatus = outcome === 'rejected' ? 'lost' : 'contacted';
    await onOutcome(lead.hot_lead_id, status, undefined, outcome);
    setBusy(false);
    onClose();
  }

  async function confirmMeetingOutcome(markWon: boolean) {
    setBusy(true);
    await onOutcome(lead.hot_lead_id, markWon ? 'won' : 'contacted', undefined, 'meeting_agreed');
    setBusy(false);
    onClose();
  }

  async function markNotAFit() {
    setBusy(true);
    await onOutcome(lead.hot_lead_id, 'lost', notAFitNote.trim() || undefined);
    setBusy(false);
    onClose();
  }

  return (
    <motion.div
      className="panel-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.aside
        className="modal-card panel lead-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-handle" />

        <div className="panel-scroll lp-scroll">
          {/* ─── Header: status, name, urgency ─── */}
          <header className="lp-header">
            <div className="lp-header-top">
              <div className="lp-chips">
                <span className={`status-pill pill-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
                {!closed && waiting && (
                  <span className={`waiting-pill waiting-${waiting.tone}`}>{waiting.text}</span>
                )}
              </div>
              <button className="lp-close" onClick={onClose} aria-label="Close">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <h2 id="lp-title" className="lp-title">{lead.business_name}</h2>
            {lead.contact_name && <p className="lp-subtitle">{lead.contact_name}</p>}
            {!closed && lead.escalated && (
              <p className="lp-escalated">
                <BellRing size={14} strokeWidth={2} /> We've let the Shorty Harris team know.
              </p>
            )}
          </header>

          {closed ? (
            /* ─── Closed: just the record of what happened ─── */
            <div className="lp-closed">
              <div className="lp-eyebrow">Outcome</div>
              <p className="lp-closed-outcome">{lead.status === 'won' ? 'Won' : 'Not a fit'}</p>
              {lead.closed_at && <p className="lp-muted">Closed {formatClosedDate(lead.closed_at)}</p>}
              {lead.outcome_note && <p className="lp-closed-note">{lead.outcome_note}</p>}
            </div>
          ) : (
            <div className="lp-body">
              {/* ─── Left: what happened ─── */}
              <div className="lp-main">
                <section className="lp-section">
                  <div className="lp-eyebrow"><Sparkles size={13} strokeWidth={2.2} /> What they want</div>
                  <p className="lp-summary">{lead.ai_summary ?? 'They replied expressing interest.'}</p>
                  {lead.suggested_action && (
                    <div className="lp-next">
                      <span className="lp-next-icon"><ArrowRight size={15} strokeWidth={2.4} /></span>
                      <div>
                        <div className="lp-next-label">Suggested next step</div>
                        <p className="lp-next-text">{lead.suggested_action}</p>
                      </div>
                    </div>
                  )}
                </section>

                <section className="lp-section">
                  <div className="lp-eyebrow"><MessageSquare size={13} strokeWidth={2.2} /> What they said</div>
                  {reply?.body ? (
                    <>
                      <ReplyQuote body={reply.body} receivedAt={reply.received_at} />
                      {replyIsFallback && (
                        <p className="lp-muted lp-tight">Showing their most recent reply - the original isn't on record.</p>
                      )}
                    </>
                  ) : (
                    <div className="lp-empty">The original reply isn't on record for this lead.</div>
                  )}
                </section>

                {followUpsPaused && (
                  <p className="lp-footnote">
                    <PauseCircle size={15} strokeWidth={2} />
                    <span>Automated follow-ups to this person are paused - the conversation is yours now.</span>
                  </p>
                )}
              </div>

              {/* ─── Right: who + what to do ─── */}
              <aside className="lp-rail">
                {(lead.email || lead.phone) && (
                  <div className="lp-contact">
                    <div className="lp-eyebrow">Contact</div>
                    {lead.email && (
                      <a className="lp-contact-row" href={`mailto:${lead.email}`} title={lead.email}>
                        <Mail size={16} strokeWidth={2} />
                        <span className="lp-contact-value">{lead.email}</span>
                      </a>
                    )}
                    {lead.phone && (
                      <a className="lp-contact-row" href={`tel:${lead.phone}`}>
                        <Phone size={16} strokeWidth={2} />
                        <span className="lp-contact-value">{formatPhone(lead.phone)}</span>
                      </a>
                    )}
                  </div>
                )}

                <div className="lp-actions">
                  {lead.email && (
                    <button onClick={replyNow} disabled={busy} className="lp-btn lp-btn-primary">
                      <MailIcon /> Reply now
                    </button>
                  )}
                  {lead.phone && (
                    <div className="lp-btn-row">
                      <a className="lp-btn lp-btn-secondary" href={`tel:${lead.phone}`}>
                        <PhoneIcon /> Call
                      </a>
                      <a
                        className="lp-btn lp-btn-secondary"
                        href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="lp-wa"><WhatsAppIcon /></span> WhatsApp
                      </a>
                    </div>
                  )}
                </div>

                <div className="lp-divider" />

                {/* Secondary: log a call outcome */}
                {!showCallOutcomes && !confirmWon && (
                  <button onClick={() => setShowCallOutcomes(true)} className="lp-btn lp-btn-ghost">
                    <PhoneCall size={15} strokeWidth={2} /> Log a call outcome
                  </button>
                )}
                {showCallOutcomes && !confirmWon && (
                  <div className="lp-choices">
                    <div className="lp-choices-head">
                      <span className="lp-eyebrow lp-eyebrow-flat">How did the call go?</span>
                      <button className="lp-link" onClick={() => setShowCallOutcomes(false)}>Cancel</button>
                    </div>
                    {(Object.keys(CALL_OUTCOME_LABEL) as CallOutcomeValue[]).map((o) => (
                      <button
                        key={o}
                        disabled={busy}
                        className={`lp-choice ${o === 'meeting_agreed' ? 'lp-choice-won' : o === 'rejected' ? 'lp-choice-lost' : ''}`}
                        onClick={() => logCallOutcome(o)}
                      >
                        {CALL_OUTCOME_LABEL[o]}
                        <ChevronRight size={16} strokeWidth={2} />
                      </button>
                    ))}
                  </div>
                )}
                {confirmWon && (
                  <div className="lp-choices">
                    <p className="lp-confirm">Great news. Mark this lead as won too?</p>
                    <div className="lp-btn-row">
                      <button disabled={busy} className="lp-btn lp-btn-primary lp-btn-sm" onClick={() => confirmMeetingOutcome(true)}>Yes, mark won</button>
                      <button disabled={busy} className="lp-btn lp-btn-secondary lp-btn-sm" onClick={() => confirmMeetingOutcome(false)}>Not yet</button>
                    </div>
                  </div>
                )}

                {/* Tertiary: not a fit */}
                {!showNotAFit ? (
                  <button onClick={() => setShowNotAFit(true)} className="lp-not-fit">Not a fit</button>
                ) : (
                  <div className="lp-choices">
                    <textarea
                      value={notAFitNote}
                      onChange={(e) => setNotAFitNote(e.target.value)}
                      placeholder="Optional note - why it's not a fit"
                      rows={3}
                      className="lp-textarea"
                    />
                    <div className="lp-btn-row">
                      <button disabled={busy} onClick={markNotAFit} className="lp-btn lp-btn-danger lp-btn-sm">Confirm</button>
                      <button onClick={() => setShowNotAFit(false)} className="lp-btn lp-btn-secondary lp-btn-sm">Cancel</button>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
}

/* ───── skeleton loading ───── */
function LeadsSkeleton() {
  return (
    <>
      {/* Mobile skeleton rows */}
      <div className="lead-list md:hidden" aria-hidden>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border border-(--line) bg-(--surface)"
            style={{ borderRadius: 14, padding: '16px 18px', margin: '0 16px 10px', width: 'calc(100% - 32px)', minHeight: 72 }}
          >
            <div className="h-2.25 w-2.25 shrink-0 rounded-full bg-[#ddd8cb] animate-pulse" />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="h-4 w-2/5 rounded bg-[#ddd8cb] animate-pulse" />
                <div className="h-5 w-14 rounded-full bg-[#ddd8cb] animate-pulse" />
              </div>
              <div className="h-3 w-1/3 rounded bg-[#ece8df] animate-pulse" />
              <div className="h-3 w-5/6 rounded bg-[#ece8df] animate-pulse" />
            </div>
            <div className="w-2 h-3 shrink-0 rounded bg-[#ece8df] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Desktop skeleton table */}
      <div className="hidden md:block" aria-hidden>
        <table>
          <tbody>
            {[...Array(6)].map((_, i) => (
              <tr key={i}>
                <td>
                  <div className="h-4 w-40 rounded bg-[#ddd8cb] animate-pulse" />
                  <div className="mt-1.5 h-3 w-24 rounded bg-[#ece8df] animate-pulse" />
                </td>
                <td className="max-w-105">
                  <div className="h-3 w-4/5 rounded bg-[#ece8df] animate-pulse" />
                </td>
                <td>
                  <div className="h-5 w-16 rounded-full bg-[#ddd8cb] animate-pulse" />
                </td>
                <td className="w-10" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ───── warm prospects: opened repeatedly, never replied ───── */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function WarmProspectsPanel({
  prospects, onSelect,
}: {
  prospects: WarmProspect[];
  onSelect: (prospect: WarmProspect) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = prospects.slice(0, 3);

  return (
    <div className="dash-leads" data-tour="warm-prospects">
      <div className="warm-panel-head">
        <span className="warm-panel-icon"><Flame size={16} strokeWidth={2} /></span>
        <div>
          <h2 className="warm-panel-title">Worth a call</h2>
          <p className="warm-panel-sub">
            {prospects.length} {prospects.length === 1 ? 'business has' : 'businesses have'} opened your emails multiple times without replying
          </p>
        </div>
      </div>

      <div className="warm-list">
        {visible.map((p) => (
          <WarmRow key={p.prospect_id} p={p} onSelect={onSelect} />
        ))}
      </div>

      {prospects.length > 3 && (
        <button className="warm-toggle" onClick={() => setShowAll(true)}>
          View all {prospects.length}
        </button>
      )}

      <AnimatePresence>
        {showAll && (
          <WarmProspectsModal
            key="warm-all"
            prospects={prospects}
            onClose={() => setShowAll(false)}
            onSelect={onSelect}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function WarmRow({ p, onSelect }: { p: WarmProspect; onSelect: (prospect: WarmProspect) => void }) {
  return (
    <div className="warm-row" onClick={() => onSelect(p)}>
      <div className="warm-row-main">
        <span className="warm-row-name">{p.business_name}</span>
        <span className="warm-row-meta">
          {p.category ? `${p.category} · ` : ''}{p.location ?? ''}
        </span>
        {p.phone && <span className="warm-row-phone">{formatPhone(p.phone)}</span>}
      </div>
      <div className="warm-row-side">
        <span className="warm-opens-badge">{p.total_opens}x opened</span>
        <span className="warm-row-when">last opened {timeAgo(p.last_opened_at)}</span>
        <div className="warm-row-actions">
          {p.phone && (
            <a
              href={`tel:${p.phone}`}
              className="warm-call-btn"
              aria-label={`Call ${p.business_name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Phone size={14} />
            </a>
          )}
          <button
            className="warm-called-btn"
            onClick={(e) => { e.stopPropagation(); onSelect(p); }}
            title="Log how the call went"
          >
            <PhoneCall size={13} /> Log call
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───── all warm prospects: searchable, sortable, paged - no scrolling ───── */
const WARM_PAGE_SIZE = 8;
type WarmSort = 'opens' | 'recent';

function WarmProspectsModal({
  prospects, onClose, onSelect,
}: {
  prospects: WarmProspect[];
  onClose: () => void;
  onSelect: (prospect: WarmProspect) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<WarmSort>('opens');
  const [phoneOnly, setPhoneOnly] = useState(false);
  const [page, setPage] = useState(1);

  const q = query.trim().toLowerCase();
  const filtered = prospects
    .filter((p) => !phoneOnly || !!p.phone)
    .filter((p) => !q || [p.business_name, p.category, p.location, p.phone]
      .some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => sort === 'opens'
      ? b.total_opens - a.total_opens
      : new Date(b.last_opened_at ?? 0).getTime() - new Date(a.last_opened_at ?? 0).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / WARM_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * WARM_PAGE_SIZE, safePage * WARM_PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * WARM_PAGE_SIZE + 1;
  const to = Math.min(safePage * WARM_PAGE_SIZE, filtered.length);

  return (
    <motion.div
      className="panel-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.aside
        className="modal-card panel lead-sheet warm-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="warm-all-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-handle" />

        <header className="warm-all-head">
          <div className="lp-header-top">
            <div className="flex items-center gap-2.5">
              <span className="warm-panel-icon"><Flame size={18} strokeWidth={2} /></span>
              <h2 id="warm-all-title" className="warm-all-title">Worth a call</h2>
            </div>
            <button className="lp-close" onClick={onClose} aria-label="Close">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <p className="warm-all-sub">
            {prospects.length} {prospects.length === 1 ? 'business has' : 'businesses have'} opened your emails multiple times without replying. A quick call usually lands well.
          </p>

          <div className="warm-all-tools">
            <label className="warm-all-search">
              <Search size={15} strokeWidth={2} />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search name, type, town or phone"
                autoFocus
              />
            </label>
            <div className="warm-all-seg" role="tablist" aria-label="Sort">
              {([['opens', 'Most opens'], ['recent', 'Most recent']] as [WarmSort, string][]).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={sort === key}
                  className={sort === key ? 'active' : ''}
                  onClick={() => { setSort(key); setPage(1); }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className={`warm-all-chip ${phoneOnly ? 'active' : ''}`}
              onClick={() => { setPhoneOnly((v) => !v); setPage(1); }}
              aria-pressed={phoneOnly}
            >
              <Phone size={13} strokeWidth={2} /> Has phone
            </button>
          </div>
        </header>

        <div className="warm-all-list">
          {rows.length === 0 ? (
            <div className="warm-all-empty">No businesses match “{query}”.</div>
          ) : (
            rows.map((p) => <WarmRow key={p.prospect_id} p={p} onSelect={onSelect} />)
          )}
        </div>

        <footer className="warm-all-foot">
          <span>{from}–{to} of {filtered.length}</span>
          <div className="flex items-center gap-2">
            <button className="warm-all-page" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} aria-label="Previous page">
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className="warm-all-pageno">{safePage} / {totalPages}</span>
            <button className="warm-all-page" onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} aria-label="Next page">
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
        </footer>
      </motion.aside>
    </motion.div>
  );
}

const MSG_TYPE_LABEL: Record<string, string> = {
  initial: 'First touch',
  follow_up_d3: 'Follow-up D3',
  follow_up_d7: 'Follow-up D7',
  follow_up_d14: 'Follow-up D14',
};

/* ───── warm prospect detail: contact info + full send/open history ───── */
function WarmProspectHistoryModal({
  prospect, onClose, onLogOutcome, client = supabase,
}: { prospect: WarmProspect; onClose: () => void; onLogOutcome: (outcome: CallOutcome) => void; client?: SupabaseClient }) {
  const { messages, loading, error } = useProspectMessages(prospect.prospect_id, client);
  const sentCount = messages.filter((m) => m.sent_at).length;
  const subtitle = [prospect.category, prospect.location].filter(Boolean).join(' · ');

  return (
    <motion.div
      className="panel-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      {...useOverlayClose(onClose, { escape: true })}
    >
      <motion.aside
        className="modal-card panel lead-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wp-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-handle" />

        <div className="panel-scroll lp-scroll">
          {/* ─── Header ─── */}
          <header className="lp-header">
            <div className="lp-header-top">
              <div className="lp-chips">
                <span className="warm-opens-badge">{prospect.total_opens}x opened</span>
                {prospect.last_opened_at && (
                  <span className="waiting-pill waiting-neutral">Last opened {timeAgo(prospect.last_opened_at)}</span>
                )}
              </div>
              <button className="lp-close" onClick={onClose} aria-label="Close">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <h2 id="wp-title" className="lp-title">{prospect.business_name}</h2>
            {subtitle && <p className="lp-subtitle">{subtitle}</p>}
          </header>

          <div className="lp-body">
            {/* ─── Left: what they've seen ─── */}
            <div className="lp-main">
              <section className="lp-section">
                <div className="wp-history-head">
                  <div className="lp-eyebrow lp-eyebrow-flat"><Mail size={13} strokeWidth={2.2} /> Email history</div>
                  {!loading && !error && messages.length > 0 && (
                    <span className="wp-history-count">{sentCount} sent · {prospect.total_opens} opens</span>
                  )}
                </div>
                {loading ? (
                  <div className="lp-empty">Loading…</div>
                ) : error ? (
                  <div className="lp-empty" style={{ color: 'var(--clay)' }}>{error}</div>
                ) : messages.length === 0 ? (
                  <div className="lp-empty">No emails sent yet.</div>
                ) : (
                  <ol className="wp-timeline">
                    {messages.map((m) => {
                      const sent = !!m.sent_at;
                      const opened = m.open_count > 0;
                      return (
                        <li key={m.id} className="wp-item">
                          <span className={`wp-dot ${opened ? 'wp-dot-opened' : sent ? 'wp-dot-sent' : 'wp-dot-pending'}`} aria-hidden />
                          <div className="wp-item-main">
                            <div className="wp-item-subject" title={m.subject ?? undefined}>
                              {m.subject ?? MSG_TYPE_LABEL[m.message_type] ?? m.message_type}
                            </div>
                            <div className="wp-item-meta">
                              {MSG_TYPE_LABEL[m.message_type] ?? m.message_type}
                              {sent ? ` · sent ${timeAgo(m.sent_at)}` : ' · scheduled'}
                            </div>
                          </div>
                          {opened ? (
                            <span className="warm-opens-badge">{m.open_count}x</span>
                          ) : (
                            <span className="wp-item-status">{sent ? 'Not opened' : 'Not sent'}</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <p className="lp-footnote">
                <Flame size={15} strokeWidth={2} />
                <span>They keep opening but haven't replied - a short, friendly call often turns this into a conversation.</span>
              </p>
            </div>

            {/* ─── Right: reach out + log it ─── */}
            <aside className="lp-rail">
              {(prospect.phone || prospect.email) && (
                <div className="lp-contact">
                  <div className="lp-eyebrow">Contact</div>
                  {prospect.phone && (
                    <a className="lp-contact-row" href={`tel:${prospect.phone}`}>
                      <Phone size={16} strokeWidth={2} />
                      <span className="lp-contact-value">{formatPhone(prospect.phone)}</span>
                    </a>
                  )}
                  {prospect.email && (
                    <a className="lp-contact-row" href={`mailto:${prospect.email}`} title={prospect.email}>
                      <Mail size={16} strokeWidth={2} />
                      <span className="lp-contact-value">{prospect.email}</span>
                    </a>
                  )}
                </div>
              )}

              <div className="lp-actions">
                {prospect.phone && (
                  <a className="lp-btn lp-btn-primary" href={`tel:${prospect.phone}`}>
                    <Phone size={16} strokeWidth={2.2} /> Call now
                  </a>
                )}
                {prospect.email && (
                  <a className={`lp-btn ${prospect.phone ? 'lp-btn-secondary' : 'lp-btn-primary'}`} href={`mailto:${prospect.email}`}>
                    <Mail size={16} strokeWidth={2} /> Email
                  </a>
                )}
              </div>

              <div className="lp-divider" />

              <div className="lp-choices">
                <div className="lp-eyebrow lp-eyebrow-flat">How did the call go?</div>
                <button className="lp-choice lp-choice-won" onClick={() => onLogOutcome('meeting_agreed')}>
                  Let's meet - make it a hot lead
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
                <button className="lp-choice" onClick={() => onLogOutcome('call_later')}>
                  Maybe later - call again
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
                <button className="lp-choice lp-choice-lost" onClick={() => onLogOutcome('rejected')}>
                  Not interested
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
              </div>
            </aside>
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}


/* ───── stat cards ───── */
function StatGrid({
  openCount, contactedCount, wonCount, lostCount, closeRate, onFilter,
}: {
  openCount: number; contactedCount: number;
  wonCount: number; lostCount: number;
  closeRate: number | null;
  onFilter: (f: Filter) => void;
}) {
  const cards = [
    {
      icon: Zap,
      iconColor: 'var(--amber)',
      label: 'Open',
      value: openCount,
      TrendIcon: openCount > 0 ? TrendingUp : Minus,
      trendText: openCount > 0 ? 'needs your call' : 'all caught up',
      trendColor: openCount > 0 ? 'var(--amber)' : 'var(--ink-faint)',
      filter: 'open' as Filter,
    },
    {
      icon: MessageSquare,
      iconColor: 'var(--leaf)',
      label: 'Contacted',
      value: contactedCount,
      TrendIcon: Minus,
      trendText: 'active conversations',
      trendColor: 'var(--ink-faint)',
      filter: 'contacted' as Filter,
    },
    {
      icon: Trophy,
      iconColor: 'var(--leaf)',
      label: 'Won',
      value: wonCount,
      TrendIcon: closeRate !== null ? TrendingUp : Minus,
      trendText: closeRate !== null ? `${closeRate}% close rate` : '-',
      trendColor: closeRate !== null && closeRate > 0 ? 'var(--leaf)' : 'var(--ink-faint)',
      filter: 'won' as Filter,
    },
    {
      icon: XCircle,
      iconColor: 'var(--clay)',
      label: 'Lost',
      value: lostCount,
      TrendIcon: Minus,
      trendText: lostCount > 0 ? 'closed without deal' : '-',
      trendColor: 'var(--ink-faint)',
      filter: 'lost' as Filter,
    },
  ];

  return (
    <div className="stat-grid" data-tour="dashboard-stats">
      {cards.map((c) => {
        return (
          <button key={c.label} className="stat-card" onClick={() => onFilter(c.filter)}>
            <div className="stat-card-header">
             
              <span className="stat-label">{c.label}</span>
            </div>
            <div className="stat-value">{c.value}</div>
            
          </button>
        );
      })}
    </div>
  );
}

/* ───── reach-row icons - real Font Awesome glyphs ───── */
function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor">
      <path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2-46.3 11.6l-40.4 49.3c-72.2-37.7-130.6-96.2-168.3-168.3l49.3-40.4c13.6-11.2 18.4-30 11.6-46.3l-40-96z" />
    </svg>
  );
}
function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 448 512" fill="currentColor">
      <path d="M380.9 97.1C339 55.1 283.2 32 224.1 32c-122.4 0-222 99.6-222 222 0 39.2 10.4 77.7 30 111.4L4.5 480l117.8-31.2c32.5 17.7 69.1 27 106.6 27 122.4 0 222-99.6 222-222 0-59.1-23.1-114.9-65.1-156.7zM224.1 437.6c-32.5 0-64.4-8.7-92.1-25.2l-6.6-3.9-68.5 18.1 18.3-66.7-4.3-6.9c-18.9-30-28.9-64.6-28.9-100.1 0-103.5 84.2-187.7 187.7-187.7 50.2 0 97.4 19.6 132.9 55.1 35.5 35.5 56.6 82.7 56.5 132.9 0 103.5-84.2 187.7-187.7 187.7zm104.4-138.2c-5.6-2.8-33.4-16.5-38.6-18.4-5.2-1.9-9-2.8-12.8 2.8-3.8 5.6-14.7 18.4-18 22.2-3.3 3.8-6.6 4.2-12.2 1.4-32.9-16.4-54.5-29.3-76.1-66.4-5.8-9.9-1.4-9.9 4.1-19.3 1.6-2.8 4.1-7.4 6.2-11.1 2.1-3.8 1-6.6-.6-9.4-1.6-2.8-13.6-32.7-18.6-44.8-4.9-11.8-9.9-10.2-13.6-10.4-3.5-.2-7.5-.2-11.5-.2-4.1 0-10.6 1.5-16.2 7.5-5.6 6-21.4 20.9-21.4 51 0 30.1 21.9 59.2 24.9 63.3 3 4.1 41.6 63.5 100.9 86.5 50.4 19.7 60.7 15.8 71.7 14.8 11-1 35.4-14.5 40.4-28.5 5-14 5-26 3.5-28.5-1.4-2.5-5.2-4-10.8-6.8z" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor">
      <path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48L48 64zM0 176L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-208L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z" />
    </svg>
  );
}
