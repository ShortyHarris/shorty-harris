import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  useClientResultInsights, type ResultInsight, type InsightAction, type ResultFunnel, type ResultCategoryRow,
} from '../../hooks/useClientResultInsights';
import { arrangeInsights, worthShowingCategories } from '../../lib/resultInsights';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { btn } from '../../lib/clientButtons';

const HELP: HelpContent = {
  title: 'Results',
  body: [
    { type: 'p', text: "How your outreach is doing: what was sent, who replied, and which leads came out of it." },
    { type: 'p', text: "Your next step is the most urgent thing waiting on you. What's working shows the types of business that are responding." },
  ],
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
    case 'contact_support': return 'mailto:hello@shortyharris.com?subject=Help%20with%20my%20outreach%20results';
    case 'retry_generation': return null;
    case 'none': return null;
    default: return null;
  }
}

// Below ~30 emailed, a percentage reads as more confident than the sample
// supports - raw counts are the honest version of the same fact.
const RAW_COUNT_THRESHOLD = 30;

export function Results({ clientId, client = supabase, basePath = '/app' }: {
  clientId: string; client?: SupabaseClient; basePath?: string;
}) {
  const { funnel, insights, byCategory, loading, error } = useClientResultInsights(clientId, client);

  const isAllClear = insights.length === 1 && insights[0].code === 'all_clear';
  const { nextStep, others } = arrangeInsights(insights, funnel.sent);

  return (
    <main className="content flex flex-col gap-6">
      <div className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>Results</h1>
          <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            How your outreach is doing.
          </p>
        </div>
        <HelpButton content={HELP} />
      </div>

      {error && (
        <div className="rounded-xl border px-4 py-3.5 text-[13.5px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: 'var(--line)' }}>
          Couldn't load your results: {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse rounded-[10px] border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="mb-3 h-4 w-40 rounded" style={{ background: 'var(--line)' }} />
          <div className="h-16 w-full rounded-lg" style={{ background: 'var(--line)' }} />
        </div>
      ) : (
        <>
          <OutreachFlow funnel={funnel} basePath={basePath} />
          {nextStep && <NextStep insight={nextStep} basePath={basePath} />}
          {others.length > 0 && <AlsoWorthALook insights={others} basePath={basePath} />}
          {!isAllClear && byCategory.length > 0 && <WhatsWorking rows={byCategory} />}
        </>
      )}
    </main>
  );
}

function replySummary(replies: number, sent: number): string | undefined {
  if (sent === 0) return undefined;
  if (sent < RAW_COUNT_THRESHOLD) return `from ${sent} emailed`;
  return `${((replies / sent) * 100).toFixed(1)}% of emailed`;
}

