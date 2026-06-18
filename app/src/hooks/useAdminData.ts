import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ---------- Prospects ----------
export interface ProspectListRow {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  category: string | null;
  location: string | null;
  pipeline_status: string;
  client: { business_name: string } | null;
}

export function useProspects() {
  const [rows, setRows] = useState<ProspectListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('prospects')
      .select(`id, business_name, contact_name, email, category, location, pipeline_status,
               client:clients ( business_name )`)
      .order('created_at', { ascending: false });
    if (error) { setError(error.message); setLoading(false); return; }
    const norm = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      client: Array.isArray(r.client) ? r.client[0] ?? null : r.client ?? null,
    })) as ProspectListRow[];
    setRows(norm);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { rows, loading, error, reload: load };
}

// ---------- Campaigns ----------
export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  channel: string;
  created_at: string;
  client: { business_name: string } | null;
  prospectCount: number;
}

export function useCampaigns() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('campaigns')
      .select(`id, name, status, channel, created_at, client:clients ( business_name )`)
      .order('created_at', { ascending: false });
    if (error) { setError(error.message); setLoading(false); return; }

    const base = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      client: Array.isArray(r.client) ? r.client[0] ?? null : r.client ?? null,
      prospectCount: 0,
    })) as CampaignRow[];

    await Promise.all(base.map(async (c) => {
      const { count } = await supabase
        .from('prospects').select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id);
      c.prospectCount = count ?? 0;
    }));

    setRows(base);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = useCallback(async (id: string, status: string) => {
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    const { error } = await supabase
      .from('campaigns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { setError(error.message); load(); }
  }, [load]);

  return { rows, loading, error, reload: load, setStatus };
}

export interface NewCampaignInput {
  client_id: string;
  name: string;
  channel: string;
  search_queries: string[];
  target_locations: string[];
  max_results: number;
  scrape_enabled: boolean;
}

export function useClientsList() {
  const [clients, setClients] = useState<{ id: string; business_name: string }[]>([]);
  useEffect(() => {
    supabase.from('clients').select('id, business_name').order('business_name')
      .then(({ data }) => setClients((data ?? []) as { id: string; business_name: string }[]));
  }, []);
  return clients;
}

export async function createCampaign(input: NewCampaignInput) {
  return supabase.from('campaigns').insert({
    client_id: input.client_id,
    name: input.name,
    channel: input.channel,
    status: 'active',
    search_queries: input.search_queries,
    target_locations: input.target_locations,
    max_results: input.max_results,
    scrape_enabled: input.scrape_enabled,
  });
}

// ---------- Hot leads (admin, all clients) ----------
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

export function useAdminHotLeads() {
  const [rows, setRows] = useState<AdminHotLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('hot_leads')
      .select(`id, ai_summary, suggested_action, status, routed_at,
               prospect:prospects ( business_name, category, location ),
               client:clients ( business_name ),
               reply:replies ( body )`)
      .order('routed_at', { ascending: false });
    if (error) { setError(error.message); setLoading(false); return; }
    const norm = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      prospect: Array.isArray(r.prospect) ? r.prospect[0] ?? null : r.prospect ?? null,
      client:   Array.isArray(r.client)   ? r.client[0]   ?? null : r.client   ?? null,
      reply:    Array.isArray(r.reply)    ? r.reply[0]    ?? null : r.reply    ?? null,
    })) as AdminHotLead[];
    setRows(norm);
    setLoading(false);
  }, []);

  const setStatus = useCallback(async (id: string, status: string) => {
    await supabase.from('hot_leads').update({ status }).eq('id', id);
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  }, []);

  useEffect(() => { load(); }, [load]);
  return { rows, loading, error, reload: load, setStatus };
}

// ---------- Error monitoring ----------
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
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    let q = supabase.from('error_logs')
      .select('id, source, error_type, message, severity, resolved, retry_count, created_at')
      .order('created_at', { ascending: false });
    if (!showResolved) q = q.eq('resolved', false);
    const { data, error } = await q;
    if (error) { setError(error.message); setLoading(false); return; }
    setRows((data ?? []) as ErrorRow[]);
    setLoading(false);
  }, [showResolved]);

  useEffect(() => { load(); }, [load]);

  const resolve = useCallback(async (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from('error_logs')
      .update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', id);
    if (error) { setError(error.message); load(); }
  }, [load]);

  return { rows, loading, error, resolve, showResolved, setShowResolved, reload: load };
}
