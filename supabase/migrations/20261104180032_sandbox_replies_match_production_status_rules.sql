-- Make sandbox replies follow the same status rules as WF4 in production:
--  * an automated reply (out of office) does NOT change pipeline_status (WF4's
--    "Mark Prospect Replied" skips automated intents), so the sequence carries on;
--  * a human reply (question, not interested, unsubscribe) marks the prospect
--    replied, which sendable_messages excludes, so nothing more is sent.
-- sandbox_next_step used to flip 'replied' back to 'contacted' (needed only because
-- simulated auto-replies wrongly set 'replied'). It now refuses for replied prospects
-- and for anyone on do-not-contact, with the reason, instead of carrying on.
--
-- Applied live as 20261104180032 (in-place edits); full resulting definitions below.

CREATE OR REPLACE FUNCTION public.sandbox_simulate_reply(p_prospect_id uuid, p_kind text DEFAULT 'interested'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client uuid;
  v_msg record;
  v_body text;
  v_intent text;
  v_reply uuid;
  v_name text;
begin
  case p_kind
    when 'interested' then
      v_intent := 'interested';
      v_body := 'Hello, thanks for reaching out. This sounds relevant to us. '
             || 'Could you send pricing and a couple of times for a short call next week?';
    when 'not_interested' then
      v_intent := 'not_interested';
      v_body := 'Thanks for the note, but we are all set for now and not looking for this.';
    when 'question' then
      v_intent := 'question';
      v_body := 'Thanks for this. Before we go further: how much does it cost per month, and does it work for a business our size?';
    when 'unsubscribe' then
      v_intent := 'stop';
      v_body := 'Please unsubscribe me and do not email this address again.';
    when 'auto_reply' then
      v_intent := 'auto_reply';
      v_body := 'Thank you for your email. I am currently out of the office and will reply on my return.';
    when 'bounce' then
      v_intent := 'bounced';
      v_body := '** Address not found ** Your message was not delivered because the address could not be found. '
             || 'The response from the remote server was: 550 5.1.1 no such user';
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_kind',
        'allowed', jsonb_build_array('interested','question','not_interested','unsubscribe','auto_reply','bounce'));
  end case;

  v_client := public.sandbox_guard(p_prospect_id);
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_prospect_or_not_permitted');
  end if;

  select m.id, m.gmail_thread_id, p.business_name into v_msg
  from messages m join prospects p on p.id = m.prospect_id
  where m.prospect_id = p_prospect_id and m.send_status = 'sent'
  order by m.sent_at desc limit 1;

  if v_msg.id is null then
    return jsonb_build_object('ok', false, 'error', 'nothing_sent_yet',
      'hint', 'Use Run next step until an email has actually been sent, then simulate a reply to it.');
  end if;
  v_name := coalesce(v_msg.business_name, 'The prospect');

  insert into replies (prospect_id, message_id, client_id, body, received_at,
                       gmail_message_id, intent, intent_confidence, classified_at, match_method)
  values (p_prospect_id, v_msg.id, v_client, v_body, now(),
          'sandbox-' || gen_random_uuid()::text, v_intent, 1.0, now(), 'thread')
  returning id into v_reply;

  if p_kind = 'interested' then
    perform public.sandbox_fire('wf6-hot-lead', jsonb_build_object(
      'prospect_id', p_prospect_id,
      'intent', 'interested',
      'reply_id', v_reply,
      'business_name', v_name,
      'ai_summary', 'Replied asking for pricing and a call.',
      'suggested_action', 'Send pricing and offer two times next week.'));
  elsif p_kind = 'bounce' then
    update prospects set pipeline_status = 'bounced', followups_stopped = true, updated_at = now()
    where id = p_prospect_id;
    update follow_up_schedules set status = 'cancelled', updated_at = now()
    where prospect_id = p_prospect_id and status in ('pending','generating','generated');
  elsif p_kind = 'unsubscribe' then
    insert into do_not_contact (email, reason, source_prospect_id)
    select lower(p.email), 'stop_request', p.id from prospects p where p.id = p_prospect_id
    on conflict (lower(email)) where email is not null do nothing;
    update prospects set pipeline_status = 'replied', followups_stopped = true, updated_at = now()
    where id = p_prospect_id;
    update follow_up_schedules set status = 'cancelled', updated_at = now()
    where prospect_id = p_prospect_id and status in ('pending','generating','generated');
  elsif p_kind = 'not_interested' then
    update prospects set pipeline_status = 'replied', followups_stopped = true, updated_at = now()
    where id = p_prospect_id;
  elsif p_kind = 'auto_reply' then
    null;  -- as in WF4: an automated reply leaves the status alone, the sequence continues
  else
    update prospects set pipeline_status = 'replied', updated_at = now()
    where id = p_prospect_id and pipeline_status not in ('hot_lead','won','lost');
  end if;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'reply_id', v_reply,
    'note', case when p_kind = 'interested'
                 then 'Sent to the hot lead router. The lead, the credit charge and the notification appear within a few seconds.'
                 else 'Recorded.' end);
end;
$function$;

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
  if exists (select 1 from do_not_contact where lower(email) = lower(v_p.email)) then
    return jsonb_build_object('ok', false, 'error', 'do_not_contact',
      'detail', 'This address is on the do-not-contact list, so every future email to it is blocked.');
  end if;
  if v_p.pipeline_status = 'replied' then
    return jsonb_build_object('ok', false, 'error', 'replied',
      'detail', 'They wrote back, so nothing more is sent automatically. In real use the client answers them personally.');
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
    perform public.sandbox_fire('wf5-run', jsonb_build_object('prospect_id', p_prospect_id));
    return jsonb_build_object('ok', true, 'did', 'follow_up_due',
      'detail', 'The next follow-up was made due now and the '
             || 'follow-up engine was run. The draft appears in Approvals shortly.');
  end if;

  return jsonb_build_object('ok', false, 'error', 'nothing_to_do');
end;
$function$;
