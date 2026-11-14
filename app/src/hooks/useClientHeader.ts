import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { fetchWizardOn } from './useWizardRollout';

export interface ClientHeader {
  businessName: string;
  credits: number;
  isSandbox: boolean;
  /** Campaign wizard, as decided by wizard_on_for(): the sandbox-only rollout switch plus the
   *  per-client off-switch. */
  wizardEnabled: boolean;
}

export const clientHeaderKey = (clientId: string) => ['client-header', clientId] as const;

async function fetchClientHeader(clientId: string, client: SupabaseClient): Promise<ClientHeader> {
  const [clientRes, billingRes, wizardOn] = await Promise.all([
    client.from('clients').select('business_name, is_sandbox').eq('id', clientId).single(),
    client.from('billing_profiles').select('credits_remaining').eq('client_id', clientId).single(),
    fetchWizardOn(clientId, client),
  ]);
  return {
    businessName: clientRes.data?.business_name ?? 'Account',
    credits: billingRes.data?.credits_remaining ?? 0,
    isSandbox: clientRes.data?.is_sandbox === true,
    wizardEnabled: wizardOn,
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
