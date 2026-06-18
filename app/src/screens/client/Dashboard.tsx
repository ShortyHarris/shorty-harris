import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClientDashboard } from '../../hooks/useClientDashboard';
import type { HotLead, HotLeadStatus } from '../../types';
import { RefreshCw, ChevronRight } from 'lucide-react';
import './Dashboard.css';

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
      {/* ─── Header greeting — plain text, left aligned, no card ─── */}
      <div className="dash-head">

        <div className="bill-section-head">
          <h2 className='text-2xl font-bold flex items-center gap-2'><img src='https://cdn-icons-png.flaticon.com/128/9679/9679459.png' className='w-10' /><span className='text-2xl tracking-tight'>Hot Leads</span></h2>
        </div>
        <div className="dash-greeting text-lg">
          {newCount > 0 ? (
            <>
              <span className="greeting-hl">
                {newCount} {newCount === 1 ? 'business' : 'businesses'} already said yes
              </span>
            </>
          ) : (
            <>You're all caught up</>
          )}
        </div>
        <p className="dash-sub">
          {newCount > 0
            ? 'We reached out on your behalf. They replied with interest and are waiting for your call. Tap any lead below to reach out.'
            : 'We\'re still doing outreach. New leads will appear here as businesses reply with interest.'}
        </p>
      </div>

      {/* ─── Desktop metrics strip — plain numbers, no cards ─── */}
      <div className="hidden mx-8 bg-white border-b border-[var(--line)] my-4 md:flex md:px-8 md:py-5 rounded-lg">
        {[
          { value: newCount, label: 'New leads' },
          { value: inProgressCount, label: 'In progress' },
          { value: wonCount, label: 'Won' },
          { value: lostCount, label: 'Lost' },
        ].map((s, i) => (
          <div key={s.label} className={`flex-1 px-6 first:pl-0 last:pr-0 ${i !== 0 ? 'border-l border-[var(--line)]' : ''}`}>
            <div className="text-[13px] text-[var(--ink-faint)] mb-1">{s.label}</div>
            <div className="text-2xl font-bold tracking-[-0.02em] text-[var(--ink)]">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="md:px-8 md:pb-10">
        <div className="filter-bar px-2 rounded-t-lg bg-white border border-[var(--line)]">
          {FILTER_TABS.map((tab) => {
            const count = leads.filter((l) => matchesFilter(l, tab.key)).length;
            return (
              <button
                key={tab.key}
                className={`filter-tab${filter === tab.key ? ' active' : ''}`}
                onClick={() => selectFilter(tab.key)}
              >
                {tab.label}
                {count > 0 && (
                  <span className="filter-badge">{count}</span>
                )}
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
            {/* Mobile: card-style rows (unchanged) */}
            <div className="lead-list md:hidden">
              {filtered.map((lead) => (
                <LeadRow key={lead.id} lead={lead} onOpen={() => openLead_(lead)} />
              ))}
            </div>

            {/* Desktop: full-width table with pagination, contained in one bordered card */}
            <div className="hidden md:block md:bg-white md:border md:border-[var(--line)] md:rounded-b-lg md:p-4">
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
    <table className="w-full  rounded-b-lg border-b-0 text-left ">
      <thead>
        <tr className="border-b border-[var(--line)]">
          <th className="py-3 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Business</th>
          <th className="py-3 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Summary</th>
          <th className="py-3 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Status</th>
          <th className="py-3 px-2 w-10" />
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => {
          const p = lead.prospect;
          return (
            <tr
              key={lead.id}
              className="border-t border-[var(--line)]  cursor-pointer hover:bg-[var(--bg)] transition-colors"
              onClick={() => onOpen(lead)}
            >
              <td className="py-3.5 px-2 align-top">
                <div className="font-semibold text-[14.5px] text-[var(--ink)]">{p?.business_name ?? 'Unknown business'}</div>
                {p?.category && (
                  <div className="text-[12.5px] text-[var(--ink-faint)] mt-0.5">
                    {p.category}{p.location ? ` · ${p.location}` : ''}
                  </div>
                )}
              </td>
              <td className="py-3.5 px-2 align-top max-w-[420px]">
                <p className="m-0 text-[13.5px] text-[var(--ink-soft)] line-clamp-1">
                  {lead.ai_summary ?? '—'}
                </p>
              </td>
              <td className="py-3.5 px-2 align-top">
                <span className={`status-pill pill-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
              </td>
              <td className="py-3.5 px-2 align-top text-right">
                <ChevronRight size={16} className="text-[var(--line-strong)]" />
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
    <div className="flex items-center justify-between pt-4 mt-2 border-t border-[var(--line)]">
      <span className="text-[13px] text-[var(--ink-faint)]">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button
          className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-soft)] disabled:opacity-40"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <button
          className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-soft)] disabled:opacity-40"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
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
          <span>We're still reaching out — new leads will appear here when businesses reply.</span>

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
        <strong>No new leads yet — we're on it</strong>
        <span>
          We're reaching out to businesses on your behalf right now.
          As soon as one replies with interest, they'll show up here.
        </span>
        {closedCount > 0 && (
          <span className="leads-empty-note">
            You've closed {closedCount} lead{closedCount !== 1 ? 's' : ''} so far — great work!
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
            <div className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#ddd8cb] animate-pulse" />
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
      <div className="hidden md:block md:bg-white md:border md:border-(--line) md:rounded-b-lg md:p-4" aria-hidden>
        <table className="w-full">
          <tbody>
            {[...Array(6)].map((_, i) => (
              <tr key={i} className="border-b border-(--line)">
                <td className="py-4 px-2">
                  <div className="h-4 w-40 rounded bg-[#ddd8cb] animate-pulse" />
                  <div className="mt-1.5 h-3 w-24 rounded bg-[#ece8df] animate-pulse" />
                </td>
                <td className="py-4 px-2 max-w-[420px]">
                  <div className="h-3 w-4/5 rounded bg-[#ece8df] animate-pulse" />
                </td>
                <td className="py-4 px-2">
                  <div className="h-5 w-16 rounded-full bg-[#ddd8cb] animate-pulse" />
                </td>
                <td className="py-4 px-2 w-10" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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
