import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export interface BlacklistedDomainRow {
  id: string;
  client_id: string | null;
  domain: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AdminBlacklistedDomainRow extends BlacklistedDomainRow {
  client: { business_name: string } | null;
}

// The BEFORE INSERT trigger normalises/validates the domain and the unique
// indexes catch duplicates - this is just a friendly translation of the two
// Postgres error shapes it can raise, so the UI never shows a raw "23505" or
// a generic "check constraint violated" toast.
function friendlyInsertError(error: PostgrestError): string {
  if (error.code === '23505') return 'That domain is already on the list.';
  if (error.code === '23514' || error.message?.includes('Not a usable domain')) {
    return 'Not a usable domain. Enter something like example.com.';
  }
  return error.message;
}

export const BLACKLIST_QK = {
  client: (clientId: string) => ['blacklisted-domains', clientId] as const,
  admin:  (clientId: string | null) => ['admin-blacklisted-domains', clientId ?? 'all'] as const,
};

// ─── Client-side: own rows + global rows (RLS returns exactly those for a
// client session - no client-side filtering needed on read). ───────────────
export function useClientBlacklist(clientId: string, client: SupabaseClient = supabase) {
  const { data: rows = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: BLACKLIST_QK.client(clientId),
    queryFn: async () => {
      const { data, error } = await client
        .from('blacklisted_domains')
        .select('id, client_id, domain, reason, created_by, created_at')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as BlacklistedDomainRow[];
    },
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });

  const ownRows    = rows.filter((r) => r.client_id === clientId);
  const globalRows = rows.filter((r) => r.client_id === null);

  const addDomain = useCallback(async (domain: string, reason: string): Promise<{ error: string | null }> => {
    const { error } = await client
      .from('blacklisted_domains')
      .insert({ client_id: clientId, domain: domain.trim(), reason: reason.trim() || null });
    if (error) return { error: friendlyInsertError(error) };
    queryClient.invalidateQueries({ queryKey: BLACKLIST_QK.client(clientId) });
    return { error: null };
  }, [client, clientId]);

  const deleteDomain = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const { error } = await client.from('blacklisted_domains').delete().eq('id', id);
    if (error) return { error: error.message };
    queryClient.invalidateQueries({ queryKey: BLACKLIST_QK.client(clientId) });
    return { error: null };
  }, [client, clientId]);

  return {
    ownRows,
    globalRows,
    loading,
    error: (error as Error)?.message ?? null,
    reload: async () => { await refetch(); },
    addDomain,
    deleteDomain,
  };
}

// ─── Admin-side: every row (global + every client's), or scoped to one
// client via filterClientId. Admin has full read/write on all rows per RLS,
// so filtering here is just a view convenience, not an access boundary. ────
export function useAdminBlacklist(filterClientId: string | null) {
  const { data: rows = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: BLACKLIST_QK.admin(filterClientId),
    queryFn: async () => {
      let q = supabase
        .from('blacklisted_domains')
        .select('id, client_id, domain, reason, created_by, created_at, client:clients ( business_name )')
        .order('created_at', { ascending: false });
      if (filterClientId === 'global') q = q.is('client_id', null);
      else if (filterClientId) q = q.eq('client_id', filterClientId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        client: Array.isArray(r.client) ? r.client[0] ?? null : r.client ?? null,
      })) as AdminBlacklistedDomainRow[];
    },
    staleTime: 60 * 1000,
  });

  const reloadAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-blacklisted-domains'] });
  }, []);

  const addDomain = useCallback(async (
    domain: string, reason: string, targetClientId: string | null,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('blacklisted_domains')
      .insert({ client_id: targetClientId, domain: domain.trim(), reason: reason.trim() || null });
    if (error) return { error: friendlyInsertError(error) };
    reloadAll();
    return { error: null };
  }, [reloadAll]);

  // Each insert is sent individually (not a single multi-row insert) so one
  // already-existing domain (23505) doesn't abort the whole batch - every
  // other domain in the list still goes in, and the caller gets per-domain
  // results to report "6 added, 2 already existed" rather than an all-or-nothing error.
  const addGlobalDomains = useCallback(async (
    domains: string[], reason: string,
  ): Promise<{ added: number; skipped: number }> => {
    let added = 0;
    let skipped = 0;
    for (const domain of domains) {
      const { error } = await supabase
        .from('blacklisted_domains')
        .insert({ client_id: null, domain, reason: reason || null });
      if (error) skipped += 1; else added += 1;
    }
    reloadAll();
    return { added, skipped };
  }, [reloadAll]);

  const deleteDomain = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.from('blacklisted_domains').delete().eq('id', id);
    if (error) return { error: error.message };
    reloadAll();
    return { error: null };
  }, [reloadAll]);

  return {
    rows,
    loading,
    error: (error as Error)?.message ?? null,
    reload: async () => { await refetch(); },
    addDomain,
    addGlobalDomains,
    deleteDomain,
  };
}

// ─── Purge flow ──────────────────────────────────────────────────────────
export interface PurgeDryRunResult {
  ok: boolean;
  dry_run: true;
  would_delete: number;
  of_which_already_emailed: number;
  sample: { business_name: string; email: string | null }[];
}

export interface PurgeConfirmResult {
  ok: boolean;
  dry_run: false;
  deleted: number;
  of_which_had_been_emailed: number;
}

export async function purgeBlacklistedProspects(
  clientId: string | null, confirm: boolean,
): Promise<{ data: PurgeDryRunResult | PurgeConfirmResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('purge_blacklisted_prospects', {
    p_client_id: clientId,
    p_confirm: confirm,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as PurgeDryRunResult | PurgeConfirmResult, error: null };
}

export const FREE_EMAIL_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'msn.com', 'live.com',
];

// No RPC covers "how many prospects would this affect" for an arbitrary
// domain set - this is a plain count query against prospects.email, not a
// new migration/RPC, so it stays within the frontend-only scope of this task.
export async function countFreeProviderMatches(): Promise<{ matching: number; total: number }> {
  const orFilter = FREE_EMAIL_PROVIDERS.map((d) => `email.ilike.%@${d}`).join(',');
  const [matchRes, totalRes] = await Promise.all([
    supabase.from('prospects').select('id', { count: 'exact', head: true }).or(orFilter),
    supabase.from('prospects').select('id', { count: 'exact', head: true }),
  ]);
  return { matching: matchRes.count ?? 0, total: totalRes.count ?? 0 };
}

export async function isDomainBlacklisted(email: string, clientId: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_domain_blacklisted', { p_email: email, p_client_id: clientId });
  if (error) return false;
  return !!data;
}