function OutreachFlow({ funnel, basePath }: { funnel: ResultFunnel; basePath: string }) {
  // Every step counts prospects when the per-prospect fields exist; older data counts emails.
  const perProspect = funnel.prospects_emailed !== undefined;
  const emailed = funnel.prospects_emailed ?? funnel.sent;
  const steps: { label: string; value: number; detail?: string; waiting?: number }[] = [
    { label: 'Prospects found', value: funnel.prospects },
    perProspect
      ? { label: 'Email written', value: funnel.prospects_written ?? 0, waiting: funnel.prospects_awaiting ?? 0 }
      : { label: 'Emails written', value: funnel.messages_generated, waiting: funnel.awaiting_approval },
    { label: perProspect ? 'Emailed' : 'Approved & sent', value: emailed },
    { label: 'Replied', value: funnel.human_replies, detail: replySummary(funnel.human_replies, emailed) },
    { label: 'Hot leads', value: funnel.hot_leads, detail: funnel.hot_leads_open > 0 ? `${funnel.hot_leads_open} waiting for you` : undefined },
    { label: 'Won', value: funnel.won },
  ];
  const minor = [
    funnel.auto_replies > 0 ? `${funnel.auto_replies} auto-${funnel.auto_replies === 1 ? 'reply' : 'replies'}` : null,
    funnel.bounced > 0 ? `${funnel.bounced} bounced` : null,
    funnel.blocked > 0 ? `${funnel.blocked} blocked` : null,
  ].filter(Boolean);

  return (
    <section aria-label="How your outreach is flowing" className="rounded-[10px] border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <ol className="m-0 flex list-none flex-col p-0 lg:flex-row">
        {steps.map((step, i) => {
          const next = steps[i + 1];
          const reached = step.value > 0;
          const blocked = (step.waiting ?? 0) > 0;
          return (
            <li key={step.label} className="relative flex min-w-0 gap-3 pb-5 last:pb-0 lg:flex-1 lg:flex-col lg:gap-2.5 lg:pb-0 lg:pr-3 lg:last:pr-0">
              {next && (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-[5px] top-3 border-l-2 lg:bottom-auto lg:left-3 lg:right-0 lg:top-[5px] lg:border-l-0 lg:border-t-2"
                  style={{ borderStyle: blocked ? 'dashed' : 'solid', borderColor: next.value > 0 || blocked ? 'var(--leaf)' : 'var(--line)' }}
                />
              )}
              <span
                aria-hidden
                className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 lg:mt-0"
                style={{ borderColor: reached ? 'var(--leaf)' : 'var(--line-strong)', background: reached ? 'var(--leaf)' : 'var(--surface)' }}
              />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 lg:block">
                  <div className="text-[24px] font-extrabold leading-none tracking-tight tabular-nums" style={{ color: 'var(--ink)' }}>{step.value}</div>
                  <div className="text-[12.5px] font-medium lg:mt-1" style={{ color: 'var(--ink-soft)' }}>{step.label}</div>
                </div>
                {step.detail && <div className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-soft)' }}>{step.detail}</div>}
                {blocked && (
                  <Link
                    to={`${basePath}/approvals`}
                    className="mt-1.5 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full py-0.5 pl-2.5 pr-1.5 text-[12px] font-semibold no-underline transition-colors hover:bg-(--leaf) hover:text-(--ad-on-accent)"
                    style={{ background: 'var(--leaf-tint)', color: 'var(--leaf)' }}
                  >
                    {step.waiting} waiting <ChevronRight size={13} aria-hidden />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {minor.length > 0 && (
        <p className="m-0 mt-4 border-t pt-3 text-[12px]" style={{ color: 'var(--ink-soft)', borderColor: 'var(--line)' }}>Not counted as replies: {minor.join(' · ')}</p>
      )}
    </section>
  );
}

function InsightLink({ insight, basePath, className, children }: {
  insight: ResultInsight; basePath: string; className: string; children: React.ReactNode;
}) {
  const href = actionHref(insight.action, basePath);
  if (!href) return null;
  return href.startsWith('mailto:')
    ? <a href={href} className={className}>{children}</a>
    : <Link to={href} className={className}>{children}</Link>;
}

function NextStep({ insight, basePath }: { insight: ResultInsight; basePath: string }) {
  return (
    <section
      aria-label="Your next step"
      className="flex flex-col gap-3 rounded-r-[10px] border-l-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4"
      style={{ background: 'var(--leaf-tint)', borderLeftColor: 'var(--leaf)' }}
    >
      <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-(--ad-on-accent) sm:flex" style={{ background: 'var(--leaf)' }}>
        <AlertTriangle size={14} strokeWidth={2.3} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold" style={{ color: 'var(--leaf)' }}>Your next step</div>
        <h2 className="m-0 mt-0.5 text-[15px] font-bold leading-snug" style={{ color: 'var(--ink)' }}>{insight.headline}</h2>
        <p className="m-0 mt-0.5 text-[12.5px] leading-snug" style={{ color: 'var(--ink-soft)' }}>{insight.detail}</p>
      </div>
      <InsightLink insight={insight} basePath={basePath} className={`${btn('primary', 'md')} shrink-0 self-start whitespace-nowrap no-underline sm:self-center`}>
        {ACTION_LABEL[insight.action]}
      </InsightLink>
    </section>
  );
}

function AlsoWorthALook({ insights, basePath }: { insights: ResultInsight[]; basePath: string }) {
  return (
    <section className="overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <h2 className="m-0 border-b px-4 py-3 text-[14px] font-semibold" style={{ color: 'var(--ink)', borderColor: 'var(--line)' }}>Also worth a look</h2>
      {insights.map((insight, i) => (
        <div
          key={insight.code}
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}
        >
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[13.5px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>{insight.headline}</h3>
            <p className="m-0 mt-0.5 text-[12.5px] leading-snug" style={{ color: 'var(--ink-soft)' }}>{insight.detail}</p>
          </div>
          <InsightLink
            insight={insight}
            basePath={basePath}
            className="inline-flex shrink-0 items-center gap-0.5 self-start whitespace-nowrap text-[12.5px] font-semibold text-(--leaf) no-underline hover:underline sm:self-center"
          >
            {ACTION_LABEL[insight.action]} <ChevronRight size={14} aria-hidden />
          </InsightLink>
        </div>
      ))}
    </section>
  );
}

export function WhatsWorking({ rows }: { rows: ResultCategoryRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const meaningful = worthShowingCategories(rows);
  const hiddenCount = rows.length - meaningful.length;
  const visible = showAll
    ? rows.slice().sort((a, b) => (b.positive - a.positive) || (b.replied - a.replied) || (b.emailed - a.emailed))
    : meaningful;
  const showBounces = visible.some((r) => r.bounced > 0);
  const numeric = 'px-2 py-3 text-right tabular-nums sm:px-3';

  return (
    <section className="overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
        <h2 className="m-0 text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>What's working</h2>
        <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>The types of business you've emailed, best responders first.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-[.06em]" style={{ color: 'var(--ink-soft)' }}>
              <th scope="col" className="px-4 py-3 text-left">Type</th>
              <th scope="col" className="px-2 py-3 text-right sm:px-3">Emailed</th>
              <th scope="col" className="px-2 py-3 text-right sm:px-3">Replies</th>
              <th scope="col" className="px-2 py-3 text-right sm:px-3" title="Replies that showed real interest">Interested</th>
              {showBounces && <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Bounced</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.category} style={{ borderTop: '1px solid var(--line)' }}>
                <td className="px-4 py-3 font-semibold" style={{ color: 'var(--ink)' }}>{row.category}</td>
                <td className={numeric} style={{ color: 'var(--ink-soft)' }}>{row.emailed}</td>
                <td className={numeric} style={{ color: 'var(--ink-soft)' }}>{row.replied}</td>
                <td className={`${numeric} font-semibold`} style={{ color: row.positive > 0 ? 'var(--leaf)' : 'var(--ink-soft)' }}>
                  {row.positive}
                  {row.emailed >= RAW_COUNT_THRESHOLD && row.positive > 0 && ` (${row.positive_rate.toFixed(1)}%)`}
                </td>
                {showBounces && (
                  <td className={`${numeric} hidden sm:table-cell`} style={{ color: 'var(--ink-soft)' }}>{row.bounced > 0 ? `${row.bounce_rate.toFixed(1)}%` : '-'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="block w-full cursor-pointer border-0 border-t bg-transparent px-4 py-3 text-center text-[12.5px] font-semibold"
          style={{ color: 'var(--leaf)', borderTop: '1px solid var(--line)' }}
        >
          {showAll ? 'Show fewer' : `Show all ${rows.length} business types`}
        </button>
      )}
    </section>
  );
}
