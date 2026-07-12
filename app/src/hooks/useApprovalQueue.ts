import { useCallback, useEffect } from 'react';
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
      `
      id, prospect_id, campaign_id, client_id,
      channel, subject, body, message_type,
      approval_status, approved_at, send_status,
      created_at,
      prospect:prospects (
        id, business_name, contact_name, email,
        phone, category, location, pipeline_status
      ),
      client:clients (
        id, business_name, business_type
      )
    `
    )
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const prospectIds = Array.from(
    new Set((data ?? []).map((row: Record<string, unknown>) => row.prospect_id as string))
  );

  const originalOpens: Record<string, { opened_at: string | null; open_count: number }> = {};
  if (prospectIds.length > 0) {
    const { data: originals } = await supabase
      .from('messages')
      .select('prospect_id, opened_at, open_count')
      .in('prospect_id', prospectIds)
      .eq('message_type', 'initial')
      .eq('send_status', 'sent');

    (originals ?? []).forEach((o: Record<string, unknown>) => {
      originalOpens[o.prospect_id as string] = {
        opened_at: o.opened_at as string | null,
        open_count: (o.open_count as number) ?? 0,
      };
    });
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    prospect: Array.isArray(row.prospect)
      ? row.prospect[0] ?? null
      : row.prospect ?? null,
    client: Array.isArray(row.client)
      ? row.client[0] ?? null
      : row.client ?? null,
    originalOpenedAt: originalOpens[row.prospect_id as string]?.opened_at ?? null,
    originalOpenCount: originalOpens[row.prospect_id as string]?.open_count ?? 0,
  })) as QueueItem[];
}

async function fetchQueueStats(): Promise<Stats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const iso = startOfDay.toISOString();

  const [pending, approvedToday, sentToday, rejected] = await Promise.all([
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('approval_status', 'pending'),

    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('approval_status', 'approved')
      .gte('approved_at', iso),

    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('send_status', 'sent')
      .gte('sent_at', iso),

    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('approval_status', 'rejected'),
  ]);

  return {
    pending: pending.count ?? 0,
    approvedToday: approvedToday.count ?? 0,
    sentToday: sentToday.count ?? 0,
    rejected: rejected.count ?? 0,
  };
}

export function useApprovalQueue() {
  const {
    data: items = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: AQ_KEYS.items,
    queryFn: fetchQueueItems,
    staleTime: Infinity,
  });

  const { data: stats = { pending: 0, approvedToday: 0, sentToday: 0, rejected: 0 } } =
    useQuery({
      queryKey: AQ_KEYS.stats,
      queryFn: fetchQueueStats,
      staleTime: 60 * 1000,
    });

  useEffect(() => {
    const channel = supabase
      .channel('messages-approval-queue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
          queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const approve = useCallback(async (id: string, editedBody?: string, editedSubject?: string) => {
    queryClient.setQueryData<QueueItem[]>(AQ_KEYS.items, (prev = []) =>
      prev.filter((i) => i.id !== id)
    );

    const patch: Record<string, unknown> = {
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (editedBody !== undefined) {
      patch.body = editedBody;
    }

    if (editedSubject !== undefined) {
      patch.subject = editedSubject;
    }

    const { error } = await supabase
      .from('messages')
      .update(patch)
      .eq('id', id);

    if (error) {
      queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
    }

    queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
  }, []);

  const reject = useCallback(async (id: string) => {
    queryClient.setQueryData<QueueItem[]>(AQ_KEYS.items, (prev = []) =>
      prev.filter((i) => i.id !== id)
    );

    const { error } = await supabase
      .from('messages')
      .update({
        approval_status: 'rejected',
        updated_at: new Date().toISOString(),
      })
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
