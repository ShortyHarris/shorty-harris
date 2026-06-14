import { useState } from 'react';
import { useCampaigns, useAdminHotLeads, useClientsList, createCampaign } from '../hooks/useAdminData';
import './AdminScreens.css';

const CAMP_TONE: Record<string, string> = {
  draft: 'neutral', active: 'green', paused: 'amber', completed: 'blue',
};

export function Campaigns() {
  const { rows, loading, error, reload, setStatus } = useCampaigns();
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Campaigns</h1>
          <p className="screen-sub">{rows.length} campaigns across all clients</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="ghost-btn" onClick={reload}>Refresh</button>
          <button className="primary-btn" onClick={() => setShowNew(true)}>+ New campaign</button>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="empty">Loading…</div> : (
        <div className="card-col">
          {rows.map((c) => {
            const paused = c.status === 'paused';
            const active = c.status === 'active';
            return (
              <div className="row-card" key={c.id}>
                <div className="row-card-main">
                  <div className="row-card-title">{c.name}</div>
                  <div className="row-card-meta">
                    {c.client?.business_name ?? '—'} <span className="dot">·</span> {c.channel}
                    <span className="dot">·</span> {c.prospectCount} prospects
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`pill ${CAMP_TONE[c.status] ?? 'neutral'}`}>{c.status}</span>
                  {(active || paused) && (
                    <button
                      className={`toggle ${active ? 'on' : 'off'}`}
                      onClick={() => setStatus(c.id, active ? 'paused' : 'active')}
                      title={active ? 'Pause — stops new prospects being pulled in' : 'Activate'}
                    >
                      <span className="toggle-knob" />
                      <span className="toggle-text">{active ? 'Active' : 'Paused'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="empty">No campaigns yet.</div>}
        </div>
      )}

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); reload(); }} />}
    </div>
  );
}

function NewCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const clients = useClientsList();
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('email');
  const [queries, setQueries] = useState('');
  const [locations, setLocations] = useState('');
  const [maxResults, setMaxResults] = useState(50);
  const [scrapeEnabled, setScrapeEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!clientId || !name.trim()) { setErr('Pick a client and enter a name.'); return; }
    setBusy(true); setErr(null);
    const { error } = await createCampaign({
      client_id: clientId,
      name: name.trim(),
      channel,
      search_queries: queries.split(',').map((s) => s.trim()).filter(Boolean),
      target_locations: locations.split(',').map((s) => s.trim()).filter(Boolean),
      max_results: maxResults,
      scrape_enabled: scrapeEnabled,
    });
    setBusy(false);
    if (error) setErr(error.message); else onCreated();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New campaign</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <label className="form-field">
          <span>Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
        </label>

        <label className="form-field">
          <span>Campaign name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Austin gyms — Q3" />
        </label>

        <label className="form-field">
          <span>Channel</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>

        <div className="form-divider">Prospect discovery (Apify)</div>

        <label className="form-field">
          <span>Search terms <em>(comma-separated)</em></span>
          <input value={queries} onChange={(e) => setQueries(e.target.value)} placeholder="hotels, lodges, guesthouses" />
        </label>

        <label className="form-field">
          <span>Locations <em>(comma-separated)</em></span>
          <input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Austin TX, Round Rock TX" />
        </label>

        <div className="form-row">
          <label className="form-field" style={{ flex: 1 }}>
            <span>Max results per run</span>
            <input type="number" min={1} max={500} value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} />
          </label>
          <label className="form-check">
            <input type="checkbox" checked={scrapeEnabled} onChange={(e) => setScrapeEnabled(e.target.checked)} />
            <span>Enable scraping</span>
          </label>
        </div>

        {err && <div className="error-banner" style={{ marginTop: 4 }}>{err}</div>}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create campaign'}</button>
        </div>
      </div>
    </div>
  );
}

const LEAD_TONE: Record<string, string> = {
  new: 'green', viewed: 'neutral', contacted: 'amber', won: 'green-solid', lost: 'faint',
};

export function HotLeads() {
  const { rows, loading, error, reload } = useAdminHotLeads();
  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Hot leads</h1>
          <p className="screen-sub">{rows.length} qualified opportunities, all clients</p>
        </div>
        <button className="ghost-btn" onClick={reload}>Refresh</button>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="empty">Loading…</div> : (
        <div className="card-col">
          {rows.map((l) => (
            <div className="row-card lead" key={l.id}>
              <div className="row-card-main">
                <div className="row-card-title">
                  {l.prospect?.business_name ?? 'Unknown'}
                  <span className="for-tag">for {l.client?.business_name ?? '—'}</span>
                </div>
                <p className="lead-text">{l.ai_summary ?? 'Replied with interest.'}</p>
                {l.suggested_action && <div className="lead-suggest">→ {l.suggested_action}</div>}
              </div>
              <span className={`pill ${LEAD_TONE[l.status] ?? 'neutral'}`}>{l.status}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="empty">No hot leads yet.</div>}
        </div>
      )}
    </div>
  );
}
