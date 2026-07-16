import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import type { HotLead, ClientSummary, HotLeadStatus } from '../types';

function mockLeads(): HotLead[] {
  const statuses: HotLeadStatus[] = ['new', 'new', 'viewed', 'contacted', 'contacted', 'won', 'won', 'lost', 'new', 'contacted'];
  return statuses.map((status, i) => ({
    id: `mock-${i}`,
    prospect_id: `p-${i}`,
    ai_summary: 'Replied with clear buying intent: asked for pricing and availability, mentioned their current provider is unreliable.',
    suggested_action: 'Call to confirm pricing and close.',
    status,
    routed_at: new Date().toISOString(),
    prospect: {
      id: `p-${i}`,
      business_name: `Eastpark Dental #0${i + 1}`,
      contact_name: 'Jordan Lee',
      email: 'jordan@example.com',
      phone: '+260971234567',
      category: 'Dental Clinic',
      location: 'Lusaka, ZM',
    },
    reply: { body: 'Sounds great, can you send pricing?' },
  })) as unknown as HotLead[];
}

interface DashboardData {
  summary: ClientSummary;
  leads: HotLead[];
}

async function fetchDashboard(clientId: string): Promise<DashboardData> {
  const [clientRes, billingRes, sentRes, repliesRes, leadsRes] = await Promise.all([
    supabase.from('clients').select('business_name').eq('id', clientId).single(),
    supabase.from('billing_profiles').select('credits_remaining').eq('client_id', clientId).single(),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('send_status', 'sent'),
    supabase.from('replies').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase
      .from('hot_leads')
      .select(
        `id, prospect_id, ai_summary, suggested_action, status, routed_at,
         prospect:prospects ( id, business_name, contact_name, email, phone, category, location ),
         reply:replies ( body )`
      )
      .eq('client_id', clientId)
      .order('routed_at', { ascending: false }),
  ]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);

  const leads = (leadsRes.data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    prospect: Array.isArray(row.prospect) ? row.prospect[0] ?? null : row.prospect ?? null,
    reply:    Array.isArray(row.reply)    ? row.reply[0]    ?? null : row.reply    ?? null,
  })) as HotLead[];

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

export function useClientDashboard(clientId: string) {
  const isPreview = clientId === '__preview__';

  const { data, isLoading: loading, error } = useQuery({
    queryKey: dashboardKey(clientId),
    queryFn: () => fetchDashboard(clientId),
    enabled: !isPreview,
    staleTime: 2 * 60 * 1000,
    // For preview mode, use initialData so no fetch is ever made
    ...(isPreview ? { initialData: { summary: null as unknown as ClientSummary, leads: mockLeads() } } : {}),
  });

  // Realtime for hot_leads is handled centrally by useClientRealtimeSync() in
  // ClientZone — not here. This hook is called from multiple places at once
  // (the Dashboard page itself, plus the nav badge in ClientZone), and a
  // second per-hook channel subscription with a fixed name crashes the
  // moment both are mounted concurrently.

  const setStatus = useCallback(async (id: string, status: HotLeadStatus) => {
    queryClient.setQueryData<DashboardData>(dashboardKey(clientId), (prev) => {
      if (!prev) return prev;
      return { ...prev, leads: prev.leads.map((l) => (l.id === id ? { ...l, status } : l)) };
    });
    const { error } = await supabase
      .from('hot_leads')
      .update({ status, status_updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
    }
  }, [clientId]);

  return {
    summary: data?.summary ?? null,
    leads:   data?.leads   ?? (isPreview ? mockLeads() : []),
    loading: isPreview ? false : loading,
    error:   (error as Error)?.message ?? null,
    setStatus,
    reload: () => queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) }),
  };
}
