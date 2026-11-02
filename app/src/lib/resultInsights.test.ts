import { describe, it, expect } from 'vitest';
import { arrangeInsights, worthShowingCategories } from './resultInsights';
import type { ResultCategoryRow, ResultInsight } from '../hooks/useClientResultInsights';

const insight = (code: string, severity: ResultInsight['severity'], metric: unknown = {}): ResultInsight => ({
  code, severity, metric, headline: code, detail: '', action: 'none',
});
const category = (name: string, emailed: number, replied = 0, positive = 0): ResultCategoryRow => ({
  category: name, emailed, replied, positive, bounced: 0, positive_rate: 0, bounce_rate: 0,
});

describe('arrangeInsights', () => {
  it('makes the most urgent insight the next step and keeps the rest', () => {
    const hot = insight('hot_leads_waiting', 'critical');
    const rejected = insight('many_rejected', 'info');
    expect(arrangeInsights([hot, rejected], 100)).toEqual({ nextStep: hot, others: [rejected] });
  });

  it('hides waiting approvals once emails have been sent, because the banner covers them', () => {
    const { nextStep, others } = arrangeInsights([insight('awaiting_approval', 'warning')], 100);
    expect(nextStep).toBeNull();
    expect(others).toEqual([]);
  });

  it('keeps waiting approvals when nothing has been sent, because they explain why', () => {
    const waiting = insight('awaiting_approval', 'critical');
    expect(arrangeInsights([waiting], 0).nextStep).toBe(waiting);
  });

  it('holds back best performing until there are 3 positive replies in total', () => {
    const weak = insight('best_performing', 'info', [{ category: 'A', positive: 1 }, { category: 'B', positive: 1 }]);
    const strong = insight('best_performing', 'info', [{ category: 'A', positive: 2 }, { category: 'B', positive: 1 }]);
    expect(arrangeInsights([weak], 100).others).toEqual([]);
    expect(arrangeInsights([strong], 100).others).toEqual([strong]);
  });

  it('never makes an info insight the next step', () => {
    const clear = insight('all_clear', 'info');
    expect(arrangeInsights([clear], 100)).toEqual({ nextStep: null, others: [clear] });
  });
});

describe('worthShowingCategories', () => {
  it('drops low-volume categories with no replies and puts the best first', () => {
    const rows = [category('Tiny', 1), category('Big', 29), category('Replied', 3, 1), category('Positive', 20, 1, 1)];
    expect(worthShowingCategories(rows).map((r) => r.category)).toEqual(['Positive', 'Replied', 'Big']);
  });

  it('falls back to the largest categories when none qualify yet', () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => category(n, i + 1));
    expect(worthShowingCategories(rows).map((r) => r.category)).toEqual(['F', 'E', 'D', 'C', 'B']);
  });
});
