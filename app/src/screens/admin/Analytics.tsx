import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { useAnalytics } from '../../hooks/useAnalytics';
import { SkeletonTiles, SkeletonChart } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';

const HELP: HelpContent = {
  title: 'Analytics',
  body: [
    { type: 'p', text: "Top-level performance across every client and campaign — how many emails went out, how many got a reply, how many became Hot Leads, and how many closed as Won." },
    { type: 'p', text: "Use the per-client breakdown on the right to compare results across accounts. Click a client name to see their individual numbers." },
  ],
};

const CLIENT_COLORS = ['#ddd8cb', '#b9831f', '#3c7a5b'];

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const FUNNEL_COLORS = ['#3c7a5b', '#5a9a78', '#85bfa0', '#b0d5c3'];
const INTENT_COLORS: Record<string, string> = {
  interested:    '#3c7a5b',
  maybe:         '#b9831f',
  not_interested:'#9a9d92',
  stop:          '#a8533a',
  wrong_person:  '#c4bfb5',
  out_of_office: '#ddd8cb',
};

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid #ece8df',
  fontSize: 13,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

export function Analytics() {
  const { data, loading, error, reload } = useAnalytics();
  const [selectedClientIdx, setSelectedClientIdx] = useState(0);
  const [clientSearch, setClientSearch] = useState('');

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
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]"> <img src="https://cdn-icons-png.flaticon.com/128/5581/5581350.png" alt="Analytics" className="w-10 h-10" />Analytics</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">Outreach performance across all clients</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <button
            onClick={reload}
            className="cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
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
            <ChartCard title="Conversion funnel">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.funnel} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#62655c', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#9a9d92', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f5f2ec' }} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {data.funnel.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Reply intent">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.intents} dataKey="value" nameKey="intent" cx="50%" cy="50%" innerRadius={48} outerRadius={84} paddingAngle={2}>
                    {data.intents.map((d, i) => <Cell key={i} fill={INTENT_COLORS[d.intent] ?? '#c4bfb5'} />)}
                  </Pie>
                  <Legend formatter={(v: string) => v.replace(/_/g, ' ')} wrapperStyle={{ fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [v as number, String(n).replace(/_/g, ' ')]} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Per-client chart */}
          <ChartCard title="Performance by client">
            {/* ── Desktop: all clients grouped ── */}
            <div className="hidden md:block">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.perClient} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#62655c', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#9a9d92', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f5f2ec' }} contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                  <Bar dataKey="sent"     name="Sent"      fill="#ddd8cb" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="hotLeads" name="Hot leads" fill="#b9831f" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="won"      name="Won"       fill="#3c7a5b" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Mobile: pill selector + single-client chart ── */}
            <div className="md:hidden">
              {/* Search — shown when 6+ clients */}
              {allClients.length >= 6 && (
                <div className="mb-3 relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9d92]" />
                  <input
                    value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setSelectedClientIdx(0); }}
                    placeholder="Search clients…"
                    style={FONT}
                    className="w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] py-2 pl-8 pr-3 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] focus:border-[#3c7a5b] focus:bg-white transition-colors"
                  />
                </div>
              )}

              {/* Client pills — horizontally scrollable */}
              <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">
                {filteredClients.map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() => setSelectedClientIdx(i)}
                    className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                      i === safeIdx
                        ? 'bg-[#3c7a5b] text-white'
                        : 'border border-[#ece8df] bg-transparent text-[#62655c] hover:border-[#3c7a5b] hover:text-[#3c7a5b]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
                {filteredClients.length === 0 && (
                  <span className="text-[13px] text-[#9a9d92]">No clients match your search.</span>
                )}
              </div>

              {/* Chart for selected client — maxBarSize keeps bars proportional */}
              {selectedClient && (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={clientChartData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                    <XAxis dataKey="metric" tick={{ fontSize: 12, fill: '#62655c', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#9a9d92', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f5f2ec' }} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72}>
                      {clientChartData.map((_, i) => (
                        <Cell key={i} fill={CLIENT_COLORS[i] ?? '#ddd8cb'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>

          {/* A/B tests */}
          <div>
            <h2 className="m-0 mb-4 text-[18px] font-bold text-[#20211c]">A/B tests</h2>
            {data.abTests.length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
                <span className="text-[13px] text-[#62655c]">No A/B tests running.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data.abTests.map((t) => {
                  const best = Math.max(...t.variants.map((v) => v.replyRate));
                  return (
                    <div key={t.id} className="overflow-hidden rounded-lg border border-[#ece8df] bg-white p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="font-bold text-[#20211c]">{t.name}</span>
                        <span style={{
                          background: t.status === 'running' ? '#edf4ef' : '#f5f2ec',
                          color:      t.status === 'running' ? '#3c7a5b' : '#62655c',
                        }} className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]">
                          {t.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {t.variants.map((v) => {
                          const winning = v.replyRate === best && best > 0;
                          return (
                            <div key={v.key} className={`rounded-lg border p-4 ${winning ? 'border-[#a9d6c1] bg-[#edf4ef]' : 'border-[#ece8df] bg-[#fbf9f5]'}`}>
                              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#62655c]">
                                Variant {v.key}
                                {winning && (
                                  <span className="rounded-full bg-[#3c7a5b] px-2 py-0.5 text-[10.5px] font-bold text-white">leading</span>
                                )}
                              </div>
                              <div className="mt-1 text-[26px] font-extrabold tabular-nums text-[#20211c]">{v.replyRate}%</div>
                              <div className="text-[12px] text-[#9a9d92]">{v.replies} replies / {v.visits} sent</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number | string; accent?: 'green' | 'amber' }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[#ece8df] bg-white px-5 py-[18px]">
      <span className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-[#20211c]">{value}</span>
      <span className="text-[12px] text-[#9a9d92]">{label}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#ece8df] bg-white p-5 shadow-[0_1px_2px_rgba(32,33,28,0.04),0_8px_28px_rgba(32,33,28,0.06)]">
      <h3 className="m-0 mb-4 text-[14.5px] font-bold text-[#20211c]">{title}</h3>
      {children}
    </div>
  );
}
