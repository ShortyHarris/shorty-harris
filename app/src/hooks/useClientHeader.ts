import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export interface ClientHeader {
  businessName: string;
  credits: number;
  isSandbox: boolean;
  /** Campaign Wizard pilot switch (clients.wizard_enabled, set by an admin). */
  wizardEnabled: boolean;
}

export const clientHeaderKey = (clientId: string) => ['client-header', clientId] as const;

async function fetchClientHeader(clientId: string, client: SupabaseClient): Promise<ClientHeader> {
  const [clientRes, billingRes] = await Promise.all([
    client.from('clients').select('business_name, is_sandbox, wizard_enabled').eq('id', clientId).single(),
    client.from('billing_profiles').select('credits_remaining').eq('client_id', clientId).single(),
  ]);
  return {
    businessName: clientRes.data?.business_name ?? 'Account',
    credits: billingRes.data?.credits_remaining ?? 0,
    isSandbox: clientRes.data?.is_sandbox === true,
    wizardEnabled: clientRes.data?.wizard_enabled === true,
  };
}

export function useClientHeader(clientId: string, client: SupabaseClient = supabase) {
  const { data } = useQuery({
    queryKey: clientHeaderKey(clientId),
    queryFn: () => fetchClientHeader(clientId, client),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
    placeholderData: { businessName: '…', credits: 0, isSandbox: false, wizardEnabled: false },
  });

  return {
    businessName: data?.businessName ?? '…',
    credits: data?.credits ?? 0,
    isSandbox: data?.isSandbox ?? false,
    wizardEnabled: data?.wizardEnabled ?? false,
    reloadHeader: () => queryClient.invalidateQueries({ queryKey: clientHeaderKey(clientId) }),
  };
}
