import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { QueueItem } from '../types';

interface Stats {
  pending: number;
  approvedToday: number;
  sentToday: number;
  rejected: number;
}

export function useApprovalQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, approvedToday: 0, sentToday: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('messages')
      .select(
        `id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, created_at,
         prospect:prospects ( id, business_name, contact_name, email, phone, category, location, pipeline_status ),
         client:clients ( id, business_name, business_type )`
      )
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const normalized = (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      prospect: Array.isArray(row.prospect) ? row.prospect[0] ?? null : row.prospect ?? null,
      client: Array.isArray(row.client) ? row.client[0] ?? null : row.client ?? null,
    })) as QueueItem[];

    setItems(normalized);
    setLoading(false);
  }, []);

  const loadStats = useCallback(async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const iso = startOfDay.toISOString();

    const [pending, approvedToday, sentToday, rejected] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved').gte('approved_at', iso),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('send_status', 'sent').gte('created_at', iso),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('approval_status', 'rejected'),
    ]);

    setStats({
      pending: pending.count ?? 0,
      approvedToday: approvedToday.count ?? 0,
      sentToday: sentToday.count ?? 0,
      rejected: rejected.count ?? 0,
    });
  }, []);

  useEffect(() => {
    load();
    loadStats();
  }, [load, loadStats]);

  const approve = useCallback(async (id: string, editedBody?: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const patch: Record<string, unknown> = {
      approval_status: editedBody !== undefined ? 'edited' : 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (editedBody !== undefined) patch.body = editedBody;
    const { error } = await supabase.from('messages').update(patch).eq('id', id);
    if (error) {
      setError(error.message);
      load();
    } else {
      loadStats();
    }
  }, [load, loadStats]);

  const reject = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase
      .from('messages')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setError(error.message);
      load();
    } else {
      loadStats();
    }
  }, [load, loadStats]);

  return { items, stats, loading, error, approve, reject, reload: () => { load(); loadStats(); } };
}
