-- The two buttons that make a sandbox usable by a non-technical tester.
--
-- The real pipeline is full of waits: generation sweeps every 5 minutes, the
-- reply poll every 2, the follow-up engine hourly, and follow-ups are 3, then 5,
-- then 7 BUSINESS days apart. Clicking through honestly would take a fortnight.
--
-- Both refuse to touch anything that is not a sandbox client, so neither can be
-- pointed at real data by accident.

-- Internal: fire an n8n webhook without blocking. pg_net is async, so the RPC
-- returns immediately and the workflow runs in the background, which is what the
-- UI wants anyway.
create or replace function public.sandbox_fire(p_path text, p_body jsonb)
returns bigint
language sql
security definer
set search_path to 'public'
as $$
  select net.http_post(
    url := 'https://n8n.shortyharris.com/webhook/' || p_path,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
$$;

create or replace function public.sandbox_guard(p_prospect_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_client uuid; v_sandbox boolean;
begin
  select p.client_id, c.is_sandbox into v_client, v_sandbox
  from prospects p join clients c on c.id = p.client_id
  where p.id = p_prospect_id;
  if v_client is null then return null; end if;
  if not coalesce(v_sandbox, false) then return null; end if;
  if not (public.is_admin() or public.can_manage_client(v_client) or public.is_trusted_backend()) then
    return null;
  end if;
  return v_client;
end;
$$;

-- Simulate a prospect replying. A reply is not "the next step", it is something
-- the other side does, which is why it is a separate button.
--
-- 'interested' is pushed through WF6's real webhook rather than inserting a hot
-- lead directly: the point is to watch the actual router create the lead, charge
-- the credit and build the notification.
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
  v_client := public.sandbox_guard(p_prospect_id);
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_prospect_or_not_permitted');
  end if;

  select m.id, m.gmail_thread_id, p.business_name
    into v_msg
  from messages m join prospects p on p.id = m.prospect_id
  where m.prospect_id = p_prospect_id and m.send_status = 'sent'
  order by m.sent_at desc limit 1;

  if v_msg.id is null then
    return jsonb_build_object('ok', false, 'error', 'nothing_sent_yet',
      'hint', 'Use Run next step until an email has actually been sent, then simulate a reply to it.');
  end if;
  v_name := coalesce(v_msg.business_name, 'The prospect');

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
  elsif p_kind in ('not_interested') then
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

-- Do whatever would have happened next for this prospect, without the wait.
-- Where a gate is time-based, the timestamp is backdated rather than the gate
-- being bypassed, so the sandbox keeps exercising the real production rule.
create or replace function public.sandbox_next_step(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
    -- Backdating the previous send is what makes the follow-up due. The gate in
    -- sendable_messages (3, then 5, then 7 business days) is left exactly as it
    -- is in production, so the real rule still decides.
    update messages set sent_at = now() - interval '30 days'
    where prospect_id = p_prospect_id and send_status = 'sent';
    update follow_up_schedules set due_at = now() - interval '1 day', updated_at = now()
    where prospect_id = p_prospect_id and status in ('pending','generating');
    update prospects set pipeline_status = 'contacted', updated_at = now()
    where id = p_prospect_id and pipeline_status = 'replied';
    perform public.sandbox_fire('wf5-run', jsonb_build_object('prospect_id', p_prospect_id));
    return jsonb_build_object('ok', true, 'did', 'follow_up_due',
      'detail', 'The previous send was backdated so the next follow-up is due, and the '
             || 'follow-up engine was run. The draft appears in Approvals shortly.');
  end if;

  return jsonb_build_object('ok', false, 'error', 'nothing_to_do');
end;
$$;

-- Hot lead nudges are 24h, then 72h, then escalation at 120h. Same trick.
create or replace function public.sandbox_age_hot_lead(p_prospect_id uuid, p_hours integer default 25)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_client uuid; v_n integer;
begin
  v_client := public.sandbox_guard(p_prospect_id);
  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'not_a_sandbox_prospect_or_not_permitted');
  end if;
  update hot_leads
     set routed_at = now() - make_interval(hours => greatest(1, p_hours)),
         last_nudged_at = case when last_nudged_at is null then null
                               else now() - make_interval(hours => greatest(1, p_hours)) end
   where prospect_id = p_prospect_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_hot_lead',
      'hint', 'Simulate an interested reply first.');
  end if;
  perform public.sweep_hot_lead_nudges();
  return jsonb_build_object('ok', true, 'did', 'aged_and_swept', 'hours', p_hours);
end;
$$;

revoke all on function public.sandbox_fire(text, jsonb) from public, anon, authenticated;
revoke all on function public.sandbox_guard(uuid) from public, anon;
revoke all on function public.sandbox_simulate_reply(uuid, text) from public, anon;
revoke all on function public.sandbox_next_step(uuid) from public, anon;
revoke all on function public.sandbox_age_hot_lead(uuid, integer) from public, anon;
grant execute on function public.sandbox_simulate_reply(uuid, text) to authenticated;
grant execute on function public.sandbox_next_step(uuid) to authenticated;
grant execute on function public.sandbox_age_hot_lead(uuid, integer) to authenticated;;
