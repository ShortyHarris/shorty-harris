import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type InsightSeverity = 'critical' | 'warning' | 'info';

export type InsightAction =
  | 'review_pending_messages' | 'open_hot_leads' | 'open_blacklist'
  | 'review_targeting' | 'create_campaign' | 'open_icp'
  | 'retry_generation' | 'contact_support' | 'none';

export interface ResultInsight {
  code: string;
  severity: InsightSeverity;
  headline: string;
  detail: string;
  metric: unknown;
  action: InsightAction;
}

export interface ResultFunnel {
  prospects: number;
  with_email: number;
  messages_generated: number;
  awaiting_approval: number;
  rejected: number;
  sent: number;
  blocked: number;
  failed: number;
  bounced: number;
  auto_replies: number;
  human_replies: number;
  positive_replies: number;
  hot_leads: number;
  hot_leads_open: number;
  won: number;
}

export interface ResultCategoryRow {
  category: string;
  emailed: number;
  replied: number;
  positive: number;
  bounced: number;
  positive_rate: number;
  bounce_rate: number;
}

export interface ClientResultInsights {
  funnel: ResultFunnel;
  insights: ResultInsight[];
  by_category: ResultCategoryRow[];
}

const EMPTY_FUNNEL: ResultFunnel = {
  prospects: 0, with_email: 0, messages_generated: 0, awaiting_approval: 0,
  rejected: 0, sent: 0, blocked: 0, failed: 0, bounced: 0, auto_replies: 0,
  human_replies: 0, positive_replies: 0, hot_leads: 0, hot_leads_open: 0, won: 0,
};

export const clientResultInsightsKey = (clientId: string) => ['client-result-insights', clientId] as const;

export function useClientResultInsights(clientId: string, client: SupabaseClient = supabase) {
  const { data, isLoading: loading, isFetching, dataUpdatedAt, error, refetch } = useQuery({
    queryKey: clientResultInsightsKey(clientId),
    queryFn: async () => {
      const { data, error } = await client.rpc('client_result_insights', { p_client_id: clientId });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string } & Partial<ClientResultInsights>;
      if (!result?.ok) throw new Error(result?.error ?? 'not_permitted');
      return {
        funnel: result.funnel ?? EMPTY_FUNNEL,
        insights: result.insights ?? [],
        by_category: result.by_category ?? [],
      } as ClientResultInsights;
    },
    enabled: !!clientId && clientId !== '__preview__',
    staleTime: 2 * 60 * 1000,
  });

  return {
    funnel: data?.funnel ?? EMPTY_FUNNEL,
    insights: data?.insights ?? [],
    byCategory: data?.by_category ?? [],
    loading,
    isFetching,
    dataUpdatedAt,
    error: (error as Error)?.message ?? null,
    reload: async () => { await refetch(); },
  };
}
