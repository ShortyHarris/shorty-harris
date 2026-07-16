import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { clientApprovalsKey, clientApprovalsStatsKey } from './useClientApprovals';
import { dashboardKey } from './useClientDashboard';
import { clientHeaderKey } from './useClientHeader';
import { billingKey } from './useBilling';
import { clientNotificationsKey } from './useClientNotifications';

/**
 * Sets up the single Supabase Realtime subscription for everything the
 * client zone needs live — own messages, hot leads, and credit balance. Call
 * this once, at the top of the client zone (mirrors useRealtimeSync() in
 * AdminLayout) — a second per-hook channel subscription with the same fixed
 * name breaks the moment it's mounted more than once at a time (e.g. the
 * sidebar badge + the page itself), which is why hot_leads/billing_profiles
 * are handled centrally here rather than inside useClientDashboard /
 * useClientHeader — those hooks are called from multiple places at once
 * (nav badges, header, the page itself) and a per-hook channel would crash
 * the moment two of those mount at the same time.
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
      // New hot leads routed in, or a status change — updates the Hot Leads
      // page and its nav badge no matter which page is currently open.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hot_leads', filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
        }
      )
      // Credits changing (spent on a confirmed hot lead, or purchased) —
      // updates the sidebar/topbar balance and the Billing page live.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_profiles', filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: clientHeaderKey(clientId) });
          queryClient.invalidateQueries({ queryKey: billingKey(clientId) });
        }
      )
      // New notifications (or read-state changes from another tab) —
      // updates the notification bell badge/list live.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: clientNotificationsKey(clientId) });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);
}
