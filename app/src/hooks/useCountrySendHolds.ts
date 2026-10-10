import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { CountryHold } from '../lib/countries';

export const countrySendHoldsKey = ['country-send-holds'] as const;

// Active holds only (cleared = false) - campaigns for these countries will not
// send. Read with the signed-in client's own session; this relies on RLS
// allowing authenticated SELECT on country_send_holds. If it does not, the
// query succeeds with zero rows, so a hold would never be shown.
export function useCountrySendHolds(client: SupabaseClient = supabase) {
  const { data: holds = [] } = useQuery({
    queryKey: countrySendHoldsKey,
    queryFn: async (): Promise<CountryHold[]> => {
      const { data, error } = await client
        .from('country_send_holds')
        .select('country, reason')
        .eq('cleared', false);
      if (error) throw new Error(error.message);
      return (data ?? []) as CountryHold[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return { holds };
}
