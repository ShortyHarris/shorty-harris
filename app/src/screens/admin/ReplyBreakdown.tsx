import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import {
  HUMAN_INTENT_COLOR, HUMAN_INTENT_LABEL, filterReplies, pct, snippet, summarizeReplies,
  type HumanIntent, type ReplyGroup, type ReplyRecord,
} from '../../lib/replyIntents';

const FONT_FAMILY = "'Plus Jakarta Sans', sans-serif";

const DONUT_SIZE = 180;
const OUTER_RADIUS = 88;
const INNER_RADIUS = 58;

const CARD =
  'rounded-lg border border-[#ece8df] bg-white p-5 shadow-[0_1px_2px_rgba(32,33,28,0.04),0_8px_28px_rgba(32,33,28,0.06)]';
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3c7a5b]';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const GROUP_TITLE: Record<ReplyGroup, string> = {
  ...HUMAN_INTENT_LABEL,
  automated: 'Automated replies',
  bounced: 'Bounced',
};

// Renders two grid cells (the summary card and, below it, the reply list), so
// it must be placed directly inside the Analytics charts grid.
export function ReplyBreakdown({ replies }: { replies: ReplyRecord[] }) {
  const [selected, setSelected] = useState<ReplyGroup | null>(null);
  const [hovered, setHovered] = useState<HumanIntent | null>(null);

  const summary = useMemo(() => summarizeReplies(replies), [replies]);
  const list = useMemo(() => filterReplies(replies, selected), [replies, selected]);

  // Largest first (stable on ties, so equal counts keep their fixed intent
  // order). Drawn clockwise from 12 o'clock; the tooltip is anchored to the
  // outer edge at each slice's mid-angle.
  const slices = useMemo(() => {
    const sorted = summary.byIntent
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((s) => ({ ...s, name: HUMAN_INTENT_LABEL[s.intent], percent: pct(s.count, summary.human) }));
    return sorted.map((s, i) => {
      const before = sorted.slice(0, i).reduce((a, b) => a + b.count, 0);
      const mid = ((before + s.count / 2) / summary.human) * 2 * Math.PI;
      return {
        ...s,
        x: DONUT_SIZE / 2 + OUTER_RADIUS * Math.sin(mid),
        y: DONUT_SIZE / 2 - OUTER_RADIUS * Math.cos(mid),
      };
    });
  }, [summary]);

  // The active intent drives both the dimming and the tooltip: hover/focus
  // wins over the filter that is currently applied.
  const selectedIntent = slices.find((s) => s.intent === selected)?.intent ?? null;
  const active = hovered ?? selectedIntent;
  const tip = hovered ? slices.find((s) => s.intent === hovered) ?? null : null;

  function toggle(group: ReplyGroup) {
    setSelected((cur) => (cur === group ? null : group));
  }

  const listTitle = selected ? GROUP_TITLE[selected] : 'All real replies';

  return (
    <>
      <div className={`${CARD} @container md:col-span-2`}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 className="m-0 text-[14.5px] font-bold text-[#20211c]">Replies</h3>
          <span className="text-[12px] text-[#62655c]">of {summary.total} total replies</span>
        </div>

        <div className="flex flex-col items-center gap-5 @min-[480px]:flex-row @min-[480px]:items-center @min-[480px]:gap-8">
          {summary.human === 0 ? (
            <div className="flex min-h-[180px] w-full items-center justify-center rounded-xl border border-dashed border-[#ece8df] px-4 text-center text-[13px] text-[#62655c]">
              No real replies yet. Automated replies and bounces are counted separately.
            </div>
          ) : (
            <>
              <div className="relative shrink-0" style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
                <PieChart width={DONUT_SIZE} height={DONUT_SIZE} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={slices}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    startAngle={90}
                    endAngle={-270}
                    innerRadius={INNER_RADIUS}
                    outerRadius={OUTER_RADIUS}
                    stroke="#fff"
                    strokeWidth={3}
                    isAnimationActive={false}
                    label={false}
                    labelLine={false}
                    onMouseEnter={(_, i) => setHovered(slices[i]?.intent ?? null)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(_, i) => { const s = slices[i]; if (s) toggle(s.intent); }}
                  >
                    {slices.map((s) => (
                      <Cell
                        key={s.intent}
                        fill={HUMAN_INTENT_COLOR[s.intent]}
                        fillOpacity={active && active !== s.intent ? 0.3 : 1}
                        style={{ cursor: 'pointer', outline: 'none' }}
                      />
                    ))}
                  </Pie>
                </PieChart>

                <div
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                  style={{ fontFamily: FONT_FAMILY }}
                >
                  <span className="text-[28px] font-semibold leading-none tabular-nums text-[#20211c]">{summary.human}</span>
                  <span className="mt-1 text-[12px] leading-none text-[#62655c]">real {summary.human === 1 ? 'reply' : 'replies'}</span>
                </div>

                {tip && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[10px] border border-[#ece8df] bg-white px-2.5 py-1.5 text-[12.5px] text-[#20211c] shadow-[0_4px_16px_rgba(32,33,28,0.12)]"
                    style={{
                      left: Math.min(Math.max(tip.x, 64), DONUT_SIZE - 64),
                      top: tip.y,
                      transform: 'translate(-50%, calc(-100% - 6px))',
                      fontFamily: FONT_FAMILY,
                    }}
                  >
                    <strong className="font-semibold">{tip.name}</strong>
                    <span className="tabular-nums"> · {tip.count} · {tip.percent}%</span>
                  </div>
                )}
              </div>

              <ul className="m-0 w-full min-w-0 max-w-[420px] flex-1 list-none p-0">
                {slices.map((s) => {
                  const isActive = selected === s.intent;
                  return (
                    <li key={s.intent}>
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => toggle(s.intent)}
                        onMouseEnter={() => setHovered(s.intent)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(s.intent)}
                        onBlur={() => setHovered(null)}
                        className={`grid w-full cursor-pointer grid-cols-[10px_1fr_auto_auto] items-center gap-x-3 rounded-lg border-0 px-3 py-2 text-left text-[13px] text-[#20211c] transition-colors ${FOCUS_RING} ${
                          isActive ? 'bg-[#f5f2ec]' : 'bg-transparent hover:bg-[#fbf9f5]'
                        }`}
                      >
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: HUMAN_INTENT_COLOR[s.intent] }} />
                        <span className={`truncate ${isActive ? 'font-bold' : 'font-medium'}`}>{s.name}</span>
                        <span className="min-w-6 text-right font-semibold tabular-nums">{s.count}</span>
                        <span className="min-w-10 text-right tabular-nums text-[#62655c]">{s.percent}%</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <StatTile
            label="Automated"
            count={summary.automated}
            percent={pct(summary.automated, summary.total)}
            active={selected === 'automated'}
            onClick={() => toggle('automated')}
          />
          <StatTile
            label="Bounced"
            count={summary.bounced}
            percent={pct(summary.bounced, summary.total)}
            active={selected === 'bounced'}
            onClick={() => toggle('bounced')}
          />
        </div>
      </div>

      <div className={`${CARD} md:col-span-2`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="m-0 text-[14.5px] font-bold text-[#20211c]">
            {listTitle} <span className="font-medium text-[#9a9d92]">({list.length})</span>
          </h3>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={`cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3 py-1 text-[12px] font-semibold text-[#62655c] hover:bg-[#fbf9f5] ${FOCUS_RING}`}
            >
              Show all real replies
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <p className="m-0 text-[13px] text-[#62655c]">No replies to show.</p>
        ) : (
          <ul className="m-0 flex max-h-[420px] list-none flex-col overflow-y-auto p-0">
            {list.map((r) => (
              <li key={r.id} className="border-t border-[#ece8df] py-2.5 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] font-bold text-[#20211c]">{r.prospectName}</span>
                  <span className="shrink-0 text-[11.5px] text-[#9a9d92]">{formatDate(r.at)}</span>
                </div>
                <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-[#62655c]">{snippet(r.body) || '(empty reply)'}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function StatTile({
  label, count, percent, active, onClick,
}: { label: string; count: number; percent: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-w-0 cursor-pointer flex-col items-start gap-0.5 rounded-lg @min-[420px]:flex-row @min-[420px]:items-baseline @min-[420px]:justify-between @min-[420px]:gap-2 border px-3.5 py-2.5 text-left transition-colors ${FOCUS_RING} ${
        active ? 'border-[#20211c] bg-[#f5f2ec]' : 'border-[#ece8df] bg-white hover:bg-[#fbf9f5]'
      }`}
    >
      <span className="truncate text-[12.5px] font-semibold text-[#62655c]">{label}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">
        <span className="text-[16px] font-bold text-[#20211c]">{count}</span>
        <span className="ml-1.5 text-[12px] text-[#9a9d92]">{percent}%</span>
      </span>
    </button>
  );
}
