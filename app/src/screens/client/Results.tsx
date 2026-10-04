import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  useClientResultInsights, type ResultInsight, type InsightAction, type ResultFunnel, type ResultCategoryRow,
} from '../../hooks/useClientResultInsights';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { Filter, AlertTriangle, Info, ArrowRight } from 'lucide-react';

const HELP: HelpContent = {
  title: 'Results',
  body: [
    { type: 'p', text: "Where your outreach actually stands: how many prospects turned into written emails, how many got sent, and what came back." },
    { type: 'p', text: "The cards below are ordered most urgent first - whatever needs your attention sits at the top." },
  ],
};

const FUNNEL_STEPS: { key: keyof ResultFunnel; label: string }[] = [
  { key: 'prospects', label: 'Prospects found' },
  { key: 'messages_generated', label: 'Emails written' },
  { key: 'sent', label: 'Approved & sent' },
  { key: 'human_replies', label: 'Replies' },
  { key: 'hot_leads', label: 'Hot leads' },
  { key: 'won', label: 'Won' },
];

const SEVERITY_STYLE: Record<ResultInsight['severity'], { bg: string; border: string; text: string; icon: boolean }> = {
  critical: { bg: 'var(--clay-tint)', border: '#e6cbc0', text: 'var(--clay)', icon: true },
  warning:  { bg: 'var(--amber-tint)', border: '#eddcb0', text: 'var(--amber)', icon: true },
  info:     { bg: 'var(--bg)', border: 'var(--line)', text: 'var(--ink-soft)', icon: false },
};

const ACTION_LABEL: Record<InsightAction, string> = {
  review_pending_messages: 'Review and approve',
  open_hot_leads: 'Open hot leads',
  open_blacklist: 'Manage exclusions',
  review_targeting: 'Edit targeting profile',
  create_campaign: 'Start a campaign',
  open_icp: 'Update my profile',
  retry_generation: 'Retry',
  contact_support: 'Get help',
  none: '',
};

// Only actions with a real destination today get a button - a card for an
// action whose page doesn't exist yet renders without one, per the brief,
// rather than linking somewhere dead.
function actionHref(action: InsightAction, basePath: string): string | null {
  switch (action) {
    case 'review_pending_messages': return `${basePath}/approvals`;
    case 'open_hot_leads': return basePath;
    case 'open_blacklist': return `${basePath}/settings?open=blacklist`;
    case 'review_targeting': return `${basePath}/targeting`;
    case 'create_campaign': return `${basePath}/campaigns`;
    case 'open_icp': return `${basePath}/targeting`;
    case 'contact_support': return 'mailto:support@shortyharris.com?subject=Help%20with%20my%20outreach%20results';
    case 'retry_generation': return null;
    case 'none': return null;
    default: return null;
  }
}

