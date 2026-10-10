import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { clientApprovalsKey, clientApprovalsStatsKey, clientAwaitingProspectsKey } from './useClientApprovals';
import { dashboardKey } from './useClientDashboard';
import { clientHeaderKey } from './useClientHeader';
import { billingKey } from './useBilling';
import { clientNotificationsKey } from './useClientNotifications';
import { myCampaignsKey } from './useClientCampaigns';

/**
 * Sets up the single Supabase Realtime subscription for everything the
 * client zone needs live - own messages, hot leads, and credit balance. Call
 * this once, at the top of the client zone (mirrors useRealtimeSync() in
 * AdminLayout) - a second per-hook channel subscription with the same fixed
 * name breaks the moment it's mounted more than once at a time (e.g. the
 * sidebar badge + the page itself), which is why hot_leads/billing_profiles
 * are handled centrally here rather than inside useClientDashboard /
 * useClientHeader - those hooks are called from multiple places at once
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
          queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
        }
      )
      // New hot leads routed in, or a status change - updates the Hot Leads
      // page and its nav badge no matter which page is currently open.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hot_leads', filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
        }
      )
      // Campaign rows change the moment a scrape finishes - in particular
      // prospect_count gets updated by the DB trigger on `prospects` the
      // instant new prospects are inserted. Without this, the client's
      // campaign list only picked that up on its own 60s staleTime, which is
      // what let it show a stale, lower prospect count than the admin side
      // right after a scrape completed.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaigns', filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: myCampaignsKey(clientId) });
        }
      )
      // Credits changing (spent on a confirmed hot lead, or purchased) -
      // updates the sidebar/topbar balance and the Billing page live.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_profiles', filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: clientHeaderKey(clientId) });
          queryClient.invalidateQueries({ queryKey: billingKey(clientId) });
        }
      )
      // New notifications (or read-state changes from another tab) -
      // updates the notification bell badge/list live.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: clientNotificationsKey(clientId) });
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Surfaces silent realtime failures (e.g. a table missing from the
          // supabase_realtime publication) instead of just "reload fixes it".
          console.error('[client-realtime-sync] subscription failed:', status, err);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);
}
