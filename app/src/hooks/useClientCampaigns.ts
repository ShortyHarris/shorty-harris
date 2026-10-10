import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { buildAreaColumns, type TargetArea } from '../lib/targetAreas';

export const myCampaignsKey = (clientId: string) => ['my-campaigns', clientId] as const;
const myCampaignProspectsKey = (campaignId: string) => ['my-campaign-prospects', campaignId] as const;

export interface ClientCampaignRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  language: string;
  country: string | null;
  search_queries: string[];
  target_locations: string[];
  target_areas: TargetArea[] | null;
  max_results: number;
  created_at: string;
  prospectCount: number;
}

async function fetchClientCampaigns(clientId: string, client: SupabaseClient): Promise<ClientCampaignRow[]> {
  const { data, error } = await client
    .from('campaigns')
    // prospect_count is the same trigger-maintained counter the admin
    // campaign list reads (see migration add_campaigns_prospect_count) - a
    // single shared definition instead of each side running its own
    // `prospects` count query, which is what let the two numbers drift
    // apart after a scrape.
    .select('id, name, description, status, language, country, search_queries, target_locations, target_areas, max_results, created_at, prospect_count')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    search_queries: (r.search_queries as string[] | null) ?? [],
    target_locations: (r.target_locations as string[] | null) ?? [],
    target_areas: (r.target_areas as TargetArea[] | null) ?? null,
    description: (r.description as string | null) ?? null,
    language: (r.language as string | null) ?? 'English',
    country: (r.country as string | null) ?? null,
    prospectCount: (r.prospect_count as number | null) ?? 0,
  })) as ClientCampaignRow[];
}

export function useClientCampaignList(clientId: string, client: SupabaseClient = supabase) {
  const { data: rows = [], isLoading: loading, isFetching, dataUpdatedAt, error, refetch } = useQuery({
    queryKey: myCampaignsKey(clientId),
    queryFn: () => fetchClientCampaigns(clientId, client),
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });

  return {
    rows,
    loading,
    isFetching,
    dataUpdatedAt,
    error: (error as Error)?.message ?? null,
    reload: async () => {
      const res = await refetch();
      if (res.error) throw res.error;
    },
  };
}

export interface NewClientCampaignInput {
  client_id: string;
  created_by: string | null;
  name: string;
  description: string;
  language: string;
  country: string;
  search_queries: string[];
  target_areas: TargetArea[];
  max_results: number;
}

export async function createClientCampaign(
  input: NewClientCampaignInput,
): Promise<{ autoApproved: boolean; error: Error | null }> {
  // Most clients' campaigns land in 'pending_review' and wait for an admin to
  // review and activate them (see needsReview in useAdminData.ts). A client
  // flagged auto_approve_campaigns skips that - but the campaign still has to
  // be *inserted* as 'pending_review': the client's own RLS insert policy on
  // campaigns only allows status='pending_review' (confirmed by a 403 when
  // this tried to insert 'active' directly), so a client-authenticated
  // request can never write a pre-activated row itself. A database trigger
  // (auto_approve_client_campaign) elevates it to 'active' right after, as a
  // separate, privileged update.
  const { data: clientRow } = await supabase
    .from('clients')
    .select('auto_approve_campaigns')
    .eq('id', input.client_id)
    .single();

  const { error } = await supabase
    .from('campaigns')
    .insert({
      client_id: input.client_id,
      created_by: input.created_by,
      name: input.name,
      description: input.description || null,
      language: input.language,
      country: input.country,
      channel: 'email',
      status: 'pending_review',
      search_queries: input.search_queries,
      ...buildAreaColumns(input.target_areas),
      max_results: input.max_results,
      scrape_enabled: true,
    });

  return { autoApproved: clientRow?.auto_approve_campaigns ?? false, error };
}

export interface UpdateClientCampaignInput {
  name: string;
  description: string;
  language: string;
  search_queries: string[];
  target_areas: TargetArea[];
  max_results: number;
}

export async function updateClientCampaign(campaignId: string, input: UpdateClientCampaignInput) {
  const { error } = await supabase
    .from('campaigns')
    .update({
      name: input.name,
      description: input.description || null,
      language: input.language,
      search_queries: input.search_queries,
      ...buildAreaColumns(input.target_areas),
      max_results: input.max_results,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);
  return { error };
}

export interface ClientCampaignDeleteCounts {
  prospects: number;
  messages: number;
}

export async function getClientCampaignDeleteCounts(campaignId: string): Promise<ClientCampaignDeleteCounts> {
  const [prosts, msgs] = await Promise.all([
    supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId),
  ]);
  return {
    prospects: prosts.count ?? 0,
    messages:  msgs.count ?? 0,
  };
}

export async function deleteClientCampaign(campaignId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('campaigns').delete().eq('id', campaignId);
  return { error: error?.message ?? null };
}

export interface ClientCampaignProspect {
  id: string;
  business_name: string;
  contact_name: string | null;
  category: string | null;
  location: string | null;
  pipeline_status: string;
}

export function useClientCampaignProspects(campaignId: string | null, client: SupabaseClient = supabase) {
  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: myCampaignProspectsKey(campaignId ?? ''),
    queryFn: async () => {
      const { data, error } = await client
        .from('prospects')
        .select('id, business_name, contact_name, category, location, pipeline_status')
        .eq('campaign_id', campaignId as string)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ClientCampaignProspect[];
    },
    enabled: !!campaignId,
    staleTime: 60 * 1000,
  });

  return { rows, loading };
}

export interface ClientUsage {
  monthly_prospect_limit: number;
  max_campaigns: number;
  prospects_this_month: number;
  prospects_remaining: number;
  campaign_count: number;
  campaigns_remaining: number;
  limit_resets_at: string;
}

export function useClientUsage(clientId: string, client: SupabaseClient = supabase) {
  const { data: usage = null } = useQuery({
    queryKey: ['client-usage', clientId] as const,
    queryFn: async () => {
      const { data, error } = await client
        .from('client_usage')
        .select('monthly_prospect_limit, max_campaigns, prospects_this_month, prospects_remaining, campaign_count, campaigns_remaining, limit_resets_at')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as ClientUsage | null;
    },
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });

  return { usage };
}

export const MONTHLY_LAUNCH_LIMIT = 5;

export interface ClientLaunchUsage {
  month: string;
  launch_count: number;
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

export function useClientLaunchUsage(clientId: string, client: SupabaseClient = supabase) {
  const month = currentMonthKey();
  const { data: usage = null } = useQuery({
    queryKey: ['client-launch-usage', clientId, month] as const,
    queryFn: async () => {
      const { data, error } = await client
        .from('monthly_launch_usage')
        .select('month, launch_count')
        .eq('client_id', clientId)
        .eq('month', month)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as ClientLaunchUsage | null) ?? { month, launch_count: 0 };
    },
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });

  return { usage };
}
