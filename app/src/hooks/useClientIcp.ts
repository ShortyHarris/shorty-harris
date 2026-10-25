import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import type { TargetArea } from '../lib/targetAreas';
import {
  getActiveCampaignLimits, mergeServerLimits, setActiveCampaignLimits, type CampaignLimits,
} from '../lib/campaignLimits';

export interface IcpEvidence {
  emailed?: number;
  replied?: number;
  positive?: number;
  campaigns?: number;
}

export interface IcpTermSuggestion {
  term: string;
  source: 'results' | 'website';
  evidence: IcpEvidence | null;
}

export interface IcpLocationSuggestion {
  location: string;
  source: 'history' | 'website';
  evidence: IcpEvidence | null;
}

export interface SuggestCampaignInputsResult {
  ok: boolean;
  error?: string;
  has_icp: boolean;
  icp_derived_at: string | null;
  confidence: 'none' | 'thin' | 'usable';
  history: { emailed: number; positive: number };
  terms: IcpTermSuggestion[];
  locations: IcpLocationSuggestion[];
  pain_points: string[];
  value_props: string[];
  limits: { max_search_terms: number; max_locations: number; max_term_location_pairs: number; max_results?: number };
}

export async function suggestCampaignInputs(
  clientId: string,
): Promise<{ data: SuggestCampaignInputsResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('suggest_campaign_inputs', { p_client_id: clientId });
  if (error) return { data: null, error: error.message };
  const result = data as SuggestCampaignInputsResult;
  if (!result?.ok) return { data: null, error: result?.error ?? 'not_permitted' };
  return { data: result, error: null };
}

