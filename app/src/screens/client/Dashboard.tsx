import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClientDashboard } from '../../hooks/useClientDashboard';
import type { HotLead, HotLeadStatus } from '../../types';
import { RefreshCw, ChevronRight, Zap, MessageSquare, Trophy, XCircle, TrendingUp, Minus } from 'lucide-react';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import './Dashboard.css';

const HELP: HelpContent = {
  title: 'Hot Leads',
  body: [
    { type: 'p', text: "Here you'll find every business that replied to your outreach with genuine interest. We contact them on your behalf — when one sounds serious, they appear here as a Hot Lead." },
    { type: 'p', text: "Tap any lead to read what they said and see our suggested next step. Update the status as your conversation progresses." },
    { type: 'ul', items: [
      "New — just arrived, call or email them first",
      "In Progress — you're already in conversation",
      "Won — deal closed",
      "Lost — didn't work out this time",
    ]},
    { type: 'p', text: "Credits are only deducted when a Hot Lead is confirmed — not for every email we send on your behalf." },
  ],
};

const PAGE_SIZE = 8;

type Filter = 'new' | 'active' | 'all' | 'closed';

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'active', label: 'In Progress' },
  { key: 'all', label: 'All' },
  { key: 'closed', label: 'Closed' },
];

const STATUS_LABEL: Record<HotLeadStatus, string> = {
  new: 'New',
  viewed: 'Seen',
  contacted: 'In progress',
  won: 'Won',
  lost: 'Lost',
};

// Display order wherever leads are listed: New, Seen, In progress, Won, Lost.
const STATUS_ORDER: Record<HotLeadStatus, number> = {
  new: 0,
  viewed: 1,
  contacted: 2,
  won: 3,
  lost: 4,
};

function matchesFilter(lead: HotLead, filter: Filter): boolean {
  if (filter === 'new') return lead.status === 'new';
  if (filter === 'active') return lead.status === 'viewed' || lead.status === 'contacted';
  if (filter === 'closed') return lead.status === 'won' || lead.status === 'lost';
  return true;
}

