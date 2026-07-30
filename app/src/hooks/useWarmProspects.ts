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

  // Logs how a manual call ended. Every outcome flips pipeline_status to
  // 'called', which a DB trigger (cancel_follow_ups_on_stop) picks up to
  // cancel any pending automated follow-up for them — so the bot doesn't
  // email someone the client just spoke to on the phone, regardless of how
  // the call went.
  const logCallOutcome = useCallback(async (prospectId: string, outcome: CallOutcome) => {
    queryClient.setQueryData<WarmProspect[]>(warmProspectsKey(clientId), (prev = []) =>
      prev.filter((p) => p.prospect_id !== prospectId)
    );

    const { error: updateError } = await supabase
      .from('prospects')
      .update({
        pipeline_status: 'called',
        call_outcome: outcome,
        call_outcome_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospectId);

    if (updateError) {
      queryClient.invalidateQueries({ queryKey: warmProspectsKey(clientId) });
    }
  }, [clientId]);

  return {
    prospects: data ?? (isPreview ? mockWarmProspects() : []),
    loading: isPreview ? false : loading,
    error: (error as Error)?.message ?? null,
    logCallOutcome,
  };
}

export type CallOutcome = 'rejected' | 'call_later' | 'meeting_agreed';

export interface ProspectMessage {
  id: string;
  message_type: string;
  subject: string | null;
  send_status: string;
  sent_at: string | null;
  opened_at: string | null;
  open_count: number;
}

const prospectMessagesKey = (prospectId: string) => ['prospect-messages', prospectId] as const;

function mockProspectMessages(): ProspectMessage[] {
  return [
    { id: 'mock-msg-1', message_type: 'initial', subject: 'Quick question about your business', send_status: 'sent', sent_at: new Date(Date.now() - 12 * 86400000).toISOString(), opened_at: new Date(Date.now() - 11 * 86400000).toISOString(), open_count: 3 },
    { id: 'mock-msg-2', message_type: 'follow_up_d3', subject: 'Following up', send_status: 'sent', sent_at: new Date(Date.now() - 9 * 86400000).toISOString(), opened_at: new Date(Date.now() - 8 * 86400000).toISOString(), open_count: 2 },
    { id: 'mock-msg-3', message_type: 'follow_up_d7', subject: 'One more thing', send_status: 'sent', sent_at: new Date(Date.now() - 5 * 86400000).toISOString(), opened_at: null, open_count: 0 },
  ];
}

// Per-prospect send/open history — "what did they open, and how many times"
// for whoever's about to follow up with a call, so they know what's already
// landed instead of guessing.
export function useProspectMessages(prospectId: string | null) {
  const isPreview = prospectId?.startsWith('mock-') ?? false;

  const { data, isLoading: loading, error } = useQuery({
    queryKey: prospectMessagesKey(prospectId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, message_type, subject, send_status, sent_at, opened_at, open_count')
        .eq('prospect_id', prospectId as string)
        .order('sent_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProspectMessage[];
    },
    enabled: !!prospectId && !isPreview,
    staleTime: 2 * 60 * 1000,
    ...(isPreview ? { initialData: mockProspectMessages() } : {}),
  });

  return {
    messages: data ?? (isPreview ? mockProspectMessages() : []),
    loading: isPreview ? false : loading,
    error: (error as Error)?.message ?? null,
  };
}
