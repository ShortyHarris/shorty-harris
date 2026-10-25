import { describe, it, expect } from 'vitest';
import {
  escapeSearchTerm, buildSearchOr, pageRange, clampPage, rangeLabel, totalPages,
  applyProspectFilters, mapCategoryRows, PROSPECT_PAGE_SIZE,
} from './prospectQuery';

// Records calls so the filters applied to a query can be asserted.
function fakeBuilder() {
  const calls: Array<[string, ...string[]]> = [];
  const b = {
    calls,
    eq(col: string, v: string) { calls.push(['eq', col, v]); return b; },
    or(f: string) { calls.push(['or', f]); return b; },
  };
  return b;
}

describe('escapeSearchTerm', () => {
  it('trims and leaves plain text alone', () => {
    expect(escapeSearchTerm('  acme  ')).toBe('acme');
  });
  it('escapes %, _ and backslash so they are literal in LIKE', () => {
    expect(escapeSearchTerm('50%_off')).toBe('50\\\\%\\\\_off');
    expect(escapeSearchTerm('a\\b')).toBe('a\\\\\\\\b');
  });
  it('escapes double quotes', () => {
    expect(escapeSearchTerm('say "hi"')).toBe('say \\"hi\\"');
  });
  it('keeps commas (safe because the term is quoted in the or string)', () => {
    expect(escapeSearchTerm('a,b')).toBe('a,b');
  });
});

describe('buildSearchOr', () => {
  it('is null for empty or whitespace', () => {
    expect(buildSearchOr('')).toBeNull();
    expect(buildSearchOr('   ')).toBeNull();
  });
  it('searches the three columns with quoted patterns', () => {
    expect(buildSearchOr(' acme ')).toBe(
      'business_name.ilike."%acme%",email.ilike."%acme%",contact_name.ilike."%acme%"',
    );
  });
  it('a comma in the query stays inside the quoted value', () => {
    expect(buildSearchOr('a,b')).toContain('business_name.ilike."%a,b%"');
  });
});

describe('paging', () => {
  it('page size is 50', () => expect(PROSPECT_PAGE_SIZE).toBe(50));
  it('computes inclusive ranges', () => {
    expect(pageRange(1)).toEqual({ from: 0, to: 49 });
    expect(pageRange(2)).toEqual({ from: 50, to: 99 });
    expect(pageRange(21)).toEqual({ from: 1000, to: 1049 });
  });
  it('treats bad page numbers as page 1', () => {
    expect(pageRange(0)).toEqual({ from: 0, to: 49 });
    expect(pageRange(NaN)).toEqual({ from: 0, to: 49 });
  });
  it('clamps to the last page', () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(101)).toBe(3);
    expect(clampPage(5, 101)).toBe(3);
    expect(clampPage(0, 101)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
  });
  it('labels the visible range against the true total', () => {
    expect(rangeLabel(1, 230)).toBe('Showing 1-50 of 230');
    expect(rangeLabel(5, 230)).toBe('Showing 201-230 of 230');
    expect(rangeLabel(1, 0)).toBe('Showing 0 of 0');
    expect(rangeLabel(9, 120)).toBe('Showing 101-120 of 120');
  });
});

describe('applyProspectFilters', () => {
  it('applies nothing for all/all/empty', () => {
    const b = fakeBuilder();
    applyProspectFilters(b, { q: '', status: 'all', category: 'all' });
    expect(b.calls).toEqual([]);
  });
  it('applies status, category and search', () => {
    const b = fakeBuilder();
    applyProspectFilters(b, { q: 'acme', status: 'hot_lead', category: 'Plumbing' });
    expect(b.calls).toEqual([
      ['eq', 'pipeline_status', 'hot_lead'],
      ['eq', 'category', 'Plumbing'],
      ['or', buildSearchOr('acme')!],
    ]);
  });
});

describe('mapCategoryRows', () => {
  it('maps rows and keeps server order', () => {
    expect(mapCategoryRows([{ category: 'Plumbing', n: 12 }, { category: 'Dental', n: 3 }])).toEqual([
      { category: 'Plumbing', n: 12 }, { category: 'Dental', n: 3 },
    ]);
  });
  it('drops blank/null categories and coerces counts', () => {
    expect(mapCategoryRows([
      { category: null, n: 4 }, { category: '  ', n: 2 }, { category: ' Roofing ', n: '7' }, { category: 'X' },
    ])).toEqual([{ category: 'Roofing', n: 7 }, { category: 'X', n: 0 }]);
  });
  it('returns [] for non-arrays', () => {
    expect(mapCategoryRows(null)).toEqual([]);
  });
});
