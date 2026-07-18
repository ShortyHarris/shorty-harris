import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export const myCampaignsKey = (clientId: string) => ['my-campaigns', clientId] as const;
const myCampaignProspectsKey = (campaignId: string) => ['my-campaign-prospects', campaignId] as const;

export interface ClientCampaignRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  language: string;
  search_queries: string[];
  target_locations: string[];
  max_results: number;
  created_at: string;
  prospectCount: number;
}

async function fetchClientCampaigns(clientId: string): Promise<ClientCampaignRow[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, description, status, language, search_queries, target_locations, max_results, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const base = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    search_queries: (r.search_queries as string[] | null) ?? [],
    target_locations: (r.target_locations as string[] | null) ?? [],
    description: (r.description as string | null) ?? null,
    language: (r.language as string | null) ?? 'English',
    prospectCount: 0,
  })) as ClientCampaignRow[];

  await Promise.all(base.map(async (c) => {
    const { count } = await supabase
      .from('prospects').select('id', { count: 'exact', head: true })
      .eq('campaign_id', c.id);
    c.prospectCount = count ?? 0;
  }));

  return base;
}

export function useClientCampaignList(clientId: string) {
  const { data: rows = [], isLoading: loading, error } = useQuery({
    queryKey: myCampaignsKey(clientId),
    queryFn: () => fetchClientCampaigns(clientId),
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });

  return {
    rows,
    loading,
    error: (error as Error)?.message ?? null,
    reload: () => queryClient.invalidateQueries({ queryKey: myCampaignsKey(clientId) }),
  };
}

export interface NewClientCampaignInput {
  client_id: string;
  created_by: string | null;
  name: string;
  description: string;
  language: string;
  search_queries: string[];
  target_locations: string[];
  max_results: number;
}

export async function createClientCampaign(input: NewClientCampaignInput) {
  return supabase.from('campaigns').insert({
    client_id: input.client_id,
    created_by: input.created_by,
    name: input.name,
    description: input.description || null,
    language: input.language,
    channel: 'email',
    status: 'draft',
    search_queries: input.search_queries,
    target_locations: input.target_locations,
    max_results: input.max_results,
  });
}

export interface ClientCampaignProspect {
  id: string;
  business_name: string;
  contact_name: string | null;
  category: string | null;
  location: string | null;
  pipeline_status: string;
}

export function useClientCampaignProspects(campaignId: string | null) {
  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: myCampaignProspectsKey(campaignId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
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
