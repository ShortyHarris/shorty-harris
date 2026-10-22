-- approve_sequences now records who approved (messages.approved_by), matching
-- the single-email approve paths. Needed now that admins can approve from
-- "View as client" edit mode: without it, bulk sequence approvals had no
-- approver at all. auth.uid() is the admin's own id there (the impersonation
-- token carries the admin's sub too), and null for trusted backend calls.
-- Body is otherwise identical to the live definition.

create or replace function public.approve_sequences(p_client_id uuid, p_prospect_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_emails int; v_prospects int;
begin
  if not public.can_manage_client(p_client_id) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  if p_prospect_ids is null or array_length(p_prospect_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_prospects'); end if;
  with upd as (
    update public.messages m set approval_status = 'approved', approved_at = now(), approved_by = auth.uid(), updated_at = now()
    from public.prospects p
    where p.id = m.prospect_id and m.client_id = p_client_id and m.prospect_id = any (p_prospect_ids)
      and m.approval_status = 'pending' and m.send_status = 'not_sent'
      and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
    returning m.prospect_id)
  select count(*), count(distinct prospect_id) into v_emails, v_prospects from upd;
  return jsonb_build_object('ok', true, 'emails_approved', v_emails, 'prospects', v_prospects);
end; $function$;
