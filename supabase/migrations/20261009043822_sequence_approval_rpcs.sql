create or replace function public.sequence_approval_preview(p_client_id uuid, p_prospect_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_prospects int; v_emails int; v_steps jsonb;
begin
  if not public.can_manage_client(p_client_id) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  with pending as (
    select m.prospect_id, m.message_type
    from public.messages m join public.prospects p on p.id = m.prospect_id
    where m.client_id = p_client_id and m.approval_status = 'pending' and m.send_status = 'not_sent'
      and coalesce(p.is_sandbox, false) = false
      and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
      and (p_prospect_ids is null or m.prospect_id = any (p_prospect_ids)))
  select count(distinct prospect_id), count(*) into v_prospects, v_emails from pending;
  select coalesce(jsonb_object_agg(message_type, n), '{}'::jsonb) into v_steps from (
    select m.message_type, count(*) n
    from public.messages m join public.prospects p on p.id = m.prospect_id
    where m.client_id = p_client_id and m.approval_status = 'pending' and m.send_status = 'not_sent'
      and coalesce(p.is_sandbox, false) = false
      and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
      and (p_prospect_ids is null or m.prospect_id = any (p_prospect_ids))
    group by m.message_type) s;
  return jsonb_build_object('ok', true, 'prospects', v_prospects, 'emails', v_emails, 'by_step', v_steps);
end; $$;
revoke execute on function public.sequence_approval_preview(uuid, uuid[]) from public, anon;
grant execute on function public.sequence_approval_preview(uuid, uuid[]) to authenticated;

-- Approve every pending email (initial and follow-ups) for the given prospects.
-- Sending still goes through sendable_messages, so reply, unsubscribe, pause and cadence rules always apply.
create or replace function public.approve_sequences(p_client_id uuid, p_prospect_ids uuid[])
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_emails int; v_prospects int;
begin
  if not public.can_manage_client(p_client_id) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  if p_prospect_ids is null or array_length(p_prospect_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_prospects'); end if;
  with upd as (
    update public.messages m set approval_status = 'approved', approved_at = now(), updated_at = now()
    from public.prospects p
    where p.id = m.prospect_id and m.client_id = p_client_id and m.prospect_id = any (p_prospect_ids)
      and m.approval_status = 'pending' and m.send_status = 'not_sent'
      and p.pipeline_status not in ('replied','hot_lead','won','lost','called','bounced')
    returning m.prospect_id)
  select count(*), count(distinct prospect_id) into v_emails, v_prospects from upd;
  return jsonb_build_object('ok', true, 'emails_approved', v_emails, 'prospects', v_prospects);
end; $$;
revoke execute on function public.approve_sequences(uuid, uuid[]) from public, anon;
grant execute on function public.approve_sequences(uuid, uuid[]) to authenticated;

create or replace function public.set_sequence_paused(p_prospect_id uuid, p_paused boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_client uuid;
begin
  select client_id into v_client from public.prospects where id = p_prospect_id;
  if v_client is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.can_manage_client(v_client) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  update public.prospects set sequence_paused = p_paused, updated_at = now() where id = p_prospect_id;
  return jsonb_build_object('ok', true, 'paused', p_paused);
end; $$;
revoke execute on function public.set_sequence_paused(uuid, boolean) from public, anon;
grant execute on function public.set_sequence_paused(uuid, boolean) to authenticated;

-- Cancel every email not yet sent for a prospect (they are kept, marked rejected, not deleted).
create or replace function public.cancel_unsent_sequence(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_client uuid; v_n int;
begin
  select client_id into v_client from public.prospects where id = p_prospect_id;
  if v_client is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.can_manage_client(v_client) then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  with u as (update public.messages set approval_status = 'rejected', updated_at = now()
             where prospect_id = p_prospect_id and send_status = 'not_sent' and approval_status <> 'rejected' returning 1)
  select count(*) into v_n from u;
  update public.follow_up_schedules set status = 'cancelled', updated_at = now()
    where prospect_id = p_prospect_id and status in ('pending','generating','generated');
  return jsonb_build_object('ok', true, 'emails_cancelled', v_n);
end; $$;
revoke execute on function public.cancel_unsent_sequence(uuid) from public, anon;
grant execute on function public.cancel_unsent_sequence(uuid) to authenticated;