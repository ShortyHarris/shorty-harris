import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { useAuth } from '../auth/AuthProvider';
import type { ClientMessageItem } from '../types';
import { fetchAllRows } from '../lib/fetchAllRows';
import { runInChunks, type ChunkedResult } from '../lib/chunkedBulk';
import { TERMINAL_PIPELINE_STATUSES } from '../lib/pipelineStatus';
import { campaignPendingProspectsPrefix } from './useClientCampaigns';
import { POLICY_HELD_REASONS } from '../lib/blockReasons';
import { saveDraftEdits } from '../lib/draftEdits';
import { startOfDayInTz, browserTimeZone, heldRows, excludeHeldDrafts, adjustApprovalStats } from '../lib/approvalsView';
import { approvalsScheduleKey, useApprovalsSchedule } from './useApprovalsSchedule';
import { useClientProfile } from './useClientProfile';

// Returned when an update matched no pending row (already approved or
// rejected elsewhere, or not visible to this user).
const ALREADY_HANDLED = 'this draft was already handled - the list has been refreshed';

export const clientApprovalsKey =(clientId: string) => ['client-approvals', clientId] as const;
export const clientApprovalsStatsKey = (clientId: string) => ['client-approvals-stats', clientId] as const;
export const clientPendingCountKey = (clientId: string) => ['client-approvals-pending-count', clientId] as const;
export const clientAwaitingProspectsKey = (clientId: string) => ['client-awaiting-prospects', clientId] as const;
// includeHeld is a trailing element, so invalidating [key, clientId] matches both variants.
export const clientApprovedKey = (clientId: string, includeHeld = false) =>
  includeHeld ? (['client-approved-drafts', clientId, true] as const) : (['client-approved-drafts', clientId] as const);

function invalidateApprovalQueries(clientId: string) {
  queryClient.invalidateQueries({ queryKey: campaignPendingProspectsPrefix });
  queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
  queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
  queryClient.invalidateQueries({ queryKey: clientPendingCountKey(clientId) });
  queryClient.invalidateQueries({ queryKey: approvalsScheduleKey(clientId) });
  queryClient.invalidateQueries({ queryKey: ['client-approvals-held-approved-today', clientId] });
  queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
  queryClient.invalidateQueries({ queryKey: clientApprovedKey(clientId) });
}

// How many of these messages were approved since `iso` (ids go in the URL, so in batches).
async function countApprovedSince(client: SupabaseClient, ids: string[], iso: string): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const { count, error } = await client.from('messages').select('id', { count: 'exact', head: true })
      .in('id', ids.slice(i, i + 150)).eq('approval_status', 'approved').gte('approved_at', iso);
    if (error) throw new Error(error.message);
    total += count ?? 0;
  }
  return total;
}

// Head count only - what the sidebar badge needs, without loading any drafts.
// Drafts held by send rules are not the client's to act on, so they are left out.
export function usePendingApprovalCount(clientId: string): number {
  const { schedule, scheduleReady } = useApprovalsSchedule(clientId);
  const heldPending = heldRows(schedule).filter((r) => r.approval_status === 'pending').length;
  const { data = 0 } = useQuery({
    queryKey: clientPendingCountKey(clientId),
    queryFn: async () => {
      const { count, error } = await supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).eq('approval_status', 'pending');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!clientId && clientId !== '__preview__',
    staleTime: 30 * 1000,
  });
  // Until the schedule is known the held rows can't be told apart, so show nothing
  // rather than a count that includes drafts the client must not see.
  if (!scheduleReady && clientId !== '__preview__') return 0;
  return Math.max(0, data - heldPending);
}

// Prospects still in play that have at least one drafted email waiting on
// approval. Same exclusions as the approve_sequences RPC.

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
  approval_status, created_at, pending_since, angle, observation, observation_source_url,
  prospect:prospects ( id, business_name, contact_name, email, phone, category, location )
