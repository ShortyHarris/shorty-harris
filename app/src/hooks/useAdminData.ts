import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

// ─── Query keys ──────────────────────────────────────────────────────────────
export const QK = {
  prospects:       ['prospects']                     as const,
  campaigns:       ['campaigns']                     as const,
  clients:         ['clients']                       as const,
  clientsList:     ['clients-list']                  as const,
  adminHotLeads:   ['admin-hot-leads']               as const,
  errorLogs:       (resolved: boolean) => ['error-logs', resolved] as const,
  clientCampaigns: (id: string)        => ['client-campaigns', id] as const,
};

// ─── Prospects ───────────────────────────────────────────────────────────────
export interface ProspectListRow {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  location: string | null;
  pipeline_status: string;
  client: { business_name: string } | null;
}

async function fetchProspects(): Promise<ProspectListRow[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select(`id, business_name, contact_name, email, phone, category, location, pipeline_status,
             client:clients ( business_name )`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    client: Array.isArray(r.client) ? r.client[0] ?? null : r.client ?? null,
  })) as ProspectListRow[];
}

export function useProspects() {
  const { data: rows = [], isLoading: loading, error } = useQuery({
    queryKey: QK.prospects,
    queryFn: fetchProspects,
    staleTime: Infinity, // realtime drives updates
  });

  const updateStatus = useCallback(async (id: string, status: string) => {
    // Optimistic update
    queryClient.setQueryData<ProspectListRow[]>(QK.prospects, (prev = []) =>
      prev.map((r) => (r.id === id ? { ...r, pipeline_status: status } : r)),
    );
    const { error } = await supabase
      .from('prospects')
      .update({ pipeline_status: status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      // Revert
      queryClient.invalidateQueries({ queryKey: QK.prospects });
    }
  }, []);

  return {
    rows,
    loading,
    error: (error as Error)?.message ?? null,
    reload: () => queryClient.invalidateQueries({ queryKey: QK.prospects }),
    updateStatus,
  };
}

export interface UpdateProspectInput {
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  category: string;
  location: string;
}

export async function updateProspect(id: string, input: UpdateProspectInput) {
  return supabase.from('prospects').update({
    business_name: input.business_name,
    contact_name: input.contact_name || null,
    email: input.email || null,
    phone: input.phone || null,
    category: input.category || null,
    location: input.location || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export interface ProspectDeleteCounts {
  messages: number;
  hot_leads: number;
  replies: number;
}

export async function getProspectDeleteCounts(prospectId: string): Promise<ProspectDeleteCounts> {
  const [msgs, hls, reps] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('prospect_id', prospectId),
    supabase.from('hot_leads').select('id', { count: 'exact', head: true }).eq('prospect_id', prospectId),
    supabase.from('replies').select('id', { count: 'exact', head: true }).eq('prospect_id', prospectId),
  ]);
  return {
    messages:  msgs.count ?? 0,
    hot_leads: hls.count ?? 0,
    replies:   reps.count ?? 0,
  };
}

export async function deleteProspect(prospectId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('prospects').delete().eq('id', prospectId);
  return { error: error?.message ?? null };
}

// ─── Campaigns ───────────────────────────────────────────────────────────────
export interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  channel: string;
  language: string;
  scrape_enabled: boolean;
  last_scraped_at: string | null;
  search_queries: string[];
  target_locations: string[];
  max_results: number;
  created_at: string;
  client: { business_name: string } | null;
  prospectCount: number;
  // True when a client (not an admin) submitted this campaign and it's still
  // sitting in draft — i.e. it needs an admin to review and activate it.
  needsReview: boolean;
}

async function fetchCampaigns(): Promise<CampaignRow[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select(`id, name, description, status, channel, language, scrape_enabled, last_scraped_at, search_queries, target_locations, max_results, created_at, client:clients ( business_name ), creator:profiles ( role )`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const base = (data ?? []).map((r: Record<string, unknown>) => {
    const client  = Array.isArray(r.client) ? r.client[0] ?? null : r.client ?? null;
    const creatorRaw = Array.isArray(r.creator) ? r.creator[0] ?? null : r.creator ?? null;
    const creator = creatorRaw as { role?: string } | null;
    return {
      id: r.id,
      name: r.name,
      description: (r.description as string | null) ?? null,
      status: r.status,
      channel: r.channel,
      language: (r.language as string | null) ?? 'English',
      scrape_enabled: r.scrape_enabled,
      last_scraped_at: r.last_scraped_at,
      search_queries: (r.search_queries as string[] | null) ?? [],
      target_locations: (r.target_locations as string[] | null) ?? [],
      max_results: (r.max_results as number | null) ?? 50,
      created_at: r.created_at,
      client,
      prospectCount: 0,
      needsReview: r.status === 'draft' && creator?.role === 'client',
    };
  }) as CampaignRow[];

  await Promise.all(base.map(async (c) => {
    const { count } = await supabase
      .from('prospects').select('id', { count: 'exact', head: true })
      .eq('campaign_id', c.id);
    c.prospectCount = count ?? 0;
  }));

  return base;
}

export function useCampaigns() {
  const { data: rows = [], isLoading: loading, error } = useQuery({
    queryKey: QK.campaigns,
    queryFn: fetchCampaigns,
    staleTime: 3 * 60 * 1000,
  });

  const setStatus = useCallback(async (id: string, status: string) => {
    queryClient.setQueryData<CampaignRow[]>(QK.campaigns, (prev = []) =>
      // Leaving draft always clears needsReview — the only path back into
      // draft is a full refetch, which recomputes it from the creator's role.
      prev.map((c) => (c.id === id ? { ...c, status, needsReview: status === 'draft' && c.needsReview } : c)),
    );
    const { error } = await supabase
      .from('campaigns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: QK.campaigns });
    }
  }, []);

  return {
    rows,
    loading,
    error: (error as Error)?.message ?? null,
    reload: () => queryClient.invalidateQueries({ queryKey: QK.campaigns }),
    setStatus,
  };
}

export interface NewCampaignInput {
  client_id: string;
  name: string;
  channel: string;
  language: string;
  search_queries: string[];
  target_locations: string[];
  max_results: number;
  scrape_enabled: boolean;
  status?: 'draft' | 'active';
}

export function useClientsList() {
  const { data: clients = [] } = useQuery({
    queryKey: QK.clientsList,
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, business_name').order('business_name');
      return (data ?? []) as { id: string; business_name: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });
  return clients;
}

export async function createCampaign(input: NewCampaignInput) {
  return supabase.from('campaigns').insert({
    client_id: input.client_id,
    name: input.name,
    channel: input.channel,
    language: input.language,
    status: input.status ?? 'active',
    search_queries: input.search_queries,
    target_locations: input.target_locations,
    max_results: input.max_results,
    scrape_enabled: input.scrape_enabled,
  });
}

// ─── Hot Leads (admin) ───────────────────────────────────────────────────────
export interface AdminHotLead {
  id: string;
  ai_summary: string | null;
  suggested_action: string | null;
  status: string;
  routed_at: string;
  prospect: { business_name: string; category: string | null; location: string | null } | null;
  client: { business_name: string } | null;
  reply: { body: string } | null;
}

async function fetchAdminHotLeads(): Promise<AdminHotLead[]> {
  const { data, error } = await supabase
    .from('hot_leads')
    .select(`id, ai_summary, suggested_action, status, routed_at,
             prospect:prospects ( business_name, category, location ),
             client:clients ( business_name ),
             reply:replies ( body )`)
    .order('routed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    prospect: Array.isArray(r.prospect) ? r.prospect[0] ?? null : r.prospect ?? null,
    client:   Array.isArray(r.client)   ? r.client[0]   ?? null : r.client   ?? null,
    reply:    Array.isArray(r.reply)    ? r.reply[0]    ?? null : r.reply    ?? null,
  })) as AdminHotLead[];
}

export function useAdminHotLeads() {
  const { data: rows = [], isLoading: loading, error } = useQuery({
    queryKey: QK.adminHotLeads,
    queryFn: fetchAdminHotLeads,
    staleTime: Infinity, // realtime drives updates
  });

  const setStatus = useCallback(async (id: string, status: string) => {
    queryClient.setQueryData<AdminHotLead[]>(QK.adminHotLeads, (prev = []) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r)),
    );
    await supabase.from('hot_leads').update({ status }).eq('id', id);
  }, []);

  return {
    rows,
    loading,
    error: (error as Error)?.message ?? null,
    reload: () => queryClient.invalidateQueries({ queryKey: QK.adminHotLeads }),
    setStatus,
  };
}

