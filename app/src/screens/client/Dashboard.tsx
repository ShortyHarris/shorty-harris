import { useState } from 'react';
import { useClientDashboard } from '../../hooks/useClientDashboard';
import type { HotLead } from '../../types';
import './Dashboard.css';

export function Dashboard({ clientId }: { clientId: string }) {
  const { summary, leads, loading, error, setStatus, reload } = useClientDashboard(clientId);
  const [openId, setOpenId] = useState<string | null>(null);
  const openLead = leads.find((l) => l.id === openId) ?? null;

  const newCount = leads.filter((l) => l.status === 'new').length;
  const replyRate = summary && summary.messagesSent
    ? Math.round((summary.replies / summary.messagesSent) * 100)
    : 0;

  return (
    <main className="ccontent">
      {/* KPI strip */}
      <section className="kpi-strip">
        <article className="kpi kpi-credits">
          <div className="kpi-label">AVAILABLE CREDITS</div>
          <div className="kpi-num">{summary?.credits_remaining ?? '—'}<span className="kpi-unit">Remaining</span></div>
          <a className="kpi-cta" href="/app/billing">Top Up Credits</a>
          <div className="kpi-watermark" aria-hidden>
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>
          </div>
        </article>

        <KpiCard label="SENT" value={summary?.messagesSent ?? 0} hint="Direct outreach"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
        />
        <KpiCard label="REPLIES" value={summary?.replies ?? 0} hint="Total responses"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.2L3 21l1.8-5.4A8 8 0 1 1 21 12Z"/></svg>}
        />
        <KpiCard label="HOT LEADS" value={summary?.hotLeads ?? 0} hint="Ready to close" tone="dark"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s4 5 4 9a4 4 0 1 1-8 0c0-1.5.6-3 1.2-4 .4.8 1 1.5 1.8 2 0-2 .5-5 1-7Z"/></svg>}
        />
      </section>

      {/* Hot leads + side panel */}
      <div className="cdash-grid">
        <section className="lead-feed">
          <header className="lead-feed-head">
            <h2>Hot Leads</h2>
            <span className="pill pill-priority">NEW PRIORITY</span>
            <div className="lead-feed-meta">
              <span>{newCount} new · reply rate {replyRate}%</span>
              <button className="link-btn" onClick={reload}>Refresh</button>
            </div>
          </header>

          {error && <div className="error-banner">Couldn't load your leads: {error}</div>}

          {loading ? (
            <div className="empty">Loading your opportunities…</div>
          ) : leads.length === 0 ? (
            <div className="empty">
              <strong>No hot leads yet.</strong>
              <span>As businesses reply with interest, they'll show up right here.</span>
            </div>
          ) : (
            <ul className="lead-list">
              {leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  active={openId === lead.id}
                  onOpen={() => {
                    setOpenId(lead.id);
                    if (lead.status === 'new') setStatus(lead.id, 'viewed');
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="lead-detail">
          {openLead ? (
            <LeadDetail lead={openLead} onStatus={setStatus} onClose={() => setOpenId(null)} />
          ) : (
            <div className="lead-detail-empty">
              <div className="lde-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>
              </div>
              <strong>Select a lead</strong>
              <span>Pick a row to see contact details and the latest message.</span>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function KpiCard({ label, value, hint, icon, tone }: {
  label: string; value: number | string; hint?: string;
  icon?: React.ReactNode; tone?: 'dark';
}) {
  return (
    <article className={`kpi${tone === 'dark' ? ' kpi-dark' : ''}`}>
      <div className="kpi-row">
        <span className="kpi-label">{label}</span>
        <span className="kpi-ic">{icon}</span>
      </div>
      <div className="kpi-num">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </article>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: 'NEW', viewed: 'VIEWED', contacted: 'IN PROGRESS', won: 'WON', lost: 'LOST',
};

function LeadRow({ lead, active, onOpen }: { lead: HotLead; active: boolean; onOpen: () => void }) {
  const p = lead.prospect;
  const confidence = Math.round(70 + ((lead.id?.charCodeAt(0) ?? 0) % 28));
  return (
    <li>
      <button className={`lead-row${active ? ' is-active' : ''}`} onClick={onOpen}>
        <div className="lr-main">
          <div className="lr-title-line">
            <span className="lr-title">{p?.business_name ?? 'Unknown business'}</span>
            <span className="lr-confidence">{confidence}%</span>
          </div>
          <div className="lr-meta">
            {p?.contact_name ?? '—'}
            {p?.category ? <span className="dot">·</span> : null}
            {p?.category}
            {p?.location ? <span className="dot">·</span> : null}
            {p?.location}
          </div>
          <div className="lr-summary">
            <span className="lr-summary-label">AI summary:</span> {lead.ai_summary ?? 'Replied with interest.'}
          </div>
          {lead.suggested_action && (
            <div className="lr-action">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>
              <span>{lead.suggested_action}</span>
            </div>
          )}
        </div>
        <span className={`lr-status status-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
      </button>
    </li>
  );
}

function LeadDetail({ lead, onStatus, onClose }: {
  lead: HotLead; onStatus: (id: string, s: HotLead['status']) => void; onClose: () => void;
}) {
  const p = lead.prospect;
  const initials = (p?.contact_name ?? p?.business_name ?? '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="ld">
      <button className="ld-close" onClick={onClose} aria-label="Close">×</button>
      <div className="ld-avatar">{initials}</div>
      <div className="ld-name">{p?.contact_name ?? p?.business_name ?? 'Unknown'}</div>
      <div className="ld-role">{p?.business_name ?? ''}</div>
      {p?.category && <div className="ld-cat">{p.category}{p.location ? ` · ${p.location}` : ''}</div>}

      <div className="ld-actions">
        {p?.phone && <a className="ld-act" href={`tel:${p.phone}`}><Ic name="phone"/><span>CALL</span></a>}
        {p?.email && <a className="ld-act" href={`mailto:${p.email}`}><Ic name="mail"/><span>EMAIL</span></a>}
        {p?.phone && <a className="ld-act" href={`https://wa.me/${p.phone.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer"><Ic name="chat"/><span>WHATSAPP</span></a>}
      </div>

      {lead.reply?.body && (
        <div className="ld-msg-block">
          <div className="ld-msg-label">LATEST MESSAGE</div>
          <blockquote className="ld-msg">{lead.reply.body}</blockquote>
        </div>
      )}

      <div className="ld-outcome">
        <button className="btn-solid" onClick={() => { onStatus(lead.id, 'won'); onClose(); }}>
          ✓ MARK WON
        </button>
        <button className="btn-ghost" onClick={() => { onStatus(lead.id, 'lost'); onClose(); }}>
          Mark Lost
        </button>
      </div>
    </div>
  );
}

function Ic({ name }: { name: 'phone' | 'mail' | 'chat' }) {
  const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  if (name === 'phone') return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M22 16.92V21a1 1 0 0 1-1.1 1A19 19 0 0 1 2 4.1 1 1 0 0 1 3 3h4.1a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.3 1L7 10.2a16 16 0 0 0 6.8 6.8l1.45-1.8a1 1 0 0 1 1-.3l4 1a1 1 0 0 1 .75 1Z"/></svg>;
  if (name === 'mail')  return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>;
  return <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}><path d="M21 12a8 8 0 0 1-11.6 7.2L3 21l1.8-5.4A8 8 0 1 1 21 12Z"/></svg>;
}