`;

function normalizeRows(data: unknown): ClientMessageItem[] {
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...row,
    prospect: Array.isArray(row.prospect) ? row.prospect[0] ?? null : row.prospect ?? null,
  })) as ClientMessageItem[];
}

// Drafts held by policy (generic/freemail recipients) are left out of the blocked
// list and count and out of the sendable list. Admins opt in with includeHeld.
async function fetchApprovedDrafts(clientId: string, client: SupabaseClient, includeHeld = false): Promise<ApprovedDrafts> {
  const heldReasons = [...POLICY_HELD_REASONS] as string[];
  const blockedQuery = client.from('message_block_reasons').select('message_id, reason', { count: 'exact' })
    .eq('client_id', clientId).neq('reason', 'waiting_followup_timing');
  const [totalRes, blockedRes, recentRes, heldCountRes] = await Promise.all([
    client.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('approval_status', 'approved').eq('send_status', 'not_sent'),
    (includeHeld ? blockedQuery : blockedQuery.not('reason', 'in', `(${heldReasons.join(',')})`))
      .limit(APPROVED_LIST_LIMIT),
    client.from('messages').select(MESSAGE_SELECT)
      .eq('client_id', clientId).eq('approval_status', 'approved').eq('send_status', 'not_sent')
      .order('approved_at', { ascending: false })
      .limit(APPROVED_LIST_LIMIT),
    // Hidden held drafts are in neither list, so they come out of the sendable total too.
    includeHeld
      ? Promise.resolve({ count: 0, error: null })
      : client.from('message_block_reasons').select('message_id', { count: 'exact', head: true })
          .eq('client_id', clientId).in('reason', heldReasons),
  ]);
  if (totalRes.error) throw new Error(totalRes.error.message);
  if (blockedRes.error) throw new Error(blockedRes.error.message);
  if (recentRes.error) throw new Error(recentRes.error.message);
  if (heldCountRes.error) throw new Error(heldCountRes.error.message);

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

  // Hidden held drafts in the recent window must not fall through into "sendable".
  let heldIds = new Set<string>();
  if (!includeHeld && recent.length > 0) {
    const { data: heldRows, error: heldErr } = await client
      .from('message_block_reasons').select('message_id')
      .in('reason', heldReasons)
      .in('message_id', recent.map((m) => m.id));
    if (heldErr) throw new Error(heldErr.message);
    heldIds = new Set((heldRows ?? []).map((r: { message_id: string }) => r.message_id));
  }

  const blocked = [...recent, ...extraBlocked]
    .filter((m) => reasonById.has(m.id))
    .map((m) => ({ ...m, block_reason: reasonById.get(m.id)! }));
  const sendable = recent
    .filter((m) => !reasonById.has(m.id) && !heldIds.has(m.id))
    .map((m) => ({ ...m, block_reason: scheduledIds.has(m.id) ? 'waiting_followup_timing' : null }));

  const blockedCount = blockedRes.count ?? blocked.length;
  const heldCount = heldCountRes.count ?? 0;
  return {
    sendable,
    blocked,
    counts: { blocked: blockedCount, sendable: Math.max(0, (totalRes.count ?? 0) - blockedCount - heldCount) },
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
  const { rows } = await fetchAllRows<Record<string, unknown>>((from, to) =>
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

// "Today" starts at midnight in the business's send_timezone, not the browser's.
async function fetchClientStats(clientId: string, client: SupabaseClient, timeZone: string): Promise<ClientApprovalStats> {
  const iso = startOfDayInTz(timeZone).toISOString();

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

const EMPTY_STATS: ClientApprovalStats = { pending: 0, approvedToday: 0, sentToday: 0, rejected: 0 };

// hideSendRuleHeld: leave drafts held by send rules out of the lists, tabs and tiles (client view).
export function useClientApprovals(clientId: string, client: SupabaseClient = supabase, includeHeld = false, hideSendRuleHeld = false) {
  const { profile } = useAuth();
  const { profile: clientProfile } = useClientProfile(clientId);
  const timeZone = clientProfile?.send_timezone ?? browserTimeZone();

  const isPreview = clientId === '__preview__';

  const {
    data: rawItems = [],
    isLoading: itemsLoading,
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
    data: rawStats = { pending: 0, approvedToday: 0, sentToday: 0, rejected: 0 },
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery({
    queryKey: [...clientApprovalsStatsKey(clientId), timeZone],
    queryFn: () => fetchClientStats(clientId, client, timeZone),
    enabled: !!clientId && !isPreview,
    staleTime: 60 * 1000,
  });

  const { data: awaitingProspects = 0 } = useQuery({
    queryKey: clientAwaitingProspectsKey(clientId),
    queryFn: () => fetchAwaitingProspects(clientId, client),
    enabled: !!clientId && !isPreview,
    staleTime: 30 * 1000,
  });

  const { data: rawApproved = null, isFetching: approvedFetching, refetch: refetchApproved } = useQuery({
    queryKey: clientApprovedKey(clientId, includeHeld),
    queryFn: () => fetchApprovedDrafts(clientId, client, includeHeld),
    enabled: !!clientId && !isPreview,
    staleTime: 30 * 1000,
  });

  // Drafts held by send rules (from approvals_schedule), hidden from the client's view.
  const { schedule, scheduleReady } = useApprovalsSchedule(clientId, client);
  // Fail closed: when held rows must be hidden but the schedule is not loaded (or its fetch
  // failed), show nothing instead of the unfiltered lists.
  const gated = hideSendRuleHeld && !isPreview && !scheduleReady;
  const loading = itemsLoading || gated;
  const held = useMemo(() => (hideSendRuleHeld ? heldRows(schedule) : []), [schedule, hideSendRuleHeld]);
  const heldIds = useMemo(() => new Set(held.map((r) => r.message_id)), [held]);
  const heldApprovedIds = useMemo(
    () => held.filter((r) => r.approval_status === 'approved').map((r) => r.message_id), [held]);

  const { data: heldApprovedToday = 0 } = useQuery({
    queryKey: ['client-approvals-held-approved-today', clientId, timeZone, heldApprovedIds.join(',')],
    queryFn: () => countApprovedSince(client, heldApprovedIds, startOfDayInTz(timeZone).toISOString()),
    enabled: heldApprovedIds.length > 0 && !isPreview,
    staleTime: 60 * 1000,
  });

  const items = useMemo(
    () => (gated ? [] : heldIds.size ? rawItems.filter((i) => !heldIds.has(i.id)) : rawItems), [rawItems, heldIds, gated]);
  const stats = useMemo(
    () => (gated ? EMPTY_STATS : adjustApprovalStats(rawStats, held, heldApprovedToday)),
    [rawStats, held, heldApprovedToday, gated]);
  const approvedDrafts = useMemo(
    () => (gated ? null : rawApproved && held.length ? excludeHeldDrafts(rawApproved, held) : rawApproved),
    [rawApproved, held, gated]);

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
  // Errors when no row was updated (blocked by RLS or no longer pending), instead of a silent "saved".
  const saveEdits = useCallback(async (id: string, editedBody?: string, editedSubject?: string): Promise<{ error: string | null }> => {
    const { error, patch } = await saveDraftEdits(supabase, id, { body: editedBody, subject: editedSubject });
    if (!error) {
      queryClient.setQueryData<ClientMessageItem[]>(clientApprovalsKey(clientId), (prev = []) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } as ClientMessageItem : i))
      );
    }
    return { error };
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
  // Both are batched (every id goes in the URL) and best-effort: a failed batch
  // doesn't stop the rest, and the result carries the honest partial count.
  const bulkApprove = useCallback(async (ids: string[]): Promise<ChunkedResult> => {
    if (ids.length === 0) return { affected: 0, total: 0, failedBatches: 0, error: null };
    await removeFromCache(ids);
    const now = new Date().toISOString();
    const res = await runInChunks(ids, (chunk) => supabase
      .from('messages')
      .update({ approval_status: 'approved', approved_at: now, approved_by: profile?.id ?? null, updated_at: now })
      .in('id', chunk)
      .eq('approval_status', 'pending')
      .eq('send_status', 'not_sent')
      .select('id'));
    // Always refetch: after a partial failure the unprocessed rows must reappear.
    invalidateApprovalQueries(clientId);
    return res;
  }, [clientId, profile?.id, removeFromCache]);

  const bulkReject = useCallback(async (ids: string[]): Promise<ChunkedResult> => {
    if (ids.length === 0) return { affected: 0, total: 0, failedBatches: 0, error: null };
    await removeFromCache(ids);
    const res = await runInChunks(ids, (chunk) => supabase
      .from('messages')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .in('id', chunk)
      .eq('approval_status', 'pending')
      .eq('send_status', 'not_sent')
      .select('id'));
    invalidateApprovalQueries(clientId);
    return res;
  }, [clientId, removeFromCache]);

  return {
    items,
    stats,
    awaitingProspects,
    approvedDrafts,
    timeZone,
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
      queryClient.invalidateQueries({ queryKey: approvalsScheduleKey(clientId) });
      queryClient.invalidateQueries({ queryKey: clientPendingCountKey(clientId) });
      queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
      if (itemsRes.error) throw itemsRes.error;
      if (statsRes.error) throw statsRes.error;
      if (approvedRes.error) throw approvedRes.error;
    },
  };
}
