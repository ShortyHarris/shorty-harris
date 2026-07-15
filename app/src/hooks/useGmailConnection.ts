import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export type GmailStatus = 'active' | 'revoked' | 'error' | 'pending';

export interface GmailConnection {
  connected: boolean;
  email: string | null;
  status: GmailStatus | null;
  error_message: string | null;
  last_used: string | null;
}

export const gmailConnectionKey = (clientId: string) => ['gmail-connection', clientId] as const;

const EMPTY_CONNECTION: GmailConnection = {
  connected: false, email: null, status: null, error_message: null, last_used: null,
};

async function fetchGmailConnection(clientId: string): Promise<GmailConnection> {
  const { data, error } = await supabase.functions.invoke('gmail-client', {
    body: { action: 'get_status', client_id: clientId },
  });
  if (error) throw new Error(error.message);

  return {
    connected: !!data?.connected,
    email: data?.email ?? null,
    status: data?.status ?? null,
    error_message: data?.error_message ?? null,
    last_used: data?.last_used ?? null,
  };
}

export function gmailConnectUrl(clientId: string): string {
  return `https://lxoeotyibsalbxgbjfxo.supabase.co/functions/v1/google-oauth-callback?initiate=true&client_id=${clientId}`;
}

export function useGmailConnection(clientId: string) {
  const {
    data: connection = EMPTY_CONNECTION,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: gmailConnectionKey(clientId),
    queryFn: () => fetchGmailConnection(clientId),
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });

  const disconnect = useCallback(async () => {
    queryClient.setQueryData<GmailConnection>(gmailConnectionKey(clientId), (prev) => ({
      ...(prev ?? EMPTY_CONNECTION),
      connected: false,
      status: 'revoked',
    }));

    const { error } = await supabase
      .from('client_email_credentials')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('client_id', clientId);

    if (error) queryClient.invalidateQueries({ queryKey: gmailConnectionKey(clientId) });
    return { error: error?.message ?? null };
  }, [clientId]);

  return {
    connection,
    loading,
    error: (error as Error)?.message ?? null,
    disconnect,
    connectUrl: gmailConnectUrl(clientId),
    reload: () => queryClient.invalidateQueries({ queryKey: gmailConnectionKey(clientId) }),
  };
}
