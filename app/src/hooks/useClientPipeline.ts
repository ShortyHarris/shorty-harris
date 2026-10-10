import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import type { SequenceStatus } from '../lib/pipelineStatus';

export interface PipelineRow {
  prospect_id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  location: string | null;
  campaign: string | null;
  pipeline_status: string;
  // Absent until the sequence-status migration is applied; null = show pipeline_status.
  sequence_status?: SequenceStatus | null;
  call_outcome: string | null;
  call_outcome_at: string | null;
  client_note: string | null;
  emails_sent: number;
  last_sent_at: string | null;
  awaiting_approval: number;
  opened: number;
  replies: number;
  last_reply_at: string | null;
  hot_lead_id: string | null;
  hot_lead_status: string | null;
  suppressed: boolean;
}

export interface ClientPipelineResult {
  total: number;
  limit: number;
  offset: number;
  counts_by_status: Record<string, number>;
  counts_by_sequence_status: Partial<Record<SequenceStatus, number>>;
  rows: PipelineRow[];
}

const EMPTY_RESULT: ClientPipelineResult = {
  total: 0, limit: 50, offset: 0, counts_by_status: {}, counts_by_sequence_status: {}, rows: [],
};

export const PIPELINE_PAGE_SIZE = 50;

export function useClientPipeline(
  clientId: string,
  params: { status: string | null; search: string; offset: number },
  client: SupabaseClient = supabase,
) {
  const { status, search, offset } = params;
  const { data, isLoading: loading, isFetching, error, refetch } = useQuery({
    queryKey: ['client-pipeline', clientId, status, search, offset] as const,
    queryFn: async () => {
      const { data, error } = await client.rpc('client_pipeline', {
        p_client_id: clientId,
        p_status: status,
        p_search: search || null,
        p_limit: PIPELINE_PAGE_SIZE,
        p_offset: offset,
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string } & Partial<ClientPipelineResult>;
      if (!result?.ok) throw new Error(result?.error ?? 'not_permitted');
      return {
        total: result.total ?? 0,
        limit: result.limit ?? PIPELINE_PAGE_SIZE,
        offset: result.offset ?? 0,
        counts_by_status: result.counts_by_status ?? {},
        counts_by_sequence_status: result.counts_by_sequence_status ?? {},
        rows: result.rows ?? [],
      } as ClientPipelineResult;
    },
    enabled: !!clientId,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    result: data ?? EMPTY_RESULT,
    loading,
    isFetching,
    error: (error as Error)?.message ?? null,
    reload: async () => { await refetch(); },
  };
}

export async function setProspectNote(
  prospectId: string, note: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('set_prospect_note', { p_prospect_id: prospectId, p_note: note });
  if (error) return { error: error.message };
  const result = data as { ok: boolean; error?: string } | null;
  if (result && result.ok === false) return { error: result.error ?? 'Could not save note.' };
  queryClient.invalidateQueries({ queryKey: ['client-pipeline'] });
  return { error: null };
}

// ─── Sequence preview (18D) ────────────────────────────────────────────────
export type SequenceStepState =
  | 'sent' | 'ready' | 'awaiting_approval' | 'rejected' | 'scheduled'
  | 'not_written' | 'cancelled' | 'stopped_hot_lead' | 'stopped_unsubscribed' | 'failed';

export interface SequenceStep {
  step: string;
  message_type: string;
  day: number;
  state: SequenceStepState;
  message_id: string | null;
  approval_status: string | null;
  send_status: string | null;
  scheduled_for: string | null;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  due_at: string | null;
  opened: number;
  last_opened_at: string | null;
}

export interface SequenceReply {
  // Present once the uncertain_reply_hold SQL is applied.
  id?: string;
  received_at: string;
  intent: string | null;
  body: string;
}

export type StoppedBecause = 'they_replied_with_interest' | 'unsubscribed_or_bounced' | null;

export interface ProspectSequence {
  prospect: { prospect_id: string; business_name: string; email: string | null; pipeline_status: string };
  sequence_status?: SequenceStatus | null;
  stopped_because: StoppedBecause;
  replies: SequenceReply[];
  steps: SequenceStep[];
}

export function useProspectSequence(prospectId: string | null, client: SupabaseClient = supabase) {
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['prospect-sequence', prospectId] as const,
    queryFn: async () => {
      const { data, error } = await client.rpc('prospect_sequence', { p_prospect_id: prospectId });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string } & Partial<ProspectSequence>;
      if (!result?.ok) throw new Error(result?.error ?? 'not_permitted');
      return result as ProspectSequence;
    },
    enabled: !!prospectId,
    staleTime: 30 * 1000,
  });

  // prospect_sequence doesn't report the pause flag, so read it directly.
  const { data: paused = false } = useQuery({
    queryKey: ['prospect-sequence-paused', prospectId] as const,
    queryFn: async () => {
      const { data, error } = await client
        .from('prospects').select('sequence_paused').eq('id', prospectId).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data?.sequence_paused);
    },
    enabled: !!prospectId,
    staleTime: 30 * 1000,
  });

  return {
    sequence: data ?? null,
    paused,
    loading,
    error: (error as Error)?.message ?? null,
  };
}
