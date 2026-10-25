import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_LIMITS, campaignLimitsError, capSearchTerms, mergeServerLimits, validateCampaignLimits,
} from './campaignLimits';

const terms = (n: number) => Array.from({ length: n }, (_, i) => `term ${i + 1}`);
const check = (t: number, l: number, maxResults = 100, allowEmpty = false) =>
  validateCampaignLimits({ searchQueries: terms(t), locationCount: l, maxResults, allowEmpty }, CAMPAIGN_LIMITS);
const codes = (r: ReturnType<typeof check>) => r.errors.map((e) => e.code);

describe('validateCampaignLimits', () => {
  it('accepts values at every cap', () => {
    expect(check(5, 2, 500).valid).toBe(true); // 5 x 2 = 10 pairs
    expect(check(1, 3, 500).valid).toBe(true);
    expect(check(3, 3, 1).valid).toBe(true);   // 9 pairs
  });

  it('rejects more than 5 search terms and says how many to remove', () => {
    const r = check(7, 1);
    expect(codes(r)).toEqual(['too_many_search_terms']);
    expect(r.errors[0].message).toContain('Remove 2 search terms');
  });

  it('rejects more than 3 locations', () => {
    const r = check(1, 4);
    expect(codes(r)).toEqual(['too_many_locations']);
    expect(r.errors[0].message).toContain('Remove 1 location.');
  });

  it('rejects zero search terms or locations unless drafting', () => {
    expect(codes(check(0, 0))).toEqual(['too_few_search_terms', 'too_few_locations']);
    expect(check(0, 0, 100, true).valid).toBe(true);
  });

  it('accepts 10 pairs and rejects 11 or more', () => {
    expect(check(5, 2).valid).toBe(true);
    expect(check(3, 3).valid).toBe(true);
    const r = check(4, 3); // 12
    expect(codes(r)).toEqual(['too_many_pairs']);
    expect(r.errors[0].over).toBe(true);
  });

  it('says exactly how many terms or locations to remove for the pairs cap', () => {
    // 5 x 3 = 15: drop 2 terms (3 x 3 = 9) or 1 location (5 x 2 = 10)
    const msg = check(5, 3).errors[0].message;
    expect(msg).toContain('5 search terms × 3 locations = 15');
    expect(msg).toContain('Remove 2 search terms or 1 location.');
    // 4 x 3 = 12: drop 1 term (3 x 3) or 1 location (4 x 2)
    expect(check(4, 3).errors[0].message).toContain('Remove 1 search term or 1 location.');
  });

  it('reports over-cap terms and pairs together', () => {
    expect(codes(check(6, 3))).toEqual(['too_many_search_terms', 'too_many_pairs']);
  });

  it('caps max results at 500 and requires at least 1', () => {
    expect(check(1, 1, 500).valid).toBe(true);
    expect(codes(check(1, 1, 501))).toEqual(['max_results_too_high']);
    expect(codes(check(1, 1, 1000))).toEqual(['max_results_too_high']);
    expect(codes(check(1, 1, 0))).toEqual(['max_results_too_low']);
    expect(codes(check(1, 1, NaN))).toEqual(['max_results_too_low']);
  });

  it('uses the limits it is given', () => {
    const r = validateCampaignLimits(
      { searchQueries: terms(6), locationCount: 1, maxResults: 600 },
      mergeServerLimits({ max_search_terms: 8, max_results: 800 }),
    );
    expect(r.valid).toBe(true);
  });
});

describe('campaignLimitsError', () => {
  it('is null when valid and a joined message when not', () => {
    expect(campaignLimitsError({ searchQueries: terms(2), locationCount: 1, maxResults: 50 }, CAMPAIGN_LIMITS)).toBeNull();
    const msg = campaignLimitsError({ searchQueries: terms(6), locationCount: 4, maxResults: 50 }, CAMPAIGN_LIMITS);
    expect(msg).toContain('Remove 1 search term');
    expect(msg).toContain('Remove 1 location');
  });
});

describe('mergeServerLimits', () => {
  it('falls back to the constants for missing or invalid server values', () => {
    expect(mergeServerLimits(null)).toEqual(CAMPAIGN_LIMITS);
    expect(mergeServerLimits({ max_search_terms: 0 })).toEqual(CAMPAIGN_LIMITS);
  });

  it('lets server values override', () => {
    const l = mergeServerLimits({ max_search_terms: 4, max_locations: 2, max_term_location_pairs: 6, max_results: 300 });
    expect(l).toMatchObject({ maxSearchTerms: 4, maxLocations: 2, maxTermLocationPairs: 6, maxResults: 300, minSearchTerms: 1 });
  });
});

describe('capSearchTerms', () => {
  it('keeps everything when under the cap', () => {
    expect(capSearchTerms(['a', 'b'], 5)).toEqual({ kept: ['a', 'b'], dropped: [] });
  });

  it('keeps the first N in source order when there is no evidence, and reports the rest', () => {
    const r = capSearchTerms(terms(10), 5);
    expect(r.kept).toEqual(terms(5));
    expect(r.dropped).toEqual(terms(10).slice(5));
  });

  it('prefers terms with positive replies, then emails sent, then worked-before over website', () => {
    const r = capSearchTerms([
      { term: 'site-a', source: 'website' },
      { term: 'site-b', source: 'website' },
      { term: 'worked-low', source: 'results', positive: 1, emailed: 50 },
      { term: 'worked-high', source: 'results', positive: 4, emailed: 20 },
      { term: 'worked-zero', source: 'results', positive: 0, emailed: 90 },
    ], 3);
    // Kept terms keep their source order; worked-zero ranks above the website terms on source.
    expect(r.kept).toEqual(['worked-low', 'worked-high', 'worked-zero']);
    expect(r.dropped).toEqual(['site-a', 'site-b']);
  });

  it('removes duplicates ignoring case and blanks', () => {
    expect(capSearchTerms(['Dentist', 'dentist ', '', ' ', 'Law firm'], 5)).toEqual({ kept: ['Dentist', 'Law firm'], dropped: [] });
  });
});