// ─── Clients ─────────────────────────────────────────────────────────────────
export interface ClientListRow {
  id: string;
  business_name: string;
  business_type: string | null;
  location: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notification_channel: string | null;
  status: string;
  created_at: string;
  has_profile: boolean;
  activated_at: string | null;
}

async function fetchClients(): Promise<ClientListRow[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, business_name, business_type, location, website_url, contact_email, contact_phone, notification_channel, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const base = (data ?? []) as Omit<ClientListRow, 'has_profile' | 'activated_at'>[];
  if (base.length === 0) return [];

  const { data: profileData } = await supabase
    .from('profiles')
    .select('client_id, activated_at')
    .in('client_id', base.map((c) => c.id));
  const profileByClient = new Map(
    (profileData ?? []).map((p: { client_id: string; activated_at: string | null }) => [p.client_id, p.activated_at]),
  );

  return base.map((c) => ({
    ...c,
    has_profile: profileByClient.has(c.id),
    activated_at: profileByClient.get(c.id) ?? null,
  }));
}

export function useClients() {
  const { data: rows = [], isLoading: loading, error } = useQuery({
    queryKey: QK.clients,
    queryFn: fetchClients,
    staleTime: 3 * 60 * 1000,
  });

  return {
    rows,
    loading,
    error: (error as Error)?.message ?? null,
    reload: () => queryClient.invalidateQueries({ queryKey: QK.clients }),
  };
}

