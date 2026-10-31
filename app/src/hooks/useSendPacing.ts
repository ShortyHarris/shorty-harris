import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { parseSendPacing, type SendPacing } from '../lib/sendPacing';

// The one query key every Sending surface shares (dashboard card, approvals line, admin section), so
// one refetch after an approve or reject updates all of them.
export const sendPacingKey = (clientId: string) => ['send-pacing', clientId] as const;

/** Calls send_pacing and rejects when the server refuses, so a refusal is never rendered as data. */
export async function fetchSendPacing(clientId: string, client: SupabaseClient = supabase): Promise<SendPacing> {
  const { data, error } = await client.rpc('send_pacing', { p_client_id: clientId });
  if (error) throw new Error(error.message);
  return parseSendPacing(data);
}

export function useSendPacing(clientId: string | null, client: SupabaseClient = supabase) {
  const enabled = !!clientId && clientId !== '__preview__';
  const { data, isLoading, error } = useQuery({
    queryKey: sendPacingKey(clientId ?? ''),
    queryFn: () => fetchSendPacing(clientId as string, client),
    enabled,
    staleTime: 30 * 1000,
  });
  return { pacing: data ?? null, loading: enabled && isLoading, error: (error as Error | null)?.message ?? null };
}