export function Results({ clientId, client = supabase, basePath = '/app' }: {
  clientId: string; client?: SupabaseClient; basePath?: string;
}) {
  const { funnel, insights, byCategory, loading, error } = useClientResultInsights(clientId, client);

  const isAllClear = insights.length === 1 && insights[0].code === 'all_clear';
  const maxFunnel = Math.max(1, funnel.prospects);

  return (
    <main className="content">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="m-0 text-[22px] font-extrabold tracking-tight flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <Filter size={19} style={{ color: 'var(--leaf)' }} />
            Results
          </h1>
          <p className="m-0 mt-1 text-[13.5px]" style={{ color: 'var(--ink-soft)' }}>
            Where your outreach stands right now.
          </p>
        </div>
        <HelpButton content={HELP} />
      </div>

      {error && (
        <div className="mb-5 rounded-xl border px-4 py-3.5 text-[13.5px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: '#e6cbc0' }}>
          Couldn't load your results: {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse mb-6 rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="h-4 w-40 rounded mb-3" style={{ background: 'var(--line)' }} />
          <div className="h-16 w-full rounded-lg" style={{ background: 'var(--line)' }} />
        </div>
      ) : (
        <>
          {/* ─── Funnel ─── */}
          <div className="mb-6 rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
            <div className="flex flex-wrap items-stretch gap-0">
              {FUNNEL_STEPS.map((step, i) => {
                const value = funnel[step.key];
                const pct = maxFunnel > 0 ? Math.round((Number(value) / maxFunnel) * 100) : 0;
                return (
                  <div key={step.key} className="flex items-center">
                    <div className="flex flex-col items-center px-3 py-1 min-w-[88px]">
                      <div className="text-[22px] font-extrabold" style={{ color: 'var(--ink)' }}>{value}</div>
                      <div className="text-[11px] text-center mt-0.5" style={{ color: 'var(--ink-faint)' }}>{step.label}</div>
                      <div className="mt-1.5 h-1 w-full rounded-full" style={{ background: 'var(--line)' }}>
                        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: 'var(--leaf)' }} />
                      </div>
                    </div>
                    {i < FUNNEL_STEPS.length - 1 && (
                      <div className="flex flex-col items-center px-1 shrink-0">
                        <ArrowRight size={14} style={{ color: 'var(--ink-faint)' }} />
                        {/* The approval blockage sits visibly between "written" and "sent" -
                            not a footnote - since for a stalled client this is the whole story. */}
                        {i === 1 && funnel.awaiting_approval > 0 && (
                          <span
                            className="mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ background: 'var(--clay-tint)', color: 'var(--clay)' }}
                          >
                            {funnel.awaiting_approval} stuck
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Outcomes, not progress - kept visually secondary to the funnel above */}
            <div className="mt-4 flex flex-wrap gap-4 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <SecondaryFigure label="Bounced" value={funnel.bounced} />
              <SecondaryFigure label="Auto-replies" value={funnel.auto_replies} />
              <SecondaryFigure label="Blocked" value={funnel.blocked} />
            </div>
          </div>

          {/* ─── Insight cards ─── */}
          <div className="mb-6 flex flex-col gap-3">
            {insights.map((insight) => (
              <InsightCard key={insight.code} insight={insight} basePath={basePath} />
            ))}
          </div>

          {/* ─── Category table ─── */}
          {!isAllClear && byCategory.length > 0 && (
            <CategoryTable rows={byCategory} />
          )}
        </>
      )}
    </main>
  );
}

function SecondaryFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[14px] font-bold" style={{ color: 'var(--ink-soft)' }}>{value}</span>
      <span className="text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>{label}</span>
    </div>
  );
}

function InsightCard({ insight, basePath }: { insight: ResultInsight; basePath: string }) {
  const style = SEVERITY_STYLE[insight.severity];
  const href = actionHref(insight.action, basePath);
  const isMailto = href?.startsWith('mailto:');

  return (
    <div
      className="rounded-2xl border px-5 py-4"
      style={{ background: style.bg, borderColor: style.border }}
    >
      <div className="flex items-start gap-2.5">
        {style.icon && (
          <span className="mt-0.5 shrink-0">
            {insight.severity === 'critical'
              ? <AlertTriangle size={16} style={{ color: style.text }} />
              : <Info size={16} style={{ color: style.text }} />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[14.5px] font-bold" style={{ color: insight.severity === 'info' ? 'var(--ink)' : style.text }}>
            {insight.headline}
          </h3>
          <p className="m-0 mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            {insight.detail}
          </p>
          {href && (
            isMailto ? (
              <a
                href={href}
                className="mt-3 inline-flex cursor-pointer items-center gap-1 rounded-lg border-0 px-3.5 py-1.5 text-[12.5px] font-bold text-white no-underline"
                style={{ background: 'var(--leaf)' }}
              >
                {ACTION_LABEL[insight.action]}
              </a>
            ) : (
              <Link
                to={href}
                className="mt-3 inline-flex cursor-pointer items-center gap-1 rounded-lg border-0 px-3.5 py-1.5 text-[12.5px] font-bold text-white no-underline"
                style={{ background: 'var(--leaf)' }}
              >
                {ACTION_LABEL[insight.action]}
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// Below ~30 emailed, a percentage reads as more confident than the sample
// supports - raw counts ("1 of 7") are the honest version of the same fact.
const RAW_COUNT_THRESHOLD = 30;

function CategoryTable({ rows }: { rows: ResultCategoryRow[] }) {
  const sorted = rows.slice().sort((a, b) => (b.positive - a.positive) || (b.emailed - a.emailed));
  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <h2 className="m-0 text-[15px] font-bold" style={{ color: 'var(--ink)' }}>By category</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ color: 'var(--ink-faint)' }} className="text-left text-[10.5px] font-bold uppercase tracking-[.06em]">
              <th className="px-5 py-3">Category</th>
              <th className="px-3 py-3">Emailed</th>
              <th className="px-3 py-3">Replies</th>
              <th className="px-3 py-3">Positive</th>
              <th className="px-3 py-3">Bounce rate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.category} style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}>
                <td className="px-5 py-3 font-semibold" style={{ color: 'var(--ink)' }}>{row.category}</td>
                <td className="px-3 py-3" style={{ color: 'var(--ink-soft)' }}>{row.emailed}</td>
                <td className="px-3 py-3" style={{ color: 'var(--ink-soft)' }}>{row.replied}</td>
                <td className="px-3 py-3 font-semibold" style={{ color: row.positive > 0 ? 'var(--leaf)' : 'var(--ink-faint)' }}>
                  {row.emailed < RAW_COUNT_THRESHOLD
                    ? `${row.positive} of ${row.emailed}`
                    : `${row.positive_rate.toFixed(1)}%`}
                </td>
                <td className="px-3 py-3" style={{ color: 'var(--ink-soft)' }}>{row.bounce_rate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
