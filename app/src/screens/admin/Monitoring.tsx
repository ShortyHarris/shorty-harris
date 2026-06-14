import { useErrorLogs } from '../../hooks/useAdminData';
import './Screens.css';

const SEV_TONE: Record<string, string> = { warning: 'amber', error: 'reject', critical: 'reject-solid' };

export function Monitoring() {
  const { rows, loading, error, resolve, showResolved, setShowResolved, reload } = useErrorLogs();
  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Monitoring</h1>
          <p className="screen-sub">System errors and workflow failures</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={`ghost-btn ${showResolved ? 'on' : ''}`} onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? 'Hiding resolved' : 'Show resolved'}
          </button>
          <button className="ghost-btn" onClick={reload}>Refresh</button>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="empty">Loading…</div> : (
        <div className="card-col">
          {rows.map((e) => (
            <div className="row-card" key={e.id}>
              <div className="row-card-main">
                <div className="row-card-title">
                  <span className={`pill ${SEV_TONE[e.severity] ?? 'neutral'}`}>{e.severity}</span>
                  <span className="mono src-tag">{e.source}</span>
                  <span className="err-type">{e.error_type}</span>
                </div>
                <p className="lead-text">{e.message}</p>
                <div className="row-card-meta">
                  {new Date(e.created_at).toLocaleString()}
                  {e.retry_count > 0 && <><span className="dot">·</span> {e.retry_count} retries</>}
                </div>
              </div>
              {!e.resolved && <button className="resolve-btn" onClick={() => resolve(e.id)}>Mark resolved</button>}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="empty"><strong>All clear.</strong><span>No {showResolved ? '' : 'unresolved '}errors.</span></div>
          )}
        </div>
      )}
    </div>
  );
}
