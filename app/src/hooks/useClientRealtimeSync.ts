import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { clientApprovalsKey, clientApprovalsStatsKey } from './useClientApprovals';

/**
 * Sets up the single Supabase Realtime subscription for the client dashboard's
 * own messages. Call this once, at the top of the client zone (mirrors
 * useRealtimeSync() in AdminLayout) — a second per-hook channel subscription
 * with the same fixed name breaks the moment it's mounted more than once at a
 * time (e.g. the sidebar badge + the Approvals page itself).
 */
export function useClientRealtimeSync(clientId: string) {
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`client-realtime-sync-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
          queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);
}
