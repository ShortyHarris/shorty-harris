import { useCallback } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { useAuth } from '../auth/AuthProvider';
import type { ClientMessageItem } from '../types';
import { MAX_LOADED_ROWS } from '../lib/fetchAllRows';
import { runInChunks, type ChunkedResult } from '../lib/chunkedBulk';
import { saveDraftEdits } from '../lib/draftEdits';
import { browserTimeZone } from '../lib/approvalsView';
import { approvalsScheduleKey } from './useApprovalsSchedule';
import { sendPacingKey } from './useSendPacing';
import { useClientProfile } from './useClientProfile';

// Returned when an update matched no pending row (already approved or
// rejected elsewhere, or not visible to this user).
const ALREADY_HANDLED = 'this draft was already handled - the list has been refreshed';

export const clientApprovalsKey =(clientId: string) => ['client-approvals', clientId] as const;
export const clientPendingCountKey = (clientId: string) => ['client-approvals-pending-count', clientId] as const;
// The approved_queue RPC carries the tab counts, the stat tiles and one page of rows, so a
// single prefix invalidates all of them. The request params are a trailing element.
export const clientApprovedKey = (clientId: string) => ['client-approved-drafts', clientId] as const;

function invalidateApprovalQueries(clientId: string) {
  queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
  queryClient.invalidateQueries({ queryKey: clientPendingCountKey(clientId) });
  queryClient.invalidateQueries({ queryKey: approvalsScheduleKey(clientId) });
  queryClient.invalidateQueries({ queryKey: clientApprovedKey(clientId) });
  queryClient.invalidateQueries({ queryKey: sendPacingKey(clientId) });
}

// Head count only - what the sidebar badge needs, without loading any drafts. It comes from
// approved_queue, so it is the same number the Approvals page shows: drafts held by the send rules
// are not counted for a client.
export function usePendingApprovalCount(clientId: string): number {
  const { data = 0 } = useQuery({
    queryKey: clientPendingCountKey(clientId),
    queryFn: async () => (await fetchApprovedQueue(clientId, supabase, PENDING_COUNT_ONLY)).counts.pending,
    enabled: !!clientId && clientId !== '__preview__',
    staleTime: 30 * 1000,
  });
  return data;
}

// ── approved_queue RPC ───────────────────────────────────────────────────────
// One call returns the tab counts, the stat tiles and one page of rows, all derived
// server-side from the same rows. Who is asking (admin vs client) is decided inside
// the RPC with is_admin(); drafts held by the generic-mailbox / freemail rules are
// simply never returned to a client. Nothing here filters or adjusts the result.

export type ApprovedQueueTab = 'approved' | 'blocked' | 'pending';
export type ApprovedQueueSort = 'approved_desc' | 'approved_asc' | 'prospect_asc' | 'prospect_desc';

// What the server pages Approved and Blocked by. The scheduled-send and pending-since sorts only
// exist on the Pending tab, which sorts in the browser.
export const DEFAULT_QUEUE_SORT: ApprovedQueueSort = 'approved_desc';
export const QUEUE_SORT_OPTIONS: { value: ApprovedQueueSort; label: string }[] = [
  { value: 'approved_desc', label: 'Approved (newest first)' },
  { value: 'approved_asc', label: 'Approved (oldest first)' },
  { value: 'prospect_asc', label: 'Prospect A-Z' },
  { value: 'prospect_desc', label: 'Prospect Z-A' },
];

export interface ApprovedQueueParams {
  tab: ApprovedQueueTab;
  /** 1-based. */
  page: number;
  pageSize: number;
  sort: ApprovedQueueSort;
  messageType: string | null;
  /** Exact block reason, e.g. 'campaign_inactive'. */
  reason: string | null;
}

export interface ApprovedQueueCounts {
  /** Everything approved and not yet sent that this viewer may see. */
  approved: number;
  sendable: number;
  /** Follow-ups waiting for their send date. */
  scheduled: number;
  blocked: number;
  /** Held by the generic/freemail rules. Always 0 for a client. */
  policyHeld: number;
  /** Pending drafts this viewer may see (a client's count leaves out drafts held by the send rules). */
  pending: number;
  /** Pending drafts held by the send rules. Always 0 for a client. */
  pendingPolicyHeld: number;
  /** Distinct prospects with a visible pending draft that is still in play: the Dashboard's "awaiting approval". */
  awaitingProspects: number;
  /** campaign id -> distinct prospects with a visible pending draft. A missing key means 0. */
  awaitingProspectsByCampaign: Record<string, number>;
}

