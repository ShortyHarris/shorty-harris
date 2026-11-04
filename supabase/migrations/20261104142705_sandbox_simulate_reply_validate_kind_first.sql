-- Validate the argument before inspecting state. The first version checked
-- "has anything been sent yet" first, so a typo in the kind reported
-- nothing_sent_yet, which sends the caller looking in entirely the wrong place.
create or replace function public.sandbox_simulate_reply(p_prospect_id uuid, p_kind text default 'interested')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
      v_body := 'Thanks for the note, but this is not something we need at the moment. Please take us off your list.';
    when 'auto_reply' then
      v_intent := 'auto_reply';
      v_body := 'Thank you for your email. I am currently out of the office and will reply on my return.';
    when 'bounce' then
      v_intent := 'bounced';
      v_body := '** Address not found ** Your message was not delivered because the address could not be found. '
             || 'The response from the remote server was: 550 5.1.1 no such user';
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_kind',
        'allowed', jsonb_build_array('interested','not_interested','auto_reply','bounce'));
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
  elsif p_kind = 'not_interested' then
    update prospects set pipeline_status = 'replied', followups_stopped = true, updated_at = now()
    where id = p_prospect_id;
  else
    update prospects set pipeline_status = 'replied', updated_at = now()
    where id = p_prospect_id and pipeline_status not in ('hot_lead','won','lost');
  end if;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'reply_id', v_reply,
    'note', case when p_kind = 'interested'
                 then 'Sent to the hot lead router. The lead, the credit charge and the notification appear within a few seconds.'
                 else 'Recorded.' end);
end;
$$;

revoke all on function public.sandbox_simulate_reply(uuid, text) from public, anon;
grant execute on function public.sandbox_simulate_reply(uuid, text) to authenticated;;
