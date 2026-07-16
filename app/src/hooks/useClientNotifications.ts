import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export interface ClientNotification {
  id: string;
  body: string;
  channel: string;
  created_at: string;
  read_at: string | null;
}

export const clientNotificationsKey = (clientId: string) => ['client-notifications', clientId] as const;

async function fetchNotifications(clientId: string): Promise<ClientNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, body, channel, created_at, read_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function useClientNotifications(clientId: string) {
  const { data: notifications = [], isLoading: loading, error } = useQuery({
    queryKey: clientNotificationsKey(clientId),
    queryFn: () => fetchNotifications(clientId),
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAsRead = useCallback(async (id: string) => {
    queryClient.setQueryData<ClientNotification[]>(clientNotificationsKey(clientId), (prev = []) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n))
    );
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (error) queryClient.invalidateQueries({ queryKey: clientNotificationsKey(clientId) });
  }, [clientId]);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    queryClient.setQueryData<ClientNotification[]>(clientNotificationsKey(clientId), (prev = []) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
    );
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
    if (error) queryClient.invalidateQueries({ queryKey: clientNotificationsKey(clientId) });
  }, [clientId, notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error: (error as Error)?.message ?? null,
    markAsRead,
    markAllAsRead,
  };
}
