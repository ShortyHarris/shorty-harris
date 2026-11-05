-- Run next step on a hot lead (or after follow-ups were stopped) quietly made a
-- follow-up schedule due and ran WF5, which then did nothing, because those
-- prospects are excluded everywhere downstream. It now refuses up front with the
-- reason, and the Sandbox page shows that reason instead of the button.
--
-- Applied live as 20261104172716 (as an in-place edit); full resulting definition below.

CREATE OR REPLACE FUNCTION public.sandbox_next_step(p_prospect_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client uuid;
  v_p record;
  v_msg record;
  v_sent record;
begin
  v_client := public.sandbox_guard(p_prospect_id);
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_prospect_or_not_permitted');
  end if;

  select * into v_p from prospects where id = p_prospect_id;

  if v_p.pipeline_status in ('bounced','won','lost') then
    return jsonb_build_object('ok', false, 'error', 'finished',
      'detail', 'This prospect is ' || v_p.pipeline_status || '. Press Reset to start again.');
  end if;

  if v_p.pipeline_status in ('hot_lead', 'called') then
    return jsonb_build_object('ok', false, 'error', 'followups_stopped',
      'detail', case v_p.pipeline_status
        when 'hot_lead' then 'This prospect is a hot lead, so follow-ups stop automatically. In real use the client replies to them personally.'
        else 'This prospect was marked as called, so follow-ups stop.' end);
  end if;
  if v_p.followups_stopped and exists (select 1 from messages where prospect_id = p_prospect_id and send_status = 'sent') then
    return jsonb_build_object('ok', false, 'error', 'followups_stopped',
      'detail', 'Follow-ups are stopped for this prospect, for example after a not-interested reply.');
  end if;

  -- 1. Nothing written yet: ask WF2 for the first email.
  if not exists (select 1 from messages where prospect_id = p_prospect_id) then
    perform public.sandbox_fire('wf2-generate', jsonb_build_object('prospect_id', p_prospect_id));
    return jsonb_build_object('ok', true, 'did', 'generating_first_email',
      'detail', 'Gemini is writing the first email. It appears in Approvals in a few seconds.');
  end if;

  -- 2. A draft is waiting for approval: approve it.
  select id into v_msg from messages
  where prospect_id = p_prospect_id and approval_status = 'pending' and send_status = 'not_sent'
  order by created_at limit 1;
  if v_msg.id is not null then
    update messages set approval_status = 'approved', approved_at = now(), updated_at = now()
    where id = v_msg.id;
    return jsonb_build_object('ok', true, 'did', 'approved_draft', 'message_id', v_msg.id,
      'detail', 'Approved. Press again to send it.');
  end if;

  -- 3. Something is approved and unsent: send it through WF3, the real send path.
  select id into v_msg from messages
  where prospect_id = p_prospect_id and approval_status = 'approved' and send_status = 'not_sent'
  order by created_at limit 1;
  if v_msg.id is not null then
    perform public.sandbox_fire('wf3-send-outreach', jsonb_build_object('message_id', v_msg.id));
    return jsonb_build_object('ok', true, 'did', 'sending', 'message_id', v_msg.id,
      'detail', 'Sending now. It lands in the mailbox connected to this sandbox.');
  end if;

  -- 4. Everything sent: make the next follow-up due and run the engine.
  select id, sent_at into v_sent from messages
  where prospect_id = p_prospect_id and send_status = 'sent'
  order by sent_at desc limit 1;
  if v_sent.id is not null then
    -- Only the schedule moves; sent_at is never touched. Sandbox follow-ups skip
    -- the 3/5/7 business-day rule in sendable_messages instead.
    update follow_up_schedules set due_at = now() - interval '1 day', updated_at = now()
    where prospect_id = p_prospect_id and status in ('pending','generating');
    update prospects set pipeline_status = 'contacted', updated_at = now()
    where id = p_prospect_id and pipeline_status = 'replied';
    perform public.sandbox_fire('wf5-run', jsonb_build_object('prospect_id', p_prospect_id));
    return jsonb_build_object('ok', true, 'did', 'follow_up_due',
      'detail', 'The next follow-up was made due now and the '
             || 'follow-up engine was run. The draft appears in Approvals shortly.');
  end if;

  return jsonb_build_object('ok', false, 'error', 'nothing_to_do');
end;
$function$;
