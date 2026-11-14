import { useCallback } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { invalidateApprovalQueries } from './useClientApprovals';
import type { ClientMessageItem } from '../types';

// ── send_queue RPC ───────────────────────────────────────────────────────────────────────────
// Approved emails that have not gone out yet, with the estimated send time from
// approvals_schedule. clientId null = every client (admins only). Who may see what is decided
// in the database; nothing here filters rows.

export type SendWindow = 'all' | 'today' | 'tomorrow' | 'later' | 'unscheduled';
export type SendQueueSort = 'send_asc' | 'send_desc' | 'approved_desc' | 'prospect_asc';

export const SEND_WINDOWS: { value: SendWindow; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'later', label: 'Later' },
  { value: 'unscheduled', label: 'Not scheduled' },
];

export const SEND_QUEUE_SORTS: { value: SendQueueSort; label: string }[] = [
  { value: 'send_asc', label: 'Sends soonest first' },
  { value: 'send_desc', label: 'Sends latest first' },
  { value: 'approved_desc', label: 'Approved (newest first)' },
  { value: 'prospect_asc', label: 'Prospect A-Z' },
];

export interface SendQueueParams {
  clientId: string | null;
  campaignId: string | null;
  window: SendWindow;
  messageType: string | null;
  sort: SendQueueSort;
  page: number;
  pageSize: number;
}

export interface QueuedMessage extends ClientMessageItem {
  client_id: string;
  client_name: string;
  time_zone: string;
  campaign_name: string | null;
  /** The sender has claimed it and is handing it to Gmail: it can no longer be changed. */
  sending: boolean;
  queue_edited_at: string | null;
  /** sendable | scheduled (waiting for a follow-up date or a send day) | blocked. */
  category: 'sendable' | 'scheduled' | 'blocked';
  /** The next send slot. For an email already due it is the sender's next run, not the past estimate. */
  estimated_send_at: string | null;
  /** Already due: it goes out on the next send run (inside the send window, within the daily cap). */
  due: boolean;
  is_confirmed: boolean;
  basis: string | null;
  send_window: Exclude<SendWindow, 'all'>;
}

export interface SendQueue {
  rows: QueuedMessage[];
  total: number;
  windows: Record<SendWindow, number>;
  campaigns: { id: string; name: string | null; client_id: string; count: number }[];
  clients: { id: string; name: string; count: number }[];
  isAdmin: boolean;
}

export const sendQueueKey = (clientId: string | null) => ['send-queue', clientId ?? 'all'] as const;

export function parseSendQueue(body: Record<string, unknown> | null): SendQueue {
  if (!body || body.ok === false) throw new Error((body?.error as string) ?? 'not_permitted');
  const w = (body.windows ?? {}) as Record<string, number>;
  return {
    rows: ((body.rows ?? []) as QueuedMessage[]),
    total: (body.total as number) ?? 0,
    windows: {
      all: w.all ?? 0, today: w.today ?? 0, tomorrow: w.tomorrow ?? 0, later: w.later ?? 0, unscheduled: w.unscheduled ?? 0,
    },
    campaigns: (body.campaigns ?? []) as SendQueue['campaigns'],
    clients: (body.clients ?? []) as SendQueue['clients'],
    isAdmin: (body.is_admin as boolean) ?? false,
  };
}

export async function fetchSendQueue(client: SupabaseClient, p: SendQueueParams): Promise<SendQueue> {
  const { data, error } = await client.rpc('send_queue', {
    p_client_id: p.clientId,
    p_campaign_id: p.campaignId,
    p_window: p.window,
    p_message_type: p.messageType,
    p_sort: p.sort,
    p_limit: p.pageSize,
    p_offset: (Math.max(1, p.page) - 1) * p.pageSize,
  });
  if (error) throw new Error(error.message);
  return parseSendQueue(data as Record<string, unknown> | null);
}

