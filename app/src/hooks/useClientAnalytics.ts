import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  sent: number;
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

export interface ClientAnalytics {
  overall: CampaignAnalytics;
  byCampaign: CampaignAnalytics[];
  trend: AnalyticsTrendPoint[];
}

interface MessageRow {
  id: string;
  campaign_id: string;
  sent_at: string | null;
  opened_at: string | null;
  open_count: number | null;
}

interface ReplyRow {
  prospect_id: string;
  intent: string;
  classified_at: string | null;
  prospect: { campaign_id: string } | { campaign_id: string }[] | null;
}

interface DncRow {
  id: string;
  created_at: string;
  prospect: { campaign_id: string } | { campaign_id: string }[] | null;
}

function firstOf<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function weekStartISO(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return start.toISOString().slice(0, 10);
}

function weekLabel(weekStartIsoDate: string): string {
  const d = new Date(weekStartIsoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const WEEKS_OF_TREND = 8;

async function fetchClientAnalytics(clientId: string): Promise<ClientAnalytics> {
  const [campaignsRes, messagesRes, repliesRes, dncRes] = await Promise.all([
    supabase.from('campaigns').select('id, name').eq('client_id', clientId),
    supabase
      .from('messages')
      .select('id, campaign_id, sent_at, opened_at, open_count')
      .eq('client_id', clientId)
      .eq('send_status', 'sent'),
    supabase
      .from('replies')
      .select('prospect_id, intent, classified_at, prospect:prospects ( campaign_id )')
      .eq('client_id', clientId),
    supabase
      .from('do_not_contact')
      .select('id, created_at, prospect:prospects!source_prospect_id ( campaign_id )'),
  ]);

  if (campaignsRes.error) throw new Error(campaignsRes.error.message);
  if (messagesRes.error) throw new Error(messagesRes.error.message);
  if (repliesRes.error) throw new Error(repliesRes.error.message);
  if (dncRes.error) throw new Error(dncRes.error.message);

  const campaignNames = new Map<string, string>();
  (campaignsRes.data ?? []).forEach((c) => campaignNames.set(c.id as string, c.name as string));

  interface Bucket {
    sent: number;
    opened: number;
    repliedProspects: Set<string>;
    bounced: number;
    optOuts: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  function bucketFor(campaignId: string): Bucket {
    let b = buckets.get(campaignId);
    if (!b) {
      b = { sent: 0, opened: 0, repliedProspects: new Set(), bounced: 0, optOuts: new Set() };
      buckets.set(campaignId, b);
    }
    return b;
  }

  const messages = (messagesRes.data ?? []) as unknown as MessageRow[];
  messages.forEach((m) => {
    if (!m.campaign_id) return;
    const b = bucketFor(m.campaign_id);
    b.sent += 1;
    if ((m.open_count ?? 0) > 0) b.opened += 1;
  });

  const replies = (repliesRes.data ?? []) as unknown as ReplyRow[];
  replies.forEach((r) => {
    const prospect = firstOf(r.prospect);
    const campaignId = prospect?.campaign_id;
    if (!campaignId) return;
    const b = bucketFor(campaignId);
    if (r.intent === 'bounced') {
      b.bounced += 1;
    } else if (r.intent !== 'auto_reply') {
      b.repliedProspects.add(r.prospect_id);
    }
  });

  const dnc = (dncRes.data ?? []) as unknown as DncRow[];
  dnc.forEach((d) => {
    const prospect = firstOf(d.prospect);
    const campaignId = prospect?.campaign_id;
    if (!campaignId) return;
    const b = bucketFor(campaignId);
    b.optOuts.add(d.id);
  });

  function toCampaignAnalytics(campaignId: string, name: string, b: Bucket): CampaignAnalytics {
    const replied = b.repliedProspects.size;
    const optOuts = b.optOuts.size;
    return {
      campaign_id: campaignId,
      campaign_name: name,
      sent: b.sent,
      opened: b.opened,
      openRate: pct(b.opened, b.sent),
      replied,
      replyRate: pct(replied, b.sent),
      bounced: b.bounced,
      bounceRate: pct(b.bounced, b.sent),
      optOuts,
      optOutRate: pct(optOuts, b.sent),
    };
  }

  const byCampaign = Array.from(buckets.entries())
    .map(([id, b]) => toCampaignAnalytics(id, campaignNames.get(id) ?? 'Untitled campaign', b))
    .sort((a, b) => b.sent - a.sent);

  const overallBucket: Bucket = { sent: 0, opened: 0, repliedProspects: new Set(), bounced: 0, optOuts: new Set() };
  buckets.forEach((b) => {
    overallBucket.sent += b.sent;
    overallBucket.opened += b.opened;
    overallBucket.bounced += b.bounced;
    b.repliedProspects.forEach((p) => overallBucket.repliedProspects.add(p));
    b.optOuts.forEach((o) => overallBucket.optOuts.add(o));
  });
  const overall = toCampaignAnalytics('', 'All campaigns', overallBucket);

  const trendMap = new Map<string, { sent: number; opened: number; replied: number }>();
  const now = new Date();
  const weekKeys: string[] = [];
  for (let i = WEEKS_OF_TREND - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const key = weekStartISO(d.toISOString());
    weekKeys.push(key);
    trendMap.set(key, { sent: 0, opened: 0, replied: 0 });
  }
  const earliestWeek = weekKeys[0];

  messages.forEach((m) => {
    if (m.sent_at) {
      const wk = weekStartISO(m.sent_at);
      if (wk >= earliestWeek && trendMap.has(wk)) trendMap.get(wk)!.sent += 1;
    }
    if (m.opened_at) {
      const wk = weekStartISO(m.opened_at);
      if (wk >= earliestWeek && trendMap.has(wk)) trendMap.get(wk)!.opened += 1;
    }
  });
  replies.forEach((r) => {
    if (!r.classified_at || r.intent === 'bounced' || r.intent === 'auto_reply') return;
    const wk = weekStartISO(r.classified_at);
    if (wk >= earliestWeek && trendMap.has(wk)) trendMap.get(wk)!.replied += 1;
  });

  const trend: AnalyticsTrendPoint[] = weekKeys.map((wk) => ({
    weekLabel: weekLabel(wk),
    weekStart: wk,
    ...trendMap.get(wk)!,
  }));

  return { overall, byCampaign, trend };
}

export const clientAnalyticsKey = (clientId: string) => ['client-analytics', clientId] as const;

function mockAnalytics(): ClientAnalytics {
  const trend: AnalyticsTrendPoint[] = Array.from({ length: WEEKS_OF_TREND }, (_, i) => ({
    weekLabel: `Wk ${i + 1}`,
    weekStart: '',
    sent: 20 + i * 3,
    opened: 8 + i * 2,
    replied: 2 + i,
  }));
  return {
    overall: {
      campaign_id: '', campaign_name: 'All campaigns',
      sent: 240, opened: 96, openRate: 40, replied: 18, replyRate: 8,
      bounced: 6, bounceRate: 3, optOuts: 4, optOutRate: 2,
    },
    byCampaign: [
      {
        campaign_id: 'mock-1', campaign_name: 'Sample campaign',
        sent: 240, opened: 96, openRate: 40, replied: 18, replyRate: 8,
        bounced: 6, bounceRate: 3, optOuts: 4, optOutRate: 2,
      },
    ],
    trend,
  };
}

export function useClientAnalytics(clientId: string) {
  const isPreview = clientId === '__preview__';

  const { data, isLoading: loading, error } = useQuery({
    queryKey: clientAnalyticsKey(clientId),
    queryFn: () => fetchClientAnalytics(clientId),
    enabled: !isPreview,
    staleTime: 5 * 60 * 1000,
    ...(isPreview ? { initialData: mockAnalytics() } : {}),
  });

  return {
    overall: data?.overall ?? (isPreview ? mockAnalytics().overall : null),
    byCampaign: data?.byCampaign ?? (isPreview ? mockAnalytics().byCampaign : []),
    trend: data?.trend ?? (isPreview ? mockAnalytics().trend : []),
    loading: isPreview ? false : loading,
    error: (error as Error)?.message ?? null,
  };
}
