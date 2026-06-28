import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

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

async function fetchBilling(clientId: string): Promise<BillingData> {
  const [billingRes, paymentsRes, ledgerRes] = await Promise.all([
    supabase.from('billing_profiles').select('credits_remaining, sms_credits_remaining').eq('client_id', clientId).single(),
    supabase.from('payments').select('id, amount_cents, currency, credits_purchased, status, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('credit_transactions').select('id, amount, type, description, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(50),
  ]);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  return {
    credits:    billingRes.data?.credits_remaining     ?? 0,
    smsCredits: billingRes.data?.sms_credits_remaining ?? 0,
    payments:   (paymentsRes.data ?? []) as PaymentRow[],
    ledger:     (ledgerRes.data ?? [])   as LedgerRow[],
  };
}

export function useBilling(clientId: string) {
  const { data, isLoading: loading, error } = useQuery({
    queryKey: billingKey(clientId),
    queryFn: () => fetchBilling(clientId),
    enabled: !!clientId,
    staleTime: 3 * 60 * 1000,
  });

  return {
    data:   data ?? null,
    loading,
    error:  (error as Error)?.message ?? null,
    reload: () => queryClient.invalidateQueries({ queryKey: billingKey(clientId) }),
  };
}
