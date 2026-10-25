import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { useAuth } from '../auth/AuthProvider';
import type { ClientMessageItem } from '../types';
import { fetchAllRows } from '../lib/fetchAllRows';
import { campaignPendingProspectsPrefix } from './useClientCampaigns';

// Returned when an update matched no pending row (already approved or
// rejected elsewhere, or not visible to this user).
const ALREADY_HANDLED = 'this draft was already handled - the list has been refreshed';

export const clientApprovalsKey =(clientId: string) => ['client-approvals', clientId] as const;
export const clientApprovalsStatsKey = (clientId: string) => ['client-approvals-stats', clientId] as const;
export const clientAwaitingProspectsKey = (clientId: string) => ['client-awaiting-prospects', clientId] as const;
export const clientApprovedKey = (clientId: string) => ['client-approved-drafts', clientId] as const;

function invalidateApprovalQueries(clientId: string) {
  queryClient.invalidateQueries({ queryKey: campaignPendingProspectsPrefix });
  queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
  queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
  queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
  queryClient.invalidateQueries({ queryKey: clientApprovedKey(clientId) });
}

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

// Approved-but-not-sent drafts are capped per list so a big backlog can't make
// the page (or the id lists sent back to PostgREST) unbounded.
export const APPROVED_LIST_LIMIT = 200;

export interface ApprovedDrafts {
  /** Sendable or scheduled drafts, newest approval first (capped). */
  sendable: ClientMessageItem[];
  /** Drafts the send pipeline will skip, with block_reason set (capped). */
  blocked: ClientMessageItem[];
  /** True totals - the lists above may be shorter than these. */
  counts: { sendable: number; blocked: number };
}

const MESSAGE_SELECT = `
  id, prospect_id, campaign_id, channel, subject, body, message_type,
  approval_status, created_at,
  prospect:prospects ( id, business_name, contact_name, email, phone, category, location )
`;

function normalizeRows(data: unknown): ClientMessageItem[] {
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...row,
    prospect: Array.isArray(row.prospect) ? row.prospect[0] ?? null : row.prospect ?? null,
  })) as ClientMessageItem[];
}

async function fetchApprovedDrafts(clientId: string, client: SupabaseClient): Promise<ApprovedDrafts> {
  const [totalRes, blockedRes, recentRes] = await Promise.all([
    client.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('approval_status', 'approved').eq('send_status', 'not_sent'),
    client.from('message_block_reasons').select('message_id, reason', { count: 'exact' })
      .eq('client_id', clientId).neq('reason', 'waiting_followup_timing')
      .limit(APPROVED_LIST_LIMIT),
    client.from('messages').select(MESSAGE_SELECT)
      .eq('client_id', clientId).eq('approval_status', 'approved').eq('send_status', 'not_sent')
      .order('approved_at', { ascending: false })
      .limit(APPROVED_LIST_LIMIT),
  ]);
  if (totalRes.error) throw new Error(totalRes.error.message);
  if (blockedRes.error) throw new Error(blockedRes.error.message);
  if (recentRes.error) throw new Error(recentRes.error.message);

  const reasonById = new Map<string, string>(
    (blockedRes.data ?? []).map((r: { message_id: string; reason: string }) => [r.message_id, r.reason]),
  );
  const recent = normalizeRows(recentRes.data);

  // Blocked drafts older than the recent window still need their rows.
  const recentIds = new Set(recent.map((m) => m.id));
  const missingBlockedIds = Array.from(reasonById.keys()).filter((id) => !recentIds.has(id));
  let extraBlocked: ClientMessageItem[] = [];
  if (missingBlockedIds.length > 0) {
    const res = await client.from('messages').select(MESSAGE_SELECT).in('id', missingBlockedIds);
    if (res.error) throw new Error(res.error.message);
    extraBlocked = normalizeRows(res.data);
  }

  // Scheduled follow-ups only show up in the view under waiting_followup_timing.
  const { data: scheduledRows, error: schedErr } = await client
    .from('message_block_reasons').select('message_id')
    .eq('reason', 'waiting_followup_timing')
    .in('message_id', recent.map((m) => m.id));
  if (schedErr) throw new Error(schedErr.message);
  const scheduledIds = new Set((scheduledRows ?? []).map((r: { message_id: string }) => r.message_id));

  const blocked = [...recent, ...extraBlocked]
    .filter((m) => reasonById.has(m.id))
    .map((m) => ({ ...m, block_reason: reasonById.get(m.id)! }));
  const sendable = recent
    .filter((m) => !reasonById.has(m.id))
    .map((m) => ({ ...m, block_reason: scheduledIds.has(m.id) ? 'waiting_followup_timing' : null }));

  const blockedCount = blockedRes.count ?? blocked.length;
  return {
    sendable,
    blocked,
    counts: { blocked: blockedCount, sendable: Math.max(0, (totalRes.count ?? 0) - blockedCount) },
  };
}

interface ClientApprovalStats {
  pending: number;
  approvedToday: number;
  sentToday: number;
  rejected: number;
}

