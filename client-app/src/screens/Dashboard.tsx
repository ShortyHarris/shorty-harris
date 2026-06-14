import { useState } from 'react';
import { useClientDashboard } from '../hooks/useClientDashboard';
import type { HotLead } from '../types';
import './Dashboard.css';

export function Dashboard({ clientId }: { clientId: string }) {
  const { summary, leads, loading, error, setStatus, reload } = useClientDashboard(clientId);
  const [openId, setOpenId] = useState<string | null>(null);
  const openLead = leads.find((l) => l.id === openId) ?? null;

  const newCount = leads.filter((l) => l.status === 'new').length;

  return (
    <>
      <main className="content">
        <section className="hero">
          <h1>
            {newCount > 0 ? (
              <>You have <span className="hl">{newCount} new {newCount === 1 ? 'lead' : 'leads'}</span> ready to act on.</>
            ) : (
              <>You’re all caught up.</>
            )}
          </h1>
          <p className="hero-sub">
            These are businesses that replied with interest. We’ve done the outreach — now it’s your call to close.
          </p>
        </section>

        <section className="stats">
          <Stat value={summary?.messagesSent} label="Messages sent" />
          <Stat value={summary?.replies} label="Replies" />
          <Stat value={summary?.hotLeads} label="Hot leads" tone="leaf" />
          <Stat
            value={summary ? `${summary.messagesSent ? Math.round((summary.replies / summary.messagesSent) * 100) : 0}%` : undefined}
            label="Reply rate"
          />
        </section>

        <div className="section-head">
          <h2>Hot leads</h2>
          <button className="link-btn" onClick={reload}>Refresh</button>
        </div>

        {error && <div className="error-banner">Couldn’t load your leads: {error}</div>}

        {loading ? (
          <div className="empty">Loading your opportunities…</div>
        ) : leads.length === 0 ? (
          <div className="empty">
            <strong>No hot leads yet.</strong>
            <span>As businesses reply with interest, they’ll show up right here.</span>
          </div>
        ) : (
          <div className="lead-grid">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onOpen={() => { setOpenId(lead.id); if (lead.status === 'new') setStatus(lead.id, 'viewed'); }} />
            ))}
          </div>
        )}
      </main>

      {openLead && (
        <LeadPanel lead={openLead} onClose={() => setOpenId(null)} onStatus={setStatus} />
      )}
    </>
  );
}

function Stat({ value, label, tone }: { value?: number | string; label: string; tone?: string }) {
  return (
    <div className="stat" data-tone={tone}>
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New', viewed: 'Viewed', contacted: 'In progress', won: 'Won', lost: 'Lost',
};

function LeadCard({ lead, onOpen }: { lead: HotLead; onOpen: () => void }) {
  return (
    <button className={`lead-card status-${lead.status}`} onClick={onOpen}>
      <div className="lead-card-top">
        <span className="lead-name">{lead.prospect?.business_name ?? 'Unknown business'}</span>
        <span className={`badge badge-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
      </div>
      {lead.prospect?.category && <div className="lead-cat">{lead.prospect.category}{lead.prospect.location ? ` · ${lead.prospect.location}` : ''}</div>}
      <p className="lead-summary">{lead.ai_summary ?? 'Replied with interest.'}</p>
      {lead.suggested_action && (
        <div className="lead-action">→ {lead.suggested_action}</div>
      )}
    </button>
  );
}

function LeadPanel({ lead, onClose, onStatus }: { lead: HotLead; onClose: () => void; onStatus: (id: string, s: HotLead['status']) => void }) {
  const p = lead.prospect;
  return (
    <div className="panel-overlay" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" onClick={onClose} aria-label="Close">×</button>

        <span className={`badge badge-${lead.status}`}>{STATUS_LABEL[lead.status]} lead</span>
        <h2 className="panel-title">{p?.business_name ?? 'Unknown business'}</h2>
        {p?.category && <div className="panel-meta">{p.category}{p.location ? ` · ${p.location}` : ''}</div>}

        <div className="panel-block ai">
          <div className="panel-block-label">What they want</div>
          <p>{lead.ai_summary ?? 'They replied expressing interest.'}</p>
          {lead.suggested_action && <p className="suggested">→ {lead.suggested_action}</p>}
        </div>

        {(p?.contact_name || p?.email || p?.phone) && (
          <div className="panel-block">
            <div className="panel-block-label">Contact</div>
            <dl className="contact">
              {p?.contact_name && (<><dt>Name</dt><dd>{p.contact_name}</dd></>)}
              {p?.email && (<><dt>Email</dt><dd className="mono">{p.email}</dd></>)}
              {p?.phone && (<><dt>Phone</dt><dd className="mono">{p.phone}</dd></>)}
            </dl>
          </div>
        )}

        {lead.reply?.body && (
          <div className="panel-block">
            <div className="panel-block-label">Their reply</div>
            <blockquote className="reply">{lead.reply.body}</blockquote>
          </div>
        )}

        <div className="panel-reach">
          {p?.phone && <a className="reach-btn primary" href={`tel:${p.phone}`}>Call</a>}
          {p?.email && <a className="reach-btn" href={`mailto:${p.email}`}>Email</a>}
          {p?.phone && <a className="reach-btn" href={`https://wa.me/${p.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        </div>

        <div className="panel-outcome">
          <button className="outcome won" onClick={() => { onStatus(lead.id, 'won'); onClose(); }}>Mark won</button>
          <button className="outcome lost" onClick={() => { onStatus(lead.id, 'lost'); onClose(); }}>Mark lost</button>
        </div>
      </aside>
    </div>
  );
}
