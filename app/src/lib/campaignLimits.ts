// Discovery (WF0) rejects a campaign at launch when it breaks these caps, so
// the UI checks them up front. The numbers below are the default and the
// fallback; the server's scrape_limits row overrides them once it has loaded
// (see useEffectiveCampaignLimits), so changing a cap there needs no deploy.

export interface CampaignLimits {
  minSearchTerms: number;
  maxSearchTerms: number;
  minLocations: number;
  maxLocations: number;
  maxTermLocationPairs: number;
  maxResults: number;
}

export const CAMPAIGN_LIMITS: CampaignLimits = {
  minSearchTerms: 1,
  maxSearchTerms: 5,
  minLocations: 1,
  maxLocations: 3,
  maxTermLocationPairs: 10,
  maxResults: 500,
};

/** Shape of the `limits` object suggest_campaign_inputs / validate_campaign_inputs return. */
export interface ServerCampaignLimits {
  max_search_terms?: number;
  max_locations?: number;
  max_term_location_pairs?: number;
  max_results?: number;
}

export function mergeServerLimits(server: ServerCampaignLimits | null | undefined): CampaignLimits {
  if (!server) return CAMPAIGN_LIMITS;
  const pick = (v: number | undefined, fallback: number) => (typeof v === 'number' && v > 0 ? v : fallback);
  return {
    ...CAMPAIGN_LIMITS,
    maxSearchTerms: pick(server.max_search_terms, CAMPAIGN_LIMITS.maxSearchTerms),
    maxLocations: pick(server.max_locations, CAMPAIGN_LIMITS.maxLocations),
    maxTermLocationPairs: pick(server.max_term_location_pairs, CAMPAIGN_LIMITS.maxTermLocationPairs),
    maxResults: pick(server.max_results, CAMPAIGN_LIMITS.maxResults),
  };
}

// The write helpers (createCampaign, updateCampaign, ...) are plain functions
// with no access to React state, so the last limits the server returned are
// kept here for them to validate against.
let activeLimits: CampaignLimits = CAMPAIGN_LIMITS;

export function setActiveCampaignLimits(limits: CampaignLimits): void {
  activeLimits = limits;
}

export function getActiveCampaignLimits(): CampaignLimits {
  return activeLimits;
}

export type LimitCode =
  | 'too_few_search_terms'
  | 'too_many_search_terms'
  | 'too_few_locations'
  | 'too_many_locations'
  | 'too_many_pairs'
  | 'max_results_too_low'
  | 'max_results_too_high';

export interface LimitError {
  code: LimitCode;
  field: 'search_queries' | 'target_locations' | 'pairs' | 'max_results';
  /** True when a value is over a cap (as opposed to missing). */
  over: boolean;
  message: string;
}

export interface LimitInput {
  searchQueries: string[];
  /** Plain places and radius areas count together. */
  locationCount: number;
  maxResults: number;
  /** Drafts may be saved with no terms or locations; launching needs at least one of each. */
  allowEmpty?: boolean;
}

export interface LimitResult {
  valid: boolean;
  errors: LimitError[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function pairsMessage(terms: number, locations: number, max: number): string {
  const options: string[] = [];
  const termsAllowed = Math.floor(max / locations);
  if (termsAllowed >= 1) options.push(plural(terms - termsAllowed, 'search term'));
  const locationsAllowed = Math.floor(max / terms);
  if (locationsAllowed >= 1) options.push(plural(locations - locationsAllowed, 'location'));
  const fix = options.length > 0 ? `Remove ${options.join(' or ')}.` : 'Remove some search terms or locations.';
  return `${terms} search terms × ${locations} locations = ${terms * locations} combinations, but the limit is ${max}. ${fix}`;
}

export function validateCampaignLimits(
  input: LimitInput,
  limits: CampaignLimits = getActiveCampaignLimits(),
): LimitResult {
  const errors: LimitError[] = [];
  const terms = input.searchQueries.length;
  const locations = input.locationCount;

  if (terms > limits.maxSearchTerms) {
    errors.push({
      code: 'too_many_search_terms', field: 'search_queries', over: true,
      message: `${terms} search terms, but the limit is ${limits.maxSearchTerms}. Remove ${plural(terms - limits.maxSearchTerms, 'search term')}.`,
    });
  } else if (terms < limits.minSearchTerms && !input.allowEmpty) {
    errors.push({ code: 'too_few_search_terms', field: 'search_queries', over: false, message: 'Add at least one search term.' });
  }

  if (locations > limits.maxLocations) {
    errors.push({
      code: 'too_many_locations', field: 'target_locations', over: true,
      message: `${locations} locations, but the limit is ${limits.maxLocations}. Remove ${plural(locations - limits.maxLocations, 'location')}.`,
    });
  } else if (locations < limits.minLocations && !input.allowEmpty) {
    errors.push({ code: 'too_few_locations', field: 'target_locations', over: false, message: 'Add at least one target location.' });
  }

  if (terms > 0 && locations > 0 && terms * locations > limits.maxTermLocationPairs) {
    errors.push({
      code: 'too_many_pairs', field: 'pairs', over: true,
      message: pairsMessage(terms, locations, limits.maxTermLocationPairs),
    });
  }

  if (!Number.isFinite(input.maxResults) || input.maxResults < 1) {
    errors.push({ code: 'max_results_too_low', field: 'max_results', over: false, message: 'Max results must be at least 1.' });
  } else if (input.maxResults > limits.maxResults) {
    errors.push({
      code: 'max_results_too_high', field: 'max_results', over: true,
      message: `Max results is ${input.maxResults}, but the limit is ${limits.maxResults}.`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/** One string for the write helpers to return, or null when the input is valid. */
export function campaignLimitsError(input: LimitInput, limits?: CampaignLimits): string | null {
  const { valid, errors } = validateCampaignLimits(input, limits);
  return valid ? null : errors.map((e) => e.message).join(' ');
}

export interface TermCandidate {
  term: string;
  source?: 'results' | 'website';
  positive?: number;
  emailed?: number;
}

export interface CappedTerms {
  kept: string[];
  dropped: string[];
}

/**
 * Pick the best `max` terms from an automatic source. Terms with reply
 * evidence come first (most positive replies, then most emails sent), then
 * terms that worked before over terms read from a website, then the order the
 * source gave. Duplicates (ignoring case) are removed. Whatever is left out is
 * returned so the caller can show it instead of dropping it silently.
 */
export function capSearchTerms(candidates: (string | TermCandidate)[], max: number): CappedTerms {
  const seen = new Set<string>();
  const ranked = candidates
    .map((c, index) => ({ ...(typeof c === 'string' ? { term: c } : c), index }))
    .map((c) => ({ ...c, term: c.term.trim() }))
    .filter((c) => {
      const key = c.term.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const byValue = [...ranked].sort((a, b) =>
    (b.positive ?? 0) - (a.positive ?? 0)
    || (b.emailed ?? 0) - (a.emailed ?? 0)
    || Number(b.source === 'results') - Number(a.source === 'results')
    || a.index - b.index);

  const keptSet = new Set(byValue.slice(0, Math.max(0, max)).map((c) => c.term));
  return {
    kept: ranked.filter((c) => keptSet.has(c.term)).map((c) => c.term),
    dropped: ranked.filter((c) => !keptSet.has(c.term)).map((c) => c.term),
  };
}
