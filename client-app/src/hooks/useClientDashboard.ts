import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { HotLead, ClientSummary, HotLeadStatus } from '../types';

export function useClientDashboard(CLIENT_ID: string) {
  const [summary, setSummary] = useState<ClientSummary | null>(null);
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    const [clientRes, billingRes, sentRes, repliesRes, leadsRes] = await Promise.all([
      supabase.from('clients').select('business_name').eq('id', CLIENT_ID).single(),
      supabase.from('billing_profiles').select('credits_remaining').eq('client_id', CLIENT_ID).single(),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).eq('send_status', 'sent'),
      supabase.from('replies').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID),
      supabase
        .from('hot_leads')
        .select(
          `id, prospect_id, ai_summary, suggested_action, status, routed_at,
           prospect:prospects ( id, business_name, contact_name, email, phone, category, location ),
           reply:replies ( body )`
        )
        .eq('client_id', CLIENT_ID)
        .order('routed_at', { ascending: false }),
    ]);

    if (leadsRes.error) {
      setError(leadsRes.error.message);
      setLoading(false);
      return;
    }

    const normalized = (leadsRes.data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      prospect: Array.isArray(row.prospect) ? row.prospect[0] ?? null : row.prospect ?? null,
      reply: Array.isArray(row.reply) ? row.reply[0] ?? null : row.reply ?? null,
    })) as HotLead[];

    setSummary({
      business_name: clientRes.data?.business_name ?? 'Your business',
      credits_remaining: billingRes.data?.credits_remaining ?? 0,
      messagesSent: sentRes.count ?? 0,
      replies: repliesRes.count ?? 0,
      hotLeads: normalized.length,
    });
    setLeads(normalized);
    setLoading(false);
  }, [CLIENT_ID]);

  useEffect(() => { load(); }, [load]);

  const setStatus = useCallback(async (id: string, status: HotLeadStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    const { error } = await supabase
      .from('hot_leads')
      .update({ status, status_updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { setError(error.message); load(); }
  }, [load]);

  return { summary, leads, loading, error, setStatus, reload: load };
}
