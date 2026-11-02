import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Every count is per business (prospect), the same unit as the Results flow, computed by
// the client_analytics RPC so nothing is lost to the API's per-request row cap.
export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  emailed: number;
  emailsSent: number;
  opened: number;
  openRate: number;
  replied: number;
  replyRate: number;
  bounced: number;
  bounceRate: number;
  optOuts: number;
  optOutRate: number;
}

export interface AnalyticsTrendPoint {
  weekLabel: string;
  weekStart: string;
  sent: number;
  opened: number;
  replied: number;
}

interface RawCounts {
  emailed: number; emails_sent: number; opened: number; replied: number; bounced: number; opt_outs: number;
}
interface RawCampaign extends RawCounts { campaign_id: string; campaign_name: string }
interface RawActivity { week_start: string; campaign_id: string; kind: 'sent' | 'opened' | 'replied'; n: number }

export interface ClientAnalytics {
  overall: CampaignAnalytics;
  byCampaign: CampaignAnalytics[];
  weeks: string[];
  activity: RawActivity[];
}

// One decimal, matching the Results page ("2.3% of emailed").
function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function toAnalytics(id: string, name: string, c: RawCounts): CampaignAnalytics {
  return {
    campaign_id: id,
    campaign_name: name,
    emailed: c.emailed,
    emailsSent: c.emails_sent,
    opened: c.opened,
    openRate: pct(c.opened, c.emailed),
    replied: c.replied,
    replyRate: pct(c.replied, c.emailed),
    bounced: c.bounced,
    bounceRate: pct(c.bounced, c.emailed),
    optOuts: c.opt_outs,
    optOutRate: pct(c.opt_outs, c.emailed),
  };
}

function weekLabel(weekStartIsoDate: string): string {
  const d = new Date(weekStartIsoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Weekly sent/opened/replied for one campaign, or all of them when campaignId is ''. */
export function trendFor(data: Pick<ClientAnalytics, 'weeks' | 'activity'>, campaignId: string): AnalyticsTrendPoint[] {
  return data.weeks.map((wk) => {
    const point: AnalyticsTrendPoint = { weekLabel: weekLabel(wk), weekStart: wk, sent: 0, opened: 0, replied: 0 };
    data.activity.forEach((a) => {
      if (a.week_start === wk && (campaignId === '' || a.campaign_id === campaignId)) point[a.kind] += a.n;
    });
    return point;
  });
}

async function fetchClientAnalytics(clientId: string, client: SupabaseClient): Promise<ClientAnalytics> {
  const { data, error } = await client.rpc('client_analytics', { p_client_id: clientId });
  if (error) throw new Error(error.message);
  const result = data as { ok: boolean; error?: string; overall?: RawCounts; by_campaign?: RawCampaign[]; weeks?: string[]; activity?: RawActivity[] };
  if (!result?.ok) throw new Error(result?.error ?? 'not_permitted');
  const empty: RawCounts = { emailed: 0, emails_sent: 0, opened: 0, replied: 0, bounced: 0, opt_outs: 0 };
  return {
    overall: toAnalytics('', 'All campaigns', result.overall ?? empty),
    byCampaign: (result.by_campaign ?? []).map((c) => toAnalytics(c.campaign_id, c.campaign_name, c)),
    weeks: result.weeks ?? [],
    activity: result.activity ?? [],
  };
}

export const clientAnalyticsKey = (clientId: string) => ['client-analytics', clientId] as const;

const WEEKS_OF_TREND = 8;

function mockAnalytics(): ClientAnalytics {
  const weeks = Array.from({ length: WEEKS_OF_TREND }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 7 + i * 7));
    return d.toISOString().slice(0, 10);
  });
  const sample: RawCounts = { emailed: 240, emails_sent: 300, opened: 96, replied: 18, bounced: 6, opt_outs: 4 };
  return {
    overall: toAnalytics('', 'All campaigns', sample),
    byCampaign: [toAnalytics('mock-1', 'Sample campaign', sample)],
    weeks,
    activity: weeks.flatMap((wk, i) => [
      { week_start: wk, campaign_id: 'mock-1', kind: 'sent' as const, n: 20 + i * 3 },
      { week_start: wk, campaign_id: 'mock-1', kind: 'opened' as const, n: 8 + i * 2 },
      { week_start: wk, campaign_id: 'mock-1', kind: 'replied' as const, n: 2 + i },
    ]),
  };
}

export function useClientAnalytics(clientId: string, client: SupabaseClient = supabase) {
  const isPreview = clientId === '__preview__';

  const { data, isLoading: loading, error } = useQuery({
    queryKey: clientAnalyticsKey(clientId),
    queryFn: () => fetchClientAnalytics(clientId, client),
    enabled: !isPreview,
    staleTime: 5 * 60 * 1000,
    ...(isPreview ? { initialData: mockAnalytics() } : {}),
  });

  const resolved = data ?? (isPreview ? mockAnalytics() : null);
  return {
    data: resolved,
    loading: isPreview ? false : loading,
    error: (error as Error)?.message ?? null,
  };
}
