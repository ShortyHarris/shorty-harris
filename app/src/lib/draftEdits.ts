import type { SupabaseClient } from '@supabase/supabase-js';

export const DRAFT_NOT_SAVED =
  "the draft wasn't saved - it may already be approved, sent or rejected, or you may not have permission to edit it";

/** Statuses a draft can still be edited in from the approvals queue. */
export const EDITABLE_APPROVAL_STATUSES = ['pending', 'edited'];

/**
 * Subject/body edit of an unsent message. PostgREST answers 200 with no rows
 * when RLS or a filter blocks the update, so the row count is checked and zero
 * rows is reported as an error instead of a silent "saved".
 * `statuses` is the approval_status guard; the message must also be unsent.
 */
export async function saveDraftEdits(
  client: Pick<SupabaseClient, 'from'>,
  id: string,
  edits: { subject?: string; body?: string },
  statuses: string[] = EDITABLE_APPROVAL_STATUSES,
): Promise<{ error: string | null; patch: Record<string, unknown> }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (edits.body !== undefined) patch.body = edits.body;
  if (edits.subject !== undefined) patch.subject = edits.subject;

  const { data, error } = await client
    .from('messages')
    .update(patch)
    .eq('id', id)
    .in('approval_status', statuses)
    .eq('send_status', 'not_sent')
    .select('id');

  if (error) return { error: error.message, patch };
  if (!data || data.length === 0) return { error: DRAFT_NOT_SAVED, patch };
  return { error: null, patch };
}