// Plain words for what the database refused.
const ACTION_ERRORS: Record<string, string> = {
  sending: 'it is being sent right now and can no longer be changed',
  already_sent: 'it has already been sent',
  not_queued: 'it is no longer waiting to send (someone else may have changed it) - the list has been refreshed',
  not_permitted: "you don't have permission to change it",
  not_found: 'it no longer exists',
  empty_body: 'the message body cannot be empty',
  nothing_to_save: 'nothing changed',
  too_many: 'too many at once - select fewer',
};
export function sendQueueErrorText(code: string): string {
  return ACTION_ERRORS[code] ?? code;
}

export interface BulkQueueResult {
  done: number;
  requested: number;
  /** reason code -> count */
  skipped: Record<string, number>;
  error: string | null;
}

/** "2 skipped: 1 already being sent, 1 no longer waiting" or null when nothing was skipped. */
export function skippedLine(skipped: Record<string, number>): string | null {
  const parts = Object.entries(skipped).filter(([, n]) => n > 0).map(([code, n]) => {
    const short: Record<string, string> = {
      sending: 'being sent right now', already_sent: 'already sent', not_queued: 'no longer waiting to send',
      not_permitted: 'not yours to change', not_found: 'no longer exist',
    };
    return `${n} ${short[code] ?? code}`;
  });
  if (parts.length === 0) return null;
  const n = Object.values(skipped).reduce((a, b) => a + b, 0);
  return `${n} skipped: ${parts.join(', ')}`;
}

function refreshAfterChange(clientIds: (string | null | undefined)[]) {
  queryClient.invalidateQueries({ queryKey: ['send-queue'] });
  new Set(clientIds.filter(Boolean) as string[]).forEach((id) => invalidateApprovalQueries(id));
}

export function useSendQueue(params: SendQueueParams, client: SupabaseClient = supabase, enabled = true) {
  const query = useQuery({
    queryKey: [...sendQueueKey(params.clientId), params],
    queryFn: () => fetchSendQueue(client, params),
    enabled: enabled && params.clientId !== '__preview__',
    staleTime: 15 * 1000,
    // The queue drains while people look at it: keep it current.
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Writes use the app's own session (the client's, or the admin's), like approve/reject do.
  // View-as-client is read-only: <SendQueue readOnly> stops every write before it gets here, and
  // the database refuses writes made with an impersonation token.
  const edit = useCallback(async (item: QueuedMessage, subject?: string, body?: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.rpc('edit_queued_message', {
      p_message_id: item.id, p_subject: subject ?? null, p_body: body ?? null,
    });
    refreshAfterChange([item.client_id]);
    if (error) return { error: error.message };
    const res = data as { ok: boolean; error?: string };
    return { error: res.ok ? null : sendQueueErrorText(res.error ?? 'unknown') };
  }, []);

  const runBulk = useCallback(async (fn: 'unapprove_queued_messages' | 'cancel_queued_messages', items: QueuedMessage[]): Promise<BulkQueueResult> => {
    const { data, error } = await supabase.rpc(fn, { p_ids: items.map((i) => i.id) });
    refreshAfterChange(items.map((i) => i.client_id));
    if (error) return { done: 0, requested: items.length, skipped: {}, error: error.message };
    const res = data as { ok: boolean; error?: string; done?: number; requested?: number; skipped?: Record<string, number> };
    if (!res.ok) return { done: 0, requested: items.length, skipped: {}, error: sendQueueErrorText(res.error ?? 'unknown') };
    return { done: res.done ?? 0, requested: res.requested ?? items.length, skipped: res.skipped ?? {}, error: null };
  }, []);

  const unapprove = useCallback((items: QueuedMessage[]) => runBulk('unapprove_queued_messages', items), [runBulk]);
  const cancel = useCallback((items: QueuedMessage[]) => runBulk('cancel_queued_messages', items), [runBulk]);

  return {
    queue: query.data ?? null,
    loading: query.isLoading,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    error: (query.error as Error | null)?.message ?? null,
    reload: query.refetch,
    edit,
    unapprove,
    cancel,
  };
}