export interface NewClientInput {
  business_name: string;
  business_type: string;
  location: string;
  website_url?: string;
  contact_email: string;
  contact_phone: string;
  notification_channel: 'whatsapp' | 'sms';
  starting_credits: number;
  status?: 'draft' | 'active';
  // Pre-fills the auto-created default campaign's prospect-discovery fields —
  // typically sourced from the website-enrichment result (services -> search
  // terms, location -> target location) so the campaign isn't created blank.
  search_queries?: string[];
  target_locations?: string[];
}

export async function createClient(input: NewClientInput) {
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .insert({
      business_name: input.business_name,
      business_type: input.business_type || null,
      location: input.location || null,
      website_url: input.website_url || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      notification_channel: input.notification_channel,
      status: input.status ?? 'active',
    })
    .select('id')
    .single();
  if (clientError) return { error: clientError };

  const clientId = (clientData as { id: string }).id;

  const { error: billingError } = await supabase
    .from('billing_profiles')
    .insert({ client_id: clientId, credits_remaining: input.starting_credits, sms_credits_remaining: 0 });
  if (billingError) return { error: billingError };

  const { error: campaignError } = await supabase
    .from('campaigns')
    .insert({
      client_id: clientId,
      name: `${input.business_name} — Campaign 1`,
      channel: 'email',
      status: 'active',
      search_queries: input.search_queries ?? [],
      target_locations: input.target_locations ?? [],
      max_results: 1000,
      scrape_enabled: false,
    });
  if (campaignError) return { error: campaignError };

  return { error: null, clientId };
}

export async function sendClientInvite(
  clientId: string,
  email: string,
  fullName: string | null,
): Promise<{ error: string | null; alreadyActive?: boolean }> {
  const { data, error } = await supabase.functions.invoke('invite-client', {
    body: {
      email,
      client_id: clientId,
      full_name: fullName,
      redirect_to: `${window.location.origin}/auth/set-password`,
    },
  });
  if (error) return { error: error.message };
  if (data?.error === 'user_already_active') return { error: data.message, alreadyActive: true };
  if (data?.error) return { error: data.message ?? data.error };
  return { error: null };
}

