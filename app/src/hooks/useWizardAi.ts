// Calls the wizard-ai edge function (supabase/functions/wizard-ai) and the wizard's database
// functions. Every error comes back as a code; wizardErrorMessage() turns it into plain words.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AiProfile } from '../lib/wizardSession';
import type { TargetArea } from '../lib/targetAreas';

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function callWizardAi<T>(action: string, payload: Record<string, unknown>, client: SupabaseClient = supabase): Promise<AiResult<T>> {
  const { data, error } = await client.functions.invoke('wizard-ai', { body: { action, ...payload } });
  if (error) {
    // Non-2xx: the function still sends { ok: false, error } in the body.
    const ctx = (error as { context?: Response }).context;
    try {
      const body = ctx ? await ctx.json() : null;
      if (body?.error) return { ok: false, error: String(body.error) };
    } catch { /* not JSON */ }
    return { ok: false, error: 'network' };
  }
  if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === false) {
    return { ok: false, error: String((data as { error?: string }).error ?? 'unknown') };
  }
  return { ok: true, data: data as T };
}

export const WIZARD_ERRORS: Record<string, string> = {
  site_unreachable: "We couldn't read that website. Describe your business instead, or try another address.",
  bad_url: "That doesn't look like a website address. Try something like yourcompany.com.",
  ai_failed: 'Something went wrong while our AI was working. Try again in a moment, or fill in the details yourself.',
  rate_limited: "You've used the AI a lot in the last hour. Try again later, or carry on by hand.",
  wizard_not_enabled: "The campaign wizard isn't switched on for your account.",
  missing_description: 'Add your company name and what you do first.',
  no_rewrites_left: "You've used this campaign's free AI rewrites. You can still edit the emails yourself.",
  nothing_selected: 'Pick at least one campaign first.',
  network: "We couldn't reach our servers. Check your connection and try again.",
};

export function wizardErrorMessage(code: string): string {
  return WIZARD_ERRORS[code] ?? `Something went wrong (${code}). Try again, or carry on by hand.`;
}

// ── Shapes returned by wizard-ai ────────────────────────────────────────────────────────────
export interface AnalyzeResult { ok: true; source: 'website' | 'description'; thin: boolean; profile: AiProfile }

export interface WizardIdea {
  id: string;
  name: string;
  service: string;
  target: string;
  reason: string;
  fit: 'strong' | 'seasonal' | 'new_segment' | 'expansion' | 'own';
  business_types: string[];
  roles: string[];
  search_queries: string[];
  target_areas: TargetArea[];
  max_results: number;
  suggested_start: string | null;
  language: string;
  est_lo?: number;
  est_hi?: number;
}

export interface CostLine {
  prospects_lo: number;
  prospects_hi: number;
  hot_lo: number;
  hot_hi: number;
  launch: 'free' | 'credit';
  launch_credits: number;
  campaign_id?: string;
}

export interface CostEstimate {
  ok: boolean;
  items: CostLine[];
  free_launches_left: number;
  free_launches_per_month: number;
  balance: number;
  credits_needed: number;
  short_by: number;
}

export interface IdeasResult { ok: true; ideas: WizardIdea[]; duplicates: string[]; slots_left: number; cost: CostEstimate | null }

export interface DraftsResult {
  ok: true;
  created: { idea_id: string; campaign_id: string; existing: boolean }[];
  skipped: { idea_id: string; reason: string }[];
  fallback_sequences: string[];
}

export interface RewriteResult { ok: true; step: number | null; emails: { subject: string; body: string }[]; left: number; limit: number }

// ── Database helpers ────────────────────────────────────────────────────────────────────────
export async function costForIdeas(clientId: string, items: { lo: number; hi: number }[], client: SupabaseClient = supabase): Promise<CostEstimate | null> {
  const { data, error } = await client.rpc('estimate_campaign_cost', { p_client_id: clientId, p_items: items });
  if (error || !data?.ok) return null;
  return data as CostEstimate;
}

export async function costForCampaigns(ids: string[], client: SupabaseClient = supabase): Promise<CostEstimate | null> {
  if (ids.length === 0) return null;
  const { data, error } = await client.rpc('campaign_cost_estimate', { p_campaign_ids: ids });
  if (error || !data?.ok) return null;
  return data as CostEstimate;
}

export async function estimateProspects(clientId: string, terms: number, areas: number, maxResults: number, client: SupabaseClient = supabase) {
  const { data } = await client.rpc('estimate_prospects', { p_client_id: clientId, p_terms: terms, p_areas: areas, p_max_results: maxResults });
  return data?.ok ? { lo: data.lo as number, hi: data.hi as number } : { lo: 0, hi: maxResults };
}

/** "Free launch (3 of 5 left this month)" / "1 credit to launch". */
export function launchLine(line: CostLine | undefined, est: Pick<CostEstimate, 'free_launches_left' | 'free_launches_per_month'> | null): string {
  if (!line || !est) return '';
  if (line.launch === 'free') return `Free launch (${est.free_launches_left} of ${est.free_launches_per_month} left this month)`;
  return '1 credit to launch';
}
