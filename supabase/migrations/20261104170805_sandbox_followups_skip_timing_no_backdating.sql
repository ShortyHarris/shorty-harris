-- "Make follow-up due" (sandbox_next_step step 4) made the next follow-up sendable by
-- backdating every earlier send's messages.sent_at by 30 days. That rewrote history:
-- "Sent today", analytics and reply matching all saw the sends as a month old.
-- Instead, sandbox follow-ups skip the 3/5/7 business-day timing rule in
-- sendable_messages (they still need the previous step to have actually been sent),
-- and step 4 only moves follow_up_schedules.due_at, which is what WF5 reads.
--
-- Applied live as 20261104170805 (as in-place DO-block edits); this file records the
-- resulting full definitions. The only change to sendable_messages is the final
-- "OR COALESCE(cl.is_sandbox, false)" inside the follow-up timing check.

create or replace view public.sendable_messages as
 SELECT m.id,
    m.prospect_id,
    m.campaign_id,
    m.client_id,
    m.channel,
    m.subject,
    m.body,
    m.message_type,
    m.approval_status,
    m.approved_by,
    m.approved_at,
    m.send_status,
    m.scheduled_for,
    m.sent_at,
    m.gmail_message_id,
    m.gmail_thread_id,
    m.created_at,
    m.updated_at,
    m.opened_at,
    m.open_count,
    m.last_opened_at,
    m.send_claimed_at
   FROM messages m
     JOIN prospects p ON p.id = m.prospect_id
     LEFT JOIN campaigns c ON c.id = m.campaign_id
     LEFT JOIN clients cl ON cl.id = m.client_id
  WHERE m.approval_status = 'approved'::text AND m.send_status = 'not_sent'::text AND COALESCE(( SELECT ps.unsubscribe_ok
           FROM platform_settings ps
          WHERE ps.id = 1), true) AND COALESCE(cl.status, 'active'::text) = 'active'::text AND sandbox_address_allowed(m.client_id, p.email) AND (p.pipeline_status <> ALL (ARRAY['replied'::text, 'hot_lead'::text, 'won'::text, 'lost'::text, 'called'::text, 'bounced'::text])) AND p.sequence_paused = false AND (m.message_type = 'initial'::text OR p.followups_stopped = false) AND (COALESCE(c.status, 'active'::text) <> ALL (ARRAY['paused'::text, 'cancelled'::text, 'draft'::text])) AND NOT (EXISTS ( SELECT 1
           FROM do_not_contact d
          WHERE lower(d.email) = lower(p.email))) AND NOT ((COALESCE(c.language, ''::text) = 'Czech'::text OR is_eu_country(COALESCE(c.country, cl.country))) AND (is_generic_mailbox(p.email) AND NOT COALESCE(cl.allow_generic_mailboxes, false) OR is_freemail(p.email))) AND NOT (EXISTS ( SELECT 1
           FROM country_send_holds h
          WHERE h.cleared = false AND h.country = upper(COALESCE(c.country, cl.country, ''::text)))) AND (m.message_type = 'initial'::text OR (EXISTS ( SELECT 1
           FROM messages prev
          WHERE prev.prospect_id = m.prospect_id AND prev.send_status = 'sent'::text AND prev.message_type =
                CASE m.message_type
                    WHEN 'follow_up_d3'::text THEN 'initial'::text
                    WHEN 'follow_up_d7'::text THEN 'follow_up_d3'::text
                    WHEN 'follow_up_d14'::text THEN 'follow_up_d7'::text
                    ELSE NULL::text
                END AND (add_business_days(prev.sent_at,
                CASE m.message_type
                    WHEN 'follow_up_d3'::text THEN 3
                    WHEN 'follow_up_d7'::text THEN 5
                    ELSE 7
                END, COALESCE(cl.send_timezone, 'America/Chicago'::text), upper(COALESCE(NULLIF(c.country, ''::text), NULLIF(cl.country, ''::text), 'US'::text))) <= now() OR COALESCE(cl.is_sandbox, false)))));

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
