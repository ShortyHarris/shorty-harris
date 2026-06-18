import { useState } from 'react';
import { useErrorLogs } from '../../hooks/useAdminData';
import { SkeletonTable } from '../../components/Skeleton';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const SEV_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  warning:  { bg: '#f8efdb', text: '#b9831f' },
  error:    { bg: '#f6e8e2', text: '#a8533a', border: '1px solid rgba(168,83,58,0.2)' },
  critical: { bg: '#a8533a', text: '#fff' },
};

const PAGE_SIZE = 10;

export function Monitoring() {
  const { rows, loading, error, resolve, showResolved, setShowResolved, reload } = useErrorLogs();
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const ghostCls = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';
  const pagBtnCls = 'cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]"> <img src="https://cdn-icons-png.flaticon.com/128/15525/15525396.png" alt="Monitoring" className="w-8 h-8" />Monitoring</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">System errors and workflow failures</p>
        </div>
        <div className="flex gap-2 md:gap-2.5 shrink-0">
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
          <button onClick={reload} className={ghostCls}>Refresh</button>
        </div>
      </header>

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
          <div className="hidden md:block overflow-hidden rounded-lg border border-[#ece8df] bg-white">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#ece8df] bg-[#fbf9f5]">
                  {['Severity', 'Source', 'Type', 'Message', 'When', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((e, i) => {
                  const pill = SEV_PILL[e.severity] ?? { bg: '#f5f2ec', text: '#62655c' };
                  return (
                    <tr key={e.id} className={`transition-colors hover:bg-[#fbf9f5] ${i < paged.length - 1 ? 'border-b border-[#f5f2ec]' : ''}`}>
                      <td className="px-4 py-3">
                        <span style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
                          className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]">
                          {e.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-[#ece8df] bg-[#fbf9f5] px-2 py-0.5 font-mono text-[11px] text-[#62655c]">{e.source}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] font-medium text-[#62655c]">{e.error_type}</td>
                      <td className="max-w-[360px] px-4 py-3 text-[#20211c]">
                        <div className="leading-relaxed">{e.message}</div>
                        {e.retry_count > 0 && (
                          <div className="mt-0.5 text-[12px] text-[#9a9d92]">{e.retry_count} retries</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[#9a9d92] whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
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
    </div>
  );
}
