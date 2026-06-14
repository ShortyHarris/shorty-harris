import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { useAnalytics } from '../../hooks/useAnalytics';
import './Screens.css';
import './Analytics.css';

const FUNNEL_COLORS = ['#2f4a7c', '#3f7cae', '#1f7a52', '#155c3d'];
const INTENT_COLORS: Record<string, string> = {
  interested: '#1f7a52', maybe: '#9a6b16', not_interested: '#9d3b3b',
  stop: '#6b2f2f', wrong_person: '#7a6a3a', out_of_office: '#5b6473',
};

export function Analytics() {
  const { data, loading, error, reload } = useAnalytics();

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Analytics</h1>
          <p className="screen-sub">Outreach performance across all clients</p>
        </div>
        <button className="ghost-btn" onClick={reload}>Refresh</button>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {loading || !data ? <div className="empty">Crunching the numbers…</div> : (
        <>
          <div className="metric-row">
            <Metric label="Messages sent" value={data.totals.sent} />
            <Metric label="Reply rate" value={`${data.totals.replyRate}%`} tone="blue" />
            <Metric label="Hot leads" value={data.totals.hotLeads} tone="green" />
            <Metric label="Won conversion" value={`${data.totals.conversionRate}%`} tone="green" />
          </div>

          <div className="chart-grid">
            <div className="chart-card">
              <h3>Conversion funnel</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.funnel} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#5b6473' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#8a909c' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f0ede6' }} contentStyle={{ borderRadius: 10, border: '1px solid #e4e0d7', fontSize: 13 }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {data.funnel.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>Reply intent</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.intents} dataKey="value" nameKey="intent" cx="50%" cy="50%" innerRadius={48} outerRadius={84} paddingAngle={2}>
                    {data.intents.map((d, i) => <Cell key={i} fill={INTENT_COLORS[d.intent] ?? '#999'} />)}
                  </Pie>
                  <Legend formatter={(v: string) => v.replace(/_/g, ' ')} wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e4e0d7', fontSize: 13 }} formatter={(v, n) => [v as number, String(n).replace(/_/g, ' ')]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card full">
            <h3>Performance by client</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.perClient} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#5b6473' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#8a909c' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f0ede6' }} contentStyle={{ borderRadius: 10, border: '1px solid #e4e0d7', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sent" name="Sent" fill="#9db4d4" radius={[5, 5, 0, 0]} />
                <Bar dataKey="hotLeads" name="Hot leads" fill="#2f4a7c" radius={[5, 5, 0, 0]} />
                <Bar dataKey="won" name="Won" fill="#1f7a52" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="section-head" style={{ marginTop: 30 }}><h2 style={{ fontSize: 18, margin: 0 }}>A/B tests</h2></div>
          {data.abTests.length === 0 ? (
            <div className="empty">No A/B tests running.</div>
          ) : (
            <div className="card-col">
              {data.abTests.map((t) => (
                <div className="row-card" key={t.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div className="row-card-title" style={{ justifyContent: 'space-between' }}>
                    {t.name}
                    <span className={`pill ${t.status === 'running' ? 'green' : 'neutral'}`}>{t.status}</span>
                  </div>
                  <div className="ab-variants">
                    {t.variants.map((v) => {
                      const best = Math.max(...t.variants.map((x) => x.replyRate));
                      return (
                        <div className={`ab-variant ${v.replyRate === best && best > 0 ? 'winning' : ''}`} key={v.key}>
                          <div className="ab-key">Variant {v.key}{v.replyRate === best && best > 0 && <span className="ab-lead">leading</span>}</div>
                          <div className="ab-rate">{v.replyRate}%</div>
                          <div className="ab-detail">{v.replies} replies / {v.visits} sent</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="metric" data-tone={tone}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}
