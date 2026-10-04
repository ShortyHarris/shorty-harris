import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface PaymentRow {
  id: string;
  amount_cents: number;
  currency: string;
  credits_purchased: number;
  status: string;
  created_at: string;
}

export interface LedgerRow {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

export interface BillingData {
  credits: number;
  smsCredits: number;
  payments: PaymentRow[];
  ledger: LedgerRow[];
}

export const billingKey = (clientId: string) => ['billing', clientId] as const;

async function fetchBilling(clientId: string, client: SupabaseClient): Promise<BillingData> {
  const [billingRes, paymentsRes, ledgerRes] = await Promise.all([
    client.from('billing_profiles').select('credits_remaining, sms_credits_remaining').eq('client_id', clientId).single(),
    client.from('payments').select('id, amount_cents, currency, credits_purchased, status, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
    client.from('credit_transactions').select('id, amount, type, description, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(50),
  ]);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  return {
    credits:    billingRes.data?.credits_remaining     ?? 0,
    smsCredits: billingRes.data?.sms_credits_remaining ?? 0,
    payments:   (paymentsRes.data ?? []) as PaymentRow[],
    ledger:     (ledgerRes.data ?? [])   as LedgerRow[],
  };
}

export function useBilling(clientId: string, client: SupabaseClient = supabase) {
  const { data, isLoading: loading, isFetching, dataUpdatedAt, error, refetch } = useQuery({
    queryKey: billingKey(clientId),
    queryFn: () => fetchBilling(clientId, client),
    enabled: !!clientId,
    staleTime: 3 * 60 * 1000,
  });

  return {
    data:   data ?? null,
    loading,
    isFetching,
    dataUpdatedAt,
    error:  (error as Error)?.message ?? null,
    reload: async () => {
      const res = await refetch();
      if (res.error) throw res.error;
    },
  };
}
