import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

/* Sandbox controls. Everything here calls the sandbox_* RPCs, which refuse to
   act on any client whose clients.is_sandbox is false, so a stray call against
   a live client does nothing. See
   supabase/migrations/20261104142603_sandbox_simulate_and_next_step.sql. */

export type ReplyKind = 'interested' | 'question' | 'not_interested' | 'unsubscribe' | 'auto_reply' | 'bounce';

export interface SandboxMessage {
  approval_status: string;
  send_status: string;
  message_type: string;
  created_at: string;
}

export interface SandboxProspect {
  id: string;
  business_name: string;
  email: string;
  pipeline_status: string;
  followups_stopped?: boolean;
  /** On the do-not-contact list (an unsubscribe or a bounce): every future email is blocked. */
  do_not_contact?: boolean;
  messages: SandboxMessage[];
}

export interface SandboxResult {
  ok: boolean;
  did?: string;
  detail?: string;
  error?: string;
  hint?: string;
  note?: string;
  [k: string]: unknown;
}

export const sandboxProspectsKey = (clientId: string) => ['sandbox-prospects', clientId] as const;

async function fetchSandboxProspects(clientId: string, client: SupabaseClient): Promise<SandboxProspect[]> {
  const { data, error } = await client
    .from('prospects')
    .select('id, business_name, email, pipeline_status, followups_stopped, messages(approval_status, send_status, message_type, created_at)')
    .eq('client_id', clientId)
    .order('email', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SandboxProspect[];
  // Clients can read their own do-not-contact rows; flag the prospects on it so the
  // page can show that outreach to them is suppressed.
  const emails = rows.map((r) => r.email.toLowerCase());
  if (emails.length) {
    const { data: dnc } = await client.from('do_not_contact').select('email').in('email', emails);
    const blocked = new Set((dnc ?? []).map((d: { email: string }) => d.email.toLowerCase()));
    for (const r of rows) r.do_not_contact = blocked.has(r.email.toLowerCase());
  }
  return rows;
}

export interface StepBlock { label: string; reason: string }

/* When Run next step can do nothing for this prospect, and why. Matches the checks
   at the top of sandbox_next_step, which refuses with the same reasons. */
export function nextStepBlock(p: SandboxProspect): StepBlock | null {
  if (p.do_not_contact && p.pipeline_status !== 'bounced') {
    return {
      label: 'Unsubscribed: all emails blocked',
      reason: 'This address is on the do-not-contact list, so every future email to it is blocked, by any campaign.',
    };
  }
  switch (p.pipeline_status) {
    case 'bounced':
      return { label: 'Bounced', reason: 'The email bounced, so nothing more is sent to this address. Press Reset to start again.' };
    case 'won':
    case 'lost':
      return { label: p.pipeline_status === 'won' ? 'Won' : 'Lost', reason: 'This prospect is closed, so the sequence is over.' };
    case 'hot_lead':
      return {
        label: 'Hot lead: no more follow-ups',
        reason: 'They replied with interest, so follow-ups stop automatically. In real use the client replies to them personally.',
      };
    case 'called':
      return { label: 'Called: no more follow-ups', reason: 'This prospect was marked as called, so follow-ups stop.' };
    case 'replied':
      return {
        label: 'Replied: waiting on you',
        reason: 'They wrote back, so nothing more is sent automatically. In real use the client answers them personally.',
      };
  }
  if (p.followups_stopped && hasSent(p)) {
    return {
      label: 'Follow-ups stopped',
      reason: 'Follow-ups are stopped for this prospect, for example after a not-interested reply or when stopped by hand.',
    };
  }
  return null;
}

/* Mirrors the branch order in sandbox_next_step, so the button says what the
   next press will actually do. The RPC stays the source of truth. */
export function nextStepLabel(p: SandboxProspect): string | null {
  if (nextStepBlock(p)) return null;
  const msgs = p.messages ?? [];
  if (msgs.length === 0) return 'Write first email';
  if (msgs.some((m) => m.approval_status === 'pending' && m.send_status === 'not_sent')) return 'Approve draft';
  if (msgs.some((m) => m.approval_status === 'approved' && m.send_status === 'not_sent')) return 'Send it';
  if (msgs.some((m) => m.send_status === 'sent')) return 'Make follow-up due';
  return 'Run next step';
}

export function hasSent(p: SandboxProspect): boolean {
  return (p.messages ?? []).some((m) => m.send_status === 'sent');
}

export function sentCount(p: SandboxProspect): number {
  return (p.messages ?? []).filter((m) => m.send_status === 'sent').length;
}

/* Turns an RPC result into one sentence for a toast. */
export function describeResult(r: SandboxResult): string {
  if (r.ok && typeof r.prospects === 'number') {
    return `Reset done. ${r.prospects} fresh prospects, all addressed to ${String(r.addressed_to ?? 'your mailbox')}.`;
  }
  if (r.ok) return r.detail ?? r.note ?? 'Done.';
  if (r.hint) return r.hint;
  if (r.detail) return r.detail;
  switch (r.error) {
    case 'nothing_to_do': return 'Nothing to do for this prospect right now.';
    case 'followups_stopped': return 'Follow-ups are stopped for this prospect, so there is no next step.';
    case 'replied': return 'They replied, so nothing more is sent automatically.';
    case 'do_not_contact': return 'This address is on the do-not-contact list, so every future email is blocked.';
    case 'not_a_sandbox_prospect_or_not_permitted':
    case 'not_a_sandbox_client':
    case 'not_permitted': return 'This only works on a sandbox account.';
    default: return r.error ? `Could not do that (${r.error}).` : 'Could not do that.';
  }
}

export function useSandbox(clientId: string, enabled: boolean, client: SupabaseClient = supabase) {
  const { data, isLoading, error } = useQuery({
    queryKey: sandboxProspectsKey(clientId),
    queryFn: () => fetchSandboxProspects(clientId, client),
    enabled: enabled && !!clientId,
    // The pipeline runs asynchronously in n8n (Gemini, the send, the hot lead
    // router), so poll while the page is open rather than make testers refresh.
    refetchInterval: 4000,
  });

  // Every other screen caches its own view of these rows; after a sandbox
  // action, refresh them all rather than track which ones it touched.
  const refreshAll = () => queryClient.invalidateQueries();

  async function call(fn: string, args: Record<string, unknown>): Promise<SandboxResult> {
    const { data: res, error: err } = await supabase.rpc(fn, args);
    if (err) return { ok: false, error: err.message };
    refreshAll();
    // A few stages finish in n8n a moment later; refresh again once they land.
    setTimeout(refreshAll, 5000);
    return (res ?? { ok: false }) as SandboxResult;
  }

  return {
    prospects: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    reset: () => call('sandbox_reset', { p_client_id: clientId }),
    nextStep: (prospectId: string) => call('sandbox_next_step', { p_prospect_id: prospectId }),
    simulateReply: (prospectId: string, kind: ReplyKind) =>
      call('sandbox_simulate_reply', { p_prospect_id: prospectId, p_kind: kind }),
  };
}
