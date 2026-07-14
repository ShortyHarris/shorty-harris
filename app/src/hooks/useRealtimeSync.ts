import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { QK } from './useAdminData';
import { AQ_KEYS } from './useApprovalQueue';
import { BLOG_KEYS } from './useBlogPosts';

/**
 * Sets up Supabase Realtime subscriptions for all tables that change via
 * external workflows (n8n). Call this once in the admin layout.
 *
 * When a relevant row changes, the corresponding TanStack Query cache entry
 * is invalidated — components refetch automatically with the fresh data.
 */
export function useRealtimeSync() {
  useEffect(() => {
    const channel = supabase
      .channel('admin-realtime-sync')

      // New hot leads arrive via n8n WF6
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hot_leads' }, () => {
        queryClient.invalidateQueries({ queryKey: QK.adminHotLeads });
      })

      // Messages enter the approval queue via n8n WF2/WF2_5
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        queryClient.invalidateQueries({ queryKey: AQ_KEYS.items });
        queryClient.invalidateQueries({ queryKey: AQ_KEYS.stats });
      })

      // Prospect pipeline_status changes via n8n WF4
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prospects' }, () => {
        queryClient.invalidateQueries({ queryKey: QK.prospects });
      })

      // Error logs written by any workflow
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'error_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['error-logs'] });
      })

      // Blog posts drafted/approved/published via n8n WF12
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blog_posts' }, () => {
        queryClient.invalidateQueries({ queryKey: BLOG_KEYS.pending });
        queryClient.invalidateQueries({ queryKey: BLOG_KEYS.published });
      })

      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);
}
