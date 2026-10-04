import { useState } from 'react';
import { useErrorLogs, useEscalatedHotLeads, useFailedNotifications } from '../../hooks/useAdminData';
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import { AlertTriangle } from 'lucide-react';

const HELP: HelpContent = {
  title: 'Monitoring',
  body: [
    { type: 'p', text: "Errors and failures from the background automation - scrapers, AI calls, email sends, and everything else running under the hood." },
    { type: 'p', text: "When something breaks, it appears here with a description of what went wrong. Once you've investigated or the issue cleared on its own, mark it as Resolved." },
    { type: 'p', text: "Unresolved errors show by default. Toggle 'Show resolved' to see the full history." },
  ],
};

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const SEV_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  warning:  { bg: '#f8efdb', text: '#b9831f' },
  error:    { bg: '#f6e8e2', text: '#a8533a', border: '1px solid rgba(168,83,58,0.2)' },
  critical: { bg: '#a8533a', text: '#fff' },
};

const PAGE_SIZE = 10;

function daysAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
}

/* ─── Martin's queue: clients sitting on a paid-for hot lead that's been
   escalated - a churn risk and a refund conversation waiting to happen. ─── */
function EscalatedLeadsTab() {
  const { rows, loading, error } = useEscalatedHotLeads();
  if (loading) return <SkeletonTable rows={PAGE_SIZE} cols={4} />;
  if (error) return <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>;
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
        <strong className="text-[15px] font-bold text-[#20211c]">Nothing escalated.</strong>
        <span className="text-[13px] text-[#62655c]">No hot leads are sitting unattended.</span>
      </div>
    );
  }
  return (
    <div className="atbl">
      <table>
        <thead>
          <tr>
            {['Business', 'Client', 'Waiting', 'Nudges'].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-semibold text-[#20211c]">{r.business_name}</td>
              <td className="text-[#62655c]">{r.client?.business_name ?? 'Unknown client'}</td>
              <td className="font-semibold text-[#a8533a]">{daysAgo(r.routed_at)}d waiting</td>
              <td className="text-[#62655c]">{r.nudge_count} nudge{r.nudge_count === 1 ? '' : 's'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Delivery problems: notifications that never went out. ─── */
function FailedNotificationsTab() {
  const { rows, loading, error } = useFailedNotifications();
  if (loading) return <SkeletonTable rows={PAGE_SIZE} cols={4} />;
  if (error) return <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>;
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
        <strong className="text-[15px] font-bold text-[#20211c]">All delivered.</strong>
        <span className="text-[13px] text-[#62655c]">No failed or cancelled notifications.</span>
      </div>
    );
  }
  return (
    <div className="atbl">
      <table>
        <thead>
          <tr>
            {['Client', 'Channel', 'Status', 'When'].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-semibold text-[#20211c]">{r.client?.business_name ?? 'Unknown client'}</td>
              <td className="text-[#62655c]">
                {r.channel}{r.purpose ? ` · ${r.purpose}` : ''}{r.recipient ? ` · ${r.recipient}` : ''}
              </td>
              <td>
                <span className="atbl-pill" style={{ background: r.status === 'failed' ? '#f6e8e2' : '#f5f2ec', color: r.status === 'failed' ? '#a8533a' : '#62655c' }}>
                  {r.status}
                </span>
              </td>
              <td className="text-[12px] text-[#9a9d92] whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorLogsTab() {
  const { rows, loading, isFetching, dataUpdatedAt, error, resolve, showResolved, setShowResolved, reload } = useErrorLogs();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh error logs.');
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const ghostCls = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';
  const pagBtnCls = 'cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-2 md:gap-2.5">
        <button
          onClick={() => { setShowResolved(!showResolved); setPage(1); }}
          className={`cursor-pointer whitespace-nowrap rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors ${
            showResolved
              ? 'border-[#3c7a5b] bg-[#edf4ef] text-[#3c7a5b]'
              : 'border-[#ece8df] bg-transparent text-[#62655c] hover:border-[#ddd8cb] hover:bg-[#fbf9f5]'
          }`}
        >
          {showResolved ? 'Hiding resolved' : 'Show resolved'}
        </button>
        <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
      </div>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={6} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">All clear.</strong>
          <span className="text-[13px] text-[#62655c]">No {showResolved ? '' : 'unresolved '}errors.</span>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table>
              <thead>
                <tr>
                  {['Severity', 'Source', 'Type', 'Message', 'When', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((e) => {
                  const pill = SEV_PILL[e.severity] ?? { bg: '#f5f2ec', text: '#62655c' };
                  return (
                    <tr key={e.id}>
                      <td>
                        <span className="atbl-pill" style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}>
                          {e.severity}
                        </span>
                      </td>
                      <td>
                        <span className="rounded-sm border border-[#ece8df] bg-[#fbf9f5] px-2 py-0.5 font-mono text-[11px] text-[#62655c]">{e.source}</span>
                      </td>
                      <td className="text-[12px] font-medium text-[#62655c]">{e.error_type}</td>
                      <td className="max-w-90 text-[#20211c]">
                        <div className="leading-relaxed">{e.message}</div>
                        {e.retry_count > 0 && (
                          <div className="mt-0.5 text-[12px] text-[#9a9d92]">{e.retry_count} retries</div>
                        )}
                      </td>
                      <td className="text-[12px] text-[#9a9d92] whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td>
                        {!e.resolved && (
                          <button
                            onClick={() => resolve(e.id)}
                            className="cursor-pointer rounded-lg border border-[#ece8df] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {paged.map((e) => {
              const pill = SEV_PILL[e.severity] ?? { bg: '#f5f2ec', text: '#62655c' };
              return (
                <div key={e.id} className="rounded-xl border border-[#ece8df] bg-white p-4">
                  <div className="flex items-start justify-between">
                    <span style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
                      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]">
                      {e.severity}
                    </span>
                    <span className="rounded border border-[#ece8df] bg-[#fbf9f5] px-2 py-0.5 font-mono text-[11px] text-[#62655c]">{e.source}</span>
                  </div>
                  <div className="mt-2 text-[12px] font-medium text-[#62655c]">{e.error_type}</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-[#20211c]">{e.message}</div>
                  {e.retry_count > 0 && (
                    <div className="text-[12px] text-[#9a9d92]">{e.retry_count} retries</div>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[12px] text-[#9a9d92]">{new Date(e.created_at).toLocaleString()}</span>
                    {!e.resolved && (
                      <button
                        onClick={() => resolve(e.id)}
                        className="cursor-pointer rounded-lg border border-[#ece8df] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#62655c] transition-colors hover:border-[#3c7a5b] hover:text-[#3c7a5b]"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shared pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-[#ece8df] bg-white px-4 py-3 text-[12.5px] text-[#9a9d92]">
              <span>Page {safePage} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} className={pagBtnCls}>Previous</button>
                <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} className={pagBtnCls}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

type Tab = 'escalated' | 'notifications' | 'errors';

export function Monitoring() {
  const [tab, setTab] = useState<Tab>('errors');
  const { rows: escalatedRows } = useEscalatedHotLeads();
  const { rows: failedRows } = useFailedNotifications();
  // Own instance of useErrorLogs - its showResolved defaults to false, so
  // this count is always "unresolved errors", independent of whatever the
  // Errors tab's own toggle (a separate hook instance) is currently showing.
  const { rows: unresolvedErrors } = useErrorLogs();

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'escalated', label: 'Escalated hot leads', count: escalatedRows.length },
    { key: 'notifications', label: 'Failed notifications', count: failedRows.length },
    { key: 'errors', label: 'Errors', count: unresolvedErrors.length },
  ];

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]"> <img src="https://cdn-icons-png.flaticon.com/128/15525/15525396.png" alt="Monitoring" className="w-8 h-8" />Monitoring</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">System errors and workflow failures</p>
        </div>
        <HelpButton content={HELP} />
      </header>

      <div className="atbl-tabs flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px shrink-0 cursor-pointer inline-flex items-center gap-1.5 border-b-2 px-4 py-3 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                active ? 'border-[#3c7a5b] text-[#3c7a5b]' : 'border-transparent text-[#9a9d92] hover:text-[#62655c]'
              }`}
            >
              {t.key === 'escalated' && <AlertTriangle size={14} className={active ? 'text-[#a8533a]' : 'text-[#c4bfb5]'} />}
              {t.label}
              {t.count > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${
                  active ? 'bg-[#edf4ef] text-[#3c7a5b]' : 'bg-[#f5f2ec] text-[#9a9d92]'
                }`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'escalated' && <EscalatedLeadsTab />}
      {tab === 'notifications' && <FailedNotificationsTab />}
      {tab === 'errors' && <ErrorLogsTab />}
    </div>
  );
}
