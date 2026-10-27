import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toScheduleMap, type ScheduleRow } from '../lib/approvalsView';

export const approvalsScheduleKey = (clientId: string) => ['approvals-schedule', clientId] as const;

export async function fetchApprovalsSchedule(clientId: string, client: SupabaseClient = supabase): Promise<ScheduleRow[]> {
  const { data, error } = await client.rpc('approvals_schedule', { p_client_id: clientId });
  if (error) throw new Error(error.message);
  // Tolerate both a bare row array and an { ok, rows } envelope.
  const body = data as ScheduleRow[] | { ok?: boolean; error?: string; rows?: ScheduleRow[] } | null;
  if (Array.isArray(body)) return body;
  if (body && body.ok === false) throw new Error(body.error ?? 'not_permitted');
  return body?.rows ?? [];
}

/** Per-message send estimate and pending-since, joined to drafts by message_id. */
export function useApprovalsSchedule(clientId: string | null, client: SupabaseClient = supabase) {
  const enabled = !!clientId && clientId !== '__preview__';
  const { data, isFetching, isSuccess, error } = useQuery({
    queryKey: approvalsScheduleKey(clientId ?? ''),
    queryFn: () => fetchApprovalsSchedule(clientId as string, client),
    enabled,
    staleTime: 30 * 1000,
  });
  const schedule = useMemo(() => toScheduleMap(data ?? []), [data]);
  const errorMessage = (error as Error | null)?.message ?? null;
  // Has loaded and the last fetch did not fail. A background refetch keeps the previous
  // rows (so lists don't flash back to loading), but a failed one flips this to false.
  // Callers that hide held rows must wait for this.
  const scheduleReady = isSuccess && !errorMessage;
  return { schedule, isFetching, error: errorMessage, scheduleReady };
}
