import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import type { QueueItem } from '../types';

export const AQ_KEYS = {
  items: ['approval-queue', 'items'] as const,
  stats: ['approval-queue', 'stats'] as const,
};

interface Stats {
  pending: number;
  approvedToday: number;
  sentToday: number;
  rejected: number;
}

async function fetchQueueItems(): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(
      `id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, created_at,
       prospect:prospects ( id, business_name, contact_name, email, phone, category, location, pipeline_status ),
       client:clients ( id, business_name, business_type )`
    )
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    prospect: Array.isArray(row.prospect) ? row.prospect[0] ?? null : row.prospect ?? null,
    client:   Array.isArray(row.client)   ? row.client[0]   ?? null : row.client   ?? null,
  })) as QueueItem[];
}

async function fetchQueueStats(): Promise<Stats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const iso = startOfDay.toISOString();

  const [pending, approvedToday, sentToday, rejected] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved').gte('approved_at', iso),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('send_status', 'sent').gte('created_at', iso),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('approval_status', 'rejected'),
  ]);
  return {
    pending:       pending.count       ?? 0,
    approvedToday: approvedToday.count ?? 0,
    sentToday:     sentToday.count     ?? 0,
    rejected:      rejected.count      ?? 0,
  };
}

export function useApprovalQueue() {
  const { data: items = [], isLoading: loading, error } = useQuery({
    queryKey: AQ_KEYS.items,
    queryFn: fetchQueueItems,
    staleTime: Infinity, // realtime drives updates
  });

  const { data: stats = { pending: 0, approvedToday: 0, sentToday: 0, rejected: 0 } } = useQuery({
    queryKey: AQ_KEYS.stats,
    queryFn: fetchQueueStats,
    staleTime: 60 * 1000, // stats recompute every minute or on invalidation
  });

  const approve = useCallback(async (id: string, editedBody?: string) => {
    queryClient.setQueryData<QueueItem[]>(AQ_KEYS.items, (prev = []) => prev.filter((i) => i.id !== id));
    const patch: Record<string, unknown> = {
      approval_status: editedBody !== undefined ? 'edited' : 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (editedBody !== undefined) patch.body = editedBody;
    const { error } = await supabase.from('messages').update(patch).eq('id', id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
    }
    queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
  }, []);

  const reject = useCallback(async (id: string) => {
    queryClient.setQueryData<QueueItem[]>(AQ_KEYS.items, (prev = []) => prev.filter((i) => i.id !== id));
    const { error } = await supabase
      .from('messages')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
    }
    queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
  }, []);

  return {
    items,
    stats,
    loading,
    error: (error as Error)?.message ?? null,
    approve,
    reject,
    reload: () => {
      queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
      queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
    },
  };
}
