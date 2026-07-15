import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { useAuth } from '../auth/AuthProvider';
import type { ClientMessageItem } from '../types';

export const clientApprovalsKey = (clientId: string) => ['client-approvals', clientId] as const;
export const clientApprovalsStatsKey = (clientId: string) => ['client-approvals-stats', clientId] as const;

interface ClientApprovalStats {
  pending: number;
  approvedToday: number;
  sentToday: number;
  rejected: number;
}

async function fetchPendingMessages(clientId: string): Promise<ClientMessageItem[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(
      `
      id, prospect_id, channel, subject, body, message_type,
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

async function fetchClientStats(clientId: string): Promise<ClientApprovalStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const iso = startOfDay.toISOString();

  const [pending, approvedToday, sentToday, rejected] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('approval_status', 'pending'),
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('approval_status', 'approved').gte('approved_at', iso),
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('send_status', 'sent').gte('sent_at', iso),
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('approval_status', 'rejected'),
  ]);

  return {
    pending: pending.count ?? 0,
    approvedToday: approvedToday.count ?? 0,
    sentToday: sentToday.count ?? 0,
    rejected: rejected.count ?? 0,
  };
}

export function useClientApprovals(clientId: string) {
  const { profile } = useAuth();

  const isPreview = clientId === '__preview__';

  const {
    data: items = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: clientApprovalsKey(clientId),
    queryFn: () => fetchPendingMessages(clientId),
    enabled: !!clientId && !isPreview,
    staleTime: 30 * 1000,
  });

  const { data: stats = { pending: 0, approvedToday: 0, sentToday: 0, rejected: 0 } } = useQuery({
    queryKey: clientApprovalsStatsKey(clientId),
    queryFn: () => fetchClientStats(clientId),
    enabled: !!clientId && !isPreview,
    staleTime: 60 * 1000,
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
  }, [clientId, profile?.id, removeFromCache]);

  const reject = useCallback(async (id: string) => {
    removeFromCache([id]);
    const { error } = await supabase
      .from('messages')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
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
  }, [clientId, removeFromCache]);

  return {
    items,
    stats,
    loading,
    error: (error as Error)?.message ?? null,

    approve,
    reject,
    bulkApprove,
    bulkReject,

    reload: () => {
      queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
      queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
    },
  };
}
