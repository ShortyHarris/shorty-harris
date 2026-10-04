import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import type { HotLead, ClientSummary, HotLeadStatus, CallOutcomeValue } from '../types';

function mockLeads(): HotLead[] {
  const statuses: HotLeadStatus[] = ['new', 'new', 'viewed', 'contacted', 'contacted', 'won', 'won', 'lost', 'new', 'contacted'];
  return statuses.map((status, i) => ({
    hot_lead_id: `mock-${i}`,
    business_name: `Eastpark Dental #0${i + 1}`,
    contact_name: 'Jordan Lee',
    email: 'jordan@example.com',
    phone: '+260971234567',
    status,
    ai_summary: 'Replied with clear buying intent: asked for pricing and availability, mentioned their current provider is unreliable.',
    suggested_action: 'Call to confirm pricing and close.',
    routed_at: new Date().toISOString(),
    first_viewed_at: null,
    contacted_at: null,
    closed_at: null,
    outcome_note: null,
    call_outcome: null,
    nudge_count: 0,
    escalated: false,
    hours_waiting: status === 'new' || status === 'viewed' ? 3 : null,
    reply: { body: 'Sounds great, can you send pricing?', received_at: new Date().toISOString() },
    latest_reply: null,
  }));
}

interface DashboardData {
  summary: ClientSummary;
  leads: HotLead[];
}

async function fetchDashboard(clientId: string, client: SupabaseClient): Promise<DashboardData> {
  const [clientRes, billingRes, sentRes, repliesRes, leadsRes] = await Promise.all([
    client.from('clients').select('business_name').eq('id', clientId).single(),
    client.from('billing_profiles').select('credits_remaining').eq('client_id', clientId).single(),
    client.from('messages').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('send_status', 'sent'),
    client.from('replies').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    client.rpc('hot_lead_queue', { p_client_id: clientId }),
  ]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);
  const leadsResult = leadsRes.data as { ok: boolean; error?: string; leads?: HotLead[] } | null;
  if (leadsResult && leadsResult.ok === false) throw new Error(leadsResult.error ?? 'not_permitted');

  const leads = leadsResult?.leads ?? [];

  return {
    summary: {
      business_name:     clientRes.data?.business_name ?? 'Your business',
      credits_remaining: billingRes.data?.credits_remaining ?? 0,
      messagesSent:      sentRes.count ?? 0,
      replies:           repliesRes.count ?? 0,
      hotLeads:          leads.length,
    },
    leads,
  };
}

export const dashboardKey = (clientId: string) => ['client-dashboard', clientId] as const;

export function useClientDashboard(clientId: string, client: SupabaseClient = supabase) {
  const isPreview = clientId === '__preview__';

  const { data, isLoading: loading, isFetching, dataUpdatedAt, error, refetch } = useQuery({
    queryKey: dashboardKey(clientId),
    queryFn: () => fetchDashboard(clientId, client),
    enabled: !isPreview,
    staleTime: 2 * 60 * 1000,
    // For preview mode, use initialData so no fetch is ever made
    ...(isPreview ? { initialData: { summary: null as unknown as ClientSummary, leads: mockLeads() } } : {}),
  });

  // Realtime for hot_leads is handled centrally by useClientRealtimeSync() in
  // ClientZone - not here. This hook is called from multiple places at once
  // (the Dashboard page itself, plus the nav badge in ClientZone), and a
  // second per-hook channel subscription with a fixed name crashes the
  // moment both are mounted concurrently.

  // The only sanctioned way to change a hot lead's status - keeps
  // hot_leads.status and prospects.pipeline_status in step server-side.
  // Never pass timestamps; set_hot_lead_outcome's trigger owns those.
  const setOutcome = useCallback(async (
    id: string, status: HotLeadStatus | null, note?: string, callOutcome?: CallOutcomeValue,
  ): Promise<{ error: string | null }> => {
    queryClient.setQueryData<DashboardData>(dashboardKey(clientId), (prev) => {
      if (!prev || status === null) return prev;
      return { ...prev, leads: prev.leads.map((l) => (l.hot_lead_id === id ? { ...l, status } : l)) };
    });
    const { data, error } = await supabase.rpc('set_hot_lead_outcome', {
      p_hot_lead_id: id,
      p_status: status,
      p_note: note ?? null,
      p_call_outcome: callOutcome ?? null,
    });
    const result = data as { ok: boolean; error?: string } | null;
    if (error || (result && result.ok === false)) {
      queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
      return { error: error?.message ?? result?.error ?? 'Could not update lead.' };
    }
    queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
    return { error: null };
  }, [clientId]);

  return {
    summary: data?.summary ?? null,
    leads:   data?.leads   ?? (isPreview ? mockLeads() : []),
    loading: isPreview ? false : loading,
    isFetching: isPreview ? false : isFetching,
    dataUpdatedAt,
    error:   (error as Error)?.message ?? null,
    setOutcome,
    reload: async () => {
      if (isPreview) return;
      const res = await refetch();
      if (res.error) throw res.error;
    },
  };
}
