import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export interface ClientHeader {
  businessName: string;
  credits: number;
}

export const clientHeaderKey = (clientId: string) => ['client-header', clientId] as const;

async function fetchClientHeader(clientId: string): Promise<ClientHeader> {
  const [clientRes, billingRes] = await Promise.all([
    supabase.from('clients').select('business_name').eq('id', clientId).single(),
    supabase.from('billing_profiles').select('credits_remaining').eq('client_id', clientId).single(),
  ]);
  return {
    businessName: clientRes.data?.business_name ?? 'Account',
    credits: billingRes.data?.credits_remaining ?? 0,
  };
}

export function useClientHeader(clientId: string) {
  const { data } = useQuery({
    queryKey: clientHeaderKey(clientId),
    queryFn: () => fetchClientHeader(clientId),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
    placeholderData: { businessName: '…', credits: 0 },
  });

  return {
    businessName: data?.businessName ?? '…',
    credits: data?.credits ?? 0,
    reloadHeader: () => queryClient.invalidateQueries({ queryKey: clientHeaderKey(clientId) }),
  };
}
