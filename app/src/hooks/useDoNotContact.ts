import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface OptOutStats {
  total_optouts: number;
  optouts_last_7_days: number;
  optouts_last_30_days: number;
  stop_replies: number;
  not_interested_replies: number;
}

async function fetchOptOutStats(): Promise<OptOutStats> {
  const { data, error } = await supabase.from('optout_stats').select('*').single();
  if (error) throw new Error(error.message);
  return data as OptOutStats;
}

export function useDoNotContact() {
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['dnc-stats'],
    queryFn: fetchOptOutStats,
    staleTime: 60 * 1000,
  });

  return {
    stats: data ?? null,
    loading,
    error: (error as Error)?.message ?? null,
  };
}
