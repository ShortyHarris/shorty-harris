import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export interface WarmProspect {
  prospect_id: string;
  client_id: string;
  campaign_id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  category: string | null;
  location: string | null;
  total_opens: number;
  last_opened_at: string | null;
  first_sent_at: string | null;
}

function mockWarmProspects(): WarmProspect[] {
  return [
    {
      prospect_id: 'mock-1', client_id: '__preview__', campaign_id: 'mock',
      business_name: 'Riverside Dental', phone: '+13095550101', email: 'info@riverside.example',
      category: 'Dental Clinic', location: 'Bloomington, IL',
      total_opens: 6, last_opened_at: new Date().toISOString(), first_sent_at: new Date().toISOString(),
    },
    {
      prospect_id: 'mock-2', client_id: '__preview__', campaign_id: 'mock',
      business_name: 'Uptown Fitness', phone: '+13095550102', email: 'hello@uptownfitness.example',
      category: 'Gym', location: 'Normal, IL',
      total_opens: 3, last_opened_at: new Date().toISOString(), first_sent_at: new Date().toISOString(),
    },
  ];
}

async function fetchWarmProspects(clientId: string): Promise<WarmProspect[]> {
  const { data, error } = await supabase
    .from('warm_prospects')
    .select('*')
    .eq('client_id', clientId)
    .order('total_opens', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as WarmProspect[];
}

export const warmProspectsKey = (clientId: string) => ['warm-prospects', clientId] as const;

export function useWarmProspects(clientId: string) {
  const isPreview = clientId === '__preview__';

  const { data, isLoading: loading, error } = useQuery({
    queryKey: warmProspectsKey(clientId),
    queryFn: () => fetchWarmProspects(clientId),
    enabled: !isPreview,
    staleTime: 2 * 60 * 1000,
    ...(isPreview ? { initialData: mockWarmProspects() } : {}),
  });

  // Marks a prospect as manually called. This flips pipeline_status to
  // 'called', which a DB trigger (cancel_follow_ups_on_stop) picks up to
  // cancel any pending automated follow-up for them — so the bot doesn't
  // email someone the client just spoke to on the phone.
  const markCalled = useCallback(async (prospectId: string) => {
    queryClient.setQueryData<WarmProspect[]>(warmProspectsKey(clientId), (prev = []) =>
      prev.filter((p) => p.prospect_id !== prospectId)
    );

    const { error: updateError } = await supabase
      .from('prospects')
      .update({ pipeline_status: 'called', updated_at: new Date().toISOString() })
      .eq('id', prospectId);

    if (updateError) {
      queryClient.invalidateQueries({ queryKey: warmProspectsKey(clientId) });
    }
  }, [clientId]);

  return {
    prospects: data ?? (isPreview ? mockWarmProspects() : []),
    loading: isPreview ? false : loading,
    error: (error as Error)?.message ?? null,
    markCalled,
  };
}
