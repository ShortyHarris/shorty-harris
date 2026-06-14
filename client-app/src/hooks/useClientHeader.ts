import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ClientHeader {
  businessName: string;
  credits: number;
}

/**
 * Fetches just the client's business name and credit balance for the top bar.
 * Independent of which screen is showing, so the header is always correct —
 * including when the user lands directly on Billing (e.g. returning from Stripe).
 */
export function useClientHeader(clientId: string) {
  const [data, setData] = useState<ClientHeader>({ businessName: '…', credits: 0 });

  const load = useCallback(async () => {
    if (!clientId) return;
    const [clientRes, billingRes] = await Promise.all([
      supabase.from('clients').select('business_name').eq('id', clientId).single(),
      supabase.from('billing_profiles').select('credits_remaining').eq('client_id', clientId).single(),
    ]);
    setData({
      businessName: clientRes.data?.business_name ?? 'Account',
      credits: billingRes.data?.credits_remaining ?? 0,
    });
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  return { ...data, reloadHeader: load };
}