export interface ClientApprovalStats {
  pending: number;
  approvedToday: number;
  sentToday: number;
  /** Rejected today by a signed-in user (system rejections are not counted). */
  rejectedToday: number;
  rejectedTotal: number;
}

export interface ApprovedQueue {
  /** One page of the selected tab. */
  items: ClientMessageItem[];
  /** Rows matching the selected tab and filters, across all pages. */
  total: number;
  counts: ApprovedQueueCounts;
  stats: ClientApprovalStats;
  isAdmin: boolean;
  timeZone: string;
}

export const EMPTY_STATS: ClientApprovalStats = {
  pending: 0, approvedToday: 0, sentToday: 0, rejectedToday: 0, rejectedTotal: 0,
};

export const EMPTY_COUNTS: ApprovedQueueCounts = {
  approved: 0, sendable: 0, scheduled: 0, blocked: 0, policyHeld: 0,
  pending: 0, pendingPolicyHeld: 0, awaitingProspects: 0, awaitingProspectsByCampaign: {},
};

// Counts and stats only: one row is enough, the RPC returns them with every page.
const COUNTS_ONLY: ApprovedQueueParams = {
  tab: 'approved', page: 1, pageSize: 1, sort: 'approved_desc', messageType: null, reason: null,
};
const PENDING_COUNT_ONLY: ApprovedQueueParams = { ...COUNTS_ONLY, tab: 'pending' };
// The Pending list is loaded whole (sorting by scheduled send and pending since needs the schedule,
// which only the browser has) in pages of the RPC's maximum size, oldest first as the server orders it.
const PENDING_PAGE_SIZE = 200;

interface RawApprovedQueue {
  ok?: boolean;
  error?: string;
  is_admin?: boolean;
  time_zone?: string;
  total?: number;
  counts?: Record<string, number> & { awaiting_prospects_by_campaign?: unknown };
  stats?: Record<string, number>;
  rows?: Record<string, unknown>[];
}

function toCountMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number') out[k] = n;
  }
  return out;
}

/** Maps the RPC body straight to the UI shape. No arithmetic: the server already did it. */
export function parseApprovedQueue(body: RawApprovedQueue | null): ApprovedQueue {
  if (!body || body.ok === false) throw new Error(body?.error ?? 'not_permitted');
  const c = body.counts ?? {};
  const s = body.stats ?? {};
  return {
    items: normalizeRows(body.rows),
    total: body.total ?? 0,
    counts: {
      approved: c.approved ?? 0,
      sendable: c.sendable ?? 0,
      scheduled: c.scheduled ?? 0,
      blocked: c.blocked ?? 0,
      policyHeld: c.policy_held ?? 0,
      pending: c.pending ?? 0,
      pendingPolicyHeld: c.pending_policy_held ?? 0,
      awaitingProspects: c.awaiting_prospects ?? 0,
      awaitingProspectsByCampaign: toCountMap(c.awaiting_prospects_by_campaign),
    },
    stats: {
      pending: s.pending ?? 0,
      approvedToday: s.approved_today ?? 0,
      sentToday: s.sent_today ?? 0,
      rejectedToday: s.rejected_today ?? 0,
      rejectedTotal: s.rejected_total ?? 0,
    },
    isAdmin: body.is_admin ?? false,
    timeZone: body.time_zone ?? browserTimeZone(),
  };
}

export async function fetchApprovedQueue(clientId: string, client: SupabaseClient, p: ApprovedQueueParams): Promise<ApprovedQueue> {
  const { data, error } = await client.rpc('approved_queue', {
    p_client_id: clientId,
    p_tab: p.tab,
    p_reason: p.reason,
    p_message_type: p.messageType,
    p_sort: p.sort,
    p_limit: p.pageSize,
    p_offset: (Math.max(1, p.page) - 1) * p.pageSize,
  });
  if (error) throw new Error(error.message);
  return parseApprovedQueue(data as RawApprovedQueue | null);
}