export async function updateClientLoginEmail(
  clientId: string,
  newEmail: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('update-client-email', {
    body: { client_id: clientId, new_email: newEmail },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.message ?? data.error };
  return { error: null };
}

export interface UpdateClientInput {
  business_name: string;
  business_type: string;
  location: string;
  website_url: string;
  contact_email: string;
  contact_phone: string;
  notification_channel: 'whatsapp' | 'sms';
  status: 'draft' | 'active' | 'paused' | 'churned';
}

export async function updateClient(id: string, input: UpdateClientInput) {
  return supabase.from('clients').update({
    business_name: input.business_name,
    business_type: input.business_type || null,
    location: input.location || null,
    website_url: input.website_url || null,
    contact_email: input.contact_email,
    contact_phone: input.contact_phone,
    notification_channel: input.notification_channel,
    status: input.status,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export interface ClientDeleteCounts {
  campaigns: number;
  prospects: number;
  messages: number;
  hot_leads: number;
  replies: number;
}

export async function getClientDeleteCounts(clientId: string): Promise<ClientDeleteCounts> {
  const [camps, prosts, msgs, hls, reps] = await Promise.all([
    supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('hot_leads').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('replies').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
  ]);
  return {
    campaigns: camps.count ?? 0,
    prospects: prosts.count ?? 0,
    messages:  msgs.count ?? 0,
    hot_leads: hls.count ?? 0,
    replies:   reps.count ?? 0,
  };
}

export async function deleteClient(clientId: string): Promise<{ error: string | null }> {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('id')
    .eq('client_id', clientId);
  const userIds = (profileData ?? []).map((p: { id: string }) => p.id);

  if (userIds.length > 0) {
    const { data, error: fnErr } = await supabase.functions.invoke('delete-client-auth', {
      body: { user_ids: userIds },
    });
    if (fnErr) return { error: fnErr.message };
    if (data?.error) return { error: data.message ?? data.error };
  }

  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  return { error: error?.message ?? null };
}

export interface UpdateCampaignInput {
  name: string;
  description: string;
  channel: string;
  language: string;
  search_queries: string[];
  target_locations: string[];
  max_results: number;
  scrape_enabled: boolean;
}

export async function updateCampaign(id: string, input: UpdateCampaignInput) {
  return supabase.from('campaigns').update({
    name: input.name,
    description: input.description || null,
    channel: input.channel,
    language: input.language,
    search_queries: input.search_queries,
    target_locations: input.target_locations,
    max_results: input.max_results,
    scrape_enabled: input.scrape_enabled,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export interface CampaignDeleteCounts {
  prospects: number;
  messages: number;
}

export async function getCampaignDeleteCounts(campaignId: string): Promise<CampaignDeleteCounts> {
  const [prosts, msgs] = await Promise.all([
    supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId),
  ]);
  return {
    prospects: prosts.count ?? 0,
    messages:  msgs.count ?? 0,
  };
}

export async function deleteCampaign(campaignId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('campaigns').delete().eq('id', campaignId);
  return { error: error?.message ?? null };
}

export function useClientCampaigns(clientId: string) {
  const { data: campaigns = [] } = useQuery({
    queryKey: QK.clientCampaigns(clientId),
    queryFn: async () => {
      if (!clientId) return [];
      const { data } = await supabase
        .from('campaigns')
        .select('id, name')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!clientId,
    staleTime: 3 * 60 * 1000,
  });
  return campaigns;
}

// ─── Error monitoring ─────────────────────────────────────────────────────────
export interface ErrorRow {
  id: string;
  source: string;
  error_type: string;
  message: string;
  severity: string;
  resolved: boolean;
  retry_count: number;
  created_at: string;
}

export function useErrorLogs() {
  // showResolved is tracked in the query key so a change forces a new fetch
  const [showResolved, setShowResolved] = useErrorLogsFilter();

  const { data: rows = [], isLoading: loading, error } = useQuery({
    queryKey: QK.errorLogs(showResolved),
    queryFn: async () => {
      let q = supabase
        .from('error_logs')
        .select('id, source, error_type, message, severity, resolved, retry_count, created_at')
        .order('created_at', { ascending: false });
      if (!showResolved) q = q.eq('resolved', false);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ErrorRow[];
    },
    staleTime: Infinity, // realtime drives updates
  });

  const resolve = useCallback(async (id: string) => {
    // Optimistic remove from list
    queryClient.setQueryData<ErrorRow[]>(QK.errorLogs(showResolved), (prev = []) =>
      showResolved ? prev.map((r) => (r.id === id ? { ...r, resolved: true } : r)) : prev.filter((r) => r.id !== id),
    );
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('error_logs').update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: session?.user?.id ?? null,
    }).eq('id', id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: QK.errorLogs(showResolved) });
    }
  }, [showResolved]);

  return {
    rows,
    loading,
    error: (error as Error)?.message ?? null,
    resolve,
    showResolved,
    setShowResolved,
    reload: () => queryClient.invalidateQueries({ queryKey: QK.errorLogs(showResolved) }),
  };
}

// Separate tiny hook so showResolved state isn't blown away when component remounts
import { useState } from 'react';
function useErrorLogsFilter() {
  return useState(false);
}
