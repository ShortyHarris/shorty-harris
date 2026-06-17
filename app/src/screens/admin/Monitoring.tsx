import { useState } from 'react';
import { useErrorLogs } from '../../hooks/useAdminData';
import './Screens.css';

const SEV_TONE: Record<string, string> = { warning: 'amber', error: 'reject', critical: 'reject-solid' };
const PAGE_SIZE = 10;

export function Monitoring() {
  const { rows, loading, error, resolve, showResolved, setShowResolved, reload } = useErrorLogs();
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Monitoring</h1>
          <p className="screen-sub">System errors and workflow failures</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={`ghost-btn ${showResolved ? 'on' : ''}`} onClick={() => { setShowResolved(!showResolved); setPage(1); }}>
            {showResolved ? 'Hiding resolved' : 'Show resolved'}
          </button>
          <button className="ghost-btn" onClick={reload}>Refresh</button>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="empty">Loading…</div> : rows.length === 0 ? (
        <div className="empty"><strong>All clear.</strong><span>No {showResolved ? '' : 'unresolved '}errors.</span></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Severity</th><th>Source</th><th>Type</th><th>Message</th><th>When</th><th /></tr>
            </thead>
            <tbody>
              {paged.map((e) => (
                <tr key={e.id}>
                  <td><span className={`pill ${SEV_TONE[e.severity] ?? 'neutral'}`}>{e.severity}</span></td>
                  <td><span className="mono src-tag">{e.source}</span></td>
                  <td className="err-type">{e.error_type}</td>
                  <td className="lead-summary-cell">
                    {e.message}
                    {e.retry_count > 0 && <div className="lead-suggest">{e.retry_count} retries</div>}
                  </td>
                  <td className="sub">{new Date(e.created_at).toLocaleString()}</td>
                  <td>{!e.resolved && <button className="resolve-btn" onClick={() => resolve(e.id)}>Mark resolved</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

/* ───── pagination ───── */
function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="table-pagination">
      <span>Page {page} of {totalPages}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="ghost-btn" onClick={() => onChange(page - 1)} disabled={page <= 1}>Previous</button>
        <button className="ghost-btn" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>Next</button>
      </div>
    </div>
  );
}
