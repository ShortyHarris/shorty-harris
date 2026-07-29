import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useClientAnalytics, type CampaignAnalytics } from '../../hooks/useClientAnalytics';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { BarChart3 } from 'lucide-react';
import './Analytics.css';

const HELP: HelpContent = {
  title: 'Analytics',
  body: [
    { type: 'p', text: "How your outreach is actually performing: how many emails went out, how many got opened, how many people replied, and how many bounced or opted out." },
    { type: 'p', text: "The chart below shows weekly activity over the last 8 weeks. The table breaks the same numbers down by individual campaign." },
  ],
};

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid #ece8df',
  fontSize: 13,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

export function Analytics({ clientId }: { clientId: string }) {
  const { overall, byCampaign, trend, loading, error } = useClientAnalytics(clientId);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

  const selected: CampaignAnalytics | null =
    selectedCampaignId === '' ? overall : byCampaign.find((c) => c.campaign_id === selectedCampaignId) ?? overall;

  return (
    <>
      <div className="an-head">
        <div className="an-head-row">
          <div>
            <h1 className="an-title">
              <BarChart3 size={18} className="an-title-icon" />
              Analytics
            </h1>
            <p className="an-sub">How your outreach is performing, across every campaign.</p>
          </div>
          <HelpButton content={HELP} />
        </div>
      </div>

      {error && <div className="an-error">{error}</div>}

      {loading ? (
        <div className="an-skeleton-grid">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skeleton-card" />)}
        </div>
      ) : !overall || overall.sent === 0 ? (
        <div className="an-empty">
          No emails sent yet. Once outreach goes out, you'll see open rates, reply rates, and more here.
        </div>
      ) : (
        <>
          <KpiGrid data={selected ?? overall} />

          <div className="an-chart-card">
            <h2 className="an-section-title">Weekly activity</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ece8df" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: '#9a9d92', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9a9d92', fontFamily: "'Plus Jakarta Sans', sans-serif" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                <Line type="monotone" dataKey="sent" name="Sent" stroke="#9a9d92" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="opened" name="Opened" stroke="#b9831f" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="replied" name="Replied" stroke="#3c7a5b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="an-table-card">
            <h2 className="an-section-title">By campaign</h2>
            <div className="an-table-scroll">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Sent</th>
                    <th>Open rate</th>
                    <th>Reply rate</th>
                    <th>Bounce rate</th>
                    <th>Opt-out rate</th>
                  </tr>
                </thead>
                <tbody>
                  {byCampaign.map((c) => (
                    <tr
                      key={c.campaign_id}
                      className={selectedCampaignId === c.campaign_id ? 'an-row-selected' : ''}
                      onClick={() => setSelectedCampaignId((cur) => (cur === c.campaign_id ? '' : c.campaign_id))}
                    >
                      <td className="an-td-name">{c.campaign_name}</td>
                      <td>{c.sent}</td>
                      <td>{c.openRate}%</td>
                      <td>{c.replyRate}%</td>
                      <td className={c.bounceRate >= 5 ? 'an-td-warn' : ''}>{c.bounceRate}%</td>
                      <td>{c.optOutRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="an-table-hint">Tap a row to see that campaign's numbers above. Tap again to go back to all campaigns.</p>
          </div>
        </>
      )}
    </>
  );
}

function KpiGrid({ data }: { data: CampaignAnalytics }) {
  return (
    <div className="an-kpi-grid">
      <KpiCard label="Sent" value={String(data.sent)} />
      <KpiCard label="Open rate" value={`${data.openRate}%`} sub={`${data.opened} opened`} />
      <KpiCard label="Reply rate" value={`${data.replyRate}%`} sub={`${data.replied} replied`} />
      <KpiCard label="Bounce rate" value={`${data.bounceRate}%`} sub={`${data.bounced} bounced`} warn={data.bounceRate >= 5} />
      <KpiCard label="Opt-out rate" value={`${data.optOutRate}%`} sub={`${data.optOuts} opted out`} />
    </div>
  );
}

function KpiCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`an-kpi-card${warn ? ' an-kpi-warn' : ''}`}>
      <span className="an-kpi-label">{label}</span>
      <span className="an-kpi-value">{value}</span>
      {sub && <span className="an-kpi-sub">{sub}</span>}
    </div>
  );
}
