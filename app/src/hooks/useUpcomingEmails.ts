import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { approvalsScheduleKey, fetchApprovalsSchedule } from './useApprovalsSchedule';
import { summarizeUpcoming, type UpcomingSummary } from '../lib/upcomingEmails';

export const FAILED_WINDOW_DAYS = 7;

/**
 * Upcoming-email summary for the client dashboard, from the same approvals_schedule
 * RPC (and cache key) as the Approvals page, plus failed sends in the last week.
 */
export function useUpcomingEmails(
  clientId: string, timeZone: string, client: SupabaseClient = supabase,
): { summary: UpcomingSummary | null; failed: number } {
  const enabled = !!clientId && clientId !== '__preview__';
  const { data: rows } = useQuery({
    queryKey: approvalsScheduleKey(clientId),
    queryFn: () => fetchApprovalsSchedule(clientId, client),
    enabled,
    staleTime: 30 * 1000,
  });
  const { data: failed = 0 } = useQuery({
    queryKey: ['failed-sends', clientId] as const,
    queryFn: async () => {
      const since = new Date(Date.now() - FAILED_WINDOW_DAYS * 86400000).toISOString();
      const { count, error } = await client.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).eq('send_status', 'failed').gte('updated_at', since);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled,
    staleTime: 60 * 1000,
  });
  const summary = useMemo(() => (rows ? summarizeUpcoming(rows, new Date(), timeZone) : null), [rows, timeZone]);
  return { summary, failed };
}
