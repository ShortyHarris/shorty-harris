import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { useAuth } from '../auth/AuthProvider';
import type { ClientMessageItem } from '../types';

export const clientApprovalsKey = (clientId: string) => ['client-approvals', clientId] as const;
export const clientApprovalsStatsKey = (clientId: string) => ['client-approvals-stats', clientId] as const;
export const clientAwaitingProspectsKey = (clientId: string) => ['client-awaiting-prospects', clientId] as const;

// Prospects still in play that have at least one drafted email waiting on
// approval. Same exclusions as the approve_sequences RPC.
const TERMINAL_PIPELINE_STATUSES = '(replied,hot_lead,won,lost,called,bounced)';

async function fetchAwaitingProspects(clientId: string, client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from('prospects')
    .select('id, messages!inner(id)', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('pipeline_status', 'in', TERMINAL_PIPELINE_STATUSES)
    .eq('messages.approval_status', 'pending')
    .eq('messages.send_status', 'not_sent');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

interface ClientApprovalStats {
  pending: number;
  approvedToday: number;
  sentToday: number;
  rejected: number;
}

async function fetchPendingMessages(clientId: string, client: SupabaseClient): Promise<ClientMessageItem[]> {
  const { data, error } = await client
    .from('messages')
    .select(
      `
      id, prospect_id, campaign_id, channel, subject, body, message_type,
      approval_status, created_at,
      prospect:prospects ( id, business_name, contact_name, email, phone, category, location )
    `
    )
    .eq('client_id', clientId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    prospect: Array.isArray(row.prospect) ? row.prospect[0] ?? null : row.prospect ?? null,
  })) as ClientMessageItem[];
}

async function fetchClientStats(clientId: string, client: SupabaseClient): Promise<ClientApprovalStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const iso = startOfDay.toISOString();

  const [pending, approvedToday, sentToday, rejected] = await Promise.all([
    client.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('approval_status', 'pending'),
    client.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('approval_status', 'approved').gte('approved_at', iso),
    client.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('send_status', 'sent').gte('sent_at', iso),
    client.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('approval_status', 'rejected'),
  ]);

  return {
    pending: pending.count ?? 0,
    approvedToday: approvedToday.count ?? 0,
    sentToday: sentToday.count ?? 0,
    rejected: rejected.count ?? 0,
  };
}

export function useClientApprovals(clientId: string, client: SupabaseClient = supabase) {
  const { profile } = useAuth();

  const isPreview = clientId === '__preview__';

  const {
    data: items = [],
    isLoading: loading,
    isFetching: itemsFetching,
    dataUpdatedAt,
    error,
    refetch: refetchItems,
  } = useQuery({
    queryKey: clientApprovalsKey(clientId),
    queryFn: () => fetchPendingMessages(clientId, client),
    enabled: !!clientId && !isPreview,
    staleTime: 30 * 1000,
  });

  const {
    data: stats = { pending: 0, approvedToday: 0, sentToday: 0, rejected: 0 },
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery({
    queryKey: clientApprovalsStatsKey(clientId),
    queryFn: () => fetchClientStats(clientId, client),
    enabled: !!clientId && !isPreview,
    staleTime: 60 * 1000,
  });

  const { data: awaitingProspects = 0 } = useQuery({
    queryKey: clientAwaitingProspectsKey(clientId),
    queryFn: () => fetchAwaitingProspects(clientId, client),
    enabled: !!clientId && !isPreview,
    staleTime: 30 * 1000,
  });

  const removeFromCache = useCallback((ids: string[]) => {
    queryClient.setQueryData<ClientMessageItem[]>(clientApprovalsKey(clientId), (prev = []) =>
      prev.filter((i) => !ids.includes(i.id))
    );
  }, [clientId]);

  const approve = useCallback(async (id: string, editedBody?: string, editedSubject?: string) => {
    removeFromCache([id]);

    const patch: Record<string, unknown> = {
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (editedBody !== undefined) patch.body = editedBody;
    if (editedSubject !== undefined) patch.subject = editedSubject;

    const { error } = await supabase.from('messages').update(patch).eq('id', id);
    if (error) queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
  }, [clientId, profile?.id, removeFromCache]);

  const reject = useCallback(async (id: string) => {
    removeFromCache([id]);
    const { error } = await supabase
      .from('messages')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
  }, [clientId, removeFromCache]);

  const bulkApprove = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    removeFromCache(ids);
    const { error } = await supabase
      .from('messages')
      .update({
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (error) queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
  }, [clientId, profile?.id, removeFromCache]);

  const bulkReject = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    removeFromCache(ids);
    const { error } = await supabase
      .from('messages')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
  }, [clientId, removeFromCache]);

  return {
    items,
    stats,
    awaitingProspects,
    loading,
    isFetching: itemsFetching || statsFetching,
    dataUpdatedAt,
    error: (error as Error)?.message ?? null,

    approve,
    reject,
    bulkApprove,
    bulkReject,

    reload: async () => {
      const [itemsRes, statsRes] = await Promise.all([refetchItems(), refetchStats()]);
      queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
      if (itemsRes.error) throw itemsRes.error;
      if (statsRes.error) throw statsRes.error;
    },
  };
}
