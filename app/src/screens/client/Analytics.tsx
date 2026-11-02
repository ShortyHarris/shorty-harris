import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useClientAnalytics, trendFor, type CampaignAnalytics } from '../../hooks/useClientAnalytics';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

const HELP: HelpContent = {
  title: 'Analytics',
  body: [
    { type: 'p', text: "How your emails are landing: how many businesses opened them, replied, bounced or opted out." },
    { type: 'p', text: "Rates are out of the businesses you've emailed. Pick a campaign at the top to see just that campaign, including its weekly chart." },
  ],
};

const FONT = "'Plus Jakarta Sans', sans-serif";
const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid var(--ad-line)', background: 'var(--ad-surface)', color: 'var(--ad-ink)', fontSize: 13, fontFamily: FONT };
const ACTIVE_DOT = { r: 4, stroke: 'var(--ad-surface)', strokeWidth: 2 };
const AXIS_TICK = { fontSize: 11, fill: 'var(--ad-ink-soft)', fontFamily: FONT };
const ALL = 'all';
// Above this, mailbox providers start treating the sending domain as a risk.
const BOUNCE_WARN_PCT = 5;

const cardStyle = { borderColor: 'var(--line)', background: 'var(--surface)' };

export function Analytics({ clientId, client = supabase }: { clientId: string; client?: SupabaseClient }) {
  const { data, loading, error } = useClientAnalytics(clientId, client);
  const [campaignId, setCampaignId] = useState<string>(ALL);

  const current: CampaignAnalytics | null = !data
    ? null
    : campaignId === ALL ? data.overall : data.byCampaign.find((c) => c.campaign_id === campaignId) ?? data.overall;
  const trend = data ? trendFor(data, campaignId === ALL ? '' : campaignId) : [];

  return (
    <main className="content flex flex-col gap-6">
      <div className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>Analytics</h1>
          <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>How your emails are landing, campaign by campaign.</p>
        </div>
        <HelpButton content={HELP} />
      </div>

      {error && (
        <div className="rounded-xl border px-4 py-3.5 text-[13.5px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: 'var(--line)' }}>
          Couldn't load your analytics: {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse rounded-[10px] border p-5" style={cardStyle}>
          <div className="mb-3 h-4 w-40 rounded" style={{ background: 'var(--line)' }} />
          <div className="h-16 w-full rounded-lg" style={{ background: 'var(--line)' }} />
        </div>
      ) : !data || !current || data.overall.emailed === 0 ? (
        <div className="rounded-[10px] border border-dashed px-5 py-10 text-center text-[13.5px]" style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-soft)' }}>
          No emails sent yet. Once outreach goes out, you'll see open, reply, bounce and opt-out rates here.
        </div>
      ) : (
        <>
          {data.byCampaign.length > 1 && (
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger
                aria-label="Campaign"
                style={{ fontFamily: FONT }}
                className="h-10 w-full max-w-sm gap-2 rounded-lg border-(--ad-line) bg-(--ad-surface-2) px-3 text-[13px] font-semibold text-(--ad-ink) shadow-none focus:ring-0 focus:ring-offset-0"
              >
                <span className="shrink-0 text-[12px] font-medium text-(--ad-ink-soft)">Campaign</span>
                <span className="min-w-0 flex-1 truncate text-left"><SelectValue /></span>
              </SelectTrigger>
              <SelectContent style={{ fontFamily: FONT }} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                <SelectItem value={ALL}>All campaigns</SelectItem>
                {data.byCampaign.map((c) => <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <section aria-label="Rates">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border md:grid-cols-5" style={{ borderColor: 'var(--line)', background: 'var(--line)' }}>
              <Stat label="Businesses emailed" value={String(current.emailed)}
                detail={current.emailsSent !== current.emailed ? `${current.emailsSent} emails sent` : undefined} />
              <Stat label="Opened" value={`${current.openRate}%`} detail={businesses(current.opened)} />
              <Stat label="Replied" value={`${current.replyRate}%`} detail={businesses(current.replied)} highlight={current.replied > 0} />
              <Stat label="Bounced" value={`${current.bounceRate}%`}
                detail={current.bounceRate >= BOUNCE_WARN_PCT ? 'High: this hurts delivery' : businesses(current.bounced)}
                warn={current.bounceRate >= BOUNCE_WARN_PCT} />
              <Stat label="Opted out" value={`${current.optOutRate}%`} detail={businesses(current.optOuts)} />
            </div>
            <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
              Rates are out of businesses emailed. Opens are estimates, because some email apps open emails automatically.
            </p>
          </section>

          <section className="rounded-[10px] border px-4 pb-3 pt-4" style={cardStyle}>
            <h2 className="m-0 text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>Weekly activity</h2>
            <p className="m-0 mb-3 mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>Emails sent, opened and replied to each week, over the last 8 weeks.</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ad-line)" />
                <XAxis dataKey="weekLabel" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: 'var(--ad-line-strong)' }} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: FONT }} />
                <Line type="monotone" dataKey="sent" name="Sent" stroke="var(--ad-ink-soft)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={ACTIVE_DOT} />
                <Line type="monotone" dataKey="opened" name="Opened" stroke="var(--ad-ink)" strokeWidth={2} dot={false} activeDot={ACTIVE_DOT} />
                <Line type="monotone" dataKey="replied" name="Replied" stroke="var(--ad-green)" strokeWidth={2} dot={false} activeDot={ACTIVE_DOT} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="overflow-hidden rounded-[10px] border" style={cardStyle}>
            <h2 className="m-0 border-b px-4 py-3 text-[14px] font-semibold" style={{ color: 'var(--ink)', borderColor: 'var(--line)' }}>By campaign</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[.06em]" style={{ color: 'var(--ink-soft)' }}>
                    <th scope="col" className="px-4 py-3 text-left">Campaign</th>
                    <th scope="col" className="px-3 py-3 text-right">Emailed</th>
                    <th scope="col" className="px-3 py-3 text-right">Opened</th>
                    <th scope="col" className="px-3 py-3 text-right">Replied</th>
                    <th scope="col" className="px-3 py-3 text-right">Bounced</th>
                    <th scope="col" className="px-3 py-3 text-right">Opted out</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCampaign.map((c) => {
                    const selected = c.campaign_id === campaignId;
                    return (
                      <tr key={c.campaign_id} style={{ borderTop: '1px solid var(--line)', background: selected ? 'var(--leaf-tint)' : undefined }}>
                        <td className="px-4 py-3 font-semibold" style={{ color: 'var(--ink)' }}>{c.campaign_name}</td>
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--ink-soft)' }}>{c.emailed}</td>
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--ink-soft)' }}>{c.openRate}%</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums" style={{ color: c.replied > 0 ? 'var(--leaf)' : 'var(--ink-soft)' }}>{c.replyRate}%</td>
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: c.bounceRate >= BOUNCE_WARN_PCT ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: c.bounceRate >= BOUNCE_WARN_PCT ? 700 : undefined }}>{c.bounceRate}%</td>
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--ink-soft)' }}>{c.optOutRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function businesses(n: number): string {
  return `${n} business${n === 1 ? "" : "es"}`;
}

function Stat({ label, value, detail, highlight, warn }: { label: string; value: string; detail?: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="px-4 py-3.5" style={{ background: 'var(--surface)' }}>
      <div className="text-[12px] font-medium" style={{ color: 'var(--ink-soft)' }}>{label}</div>
      <div className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-tight tabular-nums" style={{ color: highlight ? 'var(--leaf)' : 'var(--ink)' }}>{value}</div>
      {detail && <div className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-soft)', fontWeight: warn ? 700 : undefined }}>{detail}</div>}
    </div>
  );
}
