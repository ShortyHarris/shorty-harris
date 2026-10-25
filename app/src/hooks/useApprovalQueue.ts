import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { useAuth } from '../auth/AuthProvider';
import type { QueueItem } from '../types';
import { fetchAllRows } from '../lib/fetchAllRows';
import { runInChunks, type ChunkedResult } from '../lib/chunkedBulk';

export const AQ_KEYS = {
  items: ['approval-queue', 'items'] as const,
  stats: ['approval-queue', 'stats'] as const,
};

// The cached list plus whether it hit the load ceiling (more pending than loaded).
interface QueueData {
  items: QueueItem[];
  truncated: boolean;
}

const EMPTY_QUEUE: QueueData = { items: [], truncated: false };

function updateQueueItems(fn: (prev: QueueItem[]) => QueueItem[]) {
  queryClient.setQueryData<QueueData>(AQ_KEYS.items, (prev = EMPTY_QUEUE) => ({ ...prev, items: fn(prev.items) }));
}

interface Stats {
  approvedToday: number;
  sentToday: number;
  rejected: number;
  /** Exact pending count, from the same view as the list. Only used past the load ceiling. */
  pendingExact: number;
}

async function fetchQueueItems(): Promise<QueueData> {
  // Paged: one select is silently capped at 1000 rows by PostgREST.
  const { rows: data, truncated } = await fetchAllRows<Record<string, unknown>>((from, to) => supabase
    .from('messages_with_sender')
    .select(
      `
      id, prospect_id, campaign_id, client_id,
      channel, subject, body, message_type,
      approval_status, approved_at, send_status,
      created_at, sender_email, sender_status,
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
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to));

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

  const items = (data ?? []).map((row: Record<string, unknown>) => ({
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
  return { items, truncated };
}

async function fetchQueueStats(): Promise<Stats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const iso = startOfDay.toISOString();

  const [approvedToday, sentToday, rejected, pendingExact] = await Promise.all([
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

    supabase
      .from('messages_with_sender')
      .select('id', { count: 'exact', head: true })
      .eq('approval_status', 'pending'),
  ]);

  return {
    approvedToday: approvedToday.count ?? 0,
    sentToday: sentToday.count ?? 0,
    rejected: rejected.count ?? 0,
    pendingExact: pendingExact.count ?? 0,
  };
}

export function useApprovalQueue() {
  const { profile } = useAuth();
  const {
    data: queue = EMPTY_QUEUE,
    isLoading: loading,
    isFetching: itemsFetching,
    dataUpdatedAt,
    error,
    refetch: refetchItems,
  } = useQuery({
    queryKey: AQ_KEYS.items,
    queryFn: fetchQueueItems,
    staleTime: Infinity,
  });

  const {
    data: otherStats = { approvedToday: 0, sentToday: 0, rejected: 0, pendingExact: 0 },
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery({
    queryKey: AQ_KEYS.stats,
    queryFn: fetchQueueStats,
    staleTime: 60 * 1000,
  });

  const { items, truncated } = queue;
  const { pendingExact, ...countStats } = otherStats;

  // `pending` is derived from `items` (not a separate count query) so the
  // number shown on the stat tile and the list rendered below it can never
  // drift apart - they're reading the exact same cached data. Only when the
  // list was cut off at the load ceiling is the exact count used instead.
  const stats = { pending: truncated ? Math.max(pendingExact, items.length) : items.length, ...countStats };

  // Realtime invalidation for the `messages` table is handled once, centrally,
  // by useRealtimeSync() in AdminLayout - not here. A second per-hook channel
  // subscription with a fixed name breaks the moment this hook is mounted
  // more than once at a time (e.g. the sidebar badge + the page itself).

  const approve = useCallback(async (id: string, editedBody?: string, editedSubject?: string): Promise<{ error: string | null }> => {
    await queryClient.cancelQueries({ queryKey: AQ_KEYS.items });
    updateQueueItems((prev) => prev.filter((i) => i.id !== id));

    const patch: Record<string, unknown> = {
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      // Records the admin, so approvals made on a client's behalf are attributable.
      approved_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    if (editedBody !== undefined) {
      patch.body = editedBody;
    }

    if (editedSubject !== undefined) {
      patch.subject = editedSubject;
    }

    // Only a still-pending, unsent draft can be approved - never revive a rejected one.
    const { data, error } = await supabase
      .from('messages')
      .update(patch)
      .eq('id', id)
      .eq('approval_status', 'pending')
      .eq('send_status', 'not_sent')
      .select('id');

    const missed = !error && (data?.length ?? 0) === 0;
    queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
    queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
    return { error: error?.message ?? (missed ? 'this draft was already handled - the list has been refreshed' : null) };
  }, [profile?.id]);

  // Approves a set of drafts in one update (used for "approve all for this client").
  // The pending guard skips anything another admin already handled.
  // Sent in batches (every id goes in the URL); a failed batch doesn't stop the
  // rest, and the result carries the honest partial count. Always refetches so
  // rows from failed batches reappear.
  const bulkApprove = useCallback(async (ids: string[]): Promise<ChunkedResult> => {
    if (ids.length === 0) return { affected: 0, total: 0, failedBatches: 0, error: null };
    await queryClient.cancelQueries({ queryKey: AQ_KEYS.items });
    updateQueueItems((prev) => prev.filter((i) => !ids.includes(i.id)));

    const now = new Date().toISOString();
    const res = await runInChunks(ids, (chunk) => supabase
      .from('messages')
      .update({ approval_status: 'approved', approved_at: now, approved_by: profile?.id ?? null, updated_at: now })
      .in('id', chunk)
      .eq('approval_status', 'pending')
      .eq('send_status', 'not_sent')
      .select('id'));

    queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
    queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
    return res;
  }, [profile?.id]);

  // Same edit patch as approve(), minus the approval fields - the draft stays pending.
  const saveEdits = useCallback(async (id: string, editedBody?: string, editedSubject?: string): Promise<{ error: string | null }> => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (editedBody !== undefined) patch.body = editedBody;
    if (editedSubject !== undefined) patch.subject = editedSubject;

    const { error } = await supabase
      .from('messages')
      .update(patch)
      .eq('id', id);

    if (!error) {
      updateQueueItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } as QueueItem : i)));
    }
    return { error: error?.message ?? null };
  }, []);

  const reject = useCallback(async (id: string): Promise<{ error: string | null }> => {
    // Cancel in-flight fetches so a stale response can't restore the row.
    await queryClient.cancelQueries({ queryKey: AQ_KEYS.items });
    updateQueueItems((prev) => prev.filter((i) => i.id !== id));

    // Only a still-pending, unsent draft can be rejected from the queue.
    const { data, error } = await supabase
      .from('messages')
      .update({
        approval_status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('approval_status', 'pending')
      .eq('send_status', 'not_sent')
      .select('id');

    const missed = !error && (data?.length ?? 0) === 0;
    queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
    queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
    return { error: error?.message ?? (missed ? 'this draft was already handled - the list has been refreshed' : null) };
  }, []);

  return {
    items,
    stats,
    /** True when more drafts are pending than were loaded; bulk actions must be disabled. */
    truncated,
    loading,
    isFetching: itemsFetching || statsFetching,
    dataUpdatedAt,
    error: (error as Error)?.message ?? null,

    approve,
    bulkApprove,
    saveEdits,
    reject,

    reload: async () => {
      const [itemsRes, statsRes] = await Promise.all([refetchItems(), refetchStats()]);
      if (itemsRes.error) throw itemsRes.error;
      if (statsRes.error) throw statsRes.error;
    },
  };
}
