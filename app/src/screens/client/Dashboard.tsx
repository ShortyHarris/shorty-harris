import { useState } from 'react';
import { useClientDashboard } from '../../hooks/useClientDashboard';
import type { HotLead, HotLeadStatus } from '../../types';
import { RefreshCw, Phone, Mail, MessageCircle } from 'lucide-react';
import './Dashboard.css';

type Filter = 'new' | 'active' | 'all' | 'closed';

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'new',    label: 'New' },
  { key: 'active', label: 'In Progress' },
  { key: 'all',    label: 'All' },
  { key: 'closed', label: 'Closed' },
];

const STATUS_LABEL: Record<HotLeadStatus, string> = {
  new:       'New',
  viewed:    'Seen',
  contacted: 'In progress',
  won:       'Won',
  lost:      'Lost',
};

function matchesFilter(lead: HotLead, filter: Filter): boolean {
  if (filter === 'new')    return lead.status === 'new';
  if (filter === 'active') return lead.status === 'viewed' || lead.status === 'contacted';
  if (filter === 'closed') return lead.status === 'won' || lead.status === 'lost';
  return true;
}

export function Dashboard({ clientId }: { clientId: string }) {
  const { leads, loading, error, setStatus, reload } = useClientDashboard(clientId);
  const [openId, setOpenId]   = useState<string | null>(null);
  const [filter, setFilter]   = useState<Filter>('new');

  const openLead  = leads.find((l) => l.id === openId) ?? null;
  const filtered  = leads.filter((l) => matchesFilter(l, filter));
  const newCount  = leads.filter((l) => l.status === 'new').length;

  return (
    <>
      {/* ─── Header greeting ─── */}
      <div className="dash-head">
        <div className="dash-greeting">
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

      {/* ─── Filter bar ─── */}
      <div className="filter-bar">
        {FILTER_TABS.map((tab) => {
          const count = leads.filter((l) => matchesFilter(l, tab.key)).length;
          return (
            <button
              key={tab.key}
              className={`filter-tab${filter === tab.key ? ' active' : ''}`}
              onClick={() => setFilter(tab.key)}
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

      {/* ─── Lead list ─── */}
      <div className="lead-list">
        {error && <div className="lead-error-msg">{error}</div>}

        {loading ? (
          <div className="leads-empty">
            <span>Loading your leads…</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyLeads filter={filter} leads={leads} onSwitchFilter={setFilter} />
        ) : (
          filtered.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              onOpen={() => {
                setOpenId(lead.id);
                if (lead.status === 'new') setStatus(lead.id, 'viewed');
              }}
            />
          ))
        )}
      </div>

      {openLead && (
        <LeadPanel
          lead={openLead}
          onClose={() => setOpenId(null)}
          onStatus={setStatus}
        />
      )}
    </>
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
          <div className="empty-tip">
            <span className="empty-tip-label">Tip</span>
            You have {inProgressCount} lead{inProgressCount !== 1 ? 's' : ''} you already
            opened. They moved to the <strong>"In Progress"</strong> tab. Go there to call
            or email them and close the deal.
            <button
              className="empty-nudge-btn"
              onClick={() => onSwitchFilter('active')}
            >
              Go to In Progress ({inProgressCount}) →
            </button>
          </div>
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
    <div className="panel-overlay" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
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

          {/* AI summary */}
          <div className="panel-ai">
            <div className="panel-label">What they want</div>
            <p>{lead.ai_summary ?? 'They replied expressing interest.'}</p>
            {lead.suggested_action && (
              <p className="panel-action">→ {lead.suggested_action}</p>
            )}
          </div>

          {/* Contact info */}
          {(p?.contact_name || p?.email || p?.phone) && (
            <div className="panel-section">
              <div className="panel-label">Contact info</div>
              <dl className="contact-dl">
                {p?.contact_name && (<><dt>Name</dt><dd>{p.contact_name}</dd></>)}
                {p?.email        && (<><dt>Email</dt><dd className="mono">{p.email}</dd></>)}
                {p?.phone        && (<><dt>Phone</dt><dd className="mono">{p.phone}</dd></>)}
              </dl>
            </div>
          )}

          {/* Their reply */}
          {lead.reply?.body && (
            <div className="panel-section">
              <div className="panel-label">Their reply</div>
              <blockquote className="panel-reply">{lead.reply.body}</blockquote>
            </div>
          )}

          {/* Reach buttons — big, clear, icon + label */}
          <div className="reach-row">
            {p?.phone && (
              <a className="reach-btn reach-primary" href={`tel:${p.phone}`}>
                <Phone size={20} />
                <span>Call</span>
              </a>
            )}
            {p?.phone && (
              <a
                className="reach-btn"
                href={`https://wa.me/${p.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={20} />
                <span>WhatsApp</span>
              </a>
            )}
            {p?.email && (
              <a className="reach-btn" href={`mailto:${p.email}`}>
                <Mail size={20} />
                <span>Email</span>
              </a>
            )}
          </div>

          {/* Outcome actions */}
          <div className="panel-outcomes">
            <button
              className="outcome-btn outcome-won"
              onClick={() => { onStatus(lead.id, 'won'); onClose(); }}
            >
              Mark as Won ✓
            </button>
            <button
              className="outcome-btn outcome-lost"
              onClick={() => { onStatus(lead.id, 'lost'); onClose(); }}
            >
              Not interested
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
