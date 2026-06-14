import { useMemo, useState } from 'react';
import { useProspects } from '../hooks/useAdminData';
import './AdminScreens.css';

const STATUS_TONE: Record<string, string> = {
  new: 'neutral', contacted: 'blue', replied: 'amber', hot_lead: 'green', won: 'green-solid', lost: 'faint',
};

export function Prospects() {
  const { rows, loading, error, reload } = useProspects();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [cat, setCat] = useState('all');

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[],
    [rows]
  );

  const filtered = rows.filter((r) => {
    if (status !== 'all' && r.pipeline_status !== status) return false;
    if (cat !== 'all' && r.category !== cat) return false;
    if (q) {
      const hay = `${r.business_name} ${r.email ?? ''} ${r.contact_name ?? ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Prospects</h1>
          <p className="screen-sub">{rows.length} total across all clients</p>
        </div>
        <button className="ghost-btn" onClick={reload}>Refresh</button>
      </header>

      <div className="toolbar">
        <input className="search" placeholder="Search name, email, contact…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {['new','contacted','replied','hot_lead','won','lost'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? <div className="empty">Loading…</div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Business</th><th>Contact</th><th>Client</th><th>Category</th><th>Location</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.business_name}</td>
                  <td>{r.contact_name ?? '—'}<div className="sub mono">{r.email ?? ''}</div></td>
                  <td>{r.client?.business_name ?? '—'}</td>
                  <td>{r.category ?? '—'}</td>
                  <td>{r.location ?? '—'}</td>
                  <td><span className={`pill ${STATUS_TONE[r.pipeline_status] ?? 'neutral'}`}>{r.pipeline_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty">No prospects match those filters.</div>}
        </div>
      )}
    </div>
  );
}
