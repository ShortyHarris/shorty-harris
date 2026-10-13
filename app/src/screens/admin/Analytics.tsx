import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  Legend,
} from 'recharts';
import { ReplyBreakdown } from './ReplyBreakdown';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useDoNotContact } from '../../hooks/useDoNotContact';
import { SkeletonTiles, SkeletonChart } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';

const HELP: HelpContent = {
  title: 'Analytics',
  body: [
    { type: 'p', text: "Top-level performance across every client and campaign - how many emails went out, how many got a reply, how many became Hot Leads, and how many closed as Won." },
    { type: 'p', text: "Use the per-client breakdown on the right to compare results across accounts. Click a client name to see their individual numbers." },
  ],
};

const CLIENT_COLORS = ['var(--ad-line-strong)', 'var(--ad-amber)', 'var(--ad-green)'];

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const FUNNEL_COLORS = ['var(--ad-green)', '#5a9a78', '#85bfa0', 'var(--ad-green-line)'];

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid var(--ad-line)',
  background: 'var(--ad-surface)',
  color: 'var(--ad-ink)',
  fontSize: 13,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

export function Analytics() {
  const { data, loading, isFetching, dataUpdatedAt, error, reload } = useAnalytics();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh analytics.');
  const [selectedClientIdx, setSelectedClientIdx] = useState(0);
  const [clientSearch, setClientSearch] = useState('');

  const { stats: dncStats, loading: dncLoading, error: dncError } = useDoNotContact();

  const allClients = data?.perClient ?? [];
  const filteredClients = clientSearch
    ? allClients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : allClients;
  const safeIdx = Math.min(selectedClientIdx, Math.max(0, filteredClients.length - 1));
  const selectedClient = filteredClients[safeIdx] ?? null;
  const clientChartData = selectedClient
    ? [
        { metric: 'Sent',      value: selectedClient.sent },
        { metric: 'Hot leads', value: selectedClient.hotLeads },
        { metric: 'Won',       value: selectedClient.won },
      ]
    : [];

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-(--ad-ink)"> <img src="https://cdn-icons-png.flaticon.com/128/5581/5581350.png" alt="Analytics" className="w-10 h-10" />Analytics</h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">Outreach performance across all clients</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <RefreshButton
            onRefresh={handleRefresh}
            isFetching={isFetching}
            dataUpdatedAt={dataUpdatedAt}
            className="cursor-pointer whitespace-nowrap rounded-xl border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-line-strong) hover:bg-(--ad-surface-2)"
          />
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{error}</div>
      )}

      {loading || !data ? (
        <>
          <SkeletonTiles count={4} cols={4} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonChart />
            <SkeletonChart />
          </div>
        </>
      ) : (
        <>
          {/* Metric tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricTile label="Messages sent"   value={data.totals.sent} />
            <MetricTile label="Reply rate"       value={`${data.totals.replyRate}%`} accent="amber" />
            <MetricTile label="Hot leads"        value={data.totals.hotLeads} accent="green" />
            <MetricTile label="Won conversion"   value={`${data.totals.conversionRate}%`} accent="green" />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
            <ChartCard title="Conversion funnel">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.funnel} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 12, fill: 'var(--ad-ink-soft)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--ad-ink-faint)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--ad-fill)' }} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {data.funnel.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            </div>

            <ReplyBreakdown replies={data.replyRecords} />
          </div>

          {/* Per-client chart */}
          <ChartCard title="Performance by client">
            {/* ── Desktop: all clients grouped ── */}
            <div className="hidden md:block">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.perClient} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--ad-ink-soft)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--ad-ink-faint)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--ad-fill)' }} contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                  <Bar dataKey="sent"     name="Sent"      fill="var(--ad-line-strong)" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="hotLeads" name="Hot leads" fill="var(--ad-amber)" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="won"      name="Won"       fill="var(--ad-green)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Mobile: pill selector + single-client chart ── */}
            <div className="md:hidden">
              {/* Search - shown when 6+ clients */}
              {allClients.length >= 6 && (
                <div className="mb-3 relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--ad-ink-faint)" />
                  <input
                    value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setSelectedClientIdx(0); }}
                    placeholder="Search clients…"
                    style={FONT}
                    className="w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) py-2 pl-8 pr-3 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) focus:border-(--ad-green) focus:bg-(--ad-surface) transition-colors"
                  />
                </div>
              )}

              {/* Client pills - horizontally scrollable */}
              <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">
                {filteredClients.map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() => setSelectedClientIdx(i)}
                    className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                      i === safeIdx
                        ? 'bg-(--ad-green) text-white'
                        : 'border border-(--ad-line) bg-transparent text-(--ad-ink-soft) hover:border-(--ad-green) hover:text-(--ad-green)'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
                {filteredClients.length === 0 && (
                  <span className="text-[13px] text-(--ad-ink-faint)">No clients match your search.</span>
                )}
              </div>

              {/* Chart for selected client - maxBarSize keeps bars proportional */}
              {selectedClient && (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={clientChartData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                    <XAxis dataKey="metric" tick={{ fontSize: 12, fill: 'var(--ad-ink-soft)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--ad-ink-faint)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'var(--ad-fill)' }} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72}>
                      {clientChartData.map((_, i) => (
                        <Cell key={i} fill={CLIENT_COLORS[i] ?? 'var(--ad-line-strong)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>

        </>
      )}

      {/* A/B tests + Do Not Contact side by side on large screens, stacked below - both
          boxes stretch to the row's tallest content so they line up evenly. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <h2 className="m-0 mb-4 text-[18px] font-bold text-(--ad-ink)">A/B tests</h2>
          {loading || !data ? (
            <SkeletonChart />
          ) : data.abTests.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
              <span className="text-[13px] text-(--ad-ink-soft)">No A/B tests running.</span>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3">
              {data.abTests.map((t) => {
                const best = Math.max(...t.variants.map((v) => v.replyRate));
                return (
                  <div key={t.id} className="flex flex-1 flex-col overflow-hidden rounded-lg border border-(--ad-line) bg-(--ad-surface) p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-bold text-(--ad-ink)">{t.name}</span>
                      <span style={{
                        background: t.status === 'running' ? 'var(--ad-green-tint)' : 'var(--ad-fill)',
                        color:      t.status === 'running' ? 'var(--ad-green)' : 'var(--ad-ink-soft)',
                      }} className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]">
                        {t.status}
                      </span>
                    </div>
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height="100%" minHeight={160}>
                        <BarChart
                          data={t.variants.map((v) => ({ variant: `Variant ${v.key}`, replyRate: v.replyRate, replies: v.replies, sent: v.sent }))}
                          margin={{ top: 8, right: 8, bottom: 8, left: -16 }}
                        >
                          <XAxis dataKey="variant" tick={{ fontSize: 12, fill: 'var(--ad-ink-soft)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                          <YAxis unit="%" tick={{ fontSize: 12, fill: 'var(--ad-ink-faint)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: 'var(--ad-fill)' }}
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(v, _n, item) => [`${v}% (${item.payload.replies}/${item.payload.sent})`, 'Reply rate']}
                          />
                          <Bar dataKey="replyRate" radius={[6, 6, 0, 0]} maxBarSize={96}>
                            {t.variants.map((v) => (
                              <Cell key={v.key} fill={v.replyRate === best && best > 0 ? 'var(--ad-green)' : 'var(--ad-line-strong)'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {t.variants.map((v) => (
                        <span key={v.key} className="text-[12px] text-(--ad-ink-faint)">
                          <strong className="font-semibold text-(--ad-ink-soft)">Variant {v.key}:</strong> {v.replies} replies / {v.sent} sent
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <h2 className="m-0 mb-4 text-[18px] font-bold text-(--ad-ink)">Do Not Contact</h2>
          {dncError && (
            <div className="mb-4 rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{dncError}</div>
          )}
          {dncLoading ? (
            <SkeletonChart />
          ) : (
            <div className="flex flex-1 flex-col rounded-lg border border-(--ad-line) bg-(--ad-surface) p-5 shadow-[0_1px_2px_rgba(32,33,28,0.04),0_8px_28px_rgba(32,33,28,0.06)]">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                  <BarChart data={[{ label: 'Opt-outs', value: dncStats?.total_optouts ?? 0 }]} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--ad-ink-soft)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--ad-ink-faint)', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'var(--ad-fill)' }} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" name="Opt-outs" radius={[6, 6, 0, 0]} maxBarSize={96} fill="var(--ad-clay)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number | string; accent?: 'green' | 'amber' }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-(--ad-line) bg-(--ad-surface) px-5 py-[18px]">
      <span className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-(--ad-ink)">{value}</span>
      <span className="text-[12px] text-(--ad-ink-faint)">{label}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-(--ad-line) bg-(--ad-surface) p-5 shadow-[0_1px_2px_rgba(32,33,28,0.04),0_8px_28px_rgba(32,33,28,0.06)]">
      <h3 className="m-0 mb-4 text-[14.5px] font-bold text-(--ad-ink)">{title}</h3>
      {children}
    </div>
  );
}
