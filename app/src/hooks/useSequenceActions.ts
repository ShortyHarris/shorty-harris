import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { clientApprovalsKey, clientApprovalsStatsKey, clientAwaitingProspectsKey } from './useClientApprovals';
import { dashboardKey } from './useClientDashboard';

// Every sequence write goes through a Supabase RPC on the real (non-impersonation)
// client - never a direct write to `messages`. Each RPC returns { ok, error? }
// in the body rather than throwing, so both failure shapes are normalised here.

const ERROR_COPY: Record<string, string> = {
  not_permitted: "You don't have permission to do that.",
  not_found: "We couldn't find that prospect.",
  no_prospects: 'There is nothing to approve.',
};

type RpcResult<T> = { data: T; error: null } | { data: null; error: string };

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: error.message };
  const body = data as ({ ok: boolean; error?: string } & T) | null;
  if (!body || body.ok === false) {
    const code = body?.error ?? 'unknown';
    return { data: null, error: ERROR_COPY[code] ?? code.replace(/_/g, ' ') };
  }
  return { data: body, error: null };
}

export function refreshSequenceData(clientId: string | null) {
  queryClient.invalidateQueries({ queryKey: ['prospect-sequence'] });
  queryClient.invalidateQueries({ queryKey: ['prospect-sequence-paused'] });
  queryClient.invalidateQueries({ queryKey: ['client-pipeline'] });
  if (clientId) {
    queryClient.invalidateQueries({ queryKey: clientApprovalsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientApprovalsStatsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientAwaitingProspectsKey(clientId) });
    queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
  }
}

export interface ApprovalPreview {
  prospects: number;
  emails: number;
  by_step: Record<string, number>;
}

// p_prospect_ids = null previews every pending prospect for the client.
export function previewSequenceApproval(clientId: string, prospectIds: string[] | null) {
  return callRpc<ApprovalPreview>('sequence_approval_preview', {
    p_client_id: clientId, p_prospect_ids: prospectIds,
  });
}

// approve_sequences rejects a null/empty list ('no_prospects'), so "approve
// everything pending" must pass the explicit prospect ids.
export async function approveSequences(clientId: string, prospectIds: string[]) {
  const res = await callRpc<{ emails_approved: number; prospects: number }>('approve_sequences', {
    p_client_id: clientId, p_prospect_ids: prospectIds,
  });
  if (!res.error) refreshSequenceData(clientId);
  return res;
}

export async function setSequencePaused(clientId: string | null, prospectId: string, paused: boolean) {
  const res = await callRpc<{ paused: boolean }>('set_sequence_paused', {
    p_prospect_id: prospectId, p_paused: paused,
  });
  if (!res.error) refreshSequenceData(clientId);
  return res;
}

export async function cancelUnsentSequence(clientId: string | null, prospectId: string) {
  const res = await callRpc<{ emails_cancelled: number }>('cancel_unsent_sequence', {
    p_prospect_id: prospectId,
  });
  if (!res.error) refreshSequenceData(clientId);
  return res;
}

export async function resolveUncertainReply(
  clientId: string | null, replyId: string, resolution: 'automated' | 'human',
) {
  const res = await callRpc<Record<string, never>>('resolve_uncertain_reply', {
    p_reply_id: replyId, p_resolution: resolution,
  });
  if (!res.error) refreshSequenceData(clientId);
  return res;
}

// Editing subject/body of an unsent email. There is no RPC for this yet, so it
// is the one direct `messages` write; it touches only subject/body, so the
// message keeps its approval_status.
export async function saveStepEdit(
  clientId: string | null, messageId: string, patch: { subject?: string; body?: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('messages')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) return { error: error.message };
  refreshSequenceData(clientId);
  return { error: null };
}

// Existing single-email approval behaviour (same patch the Approvals queue uses).
export async function approveOneEmail(
  clientId: string | null, messageId: string, approvedBy: string | null,
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('messages')
    .update({ approval_status: 'approved', approved_at: now, approved_by: approvedBy, updated_at: now })
    .eq('id', messageId);
  if (error) return { error: error.message };
  refreshSequenceData(clientId);
  return { error: null };
}
