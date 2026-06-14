import { useCallback, useEffect, useState } from 'react';
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

export function useBilling(clientId: string) {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [billingRes, paymentsRes, ledgerRes] = await Promise.all([
      supabase.from('billing_profiles').select('credits_remaining, sms_credits_remaining').eq('client_id', clientId).single(),
      supabase.from('payments').select('id, amount_cents, currency, credits_purchased, status, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('credit_transactions').select('id, amount, type, description, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(50),
    ]);

    if (paymentsRes.error) { setError(paymentsRes.error.message); setLoading(false); return; }

    setData({
      credits: billingRes.data?.credits_remaining ?? 0,
      smsCredits: billingRes.data?.sms_credits_remaining ?? 0,
      payments: (paymentsRes.data ?? []) as PaymentRow[],
      ledger: (ledgerRes.data ?? []) as LedgerRow[],
    });
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