// Campaign caps the forms enforce before launch. Starts from the constants in
// lib/campaignLimits and switches to the server's scrape_limits (carried by
// suggest_campaign_inputs, the same row validate_campaign_inputs checks) once
// loaded. Always returns usable limits, so forms never run unchecked while the
// request is in flight or if it fails.
export function useCampaignLimits(clientId: string, client: SupabaseClient = supabase): CampaignLimits {
  const { data } = useQuery({
    queryKey: ['campaign-limits', clientId],
    queryFn: async () => {
      const { data, error } = await client.rpc('suggest_campaign_inputs', { p_client_id: clientId });
      if (error) throw new Error(error.message);
      const result = data as SuggestCampaignInputsResult;
      if (!result?.ok) throw new Error(result?.error ?? 'not_permitted');
      const merged = mergeServerLimits(result.limits);
      setActiveCampaignLimits(merged);
      return merged;
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? getActiveCampaignLimits();
}

export interface ValidateCampaignInputsResult {
  ok: boolean;
  valid: boolean;
  violations: string[]; // e.g. 'too_many_search_terms' | 'too_many_locations' | 'too_many_pairs' | 'max_results_too_high' | 'invalid_target_areas'
}

// There are two versions of validate_campaign_inputs server-side - the old
// 4-arg one only counts target_locations, so radius areas wouldn't count
// toward the caps. This always calls the 5-arg one with p_target_areas,
// which is required (no default).
export async function validateCampaignInputs(args: {
  searchQueries: string[];
  targetLocations: string[];
  maxResults: number;
  forLaunch: boolean;
  targetAreas: TargetArea[];
}): Promise<{ data: ValidateCampaignInputsResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('validate_campaign_inputs', {
    p_search_queries: args.searchQueries,
    p_target_locations: args.targetLocations,
    p_max_results: args.maxResults,
    p_for_launch: args.forLaunch,
    p_target_areas: args.targetAreas,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as ValidateCampaignInputsResult, error: null };
}

const VIOLATION_MESSAGE: Record<string, string> = {
  too_many_search_terms: 'Too many search terms - remove one and try again.',
  too_many_locations: 'Too many locations - remove one and try again.',
  too_many_pairs: 'That many search terms and locations together is too many combinations - remove one of either.',
  max_results_too_high: 'Max results is set too high.',
  invalid_target_areas: 'One of your locations is not set up correctly - try removing and re-adding it.',
};

export function describeViolation(code: string): string {
  return VIOLATION_MESSAGE[code] ?? "That campaign setup isn't valid - please check your search terms and locations.";
}

// ─── Targeting profile (client_icp row) ─────────────────────────────────
export interface ClientIcpRow {
  target_business_types: string[];
  target_locations: string[];
  decision_maker_roles: string[];
  pain_points: string[];
  value_props: string[];
  suggested_search_terms: string[];
  notes: string | null;
  edited_fields: string[];
  derived_at: string | null;
}

const EMPTY_ICP: ClientIcpRow = {
  target_business_types: [],
  target_locations: [],
  decision_maker_roles: [],
  pain_points: [],
  value_props: [],
  suggested_search_terms: [],
  notes: null,
  edited_fields: [],
  derived_at: null,
};

export const clientIcpKey = (clientId: string) => ['client-icp', clientId] as const;

export function useClientIcp(clientId: string, client: SupabaseClient = supabase) {
  const { data: icp = EMPTY_ICP, isLoading: loading, error, refetch } = useQuery({
    queryKey: clientIcpKey(clientId),
    queryFn: async () => {
      const { data, error } = await client
        .from('client_icp')
        .select('target_business_types, target_locations, decision_maker_roles, pain_points, value_props, suggested_search_terms, notes, edited_fields, derived_at')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return EMPTY_ICP;
      return {
        target_business_types: data.target_business_types ?? [],
        target_locations: data.target_locations ?? [],
        decision_maker_roles: data.decision_maker_roles ?? [],
        pain_points: data.pain_points ?? [],
        value_props: data.value_props ?? [],
        suggested_search_terms: data.suggested_search_terms ?? [],
        notes: data.notes ?? null,
        edited_fields: data.edited_fields ?? [],
        derived_at: data.derived_at ?? null,
      } as ClientIcpRow;
    },
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });

  return {
    icp,
    loading,
    error: (error as Error)?.message ?? null,
    reload: async () => { await refetch(); },
  };
}

export type ClientIcpPatch = Partial<{
  target_business_types: string[];
  target_locations: string[];
  decision_maker_roles: string[];
  pain_points: string[];
  value_props: string[];
  suggested_search_terms: string[];
  notes: string;
}>;

export async function saveClientIcp(
  clientId: string, patch: ClientIcpPatch,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('save_client_icp', { p_client_id: clientId, p_patch: patch });
  if (error) return { error: error.message };
  const result = data as { ok: boolean; error?: string; field?: string } | null;
  if (result && result.ok === false) {
    return { error: result.field ? `${result.error}: ${result.field}` : (result.error ?? 'Could not save.') };
  }
  queryClient.invalidateQueries({ queryKey: clientIcpKey(clientId) });
  return { error: null };
}

export interface RebuildIcpResponse {
  ok: boolean;
  step?: 'lookup' | 'website' | 'profile';
  reason?: string;
  detail?: string;
  limited_data?: boolean;
}

const REBUILD_GENERIC_ERROR = "Couldn't rebuild your targeting profile - please try again.";

// Fallbacks for when the function gives a reason but no detail. Any other
// reason (incl. website_read_failed_*) gets the generic message instead.
const REBUILD_REASON_COPY: Record<string, string> = {
  no_website_url: 'Add a website URL to this client first',
  website_read_timeout: 'Reading the website took too long, try again in a minute',
  not_permitted: "You don't have access to this client",
};

function rebuildErrorMessage(body: Partial<RebuildIcpResponse> | null | undefined): string {
  if (body?.detail) return body.detail;
  return (body?.reason && REBUILD_REASON_COPY[body.reason]) || REBUILD_GENERIC_ERROR;
}

// The function can take up to ~60s. Success is only ever ok === true; a
// non-2xx surfaces as an error whose context is the Response with the JSON body.
export async function buildClientIcp(
  clientId: string,
): Promise<{ ok: boolean; error: string | null; limitedData: boolean }> {
  const { data, error } = await supabase.functions.invoke('rebuild-client-targeting', {
    body: { client_id: clientId },
  });

  if (error) {
    let body: Partial<RebuildIcpResponse> | null = null;
    try {
      const ctx = (error as { context?: unknown }).context;
      if (ctx instanceof Response) body = await ctx.json();
    } catch { /* relay/fetch errors and non-JSON bodies fall through to the generic message */ }
    return { ok: false, error: rebuildErrorMessage(body), limitedData: false };
  }

  const result = data as RebuildIcpResponse | null;
  if (result?.ok !== true) return { ok: false, error: rebuildErrorMessage(result), limitedData: false };

  queryClient.invalidateQueries({ queryKey: clientIcpKey(clientId) });
  return { ok: true, error: null, limitedData: result.limited_data === true };
}

// ─── Targeting performance ───────────────────────────────────────────────
export interface TargetingPerformanceRow {
  category: string;
  emailed: number;
  replied: number;
  positive: number;
  bounced: number;
  // Both rates are already percentages (0-100), rounded to 1dp by the RPC.
  positive_rate: number;
  bounce_rate: number;
}

export function useClientTargetingPerformance(clientId: string, client: SupabaseClient = supabase) {
  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ['client-targeting-performance', clientId] as const,
    queryFn: async () => {
      const { data, error } = await client.rpc('client_targeting_performance', { p_client_id: clientId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as TargetingPerformanceRow[])
        .slice()
        .sort((a, b) => b.positive - a.positive);
    },
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });

  return { rows, loading };
}
