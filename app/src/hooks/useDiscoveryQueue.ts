import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

// Which campaigns have a scrape job waiting or running. Read from discovery_queue itself, not
// component state, so an admin who refreshes the page still sees a queued campaign as queued.
// The partial unique index discovery_queue_one_active_per_campaign guarantees one such row per
// campaign. Only admins can read discovery_queue (admin_read_discovery_queue).

export type ActiveQueueState = Record<string, 'queued' | 'running'>;

export interface ActiveQueue {
  state: ActiveQueueState;
  /** Queued campaigns only: how many queued jobs were requested before this one. */
  ahead: Record<string, number>;
}

export interface QueueRow {
  campaign_id: string;
  status: 'queued' | 'running';
  requested_at: string | null;
}

export const discoveryQueueKey = ['admin-discovery-queue'] as const;
const EMPTY: ActiveQueue = { state: {}, ahead: {} };

/** Position is the count of queued rows with an earlier requested_at (the dispatcher takes the oldest first). */
export function computeQueue(rows: QueueRow[]): ActiveQueue {
  const state: ActiveQueueState = {};
  const ahead: Record<string, number> = {};
  const queuedTimes = rows
    .filter((r) => r.status === 'queued' && r.requested_at)
    .map((r) => new Date(r.requested_at as string).getTime());
  for (const r of rows) {
    state[r.campaign_id] = r.status;
    if (r.status === 'queued' && r.requested_at) {
      const t = new Date(r.requested_at).getTime();
      ahead[r.campaign_id] = queuedTimes.filter((other) => other < t).length;
    }
  }
  return { state, ahead };
}

async function fetchActiveQueue(): Promise<ActiveQueue> {
  const { data, error } = await supabase
    .from('discovery_queue')
    .select('campaign_id, status, requested_at')
    .in('status', ['queued', 'running']);
  if (error) throw new Error(error.message);
  return computeQueue((data ?? []) as QueueRow[]);
}

export function useDiscoveryQueue() {
  const { data, error } = useQuery({
    queryKey: discoveryQueueKey,
    queryFn: fetchActiveQueue,
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000,
  });
  const q = data ?? EMPTY;
  return { queue: q.state, ahead: q.ahead, error: (error as Error | null)?.message ?? null };
}

/** Shows a just-queued campaign immediately, then lets the real rows replace it. */
export function markCampaignQueued(campaignId: string) {
  queryClient.setQueryData<ActiveQueue>(discoveryQueueKey, (prev) => ({
    state: { ...(prev?.state ?? {}), [campaignId]: 'queued' },
    ahead: prev?.ahead ?? {},
  }));
  queryClient.invalidateQueries({ queryKey: discoveryQueueKey });
}