function normalizeRows(data: unknown): ClientMessageItem[] {
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...row,
    prospect: Array.isArray(row.prospect) ? row.prospect[0] ?? null : row.prospect ?? null,
  })) as ClientMessageItem[];
}

// Pages through approved_queue's pending tab. The server hides drafts held by the send rules from a
// client and orders by created_at then id, so page boundaries are stable. Callers compare the list
// length with stats.pending (an exact count) to tell whether it is the whole queue.
async function fetchPendingMessages(clientId: string, client: SupabaseClient): Promise<ClientMessageItem[]> {
  const rows: ClientMessageItem[] = [];
  for (let page = 1; rows.length < MAX_LOADED_ROWS; page++) {
    const q = await fetchApprovedQueue(clientId, client, { ...PENDING_COUNT_ONLY, page, pageSize: PENDING_PAGE_SIZE });
    rows.push(...q.items);
    if (q.items.length < PENDING_PAGE_SIZE || rows.length >= q.total) break;
  }
  return rows;
}

/**
 * Counts and stats without any list: one approved_queue call with a page size of 1 (the RPC's
 * minimum), so at most a single row comes back and it is ignored. It shares its cache entry with
 * useClientApprovals' counts-only call, so every screen reads the same numbers from one fetch.
 */
export function useApprovedQueueCounts(clientId: string, client: SupabaseClient = supabase) {
  const { data } = useQuery({
    queryKey: [...clientApprovedKey(clientId), COUNTS_ONLY],
    queryFn: () => fetchApprovedQueue(clientId, client, COUNTS_ONLY),
    enabled: !!clientId && clientId !== '__preview__',
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
  return {
    counts: data?.counts ?? EMPTY_COUNTS,
    stats: data?.stats ?? EMPTY_STATS,
    awaitingProspects: data?.counts.awaitingProspects ?? 0,
  };
}

/** Distinct prospects with a visible pending draft in one campaign; a campaign absent from the map has none. */
export function awaitingInCampaign(counts: Pick<ApprovedQueueCounts, 'awaitingProspectsByCampaign'>, campaignId: string): number {
  return counts.awaitingProspectsByCampaign[campaignId] ?? 0;
}

/**
 * `queue` selects the Approved/Blocked page to load; pass null while another tab is open
 * (counts and stats still load, with a single row).
 */
export function useClientApprovals(clientId: string, client: SupabaseClient = supabase, queue: ApprovedQueueParams | null = null) {
  const { profile } = useAuth();
  const { profile: clientProfile } = useClientProfile(clientId);

  const isPreview = clientId === '__preview__';
  const queueParams = queue ?? COUNTS_ONLY;

  const {
    data: items = [],
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
    data: approvedQueue = null,
    isFetching: queueFetching,
    error: queueError,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: [...clientApprovedKey(clientId), queueParams],
    queryFn: () => fetchApprovedQueue(clientId, client, queueParams),
    enabled: !!clientId && !isPreview,
    staleTime: 30 * 1000,
    // Keep the old counts on screen while the next tab or page loads.
    placeholderData: keepPreviousData,
  });

  const awaitingProspects = approvedQueue?.counts.awaitingProspects ?? 0;

  // The day boundary behind the stat tiles is computed server-side in the client's
  // send_timezone; this is only for formatting dates before the first response.
  const timeZone = approvedQueue?.timeZone ?? clientProfile?.send_timezone ?? browserTimeZone();

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
    stats: approvedQueue?.stats ?? EMPTY_STATS,
    awaitingProspects,
    /** null until the first response. */
    approvedQueue,
    timeZone,
    loading: itemsLoading,
    isFetching: itemsFetching || queueFetching,
    dataUpdatedAt,
    error: ((error ?? queueError) as Error | null)?.message ?? null,

    approve,
    saveEdits,
    reject,
    bulkApprove,
    bulkReject,

    reload: async () => {
      const [itemsRes, queueRes] = await Promise.all([refetchItems(), refetchQueue()]);
      queryClient.invalidateQueries({ queryKey: approvalsScheduleKey(clientId) });
      queryClient.invalidateQueries({ queryKey: clientPendingCountKey(clientId) });
      queryClient.invalidateQueries({ queryKey: sendPacingKey(clientId) });
      if (itemsRes.error) throw itemsRes.error;
      if (queueRes.error) throw queueRes.error;
    },
  };
}
