import type { ResultCategoryRow, ResultInsight } from '../hooks/useClientResultInsights';

// One positive reply can name a category "what's working"; below this it is noise.
const MIN_POSITIVE_FOR_BEST_PERFORMING = 3;
const MIN_EMAILED_TO_SHOW_CATEGORY = 10;
const FALLBACK_CATEGORY_COUNT = 5;

function totalPositive(metric: unknown): number {
  if (!Array.isArray(metric)) return 0;
  return metric.reduce((sum: number, m) => sum + (Number((m as { positive?: unknown })?.positive) || 0), 0);
}

function isWorthShowing(insight: ResultInsight, sent: number): boolean {
  // The global banner already covers waiting approvals. With nothing sent, this card
  // also explains why no emails have gone out, which the banner does not say.
  if (insight.code === 'awaiting_approval') return sent === 0;
  if (insight.code === 'best_performing') return totalPositive(insight.metric) >= MIN_POSITIVE_FOR_BEST_PERFORMING;
  return true;
}

/** Insights arrive most urgent first; the first critical or warning one becomes the next step. */
export function arrangeInsights(insights: ResultInsight[], sent: number): { nextStep: ResultInsight | null; others: ResultInsight[] } {
  const shown = insights.filter((i) => isWorthShowing(i, sent));
  const nextStep = shown.find((i) => i.severity !== 'info') ?? null;
  return { nextStep, others: shown.filter((i) => i !== nextStep) };
}

export function worthShowingCategories(rows: ResultCategoryRow[]): ResultCategoryRow[] {
  const sorted = rows.slice().sort((a, b) => (b.positive - a.positive) || (b.replied - a.replied) || (b.emailed - a.emailed));
  const meaningful = sorted.filter((r) => r.positive > 0 || r.replied > 0 || r.emailed >= MIN_EMAILED_TO_SHOW_CATEGORY);
  return meaningful.length > 0 ? meaningful : sorted.slice(0, FALLBACK_CATEGORY_COUNT);
}