// Paged: a single select is silently capped at 1000 rows by PostgREST. The id
// tiebreak keeps page boundaries stable. Callers compare the list length with
// stats.pending (an exact count) to tell whether it is the whole queue.
async function fetchPendingMessages(clientId: string, client: SupabaseClient): Promise<ClientMessageItem[]> {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
    client
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('client_id', clientId)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
  return normalizeRows(rows);
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

  const { data: approvedDrafts = null, isFetching: approvedFetching, refetch: refetchApproved } = useQuery({
    queryKey: clientApprovedKey(clientId),
    queryFn: () => fetchApprovedDrafts(clientId, client),
    enabled: !!clientId && !isPreview,
    staleTime: 30 * 1000,
  });

  // Cancel in-flight list fetches first: one that started before the update
  // lands would otherwise write the old rows (incl. a just-rejected draft)
  // back over the optimistic removal.
  const removeFromCache = useCallback(async (ids: string[]) => {
    await queryClient.cancelQueries({ queryKey: clientApprovalsKey(clientId) });
    queryClient.setQueryData<ClientMessageItem[]>(clientApprovalsKey(clientId), (prev = []) =>
      prev.filter((i) => !ids.includes(i.id))
    );
  }, [clientId]);

  const approve = useCallback(async (id: string, editedBody?: string, editedSubject?: string): Promise<{ error: string | null }> => {
    await removeFromCache([id]);

    const patch: Record<string, unknown> = {
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (editedBody !== undefined) patch.body = editedBody;
    if (editedSubject !== undefined) patch.subject = editedSubject;

    const { data, error } = await supabase
      .from('messages').update(patch).eq('id', id).eq('approval_status', 'pending').select('id');
    const missed = !error && (data?.length ?? 0) === 0;
    invalidateApprovalQueries(clientId);
    return { error: error?.message ?? (missed ? ALREADY_HANDLED : null) };
  }, [clientId, profile?.id, removeFromCache]);

  // Same edit patch as approve(), minus the approval fields - the draft stays pending.
  const saveEdits = useCallback(async (id: string, editedBody?: string, editedSubject?: string): Promise<{ error: string | null }> => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (editedBody !== undefined) patch.body = editedBody;
    if (editedSubject !== undefined) patch.subject = editedSubject;

    const { error } = await supabase.from('messages').update(patch).eq('id', id);
    if (!error) {
      queryClient.setQueryData<ClientMessageItem[]>(clientApprovalsKey(clientId), (prev = []) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } as ClientMessageItem : i))
      );
    }
    return { error: error?.message ?? null };
  }, [clientId]);

  const reject = useCallback(async (id: string): Promise<{ error: string | null }> => {
    await removeFromCache([id]);
    // Approved-but-blocked drafts can be rejected too, as long as nothing has gone out.
    const { data, error } = await supabase
      .from('messages')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('approval_status', ['pending', 'approved'])
      .eq('send_status', 'not_sent')
      .select('id');
    const missed = !error && (data?.length ?? 0) === 0;
    invalidateApprovalQueries(clientId);
    return { error: error?.message ?? (missed ? ALREADY_HANDLED : null) };
  }, [clientId, removeFromCache]);

  // Bulk writes only ever touch drafts that are still pending and unsent, and
  // report how many rows actually changed (0 can mean RLS or another tab won).
  const bulkApprove = useCallback(async (ids: string[]): Promise<{ affected: number; error: string | null }> => {
    if (ids.length === 0) return { affected: 0, error: null };
    await removeFromCache(ids);
    const { data, error } = await supabase
      .from('messages')
      .update({
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('approval_status', 'pending')
      .eq('send_status', 'not_sent')
      .select('id');
    invalidateApprovalQueries(clientId);
    return { affected: data?.length ?? 0, error: error?.message ?? null };
  }, [clientId, profile?.id, removeFromCache]);

  const bulkReject = useCallback(async (ids: string[]): Promise<{ affected: number; error: string | null }> => {
    if (ids.length === 0) return { affected: 0, error: null };
    await removeFromCache(ids);
    const { data, error } = await supabase
      .from('messages')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('approval_status', 'pending')
      .eq('send_status', 'not_sent')
      .select('id');
    invalidateApprovalQueries(clientId);
    return { affected: data?.length ?? 0, error: error?.message ?? null };
  }, [clientId, removeFromCache]);

  return {
    items,
    stats,
    awaitingProspects,
    approvedDrafts,
    loading,
    isFetching: itemsFetching || statsFetching || approvedFetching,
    dataUpdatedAt,
    error: (error as Error)?.message ?? null,

    approve,
    saveEdits,
    reject,
    bulkApprove,
    bulkReject,

    reload: async () => {
      const [itemsRes, statsRes, approvedRes] = await Promise.all([refetchItems(), refetchStats(), refetchApproved()]);
      queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
      if (itemsRes.error) throw itemsRes.error;
      if (statsRes.error) throw statsRes.error;
      if (approvedRes.error) throw approvedRes.error;
    },
  };
}
