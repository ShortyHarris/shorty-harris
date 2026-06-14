import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Analytics {
  funnel: { stage: string; value: number }[];
  intents: { intent: string; value: number }[];
  perClient: { name: string; sent: number; hotLeads: number; won: number }[];
  abTests: ABTestView[];
  totals: { sent: number; replies: number; hotLeads: number; won: number; replyRate: number; conversionRate: number };
}

export interface ABTestView {
  id: string;
  name: string;
  status: string;
  variants: { key: string; visits: number; replies: number; replyRate: number }[];
}

export function useAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sentR, repliesR, hotR, wonR, clientsR, intentsR, testsR, variantsR, metricsR] = await Promise.all([
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('send_status', 'sent'),
        supabase.from('replies').select('id', { count: 'exact', head: true }),
        supabase.from('hot_leads').select('id', { count: 'exact', head: true }),
        supabase.from('hot_leads').select('id', { count: 'exact', head: true }).eq('status', 'won'),
        supabase.from('clients').select('id, business_name'),
        supabase.from('replies').select('intent'),
        supabase.from('ab_tests').select('id, name, status'),
        supabase.from('ab_variants').select('id, test_id, variant_key'),
        supabase.from('ab_metrics').select('test_id, variant_id, metric, value'),
      ]);

      const sent = sentR.count ?? 0;
      const replies = repliesR.count ?? 0;
      const hotLeads = hotR.count ?? 0;
      const won = wonR.count ?? 0;

      const intentMap: Record<string, number> = {};
      (intentsR.data ?? []).forEach((r: { intent: string | null }) => {
        if (r.intent) intentMap[r.intent] = (intentMap[r.intent] ?? 0) + 1;
      });
      const intents = Object.entries(intentMap).map(([intent, value]) => ({ intent, value }));

      const clients = clientsR.data ?? [];
      const perClient = await Promise.all(clients.map(async (c: { id: string; business_name: string }) => {
        const [s, h, w] = await Promise.all([
          supabase.from('messages').select('id', { count: 'exact', head: true }).eq('client_id', c.id).eq('send_status', 'sent'),
          supabase.from('hot_leads').select('id', { count: 'exact', head: true }).eq('client_id', c.id),
          supabase.from('hot_leads').select('id', { count: 'exact', head: true }).eq('client_id', c.id).eq('status', 'won'),
        ]);
        return { name: c.business_name, sent: s.count ?? 0, hotLeads: h.count ?? 0, won: w.count ?? 0 };
      }));

      const variants = variantsR.data ?? [];
      const metrics = metricsR.data ?? [];
      const abTests: ABTestView[] = (testsR.data ?? []).map((t: { id: string; name: string; status: string }) => {
        const tvs = variants.filter((v: Record<string, unknown>) => v.test_id === t.id);
        return {
          id: t.id, name: t.name, status: t.status,
          variants: tvs.map((v: Record<string, unknown>) => {
            const visits = metrics.filter((m: Record<string, unknown>) => m.variant_id === v.id && m.metric === 'visit').reduce((a, m: Record<string, unknown>) => a + Number(m.value), 0);
            const reps = metrics.filter((m: Record<string, unknown>) => m.variant_id === v.id && m.metric === 'reply').reduce((a, m: Record<string, unknown>) => a + Number(m.value), 0);
            return { key: v.variant_key as string, visits, replies: reps, replyRate: visits ? Math.round((reps / visits) * 100) : 0 };
          }),
        };
      });

      setData({
        funnel: [
          { stage: 'Sent', value: sent },
          { stage: 'Replied', value: replies },
          { stage: 'Hot leads', value: hotLeads },
          { stage: 'Won', value: won },
        ],
        intents,
        perClient,
        abTests,
        totals: {
          sent, replies, hotLeads, won,
          replyRate: sent ? Math.round((replies / sent) * 100) : 0,
          conversionRate: hotLeads ? Math.round((won / hotLeads) * 100) : 0,
        },
      });
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}