export function Dashboard({ clientId }: { clientId: string }) {
  const { leads, loading, error, setStatus, reload } = useClientDashboard(clientId);
  const [openId, setOpenId] = useState<string | null>(clientId === '__preview__' ? 'mock-0' : null);
  const [filter, setFilter] = useState<Filter>('new');
  const [page, setPage] = useState(1);

  const openLead = leads.find((l) => l.id === openId) ?? null;
  const filtered = leads
    .filter((l) => matchesFilter(l, filter))
    .slice()
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const newCount = leads.filter((l) => l.status === 'new').length;
  const inProgressCount = leads.filter((l) => l.status === 'viewed' || l.status === 'contacted').length;
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
    setOpenId(lead.id);
    if (lead.status === 'new') setStatus(lead.id, 'viewed');
  }

  return (
    <>
      {/* ─── Header ─── */}
      <div className="dash-head">
        <div className="dash-head-row">
          <div>
            <h1 className="dash-title">
              <Zap size={18} className="dash-title-icon" />
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

      {/* ─── Stat cards ─── */}
      <StatGrid
        newCount={newCount}
        inProgressCount={inProgressCount}
        wonCount={wonCount}
        lostCount={lostCount}
        closeRate={closeRate}
        onFilter={selectFilter}
      />

      {/* ─── Leads section ─── */}
      <div className="dash-leads">
        <div className="filter-bar">
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
          <button className="filter-refresh" onClick={reload} aria-label="Refresh leads">
            <RefreshCw size={15} />
          </button>
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
                <LeadRow key={lead.id} lead={lead} onOpen={() => openLead_(lead)} />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <LeadsTable leads={paged} onOpen={openLead_} />
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {openLead && (
          <LeadPanel
            key={openLead.id}
            lead={openLead}
            onClose={() => setOpenId(null)}
            onStatus={setStatus}
          />
        )}
      </AnimatePresence>
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
          <th />
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => {
          const p = lead.prospect;
          return (
            <tr key={lead.id} onClick={() => onOpen(lead)} style={{ cursor: 'pointer' }}>
              <td className="align-top">
                <div className="font-semibold text-[14px] text-(--ink)">{p?.business_name ?? 'Unknown business'}</div>
                {p?.category && (
                  <div className="text-[12.5px] text-(--ink-faint) mt-0.5">
                    {p.category}{p.location ? ` · ${p.location}` : ''}
                  </div>
                )}
              </td>
              <td className="align-top max-w-105">
                <p className="m-0 text-[13px] text-(--ink-soft) line-clamp-1">{lead.ai_summary ?? '—'}</p>
              </td>
              <td className="align-top">
                <span className={`status-pill pill-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
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
  const inProgressCount = leads.filter(
    (l) => l.status === 'viewed' || l.status === 'contacted',
  ).length;
  const closedCount = leads.filter(
    (l) => l.status === 'won' || l.status === 'lost',
  ).length;

  if (filter === 'new') {
    if (inProgressCount > 0) {
      return (
        <div className="leads-empty">
          <strong>No new leads right now</strong>
          <span>We're still reaching out - new leads will appear here when businesses reply.</span>

          <button
            className="empty-nudge-btn"
            onClick={() => onSwitchFilter('active')}
          >
            Go to In Progress ({inProgressCount}) →
          </button>

        </div>
      );
    }
    return (
      <div className="leads-empty">
        <strong>No new leads yet - we're on it</strong>
        <span>
          We're reaching out to businesses on your behalf right now.
          As soon as one replies with interest, they'll show up here.
        </span>
        {closedCount > 0 && (
          <span className="leads-empty-note">
            You've closed {closedCount} lead{closedCount !== 1 ? 's' : ''} so far - great work!
          </span>
        )}
      </div>
    );
  }

  if (filter === 'active') {
    const newCount = leads.filter((l) => l.status === 'new').length;
    return (
      <div className="leads-empty">
        <strong>Nothing in progress</strong>
        <span>
          When you open a new lead for the first time it moves here automatically.
          From here, tap a lead to call, email or message them directly.
        </span>
        {newCount > 0 && (
          <button
            className="empty-nudge-btn"
            onClick={() => onSwitchFilter('new')}
          >
            See {newCount} new lead{newCount !== 1 ? 's' : ''} →
          </button>
        )}
      </div>
    );
  }

  if (filter === 'closed') {
    return (
      <div className="leads-empty">
        <strong>No closed leads yet</strong>
        <span>
          After you contact a business, open them here and tap{' '}
          <strong>"Mark as Won"</strong> or <strong>"Not interested"</strong>{' '}
          to keep everything organised.
        </span>
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
  const p = lead.prospect;
  return (
    <button className={`lead-row status-${lead.status}`} onClick={onOpen}>
      <div className={`lead-dot dot-${lead.status}`} />
      <div className="lead-row-body">
        <div className="lead-row-top">
          <span className="lead-row-name">{p?.business_name ?? 'Unknown business'}</span>
          <span className={`status-pill pill-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
        </div>
        {p?.category && (
          <div className="lead-row-meta">
            {p.category}{p.location ? ` · ${p.location}` : ''}
          </div>
        )}
        {lead.ai_summary && (
          <p className="lead-row-excerpt">{lead.ai_summary}</p>
        )}
      </div>
      <svg className="lead-row-arrow" width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
        <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function LeadPanel({
  lead,
  onClose,
  onStatus,
}: {
  lead: HotLead;
  onClose: () => void;
  onStatus: (id: string, s: HotLeadStatus) => void;
}) {
  const p = lead.prospect;
  return (
    <motion.div
      className="panel-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.aside
        className="panel rounded-lg"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-handle" />

        <div className="panel-scroll">
          {/* Status + close */}
          <div className="panel-top">
            <span className={`status-pill pill-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
            <button className="panel-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Identity */}
          <h2 className="panel-biz">{p?.business_name ?? 'Unknown business'}</h2>
          {p?.category && (
            <p className="panel-category">{p.category}{p.location ? ` · ${p.location}` : ''}</p>
          )}

          {/* Landscape split on desktop: main story left, contact + actions right */}
          <div className="md:grid md:grid-cols-[1.3fr_1fr] md:gap-8 md:items-start">
            <div>
              {/* AI summary */}
              <div className="panel-ai">
                <div className="panel-label">What they want</div>
                <p>{lead.ai_summary ?? 'They replied expressing interest.'}</p>
                {lead.suggested_action && (
                  <p className="panel-action">→ {lead.suggested_action}</p>
                )}
              </div>

              {/* Their reply */}
              {lead.reply?.body && (
                <div className="panel-section">
                  <div className="panel-label">Their reply</div>
                  <blockquote className="panel-reply">{lead.reply.body}</blockquote>
                </div>
              )}
            </div>

            <div>
              {/* Contact info */}
              {(p?.contact_name || p?.email || p?.phone) && (
                <div className="panel-section">
                  <div className="panel-label">Contact info</div>
                  <dl className="contact-dl">
                    {p?.contact_name && (<><dt>Name</dt><dd>{p.contact_name}</dd></>)}
                    {p?.email && (<><dt>Email</dt><dd className="mono">{p.email}</dd></>)}
                    {p?.phone && (<><dt>Phone</dt><dd className="mono">{p.phone}</dd></>)}
                  </dl>
                </div>
              )}

              {/* Reach buttons — icon chip + label */}
              <div className="reach-row mb-2 ">
                {p?.phone && (
                  <a className="reach-btn  p-2 rounded-md reach-primary" href={`tel:${p.phone}`}>
                    <span className="reach-icon reach-icon-on-primary"><PhoneIcon /></span>
                    <span className='text-white'>Call</span>
                  </a>
                )}
                {p?.phone && (
                  <a
                    className="reach-btn  p-2 rounded-md"
                    href={`https://wa.me/${p.phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="reach-icon  d reach-icon-whatsapp"><WhatsAppIcon /></span>
                    <span>WhatsApp</span>
                  </a>
                )}
                {p?.email && (
                  <a className="reach-btn  p-2 rounded-md" href={`mailto:${p.email}`}>
                    <span className="reach-icon reach-icon-mail"><MailIcon /></span>
                    <span>Email</span>
                  </a>
                )}
              </div>

              {/* Outcome actions */}
              <div className="panel-outcomes">
                <button
                  className="outcome-btn p-2 rounded-md outcome-won"
                  onClick={() => { onStatus(lead.id, 'won'); onClose(); }}
                >
                  Mark as Won ✓
                </button>
                <button
                  className="outcome-btn p-2 rounded-md  outcome-lost"
                  onClick={() => { onStatus(lead.id, 'lost'); onClose(); }}
                >
                  Not interested
                </button>
              </div>
            </div>
          </div>
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

/* ───── stat cards ───── */
function StatGrid({
  newCount, inProgressCount, wonCount, lostCount, closeRate, onFilter,
}: {
  newCount: number; inProgressCount: number;
  wonCount: number; lostCount: number;
  closeRate: number | null;
  onFilter: (f: Filter) => void;
}) {
  const cards = [
    {
      icon: Zap,
      iconColor: 'var(--amber)',
      label: 'New Leads',
      value: newCount,
      TrendIcon: newCount > 0 ? TrendingUp : Minus,
      trendText: newCount > 0 ? 'needs your call' : 'all caught up',
      trendColor: newCount > 0 ? 'var(--amber)' : 'var(--ink-faint)',
      filter: 'new' as Filter,
    },
    {
      icon: MessageSquare,
      iconColor: 'var(--leaf)',
      label: 'In Progress',
      value: inProgressCount,
      TrendIcon: Minus,
      trendText: 'active conversations',
      trendColor: 'var(--ink-faint)',
      filter: 'active' as Filter,
    },
    {
      icon: Trophy,
      iconColor: 'var(--leaf)',
      label: 'Won',
      value: wonCount,
      TrendIcon: closeRate !== null ? TrendingUp : Minus,
      trendText: closeRate !== null ? `${closeRate}% close rate` : '—',
      trendColor: closeRate !== null && closeRate > 0 ? 'var(--leaf)' : 'var(--ink-faint)',
      filter: 'closed' as Filter,
    },
    {
      icon: XCircle,
      iconColor: 'var(--clay)',
      label: 'Lost',
      value: lostCount,
      TrendIcon: Minus,
      trendText: lostCount > 0 ? 'closed without deal' : '—',
      trendColor: 'var(--ink-faint)',
      filter: 'closed' as Filter,
    },
  ];

  return (
    <div className="stat-grid">
      {cards.map((c) => {
        const Icon = c.icon;
        const TIcon = c.TrendIcon;
        return (
          <button key={c.label} className="stat-card" onClick={() => onFilter(c.filter)}>
            <div className="stat-card-header">
              <Icon size={13} style={{ color: c.iconColor, flexShrink: 0 }} />
              <span className="stat-label">{c.label}</span>
            </div>
            <div className="stat-value">{c.value}</div>
            <div className="stat-trend" style={{ color: c.trendColor }}>
              <TIcon size={12} strokeWidth={2.5} />
              <span>{c.trendText}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ───── reach-row icons — real Font Awesome glyphs ───── */
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
