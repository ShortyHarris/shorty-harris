import { Link } from 'react-router-dom';
import { useAdminClientInsights, type InsightSeverityRank } from '../../hooks/useAdminData';
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import { useToast, ToastHost } from '../../components/Toast';
import { Filter } from 'lucide-react';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const HELP: HelpContent = {
  title: 'Results',
  body: [
    { type: 'p', text: "The same per-client insights the client sees on their own Results page, rolled up across every account — sorted worst first." },
    { type: 'p', text: "A client sitting at zero sent for weeks, or with a pile of unapproved drafts, shows up at the top. Click through to view that client's page." },
  ],
};

const SEVERITY_PILL: Record<InsightSeverityRank, { bg: string; text: string; label: string }> = {
  critical: { bg: '#f6e8e2', text: '#a8533a', label: 'Critical' },
  warning:  { bg: '#f8efdb', text: '#b9831f', label: 'Warning' },
  info:     { bg: '#f0ecf8', text: '#6b4fa0', label: 'Info' },
  none:     { bg: '#f5f2ec', text: '#62655c', label: 'All clear' },
};

export function AdminResults() {
  const { rows, loading, isFetching, dataUpdatedAt, error, reload } = useAdminClientInsights();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh results.');

  const ghostCls = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-2 font-extrabold tracking-tight text-[#20211c]">
            <Filter size={22} className="text-[#3c7a5b]" />
            Results
          </h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">Every client's funnel and insights, worst first</p>
        </div>
        <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
          <HelpButton content={HELP} />
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No clients yet.</strong>
        </div>
      ) : (
        <div className="atbl">
          <table className="table-fixed">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[40%]" />
            </colgroup>
            <thead>
              <tr>
                {['Client', 'Sent', 'Pending', 'Hot leads', 'Bounce', 'Issue'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = SEVERITY_PILL[r.top_severity];
                return (
                  <tr key={r.client_id}>
                    <td className="min-w-0 font-semibold text-[#20211c]">
                      <Link
                        to={`/admin/impersonate/${r.client_id}/results`}
                        className="block truncate no-underline text-[#20211c] hover:text-[#3c7a5b]"
                        title={r.business_name}
                      >
                        {r.business_name}
                      </Link>
                    </td>
                    <td className="text-[#62655c]">{r.sent}</td>
                    <td className={r.awaiting_approval > 0 ? 'font-semibold text-[#a8533a]' : 'text-[#62655c]'}>{r.awaiting_approval}</td>
                    <td className={r.hot_leads_open > 0 ? 'font-semibold text-[#a8533a]' : 'text-[#62655c]'}>{r.hot_leads_open}</td>
                    <td className="text-[#62655c]">{r.bounce_rate}%</td>
                    <td className="min-w-0">
                      <span className="atbl-pill" style={{ background: pill.bg, color: pill.text }}>{pill.label}</span>
                      {r.top_headline && (
                        <div className="mt-1 truncate text-[12px] text-[#9a9d92]" title={r.top_headline}>{r.top_headline}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
